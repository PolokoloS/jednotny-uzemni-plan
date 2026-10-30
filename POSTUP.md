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
- [x] Fáze 2 rozpracovaná: mapa pokrytí (`#pokryti=1`), QR kód na mobil, porovnání dnes a podle plánu, prohlídka v 7 krocích, nový úvod s příklady.
- [x] Olomoucký a Zlínský kraj v konfiguraci: Prostějov, Přerov, Jeseník, Mohelnice, T-MAPY ORP Šumperk, Zábřeh, Hranice (s WFS typem plochy), Vsetín, Val. Meziříčí, Uh. Hradiště, Uh. Brod, JÚAP mozaika Zlínského kraje (306 obcí).

- [x] Výkresy z PDF (`scripts/vykresy.py`): 39 měst, 99 MB dlaždic (limit 100 MB). Okresní města Znojmo, Břeclav, Vyškov, Blansko, Rychnov n. K., Semily, sídla ORP a další města z průzkumu děr. Umí ZIP, 1:10 000, GeoPDF, víc listů po k.ú. (Tišnov), nápovědu otočení (Vyškov 47°), robustní zpřesnění, kontrolu pokrytí obce. Ověřeno kliknutím (všech 39) a obraz proti katastru.
- [x] Služby z průzkumu děr: Liberecký kraj (Marushka ORP Liberec, T-MAPY Jilemnice a Jablonec, GEPRO Tanvald, Smržovka, Desná, Pěnčín), Středočeský (GObec, GEPRO), Jihočeský (DMVS_upd: Vodňany, Dačice, Soběslav, Veselí n. L., Nové Hrady), KHK (GObec Týniště), Ústecký (vektory ÚAP pro Louny, Jílové, Benešov n. P. s plným výkladem, GObec Peruc). Ověřeno kliknutím (29 míst), Jablonné a Chrastava porovnané s PDF úplného znění.
- [x] Pokrytí 30. 10.: v mapě 4 600 obcí z 6 258 (89 % obyvatel), NGÚP 385, PDF 39, bez dat 1 658. Sídla ORP 203 z 206, okresní města všechna kromě Teplic.
- [x] Opravy z revize subagentem: přelety (skok místo dlouhé animace, víc souběžných dlaždic), odkaz z počítače na telefonu, štítky ve vyhledávání podle obce.json, výběr obce zavře kartu, spodní karta (křížek, tažení), legenda zavřená na nízké obrazovce, předěl porovnání ve viditelné části, prohlídka (legenda u mapy pokrytí, krok s obcí bez plánu, QR v panelu, Esc), nápověda podle vybrané obce, vrstvy krajů jen na jejich území, hlídání zaseknutého serveru, výpadek NGÚP bez nekonečného načítání, legenda radonu, přírody a záplav, texty (syrové názvy, zdroj plochy, vnořené závorky, „Obec X nemá“), čísla pokrytí rovnou ve stránce.

## Rozdělané

- Screenshoty po (`docs/screenshots/po`), smoke test, commit, push, PR `prace` → `main`.

## Další kroky

1. PR s popisem, náhled Netlify (za přihlášením týmu), merge až na „nasaď“.
2. Případně dál: Jihočeský kraj po obcích přes registr DMVS_upd, ORP Děčín (T-MAPY, asi 30 obcí), další města z PDF nad rámec limitu 100 MB.

## Rozhodnutí

- Smoke test jen s místy, která projdou z GitHubu (STČ a MSK z ciziny neodpovídají).
- Pokrytí se ověřuje u každé obce zvlášť dotazem na bod hlavní části obce. Obec, kterou mozaika nemá, dostane kartu se stavem plánu.
- Stav plánu bere appka z předpočítaného `obce.json` (API NGÚP nemá CORS). NGÚP se u některých měst zpožďuje (Ústí n. O., Hranice, Val. Meziříčí), karta proto uvádí datum evidence.
- Bezešvá WMS KHK: portál kraje je oficiálně v odstávce (503), mapové služby odpovídají bez přihlášení. Jen obce s aktuální verzí, dlaždicově v JPEG (PNG 5× pomalejší).
- Krajské mozaiky s neznámou verzí (Pardubický kraj, JÚAP Zlínský kraj) zapojené s poznámkou v kartě; ověřeně zastaralé obce vynechané. U ORP služeb jen obce s ověřeně aktuální verzí.
- Koordinační výkresy (Žamberk, Kyjov, Hranice ORP) jen tam, kde hlavní výkres není; karta to říká.
- Vynechané: Olomoucký kraj (WMTS za zveřejněným heslem, interní proxy portálu), Židlochovice (vrstvy po obcích nejasné), Břeclav, Kuřim, Čebín (zastaralé), Litomyšl ORP (verze neznámá, místo ní krajská mozaika), Malá Vrbka a Nová Lhota (potřebují více vrstev změn).

- Limit 100 MB dlaždic beru jako strop: Klášterec n. O. (vlícovaný, 3,1 MB) vyřazený, protože by součet přetáhl na 102 MB. Pořadí: okresní města, sídla ORP, pak ostatní města podle počtu obyvatel.
- Výkres z PDF jen z úplného znění (nebo změny řešící celé území, Rychnov n. K. s poznámkou v kartě). Teplice a Ostrov úplné znění nemají, Železný Brod nesedí na katastr (7,4 m), Zlaté Hory mají na webu jen výkres z roku 2013 bez dvou změn.
- Přijetí výkresu: odchylka ≤ 5 m v ≥ 4 oknech, ≤ 20 % vyřazených oken a výkres pokrývá ≥ 97 % území obce (IoU masky je jen hrubá kontrola, bledé barvy ji podhodnocují).
- Žacléř vyřazený: evidence má jen změnu č. 2 starého ÚPM z roku 2013 a nový plán se pořizuje, plán před rokem 2007 bez úpravy skončil koncem roku 2022.
- Šlapanice s poznámkou v kartě (rozsudky o zrušení části plánu a stavební uzávěra).
- Hořice: NGÚP má jen hranici řešeného území bez ploch, karta proto bere výkres z PDF.

## Co beze mě nejde

- Deploy Preview na Netlify je za přihlášením týmu („This site is private“). Náhled proto ověřím lokálně a v CI, odkaz pošlu.

## Zjištění

- Pokrytí 29. 10. večer: NGÚP 381, města 12, kraj s typem 1 104, výkres 3 033, PDF 1, nic 1 727 (z 6 258). V mapě 4 531 obcí.
- Hradec Králové: nový ÚP od 13. 3. 2026 (`thematic_up/hv2026`). Pardubice: nový ÚP od 1. 8. 2026 (Marushka téma 554), NGÚP ho zatím vede jako projednávaný.
