import {
  MediaStatus,
  MediaType,
  type MediaEntity,
} from '@app-types/media.types.js';
import type { EnvironmentVariables } from '@common/config/env.validation.js';
import { StorageService } from '@common/services/storage.service.js';
import { StorageError } from '@common/storage/storage.errors.js';
import { ALLOWED_MIME_TYPES } from '@common/storage/storage.types.js';
import { MediaRepository } from '@database/repositories/media.repository.js';
import { PostRepository } from '@database/repositories/post.repository.js';
import { PostsService } from '@modules/posts/service/posts.service.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fileTypeFromBuffer } from 'file-type';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import type {
  CompleteUploadDto,
  UploadMediaDto,
} from '../dto/media-input.dto.js';
import type {
  MediaResponseDto,
  MediaStatusResponseDto,
} from '../dto/media-response.dto.js';
import { extensionsFor, MEDIA_FOLDER, MEDIA_KIND } from '../media.constants.js';

const MB = 1024 * 1024;

/** Subset of Express.Multer.File this service relies on. */
export interface UploadedFile {
  originalname: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class MediaService {
  private readonly quotaBytes: number;
  private readonly storageDriver: string;

  constructor(
    private readonly media: MediaRepository,
    private readonly posts: PostRepository,
    private readonly postsService: PostsService,
    private readonly storage: StorageService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.quotaBytes = config.get('STORAGE_USER_QUOTA_MB', { infer: true }) * MB;
    this.storageDriver = config.get('STORAGE_DRIVER', { infer: true });
  }

  /**
   * Multipart upload. The type comes from the file's bytes, never from the
   * client: it must match `mediaType` and the file name's extension. Files
   * go through the API, so they are ready as soon as this returns.
   */
  async upload(
    ownerId: string,
    file: UploadedFile | undefined,
    input: UploadMediaDto,
  ): Promise<MediaResponseDto> {
    if (!file) {
      throw new BadRequestException(
        'Send the file as multipart/form-data field "file". Presigned ' +
          'uploads are not available with the current storage driver.',
      );
    }
    const fileName = cleanFileName(file.originalname);
    const type = input.mediaType;
    const supported = extensionsFor(type);
    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !ALLOWED_MIME_TYPES[MEDIA_KIND[type]].has(detected.mime)) {
      throw new UnsupportedMediaTypeException(
        `This file is not a supported ${type}` +
          (detected ? ` (it is ${detected.mime})` : '') +
          `. Supported: ${supported.join(', ')}`,
      );
    }
    // The name only has to be the same kind of file: a JPEG named .png is
    // fine (it is stored as .jpg), an image named .pdf is not.
    const extension = extname(fileName).slice(1).toLowerCase();
    if (!supported.includes(extension)) {
      throw new UnsupportedMediaTypeException(
        `"${fileName}" does not have a ${type} file name extension ` +
          `(${supported.join(', ')})`,
      );
    }
    const used = await this.media.totalBytesFor(ownerId);
    if (used + file.size > this.quotaBytes) {
      throw new PayloadTooLargeException(
        `Storage quota of ${this.quotaBytes / MB} MB exceeded`,
      );
    }

    // Checks type and per-kind size limit again, and picks the key.
    const stored = await this.storageCall(() =>
      this.storage.store(file.buffer, MEDIA_FOLDER[input.mediaType]),
    );
    try {
      const media = await this.media.create({
        ownerId,
        mediaType: input.mediaType,
        status: MediaStatus.Ready,
        fileName,
        mimeType: stored.mimeType,
        size: stored.size,
        storageProvider: this.storageDriver,
        storageKey: stored.key,
        checksum: createHash('sha256').update(file.buffer).digest('hex'),
        width: input.width,
        height: input.height,
        durationSeconds:
          input.mediaType === MediaType.Video
            ? input.durationSeconds
            : undefined,
      });
      return this.present(media, ownerId);
    } catch (error) {
      await this.storage.discard(stored.key);
      throw error;
    }
  }

