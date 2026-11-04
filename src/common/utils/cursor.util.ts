import { BadRequestException } from '@nestjs/common';
import type { CursorMeta } from '../response/response.interface.js';
import { isValidObjectId } from './object-id.util.js';

/** Position in a `createdAt desc, _id desc` list: the last item seen. */
export interface CursorPosition {
  createdAt: Date;
  id: string;
}

/** Opaque to clients: base64url of `<ISO date>|<ObjectId>`. */
export function encodeCursor({ createdAt, id }: CursorPosition): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

/** Resolves to null for anything that isn't a cursor we issued. */
export function decodeCursor(cursor: string): CursorPosition | null {
  const [date, id, ...rest] = Buffer.from(cursor, 'base64url')
    .toString('utf8')
    .split('|');
  const createdAt = new Date(date ?? '');
  if (rest.length > 0 || Number.isNaN(createdAt.getTime())) {
    return null;
  }
  return isValidObjectId(id) ? { createdAt, id } : null;
}

/** `?cursor=` as a position: undefined for the first page, 400 if forged. */
export function parseCursorQuery(
  cursor: string | undefined,
): CursorPosition | undefined {
  if (!cursor) return undefined;
  const position = decodeCursor(cursor);
  if (!position) {
    throw new BadRequestException('Invalid cursor');
  }
  return position;
}

/**
 * Meta for a page from `findCursorPage`. Pass the raw page (before any
 * filtering of items), so hidden items never end the list early.
 */
export function cursorMeta(
  page: { items: CursorPosition[]; hasMore: boolean },
  limit: number,
): CursorMeta {
  const last = page.items.at(-1);
  return {
    limit,
    nextCursor:
      page.hasMore && last
        ? encodeCursor({ createdAt: last.createdAt, id: last.id })
        : null,
    hasMore: page.hasMore,
  };
}
