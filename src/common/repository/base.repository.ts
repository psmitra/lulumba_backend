import type {
  ClientSession,
  Default__v,
  Model,
  ProjectionType,
  QueryFilter,
  Require_id,
  SortOrder,
  UpdateQuery,
} from 'mongoose';
import { DuplicateKeyError } from '../exceptions/duplicate-key.error.js';
import type {
  PaginatedResult,
  SortOption,
} from '../interfaces/pagination.interface.js';
import { isValidObjectId } from '../utils/object-id.util.js';
import { normalizePagination } from '../utils/pagination.util.js';
import { omitUndefined } from '../utils/safe-object.util.js';
import {
  getDuplicateKeyFields,
  isDuplicateKeyError,
} from '../utils/mongo-error.util.js';

/** Plain object returned by `.lean()` / `toObject()` for a schema class. */
export type LeanDocument<TSchema> = Default__v<Require_id<TSchema>>;

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
