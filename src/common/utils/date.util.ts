export function nowIso(): string {
  return new Date().toISOString();
}

/** Serialises an optional date for API output; keeps `null` explicit. */
export function toIsoStringOrNull(
  date: Date | null | undefined,
): string | null {
  return date ? date.toISOString() : null;
}
