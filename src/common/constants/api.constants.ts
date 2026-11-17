/** Every route is served under /api/v<version>, e.g. /api/v1/posts. */
export const API_PREFIX = 'api';
export const API_DEFAULT_VERSION = '1';

/** Base path of the default version, for cookie paths and docs. */
export const API_BASE_PATH = `/${API_PREFIX}/v${API_DEFAULT_VERSION}`;

/** Infrastructure routes left at the root (load balancer / uptime probes). */
export const API_PREFIX_EXCLUDE = ['health'];
