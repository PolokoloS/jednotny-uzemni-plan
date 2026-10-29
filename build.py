#!/usr/bin/env python3
"""Sestaví jednosouborovou appku dist/index.html ze zdrojů v src/ a dat v data/."""
import json, os, shutil, sys

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

# Obce: odkud mají data v mapě (scripts/pokryti.py) a stav územního plánu v evidenci NGÚP (scripts/stav_up.py).
# Appka si soubor načte po startu: vybere podle něj zdroj pro kartu a u obcí bez dat ukáže stav plánu.
# Záznam: [zdroj, index v REGIONAL nebo -1, stav plánu, název plánu nebo 0, účinnost, změn, poslední změna, pořizuje se, web,
#          kategorie pro mapu pokrytí, název obce, obyvatel]
# Kategorie: n jednotný standard, k data kraje, m data města nebo ORP, p výkres z PDF, d jen v dokumentech, x bez ÚP v evidenci
pok_f, stav_f = os.path.join(ROOT, 'data/pokryti.json'), os.path.join(ROOT, 'data/stav_up.json')


def kategorie(z, cfg, stav_planu):
    if z == 'n':
        return 'n'
    if z in ('k', 'v', 'm'):
        if cfg and (cfg.get('obec') or cfg.get('only') or cfg.get('obce') == 1 or any(L.get('obce') for L in cfg['layers'])):
            return 'm'
        return 'k'
    if z == 'p':
        return 'p'
    return 'x' if stav_planu == 'x' else 'd'


if os.path.exists(pok_f):
    pok = json.load(open(pok_f, encoding='utf-8'))
    stav = json.load(open(stav_f, encoding='utf-8'))['obce'] if os.path.exists(stav_f) else {}
    names = {c['name']: i for i, c in enumerate(regional)}
    rec, cnt = {}, {}
    for kod, nazev, kraj, orp, oby, z, zname in pok['obce']:
        s = stav.get(str(kod)) or ['?', None, None, 0, None, False, None]
        plan = s[1] if s[1] and ' '.join(s[1].split()) not in (f'Územní plán {nazev}', f'Územní plán obce {nazev}') else 0
        ri = names.get(zname, -1)
        kat = kategorie(z, regional[ri] if ri >= 0 else None, s[0])
        rec[str(kod)] = [z, ri, s[0], plan, s[2] or 0, s[3] or 0, s[4] or 0, 1 if s[5] else 0, s[6] or 0, kat, nazev, oby]
        cnt[kat] = cnt.get(kat, 0) + 1
    obce_out = {'stav': pok['stav'], 'stavUP': json.load(open(stav_f, encoding='utf-8'))['stav'] if os.path.exists(stav_f) else None, 'o': rec}
    with open(os.path.join(ROOT, 'dist/obce.json'), 'w', encoding='utf-8') as f:
        json.dump(obce_out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'dist/obce.json: {os.path.getsize(os.path.join(ROOT, "dist/obce.json"))/1024:.0f} KB, kategorie {cnt}')

# Hranice obcí pro mapu pokrytí (scripts/hranice.py), appka je načte až při zapnutí mapy pokrytí
hr_f = os.path.join(ROOT, 'data/hranice_obci.json')
if os.path.exists(hr_f):
    shutil.copyfile(hr_f, os.path.join(ROOT, 'dist/hranice.json'))
