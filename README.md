# Jednotný územní plán

Územní plány českých obcí v jedné mapě a lidskou řečí. Klikneš na pozemek a karta ti řekne, k čemu plocha slouží, co se tam typicky smí postavit, co obec chystá a na co si dát pozor (podmínky, rezervy, veřejně prospěšné stavby, záplavy, radon, ochrana přírody, BPEJ).

Pokrytí (30. 10. 2026): územní plán přímo v mapě má **4 600 obcí z 6 258, žije v nich 89 % obyvatel**. Z toho 385 obcí je v jednotném standardu s plným výkladem, ostatní mapa ukazuje z dat krajů, ORP a měst a 39 měst jako hlavní výkres vlícovaný z PDF. U zbylých 1 658 obcí karta řekne, jestli obec platný územní plán má, a pošle na jeho dokumenty. V mapě jsou všechna krajská města, všechna okresní města kromě Teplic a 203 z 206 sídel ORP (chybí Teplice, Ostrov a Železný Brod, viz Omezení). Přehled po obcích je v `docs/pokryti.md`.

Appka je statický web bez backendu: `index.html` s daty obcí v `obce.json`, hranicemi obcí pro mapu pokrytí v `hranice.json` a dlaždicemi výkresů z PDF ve `vykresy/`. Plány se tahají živě ze serverů státu, krajů a měst. Živě: https://venerable-custard-504746.netlify.app

## Jak to spustit

`python build.py` složí web do `dist/`, `python -m http.server 8080 -d dist` ho pustí na http://localhost:8080. Přímo z disku funguje taky, jen bez mapy pokrytí a stavu plánů obcí (prohlížeč ze souboru nenačte `obce.json`).

## Co mapa umí

* **Plán v jedné legendě**: 83 typů ploch podle jednotného standardu (vyhláška č. 157/2024 Sb.), každá s lidským názvem a vysvětlením.
* **Chci postavit…**: přebarví mapu podle záměru (rodinný dům, bytový dům, chata, obchod, dílna). Zelená = typicky ano, šrafa = záleží na podmínkách, šedá = spíš ne.
* **Co se tu chystá**: zvýrazní navržené plochy, tedy co obec teprve plánuje.
* **Karta místa**: plocha, výklad, co se tu smí, upozornění z ÚP, parcela z katastru, ochrana přírody, BPEJ, záplavové území, radonový index, odkazy na textovou část ÚP obce a Nahlížení do katastru.
* **Obce bez jednotných dat**: výkres z dat kraje, ORP nebo města. Kde zdroj u plochy uvádí typ nebo název, karta ho převede do jednotné legendy a ukáže orientační výklad (Vysočina, ORP Chrudim, Šumperk, Zábřeh, Hranice, Olomouc, Plzeň, Zlín a další). Na Vysočině přidá i přesné znění podmínek plochy.
* **Obce bez plánu v mapě**: karta podle evidence Národního geoportálu řekne, jestli obec má platný územní plán, od kdy platí, kolik má změn, a dá odkaz na dokumenty a web obce.
* **Mapa pokrytí**: obce obarvené podle toho, odkud mapa zná jejich plán (jednotný standard, kraj, město nebo ORP, výkres z PDF, jen dokumenty, bez plánu v evidenci), s počty v legendě. Odkaz `#pokryti=1`.
* **Dnes a podle plánu**: letecký snímek a plán vedle sebe s posuvným předělem.
* **Na mobil**: QR kód s adresou výřezu, karty a režimu, aby si publikum otevřelo totéž v telefonu.
* **Prohlídka**: sedm kroků pro prezentaci, ovládání šipkami, klikrem (PageUp, PageDown) nebo myší.
* **Hledání**: adresa, obec, část obce, ulice i parcela („Liberec 1234/9“) přes RÚIAN.
* **Vrstvy**: letecký snímek a základní mapa ČÚZK, hranice parcel, radon, ochrana přírody, záplavová území.
* **Sdílení**: adresa stránky v sobě nese výřez mapy, vybrané místo i režim, stačí ji poslat.
* Světlý i tmavý režim, telefon i počítač.

## Odkud jsou data

