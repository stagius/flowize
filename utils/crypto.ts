/**
 * Client-side encryption utility for sensitive data
 * Uses Web Crypto API with AES-GCM encryption
 * 
 * Note: This provides obfuscation against casual inspection of localStorage,
 * but is NOT secure against determined attackers with access to the client code.
 * The encryption key is derived from browser fingerprint + static salt.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT = 'flowize-v1'; // Static salt for key derivation

/**
 * Generate a consistent encryption key based on browser fingerprint
 * This allows decryption without storing the key, but keys differ per browser
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  // Create a fingerprint from various browser properties
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    new Date().getTimezoneOffset().toString(),
    screen.colorDepth.toString(),
    screen.width.toString(),
    screen.height.toString(),
    SALT
  ].join('|');

  // Hash the fingerprint to create key material
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Import as a CryptoKey
  return crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a string value
 * Returns base64-encoded ciphertext with IV prepended
 */
export async function encrypt(plaintext: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encrypt
    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      data
    );

    // Combine IV + ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // Encode as base64
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt a base64-encoded ciphertext
 * Returns the original plaintext string
 */
export async function decrypt(ciphertext: string): Promise<string> {
  try {
    const key = await getEncryptionKey();

    // Decode from base64
    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

    // Extract IV and ciphertext
    const iv = combined.slice(0, IV_LENGTH);
    const data = combined.slice(IV_LENGTH);

    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      data
    );

    // Decode as string
    const decoder = new TextDecoder();
    return decoder.decode(plaintext);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Check if a string appears to be encrypted (base64 format)
 */
export function isEncrypted(value: string): boolean {
  // Basic check for base64 format
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return base64Regex.test(value) && value.length > 20;
}
