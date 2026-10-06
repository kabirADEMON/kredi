import { expect, test, type Page } from '@playwright/test';

// Parcours complet d'une commerçante, du premier écran au remboursement Mobile Money.
test.describe.configure({ mode: 'serial' });

const PHONE = `01${String(Date.now()).slice(-8)}`;
const PIN = '2580';
const NEW_PIN = '7391';

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});
test.afterAll(() => page.close());

const balance = () => page.getByTestId('balance');

test('inscription depuis la page d’accueil', async () => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Le cahier de crédit de votre boutique');
  await page.getByRole('link', { name: 'Créer mon carnet gratuitement' }).click();

  await page.getByLabel('Nom de la boutique').fill('Boutique Sika');
  await page.getByLabel('Votre nom').fill('Sika Mensah');
  await page.getByLabel('Numéro de téléphone').fill(PHONE);
  await page.getByLabel('Choisissez un code PIN').fill('1234');
  await page.getByLabel('Confirmez le code PIN').fill('1234');
  await page.getByRole('button', { name: 'Créer mon carnet' }).click();
  await expect(page.getByText('Ce code est trop facile à deviner.')).toBeVisible();

  await page.getByLabel('Choisissez un code PIN').fill(PIN);
  await page.getByLabel('Confirmez le code PIN').fill(PIN);
  await page.getByRole('button', { name: 'Créer mon carnet' }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Bonjour Sika' })).toBeVisible();
  await expect(page.getByTestId('total-due')).toHaveText('0 F');
  await expect(page.getByText('Votre carnet est vide')).toBeVisible();
});

