import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Social profile of a GhanaWorks user. GhanaWorks owns the account (login,
 * password, email); `externalUserId` is the GhanaWorks user `id` and is the
 * permanent link - the Mongo `_id` is never used in its place.
 */
@Schema({ collection: 'profiles', timestamps: true })
export class Profile {
  @Prop({
    type: String,
    required: true,
    unique: true,
    immutable: true,
    trim: true,
    maxlength: 64,
  })
  externalUserId: string;

  // Social handle, chosen by the user; absent until then. Stored lower-cased
  // so the unique index is effectively case-insensitive.
  @Prop({
    type: String,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 30,
    match: /^[a-z0-9._]+$/,
  })
  username?: string;

  // Synced from GhanaWorks `name` / `image_url` on every login.
  @Prop({ type: String, trim: true, maxlength: 100 })
  displayName?: string;

  @Prop({ type: String, trim: true, maxlength: 2048 })
  avatarUrl?: string;

  @Prop({ type: String, trim: true, maxlength: 160 })
  bio?: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  // Set on logout (here or via GhanaWorks back-channel). Access tokens issued
  // before this moment are rejected.
  @Prop({ type: Date })
  loggedOutAt?: Date;

  // Maintained by `timestamps: true`; declared for typing only.
  createdAt: Date;
  updatedAt: Date;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);

// Unique only among profiles that have picked a username.
ProfileSchema.index(
  { username: 1 },
  { unique: true, partialFilterExpression: { username: { $type: 'string' } } },
);
