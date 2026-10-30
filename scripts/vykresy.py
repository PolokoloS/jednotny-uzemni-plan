#!/usr/bin/env python3
"""Výkresy z PDF: hlavní výkres obce, která nemá mapovou službu, vlícovaný do mapy a rozřezaný na dlaždice.

Postup pro každou obec z data/vykresy_zdroje.json:
 1. stáhne PDF (mezipaměť v %TEMP%/jup-vykresy),
 2. převede stránku na rastr kolem 100 dpi (vektorové PDF přes PyMuPDF, obří rastr v PDF proudově po řádcích),
 3. hrubé vlícování: maska barevných ploch výkresu proti hranici obce z RÚIAN (měřítko a posun přes FFT korelaci,
    případně otočení), výsledkem je překryv IoU,
 4. zpřesnění proti katastrální mapě ČÚZK: v oknech po celé obci fázová korelace tenkých čar výkresu a čar katastru,
    z posunů afinní transformace, zbytkové odchylky = přesnost,
 5. když je přesnost do 5 m (MAX_CHYBA) a výkres pokrývá skoro celé území obce, dlaždice Web Mercator z12–z16
    ve WebP oříznuté hranicí obce do data/vykresy/<kód obce>/{z}/{x}/{y}.webp, jinak obec vynechá.
    Výkresy v měřítku 1:10 000 se pro zpřesnění a dlaždice rastrují jemněji (až 200 dpi). PDF může být i v ZIPu.
Výsledek a přesnost zapíše do data/vykresy.json. build.py dlaždice zkopíruje do dist a přidá zdroj do mapy.

Spuštění: python scripts/vykresy.py [--obec 579891] [--limit-mb 500]
         python scripts/vykresy.py --jen-dlazdice [--obec ...]   (dlaždice znovu z uložené transformace, bez vlícování)
Potřebuje: pymupdf, numpy, opencv-python-headless, pillow, pyproj.
"""
import argparse, io, json, math, os, re, shutil, sys, tempfile, time, urllib.error, urllib.parse, urllib.request, zipfile, zlib

import numpy as np
import cv2
import pymupdf as fitz
from PIL import Image
from pyproj import Transformer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUIAN = 'https://ags.cuzk.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/12/query'
KM = 'https://services.cuzk.cz/wms/local-km-wms.asp'
# stejná definice S-JTSK jako v appce (proj4), aby dlaždice seděly s ostatními zdroji v mapě
KROVAK = ('+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813972222222 +k=0.9999 +x_0=0 +y_0=0 '
          '+ellps=bessel +towgs84=570.8,85.7,462.8,4.998,1.587,5.261,3.56 +units=m +no_defs')
T_MERC_JTSK = Transformer.from_crs('EPSG:3857', KROVAK, always_xy=True)
T_JTSK_MERC = Transformer.from_crs(KROVAK, 'EPSG:3857', always_xy=True)
DPI = 100
MAX_CHYBA = 5.0          # m, větší odchylka proti katastru = výkres do mapy nedáme
ZOOMS = range(12, 17)
WEBP = {'quality': 65, 'method': 4}   # kvalita 65: o desetinu menší a zkratky ploch dál čitelné (method 6 ušetří jen 1 %, je pomalá)
MIN_POKRYTI_DLAZDICE = 0.002          # dlaždice, kam obec zasahuje jen tenkým proužkem, se neukládá
R = 20037508.342789244
Image.MAX_IMAGE_PIXELS = None


def get(url, raw=False, timeout=120):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (vykresy; Jednotny uzemni plan)'})
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
            break
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            # výpadek sítě nebo serveru zkusit znovu, chybějící soubor (4xx) ne
            if i == 2 or (isinstance(e, urllib.error.HTTPError) and e.code < 500):
                raise
            time.sleep(10 * (i + 1))
    return b if raw else json.loads(b.decode('utf-8'))


# ---------------------------------------------------------------------------
# 1 a 2: PDF -> rastr kolem 100 dpi
# ---------------------------------------------------------------------------
def stahni(z, kod):
    """PDF výkresu do mezipaměti. Když obec dává výkresy jen v ZIPu, "zip" je část názvu souboru v archivu."""
    d = os.path.join(tempfile.gettempdir(), 'jup-vykresy'); os.makedirs(d, exist_ok=True)
    f = os.path.join(d, f'{kod}.pdf')
    if not os.path.exists(f) or os.path.getsize(f) < 1000:
        data = get(z['pdf'], raw=True, timeout=600)
        if z.get('zip'):
            arch = zipfile.ZipFile(io.BytesIO(data))
            data = arch.read(next(n for n in arch.namelist() if z['zip'] in n))
        open(f, 'wb').write(data)
    return f


