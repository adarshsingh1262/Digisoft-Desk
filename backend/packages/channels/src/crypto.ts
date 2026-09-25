import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ChannelSecrets } from './types';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Channel credentials are encrypted at rest with AES-256-GCM. The key comes from the
 * environment and is never derived from something guessable — a missing key is an
 * error rather than a silent fallback, so credentials cannot be written with a weak one.
 */
export function readEncryptionKey(raw: string | undefined): Buffer {
  if (!raw) {
    throw new Error(
      'CHANNEL_ENCRYPTION_KEY is required to store channel credentials. Generate one with: openssl rand -base64 32',
    );
  }
  const key = raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('CHANNEL_ENCRYPTION_KEY must decode to 32 bytes (base64 or hex)');
  }
  return key;
}

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url — one self-describing column value. */
export function encryptSecrets(secrets: ChannelSecrets, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const payload = Buffer.concat([
    cipher.update(JSON.stringify(secrets), 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    payload.toString('base64url'),
  ].join('.');
}

export function decryptSecrets(blob: string | null | undefined, key: Buffer): ChannelSecrets {
  if (!blob) {
    return {};
  }
  const [version, iv, tag, payload] = blob.split('.');
  if (version !== 'v1' || !iv || !tag || !payload) {
    throw new Error('Channel credentials are stored in an unrecognised format');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plain) as ChannelSecrets;
}

/** Constant-time comparison that tolerates different lengths without leaking them. */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}
