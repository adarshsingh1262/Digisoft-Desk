import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** Argon2id with parameters sized for interactive login on a small API instance. */
@Injectable()
export class PasswordService {
  private readonly options: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  };

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  async verify(hash: string | null, plain: string): Promise<boolean> {
    if (!hash) {
      return false;
    }
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
