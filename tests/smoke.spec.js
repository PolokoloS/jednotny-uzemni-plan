// Kontrola, že se aplikace načte bez chyb a karta místa funguje u každého typu zdroje.
// Hodnoty jsou z živých dat. Když se plán obce změní, upravte očekávaný text.
const { test, expect } = require('@playwright/test');

const PLACES = [
  { name: 'Liberec, jednotná data NGÚP', hash: 'mapa=16.30/50.74900/15.08640&bod=50.749004,15.090024', title: /Bydlení/ },
  { name: 'Jihlava, data Kraje Vysočina', hash: 'mapa=15.40/49.39610/15.59110&bod=49.396100,15.591100', title: /Centrum města/ },
  { name: 'Okříšky, krajský jednotný standard', hash: 'mapa=15.30/49.24530/15.76970&bod=49.245300,15.769700', title: /Venkovské bydlení/ },
  { name: 'Písek, ÚAP Jihočeského kraje', hash: 'mapa=15.40/49.30900/14.14700&bod=49.309000,14.147000', title: /Veřejné prostranství/ },
  { name: 'Plzeň, data města', hash: 'mapa=15.20/49.74750/13.37760&bod=49.747500,13.377600', title: /Městská obytná/ },
  { name: 'Olomouc, data města', hash: 'mapa=15.20/49.59380/17.25090&bod=49.593800,17.250900', title: /Veřejné prostranství/ },
  { name: 'Zlín, vektory města', hash: 'mapa=15.20/49.22650/17.66670&bod=49.226500,17.666700', title: /Veřejné prostranství/ },
  { name: 'Brno, výkres města', hash: 'mapa=15.00/49.19510/16.60800&bod=49.195100,16.608000', title: /Výkres územního plánu/ },
  { name: 'Praha, Metropolitní plán', hash: 'mapa=15.00/50.08750/14.42050&bod=50.087500,14.420500', title: /Výkres územního plánu/ },
  { name: 'Hradec Králové, nový plán města', hash: 'mapa=16.20/50.20918/15.83272&bod=50.209180,15.832720', title: /Výkres územního plánu/ },
  { name: 'Slatiňany, plochy ORP Chrudim', hash: 'mapa=17.00/49.92130/15.81370&bod=49.921300,15.813700', title: /Městská zástavba/ },
  { name: 'Ústí nad Orlicí, výkres z PDF', hash: 'mapa=17.00/49.97390/16.39360&bod=49.973900,16.393600', title: /Výkres územního plánu z PDF/ },
  { name: 'Blatec, obec bez plánu v mapě', hash: 'mapa=16.00/49.52834/17.23857&bod=49.528340,17.238570', title: /jen v dokumentech/ }
];

for (const p of PLACES) {
  test(p.name, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/#' + p.hash);
    await expect(page.locator('#card .tb-title')).toHaveText(p.title, { timeout: 90000 });
    expect(errors, 'chyby v konzoli').toEqual([]);
  });
}

test('mapa pokrytí', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#pokryti=1');
  await expect(page.locator('#legendTitle')).toHaveText('Pokrytí obcí', { timeout: 30000 });
  await expect(page.locator('#legendBody')).toContainText('Jednotný standard', { timeout: 30000 });
  expect(errors, 'chyby v konzoli').toEqual([]);
});

test('úvod a hledání', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#covN')).not.toHaveText('', { timeout: 30000 });
  await page.locator('#q').fill('Jihlava');
  await expect(page.locator('#results button').first()).toBeVisible({ timeout: 30000 });
  expect(errors, 'chyby v konzoli').toEqual([]);
});
