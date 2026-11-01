import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** URL-safe random string with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** RFC 7636 S256: BASE64URL(SHA256(code_verifier)). */
export function pkceS256Challenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
}
