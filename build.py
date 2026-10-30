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

# Výkresy z PDF (scripts/vykresy.py): obce bez mapové služby, hlavní výkres vlícovaný z PDF a rozřezaný na dlaždice
vyk_f = os.path.join(ROOT, 'data/vykresy.json')
pok_kraj = {}
if os.path.exists(os.path.join(ROOT, 'data/pokryti.json')):
    pok_kraj = {r[0]: r[2] for r in json.load(open(os.path.join(ROOT, 'data/pokryti.json'), encoding='utf-8'))['obce']}
vykresy = [v for v in (json.load(open(vyk_f, encoding='utf-8')) if os.path.exists(vyk_f) else []) if v.get('prijato')]
# poznámka ke kartě (třeba části plánu zrušené soudem) a stránka obce s dokumenty jsou v seznamu zdrojů
vyk_zdroje = {z['obec']: z for z in json.load(open(os.path.join(ROOT, 'data/vykresy_zdroje.json'), encoding='utf-8'))}
for v in vykresy:
    z = vyk_zdroje.get(v['obec'], {})
    links = ([{'label': f'Hlavní výkres v PDF, {c["nazev"]}', 'url': c['pdf']} for c in v['casti']] if v.get('casti')
             else [{'label': 'Výkresy v ZIPu (hlavní výkres v PDF)' if v.get('zip') else 'Hlavní výkres v PDF', 'url': v['pdf']}])
    if z.get('web'):
        home = z['web'].rstrip('/').count('/') <= 2          # jen titulní stránka webu
        links.append({'label': 'Web obce' if home else 'Územní plán na webu obce', 'url': z['web']})
    regional.append({
        'kraj': pok_kraj.get(v['obec']), 'obec': v['obec'], 'name': f'výkres z PDF: {v["nazev"]}',
        'from': f'z hlavního výkresu ({v["verze"]}), který jsme vlícovali z PDF obce',
        'obce': 1, 'drawing': True, 'attribution': f'Výkres ÚP © {v["nazev"]}',
        'pdf': {'url': v['pdf'], 'verze': v['verze'], 'chyba': v['chyba_max_m'], 'oken': v['oken']},
        'links': links, **({'versionNote': z['poznamka']} if z.get('poznamka') else {}),
        'layers': [{'kind': 'tiles3857', 'url': f'vykresy/{v["obec"]}/{{z}}/{{x}}/{{y}}.webp', 'maxZoom': v['zoom'][1], 'minZoom': 11.6,
                    'extentCrs': 'EPSG:3857', 'extent': v['extent3857']}]
    })

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

os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
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


cov_stats = None
if os.path.exists(pok_f):
    pok = json.load(open(pok_f, encoding='utf-8'))
    stav = json.load(open(stav_f, encoding='utf-8'))['obce'] if os.path.exists(stav_f) else {}
    names = {c['name']: i for i, c in enumerate(regional)}
    rec, cnt, pop = {}, {}, {}
    for kod, nazev, kraj, orp, oby, z, zname in pok['obce']:
        s = stav.get(str(kod)) or ['?', None, None, 0, None, False, None]
        plan = s[1] if s[1] and ' '.join(s[1].split()) not in (f'Územní plán {nazev}', f'Územní plán obce {nazev}') else 0
        ri = names.get(zname, -1)
        kat = kategorie(z, regional[ri] if ri >= 0 else None, s[0])
        rec[str(kod)] = [z, ri, s[0], plan, s[2] or 0, s[3] or 0, s[4] or 0, 1 if s[5] else 0, s[6] or 0, kat, nazev, oby]
        cnt[kat] = cnt.get(kat, 0) + 1
        pop[kat] = pop.get(kat, 0) + (oby or 0)
    cov_stats = (cnt, pop)
    obce_out = {'stav': pok['stav'], 'stavUP': json.load(open(stav_f, encoding='utf-8'))['stav'] if os.path.exists(stav_f) else None, 'o': rec}
    with open(os.path.join(ROOT, 'dist/obce.json'), 'w', encoding='utf-8') as f:
        json.dump(obce_out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'dist/obce.json: {os.path.getsize(os.path.join(ROOT, "dist/obce.json"))/1024:.0f} KB, kategorie {cnt}')

