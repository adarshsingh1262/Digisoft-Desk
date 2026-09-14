import { randomBytes } from 'node:crypto';
import { decryptSecrets, encryptSecrets, readEncryptionKey, safeEqual } from './crypto';

describe('channel secret storage', () => {
  const key = randomBytes(32);

  it('round-trips credentials', () => {
    const blob = encryptSecrets({ botToken: '123:abc', secretToken: 'shh' }, key);
    expect(blob.startsWith('v1.')).toBe(true);
    expect(blob).not.toContain('123:abc');
    expect(decryptSecrets(blob, key)).toEqual({ botToken: '123:abc', secretToken: 'shh' });
  });

  it('refuses a tampered blob', () => {
    const blob = encryptSecrets({ a: 'b' }, key);
    const [version, iv, tag, payload] = blob.split('.');
    const tampered = [version, iv, tag, `${payload}00`].join('.');
    expect(() => decryptSecrets(tampered, key)).toThrow();
  });

  it('treats a missing blob as no credentials', () => {
    expect(decryptSecrets(null, key)).toEqual({});
  });

  it('insists on a real 32-byte key', () => {
    expect(() => readEncryptionKey(undefined)).toThrow(/CHANNEL_ENCRYPTION_KEY/);
    expect(() => readEncryptionKey('too-short')).toThrow(/32 bytes/);
    expect(readEncryptionKey(randomBytes(32).toString('base64'))).toHaveLength(32);
    expect(readEncryptionKey(randomBytes(32).toString('hex'))).toHaveLength(32);
  });

  it('compares secrets without leaking their length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
