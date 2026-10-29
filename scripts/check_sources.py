#!/usr/bin/env python3
"""Zkontroluje, že odpovídají všechny krajské a městské služby z data/regionalni_mozaiky.json.

U dlaždic a služeb ArcGIS se ptá na popis služby (?f=json), u dotazů pro kartu na popis vrstvy.
Výstup: tabulka na stdout, volitelně Markdown report (--markdown soubor). Návratový kód 1, když něco nefunguje.

Spuštění: python scripts/check_sources.py [--markdown report.md] [--dry-run]
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, 'data', 'regionalni_mozaiky.json')
UA = 'Mozilla/5.0 (kontrola zdroju; Jednotny uzemni plan)'
TIMEOUT = 40


def service_root(url):
    """Z adresy dlaždic nebo vrstvy udělá adresu služby, kterou jde poslat ?f=json."""
    url = re.sub(r'/tile/\{z\}/\{y\}/\{x\}.*$', '', url)
    return url.rstrip('/')


def targets(cfg):
    who = cfg.get('name') or str(cfg.get('kraj'))
    for i, layer in enumerate(cfg.get('layers', [])):
        url = layer.get('base') if layer.get('kind') == 'arcgisPerObec' else layer.get('url')
        if url:
            yield who, f"vrstva {i + 1} ({layer.get('kind')})", service_root(url)
    for i, info in enumerate(cfg.get('info', [])):
        yield who, f'dotaz na plochu {i + 1}', service_root(info['url'])
    for i, doc in enumerate(cfg.get('doc', [])):
        yield who, f'dokumentace {i + 1}', service_root(doc['url'])


def check(url):
    req = urllib.request.Request(url + ('&' if '?' in url else '?') + 'f=json', headers={'User-Agent': UA})
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = r.read()
            ms = int((time.time() - started) * 1000)
            try:
                data = json.loads(body.decode('utf-8', 'replace'))
            except ValueError:
                return False, f'odpověď není JSON (HTTP {r.status})', ms
            if isinstance(data, dict) and data.get('error'):
                err = data['error']
                return False, f"chyba služby: {err.get('code', '')} {err.get('message', '')}".strip(), ms
            return True, 'ok', ms
    except urllib.error.HTTPError as e:
        return False, f'HTTP {e.code}', int((time.time() - started) * 1000)
    except Exception as e:  # síť, DNS, timeout, TLS
        return False, f'{type(e).__name__}: {e}', int((time.time() - started) * 1000)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--markdown', help='uloží report v Markdownu do souboru')
    ap.add_argument('--dry-run', action='store_true', help='jen vypíše, co by kontroloval')
    args = ap.parse_args()

    cfgs = json.load(open(CONFIG, encoding='utf-8'))
    seen, rows = set(), []
    for cfg in cfgs:
        for who, what, url in targets(cfg):
            if url in seen:
                continue
            seen.add(url)
            if args.dry_run:
                print(f'{who} | {what} | {url}')
                continue
            ok, note, ms = check(url)
            rows.append((ok, who, what, url, note, ms))
            print(f"{'OK  ' if ok else 'CHYBA'} {ms:>6} ms  {who} | {what} | {note}", flush=True)

    if args.dry_run:
        return 0
    bad = [r for r in rows if not r[0]]
    print(f'\n{len(rows) - len(bad)} z {len(rows)} služeb odpovídá.')
    if args.markdown:
        with open(args.markdown, 'w', encoding='utf-8') as f:
            f.write(f'Kontrola zdrojů: {len(rows) - len(bad)} z {len(rows)} služeb odpovídá.\n\n')
            if bad:
                f.write('| Zdroj | Co | Chyba | Adresa |\n|---|---|---|---|\n')
                for ok, who, what, url, note, ms in bad:
                    f.write(f'| {who} | {what} | {note} | {url} |\n')
                f.write('\nNěkteré servery krajů a měst blokují přístup ze zahraničí, ověřte chybu i z české sítě, než zdroj odstraníte.\n')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
