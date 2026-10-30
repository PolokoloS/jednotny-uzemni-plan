#!/usr/bin/env python3
"""Stav územního plánu každé obce podle evidence NGÚP (uzemniplanovani.gov.cz).

Pro každou obec z RÚIAN se zeptá API portálu NGÚP na dokumentaci typu územní plán a určí:
  platný plán: nejnovější vydaný nový plán (TPL_NEW ve stavu ISSUED) s datem účinnosti,
  počet vydaných změn po něm a datum poslední,
  jestli se pořizuje nový plán nebo změna (IN_PROGRESS),
  odkaz na web, který obec uvedla u plánu (externalUrl).
Výstup: data/stav_up.json {kod: [stav, název plánu, účinnost, změn, poslední změna, pořizuje se, web]}
  stav: "p" platný plán v evidenci, "x" žádný vydaný plán v evidenci, "?" dotaz selhal.
Spuštění: python scripts/stav_up.py [--workers 6]
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import json
import os
import re
import sys
import tempfile
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = 'https://uzemniplanovani.gov.cz/o/rest/ais/dup/'
RUIAN = 'https://ags.cuzk.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/12/query'
UA = 'Mozilla/5.0 (stav uzemnich planu; Jednotny uzemni plan)'


def get(url, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            last = e
            time.sleep(2 * (i + 1))
    raise last


def stav(kod):
    d = get(f'{API}byTerritory/v2?codeMunicipality={kod}&type=TERRITORIAL_PLAN&startIndex=0&itemsCount=300')
    items = d.get('items') or []
    new = sorted([i for i in items if i['subType']['id'] == 'TPL_NEW' and i['state']['id'] == 'ISSUED' and i.get('entryIntoEffect')],
                 key=lambda i: i['entryIntoEffect'])
    prog = any(i['state']['id'] == 'IN_PROGRESS' for i in items)
    if not new:
        # původní plán v evidenci chybí, vydané změny ale ano (Kuřim, Hrádek nad Nisou): obec plán má.
        # Výjimka: změny starého plánu (ÚPO, ÚPnSÚ, ÚPM) vydané před rokem 2023, takový plán bez úpravy
        # podle nového zákona skončil 31. 12. 2022.
        ch = sorted((i for i in items if i['subType']['id'] == 'TPL_CHANGE' and i['state']['id'] == 'ISSUED' and i.get('entryIntoEffect')),
                    key=lambda i: i['entryIntoEffect'])
        old = ch and re.search(r'ÚPO|ÚPN ?SÚ|ÚPnSÚ|ÚPM|územní(ho)? plán(u)? obce|sídelního útvaru', ch[-1]['title'], re.I)
        if not ch or (old and ch[-1]['entryIntoEffect'] < '2023-01-01'):
            return ['x', None, None, 0, None, prog, None]
        nazev = re.sub(r'^\s*změna\s+č\.?\s*[\w.]+\s*(územního plánu|ÚP)?\s*', '', ' '.join(ch[-1]['title'].split()), flags=re.I)
        return ['p', 'Územní plán ' + nazev if nazev and not nazev.lower().startswith('územní') else (nazev or None),
                None, len(ch), ch[-1]['entryIntoEffect'], prog, None]
    main = new[-1]
    ch = sorted(i['entryIntoEffect'] for i in items if i['subType']['id'] == 'TPL_CHANGE' and i['state']['id'] == 'ISSUED'
                and (i.get('entryIntoEffect') or '') > main['entryIntoEffect'])
    web = None
    try:
        det = get(f"{API}v2/{main['id']}")
        web = det.get('externalUrl') or None
    except Exception:
        pass
    return ['p', ' '.join(main['title'].split()), main['entryIntoEffect'], len(ch), ch[-1] if ch else None, prog, web]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--workers', type=int, default=6)
    ap.add_argument('--recheck', action='store_true', help='jen znovu a postupně ověřit obce bez plánu nebo s chybou z minulého běhu')
    args = ap.parse_args()
    path = os.path.join(ROOT, 'data', 'stav_up.json')
    obce = get(f'{RUIAN}?where=1%3D1&outFields=kod&returnGeometry=false&f=json')['features']
    kody = sorted(f['attributes']['kod'] for f in obce)
    print(f'{len(kody)} obcí', flush=True)
    out, done = {}, 0
    if args.recheck:
        out = {int(k): v for k, v in json.load(open(path, encoding='utf-8'))['obce'].items()}
    else:
        with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
            futs = {ex.submit(stav, k): k for k in kody}
            for f in cf.as_completed(futs):
                k = futs[f]
                try:
                    out[k] = f.result()
                except Exception:
                    out[k] = ['?', None, None, 0, None, False, None]
                done += 1
                if done % 500 == 0:
                    print(f'  {done}/{len(kody)}', flush=True)
    def save():
        with open(path, 'w', encoding='utf-8') as f:
            f.write('{\n "stav": ' + json.dumps(dt.date.today().isoformat()) + ',\n')
            f.write(' "popis": "Evidence NGÚP: kód obce -> [p platný plán | x bez vydaného plánu | ? neznámo, název plánu, účinnost, počet změn po něm, poslední změna, pořizuje se nový plán nebo změna, web uvedený u plánu]",\n')
            f.write(' "obce": {\n' + ',\n'.join(f'  "{k}": ' + json.dumps(out[k], ensure_ascii=False, separators=(',', ':')) for k in kody) + '\n }\n}\n')

    if not args.recheck:
        save()
    # Portál při souběžných dotazech občas vrátí prázdný seznam. Obce bez plánu a s chybou proto ověřit znovu postupně.
    # Postup se ukládá průběžně (a potvrzené obce bez plánu do dočasného souboru), takže přerušený běh pokračuje.
    done_f = os.path.join(tempfile.gettempdir(), 'stav_up_overeno.json')
    confirmed = set(json.load(open(done_f))) if args.recheck and os.path.exists(done_f) else set()
    again = [k for k in kody if out.get(k, ['?'])[0] in ('x', '?') and k not in confirmed]
    print(f'Postupné ověření {len(again)} obcí bez plánu nebo s chybou', flush=True)
    for i, k in enumerate(again):
        for attempt in range(2):
            try:
                r = stav(k)
            except Exception:
                r = ['?', None, None, 0, None, False, None]
            if r[0] == 'p' or attempt == 1:
                break
            time.sleep(1.0)
        out[k] = r
        if r[0] == 'x':
            confirmed.add(k)
        time.sleep(0.3)
        if (i + 1) % 20 == 0:
            save()
            json.dump(sorted(confirmed), open(done_f, 'w'))
            print(f'  {i + 1}/{len(again)}', flush=True)
    save()
    json.dump(sorted(confirmed), open(done_f, 'w'))
    cnt = {}
    for v in out.values():
        cnt[v[0]] = cnt.get(v[0], 0) + 1
    print('stav:', cnt)


if __name__ == '__main__':
    sys.exit(main())
