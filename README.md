# Jednotný územní plán

Územní plány českých obcí v jedné mapě a lidskou řečí. Klikneš na pozemek a karta ti řekne, k čemu plocha slouží, co se tam typicky smí postavit, co obec chystá a na co si dát pozor (podmínky, rezervy, veřejně prospěšné stavby, záplavy, radon, ochrana přírody, BPEJ).

Pokrytí: 343 obcí v jednotném standardu s plným výkladem a dalších zhruba 3 250 obcí z dat krajů a měst (výkres, u většiny i typ plochy s orientačním výkladem). Dohromady víc než polovina obcí v Česku včetně všech krajských měst kromě Hradce Králové a Pardubic: Praha, Brno, Ostrava, Plzeň, Olomouc, Liberec, Ústí nad Labem, České Budějovice, Zlín, Karlovy Vary a Jihlava.

Celá appka je jeden soubor `index.html`. Nic se neinstaluje, data se tahají živě ze serverů státu, krajů a měst. Živě: https://venerable-custard-504746.netlify.app

## Jak to spustit

Otevři `index.html` v prohlížeči (v repu vznikne v `dist/` po `python build.py`). Funguje i přímo z disku, jen potřebuje internet.

## Jak to dát veřejně (vlastní adresa)

Stačí nahrát `index.html` na jakýkoli statický hosting:

1. **Netlify Drop** (nejrychlejší): otevři https://app.netlify.com/drop a přetáhni tam celou složku. Za pár sekund máš odkaz. S bezplatným účtem odkaz zůstane natrvalo a jde přejmenovat.
2. **GitHub Pages**: nový repozitář, nahrát `index.html`, Settings → Pages → větev `main`. Adresa bude `https://<jmeno>.github.io/<repozitar>/`.
3. **Vercel**: `vercel deploy` ve složce, nebo import repozitáře.

Jako artefakt na claude.ai to nepojede: jeho bezpečnostní pravidla blokují mapové servery státu.

## Co mapa umí

* **Plán v jedné legendě**: 83 typů ploch podle jednotného standardu (vyhláška č. 157/2024 Sb.), každá s lidským názvem a vysvětlením.
* **Chci postavit…**: přebarví mapu podle záměru (rodinný dům, bytový dům, chata, obchod, dílna). Zelená = typicky ano, šrafa = záleží na podmínkách, šedá = spíš ne.
* **Co se tu chystá**: zvýrazní navržené plochy, tedy co obec teprve plánuje.
* **Karta místa**: plocha, výklad, co se tu smí, upozornění z ÚP, parcela z katastru, ochrana přírody, BPEJ, záplavové území, radonový index, odkazy na textovou část ÚP obce a Nahlížení do katastru.
* **Obce bez jednotných dat**: mapa ukáže plán z dat kraje. Kde kraj u plochy uvádí typ nebo název, karta ho převede do jednotné legendy a ukáže orientační výklad. Na Vysočině přidá i přesné znění podmínek plochy z územního plánu.
* **Hledání**: adresa, obec, část obce, ulice i parcela („Liberec 1234/9“) přes RÚIAN.
* **Vrstvy**: letecký snímek a základní mapa ČÚZK, hranice parcel, radon, ochrana přírody, záplavová území.
* **Sdílení**: adresa stránky v sobě nese výřez mapy, vybrané místo i režim, stačí ji poslat.
* Světlý i tmavý režim, telefon i počítač.

## Odkud jsou data

| Co | Zdroj |
|---|---|
| Územní plány v jednotném standardu | Národní geoportál územního plánování (MMR), `mapy.gov.cz/server/rest/services/UPD` |
| Praha | Hlavní výkres Metropolitního plánu (IPR Praha, dlaždice ArcGIS Online) |
| Středočeský kraj | Mozaika hlavních výkresů a odkazy na dokumentaci obcí (`gis.kr-stredocesky.cz`) |
| Jihočeský kraj | Územně analytické podklady, plochy s rozdílným způsobem využití (`gis.kraj-jihocesky.cz`) |
| Plzeňský kraj | Výkresy územních plánů jednotlivých obcí (`ags.plzensky-kraj.cz/.../UPD`) |
| Karlovarský kraj | Mozaika ÚP, legendy a texty obcí, ÚAP současné využití (`geo-ags.kr-karlovarsky.cz`) |
| Ústecký kraj | Územně analytické podklady, plochy s rozdílným způsobem využití (`ags.kr-ustecky.cz`) |
| Liberecký kraj | Mozaika hlavních výkresů a legendy obcí (`maparcgis.kraj-lbc.cz`) |
| Kraj Vysočina | Rastry hlavních výkresů, podmínky využití ploch a krajský jednotný standard (`maps.kr-vysocina.cz`) |
| Moravskoslezský kraj | Mozaika hlavních výkresů (`gis2.msk.cz`) |
| Brno | Hlavní výkres ÚPmB a části zrušené soudem (`gis.brno.cz`) |
| Plzeň | ÚP Plzeň po změně č. 4: výkres a plochy s typem (`ags.plzen.eu`) |
| Olomouc | ÚP Olomouc po změně X/2A: výkres, plochy s typem a regulací (ArcGIS Online města) |
| Zlín | ÚP Zlína po změně 4C: plochy s typem a podmínkami využití (ArcGIS Online města) |
| České Budějovice | Hlavní výkres ÚPnM (stav 2022, ArcGIS Online města) a ÚAP Jihočeského kraje |
| Parcely, adresy, obce, ochrana přírody, BPEJ, hledání | RÚIAN, ČÚZK (`ags.cuzk.cz`) |
| Hranice a čísla parcel | Katastrální mapa WMS, ČÚZK |
| Letecký snímek, základní mapa | ČÚZK |
| Radonový index 1 : 50 000 | Česká geologická služba |
| Záplavová území | VÚV TGM (`ags.vuv.cz`) |
| Podkladová mapa | OpenStreetMap, OpenMapTiles, OpenFreeMap |

