import {
  MediaStatus,
  MediaType,
  MediaVariant,
} from '@app-types/media.types.js';
import { PostVisibility } from '@app-types/post.types.js';
import type { Connection } from 'mongoose';
import { DEV_USER_ID } from './profiles.seed.js';

interface SamplePost {
  authorId: string;
  caption: string;
  visibility: PostVisibility;
  /** File names under `seed/images/`. */
  images: string[];
  hoursAgo: number;
}

export const SAMPLE_POSTS: SamplePost[] = [
  {
    authorId: '5001',
    caption: 'Just finished this mahogany dining table. 8 seats, solid wood.',
    visibility: PostVisibility.Public,
    images: ['kofi-table-1.svg', 'kofi-table-2.svg'],
    hoursAgo: 2,
  },
  {
    authorId: '5001',
    caption: 'Workshop update for followers: new tools arrived!',
    visibility: PostVisibility.Followers,
    images: ['kofi-workshop.svg'],
    hoursAgo: 20,
  },
  {
    authorId: '5002',
    caption: 'New kente-inspired collection, available next week.',
    visibility: PostVisibility.Public,
    images: ['akosua-collection.svg'],
    hoursAgo: 5,
  },
  {
    authorId: '5003',
    caption: 'Solar install in East Legon. 5kW, fully off-grid.',
    visibility: PostVisibility.Public,
    images: ['yaw-solar.svg'],
    hoursAgo: 9,
  },
  {
    authorId: '5004',
    caption: 'Three-tier wedding cake for Saturday.',
    visibility: PostVisibility.Public,
    images: ['efua-cake.svg'],
    hoursAgo: 30,
  },
];

/** Ready, unattached uploads of the dev user, for trying POST /posts. */
export const DEV_USER_UPLOADS = [
  'dev-upload-1.svg',
  'dev-upload-2.svg',
  'dev-upload-3.svg',
  'dev-upload-4.svg',
];

const imageKey = (file: string) => `seed/images/${file}`;

/**
 * Upserts media (by storageKey) and posts (by author + idempotency key), so
 * re-running never duplicates. Image files live at FTP_ROOT_PATH/seed/images.
 */
export async function seedPosts(connection: Connection): Promise<string> {
  const media = connection.collection('media');
  const posts = connection.collection('posts');
  const now = Date.now();

  const uploads = [
    ...SAMPLE_POSTS.flatMap((post) =>
      post.images.map((file) => ({ ownerId: post.authorId, file })),
    ),
    ...DEV_USER_UPLOADS.map((file) => ({ ownerId: DEV_USER_ID, file })),
  ];
  await media.bulkWrite(
    uploads.map(({ ownerId, file }) => ({
      updateOne: {
        filter: { storageKey: imageKey(file) },
        update: {
          $set: {
            ownerId,
            mediaType: MediaType.Image,
            status: MediaStatus.Ready,
            variant: MediaVariant.Original,
            fileName: file,
            mimeType: 'image/svg+xml',
            size: 600,
            storageProvider: 'ftp',
            width: 1080,
            height: 1080,
            updatedAt: new Date(now),
          },
          $unset: { deletedAt: '' },
          $setOnInsert: { createdAt: new Date(now) },
        },
        upsert: true,
      },
    })),
  );

  const mediaDocs = await media
    .find({ storageKey: { $in: uploads.map(({ file }) => imageKey(file)) } })
    .toArray();
  const mediaIdByKey = new Map(
    mediaDocs.map((doc) => [doc.storageKey as string, doc._id]),
  );

  await posts.bulkWrite(
    SAMPLE_POSTS.map((post, index) => {
      const createdAt = new Date(now - post.hoursAgo * 60 * 60 * 1000);
      return {
        updateOne: {
          filter: {
            authorId: post.authorId,
            idempotencyKey: `seed-post-${index + 1}`,
          },
          update: {
            $set: {
              caption: post.caption,
              visibility: post.visibility,
              attachments: post.images.map((file, sortOrder) => ({
                mediaId: mediaIdByKey.get(imageKey(file)),
                mediaType: MediaType.Image,
                sortOrder,
              })),
              mediaTypes: [MediaType.Image],
              createdAt,
              updatedAt: createdAt,
            },
            $unset: { deletedAt: '' },
            $setOnInsert: { likesCount: 0, commentsCount: 0, sharesCount: 0 },
          },
          upsert: true,
        },
      };
    }),
  );

  const devMediaIds = DEV_USER_UPLOADS.map((file) =>
    String(mediaIdByKey.get(imageKey(file))),
  );
  return [
    `Posts: ${SAMPLE_POSTS.length} sample posts`,
    `Media of dev user ${DEV_USER_ID}, ready for POST /posts:`,
    ...devMediaIds.map((id) => `  ${id}`),
  ].join('\n');
}