def rastr(pdf, page_no=0, dpi=DPI):
    """Vrátí (RGB pole, metrů papíru na pixel). Velké rastry v PDF dekóduje proudově a rovnou zmenšuje."""
    doc = fitz.open(pdf)
    p = doc[page_no]
    # obří list (sken uložený jako stránka v pixelech): rastr nejvýš kolem 120 Mpx, ať se vejde do paměti
    dpi = min(dpi, math.sqrt(120e6 / (p.rect.width / 72 * p.rect.height / 72)))
    try:
        pix = p.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=False)
        a = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)[..., :3].copy()
        return a, 0.0254 / dpi
    except Exception as e:
        if 'large' not in str(e).lower():
            raise
    # obří obraz přes celou stránku: dekódovat proud po řádcích a zmenšit na ~DPI
    imgs = p.get_images(full=True)
    xref, w, h = imgs[0][0], imgs[0][2], imgs[0][3]
    page_in = p.rect.width / 72
    f = max(1, round(w / page_in / dpi))
    filt = str(doc.xref_get_key(xref, 'Filter')[1])
    cs = str(doc.xref_get_key(xref, 'ColorSpace')[1])
    nc = 1 if 'Gray' in cs else 3
    raw = doc.xref_stream_raw(xref)
    if 'DCT' in filt:
        im = Image.open(io.BytesIO(raw)); im.draft('RGB', (w // f, h // f))
        a = np.array(im.convert('RGB'))
        return a, p.rect.width / 72 * 0.0254 / a.shape[1]
    if 'Flate' not in filt or doc.xref_get_key(xref, 'DecodeParms')[0] != 'null':
        raise RuntimeError(f'neumím dekódovat obraz {filt}')
    d = zlib.decompressobj(); row = w * nc
    out = np.zeros((h // f, w // f, 3), np.uint8)
    buf, pos, r = b'', 0, 0
    while r < h // f:
        while len(buf) < row * f and pos < len(raw):
            buf += d.decompress(raw[pos:pos + (1 << 20)]); pos += 1 << 20
        if len(buf) < row * f:
            break
        blk = np.frombuffer(buf[:row * f], np.uint8).reshape(f, w, nc)[:, :w // f * f]
        buf = buf[row * f:]
        m = blk.reshape(f, w // f, f, nc).mean(axis=(0, 2)).astype(np.uint8)
        out[r] = m if nc == 3 else np.repeat(m, 3, axis=1).reshape(w // f, 3)
        r += 1
    return out, p.rect.width / 72 * 0.0254 / out.shape[1]


# ---------------------------------------------------------------------------
# 3: hrubé vlícování podle hranice obce
# ---------------------------------------------------------------------------
def obec_polygon(kod):
    q = f'{RUIAN}?where={urllib.parse.quote(f"kod={kod}")}&returnGeometry=true&outSR=5514&maxAllowableOffset=2&f=json'
    return [np.array(r, float) for r in get(q)['features'][0]['geometry']['rings']]


def ku_polygon(kody):
    """Hranice katastrálních území (list výkresu, který kreslí jen část obce)."""
    w = urllib.parse.quote(f'kod IN ({",".join(map(str, kody))})')
    q = f'{RUIAN.replace("/12/", "/7/")}?where={w}&returnGeometry=true&outSR=5514&maxAllowableOffset=2&f=json'
    return [np.array(r, float) for ft in get(q)['features'] for r in ft['geometry']['rings']]


def pas_polygon(poly, ymin=None, ymax=None):
    """Obec oříznutá vodorovným pásem souřadnic S-JTSK (list výkresu, který kreslí jen severní nebo jižní část obce)."""
    def orez(ring, keep, cut):
        out = []
        for i in range(len(ring)):
            a, b = ring[i - 1], ring[i]
            ia, ib = keep(a), keep(b)
            if ib:
                if not ia:
                    out.append(cut(a, b))
                out.append(b)
            elif ia:
                out.append(cut(a, b))
        return out
    def cut_at(y0):
        return lambda a, b: np.array([a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0])
    res = []
    for r in poly:
        r = [np.array(p, float) for p in r]
        if ymin is not None:
            r = orez(r, lambda q: q[1] >= ymin, cut_at(ymin))
        if ymax is not None and r:
            r = orez(r, lambda q: q[1] <= ymax, cut_at(ymax))
        if len(r) >= 3:
            res.append(np.array(r))
    return res


def cast_polygon(kod, c):
    """Území, které kreslí list: celá obec, vyjmenovaná katastrální území (`ku`) nebo pás (`pas` = [ymin, ymax])."""
    if c.get('ku'):
        return ku_polygon(c['ku'])
    poly = obec_polygon(kod)
    if c.get('pas'):
        return pas_polygon(poly, *c['pas'])
    return poly


def maska_vykresu(img, F):
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
    col = ((hsv[..., 1] > 45) | (hsv[..., 2] < 170)).astype(np.uint8)
    H, W = col.shape
    s = (cv2.resize(col, (W // F, H // F), interpolation=cv2.INTER_AREA) > 0.35).astype(np.uint8)
    s = cv2.morphologyEx(s, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(s, 8)
    if n < 2:
        return s
    m = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = np.zeros_like(m); cv2.drawContours(out, cnts, -1, 1, -1)
    return out


def hrube(img, m_papir, poly, otoceni=None, meritko=None):
    """Měřítko, otočení a posun, při kterých se maska výkresu nejvíc kryje s hranicí obce.
    `otoceni`: přibližné otočení výkresu na listu (stupně), když je velké (území položené na výšku listu);
    `meritko`: známé měřítko výkresu, zkrátí hledání."""
    F = 4
    mask = maska_vykresu(img, F).astype(np.float32)
    A = np.fft.rfft2(mask)
    pts = np.concatenate(poly)
    cx, cy = pts[:, 0].mean(), pts[:, 1].mean()

    def zkus(mer, rot):
        sc = m_papir * mer * F                       # metrů na pixel pracovní masky
        c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        pm = np.zeros(mask.shape, np.uint8)
        rr = []
        for p in poly:
            x, y = p[:, 0] - cx, p[:, 1] - cy
            u, v = (c * x + s * y) / sc, -(-s * x + c * y) / sc   # S-JTSK -> pixel (y dolů), otočení výkresu o rot
            rr.append(np.stack([u, v], 1))
        allp = np.concatenate(rr); off = -allp.min(0)
        if (allp.max(0) + off >= np.array(mask.shape[::-1]) - 1).any():
            return None
        for q in rr:
            cv2.fillPoly(pm, [(q + off).astype(np.int32)], 1)
        cc = np.fft.irfft2(A * np.conj(np.fft.rfft2(pm.astype(np.float32))), s=mask.shape)
        iy, ix = np.unravel_index(np.argmax(cc), cc.shape)
        inter = cc[iy, ix]
        iou = inter / (mask.sum() + pm.sum() - inter)
        if iy > mask.shape[0] // 2: iy -= mask.shape[0]
        if ix > mask.shape[1] // 2: ix -= mask.shape[1]
        return iou, mer, rot, ix, iy, off, sc

    best = None
    # obvyklá měřítka a k tomu hustá řada po 10 % (list bez správné velikosti stránky má měřítko „lichá“)
    merita = [meritko] if meritko else sorted({1000, 2000, 2500, 2880, 4000, 5000, 7500, 10000, 15000, 20000, 25000} | {round(800 * 1.1 ** i) for i in range(38)})
    for rot in (range(otoceni - 10, otoceni + 11, 2) if otoceni is not None else [0]):
        for mer in merita:
            r = zkus(mer, rot)
            if r and (best is None or r[0] > best[0]):
                best = r
    if best is None:
        raise RuntimeError('výkres se nevešel na žádné měřítko')
    mer0, rot0 = best[1], best[2]
    for k in np.arange(0.94, 1.0601, 0.004):
        r = zkus(mer0 * k, rot0)
        if r and r[0] > best[0]:
            best = r
    if otoceni is not None:                          # doladit otočení kolem nalezeného
        for rot in np.arange(best[2] - 2, best[2] + 2.01, 0.5):
            r = zkus(best[1], float(rot))
            if r and r[0] > best[0]:
                best = r
    elif best[0] < 0.93:                             # zkusit otočení (výkres orientovaný k severu, ne k síti S-JTSK)
        for rot in range(-25, 26):
            r = zkus(best[1], rot)
            if r and r[0] > best[0]:
                best = r
    if otoceni is not None or best[2] != 0:
        # měřítko a otočení doladit střídavě: mřížka po 10 % a 2° umí správnou dvojici minout
        # (Hronov: list natočený k severu a mírně zmenšený)
        for _ in range(4):
            prev = best
            for k in np.arange(0.97, 1.0301, 0.005):
                r = zkus(best[1] * k, best[2])
                if r and r[0] > best[0]:
                    best = r
            for d in np.arange(-3, 3.01, 0.5):
                r = zkus(best[1], float(best[2] + d))
                if r and r[0] > best[0]:
                    best = r
            if best is prev:
                break
    iou, mer, rot, ix, iy, off, sc = best
    # afinní transformace pixel plného rastru (u, v) -> S-JTSK (x, y)
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    k = sc / F
    # pixel masky (U, V) = (u/F, v/F); U - ix - off_x = (c x + s y)/sc ; V - iy - off_y = -(-s x + c y)/sc  (x, y relativně k cx, cy)
    M = np.array([[c, s], [s, -c]]) / sc            # [U', V'] = M @ [x, y]
    Minv = np.linalg.inv(M)
    # x,y = Minv @ ([u/F, v/F] - [ix + off_x, iy + off_y]) + [cx, cy]
    Aff = np.zeros((2, 3))
    Aff[:, :2] = Minv / F
    Aff[:, 2] = -Minv @ np.array([ix + off[0], iy + off[1]]) + np.array([cx, cy])
    return Aff, float(iou), float(mer), float(rot)


def geopdf(pdf, page_no, m_papir):
    """Georeference z GeoPDF (/VP s /Measure /GEO): afinní transformace pixel rastru -> S-JTSK, nebo None.
    Body GPTS bývají ve WGS84 i v zeměpisných souřadnicích S-JTSK, na rozdílu ~100 m nezáleží, dorovná to katastr."""
    doc = fitz.open(pdf)
    p = doc[page_no]
    t, v = doc.xref_get_key(p.xref, 'VP')
    if t == 'null':
        return None
    if t == 'xref':
        v = doc.xref_object(int(v.split()[0]), compressed=True)
    v = re.sub(r'/Measure\s+(\d+)\s+0\s+R', lambda m: doc.xref_object(int(m.group(1)), compressed=True), v)
    nums = lambda txt: [float(x) for x in txt.split()]
    best = None
    for vp in v.split('/Viewport')[1:]:
        b, g, l = (re.search(k + r'\s*\[([^\]]*)\]', vp) for k in ('/BBox', '/GPTS', '/LPTS'))
        if not (b and g and l) or not g.group(1).strip():
            continue
        bb, gp, lp = nums(b.group(1)), nums(g.group(1)), nums(l.group(1))
        area = abs((bb[2] - bb[0]) * (bb[3] - bb[1]))
        if len(gp) >= 6 and len(gp) == len(lp) and (best is None or area > best[0]):
            best = (area, bb, gp, lp)
    if best is None:
        return None
    _, bb, gp, lp = best
    T = Transformer.from_crs('EPSG:4326', KROVAK, always_xy=True)
    pt = m_papir / 0.0254 * 72                          # bodů PDF na pixel rastru
    mb = p.mediabox
    uv, xy = [], []
    for i in range(0, len(gp), 2):
        X = bb[0] + lp[i] * (bb[2] - bb[0]); Y = bb[1] + lp[i + 1] * (bb[3] - bb[1])
        uv.append([(X - mb.x0) / pt, (mb.y1 - Y) / pt, 1])
        xy.append(T.transform(gp[i + 1], gp[i]))
    sol, *_ = np.linalg.lstsq(np.array(uv), np.array(xy), rcond=None)
    return sol.T


# ---------------------------------------------------------------------------
# 4: zpřesnění proti katastrální mapě
# ---------------------------------------------------------------------------
def km_okno(x0, y0, x1, y1, n):
    u = (f'{KM}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=KN&STYLES=&CRS=EPSG:5514&BBOX={x0},{y0},{x1},{y1}'
         f'&WIDTH={n}&HEIGHT={n}&FORMAT=image/png&TRANSPARENT=TRUE')
    a = np.array(Image.open(io.BytesIO(get(u, raw=True, timeout=90))).convert('RGBA'))
    return (a[..., 3] > 0).astype(np.float32)


def cary(rgb):
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    bh = cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, np.ones((5, 5), np.uint8)).astype(np.float32)
    return bh / (bh.max() + 1e-6)


def uvnitr(poly, x, y):
    return any(cv2.pointPolygonTest(p.astype(np.float32), (float(x), float(y)), False) > 0 for p in poly)


def korekce(K, X, Y):
    """Posun polynomem 2. stupně (zbytková deformace výkresu po afinní transformaci): bod v terénu -> kam se dívat do výkresu."""
    if not K:
        return X, Y
    x = (X - K['x0']) / K['s']; y = (Y - K['y0']) / K['s']
    B = [np.ones_like(x), x, y, x * x, x * y, y * y]
    dx = sum(c * b for c, b in zip(K['cx'], B)); dy = sum(c * b for c, b in zip(K['cy'], B))
    lim = K.get('lim', 25.0)
    return X + np.clip(dx, -lim, lim), Y + np.clip(dy, -lim, lim)


def fit_korekce(m):
    """Koeficienty korekce z posunů v oknech (r = (x, y, dx, dy, odezva)), aspoň 8 oken."""
    P = np.array([[r[0], r[1]] for r in m]); D = np.array([[r[2], r[3]] for r in m])
    x0, y0 = P[:, 0].mean(), P[:, 1].mean(); sc = max(1.0, np.abs(P - [x0, y0]).max())
    x = (P[:, 0] - x0) / sc; y = (P[:, 1] - y0) / sc
    A = np.c_[np.ones_like(x), x, y, x * x, x * y, y * y]
    cx, *_ = np.linalg.lstsq(A, D[:, 0], rcond=None); cy, *_ = np.linalg.lstsq(A, D[:, 1], rcond=None)
    return {'x0': float(x0), 'y0': float(y0), 's': float(sc), 'cx': [float(v) for v in cx], 'cy': [float(v) for v in cy], 'lim': 25.0}


def posuny(img, Aff, poly, px_m, kor=None):
    pts = np.concatenate(poly)
    x0, y0, x1, y1 = pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max()
    Ainv = np.linalg.inv(np.vstack([Aff, [0, 0, 1]]))[:2]
    n = 512
    # katastr ČÚZK kreslí jen do měřítka kolem 1:5 000, okno proto nejvýš 1,3 m na pixel (hrubší výkres se zvětší)
    half = n * min(px_m, 1.3) / 2
    nx = max(2, min(6, int((x1 - x0) / (4 * half)) + 2)); ny = max(2, min(5, int((y1 - y0) / (4 * half)) + 2))
    out = []
    for fx in np.linspace(0.1, 0.9, nx):
        for fy in np.linspace(0.12, 0.88, ny):
            cx, cy = x0 + fx * (x1 - x0), y0 + fy * (y1 - y0)
            if not uvnitr(poly, cx, cy):
                continue
            g = (np.arange(n) + 0.5) * (2 * half / n)
            XX, YY = korekce(kor, *np.meshgrid(cx - half + g, cy + half - g))
            U = (Ainv[0, 0] * XX + Ainv[0, 1] * YY + Ainv[0, 2]).astype(np.float32)
            V = (Ainv[1, 0] * XX + Ainv[1, 1] * YY + Ainv[1, 2]).astype(np.float32)
            L = cary(cv2.remap(img, U, V, cv2.INTER_LINEAR, borderValue=(255, 255, 255)))
            try:
                K = km_okno(cx - half, cy - half, cx + half, cy + half, n)
            except Exception:
                continue
            if K.mean() < 0.004:
                continue
            (dx, dy), resp = cv2.phaseCorrelate(K, L, cv2.createHanningWindow((n, n), cv2.CV_32F))
            out.append((cx, cy, dx * 2 * half / n, -dy * 2 * half / n, resp))
    return out


def zpresni(img, Aff, poly, px_m):
    """Afinní transformace z posunů proti katastru. Okna s falešnou korelací (posun mimo ostatní) vyřadí.
    Vrátí transformaci, zbytkové odchylky platných oken, počet oken, průběh a počet vyřazených oken."""
    hist = []
    for it in range(3):
        m = [r for r in posuny(img, Aff, poly, px_m) if r[4] > 0.06]
        if len(m) < 4:
            return Aff, None, len(m), hist, 0
        src = np.array([[r[0], r[1]] for r in m]); dst = src - np.array([[r[2], r[3]] for r in m])
        Ainv = np.linalg.inv(np.vstack([Aff, [0, 0, 1]]))[:2]
        uv = np.c_[src, np.ones(len(src))] @ Ainv.T
        keep = np.ones(len(m), bool)
        for _ in range(4):
            sol, *_ = np.linalg.lstsq(np.c_[uv[keep], np.ones(keep.sum())], dst[keep], rcond=None)
            e = np.hypot(*(np.c_[uv, np.ones(len(uv))] @ sol - dst).T)
            new = e <= max(10.0, 3 * float(np.median(e[keep])))
            if (new == keep).all() or new.sum() < 4:
                break
            keep = new
        Aff = sol.T
        hist.append([round(float(math.hypot(r[2], r[3])), 2) for r in m])
    # kontrolní měření po zpřesnění: zbytkové posuny proti katastru; okno daleko mimo ostatní je falešná shoda
    m = [r for r in posuny(img, Aff, poly, px_m) if r[4] > 0.06]
    res = [math.hypot(r[2], r[3]) for r in m]
    if not res:
        return Aff, res, 0, hist, 0
    lim = max(25.0, 5 * float(np.median(res)))
    ok = [d for d in res if d <= lim]
    return Aff, ok, len(m), hist, len(res) - len(ok)


def pokryti(img, Aff, poly, F=4, kor=None):
    """Podíl území obce, na kterém je ve vlícovaném výkresu něco nakreslené (ne bílý papír ani místo mimo list)."""
    H, W = img.shape[0] // F, img.shape[1] // F
    ink = (cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA).min(axis=2) < 235).astype(np.uint8)
    ink = cv2.dilate(ink, np.ones((9, 9), np.uint8))
    Ainv = np.linalg.inv(np.vstack([Aff, [0, 0, 1]]))[:2]
    uv = [np.c_[np.column_stack(korekce(kor, p[:, 0], p[:, 1])), np.ones(len(p))] @ Ainv.T / F for p in poly]
    allp = np.concatenate(uv)
    off = np.floor(np.minimum(allp.min(0), 0)).astype(int)
    size = np.ceil(np.maximum(allp.max(0), [W, H])).astype(int) - off + 2
    pm = np.zeros((size[1], size[0]), np.uint8)
    for q in uv:
        cv2.fillPoly(pm, [(q - off).round().astype(np.int32)], 1)
    canvas = np.zeros_like(pm)
    canvas[-off[1]:-off[1] + H, -off[0]:-off[0] + W] = ink
    return float((pm & canvas).sum() / max(1, pm.sum()))


# ---------------------------------------------------------------------------
# 5: dlaždice Web Mercator ve WebP, oříznuté hranicí obce
# ---------------------------------------------------------------------------
def dlazdice(img, Aff, poly, kod, out_dir, kor=None):
    Ainv = np.linalg.inv(np.vstack([Aff, [0, 0, 1]]))[:2]
    px_m = math.hypot(Aff[0, 0], Aff[1, 0])
    # pyramida: pro hrubší zoomy předem zmenšený obraz, ať při vzorkování nevzniká moaré
    pyr = [img]
    while pyr[-1].shape[0] > 512 and len(pyr) < 6:
        pyr.append(cv2.pyrDown(pyr[-1]))
    merc = [np.stack(T_JTSK_MERC.transform(p[:, 0], p[:, 1]), 1) for p in poly]
    allm = np.concatenate(merc)
    mx0, my0, mx1, my1 = allm[:, 0].min(), allm[:, 1].min(), allm[:, 0].max(), allm[:, 1].max()
    n_t, size = 0, 0
    lat = math.degrees(math.atan(math.sinh((my0 + my1) / 2 / 6378137)))
    for z in ZOOMS:
        span = 2 * R / 2 ** z
        ground = span / 256 * math.cos(math.radians(lat))
        L = max(0, min(len(pyr) - 1, int(math.floor(math.log2(max(1.0, ground / px_m))))))
        src, f = pyr[L], 2 ** L
        tx0, tx1 = int((mx0 + R) // span), int((mx1 + R) // span)
        ty0, ty1 = int((R - my1) // span), int((R - my0) // span)
        for tx in range(tx0, tx1 + 1):
            for ty in range(ty0, ty1 + 1):
                bx, by = -R + tx * span, R - ty * span
                g = (np.arange(256) + 0.5) * span / 256
                XX, YY = np.meshgrid(bx + g, by - g)
                X, Y = T_MERC_JTSK.transform(XX.ravel(), YY.ravel())
                X, Y = korekce(kor, np.asarray(X).reshape(256, 256), np.asarray(Y).reshape(256, 256))
                U = ((Ainv[0, 0] * X + Ainv[0, 1] * Y + Ainv[0, 2]) / f).astype(np.float32)
                V = ((Ainv[1, 0] * X + Ainv[1, 1] * Y + Ainv[1, 2]) / f).astype(np.float32)
                a = np.zeros((256, 256), np.uint8)
                for q in merc:
                    cv2.fillPoly(a, [np.stack([(q[:, 0] - bx) / span * 256, (by - q[:, 1]) / span * 256], 1).round().astype(np.int32)], 255)
                inside = (U >= 0) & (V >= 0) & (U < src.shape[1] - 1) & (V < src.shape[0] - 1)
                a[~inside] = 0
                if (a > 0).mean() < MIN_POKRYTI_DLAZDICE:
                    continue
                rgb = cv2.remap(src, U, V, cv2.INTER_LINEAR, borderValue=(255, 255, 255))
                d = os.path.join(out_dir, str(z), str(tx)); os.makedirs(d, exist_ok=True)
                fn = os.path.join(d, f'{ty}.webp')
                tile = Image.fromarray(np.dstack([rgb, a]))
                if os.path.exists(fn):           # dlaždici už začal list sousední části obce
                    tile = Image.alpha_composite(Image.open(fn).convert('RGBA'), tile)
                tile.save(fn, 'WEBP', **WEBP)
                n_t += 1; size += os.path.getsize(fn)
    return n_t, size, [mx0, my0, mx1, my1]


def vyrizni(img, src):
    """Jen mapové pole listu (`vyrez` = [x0, y0, x1, y1] v podílech stránky), když se legenda nebo razítko dotýká mapy.
    `zakryj` = obdélníky ve stejných podílech, které se vybílí (legenda zasahuje do obdélníku mapy, Hronov)."""
    h, w = img.shape[:2]
    if src.get('zakryj'):
        img = img.copy()
        for x0, y0, x1, y1 in src['zakryj']:
            img[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = 255
    v = src.get('vyrez')
    if not v:
        return img
    return np.ascontiguousarray(img[int(v[1] * h):int(v[3] * h), int(v[0] * w):int(v[2] * w)])


def vlicuj(src, cache, poly):
    """Jeden list výkresu: rastr, hrubé přiložení (případně GeoPDF), zpřesnění proti katastru a kontroly."""
    pdf = stahni(src, cache)
    strana = src.get('strana', 0)
    img, m_papir = rastr(pdf, strana)
    H0, W0 = img.shape[:2]
    img = vyrizni(img, src)
    dpi = DPI                                    # rozlišení rastru pro dlaždice (uloží se kvůli přegenerování)
    Aff, iou, mer, rot = hrube(img, m_papir, poly, src.get('otoceni'), src.get('meritko'))
    print(f'   hrubě: IoU {iou:.3f}, měřítko 1:{mer:.0f}, otočení {rot}°', flush=True)
    geo = geopdf(pdf, strana, m_papir) if iou < 0.9 else None
    if geo is not None and src.get('vyrez'):
        # GeoPDF počítá s celou stránkou, výřez posouvá počátek pixelů
        geo[:, 2] += geo[:, :2] @ np.array([int(src['vyrez'][0] * W0), int(src['vyrez'][1] * H0)], float)
    if geo is not None:
        # hrubé přiložení na hranici nesedí, výkres má ale vlastní georeferenci (GeoPDF)
        Aff = geo
        mer = math.hypot(Aff[0, 0], Aff[1, 0]) / m_papir
        rot = round(math.degrees(math.atan2(Aff[1, 0], Aff[0, 0])), 1)
        print(f'   GeoPDF: měřítko 1:{mer:.0f}, otočení {rot}°', flush=True)
    if mer > 6000:
        # výkres v drobném měřítku (1:10 000): jemnější rastr, ať čáry pro katastr i dlaždice z16 mají kolem 1,3 m na pixel
        # (velikost rastru hlídá strop v rastr())
        img, m_hi = rastr(pdf, strana, DPI * min(4.0, mer / 5000))
        img = vyrizni(img, src)
        Aff[:, :2] *= m_hi / m_papir
        dpi = DPI * min(4.0, mer / 5000)
        print(f'   jemnější rastr {img.shape[1]} × {img.shape[0]} px', flush=True)
    px_m = math.hypot(Aff[0, 0], Aff[1, 0])
    Aff, res, n_ok, hist, n_out = zpresni(img, Aff, poly, px_m)
    if res is None or not res:
        raise RuntimeError(f'katastr: málo oken s korelací ({n_ok})')
    mx = max(res); rms = math.sqrt(sum(r * r for r in res) / len(res))
    print(f'   katastr: {len(res)} oken, odchylka max {mx:.2f} m, RMS {rms:.2f} m, vyřazeno {n_out} (průběh {hist})', flush=True)
    # překryv masky s hranicí je jen hrubá kontrola (bledé barvy maska nepozná);
    # rozhoduje přesnost proti katastru a to, že výkres pokrývá skoro celé území
    kor = None
    if mx > MAX_CHYBA and len(res) >= 8:
        # papír nebo starý mapový podklad je zkreslený nerovnoměrně: zbytky afinní transformace proložit polynomem
        m = [r for r in posuny(img, Aff, poly, px_m) if r[4] > 0.06]
        lim = max(25.0, 5 * float(np.median([math.hypot(r[2], r[3]) for r in m]))) if m else 0
        m = [r for r in m if math.hypot(r[2], r[3]) <= lim]
        if len(m) >= 8:
            kor = fit_korekce(m)
            m2 = [r for r in posuny(img, Aff, poly, px_m, kor) if r[4] > 0.06]
            res2 = [math.hypot(r[2], r[3]) for r in m2]
            ok2 = [d for d in res2 if d <= max(25.0, 5 * float(np.median(res2)))] if res2 else []
            if ok2:
                print(f'   korekce polynomem: {len(ok2)} oken, odchylka max {max(ok2):.2f} m (bez ní {mx:.2f} m)', flush=True)
            if ok2 and max(ok2) < mx and len(ok2) >= 8:
                res, n_out = ok2, len(res2) - len(ok2)
                mx = max(res); rms = math.sqrt(sum(r * r for r in res) / len(res))
            else:
                kor = None
    kryti = pokryti(img, Aff, poly, kor=kor)
    print(f'   výkres pokrývá {kryti:.1%} území', flush=True)
    ok = mx <= MAX_CHYBA and len(res) >= 4 and n_out <= 0.2 * (len(res) + n_out) and (iou >= 0.85 or kryti >= 0.97)
    return {'img': img, 'Aff': Aff, 'poly': poly, 'iou': iou, 'mer': mer, 'rot': rot, 'res': res, 'n_out': n_out, 'kryti': kryti, 'ok': ok, 'dpi': dpi, 'kor': kor}


def meritka_z_textu(pdf, strana=0):
    """Měřítka napsaná na listu (1 : 5 000), nejčastější první."""
    try:
        t = fitz.open(pdf)[strana].get_text()
    except Exception:
        return []
    m = [int(re.sub(r'\D', '', x)) for x in re.findall(r'1\s?:\s?(\d{1,2}[ .\u00a0]?\d{3})(?!\d)', t)]
    m = [x for x in m if 1000 <= x <= 25000]
    return sorted(set(m), key=lambda x: -m.count(x))


def vlicuj_pokusy(src, cache, poly):
    """Vlícování; když nevyjde a měřítko není zadané, ještě s měřítkem napsaným na listu, případně 1:5 000 a 1:10 000
    (maska výkresu s legendou nebo okolím obce umí hrubé hledání měřítka svést)."""
    try:
        v, err = vlicuj(src, cache, poly), None
    except RuntimeError as e:
        v, err = None, e
    if (v and v['ok']) or src.get('meritko'):
        if v is None:
            raise err
        return v
    zkusit = meritka_z_textu(stahni(src, cache), src.get('strana', 0))[:2]
    zkusit += [m for m in (5000, 10000) if m not in zkusit]
    for m in zkusit[:3]:
        if v and abs(v['mer'] / m - 1) < 0.03:
            continue                                 # tohle měřítko už první pokus našel
        print(f'   znovu s měřítkem 1:{m}', flush=True)
        try:
            w = vlicuj(dict(src, meritko=m), cache, poly)
        except RuntimeError as e:
            print(f'   {e}', flush=True)
            continue
        if w['ok']:
            return w
        if v is None or max(w['res']) < max(v['res']):
            v = w
    if v is None:
        raise err
    return v


def jen_dlazdice(obce=None):
    """Dlaždice přijatých výkresů znovu z uložené transformace (třeba po změně kódování), bez nového vlícování."""
    zdroje = {z['obec']: z for z in json.load(open(os.path.join(ROOT, 'data', 'vykresy_zdroje.json'), encoding='utf-8'))}
    meta_f = os.path.join(ROOT, 'data', 'vykresy.json')
    for rec in json.load(open(meta_f, encoding='utf-8')):
        kod = rec['obec']
        if not rec.get('prijato') or (obce and kod not in obce) or kod not in zdroje:
            continue
        t = time.time()
        z = zdroje[kod]
        casti = z.get('casti') or [z]
        trans = [c['transformace'] for c in rec['casti']] if rec.get('casti') else [rec['transformace']]
        kors = [c.get('korekce') for c in rec['casti']] if rec.get('casti') else [rec.get('korekce')]
        out_dir = os.path.join(ROOT, 'data', 'vykresy', str(kod))
        if os.path.exists(out_dir):
            shutil.rmtree(out_dir)
        ext = None
        for i, (c, T, K) in enumerate(zip(casti, trans, kors)):
            Aff = np.array(T, float)
            pdf = stahni(c, kod if len(casti) == 1 else f'{kod}_{i}')
            # rastr ve stejném rozlišení jako při vlícování (u výkresů 1:10 000 jemnější)
            dpi = rec.get('dpi') or (DPI * min(4.0, rec['meritko'] / 5000) if rec.get('meritko', 0) > 6000 else DPI)
            img, _ = rastr(pdf, c.get('strana', 0), dpi)
            img = vyrizni(img, c)
            poly = cast_polygon(kod, c)
            _, _, e = dlazdice(img, Aff, poly, kod, out_dir, K)
            ext = e if ext is None else [min(ext[0], e[0]), min(ext[1], e[1]), max(ext[2], e[2]), max(ext[3], e[3])]
        files = [os.path.join(r, f) for r, _, fs in os.walk(out_dir) for f in fs]
        size = sum(os.path.getsize(f) for f in files)
        print(f'{rec["nazev"]}: {len(files)} dlaždic, {rec.get("kb", 0) / 1024:.1f} -> {size / 1048576:.1f} MB, {time.time() - t:.0f} s', flush=True)
        disk = {m['obec']: m for m in json.load(open(meta_f, encoding='utf-8'))}
        disk[kod].update({'dlazdic': len(files), 'kb': round(size / 1024), 'extent3857': [round(x) for x in ext], 'zoom': [min(ZOOMS), max(ZOOMS)]})
        json.dump(sorted(disk.values(), key=lambda m: m['obec']), open(meta_f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--obec', type=int, action='append')
    ap.add_argument('--limit-mb', type=float, default=500)
    ap.add_argument('--jen-dlazdice', action='store_true', help='jen znovu vytvořit dlaždice přijatých výkresů z uložené transformace')
    args = ap.parse_args()
    if args.jen_dlazdice:
        return jen_dlazdice(args.obec)
    zdroje = json.load(open(os.path.join(ROOT, 'data', 'vykresy_zdroje.json'), encoding='utf-8'))
    meta_f = os.path.join(ROOT, 'data', 'vykresy.json')
    meta = {m['obec']: m for m in (json.load(open(meta_f, encoding='utf-8')) if os.path.exists(meta_f) else [])}
    for z in zdroje:
        kod = z['obec']
        if args.obec and kod not in args.obec:
            continue
        used = sum(m.get('kb', 0) for k, m in meta.items() if k != kod) / 1024
        if used > args.limit_mb:
            print(f'{z["nazev"]}: přeskočeno, dlaždice už mají {used:.0f} MB'); continue
        t = time.time()
        print(f'== {z["nazev"]} ({kod})', flush=True)
        out_dir = os.path.join(ROOT, 'data', 'vykresy', str(kod))
        try:
            if os.path.exists(out_dir):
                shutil.rmtree(out_dir)
            # obec s výkresem rozděleným do víc PDF (casti): každý list se vlícuje na svá katastrální území
            casti = z.get('casti') or [z]
            vys, ext = [], None
            for i, c in enumerate(casti):
                if len(casti) > 1:
                    print(f'   list: {c.get("nazev", i + 1)}', flush=True)
                poly = cast_polygon(kod, c)
                v = vlicuj_pokusy(c, kod if len(casti) == 1 else f'{kod}_{i}', poly)
                vys.append(v)
                if not v['ok']:
                    break
                _, _, e = dlazdice(v.pop('img'), v['Aff'], v['poly'], kod, out_dir, v.get('kor'))
                ext = e if ext is None else [min(ext[0], e[0]), min(ext[1], e[1]), max(ext[2], e[2]), max(ext[3], e[3])]
            ok = len(vys) == len(casti) and all(v['ok'] for v in vys)
            res = [r for v in vys for r in v['res']]
            mx = max(res); rms = math.sqrt(sum(r * r for r in res) / len(res))
            v0 = vys[0]
            rec = {'obec': kod, 'nazev': z['nazev'], 'pdf': casti[0]['pdf'], 'zip': bool(casti[0].get('zip')), 'verze': z['verze'],
                   'iou': round(min(v['iou'] for v in vys), 4), 'meritko': round(v0['mer']), 'otoceni': v0['rot'], 'oken': len(res),
                   'vyrazeno_oken': sum(v['n_out'] for v in vys), 'chyba_max_m': round(mx, 2), 'chyba_rms_m': round(rms, 2),
                   'pokryti': round(min(v['kryti'] for v in vys), 3), 'prijato': ok, 'dpi': v0['dpi'],
                   'transformace': [[round(x, 6) for x in r] for r in v0['Aff'].tolist()]}
            if v0.get('kor'):
                rec['korekce'] = v0['kor']
            if len(casti) > 1:
                rec['casti'] = [{'nazev': c.get('nazev'), 'pdf': c['pdf'], 'transformace': [[round(x, 6) for x in r] for r in v['Aff'].tolist()],
                                 **({'korekce': v['kor']} if v.get('kor') else {})} for c, v in zip(casti, vys)]
            if ok:
                files = [os.path.join(r, f) for r, _, fs in os.walk(out_dir) for f in fs]
                size = sum(os.path.getsize(f) for f in files)
                rec.update({'dlazdic': len(files), 'kb': round(size / 1024), 'extent3857': [round(x) for x in ext], 'zoom': [min(ZOOMS), max(ZOOMS)]})
                print(f'   dlaždice: {len(files)}, {size / 1048576:.1f} MB, {time.time() - t:.0f} s', flush=True)
            else:
                if os.path.exists(out_dir):
                    shutil.rmtree(out_dir)
                print('   NEPŘIJATO: přesnost nebo překryv mimo limit', flush=True)
            meta[kod] = rec
        except Exception as e:
            import traceback; traceback.print_exc()
            print(f'   CHYBA: {e}', flush=True)
            if os.path.exists(out_dir):
                shutil.rmtree(out_dir)
            meta[kod] = {'obec': kod, 'nazev': z['nazev'], 'pdf': z['pdf'], 'verze': z['verze'], 'prijato': False, 'chyba': str(e)[:200]}
        # zapsat jen tuhle obec do aktuálního souboru, ať může běžet víc procesů naráz (každý s jinými obcemi)
        disk = {m['obec']: m for m in (json.load(open(meta_f, encoding='utf-8')) if os.path.exists(meta_f) else [])}
        disk[kod] = meta[kod]
        json.dump(sorted(disk.values(), key=lambda m: m['obec']), open(meta_f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    sys.exit(main())
