import { createDatabaseConnection } from '@common/config/database.config.js';
import { validateEnv } from '@common/config/env.validation.js';
import { Environment } from '@common/enums/environment.enum.js';
import { Media, MediaSchema } from '../schemas/media.schema.js';
import { Post, PostSchema } from '../schemas/post.schema.js';
import { Profile, ProfileSchema } from '../schemas/profile.schema.js';
import { seedPosts } from './posts.seed.js';
import { SAMPLE_PROFILES } from './profiles.seed.js';

/**
 * Loads sample data for local development: `npm run seed`. Safe to re-run:
 * records are upserted by their natural key and reset to the sample values.
 */
async function seed(): Promise<void> {
  process.loadEnvFile();
  const env = validateEnv(process.env);
  if (env.APP_ENV === Environment.Production) {
    throw new Error('Refusing to seed sample data when APP_ENV=production');
  }

  const connection = await createDatabaseConnection(env);
  try {
    const profiles = connection.model(Profile.name, ProfileSchema);
    await profiles.syncIndexes();
    const result = await profiles.bulkWrite(
      SAMPLE_PROFILES.map((profile) => ({
        updateOne: {
          filter: { externalUserId: profile.externalUserId },
          update: { $set: { ...profile, isActive: true } },
          upsert: true,
        },
      })),
    );
    console.log(
      `Profiles: ${result.upsertedCount} created, ${result.modifiedCount} updated ` +
        `(database "${connection.name}")`,
    );
    for (const profile of SAMPLE_PROFILES) {
      console.log(`  ${profile.externalUserId}  @${profile.username}`);
    }

    // Unique indexes (storageKey, idempotency key) keep the upserts single.
    await connection.model(Media.name, MediaSchema).syncIndexes();
    await connection.model(Post.name, PostSchema).syncIndexes();
    console.log(await seedPosts(connection));
  } finally {
    await connection.close();
  }
}

await seed();
