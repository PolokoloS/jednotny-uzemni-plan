# Postup práce

Paměť pro přerušení a komprimaci kontextu. Po pokynu „pokračuj“ přečíst tenhle soubor a `git log` a navázat v sekci Rozdělané. Pravidla práce jsou v `CLAUDE.md` (Postup práce).

Zadání (29. 10. 2026, přednáška): Fáze 1 pokrytí (všech 14 krajských měst, všechna sídla ORP, co nejvíc obcí), Fáze 2 zážitek na předvedení. Na konci jeden PR `prace` → `main`, odkaz na náhled, merge až na „nasaď“.

## Hotovo

- [x] Drobnosti v `main` se `[skip netlify]`: PR #1 (Údržba CI) mergnutý a větev smazaná, týdenní spouštění kontroly zdrojů zrušené, v CLAUDE.md nový Postup práce, issue #2 zavřené (falešný poplach z ciziny).
- [x] Větev `prace` a tenhle soubor.

## Rozdělané

- Průzkum zdrojů (subagenti, výsledky v scratchpadu, sem se přepisuje souhrn): KHK, Pardubický, JMK, Olomoucký, Zlínský kraj.

## Další kroky

1. `data/pokryti.json`: u každé obce z RÚIAN odkud má data (NGÚP, kraj, město, nic), seznam děr po krajích a ORP podle počtu obyvatel.
2. Napojit nalezené zdroje (nový typ `wms`), každý ověřit kliknutím na kartu a porovnáním s dokumentací obce.
3. Výkresy z PDF pro města bez služby (GeoPDF nebo vlícování, chyba do 5 m proti katastru, dlaždice z16 WebP, limit 100 MB).
4. Karta pro obce bez dat: má platný ÚP? odkaz na dokumenty.
5. Fáze 2: mapa pokrytí, první dojem, výpadky, mobil 390 px, 3 nápady, screenshoty před a po.
6. Revize subagentem, build, smoke test, PR.

## Rozhodnutí

- Smoke test jen s místy, která projdou z GitHubu (STČ a MSK z ciziny neodpovídají).

## Co beze mě nejde

- Deploy Preview na Netlify je za přihlášením týmu („This site is private“). Náhled proto ověřím lokálně a v CI, odkaz pošlu.

## Zjištění

- NGÚP živě 29. 10. 2026: z Hradce, Pardubic a okresních měst KHK a Pardubického kraje má jednotná data jen Chrudim.
- Hradec Králové: ArcGIS města má cache `thematic_up/hv2026` (S-JTSK). KHK: WMS „Bezešvý výkres ÚP obcí Královéhradeckého kraje“ (vrstva `zd_hlv`). Ověřuje se.
