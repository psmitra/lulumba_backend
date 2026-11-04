import { MediaType } from '@app-types/media.types.js';

/**
 * Whether one post may mix photos, videos and documents. Still to be
 * confirmed by product; flip to false to require a single media type.
 */
export const ALLOW_MIXED_MEDIA_TYPES = true;

/** `?type=` values of GET /posts, as the app names them. */
export enum PostTypeFilter {
  Photo = 'photo',
  Video = 'video',
  Document = 'document',
}

export const MEDIA_TYPE_FOR_FILTER: Record<PostTypeFilter, MediaType> = {
  [PostTypeFilter.Photo]: MediaType.Image,
  [PostTypeFilter.Video]: MediaType.Video,
  [PostTypeFilter.Document]: MediaType.Document,
};
