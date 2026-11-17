import { MediaType } from '@app-types/media.types.js';
import { ALLOWED_MIME_TYPES } from '@common/storage/storage.types.js';
import { describe, expect, it } from 'vitest';
import {
  EXTENSIONS_FOR_MIME,
  extensionsFor,
  MEDIA_KIND,
} from './media.constants.js';

describe('media constants', () => {
  it.each(Object.values(MediaType))(
    'gives every accepted %s type at least one file extension',
    (type) => {
      for (const mime of ALLOWED_MIME_TYPES[MEDIA_KIND[type]]) {
        expect(EXTENSIONS_FOR_MIME[mime], mime).not.toHaveLength(0);
      }
    },
  );

  it('accepts everyday photo formats, including iPhone HEIC', () => {
    expect(extensionsFor(MediaType.Image)).toEqual(
      expect.arrayContaining([
        'jpg',
        'jpeg',
        'png',
        'gif',
        'webp',
        'avif',
        'heic',
        'heif',
        'bmp',
        'tif',
        'tiff',
      ]),
    );
  });

  it('never accepts SVG or a name of another kind', () => {
    expect(extensionsFor(MediaType.Image)).not.toContain('svg');
    expect(extensionsFor(MediaType.Image)).not.toContain('pdf');
    expect(extensionsFor(MediaType.Document)).not.toContain('png');
  });
});
