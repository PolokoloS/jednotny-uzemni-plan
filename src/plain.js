// Lidský výklad typů ploch podle jednotného standardu ÚP (vyhláška 157/2024 Sb.).
// t = lidský název, d = co to znamená, i = co tu typicky smíš postavit
// pořadí v i: [rodinný dům, bytový dům, chata, obchod a služby, dílna a výroba]
// 2 = typicky ano, 1 = záleží na podmínkách ÚP obce, 0 = spíš ne
const PLAIN = {
  BU: { t: 'Bydlení', d: 'Plocha pro bydlení bez užšího zaměření. Typicky rodinné i bytové domy a k nim drobné obchody, služby nebo školka, pokud neruší okolí.', i: [2, 2, 0, 1, 0] },
  BV: { t: 'Venkovské bydlení', d: 'Rodinné domy se zahradou a hospodářským zázemím, třeba stodolou nebo chovem drobného zvířectva. Často je tu povolené i drobné řemeslo.', i: [2, 0, 1, 1, 1] },
  BI: { t: 'Rodinné domy', d: 'Bydlení v rodinných domech se zahradou, vilové a příměstské čtvrti. Bytové domy a výroba sem většinou nepatří.', i: [2, 0, 0, 1, 0] },
  BH: { t: 'Bytové domy', d: 'Bytové domy a sídliště. Obchody a služby v přízemí bývají v pořádku, rodinný dům tu je spíš výjimka.', i: [1, 2, 0, 1, 0] },
  BX: { t: 'Bydlení se zvláštním režimem', d: 'Bydlení s pravidly, která si obec stanovila sama, třeba domy s pečovatelskou službou. Co přesně se tu smí, říká textová část ÚP.', i: [1, 1, 0, 1, 0] },

  RU: { t: 'Rekreace', d: 'Plocha pro rekreaci bez užšího zaměření: chaty, ubytování, sportoviště a zázemí pro volný čas.', i: [0, 0, 2, 1, 0] },
  RI: { t: 'Chaty a chalupy', d: 'Individuální rekreace, tedy chaty a rekreační chalupy. Trvalé bydlení v rodinném domě sem obvykle nepatří.', i: [0, 0, 2, 0, 0] },
  RZ: { t: 'Zahrádkářská osada', d: 'Zahrádky s malými chatkami nebo kůlnami. Velké stavby ani trvalé bydlení tu nejsou.', i: [0, 0, 1, 0, 0] },
  RO: { t: 'Oddechová plocha', d: 'Místo k odpočinku a sportu pod širým nebem: hřiště, pikniková místa, koupaliště.', i: [0, 0, 0, 1, 0] },
  RH: { t: 'Hromadná rekreace', d: 'Kempy, rekreační areály, hotely a penziony.', i: [0, 0, 1, 1, 0] },
  RX: { t: 'Rekreace se zvláštním režimem', d: 'Rekreace s pravidly, která si obec stanovila sama. Detaily jsou v textové části ÚP.', i: [0, 0, 1, 1, 0] },

  OU: { t: 'Občanské vybavení', d: 'Stavby pro služby lidem: obchody, úřady, školy, zdravotnictví, kultura.', i: [0, 0, 0, 2, 0] },
  OV: { t: 'Veřejná vybavenost', d: 'Škola, školka, úřad, nemocnice, hasičárna nebo kulturní dům. Většinou je staví a vlastní obec nebo stát.', i: [0, 0, 0, 1, 0] },
  OK: { t: 'Obchody a služby', d: 'Komerční vybavenost: obchody, restaurace, kanceláře, hotely, autosalony.', i: [0, 0, 0, 2, 1] },
  OS: { t: 'Sportoviště', d: 'Hřiště, stadiony, sportovní haly, bazény a jejich zázemí.', i: [0, 0, 0, 1, 0] },
  OL: { t: 'Lázně', d: 'Lázeňské domy, kolonády a ubytování pro lázeňské hosty.', i: [0, 0, 1, 1, 0] },
  OH: { t: 'Hřbitov', d: 'Hřbitov a stavby, které k němu patří. Nic jiného se tu nestaví.', i: [0, 0, 0, 0, 0] },
  OX: { t: 'Vybavenost se zvláštním režimem', d: 'Občanské vybavení s určením, které si obec stanovila sama.', i: [0, 0, 0, 1, 0] },

  PU: { t: 'Veřejné prostranství', d: 'Náměstí, ulice, chodníky a parky. Místo přístupné všem, soukromá stavba sem nepatří.', i: [0, 0, 0, 0, 0] },
  PX: { t: 'Veřejné prostranství se zvláštním režimem', d: 'Prostor přístupný všem s pravidly, která si určila obec. Bez soukromých staveb.', i: [0, 0, 0, 0, 0] },

  ZU: { t: 'Zeleň v obci', d: 'Zeleň uvnitř zástavby. Stavět se tu nedá, nanejvýš cesta, lavička nebo altán.', i: [0, 0, 0, 0, 0] },
  ZP: { t: 'Park', d: 'Park nebo parkově upravená zeleň pro odpočinek. Bez budov.', i: [0, 0, 0, 0, 0] },
  ZZ: { t: 'Zahrady a sady', d: 'Zahrady a sady. Obvykle jen drobné stavby jako kůlna nebo skleník, dům ne.', i: [0, 0, 0, 0, 0] },
  ZO: { t: 'Ochranná zeleň', d: 'Pás zeleně, který odcloní hluk, prach nebo pohled, třeba mezi silnicí a domy. Nestaví se tu.', i: [0, 0, 0, 0, 0] },
  ZS: { t: 'Ostatní zeleň v obci', d: 'Zbylá zeleň v zástavbě. Bez staveb.', i: [0, 0, 0, 0, 0] },
  ZK: { t: 'Zeleň v krajině', d: 'Remízky, aleje a břehové porosty. Bez staveb.', i: [0, 0, 0, 0, 0] },
  ZX: { t: 'Zeleň se zvláštním režimem', d: 'Zeleň s pravidly, která si stanovila obec.', i: [0, 0, 0, 0, 0] },

  SU: { t: 'Bydlení se službami', d: 'Smíšené obytné území: domy, byty, obchody, kanceláře i nerušící provozovny vedle sebe.', i: [2, 2, 0, 2, 1] },
  SV: { t: 'Vesnická zástavba', d: 'Typická vesnice: statky a rodinné domy, malé obchody, řemesla a zemědělské zázemí.', i: [2, 1, 1, 2, 1] },
  SM: { t: 'Městská zástavba', d: 'Bytové domy s obchody a kancelářemi, rušnější městské ulice.', i: [1, 2, 0, 2, 1] },
  SC: { t: 'Centrum města', d: 'Náměstí a hlavní ulice, kde se mísí bydlení, úřady, obchody a kultura.', i: [0, 2, 0, 2, 0] },
  SX: { t: 'Smíšené území se zvláštním režimem', d: 'Smíšené obytné území s pravidly, která si obec stanovila sama.', i: [1, 1, 0, 1, 1] },

  DU: { t: 'Doprava', d: 'Pozemky pro dopravu: silnice, parkoviště, garáže, nádraží.', i: [0, 0, 0, 0, 0] },
  DS: { t: 'Silnice', d: 'Silnice, křižovatky, parkoviště a čerpací stanice.', i: [0, 0, 0, 0, 0] },
  DN: { t: 'Pěší a cyklo cesty', d: 'Cesty pro pěší a cyklisty.', i: [0, 0, 0, 0, 0] },
  DD: { t: 'Železnice', d: 'Železniční nebo tramvajová trať a její zázemí.', i: [0, 0, 0, 0, 0] },
  DV: { t: 'Vodní doprava', d: 'Přístavy, plavební kanály a jejich zázemí.', i: [0, 0, 0, 0, 0] },
  DL: { t: 'Letiště', d: 'Letiště a letecké zázemí.', i: [0, 0, 0, 0, 0] },
  DK: { t: 'Překladiště', d: 'Terminály, kde se potkává víc druhů dopravy.', i: [0, 0, 0, 0, 0] },
  DX: { t: 'Doprava se zvláštním režimem', d: 'Doprava s určením, které si stanovila obec.', i: [0, 0, 0, 0, 0] },

  TU: { t: 'Technická infrastruktura', d: 'Pozemky pro sítě: vodárny, čistírny, rozvodny, vysílače.', i: [0, 0, 0, 0, 0] },
  TW: { t: 'Vodárna a čistírna', d: 'Úpravna vody, vodojem nebo čistírna odpadních vod.', i: [0, 0, 0, 0, 0] },
  TE: { t: 'Energetika', d: 'Rozvodny, trafostanice a výměníky.', i: [0, 0, 0, 0, 0] },
  TS: { t: 'Telekomunikace', d: 'Vysílače a telekomunikační zařízení.', i: [0, 0, 0, 0, 0] },
  TO: { t: 'Odpady', d: 'Sběrný dvůr, skládka nebo třídírna odpadu.', i: [0, 0, 0, 0, 0] },
  TX: { t: 'Sítě se zvláštním režimem', d: 'Technická infrastruktura s určením, které si stanovila obec.', i: [0, 0, 0, 0, 0] },

  VU: { t: 'Výroba', d: 'Průmysl a výroba bez užšího zaměření: haly, sklady, dílny.', i: [0, 0, 0, 1, 2] },
  VT: { t: 'Těžký průmysl a energetika', d: 'Těžký průmysl a elektrárny, tedy provoz, který může rušit okolí.', i: [0, 0, 0, 0, 2] },
  VL: { t: 'Lehký průmysl', d: 'Montovny a menší výrobní haly.', i: [0, 0, 0, 1, 2] },
  VD: { t: 'Dílny a řemesla', d: 'Dílny, opravny, řemeslo a menší provozovny, často i s prodejnou.', i: [0, 0, 0, 2, 2] },
  VS: { t: 'Sklady a logistika', d: 'Sklady a logistická centra.', i: [0, 0, 0, 1, 2] },
  VZ: { t: 'Zemědělský areál', d: 'Kravíny, sklady, seníky, pila nebo zahradnictví.', i: [0, 0, 0, 0, 2] },
  VE: { t: 'Obnovitelná energie', d: 'Fotovoltaika, bioplynová stanice nebo větrné elektrárny.', i: [0, 0, 0, 0, 1] },
  VX: { t: 'Výroba se zvláštním režimem', d: 'Výroba s pravidly, která si obec stanovila sama.', i: [0, 0, 0, 1, 1] },

  HU: { t: 'Výroba a služby', d: 'Smíšené výrobní území: firemní areály, kde se dá vyrábět, skladovat i prodávat.', i: [0, 0, 0, 2, 2] },
  HX: { t: 'Výroba a služby se zvláštním režimem', d: 'Smíšená výrobní plocha s pravidly obce.', i: [0, 0, 0, 1, 1] },

  WU: { t: 'Voda', d: 'Řeky, potoky, rybníky a nádrže.', i: [0, 0, 0, 0, 0] },
  WT: { t: 'Vodní tok', d: 'Koryto řeky nebo potoka.', i: [0, 0, 0, 0, 0] },
  WH: { t: 'Vodohospodářská stavba', d: 'Hráze, poldry a protipovodňová opatření.', i: [0, 0, 0, 0, 0] },
  WX: { t: 'Voda se zvláštním režimem', d: 'Vodní plocha s pravidly obce.', i: [0, 0, 0, 0, 0] },

  AU: { t: 'Zemědělská půda', d: 'Pole, louky a pastviny. Běžně se tu nestaví. Výjimkou bývají stavby pro zemědělství, pokud je ÚP nevylučuje.', i: [0, 0, 0, 0, 0] },
  AP: { t: 'Pole', d: 'Orná půda. Stavět se tu běžně nedá.', i: [0, 0, 0, 0, 0] },
  AL: { t: 'Louky a pastviny', d: 'Trvalé travní porosty. Nanejvýš přístřešek pro zvířata nebo seník, když to ÚP dovolí.', i: [0, 0, 0, 0, 0] },
  AT: { t: 'Sady a vinice', d: 'Trvalé kultury: sady, vinice, chmelnice.', i: [0, 0, 0, 0, 0] },
  AX: { t: 'Zemědělská půda se zvláštním režimem', d: 'Zemědělská plocha s pravidly obce.', i: [0, 0, 0, 0, 0] },

  LU: { t: 'Les', d: 'Lesní pozemky. Stavět se tu nedá, kromě staveb pro lesní hospodaření.', i: [0, 0, 0, 0, 0] },
  LX: { t: 'Les se zvláštním režimem', d: 'Les s pravidly obce.', i: [0, 0, 0, 0, 0] },

  NU: { t: 'Příroda', d: 'Cenná příroda, často chráněné území nebo biocentrum. Nestaví se tu.', i: [0, 0, 0, 0, 0] },
  NX: { t: 'Příroda se zvláštním režimem', d: 'Přírodní plocha s pravidly obce.', i: [0, 0, 0, 0, 0] },

  MU: { t: 'Smíšená krajina', d: 'Krajina, kde se mísí louky, remízky, sady a vodní plochy. Bez běžné zástavby.', i: [0, 0, 0, 0, 0] },
  MX: { t: 'Smíšená krajina se zvláštním režimem', d: 'Smíšená krajina s pravidly obce.', i: [0, 0, 0, 0, 0] },

  GU: { t: 'Těžba', d: 'Lom, pískovna nebo jiné místo těžby.', i: [0, 0, 0, 0, 0] },
  GD: { t: 'Dobývání suroviny', d: 'Plocha, kde se těží a upravuje surovina.', i: [0, 0, 0, 0, 0] },
  GZ: { t: 'Zázemí těžby', d: 'Stavby a zařízení pro těžbu.', i: [0, 0, 0, 0, 1] },
  GX: { t: 'Těžba se zvláštním režimem', d: 'Těžba s pravidly obce.', i: [0, 0, 0, 0, 0] },

  XZ: { t: 'Zvláštní určení', d: 'Typicky armáda nebo bezpečnost státu. Běžná výstavba tu není.', i: [0, 0, 0, 0, 0] },
  XX: { t: 'Specifická plocha', d: 'Plocha, kterou si obec definovala sama. Co se tu smí, říká jen textová část ÚP.', i: [1, 1, 1, 1, 1] },

  MO: { t: 'Městská obytná čtvrť', d: 'Městský typ plánu: čtvrť hlavně pro bydlení s obchody a službami.', i: [1, 2, 0, 2, 1] },
  MR: { t: 'Městská rekreace', d: 'Městská plocha pro rekreaci a sport, parky se zázemím.', i: [0, 0, 1, 1, 0] },
  MP: { t: 'Městská produkce', d: 'Městská plocha pro výrobu, sklady a podnikání.', i: [0, 0, 0, 2, 2] },

  NN: { t: 'Volná krajina, příroda', d: 'Volná krajina s převahou přírody. Bez zástavby.', i: [0, 0, 0, 0, 0] },
  NR: { t: 'Volná krajina, rekreace', d: 'Volná krajina pro výlety a rekreaci: cesty, vyhlídky, koupání.', i: [0, 0, 0, 0, 0] },
  NP: { t: 'Volná krajina, hospodaření', d: 'Volná krajina pro zemědělství a lesnictví.', i: [0, 0, 0, 0, 0] }
};

