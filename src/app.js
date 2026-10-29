'use strict';
(function () {
  if (!window.ol || !window.proj4) {
    const el = document.getElementById('toast');
    if (el) { el.textContent = 'Mapové knihovny se nenačetly. Zkontrolujte připojení k internetu a obnovte stránku.'; el.hidden = false; }
    return;
  }
  // ---------------------------------------------------------------------------
  // Konfigurace a data
  // ---------------------------------------------------------------------------
  const CFG = {
    ngup: 'https://mapy.gov.cz/server/rest/services/UPD/',
    ruian: 'https://ags.cuzk.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/',
    geocode: 'https://ags.cuzk.cz/arcgis/rest/services/RUIAN/Vyhledavaci_sluzba_nad_daty_RUIAN/MapServer/exts/GeocodeSOE/',
    radon: 'https://mapy.geology.cz/arcgis/rest/services/Geohazardy/radon50/MapServer/',
    flood: 'https://ags.vuv.cz/arcgis/rest/services/isvs_voda/isvs_voda/MapServer/',
    ngupDocs: 'https://uzemniplanovani.gov.cz/dokumenty-obci',
    kmWms: 'https://services.cuzk.cz/wms/local-km-wms.asp',
    vectorMinZoom: 14.6,
    rasterMinZoom: 13.05,
    coverageMaxZoom: 13.4,
    cardMinZoom: 11.5,
    showcase: { lon: 15.090024, lat: 50.749004, z: 16.3 },
    // veřejná adresa pro QR kód (náhled i lokální soubor vedou sem)
    publicHost: 'venerable-custard-504746.netlify.app',
    publicUrl: 'https://venerable-custard-504746.netlify.app/'
  };
  const INTENTS = [
    { label: 'Rodinný dům', acc: 'rodinný dům', icon: 'i-rd', key: 'rd' },
    { label: 'Bytový dům', acc: 'bytový dům', icon: 'i-bd', key: 'bd' },
    { label: 'Chata', acc: 'chatu', icon: 'i-chata', key: 'chata' },
    { label: 'Obchod, služby', acc: 'obchod nebo služby', icon: 'i-obchod', key: 'obchod' },
    { label: 'Dílna, výroba', acc: 'dílnu nebo výrobu', icon: 'i-dilna', key: 'dilna' }
  ];
  const VERDICT = ['Spíš ne', 'Záleží na podmínkách', 'Typicky ano'];
  const VERDICT_ICON = ['i-no', 'i-maybe', 'i-yes'];

  const TYPE = {};
  STD.forEach(s => { TYPE[s.c] = { n: s.n, rgb: s.rgb }; });
  const FAMILY_OF = {};
  FAMILIES.forEach(([, , codes], i) => codes.forEach(c => { FAMILY_OF[c] = i; }));
  const COVMAP = new Map(COV.map(o => [o[0], o]));
  const SUP_ALL = new Set(SUP_EXTRA);
  Object.values(SUP).forEach(a => a.forEach(id => SUP_ALL.add(id)));

  const S = { intent: null, plan: false, base: 'map', sel: null, layers: { up: true, parcels: true, radon: false, nature: false, flood: false, regional: true } };

  // ---------------------------------------------------------------------------
  // Pomocné funkce
  // ---------------------------------------------------------------------------
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = id => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  const fmtInt = n => Math.round(n).toLocaleString('cs-CZ');
  const nul = v => (v === undefined || v === null || v === 'Null' || v === '' || v === ' ') ? null : v;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dur = ms => (reduceMotion ? 0 : ms);
  const isMobile = () => matchMedia('(max-width: 760px)').matches;
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  const darken = (rgb, f) => rgb.map(v => Math.round(v * (1 - f)));
  const czDate = ms => { const d = new Date(+ms); return isNaN(d) ? null : `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`; };
  const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
  const niceRound = n => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1)); return Math.round(n / p) * p; };

  let jsonpSeq = 0;
  function jsonp(url, timeout) {
    return new Promise((resolve, reject) => {
      const cb = '__jup' + (++jsonpSeq);
      const s = document.createElement('script');
      let done = false;
      const finish = () => { done = true; clearTimeout(t); window[cb] = function () {}; s.remove(); };
      const t = setTimeout(() => { if (!done) { finish(); reject(new Error('timeout')); } }, timeout || 25000);
      window[cb] = data => {
        if (done) return; finish();
        if (data && data.error) reject(new Error(data.error.message || 'chyba serveru')); else resolve(data);
      };
      s.onerror = () => { if (!done) { finish(); reject(new Error('network')); } };
      s.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cb;
      document.head.appendChild(s);
    });
  }
  async function fetchJSON(url, timeout) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout || 15000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j && j.error) throw new Error(j.error.message || 'chyba serveru');
      return j;
    } finally { clearTimeout(t); }
  }
  let busy = 0;
  function track(p) {
    busy++; $('#progress').hidden = false;
    return p.finally(() => { busy = Math.max(0, busy - 1); if (!busy) $('#progress').hidden = true; });
  }
  let toastTimer;
  function toast(msg, ms) {
    const el = $('#toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms || 5200);
  }

  // ---------------------------------------------------------------------------
  // Téma a projekce
  // ---------------------------------------------------------------------------
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  const themeNow = () => { const t = document.documentElement.getAttribute('data-theme'); return t === 'dark' || t === 'light' ? t : (mqDark.matches ? 'dark' : 'light'); };
  let theme = themeNow();

  proj4.defs('EPSG:5514', '+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813972222222 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=570.8,85.7,462.8,4.998,1.587,5.261,3.56 +units=m +no_defs');
  ol.proj.proj4.register(proj4);
  const toSjtsk = coord => proj4('EPSG:4326', 'EPSG:5514', ol.proj.toLonLat(coord));

  function pal() {
    return theme === 'dark'
      ? { fillA: 0.72, edge: 'rgba(255,255,255,0.2)', ok: [99, 199, 148], maybe: [240, 179, 77], no: [150, 160, 155], hatchBgA: 0.16, sel: '#91a7ff', selRgb: [145, 167, 255], halo: 'rgba(22,27,25,0.92)', label: '#e8ece9', labelHalo: 'rgba(22,27,25,0.9)' }
      : { fillA: 0.86, edge: 'rgba(23,28,26,0.3)', ok: [29, 122, 78], maybe: [176, 108, 10], no: [110, 118, 114], hatchBgA: 0.22, sel: '#2342d6', selRgb: [35, 66, 214], halo: 'rgba(255,255,255,0.95)', label: '#171c1a', labelHalo: 'rgba(255,255,255,0.92)' };
  }

  // ---------------------------------------------------------------------------
  // Vrstvy
  // ---------------------------------------------------------------------------
  const dpr = window.devicePixelRatio || 1;
  const OFM_ATTR = 'Mapa © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>, <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>';
  const OFM_STYLE = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' };
  const FONT_MAP = { 'Noto Sans Regular': 'Archivo Regular', 'Noto Sans Bold': 'Archivo SemiBold', 'Noto Sans Italic': 'Archivo Italic' };
  const ortoSource = new ol.source.XYZ({ url: 'https://ags.cuzk.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer/tile/{z}/{y}/{x}', maxZoom: 19, transition: dur(180) });
  const ztmSource = new ol.source.XYZ({ url: 'https://ags.cuzk.cz/arcgis1/rest/services/ZTM_WM/MapServer/tile/{z}/{y}/{x}', maxZoom: 18, transition: dur(180) });

  // rastrový podklad (letecký snímek, ZTM, nouzově i za vektorovou mapu)
  const baseLayer = new ol.layer.Tile({ zIndex: 0, preload: 1, visible: false });
  // vektorová mapa OpenFreeMap: plochy pod územním plánem, popisky nad ním
  let baseVT = null, labelVT = null, vectorBaseFailed = false, vectorBuild = 0;
  const glStyles = {};
  async function loadGlStyle(th) {
    if (glStyles[th]) return glStyles[th];
    const j = await fetchJSON(OFM_STYLE[th], 12000);
    (j.layers || []).forEach(l => {
      const lay = l.layout || {};
      const tf = lay['text-font'];
      if (Array.isArray(tf)) lay['text-font'] = tf.map(f => FONT_MAP[f] || f);
      const txt = lay['text-field'];
      // české názvy míst místo anglických, s návratem k místnímu názvu
      if (Array.isArray(txt)) lay['text-field'] = JSON.parse(JSON.stringify(txt).split('["get","name_en"]').join('["get","name:cs"]'));
      else if (typeof txt === 'string') lay['text-field'] = txt.split('{name_en}').join('{name}');
    });
    j.metadata = Object.assign({}, j.metadata, { 'ol:webfonts': 'https://cdn.jsdelivr.net/npm/@fontsource/{font-family}/{fontweight}{-fontstyle}.css' });
    glStyles[th] = j;
    return j;
  }
  async function buildVectorBase() {
    const token = ++vectorBuild, th = theme;
    try {
      if (!window.olms) throw new Error('olms');
      const gl = await loadGlStyle(th);
      if (token !== vectorBuild) return;
      const vec = (gl.layers || []).filter(l => l.source && gl.sources[l.source] && gl.sources[l.source].type === 'vector');
      const srcId = vec.length ? vec[0].source : null;
      const baseIds = vec.filter(l => l.source === srcId && l.type !== 'symbol').map(l => l.id);
      const labelIds = vec.filter(l => l.source === srcId && l.type === 'symbol').map(l => l.id);
      const b = new ol.layer.VectorTile({ zIndex: 1, declutter: false, preload: 0 });
      await olms.applyStyle(b, gl, { layers: baseIds, updateSource: true });
      try { await olms.applyBackground(b, gl); } catch (_) { /* nepovinné */ }
      const lb = new ol.layer.VectorTile({ zIndex: 50, declutter: true, source: b.getSource() });
      await olms.applyStyle(lb, gl, { layers: labelIds, updateSource: false });
      if (token !== vectorBuild) return;
      if (baseVT) map.removeLayer(baseVT);
      if (labelVT) map.removeLayer(labelVT);
      baseVT = b; labelVT = lb;
      map.addLayer(b); map.addLayer(lb);
      vectorBaseFailed = false;
      applyBase();
    } catch (e) {
      if (token !== vectorBuild) return;
      vectorBaseFailed = true;
      applyBase();
    }
  }

  const upRaster = new ol.layer.Image({
    zIndex: 10, minZoom: CFG.rasterMinZoom, maxZoom: CFG.vectorMinZoom, opacity: 0.66, className: 'ol-layer up-plan',
    source: new ol.source.ImageArcGISRest({ url: CFG.ngup + 'DUP_HLV/MapServer', ratio: 1.15, params: { layers: 'show:12', format: 'png32', transparent: true } })
  });

  const esri = new ol.format.EsriJSON();
  let upErrorAt = 0;
  function supersededFor(extent) {
    const e4 = ol.proj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326');
    const ids = [];
    for (const o of COV) {
      const hw = o[5] / 2 + 0.003, hh = o[6] / 2 + 0.003;
      if (o[3] + hw < e4[0] || o[3] - hw > e4[2] || o[4] + hh < e4[1] || o[4] - hh > e4[3]) continue;
      const sup = SUP[o[0]];
      if (sup && sup.length) ids.push(...sup);
    }
    return ids;
  }
  const loadGrid = ol.tilegrid.createXYZ({ maxZoom: 15 });
  function loadStrategy(extent, resolution) {
    const z = resolution > 3.2 ? 14 : 15;
    const out = [];
    loadGrid.forEachTileCoord(extent, z, tc => out.push(loadGrid.getTileCoordExtent(tc)));
    return out;
  }
  // Serverový obraz plánu pro střední měřítka: filtruje starší verze a umí obarvit plochy podle záměru
  let rasterKey = '';
  function rasterParams() {
    const size = map.getSize();
    const ext = size ? view.calculateExtent(size) : null;
    const ids = ext ? supersededFor(ext) : [];
    // Pozor: firewall serveru odmítá výrazy typu "x=1) AND ...", proto jen seznamy IN.
    const sup = ids.length ? `id_metadata NOT IN (${ids.join(',')})` : null;
    const def = x => (sup ? `(${x}) AND ${sup}` : x);
    if (S.intent === null && !S.plan) return { layers: 'show:12', layerDefs: sup ? JSON.stringify({ 12: sup }) : undefined, dynamicLayers: undefined };
    return { layers: undefined, layerDefs: undefined, dynamicLayers: JSON.stringify(modeDynamicLayers(12, 'typ', 'cash', def)) };
  }
  // Serverové přebarvení ploch podle režimu (záměr nebo plánované změny) pro služby s typem plochy podle standardu
  function modeDynamicLayers(mapLayerId, typF, cashF, def, alias) {
    def = def || (x => x);
    const P = pal();
    const sfs = (style, fill, line, w) => ({ type: 'esriSFS', style, color: fill, outline: { type: 'esriSLS', style: 'esriSLSSolid', color: line, width: w } });
    const ent = (id, x, symbol) => ({ id, source: { type: 'mapLayer', mapLayerId }, definitionExpression: def(x), drawingInfo: { renderer: { type: 'simple', symbol } } });
    if (S.intent !== null) {
      const byV = [[], [], []];
      Object.keys(PLAIN).forEach(c => byV[PLAIN[c].i[S.intent]].push(`'${c}'`));
      if (alias) Object.keys(alias).forEach(a => { const t = PLAIN[alias[a]]; if (t) byV[t.i[S.intent]].push(`'${a}'`); });
      const dl = [];
      if (byV[0].length) dl.push(ent(201, `${typF} IN (${byV[0].join(',')})`, sfs('esriSFSSolid', P.no.concat(38), P.no.concat(80), 0.4)));
      if (byV[1].length) dl.push(ent(202, `${typF} IN (${byV[1].join(',')})`, sfs('esriSFSBackwardDiagonal', P.maybe.concat(235), P.maybe.concat(255), 0.8)));
      if (byV[2].length) dl.push(ent(203, `${typF} IN (${byV[2].join(',')})`, sfs('esriSFSSolid', P.ok.concat(150), darken(P.ok, 0.2).concat(235), 0.6)));
      return dl;
    }
    return [
      ent(211, `${cashF} IN (1)`, sfs('esriSFSSolid', P.no.concat(46), P.no.concat(90), 0.3)),
      ent(212, `${cashF} IN (2)`, sfs('esriSFSForwardDiagonal', P.selRgb.concat(235), P.selRgb.concat(255), 1.2))
    ];
  }
  function updateRaster() {
    if (!upRaster) return;
    const p = rasterParams();
    const key = JSON.stringify(p);
    if (key === rasterKey) return;
    rasterKey = key;
    upRaster.getSource().updateParams(p);
  }

  const upSource = new ol.source.Vector({
    strategy: loadStrategy,
    loader(extent, resolution, projection, success, failure) {
      const ids = supersededFor(extent);
      const where = ids.length ? `id_metadata NOT IN (${ids.join(',')})` : '1=1';
      const url = CFG.ngup + 'DUP_HLV/MapServer/12/query?f=json'
        + '&where=' + encodeURIComponent(where)
        + '&outFields=objectid,typ,cash,ident,id_metadata&returnGeometry=true'
        + '&geometry=' + extent.map(v => v.toFixed(1)).join(',')
        + '&geometryType=esriGeometryEnvelope&inSR=3857&outSR=3857&spatialRel=esriSpatialRelIntersects'
        + '&maxAllowableOffset=0.8&geometryPrecision=1&orderByFields=objectid&resultRecordCount=2000';
      track((async () => {
        const feats = [];
        for (let off = 0, guard = 0; guard < 8; guard++) {
          const d = await jsonp(url + '&resultOffset=' + off);
          const page = esri.readFeatures(d, { dataProjection: 'EPSG:3857', featureProjection: 'EPSG:3857' });
          for (const f of page) {
            f.setId('p' + f.get('objectid'));
            if (!SUP_ALL.has(f.get('id_metadata'))) feats.push(f);
          }
          if (d.exceededTransferLimit && page.length) off += page.length; else break;
        }
        upSource.addFeatures(feats);
        success(feats);
        scheduleLegend();
        if (S.sel && !S.sel.outlined) outlineSelected();
      })()).catch(() => {
        upSource.removeLoadedExtent(extent);
        failure();
        if (Date.now() - upErrorAt > 20000) { upErrorAt = Date.now(); toast('Server s územními plány (NGÚP) teď neodpovídá. Posuňte mapu nebo to zkuste za chvíli.'); }
      });
    }
  });

  const patternCache = new Map();
  function hatch(rgbBg, bgA, rgbLine, lineA, width) {
    const key = [rgbBg, bgA, rgbLine, lineA, width, dpr].join('|');
    if (patternCache.has(key)) return patternCache.get(key);
    const size = Math.max(6, Math.round(8 * dpr));
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    if (bgA > 0) { g.fillStyle = rgba(rgbBg, bgA); g.fillRect(0, 0, size, size); }
    g.strokeStyle = rgba(rgbLine, lineA); g.lineWidth = width * dpr; g.lineCap = 'square';
    g.beginPath();
    for (let k = -1; k <= 1; k++) { g.moveTo(k * size, size); g.lineTo(k * size + size, 0); }
    g.stroke();
    const p = g.createPattern(c, 'repeat');
    patternCache.set(key, p);
    return p;
  }
  const styleCache = new Map();
  const modeKey = () => (S.intent !== null ? 'i' + S.intent : (S.plan ? 'plan' : 'n'));
  function upStyle(f, res) {
    const typ = f.get('typ'), navrh = f.get('cash') === 2, fine = res < 1.25;
    const key = typ + (navrh ? 2 : 1) + modeKey() + theme + (fine ? 'f' : 'c');
    let st = styleCache.get(key);
    if (st) return st;
    const P = pal();
    const rgb = (TYPE[typ] || {}).rgb || [200, 200, 200];
    const w = fine ? 1 : 0.6;
    const dash = navrh ? [6, 4] : undefined;
    if (S.intent !== null) {
      const v = PLAIN[typ] ? PLAIN[typ].i[S.intent] : 0;
      if (v === 2) st = new ol.style.Style({ fill: new ol.style.Fill({ color: rgba(P.ok, 0.55) }), stroke: new ol.style.Stroke({ color: rgba(darken(P.ok, 0.2), 0.95), width: navrh ? 1.6 : w, lineDash: dash }) });
      else if (v === 1) st = new ol.style.Style({ fill: new ol.style.Fill({ color: hatch(P.maybe, 0.14, P.maybe, 0.85, 1.5) }), stroke: new ol.style.Stroke({ color: rgba(P.maybe, 0.9), width: navrh ? 1.6 : w, lineDash: dash }) });
      else st = new ol.style.Style({ fill: new ol.style.Fill({ color: rgba(P.no, 0.1) }), stroke: new ol.style.Stroke({ color: rgba(P.no, 0.3), width: 0.5 }) });
    } else if (S.plan) {
      if (navrh) st = new ol.style.Style({ fill: new ol.style.Fill({ color: hatch(rgb, 0.5, darken(rgb, 0.45), 0.95, 1.5) }), stroke: new ol.style.Stroke({ color: P.sel, width: 2 }) });
      else st = new ol.style.Style({ fill: new ol.style.Fill({ color: rgba(P.no, 0.16) }), stroke: new ol.style.Stroke({ color: rgba(P.no, 0.35), width: 0.5 }) });
    } else if (navrh) {
      st = new ol.style.Style({ fill: new ol.style.Fill({ color: hatch(rgb, P.hatchBgA, darken(rgb, 0.18), 0.95, 1.6) }), stroke: new ol.style.Stroke({ color: rgba(darken(rgb, 0.42), 0.95), width: fine ? 1.6 : 1.2, lineDash: dash }) });
    } else {
      st = new ol.style.Style({ fill: new ol.style.Fill({ color: rgba(rgb, P.fillA) }), stroke: new ol.style.Stroke({ color: P.edge, width: w }) });
    }
    styleCache.set(key, st);
    return st;
  }
  const upLayer = new ol.layer.VectorImage({ zIndex: 11, minZoom: CFG.vectorMinZoom, source: upSource, style: upStyle, imageRatio: 1.25, opacity: 0.66, className: 'ol-layer up-plan',
    renderOrder: (a, b) => (a.get('id_metadata') - b.get('id_metadata')) || (a.get('cash') - b.get('cash')) });

  const parcelLayer = new ol.layer.Image({
    zIndex: 30, minZoom: 16.6,
    source: new ol.source.ImageWMS({ url: CFG.kmWms, ratio: 1.2, params: { LAYERS: 'KN', FORMAT: 'image/png', TRANSPARENT: true, VERSION: '1.3.0' } })
  });
  const radonLayer = new ol.layer.Image({
    zIndex: 12, visible: false, opacity: 0.55,
    source: new ol.source.ImageArcGISRest({ url: CFG.radon, ratio: 1.15, params: { layers: 'show:1', format: 'png32', transparent: true } })
  });
  const natureLayer = new ol.layer.Image({
    zIndex: 13, visible: false, opacity: 0.65,
    source: new ol.source.ImageArcGISRest({ url: CFG.ruian, ratio: 1.15, params: { layers: 'show:30,34,40,42,44,48,52,56,60,62', format: 'png32', transparent: true } })
  });

  const floodLayer = new ol.layer.Image({
    zIndex: 14, visible: false, opacity: 0.6,
    source: new ol.source.ImageArcGISRest({ url: CFG.flood, ratio: 1.15, params: { layers: 'show:11,13', format: 'png32', transparent: true } })
  });

  // ---------------------------------------------------------------------------
  // Krajská data pro obce bez jednotných dat: mozaiky výkresů, ÚAP a krajské standardy
  // ---------------------------------------------------------------------------
  const REG_MINZOOM = 11.8;
  const safeUrl = u => (typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(u.trim()) ? u.trim() : null);
  const KRAJ_RINGS = {}, OBEC_RINGS = new Map(), regLoading = {};
  // tvar, do kterého se data kreslí: celý kraj, nebo jedna obec (městská data)
  // záznam jen pro vyjmenované obce (`only`) se ořízne jejich hranicemi
  const shapeKey = cfg => (cfg.obec ? 'o' + cfg.obec : cfg.only ? 'w' + cfg.kraj + '_' + cfg.only.length + '_' + cfg.only[0] : cfg.kraj);
  const shapeOf = cfg => KRAJ_RINGS[shapeKey(cfg)];
  REGIONAL.forEach(cfg => {
    cfg.layers.forEach((L, i) => {
      L.key = cfg.kraj + '-' + i; L.cfg = cfg; L.holes = new Set();
      L.extent3857 = L.extent ? ol.proj.transformExtent(L.extent, L.extentCrs || 'EPSG:5514', 'EPSG:3857') : null;
    });
    cfg.extent3857 = cfg.layers.reduce((e, L) => (L.extent3857 ? (e ? ol.extent.extend(e, L.extent3857) : L.extent3857.slice()) : e), null);
  });
  // adresa dlaždic; {zz} = zoom na dvě číslice (REST WMTS Marushky: Zoom_07)
  const xyzUrl = url => (url.includes('{zz}')
    ? { tileUrlFunction: tc => url.replace('{zz}', String(tc[0]).padStart(2, '0')).replace('{x}', tc[1]).replace('{y}', tc[2]) }
    : { url });
  function regionalSource(L) {
    if (L.kind === 'tiles5514') {
      return new ol.source.XYZ({
        projection: 'EPSG:5514', ...xyzUrl(L.url), transition: dur(150),
        tileGrid: new ol.tilegrid.TileGrid({ origin: L.origin, resolutions: L.resolutions, tileSize: L.tileSize || 256, extent: L.extent })
      });
    }
    if (L.kind === 'tiles3857') return new ol.source.XYZ({ url: L.url, maxZoom: L.maxZoom || 19, transition: dur(150) });
    if (L.kind === 'tilecache') {
      // TileCache z OpenLayers 2 (Naše mapy): dlaždice od levého dolního rohu `extent`, x a y v cestě po trojicích číslic
      const pad = n => String(n).padStart(9, '0').replace(/^(\d{3})(\d{3})(\d{3})$/, '$1/$2/$3');
      return new ol.source.XYZ({
        projection: 'EPSG:5514', transition: dur(150),
        tileGrid: new ol.tilegrid.TileGrid({ origin: [L.gridExtent[0], L.gridExtent[1]], resolutions: L.resolutions, tileSize: 256 }),
        tileUrlFunction: tc => L.url.replace('{z}', String(tc[0]).padStart(2, '0')).replace('{x}', pad(tc[1])).replace('{y}', pad(-tc[2] - 1))
      });
    }
    if (L.kind === 'wms') {
      // WMS (Marushka, GObec, MapServer, ArcGIS WMS): obraz v S-JTSK OpenLayers přepočítá do mapy.
      // Pomalé servery po dlaždicích (`tiled`): mapa se dokresluje postupně a nečeká na jeden velký obraz.
      const params = Object.assign({ FORMAT: 'image/png', TRANSPARENT: true, VERSION: L.version || '1.3.0', STYLES: '' }, L.params || {});
      const proj = L.crs || 'EPSG:3857';
      // dlouhý seznam vrstev (JÚAP: 165 id): čárky nekódovat, jinak adresa přeleze limit 2048 znaků serveru IIS
      const raw = src => (L.rawCommas ? src.replace(/%2C/gi, ',') : src);
      if (L.tiled) {
        const grid = proj === 'EPSG:5514'
          ? new ol.tilegrid.TileGrid({ origin: [-950000, -900000], resolutions: Array.from({ length: 13 }, (_, i) => 1024 / Math.pow(2, i)), tileSize: L.tileSize || 256 })
          : (L.tileSize ? ol.tilegrid.createXYZ({ tileSize: L.tileSize, maxZoom: 20 }) : undefined);
        return new ol.source.TileWMS({ url: L.url, projection: proj, tileGrid: grid, params, transition: dur(150), serverType: L.serverType,
          tileLoadFunction: (tile, src) => { tile.getImage().src = raw(src); } });
      }
      return new ol.source.ImageWMS({ url: L.url, ratio: 1.15, projection: proj, serverType: L.serverType, params, hidpi: L.hidpi !== false,
        imageLoadFunction: (img, src) => { img.getImage().src = raw(src); } });
    }
    if (L.kind === 'arcgisExport' || L.kind === 'arcgisImage') {
      // OpenLayers 10 posílá parametry malými písmeny (format, dpi, ...), tak je přepisujeme stejně
      const p = Object.assign(L.kind === 'arcgisImage' ? { format: 'jpgpng' } : { format: 'png32', transparent: true }, L.params || {});
      if (p.mosaicRule && typeof p.mosaicRule !== 'string') p.mosaicRule = JSON.stringify(p.mosaicRule);
      return new ol.source.ImageArcGISRest({ url: L.url, ratio: 1.15, params: p });
    }
    return null;
  }
  const ringsBox = rings => { const e = ol.extent.createEmpty(); rings.forEach(r => r.forEach(c => ol.extent.extendCoordinate(e, c))); return e; };
  function drawRings(e, ctx, rings) {
    const tr = e.frameState.coordinateToPixelTransform;
    rings.forEach(ring => {
      ring.forEach((c, i) => {
        const px = ol.render.getRenderPixel(e, [tr[0] * c[0] + tr[2] * c[1] + tr[4], tr[1] * c[0] + tr[3] * c[1] + tr[5]]);
        if (i) ctx.lineTo(px[0], px[1]); else ctx.moveTo(px[0], px[1]);
      });
      ctx.closePath();
    });
  }
  // kreslí jen uvnitř kraje a mimo obce, které mají lepší data (jednotná data NGÚP nebo krajský standard výš)
  function clipRegional(e, L) {
    const ctx = e.context; if (!ctx) return;
    ctx.save();
    ctx.beginPath();
    const K = shapeOf(L.cfg);
    if (!K) { ctx.rect(0, 0, 0, 0); ctx.clip(); ensureRegional(L.cfg); return; }
    const vx = e.frameState.extent;
    drawRings(e, ctx, K.rings);
    L.holes.forEach(kod => { const o = OBEC_RINGS.get(kod); if (o && o.rings.length && ol.extent.intersects(o.box, vx)) drawRings(e, ctx, o.rings); });
    ctx.clip('evenodd');
  }
  async function fetchObecRings(codes) {
    const need = codes.filter(k => !OBEC_RINGS.has(k));
    for (let i = 0; i < need.length; i += 40) {
      const chunk = need.slice(i, i + 40);
      const d = await fetchJSON(`${CFG.ruian}12/query?where=${encodeURIComponent('kod IN (' + chunk.join(',') + ')')}&outFields=kod&returnGeometry=true&outSR=3857&maxAllowableOffset=12&geometryPrecision=0&f=json`, 30000);
      const got = new Set();
      (d.features || []).forEach(f => {
        const k = +f.attributes.kod, rings = (f.geometry && f.geometry.rings) || [];
        const prev = OBEC_RINGS.get(k), all = prev && got.has(k) ? prev.rings.concat(rings) : rings;
        got.add(k); OBEC_RINGS.set(k, { rings: all, box: ringsBox(all) });
      });
      chunk.forEach(k => { if (!got.has(k)) OBEC_RINGS.set(k, { rings: [], box: ol.extent.createEmpty() }); });
    }
  }
  async function updateHoles(cfg) {
    if (cfg.obec) { cfg.layers.forEach(L => { L.holes = new Set(COVMAP.has(cfg.obec) ? [cfg.obec] : []); }); return; }
    // obce s jednotnými daty a města s vlastními daty se z krajské vrstvy vynechají
    // vynechají se i obce s neaktuální verzí v krajských datech (`skip`) a obce, které kreslí výkresy po obcích téhož kraje
    const ngup = COV.filter(o => (OKR[o[2]] || [])[1] === cfg.kraj).map(o => o[0])
      .concat(REGIONAL.filter(c => c.obec && c.kraj === cfg.kraj && c.layers.length).map(c => c.obec))
      .concat(cfg.skip || [])
      .concat(REGIONAL.filter(c => c !== cfg && c.kraj === cfg.kraj && !c.obec).flatMap(c => c.layers.filter(L => L.obce).flatMap(L => Object.keys(L.obce).map(Number))))
      .concat(cfg.only ? [] : REGIONAL.filter(c => c !== cfg && c.kraj === cfg.kraj && c.only).flatMap(c => c.only));
    for (const L of cfg.layers) {
      if (!L.cover || L.coverCodes) continue;
      try {
        const d = await jsonp(`${L.cover.url}/query?where=1%3D1&outFields=${L.cover.field}&returnDistinctValues=true&returnGeometry=false&f=json`, 20000);
        L.coverCodes = (d.features || []).map(f => +f.attributes[L.cover.field]).filter(Boolean);
      } catch (_) { L.coverCodes = []; }
    }
    const all = new Set(ngup);
    cfg.layers.forEach(L => (L.coverCodes || []).forEach(k => all.add(k)));
    await fetchObecRings([...all]);
    cfg.layers.forEach((L, i) => {
      const h = new Set(ngup);
      cfg.layers.slice(i + 1).forEach(U => (U.coverCodes || []).forEach(k => h.add(k)));
      L.holes = h;
    });
  }
  function ensureRegional(cfg) {
    const key = shapeKey(cfg);
    if (regLoading[key]) return;
    regLoading[key] = true;
    (async () => {
      let rings;
      if (cfg.obec) {
        await fetchObecRings([cfg.obec]);
        rings = (OBEC_RINGS.get(cfg.obec) || {}).rings || [];
      } else if (cfg.only) {
        await fetchObecRings(cfg.only);
        rings = cfg.only.flatMap(k => (OBEC_RINGS.get(k) || {}).rings || []);
      } else {
        const k = await fetchJSON(`${CFG.ruian}17/query?where=${encodeURIComponent('kod IN (' + cfg.kraj + ')')}&returnGeometry=true&outSR=3857&maxAllowableOffset=60&geometryPrecision=0&f=json`, 25000);
        rings = (k.features || []).flatMap(f => (f.geometry && f.geometry.rings) || []);
      }
      if (!rings.length) throw new Error('tvar');
      await updateHoles(cfg).catch(() => {});
      KRAJ_RINGS[key] = { rings, box: ringsBox(rings), geom: esri.readGeometry({ rings, spatialReference: { wkid: 3857 } }) };
      cfg.layers.forEach(L => L.layer && L.layer.changed());
      scheduleLegend(); updateAttrib();
    })().catch(() => { setTimeout(() => { regLoading[key] = false; }, 15000); });
  }
  const regionalLayers = [];
  // Výpadek serveru kraje nebo města: když dlaždice nebo obrázky výkresu opakovaně selžou a žádné nedorazí,
  // mapa to řekne (jinak by uživatel jen koukal na prázdné místo)
  const loadState = new Map();
  function watchLoad(src, cfg) {
    const st = { err: 0, ok: 0, t: 0, warned: 0 };
    loadState.set(src, st);
    const bad = () => {
      const now = Date.now();
      if (now - st.t > 20000) { st.err = 0; st.ok = 0; st.t = now; }
      st.err++;
      if (st.err >= 4 && st.ok === 0 && now - st.warned > 60000) {
        st.warned = now;
        toast(`Server s výkresem ${cfg.obec ? 'města' : 'kraje'} teď neodpovídá (${cfg.name}). Zkuste to za chvíli, ostatní data mapa ukazuje dál.`, 7000);
      }
    };
    const good = () => { st.ok++; };
    ['tileloaderror', 'imageloaderror'].forEach(ev => src.on(ev, bad));
    ['tileloadend', 'imageloadend'].forEach(ev => src.on(ev, good));
  }
  REGIONAL.forEach(cfg => cfg.layers.forEach(L => {
    if (L.kind === 'arcgisPerObec' || L.kind === 'tilesPerObec') {
      L.layer = new ol.layer.Group({ zIndex: 9, minZoom: L.minZoom || 12.6, opacity: 0.66, layers: [] });
      L.items = new Map();
      regionalLayers.push(L.layer);
      return;
    }
    if (L.kind === 'arcgisVector') {
      // plochy jako vektory (služby bez obrázkového výstupu): kreslí se stejným stylem jako jednotná data, takže umí i režimy
      const src = new ol.source.Vector({
        strategy: loadStrategy,
        loader(extent, resolution, projection, success, failure) {
          loadRegVector(L, src, extent, resolution).then(success, () => { src.removeLoadedExtent(extent); failure(); });
        }
      });
      L.layer = new ol.layer.VectorImage({
        zIndex: 9, minZoom: L.minZoom || 13, opacity: 0.66, source: src, style: upStyle, imageRatio: 1.25, extent: L.extent3857 || undefined,
        className: 'ol-layer up-reg up-reg-std up-reg-' + L.key
      });
      L.layer.on('prerender', e => clipRegional(e, L));
      L.layer.on('postrender', e => { if (e.context) e.context.restore(); });
      regionalLayers.push(L.layer);
      return;
    }
    const src = regionalSource(L);
    if (!src) return;
    const Ctor = L.kind.indexOf('tile') === 0 || (L.kind === 'wms' && L.tiled) ? ol.layer.Tile : ol.layer.Image;
    const layer = new Ctor({
      zIndex: 9, minZoom: L.minZoom || REG_MINZOOM, opacity: 0.66, source: src, extent: L.extent3857 || undefined,
      className: 'ol-layer up-reg up-reg-' + L.key + (L.std ? ' up-reg-std' : '')
    });
    L.layer = layer;
    layer.on('prerender', e => clipRegional(e, L));
    layer.on('postrender', e => { if (e.context) e.context.restore(); });
    watchLoad(src, cfg);
    regionalLayers.push(layer);
  }));
  // Kraje, kde má každá obec vlastní mapovou službu s georeferencovanými výkresy (Plzeňský kraj)
  const slugObec = s => fold(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  async function perObecNames(L) {
    if (!L.names) L.names = jsonp(`${L.base.replace(/\/$/, '')}?f=json`, 20000).then(d => {
      const m = new Map(); (d.services || []).forEach(x => { const n = String(x.name).split('/').pop(); m.set(n.toLowerCase(), n); }); return m;
    }).catch(e => { L.names = null; throw e; });
    return L.names;
  }
  const SHEET = t => (/přehled|širší|detail|vps|zpf|infrastr|doprav|technick|členění|veřejně|zábor|krajin/i.test(t) ? 0 : /hlavn/i.test(t) ? 4 : /funkčn|využití/i.test(t) ? 3 : /urbanist/i.test(t) ? 2 : /koordina/i.test(t) ? 1 : 0);
  const VERSION = p => {
    const y = +((/\[(\d{4})\]/.exec(p) || [])[1] || 0), n = +((/změn[ěay]?\s*č\.\s*(\d+)/i.exec(p) || [])[1] || 0);
    if (/^\s*změna/i.test(p)) return -1;
    return /úplné znění|právní stav/i.test(p) ? 1000 + n * 10 + y / 1e4 : 100 + y / 1e4;
  };
  // najde službu obce a v ní nejnovější hlavní výkres (případně výkres funkčního využití)
  function perObecItem(L, kod, nazev, okres) {
    if (L.items.has(kod)) return L.items.get(kod);
    const pr = (async () => {
      const names = await perObecNames(L);
      const base = slugObec(nazev), suf = (L.okresy || {})[okres];
      const svc = names.get((base + '_' + (suf || '')).toLowerCase()) || names.get(base.toLowerCase());
      if (!svc) return null;
      const d = await jsonp(`${L.base}${encodeURIComponent(svc)}/MapServer/layers?f=json`, 20000);
      const cands = (d.layers || []).map(l => {
        const i = String(l.name).lastIndexOf('_'), pre = i > 0 ? l.name.slice(0, i) : '', sh = i > 0 ? l.name.slice(i + 1) : l.name;
        return { id: l.id, pre, sh, ss: SHEET(sh), vr: VERSION(pre) };
      }).filter(c => c.ss > 0 && c.vr >= 0);
      if (!cands.length) return null;
      const bv = Math.max(...cands.map(c => c.vr)), inV = cands.filter(c => c.vr === bv), bs = Math.max(...inV.map(c => c.ss));
      const pick = inV.filter(c => c.ss === bs);
      return { svc, ids: pick.map(c => c.id), label: pick[0].pre, sheet: pick[0].sh };
    })().catch(() => null);
    L.items.set(kod, pr);
    return pr;
  }
  const clipToRings = (e, rings) => { const ctx = e.context; if (!ctx) return; ctx.save(); ctx.beginPath(); drawRings(e, ctx, rings); ctx.clip('evenodd'); };
  let perObecToken = 0;
  async function updatePerObec() {
    const token = ++perObecToken;
    for (const cfg of REGIONAL) for (const L of cfg.layers) {
      if (L.kind !== 'arcgisPerObec' && L.kind !== 'tilesPerObec') continue;
      const kids = L.layer.getLayers();
      const z = view.getZoom(), ext = view.calculateExtent(map.getSize());
      if (cfg.extent3857 && ol.extent.intersects(ext, cfg.extent3857) && !shapeOf(cfg)) ensureRegional(cfg);
      if (!S.layers.regional || z < (L.minZoom || 12.6) || !cfg.extent3857 || !ol.extent.intersects(ext, cfg.extent3857)) continue;
      let d;
      try {
        const env = encodeURIComponent(JSON.stringify({ xmin: ext[0], ymin: ext[1], xmax: ext[2], ymax: ext[3], spatialReference: { wkid: 3857 } }));
        const where = encodeURIComponent(L.kind === 'tilesPerObec' ? 'kod IN (' + Object.keys(L.obce).join(',') + ')' : 'okres IN (' + Object.keys(L.okresy || {}).join(',') + ')');
        d = await fetchJSON(`${CFG.ruian}12/query?where=${where}&geometry=${env}&geometryType=esriGeometryEnvelope&inSR=3857&spatialRel=esriSpatialRelIntersects&outFields=kod,nazev,okres&returnGeometry=true&outSR=3857&maxAllowableOffset=8&geometryPrecision=0&f=json`, 20000);
      } catch (_) { continue; }
      if (token !== perObecToken) return;
      const c = view.getCenter();
      const obce = (d.features || []).map(f => ({ kod: +f.attributes.kod, nazev: f.attributes.nazev, okres: String(f.attributes.okres), rings: (f.geometry && f.geometry.rings) || [] }))
        .filter(o => o.rings.length && !COVMAP.has(o.kod) && !REGIONAL.some(c => c.obec === o.kod))
        .map(o => { const b = ringsBox(o.rings); o.box = b; o.dist = Math.hypot((b[0] + b[2]) / 2 - c[0], (b[1] + b[3]) / 2 - c[1]); return o; })
        .sort((a, b) => a.dist - b.dist).slice(0, 24);
      const want = new Set();
      await Promise.all(obce.map(async o => {
        if (L.kind === 'tilesPerObec') {
          // dlaždice výkresu obce (WMTS/cache v S-JTSK), ořez hranicí obce
          const t = L.obce[String(o.kod)];
          if (!t) return;
          want.add(o.kod);
          L.items = L.items || new Map();
          let lyrs = L.items.get(o.kod);
          if (!lyrs) {
            // víc adres = víc listů výkresu nebo základní plán a vrstvy změn nad ním (kreslí se v tomhle pořadí)
            lyrs = (Array.isArray(t[0]) ? t[0] : [t[0]]).map(url => {
              const lyr = new ol.layer.Tile({
                extent: o.box, className: 'ol-layer up-reg up-reg-' + L.key,
                source: L.crs === 'EPSG:3857'
                  ? new ol.source.XYZ({ ...xyzUrl(url), transition: dur(150), minZoom: L.minZoomData || 0, maxZoom: L.maxZoom || 18 })
                  : new ol.source.XYZ({ projection: 'EPSG:5514', ...xyzUrl(url), transition: dur(150), tileGrid: new ol.tilegrid.TileGrid({ origin: L.origin, resolutions: L.resolutions, tileSize: L.tileSize || 256 }) })
              });
              lyr.set('obec', o.kod);
              lyr.on('prerender', e => clipToRings(e, o.rings));
              lyr.on('postrender', e => { if (e.context) e.context.restore(); });
              return lyr;
            });
            L.items.set(o.kod, lyrs);
          }
          lyrs.forEach(lyr => { if (!kids.getArray().includes(lyr)) kids.push(lyr); });
          return;
        }
        const it = await perObecItem(L, o.kod, o.nazev, o.okres);
        if (!it || token !== perObecToken) return;
        want.add(o.kod);
        if (!it.layer) {
          it.layer = new ol.layer.Image({
            extent: o.box, className: 'ol-layer up-reg up-reg-' + L.key,
            source: new ol.source.ImageArcGISRest({ url: `${L.base}${encodeURIComponent(it.svc)}/MapServer`, ratio: 1.1, params: { layers: 'show:' + it.ids.join(','), format: 'png32', transparent: true } })
          });
          it.layer.set('obec', o.kod);
          it.layer.on('prerender', e => clipToRings(e, o.rings));
          it.layer.on('postrender', e => { if (e.context) e.context.restore(); });
        }
        if (!kids.getArray().includes(it.layer)) kids.push(it.layer);
      }));
      if (token !== perObecToken) return;
      kids.getArray().slice().forEach(l => { if (!want.has(l.get('obec'))) kids.remove(l); });
    }
    // legenda, nápověda a atribuce počítají s výkresy obcí, které jsou teď ve výřezu
    updateHint(); updateAttrib(); scheduleLegend();
  }

  const schedulePerObec = debounce(() => { updatePerObec().catch(() => {}); }, 250);
  // Obce (dist/obce.json z build.py): odkud má obec data v mapě a stav jejího plánu v evidenci NGÚP.
  // [zdroj n|m|k|v|p|-, index v REGIONAL, stav plánu p|x|?, název plánu, účinnost, změn, poslední změna, pořizuje se, web]
  let OBCE = null, obceP = null;
  function loadObce() {
    if (!obceP) obceP = fetch('obce.json').then(r => (r.ok ? r.json() : null)).then(d => { OBCE = d && d.o ? d : null; if (OBCE) renderCoverageNumbers(); return OBCE; }).catch(() => null);
    return obceP;
  }
  const obecRec = kod => (OBCE && kod != null ? OBCE.o[String(kod)] || null : null);
  const regionalCfgFor = (kraj, obec) => {
    const r = obecRec(obec);
    if (r && r[1] >= 0 && REGIONAL[r[1]]) return REGIONAL[r[1]];
    return (obec && REGIONAL.find(c => c.obec === +obec))
      || (obec && REGIONAL.find(c => c.kraj === +kraj && c.layers.some(L => L.obce && L.obce[String(obec)])))
      || (obec && REGIONAL.find(c => c.kraj === +kraj && c.only && c.only.includes(+obec)))
      || REGIONAL.find(c => c.kraj === +kraj && !c.obec && !c.orp && !c.only && !c.layers.some(L => L.obce) && !(c.skip || []).includes(+obec)) || null;
  };
  function regionalCfgsInView() {
    if (!S.layers.regional || view.getZoom() < REG_MINZOOM) return [];
    const ext = view.calculateExtent(map.getSize());
    return REGIONAL.filter(c => {
      if (!c.extent3857 || !ol.extent.intersects(ext, c.extent3857)) return false;
      // výkresy po obcích: jen když je ve výřezu výkres některé obce opravdu načtený
      const per = c.layers.filter(L => L.kind === 'tilesPerObec' || L.kind === 'arcgisPerObec');
      if (per.length) return per.some(L => L.layer && L.layer.getLayers().getArray().some(l => { const e = l.getExtent(); return !e || ol.extent.intersects(ext, e); }));
      const K = shapeOf(c);
      return !K || (ol.extent.intersects(ext, K.box) && K.geom.intersectsExtent(ext));
    });
  }
  const regionalInView = () => regionalCfgsInView().length > 0;
  // krajská data v jednotném standardu umí stejné režimy jako NGÚP (přes dynamicLayers)
  function updateRegionalModes() {
    const on = S.intent !== null || S.plan;
    REGIONAL.forEach(cfg => cfg.layers.forEach(L => {
      if (L.kind === 'arcgisVector' && L.layer) { L.layer.changed(); return; }
      if (!L.std || !L.layer) return;
      const p = on
        ? { layers: undefined, dynamicLayers: JSON.stringify(modeDynamicLayers(L.std.layer, L.std.typ, L.std.cash, null, STD_ALIAS)) }
        : { layers: (L.params || {}).layers, dynamicLayers: undefined };
      const key = JSON.stringify(p);
      if (L.modeKey === key) return;
      L.modeKey = key;
      L.layer.getSource().updateParams(p);
    }));
  }

  // Převod kódů a názvů ploch z krajských dat na typy jednotného standardu (jen pro orientační výklad)
  const STD_ALIAS = { BO: 'BU', AZ: 'AU', NZ: 'AU', LE: 'LU', NL: 'LU', NS: 'MU', MN: 'MU', OM: 'OK', PP: 'PU', PV: 'PU', PZ: 'ZP', TI: 'TU', W: 'WT', HS: 'HU', HK: 'HU', DP: 'DK' };
  const MINIS_ALIAS = {
    B: 'BU', BR: 'BX', BM: 'BH', BD: 'BH', BS: 'BX', BZ: 'BX', R: 'RU', RN: 'RO', RP: 'RO', O: 'OU', OM: 'OK', OP: 'OV', OZ: 'OX',
    P: 'PU', PV: 'PU', PP: 'PU', PZ: 'ZP', S: 'SU', SK: 'SU', SO: 'SU', SR: 'SX', SB: 'SU', D: 'DU', DZ: 'DD', DK: 'DU', DP: 'DK', DI: 'DU', DM: 'DS',
    T: 'TU', TI: 'TU', TV: 'TW', TK: 'TS', V: 'VU', VS: 'HU', VK: 'HU', VP: 'VU', VF: 'VE', H: 'HU', HS: 'HU', HK: 'HU', W: 'WT', WP: 'WT', WV: 'WT',
    Z: 'ZU', ZV: 'ZP', ZA: 'ZZ', ZN: 'ZK', ZP: 'ZS', ZR: 'ZS', ZS: 'ZZ', K: 'ZK', KZ: 'ZK', KK: 'ZK', NK: 'ZK', N: 'MU', NZ: 'AU', NL: 'LU', NS: 'MU',
    NP: 'NU', NT: 'GU', NG: 'GU', NV: 'WT', A: 'AU', L: 'LU', LE: 'LU', M: 'MU', MN: 'MU', MV: 'HU', G: 'GU', TN: 'GU', X: 'XX'
  };
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cap = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
  function stdFromName(name) {
    const t = fold(name); if (!t) return null;
    const h = re => re.test(t);
    if (h(/hrbitov/)) return 'OH';
    if (h(/smisen/) && h(/obytn|bydl/)) return h(/centr/) ? 'SC' : h(/mest/) ? 'SM' : h(/venkov/) ? 'SV' : h(/rekrea/) ? 'SX' : 'SU';
    if (h(/smisen/) && h(/vyrob|komerc|podnik/)) return 'HU';
    if (h(/smisen/) && h(/nezastav|krajin/)) return 'MU';
    if (h(/bydlen/)) return h(/bytov|hromadn/) ? 'BH' : h(/venkov/) ? 'BV' : h(/rodinn|individ/) ? 'BI' : 'BU';
    if (h(/rekreac/)) return h(/zahrad/) ? 'RZ' : h(/rodinn|individ|chat/) ? 'RI' : h(/hromadn/) ? 'RH' : h(/prirod|oddech/) ? 'RO' : 'RU';
    if (h(/obcansk/)) return h(/sport|telovych/) ? 'OS' : h(/komerc/) ? 'OK' : h(/lazen/) ? 'OL' : h(/verejn|infrastr/) ? 'OV' : 'OU';
    if (h(/verejn\w* prostranstv|\bvp\b/)) return h(/zelen/) ? 'ZP' : 'PU';
    if (h(/vyrob|prumysl|sklad|logist/)) return h(/fotovolt|obnovit|solar/) ? 'VE' : h(/drobn|remesl/) ? 'VD' : h(/zemedel|lesn|zivocis/) ? 'VZ' : h(/lehk/) ? 'VL' : h(/tezk/) ? 'VT' : h(/sklad|logist/) ? 'VS' : 'VU';
    if (h(/doprav/)) return h(/silnic/) ? 'DS' : h(/draz|zelezn/) ? 'DD' : h(/leteck/) ? 'DL' : h(/vodn/) ? 'DV' : h(/nemotor|cyklo|pesi/) ? 'DN' : 'DU';
    if (h(/technick/)) return h(/odpad/) ? 'TO' : h(/energ/) ? 'TE' : h(/vodn|vodoh/) ? 'TW' : h(/spoj|komunik/) ? 'TS' : 'TU';
    if (h(/zelen/)) return h(/ochrann|izolac/) ? 'ZO' : h(/park|verejn/) ? 'ZP' : h(/zahrad|soukrom|vyhrazen/) ? 'ZZ' : h(/krajin|prirod/) ? 'ZK' : 'ZU';
    if (h(/vodn|vodoh|toky/)) return 'WT';
    if (h(/tezb|dobyv/)) return 'GU';
    if (h(/lesn|\bles\b/)) return 'LU';
    if (h(/zemedel/)) return 'AU';
    if (h(/prirodn/)) return 'NU';
    if (h(/specific|zvlastn|obran/)) return 'XX';
    return null;
  }
  function classify(raw, name, sys) {
    let r = String(raw || '');
    const m = /^\s*([A-Za-z][\w.]{0,7})\s+[-–]\s+/.exec(r); if (m) r = m[1];
    const tok = r.toUpperCase().replace(/\s+/g, '');
    const letters = (/^[A-Z]+/.exec(tok) || [''])[0];
    if (sys === 'std') {
      for (const c of [tok, letters]) { if (TYPE[c]) return c; if (STD_ALIAS[c]) return STD_ALIAS[c]; }
      return stdFromName(name);
    }
    const n = stdFromName(name);
    if (n) return n;
    for (const c of [tok, letters, letters.slice(0, 2)]) { if (!c) continue; if (MINIS_ALIAS[c]) return MINIS_ALIAS[c]; if (TYPE[c]) return c; }
    return null;
  }
  function statusOf(inf, a) {
    if (inf.fixedStatus) return inf.fixedStatus;
    const f = inf.fields.status; if (!f || a[f] == null) return null;
    const v = String(a[f]).trim().toUpperCase();
    if ((inf.navrh || []).map(x => String(x).toUpperCase()).includes(v) || /^2(\b|$)|NAVRH|NÁVRH/.test(v)) return 2;
    if (/^1(\b|$)|STAV|^ST$/.test(v)) return 1;
    return null;
  }
  const fmtDateVal = v => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : (/^\d{11,14}$/.test(String(v).trim()) ? +v : NaN);
    if (isFinite(n)) { const d = new Date(n); return isNaN(d) ? null : d.toLocaleDateString('cs-CZ'); }
    return String(v).trim() || null;
  };
  const cleanDoc = v => (v ? String(v).replace(/^Kód ÚP:\s*\d+\.\s*/i, '').trim() || null : null);
  // názvy ploch z rendereru služby (ENTITA_ID -> popisek), když služba nemá pole s názvem
  const NAME_CACHE = new Map();
  function namesFor(spec) {
    if (!spec || !spec.namesFrom) return Promise.resolve(null);
    const url = spec.url;
    if (!NAME_CACHE.has(url)) {
      NAME_CACHE.set(url, (spec.cors ? fetchJSON(url + '?f=json', 15000) : jsonp(url + '?f=json', 15000)).then(d => {
        const m = new Map(); const r = d && d.drawingInfo && d.drawingInfo.renderer;
        ((r && r.uniqueValueInfos) || []).forEach(u => m.set(String(u.value), u.label));
        return m;
      }).catch(() => new Map()));
    }
    return NAME_CACHE.get(url);
  }
  const getJSON = (spec, url, timeout) => (spec.cors ? fetchJSON(url, timeout) : jsonp(url, timeout));
  async function loadRegVector(L, src, extent, resolution) {
    const V = L.vector, names = await namesFor(Object.assign({ url: L.url, cors: L.cors }, V));
    const env = encodeURIComponent(JSON.stringify({ xmin: extent[0], ymin: extent[1], xmax: extent[2], ymax: extent[3], spatialReference: { wkid: 3857 } }));
    const fields = [...new Set([L.idField, V.code, V.status, V.namesFrom, V.name].filter(Boolean))].join(',');
    const feats = [];
    for (let off = 0, g = 0; g < 10; g++) {
      const d = await getJSON(L, `${L.url}/query?f=json&where=1%3D1&geometry=${env}&geometryType=esriGeometryEnvelope&inSR=3857&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent(fields)}&returnGeometry=true&outSR=3857&maxAllowableOffset=${Math.max(0.2, resolution / 3).toFixed(2)}&geometryPrecision=1&resultOffset=${off}&resultRecordCount=1000`, 25000);
      if (!d || d.error) throw new Error('vector');
      const rows = d.features || [];
      rows.forEach(r => {
        if (!r.geometry) return;
        const a = r.attributes || {};
        let geom; try { geom = esri.readGeometry(Object.assign({ spatialReference: { wkid: 3857 } }, r.geometry)); } catch (_) { return; }
        const name = (V.name && nul(a[V.name])) || (names && V.namesFrom ? names.get(String(a[V.namesFrom])) : null);
        const f = new ol.Feature(geom);
        if (L.idField && a[L.idField] != null) f.setId(L.key + ':' + a[L.idField]);
        f.set('typ', classify(a[V.code], name, V.codes || 'minis'));
        f.set('cash', statusOf({ fields: { status: V.status }, navrh: V.navrh }, a) || 1);
        f.set('id_metadata', 0);
        feats.push(f);
      });
      if (!d.exceededTransferLimit || !rows.length) break;
      off += rows.length;
    }
    src.addFeatures(feats);
    scheduleLegend();
  }
  // podmínky plochy poskládané z jednotlivých polí (např. Zlín: Hlavní_využití_1, Přípustné_využití_1…)
  function rulesFromFields(spec, a) {
    if (!spec) return null;
    const out = [];
    Object.entries(spec).forEach(([head, prefix]) => {
      const items = Object.keys(a).filter(k => k.indexOf(prefix) === 0).sort((x, y) => (parseInt(x.slice(prefix.length), 10) || 0) - (parseInt(y.slice(prefix.length), 10) || 0))
        .map(k => nul(typeof a[k] === 'string' ? a[k].trim() : a[k])).filter(Boolean);
      if (items.length) out.push(head + ':\n' + items.map(x => '- ' + x).join('\n'));
    });
    return out.length ? out.join('\n') : null;
  }
  async function regionalQuery(url, ll, fields, timeout, geom, spec) {
    const g = encodeURIComponent(JSON.stringify({ x: +ll[0].toFixed(6), y: +ll[1].toFixed(6), spatialReference: { wkid: 4326 } }));
    const gp = geom ? '&returnGeometry=true&outSR=3857&maxAllowableOffset=0.5&geometryPrecision=1' : '&returnGeometry=false';
    const q = `${url}/query?f=json&geometry=${g}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent(fields.join(','))}${gp}`;
    // delší limit: služby měst a krajů často obsluhují dlaždice i dotazy z jednoho serveru a dotaz čeká ve frontě
    const d = spec && spec.cors ? await fetchJSON(q, timeout || 25000) : await jsonp(q, timeout || 25000);
    if (d && d.error) throw new Error(d.error.message || 'query');
    return (d.features || []).map(f => Object.assign({}, f.attributes || {}, f.geometry ? { __geom: f.geometry } : {}));
  }
  // GetFeatureInfo z WMS: odpověď v JSON, GML/XML (i ArcGIS <FIELDS>) nebo HTML tabulce převede na seznam atributů
  async function wmsQuery(spec, coord) {
    const crs = spec.crs || 'EPSG:3857';
    const p = crs === 'EPSG:3857' ? coord : ol.proj.transform(coord, 'EPSG:3857', crs);
    const half = spec.half || 25, n = 51;
    const v13 = (spec.version || '1.3.0') === '1.3.0';
    // WMS 1.3.0 bere u EPSG:5514 pořadí os podle EPSG (X, Y), stejně jako u 3857
    const bbox = [p[0] - half, p[1] - half, p[0] + half, p[1] + half].map(v => v.toFixed(2)).join(',');
    const q = Object.assign({
      SERVICE: 'WMS', REQUEST: 'GetFeatureInfo', VERSION: spec.version || '1.3.0', LAYERS: spec.layers, QUERY_LAYERS: spec.layers,
      STYLES: '', FORMAT: 'image/png', INFO_FORMAT: spec.format || 'application/json', FEATURE_COUNT: 8, WIDTH: n, HEIGHT: n
    }, v13 ? { CRS: crs, I: 25, J: 25 } : { SRS: crs, X: 25, Y: 25 }, { BBOX: bbox }, spec.params || {});
    const url = spec.url + (spec.url.indexOf('?') >= 0 ? '&' : '?') + Object.entries(q).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), spec.timeout || 20000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      return parseFeatureInfo(txt, spec.format || 'application/json');
    } finally { clearTimeout(t); }
  }
  // WFS GetFeature (T-MAPY: plochy s kódem a názvem): malý obdélník kolem bodu, pak jen plochy, které bod opravdu obsahují
  async function wfsQuery(spec, coord) {
    const crs = spec.crs || 'EPSG:5514';
    const p = ol.proj.transform(coord, 'EPSG:3857', crs);
    const v2 = (spec.version || '2.0.0').indexOf('2.') === 0;
    const bbox = [p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1].map(v => v.toFixed(2)).join(',') + ',' + (v2 ? 'urn:ogc:def:crs:EPSG::' + crs.split(':')[1] : crs);
    const q = { SERVICE: 'WFS', VERSION: spec.version || '2.0.0', REQUEST: 'GetFeature', BBOX: bbox, OUTPUTFORMAT: spec.format || 'application/json; charset=utf-8' };
    q[v2 ? 'TYPENAMES' : 'TYPENAME'] = spec.typename; q[v2 ? 'COUNT' : 'MAXFEATURES'] = 20;
    if (!v2) q.SRSNAME = crs;
    const url = spec.url + (spec.url.indexOf('?') >= 0 ? '&' : '?') + Object.entries(q).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), spec.timeout || 20000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const fmt = new ol.format.GeoJSON();
      return (j.features || []).filter(f => {
        try { const g = fmt.readGeometry(f.geometry, { dataProjection: crs, featureProjection: crs }); return !g || g.intersectsCoordinate(p); } catch (_) { return true; }
      }).map(f => Object.assign({}, f.properties || {}));
    } finally { clearTimeout(t); }
  }
  function parseFeatureInfo(txt, fmt) {
    if (/json/i.test(fmt)) {
      const j = JSON.parse(txt);
      return (j.features || []).map(f => Object.assign({}, f.properties || f.attributes || {}));
    }
    const doc = new DOMParser().parseFromString(txt, /html/i.test(fmt) ? 'text/html' : 'text/xml');
    if (/html/i.test(fmt)) {
      const out = [];
      doc.querySelectorAll('table').forEach(tb => {
        const rows = [...tb.querySelectorAll('tr')].map(tr => [...tr.children].map(c => c.textContent.trim()));
        if (rows.length > 1 && rows[0].length > 2 && tb.querySelector('th')) {
          rows.slice(1).forEach(r => { const a = {}; rows[0].forEach((h, i) => { a[h] = r[i]; }); out.push(a); });
        } else {
          const a = {}; rows.forEach(r => { if (r.length >= 2) a[r[0].replace(/:\s*$/, '')] = r[r.length - 1]; }); if (Object.keys(a).length) out.push(a);
        }
      });
      return out;
    }
    const out = [];
    // ArcGIS WMS: <FIELDS a="…" b="…"/>
    doc.querySelectorAll('FIELDS').forEach(el => { const a = {}; [...el.attributes].forEach(x => { a[x.name] = x.value; }); out.push(a); });
    if (out.length) return out;
    // GML a obecné XML: prvky, jejichž děti jsou jen listy s textem
    const all = doc.getElementsByTagName('*');
    for (const el of all) {
      const kids = [...el.children];
      if (kids.length < 2 || !kids.every(k => !k.children.length)) continue;
      if (kids.some(k => /^(gml:)?(boundedBy|coordinates|posList|pos)$/i.test(k.tagName))) continue;
      // <Attribute Name="NAZEV">…</Attribute> (HYDROSOFT WebMap) má název v atributu, jinak název prvku
      const a = {}; kids.forEach(k => { a[k.getAttribute('Name') || k.getAttribute('name') || k.localName] = k.textContent.trim(); });
      [...el.attributes].forEach(x => { if (!/^(gml:)?id$|^fid$/i.test(x.name)) a[x.localName] = x.value; });
      out.push(a);
    }
    return out;
  }
  const pickVal = (a, F, k) => { const f = F[k]; if (!f) return null; const x = a[f]; return nul(typeof x === 'string' ? x.trim() : x); };

  // obce s daty (přehled při malém měřítku)
  const covSource = new ol.source.Vector();
  function addCoverageFeatures(list) {
    covSource.addFeatures(list.map(o => {
      const f = new ol.Feature({ geometry: new ol.geom.Point(ol.proj.fromLonLat([o[3], o[4]])), kod: o[0], name: o[1], n: o[7] || 0 });
      f.setId('o' + o[0]);
      return f;
    }));
  }
  addCoverageFeatures(COV);
  const covImgCache = {};
  function covStyle(f, res) {
    const P = pal();
    const n = f.get('n');
    const r = n > 2500 ? 7.5 : n > 900 ? 6 : 4.6;
    const k = r + theme;
    if (!covImgCache[k]) covImgCache[k] = new ol.style.RegularShape({ points: 4, radius: r, angle: Math.PI / 4, fill: new ol.style.Fill({ color: P.sel }), stroke: new ol.style.Stroke({ color: P.halo, width: 1.5 }) });
    const showLabel = res < 230 || n > 2500;
    return new ol.style.Style({
      image: covImgCache[k],
      text: showLabel ? new ol.style.Text({ text: f.get('name'), font: '600 12px Archivo, "Segoe UI", sans-serif', offsetY: -(r + 9), fill: new ol.style.Fill({ color: P.label }), stroke: new ol.style.Stroke({ color: P.labelHalo, width: 3 }) }) : undefined
    });
  }
  const covLayer = new ol.layer.Vector({ zIndex: 45, maxZoom: CFG.coverageMaxZoom, source: covSource, style: covStyle, declutter: true });

  // výběr a zvýraznění
  const selSource = new ol.source.Vector();
  function selStyle(f) {
    const P = pal();
    if (f.get('kind') === 'pin') {
      return [
        new ol.style.Style({ image: new ol.style.Circle({ radius: 12, stroke: new ol.style.Stroke({ color: P.halo, width: 4 }) }) }),
        new ol.style.Style({ image: new ol.style.Circle({ radius: 12, stroke: new ol.style.Stroke({ color: P.sel, width: 2 }) }) }),
        new ol.style.Style({ image: new ol.style.Circle({ radius: 4, fill: new ol.style.Fill({ color: P.sel }), stroke: new ol.style.Stroke({ color: P.halo, width: 2 }) }) })
      ];
    }
    return [
      new ol.style.Style({ stroke: new ol.style.Stroke({ color: P.halo, width: 7 }) }),
      new ol.style.Style({ stroke: new ol.style.Stroke({ color: P.sel, width: 3 }) })
    ];
  }
  const selLayer = new ol.layer.Vector({ zIndex: 60, source: selSource, style: selStyle });
  const hoverSource = new ol.source.Vector();
  const hoverLayer = new ol.layer.Vector({ zIndex: 55, source: hoverSource, style: () => new ol.style.Style({ stroke: new ol.style.Stroke({ color: theme === 'dark' ? 'rgba(255,255,255,.85)' : 'rgba(23,28,26,.85)', width: 1.6 }) }) });

  // ---------------------------------------------------------------------------
  // Mapa
  // ---------------------------------------------------------------------------
  const view = new ol.View({ center: ol.proj.fromLonLat([15.45, 49.8]), zoom: 7.4, minZoom: 6.3, maxZoom: 20.5, enableRotation: false, extent: ol.proj.transformExtent([10.5, 47.8, 20.2, 51.8], 'EPSG:4326', 'EPSG:3857'), constrainOnlyCenter: true });
  // cíl dostane mapa až po načtení stránky, viz boot() na konci
  const map = new ol.Map({
    view, controls: [],
    layers: [baseLayer].concat(regionalLayers, [upRaster, upLayer, radonLayer, natureLayer, floodLayer, parcelLayer, covLayer, hoverLayer, selLayer])
  });
  map.addControl(new ol.control.ScaleLine({ target: $('#scale'), units: 'metric', minWidth: 64 }));

  function applyBase() {
    const vecOk = !!baseVT && !vectorBaseFailed;
    if (S.base === 'orto') { baseLayer.setSource(ortoSource); baseLayer.setVisible(true); }
    else if (S.base === 'ztm' || !vecOk) { baseLayer.setSource(ztmSource); baseLayer.setVisible(S.base === 'ztm' || vectorBaseFailed); }
    else baseLayer.setVisible(false);
    if (baseVT) baseVT.setVisible(S.base === 'map' && vecOk);
    if (labelVT) labelVT.setVisible(S.base !== 'ztm' && vecOk);
    updateAttrib();
  }
  function updateAttrib() {
    const base = S.base === 'orto' ? 'Letecký snímek © ČÚZK' : (S.base === 'ztm' || vectorBaseFailed ? 'Základní mapa © ČÚZK' : OFM_ATTR);
    const reg = regionalCfgsInView().map(c => c.attribution).filter(Boolean);
    $('#attrib').innerHTML = `Územní plány © MMR (NGÚP)${reg.length ? ', ' + esc(reg.join(', ')) : ''}, katastr © ČÚZK, radon © ČGS, povodně © VÚV TGM. ${base}`;
  }
  function applyTheme() {
    theme = themeNow();
    styleCache.clear(); Object.keys(covImgCache).forEach(k => delete covImgCache[k]);
    buildVectorBase();
    upLayer.changed(); covLayer.changed(); selLayer.changed();
    updateRaster(); renderLegend();
  }
  mqDark.addEventListener('change', applyTheme);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  applyBase();
  buildVectorBase();

  function panelOffsetPx() { return isMobile() ? [0, 0] : [($('#panel').offsetWidth + 24) / 2, 0]; }
  function centerOn(coord, zoom, animate) {
    const z = zoom == null ? view.getZoom() : zoom;
    const res = view.getResolutionForZoom(z);
    const off = panelOffsetPx();
    let center = [coord[0] - off[0] * res, coord[1] + off[1] * res];
    if (isMobile()) {
      const sheetH = parseFloat(getComputedStyle($('#app')).getPropertyValue('--sheet-h')) || 212;
      const topH = $('#panel').offsetHeight + 60;
      center = [coord[0], coord[1] - ((sheetH - topH) / 2) * res];
    }
    if (animate === false || reduceMotion) view.setCenter(center), view.setZoom(z);
    else view.animate({ center, zoom: z, duration: 650 });
  }
  function fitPadding() {
    if (isMobile()) { const top = $('#panel').offsetHeight + 70; const sheet = parseFloat(getComputedStyle($('#app')).getPropertyValue('--sheet-h')) || 212; return [top, 20, sheet + 20, 20]; }
    return [80, 70, 60, $('#panel').offsetWidth + 40];
  }
  function fitObec(kod) {
    const o = COVMAP.get(kod); if (!o) return;
    const ext = ol.proj.transformExtent([o[3] - o[5] / 2, o[4] - o[6] / 2, o[3] + o[5] / 2, o[4] + o[6] / 2], 'EPSG:4326', 'EPSG:3857');
    view.fit(ext, { padding: fitPadding(), duration: dur(700), maxZoom: 15.2 });
  }

  // ---------------------------------------------------------------------------
  // Režimy: záměr a plánované změny
  // ---------------------------------------------------------------------------
  function restyle() { styleCache.clear(); upLayer.changed(); updateRaster(); updateRegionalModes(); }
  function syncModeUI() {
    document.querySelectorAll('#intents [data-intent]').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.intent === S.intent)));
    $('#planToggle').setAttribute('aria-pressed', String(S.plan));
    // krajské mozaiky nejdou přebarvit podle záměru, tak je v režimech ztlumíme
    $('#map').classList.toggle('mode-on', S.intent !== null || S.plan);
  }
  function setIntent(v) {
    S.intent = v; if (v !== null) S.plan = false;
    syncModeUI(); restyle(); renderLegend(); writeHash(); updateHint();
    if (S.sel) renderCard();
    if (v !== null && view.getZoom() < CFG.rasterMinZoom) toast(`Přibližte si obec a mapa ukáže, kde se dá postavit ${INTENTS[v].acc}.`);
  }
  $('#intents').addEventListener('click', e => {
    const b = e.target.closest('[data-intent]'); if (!b) return;
    const v = +b.dataset.intent; setIntent(S.intent === v ? null : v);
  });
  $('#planToggle').addEventListener('click', () => {
    S.plan = !S.plan; if (S.plan) S.intent = null;
    syncModeUI(); restyle(); renderLegend(); writeHash(); updateHint();
    if (S.plan && view.getZoom() < CFG.rasterMinZoom) toast('Přibližte si obec a mapa zvýrazní plochy, které plán teprve chystá.');
  });

  // ---------------------------------------------------------------------------
  // Legenda, nápověda, měřítko
  // ---------------------------------------------------------------------------
  const swatch = (code, navrh) => {
    const rgb = (TYPE[code] || {}).rgb || [200, 200, 200];
    return navrh
      ? `<span class="sw hatch" style="--hc:${rgba(darken(rgb, 0.18), 1)};background-color:${rgba(rgb, 0.25)}"></span>`
      : `<span class="sw" style="background:${rgba(rgb, 0.85)}"></span>`;
  };
  function renderLegend() {
    const z = view.getZoom();
    const P = pal();
    let title = 'Legenda', html = '';
    if (S.covMap) {
      // mapa pokrytí: kategorie s počtem obcí a podílem obyvatel
      const n = {}, pop = {}; let all = 0, allPop = 0;
      if (OBCE) Object.values(OBCE.o).forEach(r => { n[r[9]] = (n[r[9]] || 0) + 1; pop[r[9]] = (pop[r[9]] || 0) + (+r[11] || 0); all++; allPop += +r[11] || 0; });
      html = COV_CAT.map(([k, label, rgb]) => `<div class="lg-row wide"><span class="sw" style="background:${rgba(rgb, 0.85)}"></span><span>${esc(label)}</span><span class="lg-num num">${fmtInt(n[k] || 0)}</span></div>`).join('');
      const inMap = ['n', 'k', 'm', 'p'].reduce((s, k) => s + (n[k] || 0), 0), inPop = ['n', 'k', 'm', 'p'].reduce((s, k) => s + (pop[k] || 0), 0);
      if (all) html += `<p class="lg-note">Plán přímo v mapě má <b>${fmtInt(inMap)}</b> obcí z ${fmtInt(all)}, žije v nich ${Math.round(100 * inPop / allPop)} % obyvatel. U ostatních karta odkáže na dokumenty obce. Stav k ${esc(OBCE.stav.split('-').reverse().map(Number).join('. '))}.</p>`;
      $('#legendTitle').textContent = 'Pokrytí obcí';
      $('#legendBody').innerHTML = html;
      return;
    }
    if (S.intent !== null && z >= CFG.rasterMinZoom) {
      title = 'Kde postavit ' + INTENTS[S.intent].acc;
      html += `<div class="lg-row wide"><span class="sw" style="background:${rgba(P.ok, 0.6)}"></span><span>Typicky ano</span></div>`;
      html += `<div class="lg-row wide"><span class="sw hatch" style="--hc:${rgba(P.maybe, 0.9)};background-color:${rgba(P.maybe, 0.14)}"></span><span>Záleží na podmínkách územního plánu</span></div>`;
      html += `<div class="lg-row wide"><span class="sw" style="background:${rgba(P.no, 0.14)}"></span><span>Spíš ne</span></div>`;
      html += `<p class="lg-note">Čárkovaný okraj znamená navrženou plochu. Orientačně podle typu plochy, přesná pravidla jsou v textu územního plánu obce.</p>`;
    } else if (S.plan && z >= CFG.rasterMinZoom) {
      title = 'Co se tu chystá';
      if (z >= CFG.vectorMinZoom) html += `<div class="lg-row wide"><span class="sw hatch" style="--hc:#555;background-color:rgba(255,120,40,.35);outline:2px solid ${P.sel};outline-offset:-2px"></span><span>Navržená plocha, barva ukazuje budoucí využití</span></div>`;
      else html += `<div class="lg-row wide"><span class="sw hatch" style="--hc:${P.sel};background-color:transparent;outline:1.5px solid ${P.sel};outline-offset:-1.5px"></span><span>Navržená plocha, zatím jen v plánu</span></div>`;
      html += `<div class="lg-row wide"><span class="sw" style="background:${rgba(P.no, 0.12)}"></span><span>Stávající stav, nemění se</span></div>`;
    } else if (z < CFG.rasterMinZoom) {
      html += `<div class="lg-row wide"><span class="sw" style="background:${P.sel};width:11px;height:11px;margin-left:5px;border-color:${P.halo}"></span><span>Obec, která má územní plán v jednotných datech</span></div>`;
      html += `<p class="lg-note">Přibližte mapu na obec a uvidíte barevný plán.</p>`;
    } else if (z < CFG.vectorMinZoom) {
      FAMILIES.forEach(([, label, codes]) => {
        const reps = codes.filter(c => TYPE[c]).slice(0, 3);
        html += `<div class="lg-row wide"><span style="display:flex;gap:2px">${reps.map(c => `<span class="sw" style="width:10px;background:${rgba(TYPE[c].rgb, 0.85)}"></span>`).join('')}</span><span>${esc(label)}</span></div>`;
      });
      html += `<p class="lg-note">Bílé plochy s křížky jsou navržené změny. Přibližte mapu na úroveň ulic a uvidíte podrobnou legendu.</p>`;
    } else {
      const ext = view.calculateExtent(map.getSize());
      const counts = {}; let navrh = false;
      const countF = f => { const t = f.get('typ'); if (!t) return; counts[t] = (counts[t] || 0) + 1; if (f.get('cash') === 2) navrh = true; };
      upSource.forEachFeatureInExtent(ext, countF);
      REGIONAL.forEach(c => c.layers.forEach(L => { if (L.kind === 'arcgisVector' && L.layer && L.layer.getVisible() && S.layers.regional) L.layer.getSource().forEachFeatureInExtent(ext, countF); }));
      const codes = Object.keys(counts).sort((a, b) => (FAMILY_OF[a] ?? 99) - (FAMILY_OF[b] ?? 99) || counts[b] - counts[a]);
      if (!codes.length) {
        html = `<p class="lg-note">V tomhle výřezu zatím nejsou plochy z jednotných dat.</p>`;
      } else {
        let fam = -1;
        codes.slice(0, 22).forEach(c => {
          const fi = FAMILY_OF[c] ?? 99;
          if (fi !== fam) { fam = fi; html += `<div class="lg-fam">${esc(FAMILIES[fi] ? FAMILIES[fi][1] : 'Ostatní')}</div>`; }
          html += `<div class="lg-row">${swatch(c)}<span class="lg-code">${esc(c)}</span><span>${esc(PLAIN[c] ? PLAIN[c].t : (TYPE[c] || {}).n || c)}</span></div>`;
        });
        if (codes.length > 22) html += `<p class="lg-note">A dalších ${codes.length - 22} typů ploch.</p>`;
        if (navrh) html += `<div class="lg-fam">Šrafování</div><div class="lg-row wide">${swatch(codes[0], true)}<span>Navržená plocha, zatím jen v plánu</span></div>`;
      }
    }
    const regCfgs = regionalCfgsInView();
    if (regCfgs.length && S.intent === null && !S.plan) {
      html += `<div class="lg-fam">Obce bez jednotných dat</div>` + regCfgs.map(c => `<div class="lg-row wide"><span class="sw" style="background:repeating-linear-gradient(90deg,#e0a0a0 0 6px,#f0d060 6px 11px,#a8c8a0 11px 16px)"></span><span>${esc(cap(c.name))}: ${c.layers.every(L => L.kind === 'arcgisVector') ? 'barvy podle jednotné legendy' : 'barvy podle legendy obce'}, ${c.info ? 'po kliknutí ukážeme, co plocha znamená' : c.doc || c.links || c.pdf ? 'legendu najdete po kliknutí' : 'legendu najdete v dokumentech obce'}.</span></div>`).join('');
    } else if (regCfgs.length) {
      const std = regCfgs.some(c => c.layers.some(L => L.std || L.kind === 'arcgisVector'));
      const grey = regCfgs.some(c => c.layers.some(L => !L.std && L.kind !== 'arcgisVector'));
      html += `<p class="lg-note">${std ? 'Plány z dat krajů a měst, které znají typ plochy, jsou přebarvené stejně. ' : ''}${grey ? 'Šedě jsou výkresy, ty se podle režimu přebarvit nedají.' : ''}</p>`;
    }
    $('#legendTitle').textContent = title;
    $('#legendBody').innerHTML = html;
  }
  const scheduleLegend = debounce(renderLegend, 180);
  $('#legendToggle').addEventListener('click', () => {
    const l = $('#legend'); const open = l.dataset.open !== 'true';
    l.dataset.open = String(open); $('#legendToggle').setAttribute('aria-expanded', String(open));
  });

  function coverageInView() {
    const e = ol.proj.transformExtent(view.calculateExtent(map.getSize()), 'EPSG:3857', 'EPSG:4326');
    return COV.some(o => !(o[3] + o[5] / 2 < e[0] || o[3] - o[5] / 2 > e[2] || o[4] + o[6] / 2 < e[1] || o[4] - o[6] / 2 > e[3]));
  }
  function updateHint() {
    const z = view.getZoom();
    let msg = '';
    if (S.covMap) msg = 'Barvy ukazují, odkud mapa zná plán obce. Klikněte na obec a otevře se její karta.';
    else if (z < CFG.rasterMinZoom - 0.4) msg = 'Modré čtverečky jsou obce s jednotnými daty. Přibližte si obec nebo ji vyhledejte.';
    else if (S.layers.up && !coverageInView()) msg = !regionalInView()
      ? 'Tady jednotná data zatím nejsou. Klikněte do mapy a ukážeme, kde najdete územní plán obce.'
      : (S.intent !== null || S.plan)
        ? (regionalCfgsInView().some(c => c.layers.some(L => L.std || L.kind === 'arcgisVector')) ? 'Plány s typem plochy jsou přebarvené podle režimu, ostatní plány jsou šedě.' : 'Tady jednotná data nejsou, režim mapu nepřebarví. Šedě je plán obce z dat kraje.')
        : (() => {
          const cs = regionalCfgsInView();
          const kde = cs.every(c => c.pdf) ? 'Výkres z PDF obce.' : cs.every(c => c.obec) ? 'Plán z dat města.'
            : cs.every(c => !c.obec && !c.only && !c.layers.some(L => L.obce)) ? 'Plán obce z dat kraje.' : 'Plány obcí z dat krajů, ORP a měst.';
          return kde + ' Jednotná data tu zatím nejsou.';
        })();
    const h = $('#hint'); h.textContent = msg; h.hidden = !msg;
  }
  function updateRatio() {
    const res = view.getResolution(); const c = ol.proj.toLonLat(view.getCenter());
    const ground = res * Math.cos(c[1] * Math.PI / 180);
    $('#ratio').textContent = '1 : ' + fmtInt(niceRound(ground / 0.000264583));
  }

  // ---------------------------------------------------------------------------
  // Výběr místa a karta
  // ---------------------------------------------------------------------------
  let selToken = 0;
  function pickNewest(list) {
    let best = null;
    for (const f of list) {
      const id = +(f.get ? f.get('id_metadata') : f.id_metadata) || 0;
      if (!best || id >= (+(best.get ? best.get('id_metadata') : best.id_metadata) || 0)) best = f;
    }
    return best;
  }
  function outlineSelected() {
    const sel = S.sel; if (!sel) return;
    const fs = upSource.getFeaturesAtCoordinate(sel.coord).filter(f => !SUP_ALL.has(f.get('id_metadata')));
    const f = pickNewest(fs);
    if (!f) return;
    sel.outlined = true; sel.local = f;
    selSource.getFeatures().filter(x => x.get('kind') === 'outline').forEach(x => selSource.removeFeature(x));
    const o = new ol.Feature(f.getGeometry().clone()); o.set('kind', 'outline'); selSource.addFeature(o);
    if (!sel.ngup || !sel.ngup.plocha) renderCard();
  }
  function selectAt(coord, opts) {
    opts = opts || {};
    const token = ++selToken;
    const sel = S.sel = { coord, ll: ol.proj.toLonLat(coord), sample: !!opts.sample, outlined: false };
    selSource.clear(); hoverSource.clear();
    const pin = new ol.Feature(new ol.geom.Point(coord)); pin.set('kind', 'pin'); selSource.addFeature(pin);
    outlineSelected();
    showCard(); renderCard(); writeHash();
    const done = () => { if (token === selToken) renderCard(); };
    track(identifyNgup(coord)).then(r => { sel.ngup = processNgup(r); }, e => { sel.ngup = { error: e }; }).then(done);
    const ruianP = track(identifyRuian(coord)).then(r => { sel.ruian = processRuian(r); }, e => { sel.ruian = { error: e }; });
    ruianP.then(done);
    ruianP.then(() => Promise.race([loadObce(), new Promise(r => setTimeout(r, 4000))])).then(() => {
      const R = sel.ruian && !sel.ruian.error ? sel.ruian : null;
      sel.obec = R && R.obec ? obecRec(R.obec.kod) : null;
      const cfg = R && R.kraj && !(R.obec && COVMAP.has(+R.obec.kod)) ? regionalCfgFor(R.kraj.kod, R.obec && R.obec.kod) : null;
      if (!cfg) { sel.regional = { none: true }; return; }
      return identifyRegional(coord, cfg, R).then(r => {
        sel.regional = r;
        // obrys vybrané plochy z krajských dat, podobně jako u jednotných dat
        const gj = r && r.hit && r.hit.geom;
        if (gj && token === selToken && !sel.outlined) {
          try {
            const o = new ol.Feature(esri.readGeometry(Object.assign({ spatialReference: { wkid: 3857 } }, gj)));
            o.set('kind', 'outline'); selSource.addFeature(o); sel.outlined = true;
          } catch (_) { /* geometrie bez obrysu */ }
        }
      }, () => { sel.regional = { cfg, failed: true }; });
    }).then(done);
    identifyRadon(coord).then(r => { sel.radon = processRadon(r); }, e => { sel.radon = { error: e }; }).then(done);
    identifyFlood(coord).then(r => { sel.flood = processFlood(r); }, e => { sel.flood = { error: e }; }).then(done);
  }
  function clearSelection() {
    selToken++; S.sel = null; selSource.clear();
    $('#card').hidden = true; $('#card').innerHTML = ''; $('#intro').hidden = false;
    setSheet('peek'); writeHash();
  }
  function showCard() {
    $('#intro').hidden = true; $('#card').hidden = false;
    $('#sheet').scrollTop = 0;
    if (isMobile()) setSheet('peek');
  }

  const pointQuery = (coord, half, extra) => {
    const [x, y] = coord;
    return 'f=json&geometryType=esriGeometryPoint&sr=3857&returnGeometry=false&imageDisplay=400,400,96'
      + '&mapExtent=' + [x - half, y - half, x + half, y + half].map(v => v.toFixed(2)).join(',')
      + '&geometry=' + encodeURIComponent(JSON.stringify({ x: +x.toFixed(2), y: +y.toFixed(2) })) + (extra || '');
  };
  async function identifyNgup(coord) {
    const base = CFG.ngup + 'DUP/MapServer/identify?';
    const [poly, line] = await Promise.all([
      jsonp(base + pointQuery(coord, 100, '&tolerance=1&returnFieldName=true&returnUnformattedValues=true&layers=all:1,2,3,4,5,6,8,10,11,12,13,14,15,16')),
      jsonp(base + pointQuery(coord, 100, '&tolerance=6&returnFieldName=true&returnUnformattedValues=true&layers=all:0')).catch(() => ({ results: [] }))
    ]);
    return (poly.results || []).concat(line.results || []);
  }
  function processNgup(results) {
    results.forEach(r => { const a = r.attributes || {}; Object.keys(a).forEach(k => { if (typeof a[k] === 'string') a[k] = a[k].trim(); }); });
    const by = {};
    results.filter(r => !SUP_ALL.has(+r.attributes.id_metadata)).forEach(r => { (by[r.layerId] = by[r.layerId] || []).push(r.attributes); });
    const newest = arr => {
      if (!arr || !arr.length) return [];
      const m = Math.max(...arr.map(a => +a.id_metadata || 0));
      const seen = new Set();
      return arr.filter(a => (+a.id_metadata || 0) === m).filter(a => { const k = [a.druh, a.typ, a.ident, a.cash].join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
    };
    const plochy = newest(by[12]);
    return {
      plocha: plochy[0] || null,
      resene: (newest(by[13])[0] || {}).obec_kod || null,
      zastavene: newest(by[1]).length > 0,
      zastavitelne: newest(by[15]).length > 0,
      zmeny: newest(by[6]), rezervy: newest(by[8]), vps: newest(by[4]).concat(newest(by[0])),
      podminky: newest(by[10]), soud: newest(by[14]), uses: newest(by[3]),
      koridory: newest(by[5]).concat(newest(by[11])), prvkyRP: newest(by[2]), vi: newest(by[16])
    };
  }
  async function identifyRuian(coord) {
    return fetchJSON(CFG.ruian + 'identify?' + pointQuery(coord, 60, '&tolerance=1&returnFieldName=true&layers=all:5,7,12,15,17,22,24,28,30,32,34,40,42,44,46,48,50,52,54,56,58,60,62'), 15000);
  }
  async function identifyRegional(coord, cfg, R) {
    const perT = cfg.layers.find(L => L.kind === 'tilesPerObec');
    let perTitle = null;
    if (perT) {
      const t = R && R.obec ? perT.obce[String(R.obec.kod)] : null;
      if (!t) return { none: true };
      perTitle = t[1];
      // výkres po obcích bez dotazu na plochu; s WFS (T-MAPY) pokračuje dotazem níž
      if (!(cfg.info || []).length) return { cfg, hit: null, doc: { title: t[1] } };
    }
    const per = cfg.layers.find(L => L.kind === 'arcgisPerObec');
    if (per) {
      const it = R && R.obec ? await perObecItem(per, +R.obec.kod, R.obec.nazev, String(R.okres ? R.okres.kod : '')) : null;
      if (!it) return { none: true };
      return { cfg, hit: null, doc: { title: it.label, sheet: it.sheet } };
    }
    const ll = ol.proj.toLonLat(coord);
    const infos = cfg.info || [], docs = cfg.doc || [];
    const fieldsOf = (F, inf) => (inf && (inf.rulesFields) ? ['*'] : [...new Set(Object.values(F).concat(inf && inf.namesFrom ? [inf.namesFrom] : [], ((inf && inf.extra) || []).map(x => x[1])).filter(Boolean))]);
    const [hits, docHits, nameMaps] = await Promise.all([
      Promise.all(infos.map(inf => (inf.kind === 'wms' ? wmsQuery(inf, coord) : inf.kind === 'wfs' ? wfsQuery(inf, coord) : regionalQuery(inf.url, ll, fieldsOf(inf.fields, inf), inf.timeout, true, inf)).catch(() => null))),
      Promise.all(docs.map(dc => (dc.kind === 'wms' ? wmsQuery(dc, coord) : regionalQuery(dc.url, ll, fieldsOf(dc.fields), dc.timeout, false, dc)).catch(() => null))),
      Promise.all(infos.map(inf => namesFor(inf)))
    ]);
    let hit = null;
    // všechny dotazy na plochu selhaly (server neodpověděl nebo vrátil chybu): karta to řekne a nabídne nový pokus
    const failed = infos.length > 0 && hits.every(h => h === null);
    for (let i = 0; i < infos.length && !hit; i++) {
      const inf = infos[i];
      for (const a of hits[i] || []) {
        const v = k => pickVal(a, inf.fields, k);
        const text = v('text') || rulesFromFields(inf.rulesFields, a);
        const rName = nameMaps[i] && inf.namesFrom ? nameMaps[i].get(String(a[inf.namesFrom])) : null;
        const raw0 = v('code') == null ? null : String(v('code')).trim();
        const cm = raw0 ? /^([A-Za-z][\w.]{0,7})\s+[-–]\s+(.+)$/.exec(raw0) : null;
        const raw = cm ? cm[1] : raw0;
        const name = v('name') || rName || (v('text') ? String(v('text')).split(/\r?\n/)[0].trim().slice(0, 140) : null) || (cm ? cm[2] : null);
        if (!raw && !name && !v('label')) continue;
        const extra = (inf.extra || []).map(([lab, f, suf]) => { const x = nul(typeof a[f] === 'string' ? a[f].trim() : a[f]); return x == null || /^[-–—]$/.test(String(x)) ? null : [lab, String(x) + (suf || '')]; }).filter(Boolean);
        hit = { inf, raw, name, typ: classify(raw0, name, inf.codes), cash: statusOf(inf, a), text, obec: v('obec'), ident: v('label'), geom: a.__geom, extra,
          doc: { doc: cleanDoc(v('doc')), date: fmtDateVal(v('date')), dateLabel: inf.dateLabel, author: v('author') } };
        break;
      }
    }
    const doc = Object.assign({}, hit ? hit.doc : {});
    if (perTitle && !doc.title) doc.title = perTitle;
    docs.forEach((dc, i) => {
      const a = (docHits[i] || [])[0]; if (!a) return;
      const v = k => pickVal(a, dc.fields, k);
      ['title', 'doc', 'author', 'maker', 'obec', 'court', 'courtNote'].forEach(k => { if (!doc[k] && v(k)) doc[k] = String(v(k)); });
      if (!doc.date && v('date')) { doc.date = fmtDateVal(v('date')); doc.dateLabel = dc.dateLabel; }
      // odkaz může přijít i jako HTML obrázek (<img src='…'>), např. legenda z GetFeatureInfo Pardubického kraje
      ['text', 'link', 'legend', 'docs', 'changes'].forEach(k => {
        const raw = v(k), u = safeUrl(raw) || safeUrl(((/src=['"]([^'"]+)['"]/i.exec(String(raw || '')) || [])[1]) || '');
        if (u && !doc[k] && !(dc.skip && u.endsWith(dc.skip))) doc[k] = u;
      });
    });
    return { cfg, hit, doc, failed };
  }
  const NATURE = { 30: 'Národní park', 32: 'Ochranné pásmo národního parku', 34: 'Zóna národního parku', 40: 'Chráněná krajinná oblast', 42: 'Zóna CHKO', 44: 'Národní přírodní rezervace', 46: 'Ochranné pásmo NPR', 48: 'Národní přírodní památka', 50: 'Ochranné pásmo NPP', 52: 'Přírodní rezervace', 54: 'Ochranné pásmo přírodní rezervace', 56: 'Přírodní památka', 58: 'Ochranné pásmo přírodní památky', 60: 'Evropsky významná lokalita (Natura 2000)', 62: 'Ptačí oblast (Natura 2000)' };
  function processRuian(json) {
    const R = { nature: [], chlu: [], dp: [] };
    (json.results || []).forEach(r => {
      const a = r.attributes || {};
      const id = r.layerId;
      if (id === 5 && !R.parcel) R.parcel = a;
      else if (id === 7) R.ku = a;
      else if (id === 12) R.obec = a;
      else if (id === 15) R.okres = a;
      else if (id === 17) R.kraj = a;
      else if (id === 28) R.bpej = a;
      else if (id === 22) R.dp.push(a);
      else if (id === 24) R.chlu.push(a);
      else if (NATURE[id]) R.nature.push({ label: NATURE[id], name: nul(a.nazev) || nul(a.popis) || '' });
    });
    return R;
  }
  async function identifyRadon(coord) {
    return fetchJSON(CFG.radon + 'identify?' + pointQuery(coord, 80, '&tolerance=1&layers=all:1'), 12000);
  }
  async function identifyFlood(coord) {
    return jsonp(CFG.flood + 'identify?' + pointQuery(coord, 80, '&tolerance=1&returnFieldName=true&layers=all:11,12,13,14,15'), 15000);
  }
  const FLOOD = {
    11: { rank: 5, cls: 'warn', t: 'Aktivní zóna záplavového území', d: 'Tudy při povodni proudí voda. Podle vodního zákona se tu nesmí stavět, až na výjimky jako vodní díla nebo nezbytné cesty a sítě.' },
    15: { rank: 4, cls: 'warn', t: 'Záplavové území pětileté vody', d: 'Voda sem dosáhne i při malé povodni, která přichází v průměru jednou za pět let.' },
    14: { rank: 3, cls: 'warn', t: 'Záplavové území dvacetileté vody', d: 'Voda sem dosáhne při povodni, která přichází v průměru jednou za dvacet let.' },
    13: { rank: 2, cls: 'warn', t: 'Záplavové území stoleté vody', d: 'Při stoleté povodni sem dosáhne voda. Stavět se tu obvykle dá, ale vodoprávní úřad může stanovit podmínky.' },
    12: { rank: 1, cls: 'info', t: 'Území extrémní povodně', d: 'Mimo stoletou vodu, ale při extrémní pětisetleté povodni sem voda dosáhnout může.' }
  };
  function processFlood(json) {
    let best = null;
    (json.results || []).forEach(r => {
      const f = FLOOD[r.layerId]; if (!f) return;
      if (!best || f.rank > best.rank) best = Object.assign({ tok: nul((r.attributes || {}).NAZ_TOK) }, f);
    });
    return best || { none: true };
  }
  function processRadon(json) {
    const r = (json.results || [])[0];
    if (!r) return { none: true };
    const a = r.attributes || {};
    const find = re => { const k = Object.keys(a).find(k => re.test(k)); return k ? nul(a[k]) : null; };
    return { index: parseInt(find(/převažující/i), 10) || null, popis: find(/popis/i), hornina: find(/^hornina$/i), typ: find(/typ horniny/i) };
  }

  // ---- karta ----
  const skel = () => '<span class="skel w80"></span><span class="skel w60"></span>';
  const krajFromRuian = R => (R && R.kraj ? +R.kraj.kod : null);
  function placeLine(sel) {
    const R = sel.ruian;
    if (R && !R.error && R.parcel) {
      const p = R.parcel;
      const num = (p.druhcislovanikod === 'Stavební' ? 'st. ' : '') + p.kmenovecislo + (nul(p.poddelenicisla) ? '/' + p.poddelenicisla : '');
      const ku = R.ku ? R.ku.nazev : '';
      return `Parcela ${esc(num)}${ku ? ', k. ú. ' + esc(ku) : ''}`;
    }
    if (R && !R.error && R.obec) return esc(R.obec.nazev);
    if (!R) return 'Načítám místo…';
    return 'Vybrané místo';
  }
  function subLine(sel) {
    const R = sel.ruian;
    if (!R || R.error) return '';
    const parts = [R.obec && R.obec.nazev, R.okres && ('okres ' + R.okres.nazev), R.kraj && R.kraj.nazev].filter(Boolean);
    return esc(parts.join(', '));
  }
  function plochaOf(sel) {
    if (sel.ngup && sel.ngup.plocha) return { typ: sel.ngup.plocha.typ, cash: +sel.ngup.plocha.cash, ident: nul(sel.ngup.plocha.ident), meta: +sel.ngup.plocha.id_metadata };
    if (sel.local) return { typ: sel.local.get('typ'), cash: +sel.local.get('cash'), ident: nul(sel.local.get('ident')), meta: +sel.local.get('id_metadata') };
    const h = sel.regional && sel.regional.hit;
    if (h && h.typ && TYPE[h.typ]) return { typ: h.typ, cash: h.cash || 1, cashKnown: !!h.cash, ident: h.ident ? String(h.ident) : (h.raw ? String(h.raw) : null), raw: h.raw ? String(h.raw) : null, meta: null, regional: true, name: h.name, text: h.text };
    return null;
  }
  function coverageOf(sel) {
    if (sel.local) return true;
    const N = sel.ngup;
    if (N && !N.error && (N.resene || N.plocha)) return true;
    const ob = sel.ruian && !sel.ruian.error && sel.ruian.obec ? +sel.ruian.obec.kod : null;
    const reg = !!(sel.regional && sel.regional.cfg);
    if (N && N.error) {
      if (ob && COVMAP.has(ob)) return 'error';
      if (sel.regional === undefined) return null;
      return reg ? 'regional' : 'error';
    }
    if (N && ob && COVMAP.has(ob)) return 'obec';
    if (!N || !sel.ruian || sel.regional === undefined) return null;
    // obec, kterou data kraje podle ověření (scripts/pokryti.py) nepokrývají: bez nálezu v bodě je to obec bez dat
    // (týká se jen krajských mozaik; záznam města nebo výkres obce, který obec výslovně uvádí, platí vždy)
    const explicit = reg && (sel.regional.cfg.obec || sel.regional.cfg.layers.some(L => L.obce));
    if (reg && !explicit && sel.obec && sel.obec[0] === '-' && !sel.regional.hit) return false;
    if (reg) return 'regional';
    return false;
  }
  // stav územního plánu obce podle evidence NGÚP (dist/obce.json)
  function planInfo(sel) {
    const r = sel.obec; if (!r) return null;
    const R = sel.ruian && !sel.ruian.error ? sel.ruian : null;
    const obec = R && R.obec ? R.obec.nazev : '';
    const d = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${+m[3]}. ${+m[2]}. ${m[1]}` : null; };
    return { stav: r[2], nazev: r[3] || (obec ? 'Územní plán ' + obec : 'Územní plán'), ucinnost: d(r[4]), zmen: +r[5] || 0, posledni: d(r[6]), porizuje: !!r[7], web: safeUrl(r[8] || '') };
  }
  function titleBlock(sel) {
    const pl = plochaOf(sel);
    const cov = coverageOf(sel);
    let sw = '', title = '', official = '', row = '';
    if (pl) {
      const rgb = (TYPE[pl.typ] || {}).rgb || [200, 200, 200];
      const bg = pl.cash === 2
        ? `background-color:${rgba(rgb, 0.3)};background-image:repeating-linear-gradient(-45deg, ${rgba(darken(rgb, 0.2), 1)} 0 3px, transparent 3px 9px)`
        : `background:${rgba(rgb, 0.95)}`;
      const code = pl.regional ? (pl.raw || pl.ident || pl.typ) : pl.typ;
      sw = `<div class="tb-swatch" style="${bg}"><b>${esc(String(code).slice(0, 6))}</b></div>`;
      title = esc(PLAIN[pl.typ] ? PLAIN[pl.typ].t : (TYPE[pl.typ] || {}).n || pl.typ);
      if (pl.regional) {
        const nm = pl.name ? String(pl.name).replace(/^\s*[A-Za-z][\w.]{0,7}\s+[-–]\s+/, '') : '';
        official = esc(nm ? nm.charAt(0).toUpperCase() + nm.slice(1) : 'Plocha ' + ((TYPE[pl.typ] || {}).n || pl.typ)) + (pl.cash === 2 ? ', návrh' : '');
        row = `<div class="tb-row">
        <div class="tb-cell"><span class="tb-l">Stav</span><span class="tb-v state-chip"><i class="${pl.cash === 2 ? 'navrh' : ''}"></i>${pl.cashKnown ? (pl.cash === 2 ? 'navržená' : 'stávající') : 'neuvedeno'}</span></div>
        <div class="tb-cell"><span class="tb-l">Zdroj</span><span class="tb-v">data ${sel.regional && sel.regional.cfg && sel.regional.cfg.obec ? 'města' : 'kraje'}</span></div>
        <div class="tb-cell"><span class="tb-l">Označení v ÚP</span><span class="tb-v num">${esc(pl.ident || 'bez označení')}</span></div>
      </div>`;
      } else {
        official = 'Plocha ' + esc((TYPE[pl.typ] || {}).n || pl.typ) + (pl.cash === 2 ? ', návrh' : '');
        const N = sel.ngup && !sel.ngup.error ? sel.ngup : null;
        const uzemi = N ? (N.zastavene ? 'zastavěné' : (N.zastavitelne ? 'zastavitelné' : 'nezastavěné')) : '…';
        row = `<div class="tb-row">
        <div class="tb-cell"><span class="tb-l">Stav</span><span class="tb-v state-chip"><i class="${pl.cash === 2 ? 'navrh' : ''}"></i>${pl.cash === 2 ? 'navržená' : 'stávající'}</span></div>
        <div class="tb-cell"><span class="tb-l">Území</span><span class="tb-v">${uzemi}</span></div>
        <div class="tb-cell"><span class="tb-l">Označení v ÚP</span><span class="tb-v num">${esc(pl.ident || 'bez označení')}</span></div>
      </div>`;
      }
    } else if (cov === null) {
      sw = `<div class="tb-swatch none"><b>…</b></div>`;
      title = '<span class="skel w60"></span>'; official = '<span class="skel w40"></span>';
    } else if (cov === 'regional') {
      const r = sel.regional, h = r.hit, d = r.doc || {};
      if (h) {
        sw = `<div class="tb-swatch none"><b>${esc(String(h.raw || '?').slice(0, 6))}</b></div>`;
        title = esc(h.name ? String(h.name).charAt(0).toUpperCase() + String(h.name).slice(1) : 'Plocha ' + (h.raw || ''));
        official = `Typ plochy z dat ${r.cfg.obec ? 'města' : 'kraje'}, který neumíme převést do jednotné legendy.`;
      } else if (r.failed) {
        const kdo = r.cfg.obec ? 'města' : 'kraje';
        sw = `<div class="tb-swatch none"><b>!</b></div>`;
        title = r.cfg.drawing ? 'Výkres územního plánu' : `Server ${kdo} teď neodpovídá`;
        official = (r.cfg.drawing ? `Typ plochy se nepodařilo načíst, server ${kdo} neodpověděl. ` : 'Plochu se nepodařilo načíst. ') + '<button class="link-btn" data-act="retry">Zkusit znovu</button>';
      } else {
        sw = `<div class="tb-swatch none"><b>${r.cfg.pdf ? 'PDF' : 'ÚP'}</b></div>`;
        title = r.cfg.pdf ? 'Výkres územního plánu z PDF' : r.cfg.drawing ? 'Výkres územního plánu' : `Plocha v datech ${r.cfg.obec ? 'města' : 'kraje'} nenalezena`;
        official = esc(d.title || d.doc || (r.cfg.pdf ? r.cfg.pdf.verze : r.cfg.drawing ? cap(r.cfg.name) : 'Obec zatím nemá plán v jednotných datech.')) + (d.date ? `, ${esc(d.date)}` : '');
      }
    } else if (cov === 'error') {
      sw = `<div class="tb-swatch none"><b>!</b></div>`;
      title = 'Územní plán se nepodařilo načíst';
      official = 'Server Národního geoportálu neodpověděl. <button class="link-btn" data-act="retry">Zkusit znovu</button>';
    } else if (cov) {
      sw = `<div class="tb-swatch none"><b>?</b></div>`;
      title = 'Plocha nenalezena';
      official = 'Na tomto místě územní plán obce žádnou plochu nevymezuje.';
    } else {
      const P = planInfo(sel);
      if (P && P.stav === 'x') {
        sw = `<div class="tb-swatch none"><b>bez ÚP</b></div>`;
        title = 'Bez územního plánu v evidenci';
        official = 'V evidenci Národního geoportálu není žádný vydaný územní plán obce.' + (P.porizuje ? ' Obec ho pořizuje.' : '');
      } else if (P && P.stav === 'p') {
        sw = `<div class="tb-swatch none"><b>PDF</b></div>`;
        title = 'Územní plán zatím jen v dokumentech';
        official = esc(P.nazev) + (P.ucinnost ? `, účinný od ${esc(P.ucinnost)}` : '') + (P.zmen ? `, ${P.zmen} ${plural(P.zmen, 'změna', 'změny', 'změn')}` : '') + '. V mapě ho zatím nemáme.';
      } else {
        sw = `<div class="tb-swatch none"><b>PDF</b></div>`;
        title = 'Územní plán zatím jen v dokumentech';
        official = 'Tato obec ještě nemá plán v datech, která umíme zobrazit.';
      }
    }
    return `<div class="tb">
      <div class="tb-head"><div class="tb-place">${placeLine(sel)}<small>${subLine(sel)}</small></div><button class="icon-btn" data-act="close" aria-label="Zavřít kartu">${icon('i-close')}</button></div>
      <div class="tb-grid">${sw}<div class="tb-cell"><span class="tb-l">Plocha podle územního plánu</span><span class="tb-v tb-title">${title}</span><span class="tb-official">${official}</span></div></div>
      ${row}
    </div>`;
  }
  function meaningSec(sel) {
    const pl = plochaOf(sel);
    if (!pl) return '';
    const p = PLAIN[pl.typ];
    let html = `<p class="meaning">${esc(p ? p.d : (TYPE[pl.typ] || {}).n)}</p>`;
    if (pl.cash === 2) html += `<p>Plocha je <b>navržená</b>. Územní plán s ní počítá do budoucna, dnes tu ještě nemusí nic stát.</p>`;
    html += decodeIdent(sel, pl);
    return `<section class="sec">${html}</section>`;
  }
  // Liberec (ÚP 2022): specifikace plochy = výšková hladina - Kn - Kz - charakter zástavby
  function decodeIdent(sel, pl) {
    const obec = (sel.ngup && sel.ngup.resene) || (sel.ruian && !sel.ruian.error && sel.ruian.obec && sel.ruian.obec.kod);
    if (+obec !== 563889 || !pl.ident) return '';
    const m = /^(\d)-(\d{1,3})-(\d{1,3})(?:-([a-z]))?$/.exec(pl.ident);
    if (!m) return '';
    const lvl = +m[1], h = lvl * 3.25 + 6.5;
    return `<dl class="kv ident">
      <dt>Výšková hladina</dt><dd><span class="num">${lvl}</span>, budovy zhruba do <span class="num">${h.toLocaleString('cs-CZ')}</span> m</dd>
      <dt>Zastavění (Kn)</dt><dd><span class="num">${+m[2]}</span>, podíl plochy pro nadzemní stavby</dd>
      <dt>Zeleň (Kz)</dt><dd><span class="num">${+m[3]}</span>, podíl plochy, který zůstane zelený</dd>
    </dl><p class="note">Rozluštěno podle textové části ÚP Liberec, kde kód ${esc(pl.ident)} určuje výšku a intenzitu zástavby. Výška je výšková hladina × 3,25 m + 6,5 m.</p>`;
  }
  function regionalSec(sel) {
    const r = sel.regional, d = r.doc || {}, pl = plochaOf(sel);
    let lead;
    if (pl && pl.regional) lead = `Obec zatím nemá plán v jednotných datech. Plochu jsme vzali ${esc(r.cfg.from)} a její význam převedli do jednotné legendy, proto berte výklad jako orientační.`;
    else if (r.hit) lead = `Obec zatím nemá plán v jednotných datech. Plochu jsme našli ${esc(r.cfg.from)}, ale její typ neumíme spolehlivě převést do jednotné legendy.`;
    else if (r.cfg.pdf) {
      // výkres z PDF obce (scripts/vykresy.py): vlícovaný proti katastru, přesnost změřená v oknech po celé obci
      const P = r.cfg.pdf, ch = String(Math.max(1, Math.ceil(P.chyba))).replace('.', ',');
      lead = `Obec nemá mapovou službu s územním plánem, hlavní výkres (${esc(P.verze)}) jsme proto vlícovali z PDF obce. Proti katastrální mapě sedí s odchylkou do ${ch} m, ověřeno v ${P.oken} místech po celé obci. Barvy a zkratky čtěte podle legendy na výkresu.`;
    }
    else if (r.cfg.drawing) {
      // obec může mít zveřejněný jen koordinační výkres (plochy i limity, závazný je ale hlavní výkres)
      const kov = /koordinační/i.test(d.title || '');
      lead = r.cfg.lead ? esc(r.cfg.lead) : `Obec zatím nemá plán v jednotných datech, takže ho neumíme převést do lidské řeči. V mapě vidíte ${kov ? 'koordinační' : 'hlavní'} výkres jejího územního plánu ${esc(r.cfg.from)}. Barvy a zkratky čtěte podle legendy obce.`
        + (kov ? ' Koordinační výkres ukazuje kromě ploch i limity a záměry, závazný je hlavní výkres.' : '');
    }
    else lead = `Obec zatím nemá plán v jednotných datech a ${esc(r.cfg.from)} jsme pro toto místo plochu nenašli.`;
    let html = `<p${pl && pl.regional ? '' : ' class="meaning"'}>${lead}</p>`;
    // zdroj, u kterého neznáme verzi plánu (krajská mozaika bez data a čísla změny)
    if (r.cfg.versionNote) html += `<p class="note">${esc(r.cfg.versionNote)}</p>`;
    if (d.court) html += `<ul class="flags" style="margin:8px 0"><li class="warn"><span><b>Tuto část územního plánu zrušil soud</b> (č. j. ${esc(d.court)}). Ověřte si na úřadu, co tu teď platí.${d.courtNote ? ' ' + esc(d.courtNote) : ''}</span></li></ul>`;
    const ex = (r.hit && r.hit.extra) || [];
    if (ex.length) html += `<dl class="kv" style="margin-bottom:8px">${ex.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
    const rows = [];
    if (d.title && d.title !== d.doc) rows.push(['Územní plán', esc(d.title)]);
    if (d.sheet) rows.push(['Výkres', esc(d.sheet)]);
    if (d.doc) rows.push(['Dokumentace', esc(d.doc)]);
    if (d.date) rows.push([esc(d.dateLabel || 'Platí od'), esc(d.date)]);
    if (d.author) rows.push(['Zpracovatel', esc(d.author)]);
    else if (d.maker) rows.push(['Zpracovatel', esc(d.maker)]);
    if (rows.length) html += `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    const btns = [];
    if (d.text) btns.push(`<a class="btn primary" href="${esc(d.text)}" target="_blank" rel="noopener">Textová část (PDF)</a>`);
    if (d.legend) btns.push(`<a class="btn" href="${esc(d.legend)}" target="_blank" rel="noopener">Legenda výkresu</a>`);
    if (d.docs) btns.push(`<a class="btn${d.text ? '' : ' primary'}" href="${esc(d.docs)}" target="_blank" rel="noopener">Dokumenty ÚP v archivu kraje</a>`);
    if (d.changes) btns.push(`<a class="btn" href="${esc(d.changes)}" target="_blank" rel="noopener">Změny ÚP</a>`);
    if (d.link) btns.push(`<a class="btn" href="${esc(d.link)}" target="_blank" rel="noopener">Legenda a výkresy</a>`);
    (r.cfg.links || []).forEach(l => { if (safeUrl(l.url)) btns.push(`<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`); });
    if (btns.length) html += `<div class="actions" style="margin-top:10px">${btns.join('')}</div>`;
    return `<section class="sec"><h3>${pl && pl.regional ? 'Odkud je tahle plocha' : 'Co tu ukazujeme'}</h3>${html}</section>`;
  }
  // Znění podmínek plochy převzaté z územního plánu (krajská data, např. Vysočina)
  const RULE_HEAD = /(Hlavní využití|Přípustné využití|Podmíněně přípustné využití|Nepřípustné využití|Podmínky prostorového uspořádání[^:\n]{0,80}|Základní podmínky ochrany krajinného rázu[^:\n]{0,60}|Další podmínky[^:\n]{0,60})\s*:/gi;
  function rulesSec(sel) {
    const pl = plochaOf(sel);
    const text = pl && pl.regional ? pl.text : (sel.regional && sel.regional.hit && sel.regional.hit.text);
    if (!text) return '';
    const t = String(text).replace(/\r/g, '').trim();
    const parts = []; let m, last = 0, head = null;
    RULE_HEAD.lastIndex = 0;
    while ((m = RULE_HEAD.exec(t))) { parts.push([head, t.slice(last, m.index)]); head = m[1].trim(); last = RULE_HEAD.lastIndex; }
    parts.push([head, t.slice(last)]);
    const body = txt => {
      const lines = txt.split('\n').map(x => x.trim()).filter(Boolean);
      const li = lines.filter(x => /^[-–•·]/.test(x)), pl2 = lines.filter(x => !/^[-–•·]/.test(x));
      return pl2.map(x => `<p>${esc(x)}</p>`).join('') + (li.length ? `<ul>${li.map(x => `<li>${esc(x.replace(/^[-–•·]\s*/, ''))}</li>`).join('')}</ul>` : '');
    };
    const title = parts[0][0] === null ? parts[0][1].split('\n')[0].trim() : '';
    const secs = parts.filter(([h]) => h).map(([h, x]) => `<div class="rule"><h4>${esc(h)}</h4>${body(x)}</div>`).join('');
    const intro = parts[0][0] === null ? body(parts[0][1].split('\n').slice(1).join('\n')) : '';
    const content = (secs || intro) ? intro + secs : body(t);
    return `<section class="sec"><h3>Co říká územní plán obce</h3><details class="rules"${t.length < 900 ? ' open' : ''}><summary>${esc(title || 'Podmínky využití této plochy')}<span class="muted"> · znění z územního plánu</span></summary>${content}</details></section>`;
  }
  function canSec(sel) {
    const pl = plochaOf(sel);
    if (!pl || !PLAIN[pl.typ]) return '';
    const v = PLAIN[pl.typ].i;
    const rows = INTENTS.map((it, k) => `<li${S.intent === k ? ' class="hl"' : ''}>${icon(it.icon)}<span>${esc(it.label)}</span><span class="v v${v[k]}">${icon(VERDICT_ICON[v[k]])}${VERDICT[v[k]]}</span></li>`);
    return `<section class="sec"><h3>Co se tu typicky smí postavit</h3><ul class="can">${rows.join('')}</ul>
      <p class="note">Orientačně podle typu plochy. Výšku, zastavěnost a další podmínky stanoví textová část územního plánu obce.</p></section>`;
  }
  const VPS_LABEL = { VD: 'dopravní stavba', VT: 'technická infrastruktura', VO: 'občanské vybavení', VZ: 'zelená infrastruktura', VP: 'veřejné prostranství', VN: 'ochrana před povodněmi a jinými riziky', VU: 'prvek ÚSES', VH: 'ochrana přírodního nebo kulturního dědictví', VB: 'obrana a bezpečnost státu' };
  const USES_LABEL = { NRBK: 'nadregionální biokoridor', NRBC: 'nadregionální biocentrum', RBK: 'regionální biokoridor', RBC: 'regionální biocentrum', LBK: 'lokální biokoridor', LBC: 'lokální biocentrum' };
  const KOR_LABEL = { DI: 'dopravní stavbu', TI: 'technickou infrastrukturu', X: 'opatření v krajině' };
  const VI_LABEL = { DI: 'dopravní infrastrukturu', TI: 'technickou infrastrukturu', OV: 'občanské vybavení', VP: 'veřejné prostranství' };
  const LEVEL = { PUR: 'z politiky územního rozvoje státu', URP: 'z územního rozvojového plánu státu', ZUR: 'ze zásad územního rozvoje kraje' };
  const idTxt = a => (nul(a.ident) ? ` (${esc(a.ident)})` : '');
  function flagsSec(sel) {
    const N = sel.ngup;
    if (!N) return `<section class="sec"><h3>Na co si dát pozor</h3>${skel()}</section>`;
    const cv = coverageOf(sel);
    if (cv === null) return `<section class="sec"><h3>Na co si dát pozor</h3>${skel()}</section>`;
    if (N.error || cv === false || cv === 'error' || cv === 'regional' || (cv === 'obec' && !N.plocha)) return '';
    const items = [];
    N.soud.forEach(a => items.push(['warn', `<b>Tuto část územního plánu zrušil ${a.vydorgan === 'N' ? 'nadřízený orgán' : 'soud'}</b>${nul(a.c_jednaci) ? ' (č. j. ' + esc(a.c_jednaci) + ')' : ''}. Ověřte si na obci, co tu teď platí.`]));
    N.rezervy.forEach(a => items.push(['warn', `<b>Územní rezerva${idTxt(a)}.</b> Místo se drží pro budoucí ${esc(PLAIN[a.typ] ? PLAIN[a.typ].t.toLowerCase() : 'záměr')}. Do té doby tu nesmí vzniknout nic, co by to ztížilo.`]));
    N.vps.forEach(a => {
      if (a.druh === 'VA') items.push(['warn', `<b>Plocha asanace${idTxt(a)}.</b> Území určené k odstranění závad, třeba staré zátěže nebo zchátralých staveb.`]);
      else items.push(['warn', `<b>Veřejně prospěšná stavba nebo opatření${idTxt(a)}</b>: ${esc(VPS_LABEL[a.druh] || 'veřejný záměr')}. Pro takový záměr lze pozemek vyvlastnit nebo k němu uplatnit předkupní právo.`]);
    });
    N.koridory.forEach(a => items.push(['warn', `<b>Koridor pro ${esc(KOR_LABEL[a.typ] || 'budoucí stavbu')}${idTxt(a)}.</b> Územní plán tu drží pás pro budoucí stavbu, takže jiné stavby jsou omezené.`]));
    N.uses.forEach(a => items.push(['warn', `<b>Územní systém ekologické stability</b>: ${esc(USES_LABEL[a.typ] || 'prvek zelené sítě')}${idTxt(a)}. Zelená síť krajiny, stavět se tu skoro nedá.`]));
    N.podminky.forEach(a => {
      const lhuta = nul(a.datum) ? czDate(a.datum) : null;
      const t = { US: ['Podmínkou je územní studie', 'Než se tu začne stavět, musí vzniknout studie, která určí, jak má zástavba vypadat.'], RP: ['Podmínkou je regulační plán', 'Stavět se dá až podle regulačního plánu s podrobnými pravidly.'], PS: ['Podmínkou je plánovací smlouva', 'Stavebník se musí s obcí dohodnout, třeba na podílu na silnici nebo sítích.'], AU: ['Podmínkou je architektonická nebo urbanistická soutěž', 'O podobě zástavby rozhodne soutěž návrhů.'] }[a.druh] || ['Platí tu zvláštní podmínka', ''];
      items.push(['warn', `<b>${t[0]}${nul(a.ident) ? ' „' + esc(String(a.ident).replace(/_/g, ' ')) + '“' : ''}.</b> ${t[1]}${lhuta ? ' Lhůta pro splnění: ' + lhuta + '.' : ''}`]);
    });
    N.zmeny.forEach(a => {
      if (a.druh === 'Z') items.push(['info', `<b>Zastavitelná plocha${idTxt(a)}.</b> Obec tady počítá s novou zástavbou.`]);
      else if (a.druh === 'T') items.push(['info', `<b>Plocha přestavby${idTxt(a)}.</b> Území se má proměnit, třeba z továrny na bydlení.`]);
      else if (a.druh === 'K') items.push(['info', `<b>Změna v krajině${idTxt(a)}.</b> Plánovaná úprava krajiny, třeba zalesnění, mokřad nebo protierozní pás.`]);
    });
    N.prvkyRP.forEach(a => items.push(['info', `<b>Platí tu i prvky regulačního plánu${idTxt(a)}.</b> Pravidla jsou podrobnější, třeba stavební čára nebo výška.`]));
    N.vi.forEach(a => items.push(['info', `<b>Plocha pro ${esc(VI_LABEL[a.typ] || 'veřejnou infrastrukturu')}</b> ${esc(LEVEL[a.uroven] || '')}${idTxt(a)}.`]));
    const body = items.length
      ? `<ul class="flags">${items.map(([cls, t]) => `<li class="${cls}"><span>${t}</span></li>`).join('')}</ul>`
      : `<p class="muted">Kromě typu plochy tu územní plán nic dalšího nevymezuje.</p>`;
    return `<section class="sec"><h3>Na co si dát pozor</h3>${body}</section>`;
  }
  const ZPF = /orná|zahrad|sad|travní|vinic|chmel/i;
  function parcelSec(sel) {
    const R = sel.ruian;
    if (!R) return `<section class="sec"><h3>Pozemek</h3>${skel()}</section>`;
    if (R.error) return `<section class="sec"><h3>Pozemek</h3><p class="err">Katastr teď neodpovídá. Zkuste kliknout znovu.</p></section>`;
    const s = toSjtsk(sel.coord);
    const ll = sel.ll;
    const rows = [];
    if (R.parcel) {
      const p = R.parcel;
      const num = (p.druhcislovanikod === 'Stavební' ? 'st. ' : '') + p.kmenovecislo + (nul(p.poddelenicisla) ? '/' + p.poddelenicisla : '');
      rows.push(['Parcela', `<span class="num">${esc(num)}</span> <span class="muted">(${esc((p.druhcislovanikod || '').toLowerCase())})</span>`]);
      if (nul(p.vymeraparcely)) rows.push(['Výměra', `<span class="num">${fmtInt(+p.vymeraparcely)}</span> m²`]);
      if (nul(p.druhpozemkukod)) rows.push(['Druh pozemku', esc(p.druhpozemkukod)]);
      if (nul(p.zpusobyvyuzitipozemku)) rows.push(['Využití', esc(p.zpusobyvyuzitipozemku)]);
    }
    if (R.ku) rows.push(['Katastrální území', `${esc(R.ku.nazev)} <span class="muted num">(${esc(R.ku.kod)})</span>`]);
    rows.push(['S-JTSK', `<span class="num">Y ${fmtInt(-s[0])}, X ${fmtInt(-s[1])}</span>`]);
    rows.push(['GPS', `<span class="num">${ll[1].toFixed(5)} N, ${ll[0].toFixed(5)} E</span>`]);
    const kn = `https://nahlizenidokn.cuzk.gov.cz/MapaIdentifikace.aspx?l=KN&x=${Math.round(s[0])}&y=${Math.round(s[1])}`;
    const links = [`<a href="${kn}" target="_blank" rel="noopener">Nahlížení do katastru (vlastník, LV)</a>`];
    if (R.parcel && nul(R.parcel.id)) links.push(`<a href="https://vdp.cuzk.gov.cz/vdp/ruian/parcely/${encodeURIComponent(R.parcel.id)}" target="_blank" rel="noopener">Detail parcely v RÚIAN</a>`);
    return `<section class="sec"><h3>Pozemek</h3><dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><div class="links">${links.join('')}</div></section>`;
  }
  function natureSec(sel) {
    const R = sel.ruian;
    if (!R || R.error) return '';
    const items = [];
    R.nature.forEach(n => items.push(`<li class="warn"><span><b>${esc(n.label)}</b>${n.name ? ': ' + esc(n.name) : ''}. Stavba tu potřebuje vyjádření ochrany přírody.</span></li>`));
    R.chlu.forEach(a => items.push(`<li class="warn"><span><b>Chráněné ložiskové území</b>${nul(a.nazev) ? ': ' + esc(a.nazev) : ''}. Stavba musí respektovat ložisko nerostů a potřebuje souhlas.</span></li>`));
    R.dp.forEach(a => items.push(`<li class="warn"><span><b>Dobývací prostor</b>${nul(a.nazev) ? ': ' + esc(a.nazev) : ''}. Tady se těží nebo může těžit.</span></li>`));
    if (R.bpej && R.parcel && ZPF.test(R.parcel.druhpozemkukod || '')) {
      const code = nul(R.bpej.nazev) || nul(R.bpej.kod);
      if (code) items.push(`<li class="info"><span><b>BPEJ <span class="num">${esc(code)}</span></b>: kód kvality zemědělské půdy. Když se tu staví, platí se podle něj odvod za vynětí ze zemědělského půdního fondu.</span></li>`);
    }
    const body = items.length ? `<ul class="flags">${items.join('')}</ul>` : `<p class="muted">Podle RÚIAN tu není chráněné území přírody, Natura 2000 ani chráněné ložisko.</p>`;
    return `<section class="sec"><h3>Příroda a další omezení</h3>${body}</section>`;
  }
  function floodSec(sel) {
    const f = sel.flood;
    if (!f) return `<section class="sec"><h3>Povodně</h3>${skel()}</section>`;
    if (f.error) return `<section class="sec"><h3>Povodně</h3><p class="muted">Mapa záplavových území (VÚV TGM) teď neodpovídá.</p></section>`;
    if (f.none) return `<section class="sec"><h3>Povodně</h3><p class="muted">Místo neleží ve stanoveném záplavovém území. Záplavová území ale nejsou vymezená u všech potoků.</p></section>`;
    return `<section class="sec"><h3>Povodně</h3><ul class="flags"><li class="${f.cls}"><span><b>${esc(f.t)}</b>${f.tok ? ' (' + esc(f.tok) + ')' : ''}. ${esc(f.d)}</span></li></ul>
      <div class="links"><a href="https://www.dibavod.cz/" target="_blank" rel="noopener">Data VÚV TGM (DIBAVOD)</a></div></section>`;
  }
  const RADON_C = { 1: '#3c9a5f', 2: '#e0a020', 3: '#cf4a32' };
  function radonSec(sel) {
    const r = sel.radon;
    if (!r) return `<section class="sec"><h3>Radon v podloží</h3>${skel()}</section>`;
    if (r.error) return `<section class="sec"><h3>Radon v podloží</h3><p class="muted">Mapa radonu České geologické služby teď neodpovídá.</p></section>`;
    if (r.none || !r.index) return `<section class="sec"><h3>Radon v podloží</h3><p class="muted">Pro toto místo mapa radonového indexu nemá údaj.</p></section>`;
    const idx = Math.max(1, Math.min(3, r.index));
    const scale = [1, 2, 3].map(i => `<span class="${i <= idx ? 'on' : ''}" style="--rc:${RADON_C[idx]}"></span>`).join('');
    return `<section class="sec"><h3>Radon v podloží</h3>
      <div class="radon-head"><b>${esc(r.popis || '')}</b><span class="muted">radonový index ${idx} ze 3</span></div>
      <div class="radon-scale" aria-hidden="true">${scale}</div>
      ${r.hornina ? `<p class="muted">Podloží: ${esc(r.hornina)}${r.typ ? ', ' + esc(r.typ) : ''}.</p>` : ''}
      <p>Mapa 1 : 50 000 je jen orientační. U novostavby s obytnými místnostmi se radonový index pozemku zjišťuje měřením přímo na místě.</p>
      <div class="links"><a href="https://mapy.geology.cz/radon/" target="_blank" rel="noopener">Radonová mapa ČGS</a></div></section>`;
  }
  // Přímý odkaz na dokumenty obce v NGÚP (textová část, výkresy, úplné znění)
  function ngupDocsUrl(R) {
    if (!R || !R.obec || !nul(R.obec.kod)) return CFG.ngupDocs;
    const pid = 'ngup_tpd_v2_INSTANCE_vwhg', pre = '_' + pid + '_';
    const terms = R.obec.nazev + (R.okres ? ` (Okres ${R.okres.nazev})` : '');
    return `${CFG.ngupDocs}?p_p_id=${pid}&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&${pre}territoryCode=${encodeURIComponent(R.obec.kod)}&${pre}territoryParamName=codeMunicipality&${pre}searchTerms=${encodeURIComponent(terms)}`;
  }
  function sourceSec(sel) {
    const cov = coverageOf(sel);
    const R = sel.ruian && !sel.ruian.error ? sel.ruian : null;
    const kraj = KRAJE[krajFromRuian(R)];
    const obecName = R && R.obec ? R.obec.nazev : 'Obec';
    let html = '';
    if (cov === true || cov === 'obec') {
      const pl = plochaOf(sel);
      html += `<p>Územní plán obce ${esc(obecName)} v jednotném standardu z Národního geoportálu územního plánování (MMR).${pl && pl.meta ? ` <span class="muted">Verze dat ${pl.meta}.</span>` : ''}</p>`;
      html += `<p>Přesné podmínky (výšku, zastavěnost, co je přípustné) najdete v textové části územního plánu obce.</p>`;
      html += `<div class="actions"><a class="btn primary" href="${esc(ngupDocsUrl(R))}" target="_blank" rel="noopener">Textová část a výkresy ÚP</a>${kraj ? `<a class="btn" href="${esc(kraj.url)}" target="_blank" rel="noopener">${esc(kraj.label)}</a>` : ''}</div>`;
    } else if (cov === 'regional') {
      html += `<p>Data pocházejí ${esc(sel.regional.cfg.from)}. ${sel.regional.cfg.obec ? 'Mapové podklady města jsou' : 'Kraj je uvádí jako'} informativní, závazná je vydaná dokumentace obce. Najdete ji tady:</p>`;
      html += `<div class="actions"><a class="btn" href="${esc(ngupDocsUrl(R))}" target="_blank" rel="noopener">Dokumenty obce v Národním geoportálu</a>${kraj ? `<a class="btn" href="${esc(kraj.url)}" target="_blank" rel="noopener">${esc(kraj.label)}</a>` : ''}</div>`;
    } else if (cov === 'error') {
      html += `<p>Data územního plánu se teď nepodařilo načíst ze serveru NGÚP.</p><div class="actions"><button class="btn" data-act="retry">Zkusit znovu</button></div>`;
    } else if (cov === false) {
      const P = planInfo(sel);
      if (P && P.stav === 'x') {
        html += `<p>${esc(obecName)} podle evidence Národního geoportálu územního plánování nemá vydaný územní plán.${P.porizuje ? ' Nový plán se pořizuje.' : ''} Bez územního plánu se nové stavby umisťují hlavně v zastavěném území obce, co přesně jde, posoudí stavební úřad.</p>`
          + `<p class="note">Obce do evidence plány postupně doplňují. Pokud obec plán má, najdete ho na jejím webu.</p>`;
      } else if (P && P.stav === 'p') {
        html += `<p>${esc(obecName)} má platný ${esc(P.nazev.replace(/^Územní plán/, 'územní plán'))}${P.ucinnost ? `, účinný od ${esc(P.ucinnost)}` : ''}.`
          + (P.zmen ? ` Od té doby ${plural(P.zmen, 'vyšla', 'vyšly', 'vyšlo')} ${P.zmen} ${plural(P.zmen, 'změna', 'změny', 'změn')}${P.posledni ? `, poslední účinná od ${esc(P.posledni)}` : ''}.` : '')
          + (P.porizuje ? ' Obec teď pořizuje nový plán nebo další změnu.' : '')
          + ` V mapě ho zatím nemáme, výkresy a textovou část najdete v dokumentech:</p>`;
      } else {
        html += `<p>${esc(obecName)} zatím nemá územní plán v datech, která umíme zobrazit. Platný plán i s výkresy najdete tady:</p>`;
      }
      const ngupBtn = cls => `<a class="btn${cls}" href="${esc(ngupDocsUrl(R))}" target="_blank" rel="noopener">Dokumenty obce v Národním geoportálu</a>`;
      const webBtn = P && P.web ? `<a class="btn" href="${esc(P.web)}" target="_blank" rel="noopener">Web obce</a>` : '';
      const krajBtn = cls => (kraj ? `<a class="btn${cls}" href="${esc(kraj.url)}" target="_blank" rel="noopener">${esc(kraj.label)}</a>` : '');
      html += `<div class="actions">${kraj && kraj.primary ? krajBtn(' primary') + ngupBtn('') : ngupBtn(' primary') + krajBtn('')}${webBtn}</div>`;
      if (kraj && kraj.note) html += `<p class="note">${esc(kraj.note)}</p>`;
      if (OBCE && OBCE.stavUP) html += `<p class="note">Stav plánu podle evidence NGÚP k ${esc(OBCE.stavUP.split('-').reverse().map(Number).join('. '))}.</p>`;
    } else {
      html += skel();
    }
    html += `<div class="actions" style="margin-top:12px"><button class="btn" data-act="copy">${icon('i-link')}Kopírovat odkaz na místo</button></div>`;
    html += `<p class="note">Informace jsou orientační. Závazný je územní plán vydaný obcí a vyjádření stavebního úřadu.</p>`;
    return `<section class="sec"><h3>${cov === false ? 'Kde najdete územní plán' : 'Odkud to víme'}</h3>${html}</section>`;
  }
  function renderCard() {
    const sel = S.sel; if (!sel) return;
    const strip = sel.sample ? `<div class="sample-strip"><span><b>Ukázka z Liberce.</b> Nová čtvrť, kterou územní plán teprve chystá. Klikněte kamkoli do mapy nebo najděte svou adresu.</span><button class="link-btn" data-act="intro">Jak to funguje</button></div>` : '';
    const cov = coverageOf(sel);
    const pl = plochaOf(sel);
    const regPl = cov === 'regional' && pl && pl.regional;
    const lead = (cov === false || cov === 'error') ? sourceSec(sel) : (cov === 'regional' && !regPl ? regionalSec(sel) + rulesSec(sel) : '');
    const mid = regPl ? rulesSec(sel) + regionalSec(sel) : '';
    const tail = (cov === false || cov === 'error') ? '' : sourceSec(sel);
    $('#card').innerHTML = strip + titleBlock(sel) + lead + meaningSec(sel) + canSec(sel) + mid + flagsSec(sel) + parcelSec(sel) + natureSec(sel) + floodSec(sel) + radonSec(sel) + tail;
  }
  $('#card').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') clearSelection();
    else if (act === 'intro') { clearSelection(); }
    else if (act === 'retry' && S.sel) { selectAt(S.sel.coord, { sample: S.sel.sample }); }
    else if (act === 'copy') {
      const url = location.href;
      const ok = () => toast('Odkaz na místo je zkopírovaný.');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, () => fallbackCopy(url, ok));
      else fallbackCopy(url, ok);
    }
  });
  function fallbackCopy(text, ok) {
    const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); ok(); } catch (_) { toast('Zkopírujte si adresu stránky z prohlížeče.'); }
    t.remove();
  }

  // ---------------------------------------------------------------------------
  // Interakce s mapou
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Mapa pokrytí: každá obec obarvená podle toho, odkud mapa zná její plán (dist/hranice.json + obce.json)
  // ---------------------------------------------------------------------------
  const COV_CAT = [
    ['n', 'Jednotný standard', [46, 125, 50]],
    ['k', 'Data kraje', [62, 115, 196]],
    ['m', 'Data města nebo ORP', [123, 92, 196]],
    ['p', 'Výkres z PDF', [204, 140, 40]],
    ['d', 'Jen v dokumentech', [176, 170, 156]],
    ['x', 'Bez územního plánu v evidenci', [200, 84, 80]]
  ];
  const covCat = c => COV_CAT.find(x => x[0] === c) || COV_CAT[4];
  const covMapSrc = new ol.source.Vector();
  const covMapStyles = {};
  const covMapLayer = new ol.layer.VectorImage({
    zIndex: 52, source: covMapSrc, visible: false, imageRatio: 1.2,
    style: f => {
      const c = f.get('cat');
      if (!covMapStyles[c + theme]) covMapStyles[c + theme] = new ol.style.Style({
        fill: new ol.style.Fill({ color: rgba(covCat(c)[2], 0.82) }),
        stroke: new ol.style.Stroke({ color: theme === 'dark' ? 'rgba(20,24,22,.6)' : 'rgba(255,255,255,.8)', width: 0.5 })
      });
      return covMapStyles[c + theme];
    }
  });
  map.addLayer(covMapLayer);
  let hraniceP = null;
  function loadHranice() {
    if (!hraniceP) hraniceP = Promise.all([fetch('hranice.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }), loadObce()]).then(([h]) => {
      const k = h.krok, feats = [];
      Object.entries(h.o).forEach(([kod, rings]) => {
        const polys = [];
        rings.forEach(r => {
          const pts = [[r[0] * k, r[1] * k]];
          for (let i = 2; i < r.length; i += 2) { const p = pts[pts.length - 1]; pts.push([p[0] + r[i] * k, p[1] + r[i + 1] * k]); }
          if (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) pts.push(pts[0].slice());
          // Esri: vnější prstenec jde po směru hodinových ručiček (záporná plocha), díry proti směru
          let a = 0; for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
          if (a < 0 || !polys.length) polys.push([pts]); else polys[polys.length - 1].push(pts);
        });
        const rec = obecRec(kod);
        feats.push(new ol.Feature({ geometry: new ol.geom.MultiPolygon(polys), kod: +kod, cat: rec ? rec[9] : 'd', name: rec ? rec[10] : '' }));
      });
      covMapSrc.addFeatures(feats);
    });
    return hraniceP;
  }
  function setCovMap(on, fit) {
    S.covMap = !!on;
    if ($('#lyCov')) $('#lyCov').checked = S.covMap;
    $('#covMapBtn') && $('#covMapBtn').setAttribute('aria-pressed', String(S.covMap));
    covLayer.setVisible(!S.covMap);
    if (S.covMap) {
      loadHranice().then(() => { covMapLayer.setVisible(S.covMap); renderLegend(); })
        .catch(() => { S.covMap = false; covLayer.setVisible(true); toast('Mapu pokrytí se nepodařilo načíst.'); renderLegend(); });
      // přehled celé republiky: oddálit i tehdy, když se mapa pokrytí zapne z detailu ulic
      if (fit || view.getZoom() > 12.5) view.animate({ center: ol.proj.fromLonLat([15.45, 49.8]), zoom: isMobile() ? 6.3 : 7.4, duration: dur(600) });
    } else covMapLayer.setVisible(false);
    renderLegend(); updateHint(); writeHash();
  }
  function covMapAt(pixel) {
    return S.covMap && covMapLayer.getVisible() ? map.forEachFeatureAtPixel(pixel, x => x, { layerFilter: l => l === covMapLayer }) : null;
  }

  map.on('singleclick', e => {
    if (Date.now() - popClosedAt < 700) return;
    if (S.covMap) {
      // klik na obec v mapě pokrytí: přiblížit na obec a otevřít kartu uprostřed její největší části
      const f = covMapAt(e.pixel);
      if (!f) return;
      const g = f.getGeometry(), part = g.getPolygons().sort((a, b) => b.getArea() - a.getArea())[0];
      const p = part.getInteriorPoint().getCoordinates().slice(0, 2);
      setCovMap(false);
      view.fit(g.getExtent(), { padding: [80, 80, 80, 80], maxZoom: 14.5, duration: dur(500) });
      setTimeout(() => selectAt(p), dur(500) + 30);
      return;
    }
    const z = view.getZoom();
    if (z < CFG.coverageMaxZoom) {
      const f = map.forEachFeatureAtPixel(e.pixel, x => x, { layerFilter: l => l === covLayer, hitTolerance: 6 });
      if (f) { fitObec(f.get('kod')); return; }
    }
    if (z < CFG.cardMinZoom) { view.animate({ center: e.coordinate, zoom: Math.min(z + 2.2, 13.2), duration: dur(450) }); return; }
    selectAt(e.coordinate);
  });
  const tip = $('#tip');
  let hoverRaf = 0;
  map.on('pointermove', e => {
    if (e.dragging || !matchMedia('(hover: hover)').matches) return;
    cancelAnimationFrame(hoverRaf);
    hoverRaf = requestAnimationFrame(() => hoverAt(e.pixel, e.coordinate));
  });
  map.getViewport().addEventListener('mouseleave', () => { tip.hidden = true; hoverSource.clear(); });
  let hovered = null;
  function hoverAt(pixel, coord) {
    const z = view.getZoom();
    const el = map.getTargetElement();
    if (S.covMap) {
      const f = covMapAt(pixel);
      el.style.cursor = f ? 'pointer' : '';
      if (f) { tip.innerHTML = `${esc(f.get('name'))} <span style="opacity:.75">${esc(covCat(f.get('cat'))[1].toLocaleLowerCase('cs'))}</span>`; placeTip(pixel); } else tip.hidden = true;
      return;
    }
    if (z < CFG.coverageMaxZoom) {
      const f = map.forEachFeatureAtPixel(pixel, x => x, { layerFilter: l => l === covLayer, hitTolerance: 6 });
      el.style.cursor = f ? 'pointer' : '';
      if (f) { tip.innerHTML = `${esc(f.get('name'))} <span style="opacity:.7">má jednotný ÚP</span>`; placeTip(pixel); } else tip.hidden = true;
      return;
    }
    if (z < CFG.vectorMinZoom || !S.layers.up) { tip.hidden = true; el.style.cursor = ''; if (hovered) { hoverSource.clear(); hovered = null; } return; }
    const f = pickNewest(upSource.getFeaturesAtCoordinate(coord).filter(x => !SUP_ALL.has(x.get('id_metadata'))));
    el.style.cursor = f ? 'pointer' : '';
    if (f !== hovered) {
      hovered = f; hoverSource.clear();
      if (f) hoverSource.addFeature(new ol.Feature(f.getGeometry()));
    }
    if (f) {
      const t = f.get('typ');
      tip.innerHTML = `<b>${esc(t)}</b>${esc(PLAIN[t] ? PLAIN[t].t : (TYPE[t] || {}).n || '')}${f.get('cash') === 2 ? ', návrh' : ''}`;
      placeTip(pixel);
    } else tip.hidden = true;
  }
  function placeTip(pixel) {
    const r = map.getTargetElement().getBoundingClientRect();
    tip.style.left = (r.left + pixel[0]) + 'px'; tip.style.top = (r.top + pixel[1]) + 'px'; tip.hidden = false;
  }
  map.on('movestart', () => { tip.hidden = true; if (isMobile() && $('#sheet').dataset.state === 'full') setSheet('peek'); });
  map.on('moveend', () => {
    // mapa pokrytí je přehled krajů a obcí, při přiblížení na ulice se vypne a ukáže plán
    if (S.covMap && view.getZoom() > 12.5) setCovMap(false);
    updateRatio(); updateHint(); scheduleLegend(); writeHash(); updateRaster(); updateAttrib(); schedulePerObec();
  });

  $('#zoomIn').addEventListener('click', () => view.animate({ zoom: view.getZoom() + 1, duration: dur(250) }));
  $('#zoomOut').addEventListener('click', () => view.animate({ zoom: view.getZoom() - 1, duration: dur(250) }));
  $('#locateBtn').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('Tento prohlížeč polohu neumí. Vyhledejte místo podle adresy.'); return; }
    navigator.geolocation.getCurrentPosition(p => {
      const c = ol.proj.fromLonLat([p.coords.longitude, p.coords.latitude]);
      centerOn(c, 17); selectAt(c);
    }, () => toast('Polohu se nepodařilo zjistit. Povolte ji v prohlížeči nebo místo vyhledejte.'), { enableHighAccuracy: true, timeout: 10000 });
  });

  // vrstvy
  const pop = $('#layersPop');
  $('#layersBtn').addEventListener('click', e => { e.stopPropagation(); pop.hidden = !pop.hidden; $('#layersBtn').setAttribute('aria-expanded', String(!pop.hidden)); });
  let popClosedAt = 0;
  document.addEventListener('pointerdown', e => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('#layersBtn')) {
      pop.hidden = true; popClosedAt = Date.now(); $('#layersBtn').setAttribute('aria-expanded', 'false');
    }
  });
  pop.addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'base') { S.base = t.value; applyBase(); writeHash(); }
    if (t.id === 'lyUp') { S.layers.up = t.checked; upLayer.setVisible(t.checked); upRaster.setVisible(t.checked); updateHint(); }
    if (t.id === 'lyRegional') { S.layers.regional = t.checked; regionalLayers.forEach(l => l.setVisible(t.checked)); updateHint(); scheduleLegend(); }
    if (t.id === 'lyParcels') { S.layers.parcels = t.checked; parcelLayer.setVisible(t.checked); }
    if (t.id === 'lyRadon') { S.layers.radon = t.checked; radonLayer.setVisible(t.checked); }
    if (t.id === 'lyNature') { S.layers.nature = t.checked; natureLayer.setVisible(t.checked); }
    if (t.id === 'lyFlood') { S.layers.flood = t.checked; floodLayer.setVisible(t.checked); }
  });
  $('#upOpacity').addEventListener('input', e => {
    const v = +e.target.value / 100; upLayer.setOpacity(v); upRaster.setOpacity(v); regionalLayers.forEach(l => l.setOpacity(v));
    $('#upOpacityVal').textContent = Math.round(v * 100) + ' %';
  });

  // ---------------------------------------------------------------------------
  // Vyhledávání (RÚIAN)
  // ---------------------------------------------------------------------------
  const qEl = $('#q'), resEl = $('#results');
  let qSeq = 0, qItems = [], qActive = -1;
  // okres -> kraj (kód VÚSC), kvůli štítku u obcí ve výsledcích hledání
  const OKRES_KRAJ = {};
  [[19, 'Hlavní město Praha,Praha'], [27, 'Benešov,Beroun,Kladno,Kolín,Kutná Hora,Mělník,Mladá Boleslav,Nymburk,Praha-východ,Praha-západ,Příbram,Rakovník'],
   [35, 'České Budějovice,Český Krumlov,Jindřichův Hradec,Písek,Prachatice,Strakonice,Tábor'], [43, 'Domažlice,Klatovy,Plzeň-město,Plzeň-jih,Plzeň-sever,Rokycany,Tachov'],
   [51, 'Cheb,Karlovy Vary,Sokolov'], [60, 'Děčín,Chomutov,Litoměřice,Louny,Most,Teplice,Ústí nad Labem'], [78, 'Česká Lípa,Jablonec nad Nisou,Liberec,Semily'],
   [86, 'Hradec Králové,Jičín,Náchod,Rychnov nad Kněžnou,Trutnov'], [94, 'Chrudim,Pardubice,Svitavy,Ústí nad Orlicí'], [108, 'Havlíčkův Brod,Jihlava,Pelhřimov,Třebíč,Žďár nad Sázavou'],
   [116, 'Blansko,Brno-město,Brno-venkov,Břeclav,Hodonín,Vyškov,Znojmo'], [124, 'Jeseník,Olomouc,Prostějov,Přerov,Šumperk'], [141, 'Kroměříž,Uherské Hradiště,Vsetín,Zlín'],
   [132, 'Bruntál,Frýdek-Místek,Karviná,Nový Jičín,Opava,Ostrava-město']].forEach(([k, list]) => list.split(',').forEach(n => { OKRES_KRAJ[n] = k; }));
  const COV_BY_NAME = new Map();
  COV.forEach(o => { const okr = OKR[o[2]]; COV_BY_NAME.set(o[1] + '|' + (okr ? okr[0] : ''), o); });
  function closeResults() { resEl.hidden = true; qEl.setAttribute('aria-expanded', 'false'); qActive = -1; }
  async function runSuggest() {
    const q = qEl.value.trim();
    $('#qClear').hidden = !q;
    if (q.length < 2) { closeResults(); return; }
    const seq = ++qSeq;
    const digits = /\d/.test(q);
    const tables = digits
      ? [[1, 'Adresy', 5], [0, 'Parcely', 5], [12, 'Obce', 3], [4, 'Ulice', 3]]
      : [[12, 'Obce', 5], [11, 'Části obcí', 3], [7, 'Katastrální území', 3], [4, 'Ulice', 4], [1, 'Adresy', 3]];
    const groups = await Promise.all(tables.map(([t, label, n]) =>
      fetchJSON(`${CFG.geocode}tables/${t}/suggest?f=json&maxSuggestions=${n}&text=${encodeURIComponent(q)}`, 9000)
        .then(d => ({ t, label, items: d.suggestions || [] }), () => ({ t, label, items: [] }))));
    if (seq !== qSeq) return;
    qItems = []; let html = '';
    groups.forEach(g => {
      if (!g.items.length) return;
      html += `<div class="grp">${esc(g.label)}</div>`;
      g.items.forEach(s => {
        const i = qItems.length; qItems.push({ t: g.t, text: s.text, magicKey: s.magicKey });
        let badge = '';
        if (g.t === 12) {
          const m = /^(.*) \((.*)\)$/.exec(s.text);
          const covered = m && COV_BY_NAME.has(m[1] + '|' + m[2]);
          const city = REGIONAL.find(c => c.searchText && c.searchText === s.text.trim());
          const reg = city || (m ? regionalCfgFor(OKRES_KRAJ[m[2]]) : (s.text.trim() === 'Praha' ? regionalCfgFor(19) : null));
          badge = covered ? '<span class="r-badge has">jednotný ÚP</span>' : reg ? '<span class="r-badge reg">plán z dat kraje</span>' : '<span class="r-badge">ÚP jako PDF</span>';
        }
        html += `<button role="option" id="r${i}" data-i="${i}" aria-selected="false"><span class="r-main">${esc(s.text)}</span>${badge}</button>`;
      });
    });
    resEl.innerHTML = html || `<div class="empty">Nic jsme nenašli. Zkuste obec, ulici s číslem nebo parcelu ve tvaru „Liberec 1234/9“.</div>`;
    resEl.hidden = false; qEl.setAttribute('aria-expanded', 'true'); qActive = -1;
  }
  qEl.addEventListener('input', debounce(runSuggest, 220));
  qEl.addEventListener('focus', () => { if (qEl.value.trim().length >= 2 && resEl.innerHTML) { resEl.hidden = false; } });
  qEl.addEventListener('keydown', e => {
    const btns = [...resEl.querySelectorAll('button[data-i]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (resEl.hidden || !btns.length) return; e.preventDefault();
      qActive = (qActive + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
      btns.forEach((b, k) => b.setAttribute('aria-selected', String(k === qActive)));
      btns[qActive].scrollIntoView({ block: 'nearest' }); qEl.setAttribute('aria-activedescendant', btns[qActive].id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const i = qActive >= 0 ? qActive : 0;
      if (btns[i]) chooseResult(qItems[+btns[i].dataset.i]);
    } else if (e.key === 'Escape') closeResults();
  });
  resEl.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) chooseResult(qItems[+b.dataset.i]); });
  $('#qClear').addEventListener('click', () => { qEl.value = ''; $('#qClear').hidden = true; closeResults(); qEl.focus(); });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) closeResults(); });
  async function chooseResult(item) {
    if (!item) return;
    closeResults(); qEl.value = item.text; qEl.blur();
    try {
      const d = await track(fetchJSON(`${CFG.geocode}tables/${item.t}/findAddressCandidates?f=json&SingleLine=${encodeURIComponent(item.text)}&magicKey=${encodeURIComponent(item.magicKey)}&outSR=${encodeURIComponent('{"wkid":3857}')}`, 10000));
      const c = d.candidates && d.candidates[0];
      if (!c) throw new Error('nic');
      const coord = [c.location.x, c.location.y];
      if (item.t === 12) {
        const m = /^(.*) \((.*)\)$/.exec(item.text);
        const o = m && COV_BY_NAME.get(m[1] + '|' + m[2]);
        if (o) { fitObec(o[0]); return; }
        centerOn(coord, 13.6); return;
      }
      const z = { 11: 15.2, 7: 14.6, 4: 16.8, 1: 18, 0: 18 }[item.t] || 16;
      centerOn(coord, z);
      if (item.t === 1 || item.t === 0) selectAt(coord);
    } catch (_) {
      toast('Místo se nepodařilo najít. Zkuste adresu napsat jinak.');
    }
  }
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== qEl && !e.target.closest('input, textarea')) { e.preventDefault(); qEl.focus(); }
    if (e.key === 'Escape' && S.sel && document.activeElement !== qEl && !document.querySelector('dialog[open]')) clearSelection();
  });

  // ---------------------------------------------------------------------------
  // Úvod, seznam obcí, dialogy
  // ---------------------------------------------------------------------------
  // Příklady na kliknutí: to nejlepší, co mapa umí (stejná místa používá i prohlídka)
  const P0 = [15.090024, 50.749004], P1 = [15.0905, 50.7505];
  function resetModes() { setSwipe(false); setCovMap(false); if (S.intent !== null) setIntent(null); if (S.plan) setPlan(false); }
  function setPlan(v) { S.plan = !!v; if (S.plan) S.intent = null; syncModeUI(); restyle(); renderLegend(); writeHash(); updateHint(); }
  const EXAMPLES = [
    { t: 'Co se smí na pozemku', s: 'Liberec: nová čtvrť a rozluštěný kód plánu', go: () => { centerOn(ol.proj.fromLonLat(P0), 16.3); selectAt(ol.proj.fromLonLat(P0)); } },
    { t: 'Kde postavit rodinný dům', s: 'Mapa přebarvená podle záměru', go: () => { clearSelection(); view.animate({ center: ol.proj.fromLonLat(P1), zoom: 14.6, duration: dur(600) }); setIntent(0); } },
    { t: 'Co obec chystá', s: 'Plochy, které zatím stojí jen v plánu', go: () => { clearSelection(); view.animate({ center: ol.proj.fromLonLat(P1), zoom: 14.6, duration: dur(600) }); setPlan(true); } },
    { t: 'Dnes a podle plánu', s: 'Letecký snímek proti plánu', go: () => { clearSelection(); view.animate({ center: ol.proj.fromLonLat(P1), zoom: 16.2, duration: dur(600) }); setSwipe(true); } },
    { t: 'Nový plán Hradce Králové', s: 'Hlavní výkres platný od 2026', go: () => { const c = ol.proj.fromLonLat([15.83272, 50.20918]); centerOn(c, 16.2); selectAt(c); } },
    { t: 'Metropolitní plán Prahy', s: 'Hlavní výkres IPR Praha', go: () => { const c = ol.proj.fromLonLat([14.4205, 50.0875]); centerOn(c, 15); selectAt(c); } },
    { t: 'Kde mapa plán zná', s: 'Obce podle zdroje dat', go: () => setCovMap(true, true) },
    { t: 'Prohlídka pro prezentaci', s: 'Sedm kroků, ovládání šipkami', tour: true, go: () => tourGo(0) }
  ];
  EXAMPLES.forEach(ex => {
    const b = document.createElement('button');
    b.className = 'example'; b.innerHTML = `<b>${esc(ex.t)}</b><small>${esc(ex.s)}</small>`;
    b.addEventListener('click', () => { if (!ex.tour) resetModes(); ex.go(); });
    $('#examples').appendChild(b);
  });
  let obceTotal = 0, covLive = false, covPlochy = SNAP.plochy;
  function renderCoverageNumbers(total) {
    if (total) obceTotal = total;
    if (OBCE) {
      // úplný přehled z obce.json: kolik obcí má plán přímo v mapě a kolik lidí v nich žije
      const n = {}, pop = {}; let all = 0, allPop = 0;
      Object.values(OBCE.o).forEach(r => { n[r[9]] = (n[r[9]] || 0) + 1; pop[r[9]] = (pop[r[9]] || 0) + (+r[11] || 0); all++; allPop += +r[11] || 0; });
      const inMap = ['n', 'k', 'm', 'p'].reduce((s, k) => s + (n[k] || 0), 0), inPop = ['n', 'k', 'm', 'p'].reduce((s, k) => s + (pop[k] || 0), 0);
      $('#covN').textContent = fmtInt(inMap);
      $('#covOf').innerHTML = `obcí z <span class="num">${fmtInt(all)}</span> má územní plán přímo v mapě, žije v nich ${Math.round(100 * inPop / allPop)} % obyvatel`;
      $('#covBarBox').innerHTML = COV_CAT.map(([k, label, rgb]) => `<span title="${esc(label)}" style="width:${(100 * (n[k] || 0) / all).toFixed(2)}%;background:${rgba(rgb, 0.92)}"></span>`).join('');
      $('#covRest').textContent = `V jednotném standardu s plným výkladem je ${fmtInt(n.n || 0)} obcí, ostatní ukazujeme z dat krajů, měst a ORP. U dalších ${fmtInt((n.d || 0) + (n.x || 0))} obcí karta řekne, jestli obec platný plán má, a pošle vás na dokumenty.`;
    } else {
      $('#covN').textContent = fmtInt(COV.length);
      if (obceTotal) $('#covTotal').textContent = fmtInt(obceTotal);
      const t = obceTotal || 6258;
      $('#covBar').style.width = Math.max(1, (COV.length / t) * 100).toFixed(1) + '%';
    }
    $('#aboutStamp').textContent = covLive
      ? `Přehled obcí s daty se právě načetl z Národního geoportálu: ${fmtInt(COV.length)} obcí, ${fmtInt(covPlochy)} ploch v aktuálních verzích.`
      : `Přehled obcí s daty: stav k ${SNAP.date}, ${fmtInt(COV.length)} obcí, ${fmtInt(covPlochy)} ploch v aktuálních verzích. Mapa samotná načítá data živě.`;
  }

  // Živá aktualizace přehledu obcí a verzí (když NGÚP přibudou nové obce nebo změny)
  async function refreshCoverage() {
    const B = CFG.ngup + 'DUP_HLV/MapServer/';
    const pk = [];
    for (let off = 0, g = 0; g < 20; g++) {
      const d = await jsonp(`${B}13/query?f=json&where=1%3D1&outFields=obec_kod,id_metadata&returnGeometry=false&orderByFields=objectid&resultOffset=${off}&resultRecordCount=1000`, 20000);
      const rows = (d.features || []).map(f => [+f.attributes.obec_kod, +f.attributes.id_metadata]);
      pk.push(...rows);
      if (!d.exceededTransferLimit || !rows.length) break;
      off += rows.length;
    }
    const stats = encodeURIComponent(JSON.stringify([{ statisticType: 'count', onStatisticField: 'objectid', outStatisticFieldName: 'n' }]));
    const st = await jsonp(`${B}12/query?f=json&where=1%3D1&groupByFieldsForStatistics=id_metadata&outStatistics=${stats}`, 25000);
    const cnt = {};
    (st.features || []).forEach(f => { cnt[+f.attributes.id_metadata] = +f.attributes.n; });
    if (!pk.length || !Object.keys(cnt).length) return;
    const byObec = new Map();
    pk.forEach(([o, m]) => { if (!byObec.has(o)) byObec.set(o, new Set()); byObec.get(o).add(m); });
    const newSup = {}, counts = {};
    let plochy = 0;
    byObec.forEach((set, o) => {
      const withP = [...set].filter(i => cnt[i] > 0).sort((a, b) => a - b);
      if (!withP.length) return;
      const maxN = Math.max(...withP.map(i => cnt[i]));
      const full = Math.max(...withP.filter(i => cnt[i] >= 0.6 * maxN));
      const older = withP.filter(i => i < full);
      if (older.length) newSup[o] = older;
      counts[o] = cnt[full];
      plochy += cnt[full] + withP.filter(i => i > full).reduce((a, i) => a + cnt[i], 0);
    });
    // nové obce: název, okres a rozsah z RÚIAN
    const missing = Object.keys(counts).map(Number).filter(k => !COVMAP.has(k));
    for (let i = 0; i < missing.length; i += 60) {
      const chunk = missing.slice(i, i + 60);
      const d = await fetchJSON(`${CFG.ruian}12/query?where=${encodeURIComponent('kod IN (' + chunk.join(',') + ')')}&outFields=kod,nazev,okres&returnGeometry=true&maxAllowableOffset=0.01&outSR=4326&geometryPrecision=4&f=json`, 20000);
      (d.features || []).forEach(f => {
        let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
        (f.geometry.rings || []).forEach(r => r.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
        const o = [+f.attributes.kod, f.attributes.nazev, +f.attributes.okres, +((x0 + x1) / 2).toFixed(4), +((y0 + y1) / 2).toFixed(4), +(x1 - x0).toFixed(3), +(y1 - y0).toFixed(3), 0];
        COV.push(o); COVMAP.set(o[0], o); addCoverageFeatures([o]);
      });
    }
    // přepočet počtů a starších verzí
    COV.forEach(o => { if (counts[o[0]]) o[7] = counts[o[0]]; });
    for (let i = COV.length - 1; i >= 0; i--) if (!counts[COV[i][0]]) { COVMAP.delete(COV[i][0]); const f = covSource.getFeatureById('o' + COV[i][0]); if (f) covSource.removeFeature(f); COV.splice(i, 1); }
    const before = JSON.stringify(SUP);
    Object.keys(SUP).forEach(k => delete SUP[k]);
    Object.assign(SUP, newSup);
    Object.values(SUP).forEach(a => a.forEach(id => SUP_ALL.add(id)));
    covLive = true; covPlochy = plochy;
    COV_BY_NAME.clear();
    COV.forEach(o => { const okr = OKR[o[2]]; COV_BY_NAME.set(o[1] + '|' + (okr ? okr[0] : ''), o); });
    renderCoverageNumbers();
    covLayer.changed();
    if (JSON.stringify(SUP) !== before) { rasterKey = ''; updateRaster(); upSource.refresh(); }
    // díry v krajských mozaikách pro obce, které mezitím přibyly do jednotných dat
    if (missing.length) REGIONAL.filter(c => shapeOf(c)).forEach(c => updateHoles(c).then(() => c.layers.forEach(L => L.layer && L.layer.changed())).catch(() => {}));
  }
  renderCoverageNumbers();
  function renderCovList(filter) {
    const f = (filter || '').trim().toLocaleLowerCase('cs');
    const list = [...COV].sort((a, b) => a[1].localeCompare(b[1], 'cs'))
      .filter(o => !f || o[1].toLocaleLowerCase('cs').includes(f) || ((OKR[o[2]] || [''])[0]).toLocaleLowerCase('cs').includes(f));
    $('#covList').innerHTML = list.map(o => `<li><button data-kod="${o[0]}"><span>${esc(o[1])}</span><small>okres ${esc((OKR[o[2]] || ['?'])[0])}</small></button></li>`).join('') || '<li class="muted">Nic neodpovídá filtru.</li>';
  }
  $('#covBtn').addEventListener('click', () => { renderCovList(''); $('#covFilter').value = ''; $('#covDlg').showModal(); $('#covFilter').focus(); });
  $('#covMapBtn').addEventListener('click', () => setCovMap(!S.covMap, true));
  $('#lyCov').addEventListener('change', e => setCovMap(e.target.checked, e.target.checked));

  // ---------------------------------------------------------------------------
  // Na mobil: QR kód s adresou výřezu, karty a režimu (publikum si na přednášce otevře totéž v telefonu)
  // ---------------------------------------------------------------------------
  let qrLib = null;
  const loadQrLib = () => (qrLib = qrLib || new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
    s.onload = () => (window.qrcode ? res(window.qrcode) : rej(new Error('qr')));
    s.onerror = () => { qrLib = null; rej(new Error('qr')); };
    document.head.appendChild(s);
  }));
  function shareUrl() {
    writeHash();
    // lokální soubor, localhost nebo náhled: kód musí vést na veřejný web
    return location.protocol === 'https:' && location.hostname === CFG.publicHost ? location.href : CFG.publicUrl + location.hash;
  }
  async function showQr() {
    const url = shareUrl();
    $('#qrUrl').textContent = url.replace(/^https:\/\//, '');
    $('#qrBox').innerHTML = '<span class="skel w60"></span>';
    if (!$('#qrDlg').open) $('#qrDlg').showModal();
    try {
      const qrcode = await loadQrLib();
      const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
      $('#qrBox').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    } catch (_) { $('#qrBox').textContent = 'Kód se nepodařilo vytvořit. Adresu najdete pod ním.'; }
  }
  $('#qrBtn').addEventListener('click', showQr);

  // ---------------------------------------------------------------------------
  // Dnes a podle plánu: vlevo letecký snímek, vpravo plán, předělem jde táhnout
  // ---------------------------------------------------------------------------
  let swipeX = 0.5, swipePrevBase = null;
  function setBase(b) {
    S.base = b;
    const r = document.querySelector(`input[name="base"][value="${b}"]`); if (r) r.checked = true;
    applyBase();
  }
  function placeSwipe() {
    const w = map.getTargetElement().clientWidth;
    $('#map').style.setProperty('--swipe-x', Math.round(swipeX * w) + 'px');
    $('#swipe').style.setProperty('--swipe-x', (swipeX * 100).toFixed(2) + '%');
  }
  function setSwipe(on) {
    if (!!on === !!S.swipe) return;
    S.swipe = !!on;
    $('#swipeBtn').setAttribute('aria-pressed', String(S.swipe));
    $('#swipe').hidden = !S.swipe;
    $('#app').classList.toggle('swipe-on', S.swipe);
    if (S.swipe) {
      swipePrevBase = S.base; if (S.base !== 'orto') setBase('orto');
      placeSwipe();
      if (view.getZoom() < CFG.rasterMinZoom) toast('Přibližte si obec a posouvejte předěl: vlevo je dnešní letecký snímek, vpravo územní plán.');
    } else if (swipePrevBase && swipePrevBase !== S.base) setBase(swipePrevBase);
  }
  $('#swipeBtn').addEventListener('click', () => setSwipe(!S.swipe));
  (() => {
    const knob = $('#swipeKnob');
    const move = e => { const r = map.getTargetElement().getBoundingClientRect(); swipeX = Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width)); placeSwipe(); };
    knob.addEventListener('pointerdown', e => { knob.setPointerCapture(e.pointerId); knob.addEventListener('pointermove', move); });
    knob.addEventListener('pointerup', e => { knob.releasePointerCapture(e.pointerId); knob.removeEventListener('pointermove', move); });
    knob.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { swipeX = Math.min(0.98, Math.max(0.02, swipeX + (e.key === 'ArrowLeft' ? -0.05 : 0.05))); placeSwipe(); e.preventDefault(); } });
    window.addEventListener('resize', debounce(() => { if (S.swipe) placeSwipe(); }, 100));
  })();

  // ---------------------------------------------------------------------------
  // Prohlídka mapou krok za krokem (pro přednášku: šipky, PageUp/PageDown z klikru, Esc)
  // ---------------------------------------------------------------------------
  const lonlat = (lon, lat) => ol.proj.fromLonLat([lon, lat]);
  const TOUR = [
    { t: 'Územní plány celé země v jedné mapě', x: () => `Každá obec má vlastní územní plán. Stát ho sbírá v jednotné podobě, kraje a města ve vlastních mapách. Tady jsou pohromadě: barva ukazuje, odkud mapa zná plán které obce.`,
      go: () => { setSwipe(false); setIntent(null); clearSelection(); setCovMap(true, true); } },
    { t: 'Klik na pozemek řekne, co se tu smí', x: () => 'Karta převede plochu z územního plánu do lidské řeči: k čemu slouží, co se tu typicky smí postavit a na co si dát pozor.',
      go: () => { setCovMap(false); setSwipe(false); setIntent(null); centerOn(lonlat(15.090024, 50.749004), 16.3); selectAt(lonlat(15.090024, 50.749004)); } },
    { t: 'Chci postavit rodinný dům', x: () => 'Režim přebarví mapu podle záměru: zeleně tam, kde rodinný dům typicky jde, šrafou tam, kde záleží na podmínkách.',
      go: () => { setCovMap(false); setSwipe(false); clearSelection(); view.animate({ center: lonlat(15.0905, 50.7505), zoom: 14.6, duration: dur(700) }); setIntent(0); } },
    { t: 'Dnes a podle plánu', x: () => 'Vlevo letecký snímek, vpravo plán. Na dnešních polích plán počítá s novými domy. Předěl jde táhnout.',
      go: () => { setCovMap(false); setIntent(null); clearSelection(); view.animate({ center: lonlat(15.0905, 50.7505), zoom: 16.2, duration: dur(700) }); setSwipe(true); } },
    { t: 'Nový plán Hradce Králové', x: () => 'Hradec Králové platí od 13. 3. 2026 nový územní plán. Mapa ukazuje jeho hlavní výkres přímo ze serveru města.',
      go: () => { setSwipe(false); setCovMap(false); setIntent(null); centerOn(lonlat(15.83272, 50.20918), 16.2); selectAt(lonlat(15.83272, 50.20918)); } },
    { t: 'Kde plán v mapě zatím není', x: () => 'U zbylých obcí karta řekne, jestli obec platný plán má, a pošle vás rovnou na jeho dokumenty.',
      go: () => { setSwipe(false); setIntent(null); clearSelection(); setCovMap(true, true); } },
    { t: 'Vyzkoušejte si to v telefonu', x: () => 'Naskenujte kód a najděte svůj pozemek.',
      go: () => { setSwipe(false); setCovMap(false); clearSelection(); view.animate({ center: lonlat(15.45, 49.8), zoom: isMobile() ? 6.3 : 7.4, duration: dur(600) }); setTimeout(showQr, dur(650)); } }
  ];
  let tourI = -1;
  function tourGo(i) {
    tourI = Math.max(0, Math.min(TOUR.length - 1, i));
    const s = TOUR[tourI];
    $('#tour').hidden = false; $('#app').classList.add('tour-on');
    $('#tourN').textContent = `${tourI + 1} / ${TOUR.length}`;
    $('#tourTitle').textContent = s.t; $('#tourText').textContent = s.x();
    $('#tourPrev').disabled = tourI === 0;
    $('#tourNext').textContent = tourI === TOUR.length - 1 ? 'Konec' : 'Další';
    if ($('#qrDlg').open) $('#qrDlg').close();
    s.go();
  }
  function tourEnd() { tourI = -1; $('#tour').hidden = true; $('#app').classList.remove('tour-on'); if ($('#qrDlg').open) $('#qrDlg').close(); }
  $('#tourBtn').addEventListener('click', () => tourGo(0));
  $('#tourNext').addEventListener('click', () => (tourI >= TOUR.length - 1 ? tourEnd() : tourGo(tourI + 1)));
  $('#tourPrev').addEventListener('click', () => tourGo(tourI - 1));
  $('#tourClose').addEventListener('click', tourEnd);
  document.addEventListener('keydown', e => {
    if (tourI < 0 || e.target.closest('input, textarea')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); tourI >= TOUR.length - 1 ? tourEnd() : tourGo(tourI + 1); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); tourGo(tourI - 1); }
    else if (e.key === 'Escape') tourEnd();
  });
  $('#covFilter').addEventListener('input', e => renderCovList(e.target.value));
  $('#covList').addEventListener('click', e => { const b = e.target.closest('[data-kod]'); if (!b) return; $('#covDlg').close(); fitObec(+b.dataset.kod); });
  $('#aboutBtn').addEventListener('click', () => $('#aboutDlg').showModal());
  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  });

  // mobilní spodní karta
  function setSheet(state) {
    const sh = $('#sheet'); sh.dataset.state = state;
    const panelBottom = $('#panel').getBoundingClientRect().bottom;
    const full = Math.max(220, Math.round(window.innerHeight - panelBottom - 10));
    const h = state === 'full' ? full + 'px' : state === 'min' ? '34px' : Math.min(212, full) + 'px';
    $('#app').style.setProperty('--sheet-h', h);
  }
  window.addEventListener('resize', debounce(() => { if (isMobile()) setSheet($('#sheet').dataset.state || 'peek'); }, 150));
  $('#sheetHandle').addEventListener('click', () => setSheet($('#sheet').dataset.state === 'full' ? 'peek' : 'full'));
  $('#sheet').addEventListener('click', e => { if (isMobile() && $('#sheet').dataset.state === 'peek' && e.target.closest('.tb-head, .intro h2')) setSheet('full'); });
  const ro = new ResizeObserver(() => { $('#app').style.setProperty('--top-h', ($('#panel').offsetHeight + 8) + 'px'); });
  ro.observe($('#panel'));
  setSheet('peek');
  if (isMobile()) { $('#legend').dataset.open = 'false'; $('#legendToggle').setAttribute('aria-expanded', 'false'); }

  // ---------------------------------------------------------------------------
  // Odkaz v adrese (sdílení)
  // ---------------------------------------------------------------------------
  let hashLock = false;
  function writeHash() {
    if (hashLock) return;
    const c = ol.proj.toLonLat(view.getCenter());
    const p = new URLSearchParams();
    p.set('mapa', `${view.getZoom().toFixed(2)}/${c[1].toFixed(5)}/${c[0].toFixed(5)}`);
    if (S.sel) p.set('bod', `${S.sel.ll[1].toFixed(6)},${S.sel.ll[0].toFixed(6)}`);
    if (S.intent !== null) p.set('chci', INTENTS[S.intent].key);
    if (S.plan) p.set('rezim', 'zmeny');
    if (S.covMap) p.set('pokryti', '1');
    try { history.replaceState(null, '', '#' + p.toString().replace(/%2F/g, '/').replace(/%2C/g, ',')); } catch (_) { /* sandbox */ }
  }
  function readHash() {
    const h = location.hash.replace(/^#/, '');
    if (!h) return null;
    const p = new URLSearchParams(h);
    const out = {};
    const m = (p.get('mapa') || '').split('/').map(Number);
    if (m.length === 3 && m.every(isFinite)) out.view = { z: m[0], lat: m[1], lon: m[2] };
    const b = (p.get('bod') || '').split(',').map(Number);
    if (b.length === 2 && b.every(isFinite)) out.bod = { lat: b[0], lon: b[1] };
    const ch = INTENTS.findIndex(i => i.key === p.get('chci'));
    if (ch >= 0) out.intent = ch;
    if (p.get('rezim') === 'zmeny') out.plan = true;
    if (p.get('pokryti') === '1') out.pokryti = true;
    return (out.view || out.bod || out.pokryti) ? out : null;
  }

  // odkaz vložený do adresy v už otevřené záložce (nebo zpět/vpřed v historii)
  window.addEventListener('hashchange', () => {
    const h = readHash(); if (!h) return;
    hashLock = true;
    S.intent = h.intent !== undefined ? h.intent : null; S.plan = !!h.plan && S.intent === null;
    syncModeUI(); restyle(); renderLegend();
    if (h.view) { view.setCenter(ol.proj.fromLonLat([h.view.lon, h.view.lat])); view.setZoom(h.view.z); }
    else if (h.bod) centerOn(ol.proj.fromLonLat([h.bod.lon, h.bod.lat]), 17, false);
    hashLock = false;
    if (h.bod) selectAt(ol.proj.fromLonLat([h.bod.lon, h.bod.lat])); else if (S.sel) clearSelection();
    if (!!h.pokryti !== !!S.covMap) setCovMap(!!h.pokryti, !h.view);
    updateHint();
  });

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  function start() {
    loadObce();
    const h = readHash();
    hashLock = true;
    if (h) {
      if (h.intent !== undefined) S.intent = h.intent;
      if (h.plan) S.plan = true;
      syncModeUI();
      if (h.view) { view.setCenter(ol.proj.fromLonLat([h.view.lon, h.view.lat])); view.setZoom(h.view.z); }
      else if (h.bod) centerOn(ol.proj.fromLonLat([h.bod.lon, h.bod.lat]), 17, false);
      hashLock = false;
      if (h.bod) selectAt(ol.proj.fromLonLat([h.bod.lon, h.bod.lat]));
      if (h.pokryti) setCovMap(true, !h.view);
    } else {
      // první návštěva: barevný plán Liberce a úvod s příklady (kartu otevře klik nebo příklad)
      const c = ol.proj.fromLonLat([CFG.showcase.lon, CFG.showcase.lat]);
      requestAnimationFrame(() => {
        centerOn(c, 15.2, false);
        hashLock = false;
      });
    }
    hashLock = false;
    updateRatio(); updateHint(); renderLegend();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => covLayer.changed());
    // živé ověření: celkový počet obcí v ČR a aktuální přehled obcí s jednotnými daty
    setTimeout(() => {
      fetchJSON(CFG.ruian + '12/query?where=1%3D1&returnCountOnly=true&f=json', 12000).then(d => { if (d && d.count > 6000) renderCoverageNumbers(d.count); }).catch(() => {});
      refreshCoverage().catch(() => { /* zůstává přehled ze snímku */ });
    }, 2500);
  }
  // Dlaždice a skripty JSONP spuštěné před událostí load by ji držely, dokud neodpoví
  // nejpomalejší server (stránka by se pořád načítala). Mapa proto startuje až po load.
  function boot() { map.setTarget('map'); start(); }
  if (document.readyState === 'complete') boot(); else window.addEventListener('load', boot, { once: true });
})();
