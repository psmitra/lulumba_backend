/**
 * The storage backend failed (connection, transfer, permissions). The
 * original provider error is kept as `cause` for logs; the message is safe
 * to surface and never contains credentials.
 */
export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
  }
}

/** A storage key that is malformed or tries to escape its folder. */
export class InvalidStorageKeyError extends Error {
  constructor() {
    super('Invalid storage key');
    this.name = 'InvalidStorageKeyError';
  }
}

// Relative path of safe segments, each starting with a letter or digit, so
// `..`, `.`, empty segments, absolute paths and backslashes are impossible.
const KEY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
const MAX_KEY_LENGTH = 512;

export function assertValidStorageKey(key: string): void {
  if (key.length > MAX_KEY_LENGTH || !KEY_PATTERN.test(key)) {
    throw new InvalidStorageKeyError();
  }
}
