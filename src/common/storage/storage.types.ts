export interface StorageResult {
  key: string;
  /** Null when no public base URL is configured. */
  url: string | null;
  size: number;
  mimeType: string;
}

/** Top-level layout of stored files. Keys become `<folder>/<yyyy>/<mm>/<uuid>.<ext>`. */
export enum StorageFolder {
  ProfileAvatars = 'profiles/avatars',
  ProfileCovers = 'profiles/covers',
  PostImages = 'posts/images',
  PostVideos = 'posts/videos',
  PostDocuments = 'posts/documents',
  Stories = 'stories',
  Reels = 'reels',
  MessageImages = 'messages/images',
  MessageAttachments = 'messages/attachments',
  Thumbnails = 'thumbnails',
}

export enum FileKind {
  Image = 'image',
  Video = 'video',
  Document = 'document',
}

/** Content types accepted per kind, as detected from the file's bytes. */
export const ALLOWED_MIME_TYPES: Record<FileKind, ReadonlySet<string>> = {
  [FileKind.Image]: new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]),
  [FileKind.Video]: new Set(['video/mp4', 'video/webm', 'video/quicktime']),
  [FileKind.Document]: new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
};

/** Which kinds of file each folder accepts. */
export const FOLDER_KINDS: Record<StorageFolder, readonly FileKind[]> = {
  [StorageFolder.ProfileAvatars]: [FileKind.Image],
  [StorageFolder.ProfileCovers]: [FileKind.Image],
  [StorageFolder.PostImages]: [FileKind.Image],
  [StorageFolder.PostVideos]: [FileKind.Video],
  [StorageFolder.PostDocuments]: [FileKind.Document],
  [StorageFolder.Stories]: [FileKind.Image, FileKind.Video],
  [StorageFolder.Reels]: [FileKind.Video],
  [StorageFolder.MessageImages]: [FileKind.Image],
  [StorageFolder.MessageAttachments]: [
    FileKind.Image,
    FileKind.Video,
    FileKind.Document,
  ],
  [StorageFolder.Thumbnails]: [FileKind.Image],
};
