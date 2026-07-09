import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CryptoService {
  private readonly algorithm = 'aes-256-gcm';

  constructor(private readonly config: ConfigService) {}

  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64url'),
      authTag.toString('base64url'),
      encrypted.toString('base64url')
    ].join(':');
  }

  decrypt(payload: string) {
    const [version, iv, authTag, encrypted] = payload.split(':');
    if (version !== 'v1' || !iv || !authTag || !encrypted) {
      throw new Error('Invalid encrypted payload.');
    }

    const decipher = createDecipheriv(this.algorithm, this.getKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  }

  private getKey() {
    const configured = this.config.getOrThrow<string>('FIELD_ENCRYPTION_KEY');
    const raw = Buffer.from(configured, 'base64');

    if (raw.length === 32) {
      return raw;
    }

    return createHash('sha256').update(configured).digest();
  }
}
