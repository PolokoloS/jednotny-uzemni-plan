# Jednotný územní plán

Webová mapa, která sjednocuje územní plány českých obcí a vysvětluje je lidskou řečí. Výsledek je jeden statický soubor `dist/index.html`, žádný backend. Data se tahají živě ze serverů státu, krajů a měst.

Živý web: https://venerable-custard-504746.netlify.app (Netlify, nasazuje se z větve `main`).

## Příkazy

- Build: `python build.py` (na Linuxu `python3 build.py`). Složí `src/` a `data/` do `dist/index.html`. OpenLayers 10.10.0, proj4 2.22.0 a ol-mapbox-style 13.5.1 se načítají z CDN jsDelivr s pevnou verzí.
- Lokálně: `python -m http.server 8080 -d dist` a otevřít http://localhost:8080. Funguje i přímo z disku (file://).
- Smoke test: `npm install` a `npx playwright test`. Lokálně běží v nainstalovaném Edge (`channel: 'msedge'` v `playwright.config.js`), `npx playwright install` netřeba. Chromium se stahuje jen v CI (je nastavené `CI`). Sahá na živé služby, potřebuje internet. Před testem vždy build. Do smoke testu dávej jen místa, která projdou i z GitHubu (servery STČ a MSK z ciziny neodpovídají).
- Kontrola zdrojů: `python scripts/check_sources.py` vypíše, které krajské a městské služby neodpovídají. `--markdown report.md` uloží report. Na GitHubu se spouští jen ručně, z ciziny hlásí falešné výpadky STČ a MSK.
- Nasazení: Netlify bere `main` podle `netlify.toml` (build `python3 build.py`, publish `dist`). Každé nasazení z `main` bere kredity free plánu Netlify, proto se do `main` posílá až hotová práce (viz Postup práce). PR dostane Deploy Preview zdarma, tam změnu ověř, než se mergne.

## Struktura

- `src/app.js`: celá aplikace (jedna IIFE, OpenLayers 10). Podklad (OpenFreeMap vektorově, ortofoto a ZTM ČÚZK), vrstvy NGÚP (raster ve středním měřítku, vektory na úrovni ulic), krajská a městská data (`REGIONAL`), karta místa, legenda, nápověda, hledání přes RÚIAN, sdílení přes hash (`#mapa=z/lat/lon&bod=lat,lon&chci=rd&rezim=zmeny`).
- `src/plain.js`: lidské popisy 83 typů ploch podle vyhlášky č. 157/2024 Sb. a co se v nich typicky smí postavit (rodinný dům, bytový dům, chata, obchod, dílna). Je to výklad, neměnit bez dobrého důvodu.
- `src/style.css`, `src/index.template.html`: vzhled a kostra. Barvy jako tokeny na `:root`, tmavý režim přes `prefers-color-scheme` i `data-theme`.
- `data/standard_ploch.json`: kódy a barvy standardu. `data/obce_snapshot.json` a `data/verze_snapshot.json`: snímek obcí a verzí plánů v NGÚP pro rychlý start (appka se při startu stejně obnoví živě). `data/kraje.json`: krajské portály a poznámky. `data/regionalni_mozaiky.json`: krajská a městská data.

## Krajská a městská data (`data/regionalni_mozaiky.json`)

Jeden záznam je kraj (`kraj` = kód VÚSC z RÚIAN) nebo město (`obec` = kód obce z RÚIAN). Záznam města má přednost před krajem, krajská vrstva město vynechá.

- `name`, `from`: texty do legendy a karty (`from` začíná „z…“). `obce`: kolik obcí zdroj pokrývá, počítá se z toho číslo v úvodu. `drawing: true`: zdroj je obrázek výkresu. `searchText`: přesný text našeptávače RÚIAN pro štítek ve výsledcích hledání. `lead`, `links`: vlastní úvodní věta a odkazy na kartě.
- `layers[].kind`:
  - `tiles5514`: cache ArcGIS v S-JTSK (`origin`, `resolutions`, `extent`, volitelně `tileSize`). V `resolutions` nech jen úrovně, které jsou opravdu nacachované, jinak mapa na detailu zbělá.
  - `tiles3857`: běžné dlaždice Web Mercator (`maxZoom`, `extentCrs: "EPSG:3857"`).
  - `arcgisExport`: MapServer export. `params` malými písmeny (`layers`, `dpi`). Nižší `dpi` obchází minScale skupinových vrstev.
  - `arcgisImage`: ImageServer exportImage.
  - `arcgisPerObec`: Plzeňský kraj, služba za každou obec. Appka podle RÚIAN najde obce ve výřezu, k nim službu a v ní nejnovější hlavní výkres.
  - `arcgisVector`: FeatureServer bez obrázkového výstupu (Zlín). Plochy se stahují jako vektory a kreslí stylem jednotných dat, takže umí i režimy.
