import { expect, test } from '@playwright/test';

/**
 * Phase 3 through the real UI: a fresh organization gets a default SLA, an
 * administrator builds a workflow rule and an assignment rule, a ticket shows its SLA
 * targets, and a task is logged against it.
 */
const unique = Date.now().toString(36);
const org = { name: `Ops ${unique}`, slug: `ops-${unique}`, email: `ops-${unique}@example.test`, password: 'Str0ngPassword1' };

test.describe.configure({ mode: 'serial' });

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(org.email);
  await page.getByLabel(/^Password/).fill(org.password);
  await page.getByLabel('Organization address').fill(org.slug);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('registers and finds the default SLA policy in place', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Organization name').fill(org.name);
  await page.getByLabel('Organization address').fill(org.slug);
  await page.getByLabel('First name').fill('Ops');
  await page.getByLabel('Last name').fill('Admin');
  await page.getByLabel('Work email').fill(org.email);
  await page.getByLabel(/^Password/).fill(org.password);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Automation' }).click();
  await page.getByRole('link', { name: 'SLA policies' }).click();
  await expect(page.getByRole('heading', { name: /Standard support/ })).toBeVisible();
  await expect(page.getByText('Urgent')).toBeVisible();
});

test('creates a workflow rule and an assignment rule', async ({ page }) => {
  await signIn(page);
  await page.goto('/automation/rules');
  await page.getByRole('button', { name: 'New rule' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New workflow rule' });
  await dialog.getByLabel('Name').fill('Flag chat tickets');
  await dialog.getByRole('button', { name: 'Add condition' }).first().click();
  await dialog.getByLabel('Field').selectOption('source');
  await dialog.getByLabel('Value').selectOption('CHAT');
  await dialog.getByRole('button', { name: 'Add action' }).click();
  await dialog.getByLabel('Action', { exact: true }).selectOption('set_priority');
  await dialog.getByLabel('Priority').selectOption({ label: 'Urgent' });
  await dialog.getByRole('button', { name: 'Create rule' }).click();
  await expect(page.getByText('Flag chat tickets')).toBeVisible();
  await expect(page.getByText('Ticket created')).toBeVisible();

  await page.goto('/automation/assignment');
  await page.getByRole('button', { name: 'New rule' }).first().click();
  const arDialog = page.getByRole('dialog', { name: 'New assignment rule' });
  await arDialog.getByLabel('Name').fill('Spread the load');
  await arDialog.getByLabel('Route to').selectOption('ROUND_ROBIN');
  await arDialog.getByLabel('Department').selectOption({ index: 1 });
  await arDialog.getByRole('button', { name: 'Create rule' }).click();
  await expect(page.getByText('Spread the load')).toBeVisible();
  await expect(page.getByText(/Round-robin/)).toBeVisible();
});

test('shows SLA targets on a new ticket and logs a task against it', async ({ page }) => {
  await signIn(page);
  await page.goto('/tickets');
  await page.getByRole('button', { name: 'New ticket' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New ticket' });
  await dialog.getByLabel('Subject').fill('Report export fails');
  await dialog.getByLabel('Description').fill('Clicking export does nothing.');
  await dialog.getByRole('button', { name: 'Create ticket' }).click();
  await expect(page).toHaveURL(/\/tickets\/[a-z0-9]+$/);

  const sla = page.getByRole('region', { name: 'SLA' });
  await expect(sla.getByText('Standard support')).toBeVisible();
  await expect(sla.getByText(/First response/)).toBeVisible();
  await expect(sla.getByText(/due /).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Activities' }).click();
  await page.getByRole('button', { name: 'Task' }).click();
  const taskDialog = page.getByRole('dialog', { name: /New task/ });
  await taskDialog.getByLabel('Subject').fill('Reproduce the export failure');
  await taskDialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Reproduce the export failure')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Activities' }).click();
  await expect(page.getByText('Reproduce the export failure')).toBeVisible();
});
