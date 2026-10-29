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
  { name: 'Praha, Metropolitní plán', hash: 'mapa=15.00/50.08750/14.42050&bod=50.087500,14.420500', title: /Výkres územního plánu/ }
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

test('úvod a hledání', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#covN')).not.toHaveText('', { timeout: 30000 });
  await page.locator('#q').fill('Jihlava');
  await expect(page.locator('#results button').first()).toBeVisible({ timeout: 30000 });
  expect(errors, 'chyby v konzoli').toEqual([]);
});
