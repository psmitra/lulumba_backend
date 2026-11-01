# Storage (core)

One `StorageService` for every file Lulumba stores: avatars, post media,
stories, message attachments and thumbnails. The backend is picked by
`STORAGE_DRIVER`. Business code never knows which one it is.

Only FTP/FTPS is implemented today.

## 1. Architecture

```
.env ──> common/config/storage.config.ts ──> StorageConfig { driver, ftp: {...} }
                                                   │
business module ──> StorageService ──> STORAGE_PROVIDER (StorageProvider interface)
                    (file checks,                  │
                     key generation,               └─ FtpStorageProvider  (driver = ftp)
                     error handling)                   └─ basic-ftp
```

| File | Role |
|---|---|
| `common/config/storage.config.ts` | Reads `STORAGE_DRIVER` and that driver's credentials from env, validates them, builds `StorageConfig` |
| `common/services/storage.service.ts` | **What you use**: type/size checks, key generation, consistent errors |
| `common/storage/storage.module.ts` | Wires config → provider → `StorageService` (global) |
| `common/storage/storage.factory.ts` | `StorageConfig` → provider instance |
| `common/storage/interfaces/storage-provider.interface.ts` | The contract every backend implements |
| `common/storage/providers/ftp/` | FTP implementation |
| `common/storage/storage.types.ts` | `StorageResult`, folders, which file kinds each folder accepts |
| `common/storage/storage.errors.ts` | `StorageError`, `InvalidStorageKeyError`, key validation |

`StorageModule` is global, so any module can inject `StorageService`.
MongoDB stores only the **key** (and URL if needed), never file contents.

## 2. The provider interface

```ts
export interface StorageProvider {
  upload(file: Buffer, key: string, mimeType: string): Promise<StorageResult>;
  delete(key: string): Promise<void>;       // succeeds if already gone
  exists(key: string): Promise<boolean>;
  getUrl(key: string): string | null;       // null = no public URL configured
}
```

Keys are relative paths such as `posts/images/2026/11/<uuid>.webp`. Each
segment must start with a letter or digit, so `..`, absolute paths and
backslashes are rejected before any provider is called.

## 3. FTP configuration

```env
STORAGE_DRIVER=ftp

FTP_HOST=ftp.example.com
FTP_PORT=21
FTP_USERNAME=lulumba
FTP_PASSWORD=********
FTP_SECURE=true            # false | true (explicit FTPS) | implicit (usually port 990)
FTP_TIMEOUT=30000          # ms
FTP_ROOT_PATH=/lulumba     # absolute remote directory for all files
FTP_MAX_CONNECTIONS=4      # simultaneous connections
FTP_PUBLIC_BASE_URL=https://cdn.example.com/lulumba

STORAGE_MAX_IMAGE_MB=10
STORAGE_MAX_VIDEO_MB=200
STORAGE_MAX_DOCUMENT_MB=20
```

All values are validated at startup. A missing host, a bad port, an unknown
`FTP_SECURE` or a relative or `..` root path stops the app with a message that
names the variable and never prints its value.

How the provider behaves:

- **One connection per operation, capped.** A basic-ftp client runs one command at a time, so concurrent uploads each get their own connection. At most `FTP_MAX_CONNECTIONS` are open; the rest wait their turn. Connections are always closed, including on errors.
- **Atomic uploads.** Files are written as `.<name>.<uuid>.part` and renamed into place. A failed transfer is removed and never appears under the real key.
- **Directories** under the root are created as needed.
- **FTPS** verifies the server certificate against `FTP_HOST`.

## 4. Public URLs

FTP only stores files; it does not make them reachable over HTTP. If a web
server or CDN serves `FTP_ROOT_PATH`, set `FTP_PUBLIC_BASE_URL` to the URL of
that directory:

```
FTP_ROOT_PATH=/lulumba
FTP_PUBLIC_BASE_URL=https://cdn.example.com/lulumba
key  posts/images/2026/11/abc.webp
url  https://cdn.example.com/lulumba/posts/images/2026/11/abc.webp
```

Without `FTP_PUBLIC_BASE_URL`, `getUrl()` returns `null` and
`StorageResult.url` is `null`. The service never guesses a URL. Anything under
a public base URL is public, so private files (e.g. message attachments
restricted to participants) need a non-public location or an
authorization-checking download endpoint.

## 5. Using StorageService

```ts
import { StorageService } from '@common/services/storage.service.js';
import { StorageFolder } from '@common/storage/storage.types.js';

@Injectable()
export class PostMediaService {
  constructor(
    private readonly storage: StorageService,
    @InjectModel(Media.name) private readonly mediaModel: Model<Media>,
  ) {}

  async uploadImage(ownerId: string, file: Express.Multer.File) {
    // Type is detected from the bytes; name and client MIME type are ignored.
    const stored = await this.storage.store(file.buffer, StorageFolder.PostImages);

    try {
      return await this.mediaModel.create({
        ownerId,
        storageKey: stored.key,
        mimeType: stored.mimeType,
        size: stored.size,
        // ...
      });
    } catch (error) {
      // Saving the record failed: remove the file so nothing is orphaned.
      await this.storage.discard(stored.key);
      throw error;
    }
  }

  async remove(media: { storageKey: string }) {
    await this.storage.delete(media.storageKey); // idempotent
  }
}
```

