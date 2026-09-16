import { expect, test } from '@playwright/test';

/**
 * Phase 4 through the real UI: an administrator publishes an article, a customer finds
 * it in the help center, raises a request from the web form, signs in to follow it and
 * asks a question in the community.
 */
const unique = Date.now().toString(36);
const org = {
  name: `Help ${unique}`,
  slug: `help-${unique}`,
  email: `help-${unique}@example.test`,
  password: 'Str0ngPassword1',
};
const customer = { email: `customer-${unique}@example.test`, password: 'PortalPass123' };

test.describe.configure({ mode: 'serial' });

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(org.email);
  await page.getByLabel(/^Password/).fill(org.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('registers an organization and publishes a knowledge base article', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Organization name').fill(org.name);
  await page.getByLabel('Organization address').fill(org.slug);
  await page.getByLabel('First name').fill('Hana');
  await page.getByLabel('Last name').fill('Admin');
  await page.getByLabel('Work email').fill(org.email);
  await page.getByLabel(/^Password/).fill(org.password);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Knowledge base' }).click();
  await page.getByRole('link', { name: 'New article' }).first().click();

  await page.getByLabel('Title').fill('How to download an invoice');
  await page.getByLabel('Summary').fill('Find and download any past invoice.');
  await page.getByLabel('Markdown').fill('## Steps\n\n1. Open Billing\n2. Choose Download PDF\n');
  await page.getByRole('button', { name: 'Save and publish' }).click();

  await expect(page.getByText('Article saved')).toBeVisible();
  await expect(page.getByText('Published', { exact: false }).first()).toBeVisible();
});

test('a visitor finds the article in the help center and rates it', async ({ page }) => {
  await page.goto(`/help/${org.slug}`);
  await expect(page.getByRole('heading', { name: `${org.name} Support` })).toBeVisible();

  await page.getByLabel('Search the knowledge base').fill('invoice');
  await page.getByRole('link', { name: 'How to download an invoice' }).click();

  await expect(page.getByRole('heading', { name: 'How to download an invoice' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Steps' })).toBeVisible();

  await page.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByText('1 of 1 found this helpful')).toBeVisible();
});

test('a visitor raises a request from the web form', async ({ page }) => {
  await page.goto(`/help/${org.slug}/submit`);
  await page.getByLabel('Your name').fill('Rhea Kapoor');
  await page.getByLabel('Email address').fill(customer.email);
  await page.getByLabel('Subject').fill('Export crashes above 500 rows');
  await page.getByLabel('How can we help?').fill('Every large export kills the tab.');
  await page.getByRole('button', { name: 'Submit request' }).click();

  await expect(page.getByText('Request received')).toBeVisible();
  await expect(page.getByText(/Your reference is #\d+/)).toBeVisible();
});

test('the customer signs up and finds the request they raised anonymously', async ({ page }) => {
  await page.goto(`/help/${org.slug}/register`);
  await page.getByLabel('First name').fill('Rhea');
  await page.getByLabel('Last name').fill('Kapoor');
  await page.getByLabel('Email address').fill(customer.email);
  await page.getByLabel('Password').fill(customer.password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(new RegExp(`/help/${org.slug}/tickets$`));
  await page.getByRole('link', { name: /Export crashes above 500 rows/ }).click();
  await expect(page.getByText('Every large export kills the tab.')).toBeVisible();

  await page.getByLabel('Reply').fill('It also happens in Firefox.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByText('It also happens in Firefox.')).toBeVisible();
});

test('the customer asks the community and an agent answers', async ({ page }) => {
  await page.goto(`/help/${org.slug}/login`);
  await page.getByLabel('Email address').fill(customer.email);
  await page.getByLabel('Password').fill(customer.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/help/${org.slug}/tickets$`));

  await page.getByRole('link', { name: 'Community' }).click();
  await page.getByRole('button', { name: 'New topic' }).click();
  await page.getByLabel('Title').fill('Is there a row limit on exports?');
  await page.locator('#topic-category').selectOption({ label: 'General discussion' });
  await page.getByLabel('Details').fill('Asking because large exports keep failing.');
  await page.getByRole('button', { name: 'Post topic' }).click();
  await expect(page.getByRole('link', { name: 'Is there a row limit on exports?' })).toBeVisible();
});

test('an agent answers the topic from the moderation queue', async ({ page }) => {
  await signIn(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Community' }).click();
  await page.getByRole('link', { name: 'Is there a row limit on exports?' }).click();

  await page.getByLabel('Reply body').fill('The legacy exporter caps at 500 rows; the new one has no limit.');
  await page.getByRole('button', { name: 'Post reply' }).click();
  await expect(page.getByText('Reply posted')).toBeVisible();

  await page.getByRole('button', { name: 'Mark as answer' }).click();
  await expect(page.getByText('Answer', { exact: true }).first()).toBeVisible();
});
