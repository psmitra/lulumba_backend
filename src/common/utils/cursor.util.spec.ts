import { decodeCursor, encodeCursor } from './cursor.util.js';

describe('cursor', () => {
  it('round-trips a position', () => {
    const position = {
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
      id: '665f1c2e8b3a4d0012ab34cd',
    };
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it('rejects cursors it did not issue', () => {
    const encode = (raw: string) => Buffer.from(raw).toString('base64url');
    expect(decodeCursor('not-a-cursor')).toBeNull();
    expect(decodeCursor(encode('2026-11-01T10:00:00.000Z|nope'))).toBeNull();
    expect(
      decodeCursor(encode('yesterday|665f1c2e8b3a4d0012ab34cd')),
    ).toBeNull();
    expect(
      decodeCursor(
        encode('2026-11-01T10:00:00.000Z|665f1c2e8b3a4d0012ab34cd|x'),
      ),
    ).toBeNull();
  });
});