| Method | Use for |
|---|---|
| `store(buffer, folder)` | **User uploads.** Checks the real type against the folder, enforces size limits, generates `<folder>/<yyyy>/<mm>/<uuid>.<ext>` |
| `upload(buffer, key, mimeType)` | Server-generated files with a known type and key (thumbnails, transcodes) |
| `delete(key)` | Removing a file; succeeds if it is already gone |
| `discard(key)` | Cleanup that must never throw (failures are logged) |
| `exists(key)` | Checking presence |
| `getUrl(key)` | Public URL or `null` |

Errors:

- `UnsupportedMediaTypeException` (415): the type is not allowed in that folder or wasn't recognized.
- `PayloadTooLargeException` (413): the file is over the limit.
- `BadRequestException` (400): the file is empty.
- `StorageError` (500): the backend failed. Details are logged; the message is generic.
- `InvalidStorageKeyError`: an unsafe key, which is a programming error.

Folders and accepted kinds are in `storage.types.ts` (`FOLDER_KINDS`):
images are JPEG/PNG/WebP/GIF, videos MP4/WebM/QuickTime, documents PDF/DOCX.
Media pipelines (image resizing, transcoding, thumbnails, background jobs)
read the original by key and write derivatives with `upload()`, e.g. into
`StorageFolder.Thumbnails`.

## 6. Switching providers

Set `STORAGE_DRIVER` to another implemented driver and supply its settings.
Business code doesn't change, because it only uses `StorageService` and stored
keys. Existing files are not moved automatically; copy them to the new
backend under the same keys.

## 7. Adding a provider (e.g. SFTP or S3)

1. Add the value to `StorageDriver` in `src/common/enums/storage-driver.enum.ts`.
2. In `common/config/storage.config.ts`, add its settings (validated like `FtpEnvironment`), a member of the `StorageConfig` union and a `case` in `loadStorageConfig()`.
3. Create `common/storage/providers/<name>/<name>-storage.provider.ts` implementing `StorageProvider`. Call `assertValidStorageKey` and map "not found" to `delete` success and `exists` false.
4. Add a `case` in `common/storage/storage.factory.ts`.
5. Add unit tests with the client mocked, as in `ftp-storage.provider.spec.ts`.

```ts
// common/config/storage.config.ts
export type StorageConfig =
  | { driver: StorageDriver.Ftp; ftp: FtpStorageConfig }
  | { driver: StorageDriver.S3; s3: S3StorageConfig };

case StorageDriver.S3:
  return { driver, s3: loadS3Config(read) };

// common/storage/storage.factory.ts
case StorageDriver.S3:
  return new S3StorageProvider(config.s3);
```

## 8. FTP vs FTPS vs SFTP

| | Protocol | Encryption | Default port | Here |
|---|---|---|---|---|
| FTP | FTP | none: credentials and files in clear text | 21 | `FTP_SECURE=false` |
| FTPS (explicit) | FTP + `AUTH TLS` | TLS | 21 | `FTP_SECURE=true` |
| FTPS (implicit) | FTP inside TLS | TLS | 990 | `FTP_SECURE=implicit` |
| SFTP | SSH file transfer | SSH | 22 | **not supported**; needs its own provider |

Use FTPS whenever the server supports it. Plain FTP sends the password
unencrypted.

## 9. Security

- The file type is detected from the content (`file-type`), so client MIME types, extensions and file names are never trusted. Executables or unknown data are rejected.
- File names are random UUIDs, so they're unguessable and can't carry user input into paths.
- Keys are validated in the service and again in the provider; the provider also checks the resolved path stays under `FTP_ROOT_PATH`.
- Size limits are set per kind (`STORAGE_MAX_*_MB`). Also set a request body or multer limit on upload routes so oversized uploads are rejected before they are buffered.
- Credentials are only read from env. Errors and logs never include them.
- Upload authorization (who may upload where) belongs in the calling module. The storage module only stores.
- Writes are atomic (temp file plus rename). Use `discard()` to compensate when the database write fails after an upload.

## 10. Tests

```bash
npm test -- storage                    # unit tests, FTP client mocked
```

Optional integration test against a real server (use a throwaway directory):

```bash
FTP_TEST_HOST=ftp.example.com FTP_TEST_USERNAME=u FTP_TEST_PASSWORD=p \
FTP_TEST_SECURE=true FTP_TEST_ROOT_PATH=/lulumba-test \
npm run test:e2e -- test/ftp-storage.e2e-spec.ts
```

It is skipped when `FTP_TEST_HOST` is not set.
