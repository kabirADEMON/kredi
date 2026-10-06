import { expect, test } from '@playwright/test';

// Captures d'écran du README : `SCREENSHOTS=1 npx playwright test screenshots`.
test.skip(!process.env.SCREENSHOTS, 'Lancé seulement pour régénérer les captures.');
test.describe.configure({ mode: 'serial' });

const out = (name: string) => `../../docs/screens/${name}.png`;

test('captures de l’application', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Essayer avec une boutique d’exemple' }).click();
  await expect(page.getByRole('heading', { name: 'À relancer' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('accueil') });

  await page.getByRole('link', { name: 'Clients' }).first().click();
  await expect(page.getByRole('list', { name: 'Liste des clients' })).toBeVisible();
  await page.screenshot({ path: out('clients') });

  await page.getByRole('link', { name: /Afi Houngbo/ }).click();
  await expect(page.getByTestId('balance')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out('fiche-client') });

  await page.getByRole('button', { name: 'Crédit', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Montant en francs CFA').fill('2500');
  await sheet.getByLabel('Ce qu’il a pris (facultatif)').fill('Savon + lait en poudre');
  await sheet.getByRole('button', { name: '2 semaines' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('saisie-credit') });
  await sheet.getByRole('button', { name: 'Fermer' }).click();

  await page.getByRole('button', { name: 'Relevé' }).click();
  const url = await page.getByLabel('Lien du relevé').inputValue();
  const client = await browser.newPage();
  await client.goto(url);
  await expect(client.getByTestId('public-balance')).toBeVisible();
  await client.screenshot({ path: out('releve-client') });
  await client.getByRole('button', { name: 'Payer par Mobile Money' }).click();
  await client.getByRole('dialog').getByRole('button', { name: /Payer/ }).click();
  await expect(client).toHaveURL(/simulation/);
  await client.screenshot({ path: out('paiement') });
  await client.close();

  const desktop = await browser.newPage({
    viewport: { width: 1280, height: 860 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  });
  await desktop.goto('/');
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: out('site') });
  await desktop.close();
});
