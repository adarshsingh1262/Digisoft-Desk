import { slugify } from '@digisoft/shared';
import { uniqueSlug } from './slug';

describe('slugify', () => {
  it('turns a title into a URL segment', () => {
    expect(slugify('How to download an invoice')).toBe('how-to-download-an-invoice');
    expect(slugify('  Billing & invoices!  ')).toBe('billing-invoices');
    expect(slugify('Facturación rápida')).toBe('facturacion-rapida');
  });

  it('never ends in a separator, even when it has to truncate', () => {
    const slug = slugify(`${'a'.repeat(79)} tail`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('keeps the first free candidate', async () => {
    const taken = new Set(['guide', 'guide-2']);
    await expect(uniqueSlug('Guide', async (candidate) => taken.has(candidate))).resolves.toBe('guide-3');
  });

  it('falls back when the source has nothing usable in it', async () => {
    await expect(uniqueSlug('！！！', async () => false, 'article')).resolves.toBe('article');
  });
});