| Co | Zdroj |
|---|---|
| Územní plány v jednotném standardu | Národní geoportál územního plánování (MMR), `mapy.gov.cz/server/rest/services/UPD` |
| Stav územních plánů obcí (platný plán, změny, pořizování) | Evidence NGÚP, `uzemniplanovani.gov.cz` |
| Praha | Hlavní výkres Metropolitního plánu (IPR Praha, dlaždice ArcGIS Online) |
| Středočeský kraj | Mozaika hlavních výkresů a odkazy na dokumentaci obcí (`gis.kr-stredocesky.cz`), výkresy obcí v GObci (Odolena Voda, Městec Králové, Komárov, Měšice) a GEPRO (Psáry, Velké Přílepy) |
| Jihočeský kraj | Územně analytické podklady, plochy s rozdílným způsobem využití, hlavní výkresy z digitální ÚPD obcí (Vodňany, Dačice, Soběslav, Veselí nad Lužnicí, Nové Hrady) (`gis.kraj-jihocesky.cz`) |
| Plzeňský kraj | Výkresy územních plánů jednotlivých obcí (`ags.plzensky-kraj.cz/.../UPD`) |
| Karlovarský kraj | Mozaika ÚP, legendy a texty obcí, ÚAP současné využití (`geo-ags.kr-karlovarsky.cz`) |
| Ústecký kraj | Územně analytické podklady, plochy s rozdílným způsobem využití, plochy v jednotném standardu pro Louny, Jílové a Benešov nad Ploučnicí (`ags.kr-ustecky.cz`), Peruc (GObec) |
| Liberecký kraj | Mozaika hlavních výkresů a legendy obcí (`maparcgis.kraj-lbc.cz`), výkresy obcí ORP Liberec (Marushka města), ORP Jilemnice a Jablonec nad Nisou (T-MAPY), Tanvald, Smržovka, Desná a Pěnčín (GEPRO) |
| Královéhradecký kraj | Bezešvý hlavní výkres kraje u obcí s aktuální verzí (`up.khk.cz`), Hradec Králové (ÚP 2026, `geoportal.mmhk.cz`), Jičín (`gis.mujicin.cz`), výkresy obcí ORP Trutnov a Dvůr Králové (T-MAPY), Týniště nad Orlicí (GObec) |
| Pardubický kraj | Pardubice (ÚP 2026, Marushka města), výkresy obcí ORP Svitavy a Polička (Marushka), Vysoké Mýto a Žamberk (GObec), plochy s typem ORP Chrudim (ArcGIS Online), bezešvá mapa ÚPD kraje (`mapy.pardubickykraj.cz`) |
| Kraj Vysočina | Rastry hlavních výkresů, podmínky využití ploch a krajský jednotný standard (`maps.kr-vysocina.cz`) |
| Jihomoravský kraj | Brno (`gis.brno.cz`), výkresy obcí ORP Hodonín, Kyjov, Mikulov, Veselí nad Moravou (T-MAPY), Boskovice a další obce (GObec), ORP Hustopeče (ArcGIS Online), plochy z ÚAP ORP Znojmo a Pohořelice |
| Olomoucký kraj | Olomouc (ArcGIS Online), Prostějov (Naše mapy), Přerov (ArcGIS Online), výkresy a plochy s typem obcí ORP Šumperk, Zábřeh, Hranice, města Jeseník a Mohelnice (T-MAPY) |
| Zlínský kraj | Mozaika hlavních výkresů obcí v JÚAP Zlínského kraje (`juapzk.geostore.cz`), Zlín (ArcGIS Online), Vsetín, Valašské Meziříčí, Uherské Hradiště, Uherský Brod (T-MAPY) |
| Moravskoslezský kraj | Mozaika hlavních výkresů (`gis2.msk.cz`) |
| Plzeň, Olomouc, Zlín, České Budějovice | Vlastní data měst (výkres, u Plzně, Olomouce a Zlína i plochy s typem) |
| Výkres z PDF | Hlavní výkres úplného znění v PDF z webu obce, vlícovaný proti katastrální mapě (`scripts/vykresy.py`): 39 měst, mezi nimi okresní města Znojmo, Břeclav, Vyškov, Blansko, Rychnov nad Kněžnou a Semily |
| Parcely, adresy, obce, ochrana přírody, BPEJ, hledání | RÚIAN, ČÚZK (`ags.cuzk.cz`) |
| Hranice a čísla parcel | Katastrální mapa WMS, ČÚZK |
| Počty obyvatel obcí | ČSÚ, stav k 1. 1. 2026 |
| Letecký snímek, základní mapa | ČÚZK |
| Radonový index 1 : 50 000 | Česká geologická služba |
| Záplavová území | VÚV TGM (`ags.vuv.cz`) |
| Podkladová mapa | OpenStreetMap, OpenMapTiles, OpenFreeMap |

## Jak to funguje uvnitř

