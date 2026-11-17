import { assertValidStorageKey } from './storage.errors.js';

/**
 * `<baseUrl>/<key>` with each key segment URL-encoded, or null when the
 * backend has no public URL configured. Shared by every provider.
 */
export function publicUrl(
  baseUrl: string | undefined,
  key: string,
): string | null {
  assertValidStorageKey(key);
  if (!baseUrl) {
    return null;
  }
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl}/${encoded}`;
}
