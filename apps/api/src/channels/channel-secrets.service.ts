import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  decryptSecrets,
  encryptSecrets,
  readEncryptionKey,
  type ChannelSecrets,
} from '@digisoft/channels';
import { AppConfig } from '../config/config.module';
import { AppError } from '../common/errors/app-error';

/**
 * Channel credentials, encrypted at rest and never returned by the API. The key is read
 * lazily so a deployment that configures no channels needs no key, while one that does
 * fails loudly rather than storing credentials under a guessable key.
 */
@Injectable()
export class ChannelSecretsService {
  constructor(private readonly config: AppConfig) {}

  private key(): Buffer {
    try {
      return readEncryptionKey(this.config.get('CHANNEL_ENCRYPTION_KEY'));
    } catch (error) {
      throw AppError.validation(error instanceof Error ? error.message : 'Channel encryption key is invalid');
    }
  }

  /** Merges new values over the stored ones, so a form can omit unchanged secrets. */
  seal(existing: string | null, incoming: ChannelSecrets | undefined): string | null {
    if (!incoming || Object.keys(incoming).length === 0) {
      return existing;
    }
    const key = this.key();
    const merged = { ...decryptSecrets(existing, key) };
    for (const [name, value] of Object.entries(incoming)) {
      if (value === '') {
        delete merged[name];
      } else {
        merged[name] = value;
      }
    }
    return Object.keys(merged).length > 0 ? encryptSecrets(merged, key) : null;
  }

  open(blob: string | null): ChannelSecrets {
    return decryptSecrets(blob, this.key());
  }

  /** Which credentials a channel holds — names only, never values. */
  names(blob: string | null): string[] {
    if (!blob) {
      return [];
    }
    try {
      return Object.keys(decryptSecrets(blob, this.key()));
    } catch {
      return [];
    }
  }

  static newWebhookSecret(): string {
    return randomBytes(24).toString('base64url');
  }
}