  /**
   * Finishes a presigned upload: checks the file really is in storage
   * before leaving `pending`. Repeating it returns the current state.
   */
  async complete(
    mediaId: string,
    callerId: string,
    input: CompleteUploadDto,
  ): Promise<MediaResponseDto> {
    const media = await this.ownMedia(mediaId, callerId);
    if (media.status !== MediaStatus.Pending) {
      return this.present(media, callerId);
    }
    const exists = await this.storageCall(() =>
      this.storage.exists(media.storageKey),
    );
    if (!exists) {
      throw new ConflictException('The file has not been uploaded yet');
    }
    const updated = await this.media.markUploaded(
      mediaId,
      callerId,
      MediaStatus.Ready,
      input.checksum?.toLowerCase(),
    );
    // Null when a concurrent complete got there first.
    return this.present(
      updated ?? (await this.ownMedia(mediaId, callerId)),
      callerId,
    );
  }

  async findOne(mediaId: string, callerId: string): Promise<MediaResponseDto> {
    return this.present(await this.viewableMedia(mediaId, callerId), callerId);
  }

  async status(
    mediaId: string,
    callerId: string,
  ): Promise<MediaStatusResponseDto> {
    const media = await this.viewableMedia(mediaId, callerId);
    return { status: media.status, failureReason: media.failureReason ?? null };
  }

  /** Owner only, and only while no active post shows it. */
  async remove(mediaId: string, callerId: string): Promise<void> {
    const media = await this.ownMedia(mediaId, callerId);
    if (await this.posts.isMediaAttachedElsewhere([media.id])) {
      throw new ConflictException(
        'This media is used by a post; remove it from the post first',
      );
    }
    await this.media.softDelete(mediaId, callerId);
    // The record is gone either way; a leftover file is only wasted space.
    await this.storage.discard(media.storageKey);
    if (media.thumbnailKey) {
      await this.storage.discard(media.thumbnailKey);
    }
  }

  /** The owner always; others only through a post they may see. */
  private async viewableMedia(
    mediaId: string,
    callerId: string,
  ): Promise<MediaEntity> {
    const media = await this.media.findActiveById(mediaId);
    if (!media) {
      throw new NotFoundException('Media not found');
    }
    if (media.ownerId === callerId) {
      return media;
    }
    for (const post of await this.posts.findActiveByMediaId(media.id)) {
      if (await this.postsService.canView(post, callerId)) {
        return media;
      }
    }
    throw new NotFoundException('Media not found');
  }

  private async ownMedia(
    mediaId: string,
    callerId: string,
  ): Promise<MediaEntity> {
    const media = await this.viewableMedia(mediaId, callerId);
    if (media.ownerId !== callerId) {
      throw new ForbiddenException('Only the uploader can change this media');
    }
    return media;
  }

  private present(media: MediaEntity, callerId: string): MediaResponseDto {
    const ready = media.status === MediaStatus.Ready;
    return {
      id: media.id,
      mediaType: media.mediaType,
      fileName: media.fileName,
      mimeType: media.mimeType,
      size: media.size,
      status: media.status,
      fileUrl: ready ? this.storage.getUrl(media.storageKey) : null,
      thumbnailUrl:
        ready && media.thumbnailKey
          ? this.storage.getUrl(media.thumbnailKey)
          : null,
      width: media.width ?? null,
      height: media.height ?? null,
      durationSeconds: media.durationSeconds ?? null,
      failureReason: media.failureReason ?? null,
      isMine: media.ownerId === callerId,
      createdAt: media.createdAt,
    };
  }

  // Provider errors are logged by StorageService; clients get a plain 503.
  private async storageCall<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof StorageError) {
        throw new ServiceUnavailableException(
          'File storage is unavailable, please try again later',
        );
      }
      throw error;
    }
  }
}

/**
 * Display name only (never used as a storage key): path parts and control
 * characters removed. Multer reads names as latin1; browsers send UTF-8.
 */
function cleanFileName(original: string): string {
  const utf8 = Buffer.from(original, 'latin1').toString('utf8');
  const name = (utf8.split(/[\\/]/).pop() ?? '')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(-255);
  if (!name || !extname(name)) {
    throw new BadRequestException('The file needs a name with an extension');
  }
  return name;
}
