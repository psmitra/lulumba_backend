import { MediaType } from '@app-types/media.types.js';
import { StorageFolder } from '@common/storage/storage.types.js';

/** Where each declared media type is stored. */
export const MEDIA_FOLDER: Record<MediaType, StorageFolder> = {
  [MediaType.Image]: StorageFolder.PostImages,
  [MediaType.Video]: StorageFolder.PostVideos,
  [MediaType.Document]: StorageFolder.PostDocuments,
};

/**
 * File name extensions accepted for each detected content type. The type
 * itself always comes from the file's bytes; the name must agree with it.
 */
export const EXTENSIONS_FOR_MIME: Record<string, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg', 'jfif'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'video/mp4': ['mp4', 'm4v'],
  'video/webm': ['webm'],
  'video/quicktime': ['mov', 'qt'],
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    'docx',
  ],
};
