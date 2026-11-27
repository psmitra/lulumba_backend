/** Storage backends with an implemented provider (see common/storage). */
export enum StorageDriver {
  Ftp = 'ftp',
  /** A directory on this machine. For development or a single server. */
  Local = 'local',
  /** Amazon S3 or an S3-compatible server (Garage, MinIO, R2, ...). */
  S3 = 's3',
}
