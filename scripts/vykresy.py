#!/usr/bin/env python3
"""Výkresy z PDF: hlavní výkres obce, která nemá mapovou službu, vlícovaný do mapy a rozřezaný na dlaždice.

Postup pro každou obec z data/vykresy_zdroje.json:
 1. stáhne PDF (mezipaměť v %TEMP%/jup-vykresy),
 2. převede stránku na rastr kolem 100 dpi (vektorové PDF přes PyMuPDF, obří rastr v PDF proudově po řádcích),
 3. hrubé vlícování: maska barevných ploch výkresu proti hranici obce z RÚIAN (měřítko a posun přes FFT korelaci,
    případně otočení), výsledkem je překryv IoU,
 4. zpřesnění proti katastrální mapě ČÚZK: v oknech po celé obci fázová korelace tenkých čar výkresu a čar katastru,
    z posunů afinní transformace, zbytkové odchylky = přesnost,
 5. když je přesnost do 5 m (MAX_CHYBA), dlaždice Web Mercator z12–z16 ve WebP oříznuté hranicí obce
    do data/vykresy/<kód obce>/{z}/{x}/{y}.webp, jinak obec vynechá.
Výsledek a přesnost zapíše do data/vykresy.json. build.py dlaždice zkopíruje do dist a přidá zdroj do mapy.

Spuštění: python scripts/vykresy.py [--obec 579891] [--limit-mb 100]
Potřebuje: pymupdf, numpy, opencv-python-headless, pillow, pyproj.
"""
import argparse, io, json, math, os, shutil, sys, tempfile, time, urllib.parse, urllib.request, zlib

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
R = 20037508.342789244
Image.MAX_IMAGE_PIXELS = None


def get(url, raw=False, timeout=120):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (vykresy; Jednotny uzemni plan)'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        b = r.read()
    return b if raw else json.loads(b.decode('utf-8'))


# ---------------------------------------------------------------------------
# 1 a 2: PDF -> rastr kolem 100 dpi
# ---------------------------------------------------------------------------
def stahni(url, kod):
    d = os.path.join(tempfile.gettempdir(), 'jup-vykresy'); os.makedirs(d, exist_ok=True)
    f = os.path.join(d, f'{kod}.pdf')
    if not os.path.exists(f) or os.path.getsize(f) < 1000:
        open(f, 'wb').write(get(url, raw=True, timeout=600))
    return f


def rastr(pdf, page_no=0):
    """Vrátí (RGB pole, metrů papíru na pixel). Velké rastry v PDF dekóduje proudově a rovnou zmenšuje."""
    doc = fitz.open(pdf)
    p = doc[page_no]
    try:
        pix = p.get_pixmap(matrix=fitz.Matrix(DPI / 72, DPI / 72), alpha=False)
        a = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)[..., :3].copy()
        return a, 0.0254 / DPI
    except Exception as e:
        if 'large' not in str(e).lower():
            raise
    # obří obraz přes celou stránku: dekódovat proud po řádcích a zmenšit na ~DPI
    imgs = p.get_images(full=True)
    xref, w, h = imgs[0][0], imgs[0][2], imgs[0][3]
    page_in = p.rect.width / 72
    f = max(1, round(w / page_in / DPI))
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


def hrube(img, m_papir, poly):
    """Měřítko, otočení a posun, při kterých se maska výkresu nejvíc kryje s hranicí obce."""
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
    for mer in (1000, 2000, 2500, 2880, 4000, 5000, 7500, 10000, 15000, 20000, 25000):
        r = zkus(mer, 0)
        if r and (best is None or r[0] > best[0]):
            best = r
    if best is None:
        raise RuntimeError('výkres se nevešel na žádné měřítko')
    mer0 = best[1]
    for k in np.arange(0.94, 1.0601, 0.004):
        r = zkus(mer0 * k, 0)
        if r and r[0] > best[0]:
            best = r
    if best[0] < 0.93:                               # zkusit otočení (výkres orientovaný k severu, ne k síti S-JTSK)
        for rot in range(-12, 13):
            r = zkus(best[1], rot)
            if r and r[0] > best[0]:
                best = r
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


def posuny(img, Aff, poly, px_m):
    pts = np.concatenate(poly)
    x0, y0, x1, y1 = pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max()
    Ainv = np.linalg.inv(np.vstack([Aff, [0, 0, 1]]))[:2]
    n = 512
    half = n * px_m / 2
    nx = max(2, min(6, int((x1 - x0) / (4 * half)) + 2)); ny = max(2, min(5, int((y1 - y0) / (4 * half)) + 2))
    out = []
    for fx in np.linspace(0.1, 0.9, nx):
        for fy in np.linspace(0.12, 0.88, ny):
            cx, cy = x0 + fx * (x1 - x0), y0 + fy * (y1 - y0)
            if not uvnitr(poly, cx, cy):
                continue
            g = (np.arange(n) + 0.5) * (2 * half / n)
            XX, YY = np.meshgrid(cx - half + g, cy + half - g)
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
    hist = []
    for it in range(3):
        m = [r for r in posuny(img, Aff, poly, px_m) if r[4] > 0.06]
        if len(m) < 4:
            return Aff, None, len(m), hist
        src = np.array([[r[0], r[1]] for r in m]); dst = src - np.array([[r[2], r[3]] for r in m])
        Ainv = np.linalg.inv(np.vstack([Aff, [0, 0, 1]]))[:2]
        uv = np.c_[src, np.ones(len(src))] @ Ainv.T
        sol, *_ = np.linalg.lstsq(np.c_[uv, np.ones(len(uv))], dst, rcond=None)
        Aff = sol.T
        hist.append([round(float(math.hypot(r[2], r[3])), 2) for r in m])
    # kontrolní měření po zpřesnění: zbytkové posuny proti katastru
    m = [r for r in posuny(img, Aff, poly, px_m) if r[4] > 0.06]
    res = [math.hypot(r[2], r[3]) for r in m]
    return Aff, res, len(m), hist


