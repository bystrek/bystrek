import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ENCRYPTION_KEY } from '../env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

// Tier-2 field encryption (architecture.md): protects sensitive columns
// against DB-only exposure while staying readable by the backend, which
// decrypts before ever calling Claude. iv/authTag/ciphertext are each
// base64-encoded and joined with '.' into one column value.
export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join('.');
}

export function decryptField(encoded: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encoded.split('.');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('malformed encrypted field value');
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    ENCRYPTION_KEY,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