* Mapa: OpenLayers 10, vektorový podklad přes ol-mapbox-style (styl Positron a Dark z OpenFreeMap, popisky v češtině a písmem Archivo nad plánem).
* Národní geoportál nepovoluje CORS, proto se dotazy posílají jako JSONP (`callback=`), což ArcGIS REST podporuje.
* Na úrovni ulic se plochy stahují jako vektory (dlaždice z15/z14) a kreslí se v prohlížeči. Ve středním měřítku kreslí obraz server přes `dynamicLayers`, takže režimy „Chci postavit“ a „Co se tu chystá“ fungují i při pohledu na celé město.
* Geoportál drží i starší verze plánů. Appka u každé obce pozná nejnovější úplnou verzi a starší vyfiltruje, změny nad ní nechá.
* Krajská, ORP a městská data jsou popsaná v `data/regionalni_mozaiky.json`: ArcGIS dlaždice a exporty, WMS (Marushka, T-MAPY, HYDROSOFT, GEPRO), dotazy na plochu přes ArcGIS, GetFeatureInfo nebo WFS, výkresy po obcích. Každá vrstva se ořízne hranicí kraje nebo obce a vynechá obce, které mají lepší nebo aktuálnější data. Hranice bere z RÚIAN.
* `scripts/pokryti.py` u každé obce ověří dotazem na bod v její hlavní části, který zdroj ji opravdu ukáže, a uloží to do `data/pokryti.json` a `docs/pokryti.md`. `scripts/stav_up.py` stáhne z evidence NGÚP stav územního plánu každé obce. `build.py` z obojího složí `dist/obce.json`, podle kterého appka vybírá zdroj pro kartu a kreslí mapu pokrytí.
* `scripts/vykresy.py` vlícuje hlavní výkres z PDF: maska barevných ploch výkresu se přiloží na hranici obce z RÚIAN (měřítko, posun a případně otočení listu), u GeoPDF poslouží i georeference uložená v souboru. Pak se v oknech po celé obci změří posun čar výkresu proti katastrální mapě ČÚZK a dopočte se afinní transformace; okna s falešnou shodou se vyřadí. Výkres se do mapy dá jen s odchylkou do 5 m a jen když pokrývá celé území obce. Umí i PDF v ZIPu, výkresy v měřítku 1 : 10 000 a výkres rozdělený do víc PDF po katastrálních územích. Dlaždice z12 až z16 ve WebP jsou v `data/vykresy/`, dohromady nejvýš 100 MB.
* Kódy ploch z krajských dat (starší standard MINIS a krajské varianty) převádí na typy podle vyhlášky č. 157/2024 Sb. nejdřív podle názvu plochy, pak podle zkratky. Výklad je proto orientační.
* Mapa startuje až po události `load`, aby pomalé servery krajů nezdržovaly načtení stránky.

## Omezení

* Jednotná data má zatím jen 385 obcí. Ostatní mapa ukazuje z dat krajů, ORP a měst, většinou jako obrázek výkresu, který neumí převést do lidské řeči.
* Teplice a Ostrov nezveřejnily úplné znění územního plánu po změnách, výkres bez změn by byl zastaralý. Výkres Železného Brodu z roku 2008 nesedí na dnešní katastrální mapu (odchylka až 7 m). Karta u nich pošle na dokumenty obce.
* Výkresy z PDF mají limit 100 MB dlaždic. Přednost dostala okresní města a sídla ORP bez mapové služby, na další města (Klášterec nad Ohří, Duchcov, Červený Kostelec, Hronov, Úpice, Česká Skalice, Police nad Metují, Velké Poříčí) už nezbylo místo; mají připravené zdroje v `data/vykresy_zdroje.json`.
* Olomoucký kraj nemá veřejnou službu s plány všech obcí (kraj je má za heslem), mapa tam umí jen města (část z nich jako výkres z PDF) a ORP Šumperk, Zábřeh a Hranice. Krajské služby Zlínského a Pardubického kraje u obcí neuvádějí verzi plánu, karta na to upozorní.
* Portál územních plánů Královéhradeckého kraje je od října 2026 v odstávce kvůli bezpečnostní chybě. Jeho mapové služby zatím odpovídají, mapa je používá jen u obcí, kde je verze aktuální.
* Evidence NGÚP se proti obcím zpožďuje: obce plány doplňují postupně a nové změny se tam objevují se zpožděním.
* Krajská data kraje samy označují jako informativní. Některá mohou být starší než poslední změna plánu obce. Data Zlína odpovídají stavu po změně 4C, výkres Českých Budějovic je snímek z roku 2022.
* Výklad „co se tu smí postavit“ je orientační podle typu plochy. Přesné podmínky stanoví textová část územního plánu obce.
* Neoficiální nástroj nad otevřenými daty státu, nenahrazuje územně plánovací informaci ani vyjádření stavebního úřadu.

## Úpravy

Zdrojáky jsou rozdělené (`src/app.js`, `src/plain.js` s lidskými popisy ploch, `src/style.css`, `src/index.template.html`) a `build.py` z nich složí `dist/`. Jak projekt funguje, jaká má pravidla a na co si dát u služeb pozor, je v `CLAUDE.md`, ze kterého vychází i Claude Code.

* `python build.py` postaví web, `python -m http.server 8080 -d dist` ho pustí lokálně.
* `npx playwright test` projde smoke testy (vybraná místa ze všech typů zdrojů, která odpovídají i ze zahraničí, kde běží GitHub).
* `python scripts/check_sources.py` zkontroluje, že odpovídají všechny služby krajů a měst. Na GitHubu jde spustit ručně (Actions, Kontrola zdrojů) a při výpadku založí issue. Servery Středočeského a Moravskoslezského kraje z ciziny neodpovídají, jejich chybu z GitHubu je proto potřeba ověřit z české sítě.
* Po změně zdrojů: `python scripts/pokryti.py --kraj <kód>` (ověří jen daný kraj), u výkresů z PDF `python scripts/vykresy.py --obec <kód>`. Stav plánů jednou za čas `python scripts/stav_up.py` a `--recheck`.
* Netlify nasazuje z větve `main` podle `netlify.toml`, každý pull request dostane náhled.