olcss = rd('src/vendor/ol.css')  # OpenLayers 10.10.0, ol.css

html = rd('src/index.template.html')
html = html.replace('{{OLCSS}}', olcss).replace('{{CSS}}', rd('src/style.css'))
html = html.replace('{{DATA}}', data_js).replace('{{PLAIN}}', rd('src/plain.js')).replace('{{APP}}', rd('src/app.js'))
if cov_stats:
    # stejné texty jako renderCoverageNumbers() v app.js, ať se úvod po načtení obce.json nezmění
    fmt = lambda v: f'{v:,}'.replace(',', '\u00a0')
    n, pop = cov_stats
    alln, allp = sum(n.values()), sum(pop.values())
    in_map = sum(n.get(k, 0) for k in 'nkmp')
    pct = round(100 * sum(pop.get(k, 0) for k in 'nkmp') / allp)
    barvy = [('n', 'Jednotný standard', (46, 125, 50)), ('k', 'Data kraje', (62, 115, 196)), ('m', 'Data města nebo ORP', (123, 92, 196)),
             ('p', 'Výkres z PDF', (204, 140, 40)), ('d', 'Jen v dokumentech', (176, 170, 156)), ('x', 'Bez územního plánu v evidenci', (200, 84, 80))]
    bar = ''.join(f'<span title="{label}" style="width:{100 * n.get(k, 0) / alln:.2f}%;background:rgba({r},{g},{bl},0.92)"></span>' for k, label, (r, g, bl) in barvy)
    html = html.replace('<span class="cov-big num" id="covN">381</span><span class="cov-of" id="covOf">obcí z <span class="num" id="covTotal">6 258</span> už má územní plán v jednotných datech</span>',
                        f'<span class="cov-big num" id="covN" data-final="1">{fmt(in_map)}</span><span class="cov-of" id="covOf">obcí z <span class="num">{fmt(alln)}</span> má územní plán přímo v mapě, žije v nich {pct} % obyvatel</span>')
    html = html.replace('<div class="cov-bar" aria-hidden="true" id="covBarBox"><span id="covBar" style="width:5.5%"></span><span id="covBarReg" class="reg" style="width:0"></span></div>',
                        f'<div class="cov-bar" aria-hidden="true" id="covBarBox">{bar}</div>')
    html = html.replace('<p id="covRest">U dalších obcí ukážeme výkres z dat krajů a měst. U zbytku karta řekne, jestli obec platný plán má, a pošle vás na dokumenty.</p>',
                        f'<p id="covRest">V jednotném standardu s plným výkladem je {fmt(n.get("n", 0))} obcí, ostatní ukazujeme z dat krajů, měst a ORP. '
                        f'U dalších {fmt(n.get("d", 0) + n.get("x", 0))} obcí karta řekne, jestli obec platný plán má, a pošle vás na dokumenty.</p>')

os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
out = os.path.join(ROOT, 'dist/index.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)
print(f'{out}: {len(html)/1024:.1f} KB, obcí {len(cov)}, ploch {plochy_total}, obcí se staršími verzemi {len(sup)}')

# Hranice obcí pro mapu pokrytí (scripts/hranice.py), appka je načte až při zapnutí mapy pokrytí
hr_f = os.path.join(ROOT, 'data/hranice_obci.json')
if os.path.exists(hr_f):
    shutil.copyfile(hr_f, os.path.join(ROOT, 'dist/hranice.json'))

# Dlaždice výkresů z PDF
vyk_dir, vyk_out = os.path.join(ROOT, 'data/vykresy'), os.path.join(ROOT, 'dist/vykresy')
if os.path.exists(vyk_out):
    shutil.rmtree(vyk_out)
if vykresy and os.path.isdir(vyk_dir):
    for v in vykresy:
        src = os.path.join(vyk_dir, str(v['obec']))
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(vyk_out, str(v['obec'])))
    print(f'dist/vykresy: {len(vykresy)} obcí, {sum(v.get("kb", 0) for v in vykresy) / 1024:.1f} MB dlaždic')
