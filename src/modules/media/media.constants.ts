import { MediaType } from '@app-types/media.types.js';
import {
  ALLOWED_MIME_TYPES,
  FileKind,
  StorageFolder,
} from '@common/storage/storage.types.js';

/** Where each declared media type is stored. */
export const MEDIA_FOLDER: Record<MediaType, StorageFolder> = {
  [MediaType.Image]: StorageFolder.PostImages,
  [MediaType.Video]: StorageFolder.PostVideos,
  [MediaType.Document]: StorageFolder.PostDocuments,
};

/** The storage file kind each declared media type must be. */
export const MEDIA_KIND: Record<MediaType, FileKind> = {
  [MediaType.Image]: FileKind.Image,
  [MediaType.Video]: FileKind.Video,
  [MediaType.Document]: FileKind.Document,
};

/**
 * File name extensions for each accepted content type. The type itself
 * always comes from the file's bytes; the name only has to be a file of the
 * same kind (a JPEG saved as `photo.png` is fine, `photo.pdf` is not).
 */
export const EXTENSIONS_FOR_MIME: Record<string, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg', 'jpe', 'jfif', 'pjpeg', 'pjp'],
  'image/png': ['png'],
  'image/apng': ['apng', 'png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/avif': ['avif'],
  // iPhones save both as .heic; file-type reports either depending on brand.
  'image/heic': ['heic', 'heif', 'hif'],
  'image/heif': ['heif', 'heic', 'hif'],
  'image/jxl': ['jxl'],
  'image/bmp': ['bmp', 'dib'],
  'image/tiff': ['tif', 'tiff'],
  'video/mp4': ['mp4', 'm4v'],
  'video/webm': ['webm'],
  'video/quicktime': ['mov', 'qt'],
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    'docx',
  ],
};

/** Every file name extension accepted for a media type, e.g. image → jpg, png... */
export function extensionsFor(type: MediaType): readonly string[] {
  const mimes = [...ALLOWED_MIME_TYPES[MEDIA_KIND[type]]];
  return [...new Set(mimes.flatMap((mime) => EXTENSIONS_FOR_MIME[mime] ?? []))];
}
