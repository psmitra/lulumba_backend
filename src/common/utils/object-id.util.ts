const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Strict check for a 24-char hex ObjectId string.
 *
 * Deliberately stricter than mongoose's `Types.ObjectId.isValid`, which also
 * accepts any 12-character string (e.g. "aaaaaaaaaaaa").
 */
export function isValidObjectId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}
