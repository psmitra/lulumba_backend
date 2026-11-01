import type { GhanaWorksUser } from '../ghanaworks/ghanaworks.client.js';

/**
 * The user behind DEV_AUTH_TOKEN, shaped like GhanaWorks /api/v1/auth/me.
 * Lets the team build and test APIs before GhanaWorks SSO is reachable.
 */
export const DEV_USER: GhanaWorksUser = {
  id: 1024,
  account_type: 'user',
  first_name: 'Ama',
  last_name: 'Mensah',
  name: 'Ama Mensah',
  email: 'ama@example.com',
  image_url: null,
  status: 'active',
};
