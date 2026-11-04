import {
  Types,
  type ClientSession,
  type Default__v,
  type Model,
  type ProjectionType,
  type QueryFilter,
  type Require_id,
  type SortOrder,
  type UpdateQuery,
} from 'mongoose';
import type { CursorPosition } from '@common/utils/cursor.util.js';
import { DuplicateKeyError } from '@common/exceptions/duplicate-key.error.js';
import type {
  PaginatedResult,
  SortDirection,
  SortOption,
} from '@common/interfaces/pagination.interface.js';
import { isValidObjectId } from '@common/utils/object-id.util.js';
import { normalizePagination } from '@common/utils/pagination.util.js';
import { omitUndefined } from '@common/utils/safe-object.util.js';
import {
  getDuplicateKeyFields,
  isDuplicateKeyError,
} from '@common/utils/mongo-error.util.js';

/** Plain object returned by `.lean()` / `toObject()` for a schema class. */
export type LeanDocument<TSchema> = Default__v<Require_id<TSchema>>;

/**
 * Default domain object for a schema: the lean document with `_id` turned
 * into a string `id` and without `__v`. Produced by `toPlainEntity`.
 */
export type Entity<TSchema> = Omit<LeanDocument<TSchema>, '_id' | '__v'> & {
  id: string;
};

export function toPlainEntity<TSchema>(
  document: LeanDocument<TSchema>,
): Entity<TSchema> {
  const { _id: _objectId, __v: _version, ...fields } = document;
  // Every schema here uses the default ObjectId `_id`.
  const id = (document._id as Types.ObjectId).toString();
  return { ...fields, id } as Entity<TSchema>;
}

export type SortSpec = Record<string, SortOrder>;

export interface RepositoryOptions {
  /** Pass a session to take part in a transaction (see DatabaseService). */
  session?: ClientSession;
}

export interface FindManyOptions extends RepositoryOptions {
  sort?: SortSpec;
  limit?: number;
  skip?: number;
}

export interface FindPaginatedOptions<
  TSortField extends string = string,
> extends RepositoryOptions {
  page?: number;
  limit?: number;
  sort?: SortOption<TSortField> | SortSpec;
}

/**
 * Generic CRUD over a Mongoose model.
 *
 * - `TSchema` is the schema class (e.g. `User`), `TEntity` the domain object
 *   handed to services. Subclasses implement `toEntity` once, so no Mongoose
 *   document ever leaves the infrastructure layer.
 * - Reads use `.lean()`; writes run schema validators.
 * - Invalid ObjectIds behave like missing records (null / false) rather than
 *   throwing CastErrors. Rejecting malformed ids is the transport layer's job
 *   (see ParseObjectIdPipe).
 * - Unique-index violations surface as `DuplicateKeyError`. No HTTP concerns.
 */
export abstract class BaseCrudRepository<TSchema, TEntity> {
  protected constructor(protected readonly model: Model<TSchema>) {}

  protected abstract toEntity(document: LeanDocument<TSchema>): TEntity;

  async create(
    data: Partial<TSchema>,
    options: RepositoryOptions = {},
  ): Promise<TEntity> {
    try {
      const created = await new this.model(omitUndefined(data)).save({
        session: options.session,
      });
      return this.toEntity(created.toObject<LeanDocument<TSchema>>());
    } catch (error) {
      throw this.translateError(error);
    }
  }

  async findById(
    id: string,
    options: RepositoryOptions = {},
  ): Promise<TEntity | null> {
    if (!isValidObjectId(id)) {
      return null;
    }
    const document: LeanDocument<TSchema> | null = await this.model
      .findById(id)
      .session(options.session ?? null)
      .lean<LeanDocument<TSchema>>();
    return document ? this.toEntity(document) : null;
  }

  async findOne(
    filter: QueryFilter<TSchema>,
    options: RepositoryOptions = {},
  ): Promise<TEntity | null> {
    const document: LeanDocument<TSchema> | null = await this.model
      .findOne(filter)
      .session(options.session ?? null)
      .lean<LeanDocument<TSchema>>();
    return document ? this.toEntity(document) : null;
  }

  /** Prefer `findPaginated` for user-facing lists; pass `limit` otherwise. */
  async findAll(
    filter: QueryFilter<TSchema> = {},
    options: FindManyOptions = {},
  ): Promise<TEntity[]> {
    const query = this.model.find(filter).session(options.session ?? null);
    if (options.sort) query.sort(options.sort);
    if (options.skip !== undefined) query.skip(options.skip);
    if (options.limit !== undefined) query.limit(options.limit);

    const documents = await query.lean<LeanDocument<TSchema>[]>();
    return documents.map((document) => this.toEntity(document));
  }

