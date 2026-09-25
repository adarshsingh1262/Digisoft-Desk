import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produces an argon2id hash that is not the plaintext', async () => {
    const hash = await service.hash('Str0ngPassword1');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('Str0ngPassword1');
  });

  it('verifies the correct password and rejects a wrong one', async () => {
    const hash = await service.hash('Str0ngPassword1');
    await expect(service.verify(hash, 'Str0ngPassword1')).resolves.toBe(true);
    await expect(service.verify(hash, 'Str0ngPassword2')).resolves.toBe(false);
  });

  it('treats a missing hash as a failed verification rather than throwing', async () => {
    await expect(service.verify(null, 'anything')).resolves.toBe(false);
    await expect(service.verify('not-a-hash', 'anything')).resolves.toBe(false);
  });
});
