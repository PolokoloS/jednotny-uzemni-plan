#!/usr/bin/env python3
"""Pokrytí obcí: odkud má každá obec z RÚIAN data v mapě.

Pro každou obec zjistí zdroj, který ji v mapě ukáže:
  n  jednotná data v NGÚP
  m  vlastní data města (záznam s `obec` v data/regionalni_mozaiky.json)
  k  data kraje s typem plochy pro kartu
  v  data kraje jen jako výkres (bez typu plochy)
  p  výkres z PDF (data/vykresy, viz scripts/vykresy.py)
  -  nic
Krajská a městská data se ověřují dotazem na bod hlavní části obce (definiční bod části obce
se stejným názvem jako obec): u dotazů na plochu počet nalezených ploch, u výkresů jestli obrázek
v okolí bodu není prázdný.

Výstup: data/pokryti.json (pro appku) a docs/pokryti.md (díry po krajích a ORP podle počtu obyvatel).
Spuštění: python scripts/pokryti.py [--kraj 86] [--workers 4]
Potřebuje Pillow (pip install pillow).
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import io
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUIAN = 'https://ags.cuzk.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/'
NGUP = 'https://mapy.gov.cz/server/rest/services/UPD/DUP_HLV/MapServer/'
UA = 'Mozilla/5.0 (pokryti obci; Jednotny uzemni plan)'
TIMEOUT = 40


def get(url, raw=False, tries=2):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                body = r.read()
                return body if raw else json.loads(body.decode('utf-8', 'replace'))
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):
                raise
            last = e
        except Exception as e:  # síť, timeout
            last = e
        time.sleep(1.5 * (i + 1))
    raise last


def query_all(base, where='1=1', fields='*', extra=''):
    """Všechny záznamy vrstvy ArcGIS (stránkuje přes resultOffset)."""
    out, off = [], 0
    while True:
        q = f'{base}/query?where={urllib.parse.quote(where)}&outFields={fields}&returnGeometry={"true" if "outSR" in extra else "false"}{extra}&resultOffset={off}&resultRecordCount=2000&orderByFields=objectid&f=json'
        d = get(q)
        feats = d.get('features', [])
        out += feats
        if not d.get('exceededTransferLimit') or not feats:
            return out
        off += len(feats)


def fold(s):
    return unicodedata.normalize('NFD', str(s or '').lower()).encode('ascii', 'ignore').decode()


# ---------------------------------------------------------------------------
# RÚIAN: obce, ORP, okresy, kraje, body hlavních částí obcí
# ---------------------------------------------------------------------------
def load_ruian():
    print('RÚIAN: obce, ORP, okresy, kraje, části obcí', flush=True)
    obce = {f['attributes']['kod']: f['attributes'] for f in query_all(RUIAN + '12', fields='kod,nazev,okres,pou')}
    pou = {f['attributes']['kod']: f['attributes']['orp'] for f in query_all(RUIAN + '13', fields='kod,orp')}
    orp = {f['attributes']['kod']: f['attributes'] for f in query_all(RUIAN + '14', fields='kod,nazev,vusc')}
    okresy = {f['attributes']['kod']: f['attributes'] for f in query_all(RUIAN + '15', fields='kod,nazev,vusc')}
    kraje = {f['attributes']['kod']: f['attributes']['nazev'] for f in query_all(RUIAN + '17', fields='kod,nazev')}
    pts = {}
    for sr in (5514, 4326):
        for f in query_all(RUIAN + '11', fields='kod,nazev,obec', extra=f'&outSR={sr}'):
            a, g = f['attributes'], f.get('geometry') or {}
            if 'x' not in g:
                continue
            pts.setdefault(a['kod'], {'obec': a['obec'], 'nazev': a['nazev']})[sr] = (g['x'], g['y'])
    main = {}
    for p in pts.values():
        o = obce.get(p['obec'])
        if not o or 5514 not in p or 4326 not in p:
            continue
        same = fold(p['nazev']) == fold(o['nazev'])
        if p['obec'] not in main or (same and not main[p['obec']][0]):
            main[p['obec']] = (same, p[5514], p[4326])
    for k, o in obce.items():
        o['orp'] = pou.get(o['pou'])
        # Praha nemá v RÚIAN okres, kraj se vezme z ORP
        o['kraj'] = (okresy.get(o['okres']) or {}).get('vusc') or (orp.get(o['orp']) or {}).get('vusc')
        m = main.get(k)
        o['p5514'], o['p4326'] = (m[1], m[2]) if m else (None, None)
    print(f'  {len(obce)} obcí, {len(orp)} ORP, {len(kraje)} krajů, bez bodu {sum(1 for o in obce.values() if not o["p5514"])}', flush=True)
    return obce, orp, okresy, kraje


# ---------------------------------------------------------------------------
# NGÚP: obce s jednotnými daty (stejně jako refreshCoverage v app.js)
# ---------------------------------------------------------------------------
def load_ngup():
    print('NGÚP: obce s jednotnými daty', flush=True)
    pk = query_all(NGUP + '13', fields='obec_kod,id_metadata')
    stats = urllib.parse.quote(json.dumps([{'statisticType': 'count', 'onStatisticField': 'objectid', 'outStatisticFieldName': 'n'}]))
    st = get(f'{NGUP}12/query?f=json&where=1%3D1&groupByFieldsForStatistics=id_metadata&outStatistics={stats}')
    cnt = {int(f['attributes']['id_metadata']): int(f['attributes']['n']) for f in st.get('features', [])}
    covered = {int(f['attributes']['obec_kod']) for f in pk if cnt.get(int(f['attributes']['id_metadata']), 0) > 0}
    print(f'  {len(covered)} obcí', flush=True)
    return covered


# ---------------------------------------------------------------------------
# Ověření krajských a městských dat v bodě
# ---------------------------------------------------------------------------
def nonblank(img_bytes, cx=None, cy=None, r=None):
    """Podíl pixelů, které nejsou průhledné ani bílé (v okně kolem cx, cy)."""
    from PIL import Image
    im = Image.open(io.BytesIO(img_bytes)).convert('RGBA')
    w, h = im.size
    if cx is None:
        box = (0, 0, w, h)
    else:
        box = (max(0, int(cx - r)), max(0, int(cy - r)), min(w, int(cx + r)), min(h, int(cy + r)))
    crop = im.crop(box)
    px = list(crop.get_flattened_data() if hasattr(crop, 'get_flattened_data') else crop.getdata())
    if not px:
        return 0.0
    full = sum(1 for (R, G, B, A) in px if A > 40 and not (R > 245 and G > 245 and B > 245))
    return full / len(px)


def probe_query(url, ll, where=None):
    q = (f'{url}/query?geometry={ll[0]:.6f},{ll[1]:.6f}&geometryType=esriGeometryPoint&inSR=4326'
         f'&spatialRel=esriSpatialRelIntersects&returnCountOnly=true&f=json')
    if where:
        q += '&where=' + urllib.parse.quote(where)
    d = get(q)
    if 'error' in d:
        raise RuntimeError(d['error'].get('message'))
    return int(d.get('count', 0)) > 0


def probe_tiles5514(L, xy):
    res = L['resolutions']
    # úroveň kolem 4 m/px: výkres je na ní čitelný a bývá nacachovaný v celé mozaice
    z = min(range(len(res)), key=lambda i: abs(math.log(res[i] / 4.0)))
    ts = L.get('tileSize', 256)
    ox, oy = L['origin']
    fx, fy = (xy[0] - ox) / (res[z] * ts), (oy - xy[1]) / (res[z] * ts)
    col, row = int(math.floor(fx)), int(math.floor(fy))
    url = L['url'].replace('{zz}', f'{z:02d}').replace('{z}', str(z)).replace('{y}', str(row)).replace('{x}', str(col))
    try:
        img = get(url, raw=True)
    except urllib.error.HTTPError:
        return False
    return nonblank(img, (fx - col) * ts, (fy - row) * ts, 24) > 0.05


def probe_tiles3857(L, ll):
    z = min(L.get('maxZoom', 19), 15)
    n = 2 ** z
    fx = (ll[0] + 180) / 360 * n
    lat = math.radians(ll[1])
    fy = (1 - math.log(math.tan(lat) + 1 / math.cos(lat)) / math.pi) / 2 * n
    col, row = int(fx), int(fy)
    url = L['url'].replace('{a-c}', 'a').replace('{z}', str(z)).replace('{y}', str(row)).replace('{x}', str(col))
    try:
        img = get(url, raw=True)
    except urllib.error.HTTPError:
        return False
    return nonblank(img, (fx - col) * 256, (fy - row) * 256, 24) > 0.05


def probe_export(L, xy, image=False):
    d = 250
    p = {'bbox': f'{xy[0]-d},{xy[1]-d},{xy[0]+d},{xy[1]+d}', 'bboxSR': 5514, 'imageSR': 5514, 'size': '64,64', 'f': 'image'}
    if image:
        p.update({'format': 'png'})
    else:
        p.update({'format': 'png32', 'transparent': 'true'})
    for k, v in (L.get('params') or {}).items():
        p[k] = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    url = L['url'].rstrip('/') + ('/exportImage?' if image else '/export?') + urllib.parse.urlencode(p)
    return nonblank(get(url, raw=True)) > 0.05


def to3857(ll):
    return (ll[0] * 20037508.342789 / 180, math.log(math.tan((90 + ll[1]) * math.pi / 360)) * 6378137)


def probe_wms(L, xy, ll):
    # kolem 3 m na pixel: některé WMS (JÚAP) kreslí plány jen v podrobném měřítku
    d = 150
    p = {'SERVICE': 'WMS', 'REQUEST': 'GetMap', 'VERSION': L.get('version', '1.3.0'), 'LAYERS': L['params']['LAYERS'],
         'STYLES': L['params'].get('STYLES', ''), 'FORMAT': 'image/png', 'TRANSPARENT': 'TRUE', 'WIDTH': 100, 'HEIGHT': 100}
    crs = L.get('crs', 'EPSG:5514')
    c = to3857(ll) if crs == 'EPSG:3857' else xy
    p['CRS' if p['VERSION'] == '1.3.0' else 'SRS'] = crs
    p['BBOX'] = f'{c[0]-d},{c[1]-d},{c[0]+d},{c[1]+d}'
    for k, v in (L['params'] or {}).items():
        p.setdefault(k, v)
    # čárky a dvojtečky nekódovat: dlouhé seznamy vrstev by přelezly limit délky adresy
    url = L['url'] + ('&' if '?' in L['url'] else '?') + urllib.parse.urlencode(p, safe=',:')
    return nonblank(get(url, raw=True)) > 0.05


def probe_tilecache(L, xy):
    ext, res = L['gridExtent'], L['resolutions']
    z = min(range(len(res)), key=lambda i: abs(math.log(res[i] / 2.0)))
    span = res[z] * 256
    tx, ty = int((xy[0] - ext[0]) // span), int((xy[1] - ext[1]) // span)
    trip = lambda n: '{:09d}'.format(n)[0:3] + '/' + '{:09d}'.format(n)[3:6] + '/' + '{:09d}'.format(n)[6:9]
    url = L['url'].replace('{z}', '{:02d}'.format(z)).replace('{x}', trip(tx)).replace('{y}', trip(ty))
    try:
        img = get(url, raw=True)
    except urllib.error.HTTPError:
        return False
    return nonblank(img) > 0.05


SLUG = lambda s: re.sub(r'^_|_$', '', re.sub(r'[^a-z0-9]+', '_', fold(s)))


def perobec_names(L, cache={}):
    if L['base'] not in cache:
        d = get(L['base'].rstrip('/') + '?f=json')
        cache[L['base']] = {str(x['name']).split('/')[-1].lower(): str(x['name']).split('/')[-1] for x in d.get('services', [])}
    return cache[L['base']]


def probe_perobec(L, o):
    names = perobec_names(L)
    suf = (L.get('okresy') or {}).get(str(o['okres']))
    svc = names.get((SLUG(o['nazev']) + '_' + (suf or '')).lower()) or names.get(SLUG(o['nazev']).lower())
    if not svc:
        return False
    d = get(f"{L['base']}{urllib.parse.quote(svc)}/MapServer/layers?f=json")
    return any(re.search(r'hlavn|funkčn|využití|urbanist|koordina', str(l.get('name', '')), re.I) for l in d.get('layers', []))


def probe_tiles_obec(L, o, xy):
    it = (L.get('obce') or {}).get(str(o['kod']))
    if not it:
        return False
    for url in (it[0] if isinstance(it[0], list) else [it[0]]):
        if L.get('crs') == 'EPSG:3857':
            if probe_tiles3857(dict(L, url=url), o['p4326']):
                return True
        elif probe_tiles5514(dict(L, url=url), xy):
            return True
    return False


def probe_source(cfg, o):
    """Vrátí 'k' (typ plochy), 'v' (jen výkres) nebo None."""
    ll, xy = o['p4326'], o['p5514']
    if not ll or o['kod'] in (cfg.get('skip') or []) or (cfg.get('only') and o['kod'] not in cfg['only']):
        return None
    for inf in cfg.get('info', []):
        try:
            if probe_query(inf['url'], ll, inf.get('where')):
                return 'k'
        except Exception:
            pass
    for L in cfg['layers']:
        try:
            k = L['kind']
            ok = (probe_tiles5514(L, xy) if k == 'tiles5514' else
                  probe_tiles3857(L, ll) if k == 'tiles3857' else
                  probe_export(L, xy) if k == 'arcgisExport' else
                  probe_export(L, xy, image=True) if k == 'arcgisImage' else
                  probe_perobec(L, o) if k == 'arcgisPerObec' else
                  probe_tiles_obec(L, o, xy) if k == 'tilesPerObec' else
                  probe_query(L['url'], ll) if k == 'arcgisVector' else
                  probe_wms(L, xy, ll) if k == 'wms' else
                  probe_tilecache(L, xy) if k == 'tilecache' else False)
        except Exception:
            ok = False
        if ok:
            return 'k' if k == 'arcgisVector' else 'v'
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--kraj', type=int, action='append', help='ověřit jen krajská data tohoto kraje (kód VÚSC), ostatní převzít z minulého běhu')
    ap.add_argument('--workers', type=int, default=4)
    args = ap.parse_args()

    obce, orp, okresy, kraje = load_ruian()
    ngup = load_ngup()
    regional = json.load(open(os.path.join(ROOT, 'data', 'regionalni_mozaiky.json'), encoding='utf-8'))
    pop = {int(k): v for k, v in json.load(open(os.path.join(ROOT, 'data', 'obyvatele_2026.json'), encoding='utf-8'))['obce'].items()}
    vykresy_f = os.path.join(ROOT, 'data', 'vykresy.json')
    vykresy = {int(v['obec']): v['nazev'] for v in json.load(open(vykresy_f, encoding='utf-8')) if v.get('prijato')} if os.path.exists(vykresy_f) else {}
    prev = {}
    out_f = os.path.join(ROOT, 'data', 'pokryti.json')
    if args.kraj and os.path.exists(out_f):
        prev = {r[0]: r for r in json.load(open(out_f, encoding='utf-8'))['obce']}

    zdroj = {k: ('n', 'NGÚP') if k in ngup else None for k in obce}
    city = {c['obec']: c for c in regional if c.get('obec')}
    jobs = []
    for k, o in obce.items():
        if zdroj[k]:
            continue
        if k in city:
            jobs.append((k, city[k], 'm'))
            continue
        for c in regional:
            if not c.get('obec') and c.get('kraj') == o['kraj']:
                if args.kraj and o['kraj'] not in args.kraj and k in prev:
                    zdroj[k] = (prev[k][5], prev[k][6]) if prev[k][5] in ('k', 'v') else None
                    break
                jobs.append((k, c, 'kraj'))
    print(f'Ověřuji {len(jobs)} dvojic obec a zdroj v datech krajů a měst', flush=True)
    done, hits = 0, {}
    order = {id(c): i for i, c in enumerate(regional)}
    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(probe_source, c, obce[k]): (k, c, kind) for k, c, kind in jobs}
        for f in cf.as_completed(futs):
            k, c, kind = futs[f]
            r = f.result()
            done += 1
            if r:
                hits.setdefault(k, []).append((order[id(c)], 'm' if kind == 'm' else r, c['name']))
            if done % 250 == 0:
                print(f'  {done}/{len(jobs)}', flush=True)
    # víc zdrojů pro jednu obec: vyhrává ten, který je v konfiguraci dřív (stejně jako v appce)
    for k, hs in hits.items():
        if not zdroj[k]:
            hs.sort()
            zdroj[k] = (hs[0][1], hs[0][2])
    # výkres z PDF má přednost před krajskou mozaikou (bere se jen tam, kde aktuální služba není), NGÚP před ním
    for k, naz in vykresy.items():
        if k in zdroj and (not zdroj[k] or zdroj[k][0] in ('k', 'v')):
            zdroj[k] = ('p', f'výkres z PDF: {naz}')

    rows = []
    for k, o in sorted(obce.items()):
        z = zdroj[k] or ('-', '')
        rows.append([k, o['nazev'], o['kraj'], o['orp'], pop.get(k, 0), z[0], z[1]])
    data = {
        'stav': dt.date.today().isoformat(),
        'popis': 'Pro každou obec: [kód, název, kraj (VÚSC), ORP, obyvatel k 1. 1. 2026, zdroj, název zdroje]. '
                 'Zdroj: n NGÚP, m město, k kraj s typem plochy, v kraj jen výkres, p výkres z PDF, - nic.',
        'kraje': {str(k): v for k, v in sorted(kraje.items())},
        'orp': {str(k): [v['nazev'], v['vusc']] for k, v in sorted(orp.items())},
        'obce': rows
    }
    with open(out_f, 'w', encoding='utf-8') as f:
        f.write('{\n')
        for i, key in enumerate(['stav', 'popis', 'kraje', 'orp']):
            f.write(f' {json.dumps(key)}: {json.dumps(data[key], ensure_ascii=False, separators=(",", ":"))},\n')
        f.write(' "obce": [\n' + ',\n'.join('  ' + json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows) + '\n ]\n}\n')
    write_report(data)


def fmt(n):
    return f'{n:,}'.replace(',', ' ')


def write_report(data):
    rows, kraje, orp = data['obce'], data['kraje'], data['orp']
    labels = {'n': 'jednotná data NGÚP', 'm': 'data města', 'k': 'kraj, typ plochy', 'v': 'kraj, jen výkres', 'p': 'výkres z PDF', '-': 'nic'}
    tot = {z: [0, 0] for z in labels}
    for r in rows:
        tot[r[5]][0] += 1
        tot[r[5]][1] += r[4]
    L = [f'# Pokrytí obcí ({data["stav"]})', '',
         'Vytváří `python scripts/pokryti.py`. Zdroj u každé obce je ověřený dotazem na bod hlavní části obce. Počty obyvatel ČSÚ k 1. 1. 2026.', '',
         '| Zdroj | Obcí | Obyvatel |', '|---|---:|---:|']
    for z, lab in labels.items():
        L.append(f'| {lab} | {fmt(tot[z][0])} | {fmt(tot[z][1])} |')
    L.append(f'| **celkem** | **{fmt(len(rows))}** | **{fmt(sum(r[4] for r in rows))}** |')
    L += ['', '## Po krajích', '', '| Kraj | Obcí | S plánem v mapě | Bez dat | Obyvatel bez dat |', '|---|---:|---:|---:|---:|']
    for kk, kn in kraje.items():
        rs = [r for r in rows if str(r[2]) == kk]
        no = [r for r in rs if r[5] == '-']
        L.append(f'| {kn} | {len(rs)} | {len(rs) - len(no)} | {len(no)} | {fmt(sum(r[4] for r in no))} |')
    L += ['', '## Obce bez dat po krajích a ORP', '', 'Seřazeno podle počtu obyvatel bez dat, u každého ORP největší obce.', '']
    for kk, kn in kraje.items():
        no = [r for r in rows if str(r[2]) == kk and r[5] == '-']
        if not no:
            continue
        L.append(f'### {kn}: {len(no)} obcí, {fmt(sum(r[4] for r in no))} obyvatel')
        L.append('')
        by = {}
        for r in no:
            by.setdefault(r[3], []).append(r)
        for ok, rs in sorted(by.items(), key=lambda kv: -sum(r[4] for r in kv[1])):
            rs.sort(key=lambda r: -r[4])
            names = ', '.join(f'{r[1]} ({fmt(r[4])})' for r in rs[:12]) + (f' a dalších {len(rs) - 12}' if len(rs) > 12 else '')
            L.append(f'- ORP {orp.get(str(ok), ["?"])[0]}: {len(rs)} obcí, {fmt(sum(r[4] for r in rs))} obyv. {names}')
        L.append('')
    os.makedirs(os.path.join(ROOT, 'docs'), exist_ok=True)
    with open(os.path.join(ROOT, 'docs', 'pokryti.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(L) + '\n')
    print('\n'.join(L[:16]))


if __name__ == '__main__':
    sys.exit(main())