  async findPaginated(
    filter: QueryFilter<TSchema> = {},
    options: FindPaginatedOptions = {},
  ): Promise<PaginatedResult<TEntity>> {
    const { page, limit, skip } = normalizePagination(
      options.page,
      options.limit,
    );
    const sort = this.toSortSpec(options.sort);

    const [documents, total] = await Promise.all([
      this.model
        .find(filter)
        // _id tiebreaker keeps page boundaries stable when sort keys collide
        .sort({ ...sort, _id: sort._id ?? -1 })
        .skip(skip)
        .limit(limit)
        .session(options.session ?? null)
        .lean<LeanDocument<TSchema>[]>(),
      this.model.countDocuments(filter).session(options.session ?? null),
    ]);

    return {
      items: documents.map((document) => this.toEntity(document)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * One cursor page of `filter` starting after `after`, newest first by
   * default. Sorted on `createdAt, _id` (back it with a matching index), so
   * pages never skip or repeat records when new ones arrive between requests.
   */
  async findCursorPage(
    filter: QueryFilter<TSchema>,
    limit: number,
    after?: CursorPosition,
    direction: SortDirection = 'desc',
  ): Promise<{ items: TEntity[]; hasMore: boolean }> {
    const order = direction === 'desc' ? -1 : 1;
    const page = (
      after ? { $and: [filter, afterCursor(after, direction)] } : filter
    ) as QueryFilter<TSchema>;
    const documents = await this.model
      .find(page)
      .sort({ createdAt: order, _id: order })
      .limit(limit + 1)
      .lean<LeanDocument<TSchema>[]>();
    return {
      items: documents.slice(0, limit).map((doc) => this.toEntity(doc)),
      hasMore: documents.length > limit,
    };
  }

  /**
   * Applies `data` with `$set`; keys whose value is `undefined` are ignored.
   * Resolves to null when no record matches.
   */
  async update(
    id: string,
    data: Partial<TSchema>,
    options: RepositoryOptions = {},
  ): Promise<TEntity | null> {
    if (!isValidObjectId(id)) {
      return null;
    }
    const update: UpdateQuery<TSchema> = { $set: omitUndefined(data) };
    try {
      const document: LeanDocument<TSchema> | null = await this.model
        .findByIdAndUpdate(id, update, {
          // Mongoose 9 equivalent of the deprecated `new: true`
          returnDocument: 'after',
          runValidators: true,
          session: options.session,
        })
        .lean<LeanDocument<TSchema>>();
      return document ? this.toEntity(document) : null;
    } catch (error) {
      throw this.translateError(error);
    }
  }

  /** Resolves to true when a record was deleted, false when none matched. */
  async delete(id: string, options: RepositoryOptions = {}): Promise<boolean> {
    if (!isValidObjectId(id)) {
      return false;
    }
    const deleted = await this.model
      .findByIdAndDelete(id, { session: options.session })
      .lean<LeanDocument<TSchema>>();
    return deleted !== null;
  }

  /** Resolves to true when a record matching `filter` was deleted. */
  async deleteOne(
    filter: QueryFilter<TSchema>,
    options: RepositoryOptions = {},
  ): Promise<boolean> {
    const result = await this.model.deleteOne(filter, {
      session: options.session,
    });
    return result.deletedCount > 0;
  }

  async exists(
    filter: QueryFilter<TSchema>,
    options: RepositoryOptions = {},
  ): Promise<boolean> {
    const result = await this.model
      .exists(filter)
      .session(options.session ?? null);
    return result !== null;
  }

  async count(
    filter: QueryFilter<TSchema> = {},
    options: RepositoryOptions = {},
  ): Promise<number> {
    return this.model.countDocuments(filter).session(options.session ?? null);
  }

  /**
   * Lean read with a projection, for feature-specific read models where a
   * full entity would be wasteful. Results are partial plain objects.
   */
  protected async findProjected<TResult>(
    filter: QueryFilter<TSchema>,
    projection: ProjectionType<TSchema>,
    options: FindManyOptions = {},
  ): Promise<TResult[]> {
    const query = this.model
      .find(filter, projection)
      .session(options.session ?? null);
    if (options.sort) query.sort(options.sort);
    if (options.skip !== undefined) query.skip(options.skip);
    if (options.limit !== undefined) query.limit(options.limit);
    return query.lean<TResult[]>();
  }

  /**
   * Raw update for subclasses (atomic `$inc`, conditional state changes).
   * Resolves to true when a record matched `filter`.
   */
  protected async updateOneWhere(
    filter: QueryFilter<TSchema>,
    update: UpdateQuery<TSchema>,
    options: RepositoryOptions = {},
  ): Promise<boolean> {
    try {
      const result = await this.model.updateOne(filter, update, {
        runValidators: true,
        session: options.session,
      });
      return result.matchedCount > 0;
    } catch (error) {
      throw this.translateError(error);
    }
  }

  /** Atomic read-modify-write for subclasses; returns the updated record. */
  protected async findOneAndUpdateWhere(
    filter: QueryFilter<TSchema>,
    update: UpdateQuery<TSchema>,
    options: RepositoryOptions & { upsert?: boolean; sort?: SortSpec } = {},
  ): Promise<TEntity | null> {
    try {
      const document: LeanDocument<TSchema> | null = await this.model
        .findOneAndUpdate(filter, update, {
          returnDocument: 'after',
          runValidators: true,
          upsert: options.upsert ?? false,
          setDefaultsOnInsert: true,
          sort: options.sort,
          session: options.session,
        })
        .lean<LeanDocument<TSchema>>();
      return document ? this.toEntity(document) : null;
    } catch (error) {
      throw this.translateError(error);
    }
  }

  private toSortSpec(sort: FindPaginatedOptions['sort']): SortSpec {
    if (!sort) {
      return { createdAt: -1 };
    }
    if (isSortOption(sort)) {
      return { [sort.field]: sort.direction === 'asc' ? 1 : -1 };
    }
    return sort;
  }

  private translateError(error: unknown): unknown {
    return isDuplicateKeyError(error)
      ? new DuplicateKeyError(getDuplicateKeyFields(error))
      : error;
  }
}

function isSortOption(sort: SortOption | SortSpec): sort is SortOption {
  return (
    typeof sort.field === 'string' &&
    (sort.direction === 'asc' || sort.direction === 'desc')
  );
}

/** Records strictly after `after` in `createdAt, _id` order. */
export function afterCursor(
  after: CursorPosition,
  direction: SortDirection = 'desc',
): Record<string, unknown> {
  const beyond = direction === 'desc' ? '$lt' : '$gt';
  return {
    $or: [
      { createdAt: { [beyond]: after.createdAt } },
      {
        createdAt: after.createdAt,
        _id: { [beyond]: new Types.ObjectId(after.id) },
      },
    ],
  };
}
