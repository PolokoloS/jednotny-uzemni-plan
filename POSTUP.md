# Postup práce

Paměť pro přerušení a komprimaci kontextu. Po pokynu „pokračuj“ přečíst tenhle soubor a `git log` a navázat v sekci Rozdělané. Pravidla práce jsou v `CLAUDE.md` (Postup práce).

Zadání (29. 10. 2026, přednáška): Fáze 1 pokrytí (všech 14 krajských měst, všechna sídla ORP, co nejvíc obcí), Fáze 2 zážitek na předvedení. Na konci jeden PR `prace` → `main`, odkaz na náhled, merge až na „nasaď“.

## Hotovo

- [x] Drobnosti v `main` se `[skip netlify]`: PR #1 mergnutý, týdenní kontrola zdrojů zrušená, Postup práce v CLAUDE.md, issue #2 zavřené.
- [x] Větev `prace`, POSTUP.md, screenshoty před (`docs/screenshots/pred`).
- [x] Data: `data/obyvatele_2026.json` (ČSÚ), `scripts/pokryti.py` → `data/pokryti.json` + `docs/pokryti.md`, `scripts/stav_up.py` → `data/stav_up.json` (evidence NGÚP), `scripts/hranice.py` → `data/hranice_obci.json`.
- [x] Appka, nové typy zdrojů: `wms` (obraz nebo dlaždice, `rawCommas`, GetFeatureInfo JSON/XML/GML/HTML, `<Attribute Name>`), `tilesPerObec` (výkres po obcích v S-JTSK i Web Mercatoru), `tilecache` (OpenLayers 2 TileCache, Prostějov), dotaz na plochu přes WFS (`info.kind: "wfs"`), `skip` a `only` (vynechané nebo vyjmenované obce), `versionNote`, odkaz na legendu z `<img src>`.
- [x] Appka, karta: zdroj podle obce z `obce.json`, karta pro obce bez dat (má/nemá platný ÚP podle NGÚP, odkazy), karta při výpadku zdroje (Zkusit znovu), koordinační výkres pojmenovaný.
- [x] KHK: Hradec Králové (ÚP 2026), Jičín, T-MAPY 22 obcí (Trutnov, Dvůr Králové, ORP Trutnov), bezešvá WMS kraje u 297 obcí s aktuální verzí. Ověřeno kliknutím (HK, Jičín, Trutnov, Dvůr Králové, Náchod, Albrechtice).
- [x] Pardubický kraj: Pardubice (nový ÚP od 1. 8. 2026), Marushka ORP Svitavy a Polička (47), GObec ORP Vysoké Mýto a Žamberk (61, Žamberk jen koordinační výkresy), ORP Chrudim vektory s typem plochy (56), krajská bezešvá mapa (259, verze neznámá, poznámka v kartě). Ověřeno kliknutím (8 míst).
- [x] JMK: T-MAPY Hodonín, Kyjov, Mikulov, Veselí (69), GObec (65), ArcGIS Online Hustopeče (26), ÚAP Pohořelice a Znojmo (68), vše jen obce s ověřeně aktuální verzí.
- [x] Olomoucký a Zlínský kraj v konfiguraci: Prostějov, Přerov, Jeseník, Mohelnice, T-MAPY ORP Šumperk, Zábřeh, Hranice (s WFS typem plochy), Vsetín, Val. Meziříčí, Uh. Hradiště, Uh. Brod, JÚAP mozaika Zlínského kraje (306 obcí).

## Rozdělané

- Přepočet pokrytí OLK a ZLK (`python scripts/pokryti.py --kraj 124 --kraj 141`), pak kliknutím ověřit JMK, OLK, ZLK.
- `python scripts/stav_up.py --recheck` (postupné ověření obcí bez plánu, ukládá průběžně; dočasný soubor `%TEMP%\stav_up_overeno.json`).

## Další kroky

1. Díry v ostatních krajích podle `docs/pokryti.md` (Liberecký 165 obcí, Středočeský 298, Plzeňský 198, Ústecký 97, Jihočeský 79): krajské a ORP služby.
2. Výkresy z PDF pro města bez služby (Ústí nad Orlicí, Rychnov n. K., Broumov, Vrchlabí, Dobruška, Jaroměř, Holice, Moravská Třebová, Lanškroun, Česká Třebová, Kroměříž…).
3. Fáze 2: mapa pokrytí (hranice_obci.json + obce.json, kategorie: jednotný standard, kraj, město a ORP, výkres z PDF, jen dokumenty, bez ÚP), první dojem, mobil 390 px, 3 nápady, screenshoty po.
4. Revize subagentem, build, smoke test (jen místa, která projdou z GitHubu), PR.

## Rozhodnutí

- Smoke test jen s místy, která projdou z GitHubu (STČ a MSK z ciziny neodpovídají).
- Pokrytí se ověřuje u každé obce zvlášť dotazem na bod hlavní části obce. Obec, kterou mozaika nemá, dostane kartu se stavem plánu.
- Stav plánu bere appka z předpočítaného `obce.json` (API NGÚP nemá CORS). NGÚP se u některých měst zpožďuje (Ústí n. O., Hranice, Val. Meziříčí), karta proto uvádí datum evidence.
- Bezešvá WMS KHK: portál kraje je oficiálně v odstávce (503), mapové služby odpovídají bez přihlášení. Jen obce s aktuální verzí, dlaždicově v JPEG (PNG 5× pomalejší).
- Krajské mozaiky s neznámou verzí (Pardubický kraj, JÚAP Zlínský kraj) zapojené s poznámkou v kartě; ověřeně zastaralé obce vynechané. U ORP služeb jen obce s ověřeně aktuální verzí.
- Koordinační výkresy (Žamberk, Kyjov, Hranice ORP) jen tam, kde hlavní výkres není; karta to říká.
- Vynechané: Olomoucký kraj (WMTS za zveřejněným heslem, interní proxy portálu), Židlochovice (vrstvy po obcích nejasné), Břeclav, Kuřim, Čebín (zastaralé), Litomyšl ORP (verze neznámá, místo ní krajská mozaika), Malá Vrbka a Nová Lhota (potřebují více vrstev změn).

## Co beze mě nejde

- Deploy Preview na Netlify je za přihlášením týmu („This site is private“). Náhled proto ověřím lokálně a v CI, odkaz pošlu.

## Zjištění

- Pokrytí po JMK: NGÚP 381, města 8, kraj s typem 1 104, výkres 2 669, nic 2 096 (z 6 258).
- Hradec Králové: nový ÚP od 13. 3. 2026 (`thematic_up/hv2026`). Pardubice: nový ÚP od 1. 8. 2026 (Marushka téma 554), NGÚP ho zatím vede jako projednávaný.