// Rodiny ploch pro legendu (pořadí = pořadí v legendě)
const FAMILIES = [
  ['bydleni', 'Bydlení', ['BU', 'BV', 'BI', 'BH', 'BX']],
  ['smisene', 'Bydlení se službami', ['SU', 'SV', 'SM', 'SC', 'SX', 'MO']],
  ['rekreace', 'Rekreace', ['RU', 'RI', 'RZ', 'RO', 'RH', 'RX', 'MR']],
  ['obcanske', 'Občanská vybavenost', ['OU', 'OV', 'OK', 'OS', 'OL', 'OH', 'OX']],
  ['vyroba', 'Výroba a sklady', ['VU', 'VT', 'VL', 'VD', 'VS', 'VZ', 'VE', 'VX', 'HU', 'HX', 'MP']],
  ['prostranstvi', 'Veřejná prostranství a zeleň', ['PU', 'PX', 'ZU', 'ZP', 'ZZ', 'ZO', 'ZS', 'ZK', 'ZX']],
  ['doprava', 'Doprava a sítě', ['DU', 'DS', 'DN', 'DD', 'DV', 'DL', 'DK', 'DX', 'TU', 'TW', 'TE', 'TS', 'TO', 'TX']],
  ['krajina', 'Krajina', ['AU', 'AP', 'AL', 'AT', 'AX', 'LU', 'LX', 'NU', 'NX', 'MU', 'MX', 'NN', 'NR', 'NP', 'WU', 'WT', 'WH', 'WX']],
  ['ostatni', 'Ostatní', ['GU', 'GD', 'GZ', 'GX', 'XZ', 'XX']]
];
