const SENSITIVE_KEY_PATTERN =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential/i;

export const REDACTED = '[REDACTED]';

/**
 * Returns a shallow copy without keys whose value is `undefined`.
 *
 * DTO instances declare every optional field as an own property (ES2022 class
 * fields), so without this a PATCH would write `undefined` over stored values.
 */
export function omitUndefined<T extends object>(value: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(value) as (keyof T)[]) {
    if (value[key] !== undefined) {
      result[key] = value[key];
    }
  }
  return result;
}

/** Deep-copies plain data with sensitive-looking keys masked. Safe for logs. */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }
  if (value instanceof Date || value instanceof Error) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? REDACTED
      : redactSensitive(entry, depth + 1);
  }
  return result;
}