# ---------------------------------------------------------------------------
# 5: dlaždice Web Mercator ve WebP, oříznuté hranicí obce
# ---------------------------------------------------------------------------
def dlazdice(img, Aff, poly, kod, out_dir):
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
                X, Y = np.asarray(X).reshape(256, 256), np.asarray(Y).reshape(256, 256)
                U = ((Ainv[0, 0] * X + Ainv[0, 1] * Y + Ainv[0, 2]) / f).astype(np.float32)
                V = ((Ainv[1, 0] * X + Ainv[1, 1] * Y + Ainv[1, 2]) / f).astype(np.float32)
                a = np.zeros((256, 256), np.uint8)
                for q in merc:
                    cv2.fillPoly(a, [np.stack([(q[:, 0] - bx) / span * 256, (by - q[:, 1]) / span * 256], 1).round().astype(np.int32)], 255)
                inside = (U >= 0) & (V >= 0) & (U < src.shape[1] - 1) & (V < src.shape[0] - 1)
                a[~inside] = 0
                if not a.any():
                    continue
                rgb = cv2.remap(src, U, V, cv2.INTER_LINEAR, borderValue=(255, 255, 255))
                d = os.path.join(out_dir, str(z), str(tx)); os.makedirs(d, exist_ok=True)
                fn = os.path.join(d, f'{ty}.webp')
                Image.fromarray(np.dstack([rgb, a])).save(fn, 'WEBP', quality=72, method=4)
                n_t += 1; size += os.path.getsize(fn)
    return n_t, size, [mx0, my0, mx1, my1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--obec', type=int, action='append')
    ap.add_argument('--limit-mb', type=float, default=100)
    args = ap.parse_args()
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
        try:
            img, m_papir = rastr(stahni(z['pdf'], kod), z.get('strana', 0))
            poly = obec_polygon(kod)
            Aff, iou, mer, rot = hrube(img, m_papir, poly)
            print(f'   hrubě: IoU {iou:.3f}, měřítko 1:{mer:.0f}, otočení {rot}°', flush=True)
            px_m = math.hypot(Aff[0, 0], Aff[1, 0])
            Aff, res, n_ok, hist = zpresni(img, Aff, poly, px_m)
            if res is None or not res:
                raise RuntimeError(f'katastr: málo oken s korelací ({n_ok})')
            mx = max(res); rms = math.sqrt(sum(r * r for r in res) / len(res))
            print(f'   katastr: {len(res)} oken, odchylka max {mx:.2f} m, RMS {rms:.2f} m (průběh {hist})', flush=True)
            ok = iou >= 0.85 and mx <= MAX_CHYBA and len(res) >= 4
            out_dir = os.path.join(ROOT, 'data', 'vykresy', str(kod))
            if os.path.exists(out_dir):
                shutil.rmtree(out_dir)
            rec = {'obec': kod, 'nazev': z['nazev'], 'pdf': z['pdf'], 'verze': z['verze'], 'iou': round(iou, 4), 'meritko': round(mer),
                   'otoceni': rot, 'oken': len(res), 'chyba_max_m': round(mx, 2), 'chyba_rms_m': round(rms, 2), 'prijato': ok,
                   'transformace': [[round(v, 6) for v in r] for r in Aff.tolist()]}
            if ok:
                n_t, size, ext = dlazdice(img, Aff, poly, kod, out_dir)
                rec.update({'dlazdic': n_t, 'kb': round(size / 1024), 'extent3857': [round(v) for v in ext], 'zoom': [min(ZOOMS), max(ZOOMS)]})
                print(f'   dlaždice: {n_t}, {size / 1048576:.1f} MB, {time.time() - t:.0f} s', flush=True)
            else:
                print('   NEPŘIJATO: přesnost nebo překryv mimo limit', flush=True)
            meta[kod] = rec
        except Exception as e:
            import traceback; traceback.print_exc()
            print(f'   CHYBA: {e}', flush=True)
            meta[kod] = {'obec': kod, 'nazev': z['nazev'], 'pdf': z['pdf'], 'verze': z['verze'], 'prijato': False, 'chyba': str(e)[:200]}
        json.dump(sorted(meta.values(), key=lambda m: m['obec']), open(meta_f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    sys.exit(main())