## Jak to funguje uvnitř

* Mapa: OpenLayers 10, vektorový podklad přes ol-mapbox-style (styl Positron a Dark z OpenFreeMap, popisky v češtině a písmem Archivo nad plánem).
* Národní geoportál nepovoluje CORS, proto se dotazy posílají jako JSONP (`callback=`), což ArcGIS REST podporuje.
* Na úrovni ulic se plochy stahují jako vektory (dlaždice z15/z14) a kreslí se v prohlížeči. Ve středním měřítku kreslí obraz server přes `dynamicLayers`, takže režimy „Chci postavit“ a „Co se tu chystá“ fungují i při pohledu na celé město.
* Geoportál drží i starší verze plánů. Appka u každé obce pozná nejnovější úplnou verzi a starší vyfiltruje, změny nad ní nechá.
* Firewall geoportálu odmítá SQL výrazy typu `x=1) AND …`, proto filtry používají jen seznamy `IN (…)`.
* Při startu se přehled obcí s daty načte znovu živě z geoportálu, takže nové obce přibudou samy.
* Krajská data jsou popsaná v `data/regionalni_mozaiky.json` (typ služby, vrstvy, pole s kódem a názvem plochy). Každá krajská vrstva se ořízne hranicí kraje a vynechá obce, které mají lepší data: jednotný standard z NGÚP, případně krajský standard. Hranice bere z RÚIAN.
* Kódy ploch z krajských dat (starší standard MINIS a krajské varianty) převádí na typy podle vyhlášky č. 157/2024 Sb. nejdřív podle názvu plochy, pak podle zkratky. Výklad je proto orientační.
* V Plzeňském kraji má každá obec vlastní mapovou službu. Appka pro obce ve výřezu najde jejich službu a v ní nejnovější hlavní výkres (úplné znění po změně má přednost).
* Krajská města mají vlastní záznam (`obec` v konfiguraci) a mají přednost před krajskou vrstvou. Zlín nemá obrázkový výstup, plochy se proto stahují jako vektory a kreslí stejně jako jednotná data, takže v něm funguje i „Chci postavit“.

## Omezení

* Jednotná data má zatím jen část obcí (v říjnu 2026 to bylo 343 z 6 258). Další zhruba 3 200 obcí pokrývají data krajů.
* Královéhradecký, Pardubický, Jihomoravský, Olomoucký a Zlínský kraj zatím nemají veřejnou službu s plány obcí, kterou by šlo připojit (portál KHK je v odstávce, Pardubický server odmítá spojení, JMK svou aplikaci ukončil, Olomoucký a Zlínský jsou za přihlášením). Z těchto krajů mapa umí jen Brno, Olomouc a Zlín. U ostatních obcí bez jednotných dat karta pošle na dokumenty obce v Národním geoportálu.
* Data Zlína odpovídají stavu po změně 4C, novější změny v nich být nemusí. Výkres Českých Budějovic je snímek z roku 2022.
* Krajská data kraje samy označují jako informativní. Některá mohou být starší než poslední změna plánu obce.
* Výklad „co se tu smí postavit“ je orientační podle typu plochy. Přesné podmínky stanoví textová část územního plánu obce.
* Neoficiální nástroj nad otevřenými daty státu, nenahrazuje územně plánovací informaci ani vyjádření stavebního úřadu.

## Úpravy

Zdrojáky jsou rozdělené (`src/app.js`, `src/plain.js` s lidskými popisy ploch, `src/style.css`, `src/index.template.html`) a `build.py` z nich složí `dist/index.html`. Jak projekt funguje, jaká má pravidla a na co si dát u služeb pozor, je v `CLAUDE.md`, ze kterého vychází i Claude Code.

* `python build.py` postaví web, `python -m http.server 8080 -d dist` ho pustí lokálně.
* `npx playwright test` projde smoke testy (Liberec, Jihlava, Okříšky, Písek, Plzeň, Olomouc, Zlín, Brno, Praha).
* `python scripts/check_sources.py` zkontroluje, že odpovídají všechny služby krajů a měst. Na GitHubu to běží samo každé pondělí a při výpadku založí issue.
* Netlify nasazuje z větve `main` podle `netlify.toml`, každý pull request dostane náhled.
