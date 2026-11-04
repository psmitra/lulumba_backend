import { isValidObjectId } from '@common/utils/object-id.util.js';
import { BadRequestException } from '@nestjs/common';

/** Position in a ranked feed: a snapshot and how many posts were served. */
export interface RankedPosition {
  snapshotId: string;
  offset: number;
}

const PREFIX = 'r';

/** Opaque to clients: base64url of `r|<snapshot id>|<offset>`. */
export function encodeRankedCursor({
  snapshotId,
  offset,
}: RankedPosition): string {
  return Buffer.from(`${PREFIX}|${snapshotId}|${offset}`).toString('base64url');
}

/** `?cursor=` of a ranked feed: undefined for the first page, 400 if forged. */
export function parseRankedCursor(
  cursor: string | undefined,
): RankedPosition | undefined {
  if (!cursor) return undefined;
  const [prefix, snapshotId, offset, ...rest] = Buffer.from(cursor, 'base64url')
    .toString('utf8')
    .split('|');
  const position = /^\d{1,6}$/.test(offset ?? '') ? Number(offset) : NaN;
  if (
    prefix !== PREFIX ||
    rest.length > 0 ||
    !isValidObjectId(snapshotId) ||
    Number.isNaN(position)
  ) {
    throw new BadRequestException('Invalid cursor');
  }
  return { snapshotId, offset: position };
}
