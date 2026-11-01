import type { Request } from 'express';

/** The caller, taken only from a verified access token. */
export interface AuthContext {
  /** GhanaWorks user id (`sub`). */
  externalUserId: string;
  profileId: string;
  /** The bearer token, for calls back to GhanaWorks on the user's behalf. */
  accessToken: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}
