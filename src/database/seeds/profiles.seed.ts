import type { Profile } from '../schemas/profile.schema.js';

type SampleProfile = Pick<
  Profile,
  'externalUserId' | 'username' | 'displayName' | 'avatarUrl' | 'bio'
>;

/** The user behind DEV_AUTH_TOKEN (see modules/auth/dev/dev-user.ts). */
export const DEV_USER_ID = '1024';

const avatar = (name: string) =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`;

/**
 * Sample users for local testing (follow, feeds...). Ids start at 5001 so
 * they never clash with the dev user (1024) or real GhanaWorks ids in use.
 * They can't sign in; act on them as the dev user.
 */
export const SAMPLE_PROFILES: SampleProfile[] = [
  {
    externalUserId: '5001',
    username: 'kofi.asante',
    displayName: 'Kofi Asante',
    avatarUrl: avatar('Kofi Asante'),
    bio: 'Carpenter in Kumasi. Custom furniture and fittings.',
  },
  {
    externalUserId: '5002',
    username: 'akosua_designs',
    displayName: 'Akosua Boateng',
    avatarUrl: avatar('Akosua Boateng'),
    bio: 'Fashion designer. Kente-inspired everyday wear.',
  },
  {
    externalUserId: '5003',
    username: 'yaw.electric',
    displayName: 'Yaw Owusu',
    avatarUrl: avatar('Yaw Owusu'),
    bio: 'Licensed electrician, Accra. Wiring, solar, repairs.',
  },
  {
    externalUserId: '5004',
    username: 'efua.bakes',
    displayName: 'Efua Mensah',
    avatarUrl: avatar('Efua Mensah'),
    bio: 'Home baker. Cakes for weddings and birthdays.',
  },
  {
    externalUserId: '5005',
    username: 'kwame_builds',
    displayName: 'Kwame Darko',
    avatarUrl: avatar('Kwame Darko'),
    bio: 'Mason and site foreman. 12 years on the tools.',
  },
  {
    externalUserId: '5006',
    username: 'abena.hair',
    displayName: 'Abena Osei',
    avatarUrl: avatar('Abena Osei'),
    bio: 'Hairstylist in Takoradi. Braids, weaves, natural hair.',
  },
];
