const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** Cryptographically random ID using Web Crypto (CF Workers compatible). */
export function nanoid(size = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}
