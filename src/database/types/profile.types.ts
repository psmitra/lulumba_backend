import type { HydratedDocument } from 'mongoose';
import type { Profile } from '../schemas/profile.schema.js';

export type ProfileDocument = HydratedDocument<Profile>;
