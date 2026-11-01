import { Transform } from 'class-transformer';

/** Trims string input; other types pass through for the validators to reject. */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

/** Trims and lower-cases string input (usernames, emails). */
export function TrimLowercase(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
}

/** Parses "true"/"false" query-string values into booleans. */
export function ToBoolean(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  });
}
