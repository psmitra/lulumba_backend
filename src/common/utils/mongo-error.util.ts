import { mongo } from 'mongoose';

const DUPLICATE_KEY_ERROR_CODE = 11000;

export function isDuplicateKeyError(
  error: unknown,
): error is mongo.MongoServerError {
  return (
    error instanceof mongo.MongoServerError &&
    error.code === DUPLICATE_KEY_ERROR_CODE
  );
}

/** Field names only - the offending values may be personal data. */
export function getDuplicateKeyFields(error: mongo.MongoServerError): string[] {
  const keyValue: unknown = error.keyValue;
  if (keyValue && typeof keyValue === 'object') {
    return Object.keys(keyValue);
  }
  return [];
}
