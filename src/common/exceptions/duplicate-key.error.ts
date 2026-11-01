/**
 * Persistence-level error raised when a unique constraint is violated.
 *
 * Not an HttpException on purpose: repositories stay transport-agnostic.
 * Services translate it into a business error; AllExceptionsFilter maps any
 * that escape to 409 Conflict.
 */
export class DuplicateKeyError extends Error {
  constructor(readonly fields: string[]) {
    super(
      fields.length > 0
        ? `Duplicate value for unique field(s): ${fields.join(', ')}`
        : 'Duplicate value for a unique field',
    );
    this.name = 'DuplicateKeyError';
  }
}
