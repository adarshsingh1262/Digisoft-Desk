import { expect, test } from '@playwright/test';

/**
 * Phase 6 through the real UI: an administrator turns the assistant on, an agent asks it
 * about a ticket, and the suggested reply lands in the composer as an editable draft —
 * never as a sent message.
 */
const unique = Date.now().toString(36);
const org = {
  name: `Assist ${unique}`,
  slug: `assist-${unique}`,
  email: `assist-${unique}@example.test`,
  password: 'Str0ngPassword1',
};

test.describe.configure({ mode: 'serial' });

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(org.email);
  await page.getByLabel(/^Password/).fill(org.password);
  await page.getByLabel('Organization address').fill(org.slug);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('an administrator turns the assistant on', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Organization name').fill(org.name);
  await page.getByLabel('Organization address').fill(org.slug);
  await page.getByLabel('First name').fill('Ada');
  await page.getByLabel('Last name').fill('Admin');
  await page.getByLabel('Work email').fill(org.email);
  await page.getByLabel(/^Password/).fill(org.password);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/settings/ai');
  await page.getByLabel('Enable the assistant for this organization').check();
  await page.getByLabel('Provider').selectOption('HEURISTIC');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Assistant settings saved')).toBeVisible();

  // The built-in provider needs no credentials, so the round trip must actually work.
  await page.getByRole('button', { name: 'Send a test request' }).click();
  await expect(page.getByText(/HEURISTIC answered/)).toBeVisible();
});

test('an agent reads the assistant and uses its draft', async ({ page }) => {
  await signIn(page);

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Customers' })
    .click();
  await page.getByRole('button', { name: 'New contact' }).first().click();
  await page.getByLabel('First name').fill('Nadia');
  await page.getByLabel('Last name').fill('Rahman');
  await page.getByLabel('Email').fill(`nadia-${unique}@example.test`);
  await page.getByRole('button', { name: 'Create contact' }).click();
  await expect(page.getByRole('link', { name: 'Nadia Rahman' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tickets' }).click();
  await page.getByRole('button', { name: 'New ticket' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New ticket' });
  await dialog.getByLabel('Subject').fill('Checkout fails with a payment error');
  await dialog
    .getByLabel('Description')
    .fill('Every payment attempt today returns an error page. This is broken and costing us orders.');
  await dialog.getByLabel('Requester').selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Create ticket' }).click();
  await expect(page).toHaveURL(/\/tickets\/[a-z0-9]+$/);

  await page.getByRole('tab', { name: 'Assistant' }).click();

  // Auto-analysis may already have run in the background, so accept either state.
  await page.getByRole('button', { name: /^(Generate|Refresh)$/ }).click();
  await expect(page.getByText('Nothing generated yet.')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Sentiment' })).toBeVisible();

  await page.getByRole('button', { name: /^(Draft a reply|Redraft)$/ }).click();
  await expect(page.getByRole('button', { name: 'Use this draft' })).toBeVisible();
  const draft = (await page.locator('p.whitespace-pre-wrap').first().textContent()) ?? '';
  expect(draft.length).toBeGreaterThan(0);

  // The draft is handed to the composer, not sent.
  await page.getByRole('button', { name: 'Use this draft' }).click();
  await page.getByRole('tab', { name: 'Conversation' }).click();
  await expect(page.getByLabel('Reply to the customer')).toHaveValue(draft);
  await expect(page.getByText('Public reply')).toBeHidden();
});

test('usage is recorded for the organization', async ({ page }) => {
  await signIn(page);
  await page.goto('/settings/ai');
  await expect(page.getByText('Usage this month')).toBeVisible();
  await expect(page.getByText('Nothing has been generated yet.')).toBeHidden();
});
