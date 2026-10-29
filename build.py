#!/usr/bin/env python3
"""Sestaví jednosouborovou appku dist/index.html ze zdrojů v src/ a dat v data/."""
import json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))

def rd(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()

std = json.load(open(os.path.join(ROOT, 'data/standard_ploch.json'), encoding='utf-8'))
obce = json.load(open(os.path.join(ROOT, 'data/obce_snapshot.json'), encoding='utf-8'))
ver = json.load(open(os.path.join(ROOT, 'data/verze_snapshot.json'), encoding='utf-8'))
kraje = json.load(open(os.path.join(ROOT, 'data/kraje.json'), encoding='utf-8'))
regional = json.load(open(os.path.join(ROOT, 'data/regionalni_mozaiky.json'), encoding='utf-8'))

vmap = {r[0]: r for r in ver['res']}
cov, sup, plochy_total = [], {}, 0
for o in obce['obce']:
    kod = o[0]
    v = vmap.get(kod)
    count = v[4] if v and len(v) > 4 else 0
    if not count:
        continue  # obec má jen řešené území, žádné plochy
    cov.append([kod, o[1], o[2], o[3], o[4], o[5], o[6], count])
    plochy_total += count
    if v and v[3]:
        sup[str(kod)] = v[3]
okr = {str(k): [n, kr] for k, n, kr in obce['okresy']}
# osiřelé balíčky bez řešeného území: starší verze téže obce
sup_extra = [39888, 39898, 39909]

data_js = (
    'const STD = ' + json.dumps(std, ensure_ascii=False, separators=(',', ':')) + ';\n'
    'const COV = ' + json.dumps(cov, ensure_ascii=False, separators=(',', ':')) + ';\n'
    'const OKR = ' + json.dumps(okr, ensure_ascii=False, separators=(',', ':')) + ';\n'
    'const KRAJE = ' + json.dumps(kraje, ensure_ascii=False, separators=(',', ':')) + ';\n'
    'const SUP = ' + json.dumps(sup, separators=(',', ':')) + ';\n'
    'const SUP_EXTRA = ' + json.dumps(sup_extra) + ';\n'
    'const REGIONAL = ' + json.dumps(regional, ensure_ascii=False, separators=(',', ':')) + ';\n'
    'const SNAP = ' + json.dumps({'date': '22. 10. 2026', 'plochy': plochy_total}, ensure_ascii=False) + ';\n'
)

olcss = rd('src/vendor/ol.css')  # OpenLayers 10.10.0, ol.css

html = rd('src/index.template.html')
html = html.replace('{{OLCSS}}', olcss).replace('{{CSS}}', rd('src/style.css'))
html = html.replace('{{DATA}}', data_js).replace('{{PLAIN}}', rd('src/plain.js')).replace('{{APP}}', rd('src/app.js'))

os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
out = os.path.join(ROOT, 'dist/index.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)
print(f'{out}: {len(html)/1024:.1f} KB, obcí {len(cov)}, ploch {plochy_total}, obcí se staršími verzemi {len(sup)}')