- `std` u vrstvy: kódy podle 157/2024, v režimech se přebarvuje serverem přes `dynamicLayers`. `cover`: obce, které vrstva pokrývá lépe, vynechají se z vrstev pod ní.
- `info[]`: dotazy na bod pro kartu. `fields` mapuje `code`, `name`, `status`, `label`, `doc`, `date`, `author`, `text`. Dále `codes` (`std` nebo `minis`), `fixedStatus`, `navrh`, `extra` (řádky s regulací, např. max. výška), `rulesFields` (podmínky využití poskládané z víc polí), `namesFrom` (název plochy z rendereru služby), `cors: true` pro ArcGIS Online, `dateLabel`.
- `doc[]`: dotazy na dokumentaci obce (PDF, legenda, archiv, části zrušené soudem: `court`, `courtNote`).
- Všechny vrstvy se ořezávají hranicí kraje nebo obce z RÚIAN a vynechávají obce s jednotnými daty NGÚP.
- Kódy a názvy ploch z krajských dat převádí na typy standardu `classify()` v `src/app.js`: nejdřív podle názvu plochy, pak podle zkratky (tabulky `STD_ALIAS`, `MINIS_ALIAS`). Výklad je proto orientační a karta to tak říká.

## Úskalí služeb

- NGÚP (mapy.gov.cz) nemá CORS, dotazy jdou přes JSONP (`callback=`). Jeho firewall odmítá SQL výrazy kromě seznamů `IN (...)`. Žádné `AND 1=1`, `<`, `NOT (`.
- NGÚP drží i starší verze plánů. Appka u každé obce bere nejnovější úplnou verzi a změny nad ní (`SUP`, `supersededFor`).
- OpenLayers 10 posílá parametry ArcGIS malými písmeny (`format`, `dpi`, `layers`, `size`). Velká písmena se jen zdvojí a server vezme jen jedno.
- ArcGIS Online (`services*.arcgis.com`) u dotazů JSONP neumí, používej `cors: true` (fetch). `tiles.arcgis.com` CORS má.
- Města a kraje často obsluhují dlaždice i dotazy jedním serverem, dotaz pak čeká ve frontě. Limit dotazu je 25 s, karta se kreslí postupně.
- RÚIAN a ČÚZK mají CORS, JSONP netřeba.
- Mapa startuje až po události `load` (`boot()` na konci `src/app.js`). Nic síťového (dlaždice, obrázky, skripty JSONP) se nesmí spustit dřív. Jinak `load` čeká na nejpomalejší server, stránka se pořád načítá a smoke test spadne na `page.goto`.
- Stav k 10/2026: portál ÚP Královéhradeckého kraje je v odstávce kvůli bezpečnostní chybě, mapy.pardubickykraj.cz odmítá spojení, Jihomoravský kraj svou aplikaci ukončil a odkazuje na NGÚP, Olomoucký a Zlínský kraj mají plány obcí jen po přihlášení. Hradec Králové a Pardubice zatím nemají připojená vlastní data.

## Pravidla

- Texty v UI česky, věcně, bez pomlček jako interpunkce, bez marketingu a superlativů.
- Aplikace zůstává jeden soubor bez build závislostí. Knihovny jen z CDN s pevnou verzí.
- Nepřidávej zdroj, dokud neověříš, že vrací data, že je to platná verze plánu (datum účinnosti, ne návrh) a že k němu není potřeba přihlášení.
- Nic nemaž z dat ani konfigurace bez vysvětlení v PR.
- Po změně zdrojů aktualizuj `README.md` (tabulka zdrojů, pokrytí), text O projektu v `src/index.template.html` a smoke test v `tests/smoke.spec.js`.

## Postup práce

- Pracuje se na větvi `prace`. Po každém hotovém kroku commit a push `prace` jako záloha (větve na Netlify nic nestojí). Do `main` se během práce nic neposílá.
- V repu se vede `POSTUP.md`: co je hotové, co rozdělané, co dál a proč. Aktualizuje se po každém kroku. Po přerušení (pokyn „pokračuj“) se přečte `POSTUP.md` a `git log` a navazuje se tam, kde práce skončila.
- Na web jen jednou, na konci: PR z `prace` do `main` (Deploy Preview je zdarma), vlastníkovi repa odkaz na náhled a merge až na jeho pokyn „nasaď“.
- Drobnosti přímo v `main` jen na výslovný pokyn vlastníka a vždy s `[skip netlify]` ve zprávě commitu, aby se nic nenasadilo.
- Do popisu PR: co funguje, co ne a proč, jak to bylo ověřeno (smoke test, Deploy Preview).
- Na nic se neptej a na nic nečekej, rozhoduj podle tohoto souboru a rozhodnutí zapiš do `POSTUP.md` a do shrnutí. Co beze vlastníka nejde (přihlášení, oprávnění), zapiš a pokračuj jinou částí.
