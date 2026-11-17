/** Storage backends with an implemented provider (see common/storage). */
export enum StorageDriver {
  Ftp = 'ftp',
  /** A directory on this machine. For development or a single server. */
  Local = 'local',
}
