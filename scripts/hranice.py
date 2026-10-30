#!/usr/bin/env python3
"""Zjednodušené hranice obcí pro mapu pokrytí: data/hranice_obci.json.

Polygony obcí z RÚIAN ve Web Mercatoru, zjednodušené na straně serveru (maxAllowableOffset) a zaokrouhlené
na mřížku KROK metrů. Souřadnice každého prstence jsou kódované rozdílově (první bod celý, další jako přírůstky),
takže soubor je malý a appka ho načte až při zapnutí mapy pokrytí.
Formát: {"krok": KROK, "o": {"kod": [[x0, y0, dx1, dy1, ...], ...prstence]}}
Spuštění: python scripts/hranice.py [--tolerance 120]
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUIAN = 'https://ags.cuzk.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/12/query'
KROK = 25


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (hranice obci; Jednotny uzemni plan)'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode('utf-8'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tolerance', type=float, default=120)
    args = ap.parse_args()
    kody = sorted(f['attributes']['kod'] for f in get(f'{RUIAN}?where=1%3D1&outFields=kod&returnGeometry=false&f=json')['features'])
    out = {}
    for i in range(0, len(kody), 250):
        chunk = kody[i:i + 250]
        q = (f"{RUIAN}?where={urllib.parse.quote('kod IN (' + ','.join(map(str, chunk)) + ')')}&outFields=kod&returnGeometry=true"
             f"&outSR=3857&maxAllowableOffset={args.tolerance}&geometryPrecision=0&f=json")
        for f in get(q)['features']:
            rings = []
            for ring in (f.get('geometry') or {}).get('rings', []):
                pts, prev = [], None
                for x, y in ring:
                    q2 = (round(x / KROK), round(y / KROK))
                    if q2 != prev:
                        pts.append(q2)
                        prev = q2
                if len(pts) < 4:
                    continue
                enc = [pts[0][0], pts[0][1]]
                for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                    enc += [x1 - x0, y1 - y0]
                rings.append(enc)
            if rings:
                out.setdefault(str(f['attributes']['kod']), []).extend(rings)
        print(f'  {min(i + 250, len(kody))}/{len(kody)}', flush=True)
    path = os.path.join(ROOT, 'data', 'hranice_obci.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'krok': KROK, 'zdroj': f'RÚIAN, ČÚZK; zjednodušeno na {args.tolerance:g} m', 'o': out}, fh, separators=(',', ':'))
    print(f'{path}: {os.path.getsize(path) / 1024:.0f} KB, obcí {len(out)}')


if __name__ == '__main__':
    sys.exit(main())
