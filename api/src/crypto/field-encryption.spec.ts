import { describe, expect, it } from 'bun:test';
import { decryptField, encryptField } from './field-encryption';

describe('field encryption', () => {
  it('round-trips plaintext through encrypt/decrypt', () => {
    const plaintext = JSON.stringify({
      role: 'user',
      content: "what's my week look like?",
    });
    expect(decryptField(encryptField(plaintext))).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext each time', () => {
    const plaintext = 'same input, different iv';
    expect(encryptField(plaintext)).not.toBe(encryptField(plaintext));
  });

  it('never stores the plaintext verbatim in the encoded value', () => {
    const plaintext = 'a very recognizable secret string';
    expect(encryptField(plaintext)).not.toContain(plaintext);
  });

  it('rejects a tampered ciphertext instead of returning corrupted plaintext', () => {
    const encoded = encryptField('do not tamper with me');
    const [iv, authTag, ciphertext] = encoded.split('.');
    const tampered = Buffer.from(ciphertext, 'base64');
    tampered[0] ^= 0xff;
    const tamperedEncoded = [iv, authTag, tampered.toString('base64')].join(
      '.',
    );

    expect(() => decryptField(tamperedEncoded)).toThrow();
  });
});