test('ajout d’un client puis premier crédit', async () => {
  await page.getByRole('link', { name: 'Ajouter un client' }).click();
  await page.getByLabel('Nom du client').fill('Afi Houngbo');
  await page.getByLabel('Numéro WhatsApp').fill('97 12 34 56');
  await page.getByRole('button', { name: 'Ajouter le client' }).click();

  // La fiche s'ouvre directement sur la saisie du crédit.
  const sheet = page.getByRole('dialog', { name: 'Crédit pour Afi' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Montant en francs CFA').fill('3500');
  await expect(sheet.getByLabel('Montant en francs CFA')).toHaveValue(/^3\s500$/);
  await sheet.getByLabel('Ce qu’il a pris (facultatif)').fill('Huile 5 L');
  await sheet.getByRole('button', { name: '1 semaine' }).click();
  await sheet.getByRole('button', { name: /Noter le crédit de 3\s500/ }).click();

  await expect(sheet).toBeHidden();
  await expect(page.getByText('Crédit de 3 500 F noté')).toBeVisible();
  await expect(balance()).toHaveText('3 500 F');
  await expect(page.getByText('+229 01 97 12 34 56')).toBeVisible();
  await expect(page.getByTestId('entry')).toHaveCount(1);
  await expect(page.getByTestId('entry').first()).toContainText('Huile 5 L');
});

test('le bouton + permet d’ajouter un crédit rapidement', async () => {
  await page.getByRole('button', { name: 'Noter une opération' }).click();
  const picker = page.getByRole('dialog', { name: 'Pour quel client ?' });
  await picker.getByRole('button', { name: /Afi Houngbo/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Crédit pour Afi' });
  await sheet.getByRole('button', { name: /^\+1\s000\sF$/ }).click();
  await sheet.getByRole('button', { name: /^\+500\sF$/ }).click();
  await sheet.getByRole('button', { name: /Noter le crédit de 1\s500/ }).click();
  await expect(balance()).toHaveText('5 000 F');
});

test('remboursement, refus du trop-perçu et annulation', async () => {
  await page.getByRole('button', { name: 'Rembourse' }).click();
  let sheet = page.getByRole('dialog', { name: 'Afi rembourse' });
  await sheet.getByLabel('Montant en francs CFA').fill('9000');
  await sheet.getByRole('button', { name: /Noter le remboursement/ }).click();
  await expect(sheet.getByText(/Afi ne doit que 5\s000\sF\./)).toBeVisible();

  await sheet.getByLabel('Montant en francs CFA').fill('2000');
  await sheet.getByRole('button', { name: /Noter le remboursement de 2\s000/ }).click();
  await expect(balance()).toHaveText('3 000 F');

  // Erreur de saisie : on annule le remboursement, il reste barré dans l'historique.
  await page.getByTestId('entry').first().getByRole('button', { name: 'Annuler' }).click();
  sheet = page.getByRole('dialog', { name: 'Annuler cette opération ?' });
  await sheet.getByLabel('Raison (facultatif)').fill('Erreur de montant');
  await sheet.getByRole('button', { name: 'Annuler l’opération' }).click();
  await expect(balance()).toHaveText('5 000 F');
  await expect(page.getByTestId('entry')).toHaveCount(4);
  await expect(page.getByTestId('entry').first()).toContainText('Annulation d’un remboursement');
  await expect(page.getByTestId('entry').nth(1)).toContainText('Annulé');
});

test('la relance WhatsApp contient le solde et le lien du relevé', async () => {
  const href = await page.getByRole('link', { name: 'Relancer' }).getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/2290197123456\?text=/);
  const text = decodeURIComponent(href!.split('text=')[1]!);
  expect(text).toContain('Bonjour Afi');
  expect(text).toMatch(/votre solde est de 5\s000\sF/);
  expect(text).toMatch(/\/c\/[A-Za-z0-9_-]{22}/);
});

test('le client consulte son relevé et paie en Mobile Money', async ({ browser }) => {
  await page.getByRole('button', { name: 'Relevé' }).click();
  const url = await page.getByLabel('Lien du relevé').inputValue();
  await page.getByRole('button', { name: 'Fermer' }).click();

  // Le client ouvre le lien sur son propre téléphone : aucune session.
  const client = await browser.newPage();
  await client.goto(url);
  await expect(client.getByText('Bonjour Afi,')).toBeVisible();
  await expect(client.getByTestId('public-balance')).toHaveText('5 000 F');
  // Les opérations annulées n'apparaissent pas chez le client.
  await expect(client.locator('.entry')).toHaveCount(2);

  await client.getByRole('button', { name: 'Payer par Mobile Money' }).click();
  const sheet = client.getByRole('dialog', { name: 'Payer par Mobile Money' });
  await sheet.getByLabel('Montant à payer').fill('3000');
  await sheet.getByRole('button', { name: /Payer 3\s000/ }).click();

  await expect(client).toHaveURL(/\/paiement\/simulation\//);
  await client.getByRole('button', { name: 'Moov Money' }).click();
  await client.getByLabel('Numéro Mobile Money').fill('01 66 55 44 33');
  await client.getByRole('button', { name: /Valider le paiement de 3\s000/ }).click();

  await expect(client.getByTestId('payment-status')).toHaveText('Paiement reçu, merci !');
  await expect(client.getByText(/Reste à payer : 2\s000\sF/)).toBeVisible();
  await client.getByRole('link', { name: 'Voir mon relevé' }).click();
  await expect(client.getByTestId('public-balance')).toHaveText('2 000 F');
  await client.close();

  // Côté commerçante, le paiement apparaît tout seul dans le carnet.
  await page.reload();
  await expect(balance()).toHaveText('2 000 F');
  await expect(page.getByTestId('entry').first()).toContainText('Payé en ligne');
  await expect(page.getByTestId('entry').first().getByRole('button', { name: 'Annuler' })).toHaveCount(0);
});

test('tableau de bord et liste des clients', async () => {
  await page.getByRole('link', { name: 'Accueil' }).click();
  await expect(page.getByTestId('total-due')).toHaveText('2 000 F');
  await expect(page.getByTestId('collected')).toHaveText('3 000 F');
  await expect(page.getByText('Paiement Mobile Money').first()).toBeVisible();

  await page.getByRole('link', { name: 'Clients' }).first().click();
  await page.getByLabel('Rechercher un client').fill('afi');
  await expect(page.getByRole('list', { name: 'Liste des clients' }).getByRole('listitem')).toHaveCount(1);
  await page.getByLabel('Rechercher un client').fill('zzz');
  await expect(page.getByText('Aucun client ne correspond')).toBeVisible();
});

test('changement de code PIN, déconnexion et reconnexion', async () => {
  await page.getByRole('link', { name: 'Réglages' }).click();
  await page.getByLabel('Code actuel').fill(PIN);
  await page.getByLabel('Nouveau code', { exact: true }).fill(NEW_PIN);
  await page.getByLabel('Confirmer le nouveau code').fill(NEW_PIN);
  await page.getByRole('button', { name: 'Changer le code' }).click();
  await expect(page.getByText(/Code PIN changé/)).toBeVisible();

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/connexion/);

  await page.getByLabel('Numéro de téléphone').fill(PHONE);
  await page.getByLabel('Code PIN').fill(PIN);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText(/Numéro ou code PIN incorrect\. 4 essais restants/)).toBeVisible();

  await page.getByLabel('Code PIN').fill(NEW_PIN);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId('total-due')).toHaveText('2 000 F');
});

test('démo : chaque visiteur a sa boutique d’exemple', async ({ browser }) => {
  const visitor = await browser.newPage();
  await visitor.goto('/');
  await visitor.getByRole('button', { name: 'Essayer avec une boutique d’exemple' }).click();
  await expect(visitor).toHaveURL(/\/app$/);
  await expect(visitor.getByText('Démo', { exact: true })).toBeVisible();
  await expect(visitor.getByRole('heading', { name: 'À relancer' })).toBeVisible();

  await visitor.getByRole('link', { name: 'Clients' }).first().click();
  await visitor.getByRole('button', { name: 'En retard' }).click();
  const late = visitor.getByRole('list', { name: 'Liste des clients' }).getByRole('listitem');
  await expect(late.first()).toBeVisible();
  for (const item of await late.all()) await expect(item.getByText('En retard')).toBeVisible();
  await visitor.close();
});

test('un lien de relevé inconnu affiche un message clair', async ({ browser }) => {
  const visitor = await browser.newPage();
  await visitor.goto('/c/AAAAAAAAAAAAAAAAAAAAAA');
  await expect(visitor.getByText('Ce lien ne fonctionne plus')).toBeVisible();
  await visitor.close();
});
