import { expect, test } from '@playwright/test';

/**
 * The Phase 2 workflow through the real UI: raise a ticket, reply to the customer,
 * leave an internal comment, and resolve it — checking that the two kinds of message
 * stay visually distinct.
 */
const unique = Date.now().toString(36);
const org = {
  name: `Helpdesk ${unique}`,
  slug: `hd-${unique}`,
  email: `agent-${unique}@example.test`,
  password: 'Str0ngPassword1',
};

test.describe.configure({ mode: 'serial' });

test('sets up an organization with a customer', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Organization name').fill(org.name);
  await page.getByLabel('Organization address').fill(org.slug);
  await page.getByLabel('First name').fill('Robin');
  await page.getByLabel('Last name').fill('Agent');
  await page.getByLabel('Work email').fill(org.email);
  await page.getByLabel(/^Password/).fill(org.password);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Customers' })
    .click();
  await page.getByRole('button', { name: 'New contact' }).first().click();
  await page.getByLabel('First name').fill('Dana');
  await page.getByLabel('Last name').fill('Customer');
  await page.getByLabel('Email').fill(`dana-${unique}@example.test`);
  await page.getByRole('button', { name: 'Create contact' }).click();
  await expect(page.getByRole('link', { name: 'Dana Customer' })).toBeVisible();
});

test('raises a ticket, replies, comments internally and resolves it', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(org.email);
  await page.getByLabel(/^Password/).fill(org.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Scoped to the sidebar: the dashboard also links to /tickets from its stat cards.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Tickets' }).click();
  await expect(page.getByText('No tickets in this view')).toBeVisible();

  await page.getByRole('button', { name: 'New ticket' }).first().click();
  // Scoped to the dialog: the queue page has its own status and priority filters.
  const dialog = page.getByRole('dialog', { name: 'New ticket' });
  await dialog.getByLabel('Subject').fill('Invoice download returns a 500');
  await dialog.getByLabel('Description').fill('Clicking download on any invoice fails.');
  await dialog.getByLabel('Requester').selectOption({ index: 1 });
  await expect(dialog.getByLabel('Priority').getByRole('option', { name: 'High' })).toBeAttached();
  await dialog.getByLabel('Priority').selectOption({ label: 'High' });
  await dialog.getByRole('button', { name: 'Create ticket' }).click();

  // Lands straight in the workspace for the new ticket.
  await expect(page).toHaveURL(/\/tickets\/[a-z0-9]+$/);
  await expect(page.getByRole('heading', { name: 'Invoice download returns a 500' })).toBeVisible();
  await expect(page.getByText('Ticket #1', { exact: true })).toBeVisible();
  await expect(page.getByText('Clicking download on any invoice fails.')).toBeVisible();

  // A public reply.
  await page.getByRole('tab', { name: 'Reply to customer' }).click();
  await page.getByLabel('Reply to the customer').fill('Thanks Dana — reproducing it now.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByText('Thanks Dana — reproducing it now.')).toBeVisible();
  await expect(page.getByText('Public reply')).toBeVisible();

  // An internal comment, which must be labelled and warn that it stays private.
  await page.getByRole('tab', { name: 'Internal comment' }).click();
  await expect(page.getByText(/Only agents can see internal comments/)).toBeVisible();
  await page.getByLabel('Internal comment').fill('PDF service is out of disk.');
  await page.getByRole('button', { name: 'Add comment' }).click();
  await expect(page.getByText('PDF service is out of disk.')).toBeVisible();
  await expect(page.getByText('Internal', { exact: true })).toBeVisible();

  // Properties panel drives status changes.
  await expect(page.getByLabel('Priority')).toHaveValue(/.+/);
  await page.getByRole('button', { name: 'Resolve' }).click();
  await page.getByLabel('Resolution note').fill('Freed disk on the PDF worker.');
  await page.getByRole('button', { name: 'Resolve', exact: true }).last().click();
  await expect(page.getByText('Freed disk on the PDF worker.')).toBeVisible();

  // History reflects what happened, in order.
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByText('created the ticket')).toBeVisible();
  await expect(page.getByText('replied to the customer')).toBeVisible();
  await expect(page.getByText('added an internal comment')).toBeVisible();
});

test('shows the resolved ticket in the queue and its saved views', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(org.email);
  await page.getByLabel(/^Password/).fill(org.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/tickets');
  await page.getByRole('button', { name: /^All/ }).click();
  await expect(page.getByRole('link', { name: 'Invoice download returns a 500' })).toBeVisible();

  const openView = page.getByRole('button', { name: /^Open/ });
  await openView.click();
  await expect(page.getByText('No tickets in this view')).toBeVisible();
});
