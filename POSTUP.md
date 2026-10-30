# Postup práce

Paměť pro přerušení a komprimaci kontextu. Po pokynu „pokračuj“ přečíst tenhle soubor a `git log` a navázat v sekci Rozdělané. Pravidla práce jsou v `CLAUDE.md` (Postup práce).

Zadání (29. 10. 2026, přednáška): Fáze 1 pokrytí (všech 14 krajských měst, všechna sídla ORP, co nejvíc obcí), Fáze 2 zážitek na předvedení. Na konci jeden PR `prace` → `main`, odkaz na náhled, merge až na „nasaď“.

### Fáze 3 (30. 10. 2026, větev `prace3`)

Zadání: zbylých 1 658 obcí bez plánu v mapě (medián 438 obyvatel).
1. Limit dlaždic 500 MB, menší dlaždice (žádné prázdné mimo obec, kvalita WebP). Nejdřív připravené výkresy (Klášterec n. O., Duchcov, Červený Kostelec, Hronov, Úpice, Česká Skalice, Police n. M., Velké Poříčí), pak podle obyvatel: Krupka, Dubí, obce nad 2 000, pak menší, dokud limit nedojde. Pravidla výkresu z PDF platí dál.
2. Teplice, Ostrov, Železný Brod: znovu hledat úplné znění nebo výkres poslední změny pro celé území.
3. Evidence NGÚP: 229 obcí vedených jako bez plánu ověřit jinde (web obce, ÚAP ORP, kraj); kde plán je, přesunout do „jen v dokumentech“ nebo do mapy; u zbytku opatrný text a odkaz na web obce, opatrný název kategorie.
4. Do shrnutí návrh e-mailu krajskému úřadu Olomouckého kraje (nic neposílat).
5. Přepočet pokrytí, čísla na webu, README, POSTUP.md, smoke test. Na konci PR `prace3` → `main`, merge až na „nasaď“.

## Fáze 3: stav (průběžně, 30. 10. 2026 odpoledne)

- [x] PR #3 mergnutý do `main` (cd7cd906), produkce ověřená (4 600 obcí).
- [x] Dlaždice: WebP kvalita 65, method 4, proužky pod 0,2 % se neukládají, limit 500 MB. Všech 39 starých výkresů přegenerováno (asi −7 %). Kontrola `scratchpad/check_vykresy.py`: 50 přijatých výkresů, 106,8 MB, bez rozporů.
- [x] Připravené výkresy přijaté: Klášterec n. O., Duchcov, Červený Kostelec, Úpice, Česká Skalice, Police n. M., Velké Poříčí, Dubí (2 listy, `pas`). Z fronty zatím Řevnice, Moravany, Štěpánov.
- [ ] Krupka nepřijatá: severní list 5,56 m (jedno okno, místní odchylka podkladu, polynom nepomůže).
- [~] Hronov: legenda zasahuje do obdélníku mapy, výřez uřízl východní cíp. Nový parametr `zakryj` (vybílené obdélníky), hrubé přiložení teď IoU 0,994 při 1:5000; Malá Čermná je vložený výřez v rohu (druhá část `casti`). Běží `vykresy.py --obec 574082` (log `scratchpad/f3_hronov.log`).
- [~] Služby v `regionalni_mozaiky.json` (zatím neověřené kliknutím): 56 obcí z DMVS_upd Jihočeského kraje (po obcích, ořez hranicí obce), GObec Zlaté Hory (úplné znění po Z2), WMS Drahany.
- [~] PDF fronta: `scratchpad/f3_import.py` přidal ~90 obcí (ORP Šlapanice, Olomoucký kraj z webů obcí a archivu kraje, STČ/PK, JČ). Běží `bash scratchpad/run_fronta.sh a 2` (logy `scratchpad/f3/run_a_*.log`). Chyby k opakování (smazat jejich záznam z `vykresy.json` a pustit znovu): Modřice (špatné měřítko, teď pomůže druhý pokus), Horní Bříza (server resetuje spojení), Bílovice n. S. (DNS).
- [ ] Vícelistové: Radhostice (`pas`, ve frontě), Pozořice (listy se nedělí vodorovně, potřebuje ořez rámem listu), Chotěšov (2 listy + výřezy), Hlubočky (5 listů, otočené).
- [~] Evidence: kód hotový (`data/overeni_planu.json` → `obce.json` pole 12; karta, nápověda, kategorie „Platný plán v evidenci nenalezen“, u staršího plánu „Starý plán skončil koncem roku 2022“). Chybí data: sestavit z `scratchpad/f3/evidence_x.csv` (zatím 110 obcí, všechny bez plánu) a z řádků `neplatny` v CSV průzkumu (Boudy, Myslín, Němčice, Podolí 583634, Prštice, Kovalovice, Ponětovice).
- [x] `vykresy.py`: opakované stahování při výpadku, druhý pokus s měřítkem z textu listu (pak 1:5000 a 1:10 000), střídavé doladění měřítka a otočení, `zakryj`.
- [ ] Agenti průzkumu (ÚK+KV, JMK, OLK, STČ+PK, LK+KHK, evidence) mohou ještě dopisovat CSV: znovu `f3_import.py` a `add_f3_svc.py`, pak fronta.
- [ ] Přepočet pokrytí, build, ověření kliknutím, README, smoke test, commit dlaždic po `check_vykresy.py`, PR `prace3` → `main`, návrh e-mailu pro Olomoucký kraj do shrnutí.

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

- [x] Screenshoty po (`docs/screenshots/po`), smoke test lokálně 16/16, push, PR #3 `prace` → `main` (https://github.com/PolokoloS/jednotny-uzemni-plan/pull/3).

## Rozdělané

- Čeká se na pokyn „nasaď“: pak merge PR #3 do `main` (nasazení na https://venerable-custard-504746.netlify.app). Náhled: https://deploy-preview-3--venerable-custard-504746.netlify.app (za přihlášením týmu Netlify).

## Další kroky

1. Merge PR #3 až na „nasaď“, pak ověřit produkční web.
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
