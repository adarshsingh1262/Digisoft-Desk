import { expect, test } from '@playwright/test';

/**
 * The same email address can be a distinct account in more than one organization.
 * Signing in asks for nothing but email and password; the server only asks which
 * organization when the password actually matches more than one of them.
 */
const unique = Date.now().toString(36);
const email = `shared-${unique}@example.test`;
const password = 'Str0ngPassword1';

const orgA = { name: `Northwind ${unique}`, slug: `northwind-${unique}`, firstName: 'Nora' };
const orgB = { name: `Southgate ${unique}`, slug: `southgate-${unique}`, firstName: 'Sam' };

test.describe.configure({ mode: 'serial' });

async function register(page: import('@playwright/test').Page, org: typeof orgA) {
  await page.goto('/register');
  await page.getByLabel('Organization name').fill(org.name);
  // The address auto-fills from the name; give it the exact slug this test expects.
  await page.getByLabel('Organization address').fill(org.slug);
  await page.getByLabel('First name').fill(org.firstName);
  await page.getByLabel('Last name').fill('Owner');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('registers the same email in two organizations', async ({ page }) => {
  await register(page, orgA);
});

test('a second organization with the same email is a separate account', async ({ page }) => {
  await register(page, orgB);
});

test('signing in with the shared email asks which organization to enter', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Choose an organization' })).toBeVisible();
  await expect(page.getByText(orgA.name)).toBeVisible();
  await expect(page.getByText(orgB.name)).toBeVisible();
  // No session is granted merely for reaching this screen.
  await expect(page).toHaveURL(/\/login$/);

  await page.getByText(orgB.name).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: `Welcome back, ${orgB.firstName}` })).toBeVisible();
});

test('a wrong password looks the same whether the email is shared or not', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel(/^Password/).fill('DefinitelyWrong123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Incorrect email address or password')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose an organization' })).toBeHidden();
});
