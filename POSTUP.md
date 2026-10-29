# Postup práce

Paměť pro přerušení a komprimaci kontextu. Po pokynu „pokračuj“ přečíst tenhle soubor a `git log` a navázat v sekci Rozdělané. Pravidla práce jsou v `CLAUDE.md` (Postup práce).

Zadání (29. 10. 2026, přednáška): Fáze 1 pokrytí (všech 14 krajských měst, všechna sídla ORP, co nejvíc obcí), Fáze 2 zážitek na předvedení. Na konci jeden PR `prace` → `main`, odkaz na náhled, merge až na „nasaď“.

## Hotovo

- [x] Drobnosti v `main` se `[skip netlify]`: PR #1 mergnutý a větev smazaná, týdenní kontrola zdrojů zrušená, v CLAUDE.md Postup práce, issue #2 zavřené.
- [x] Větev `prace`, POSTUP.md, screenshoty před (`docs/screenshots/pred`, počítač 1440 px a telefon 390 px).
- [x] `data/obyvatele_2026.json`: počet obyvatel všech 6 258 obcí (ČSÚ, sada OBY02A, k 1. 1. 2026).
- [x] `scripts/pokryti.py` → `data/pokryti.json` a `docs/pokryti.md`: u každé obce zdroj (n NGÚP, m město, k kraj s typem plochy, v kraj jen výkres, p PDF, - nic), ověřený dotazem na bod hlavní části obce. První běh: NGÚP 381, města 5, kraj s typem 1 048, kraj výkres 1 754, nic 3 070.
- [x] `scripts/hranice.py` → `data/hranice_obci.json` (zjednodušené hranice obcí pro mapu pokrytí, 1,8 MB, gzip 625 KB).
- [x] Appka: typ zdroje `wms` (ImageWMS nebo po dlaždicích, GetFeatureInfo JSON/XML/GML/HTML), `tilesPerObec` (dlaždice výkresu po obcích), `skip` (obce vynechané z krajské vrstvy), `obce.json` z buildu (zdroj podle obce a stav plánu), karta pro obce bez dat (má/nemá platný ÚP, odkazy), karta při výpadku zdroje (Zkusit znovu).
- [x] Zdroje KHK v konfiguraci: Hradec Králové (ÚP 2026, dlaždice města), Jičín (po změně č. 3), výkresy T-MAPY 22 obcí (Trutnov, Dvůr Králové, obce ORP Trutnov), bezešvá WMS kraje u 297 obcí s aktuální verzí (151 obcí vynecháno: neaktuální, nejasné, bez výkresu, NGÚP, jiný zdroj).

## Rozdělané

- `scripts/stav_up.py` → `data/stav_up.json`: stav ÚP každé obce z API portálu NGÚP (`/o/rest/ais/dup/byTerritory/v2`). Po doběhnutí spustit `python scripts/stav_up.py --recheck` (API při souběhu vrací prázdné seznamy).
- Přepočet pokrytí pro KHK a Prahu: `python scripts/pokryti.py --kraj 86 --kraj 19`.
- Ověřit KHK kliknutím (scratchpad `verify.js`, místa HK, Jičín, Trutnov, Dvůr Králové, Náchod, Albrechtice n. O.).
- Průzkum (subagenti): Pardubický, JMK, Olomoucký, Zlínský kraj. KHK hotový.

## Další kroky

1. Napojit Pardubický, Zlínský (JÚAP WMS celého kraje), JMK (ORP Znojmo WMS, Břeclav ArcGIS), Olomoucký kraj.
2. Díry v ostatních krajích podle `docs/pokryti.md` (Liberecký kraj má mozaiku jen u 50 z 215 obcí).
3. Výkresy z PDF pro města bez služby (Rychnov n. K. a další, kde kraj má neaktuální verzi). Testovací PDF z MSK je vektorové bez textu: vlícovat přes katastr (korelace čar), chyba do 5 m.
4. Fáze 2: mapa pokrytí (hranice_obci.json + obce.json), první dojem, mobil 390 px, 3 nápady, screenshoty po.
5. Revize subagentem, build, smoke test, PR.

## Rozhodnutí

- Smoke test jen s místy, která projdou z GitHubu (STČ a MSK z ciziny neodpovídají).
- Pokrytí se ověřuje u každé obce zvlášť, ne podle počtu v konfiguraci. Obec, kterou krajská mozaika nemá, dostane kartu se stavem plánu místo prázdného „Výkres územního plánu“.
- Stav plánu (má/nemá platný ÚP) bere appka z předpočítaného `obce.json`, protože API NGÚP nemá CORS.
- Bezešvá WMS KHK: portál kraje je oficiálně v odstávce (503), mapové služby ale odpovídají bez přihlášení. Použitá jen u obcí s aktuální verzí plánu (porovnáno s evidencí NGÚP), dlaždicově a v JPEG (PNG je u tohoto serveru 5× pomalejší). Riziko: služba může zmizet, karta pak řekne, že server neodpovídá.
- KHK nemá veřejný zdroj s kódy ploch (ÚAP s plochami je za přihlášením), karta tam ukáže výkres a odkazy.
- Olomoucký kraj: WMTS s ÚP je za heslem (i když zveřejněným), takže ho nepoužívám.

## Co beze mě nejde

- Deploy Preview na Netlify je za přihlášením týmu („This site is private“). Náhled proto ověřím lokálně a v CI, odkaz pošlu.

## Zjištění

- NGÚP živě 29. 10. 2026: 381 obcí s jednotnými daty. Z Hradce, Pardubic a okresních měst KHK a Pardubického kraje má jednotná data jen Chrudim.
- Hradec Králové: nový ÚP účinný od 13. 3. 2026, dlaždice `geoportal.mmhk.cz/.../thematic_up/hv2026`, legenda `hv2026_legenda.png`. Krajská WMS má u Hradce ještě starý ÚPM.
- Pardubice: platí ÚP města Pardubice z roku 2001 s 21 změnami, nový ÚP se pořizuje.
