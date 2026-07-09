import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  it('encrypts and decrypts values', () => {
    const service = new CryptoService({
      getOrThrow: () => Buffer.from('0123456789abcdef0123456789abcdef').toString('base64')
    } as unknown as ConfigService);

    const encrypted = service.encrypt('super-secret-value');

    expect(encrypted).not.toBe('super-secret-value');
    expect(service.decrypt(encrypted)).toBe('super-secret-value');
  });
});
