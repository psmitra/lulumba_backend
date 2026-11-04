export const IS_PUBLIC_KEY = 'auth:isPublic';
export const IS_OPTIONAL_AUTH_KEY = 'auth:isOptional';

/**
 * Required on POST /auth/refresh. A cross-origin page can only send it after
 * a CORS preflight, which only FRONTEND_URL passes.
 */
export const CSRF_HEADER = 'x-csrf-protection';

/** GhanaWorks refresh token. HttpOnly; React never sees it. */
export const REFRESH_COOKIE = {
  name: 'lulumba_rt',
  path: '/auth',
  sameSite: 'strict',
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
} as const;

/**
 * OAuth `state` and PKCE verifier between /auth/login and /auth/callback.
 * SameSite=Lax: the callback is a top-level redirect from GhanaWorks.
 */
export const OAUTH_COOKIE = {
  name: 'lulumba_oauth',
  path: '/auth/callback',
  sameSite: 'lax',
  maxAgeMs: 10 * 60 * 1000,
} as const;
