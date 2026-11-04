import { mongo, Types } from 'mongoose';
import type { Model } from 'mongoose';
import {
  createModelMock,
  queryMock,
  savedDocument,
} from '../../../test/utils/mongoose-mocks.js';
import type { ModelMock } from '../../../test/utils/mongoose-mocks.js';
import { DuplicateKeyError } from '../exceptions/duplicate-key.error.js';
import { BaseCrudRepository } from './base.repository.js';
import type { LeanDocument } from './base.repository.js';

interface Thing {
  name: string;
  tag?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ThingEntity {
  id: string;
  name: string;
}

class ThingRepository extends BaseCrudRepository<Thing, ThingEntity> {
  constructor(model: Model<Thing>) {
    super(model);
  }

  protected override toEntity(document: LeanDocument<Thing>): ThingEntity {
    return { id: document._id.toString(), name: document.name };
  }
}

const id = new Types.ObjectId();
const leanThing = {
  _id: id,
  name: 'alpha',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function duplicateKeyError(keyValue: Record<string, unknown>) {
  return new mongo.MongoServerError({
    message: 'E11000 duplicate key error',
    code: 11000,
    keyValue,
  });
}

describe('BaseCrudRepository', () => {
  let mock: ModelMock;
  let repository: ThingRepository;

  beforeEach(() => {
    mock = createModelMock();
    repository = new ThingRepository(mock.model as unknown as Model<Thing>);
  });

  describe('create', () => {
    it('saves without undefined keys and returns the mapped entity', async () => {
      mock.save.mockImplementation((data) =>
        Promise.resolve(savedDocument(data, { _id: id })),
      );

      const result = await repository.create({ name: 'alpha', tag: undefined });

      expect(mock.model).toHaveBeenCalledWith({ name: 'alpha' });
      expect(result).toEqual({ id: id.toString(), name: 'alpha' });
    });

    it('translates a duplicate key error into DuplicateKeyError', async () => {
      mock.save.mockRejectedValue(duplicateKeyError({ name: 'alpha' }));

      const error = await repository.create({ name: 'alpha' }).catch((e) => e);

      expect(error).toBeInstanceOf(DuplicateKeyError);
      expect((error as DuplicateKeyError).fields).toEqual(['name']);
    });

    it('rethrows other errors unchanged', async () => {
      const failure = new Error('boom');
      mock.save.mockRejectedValue(failure);

      await expect(repository.create({ name: 'x' })).rejects.toBe(failure);
    });
  });

  describe('findById', () => {
    it('returns the mapped entity using a lean query', async () => {
      const query = queryMock(leanThing);
      mock.model.findById.mockReturnValue(query);

      await expect(repository.findById(id.toString())).resolves.toEqual({
        id: id.toString(),
        name: 'alpha',
      });
      expect(query.lean).toHaveBeenCalled();
    });

    it('returns null when the record is missing', async () => {
      mock.model.findById.mockReturnValue(queryMock(null));

      await expect(repository.findById(id.toString())).resolves.toBeNull();
    });

    it('returns null for an invalid ObjectId without querying', async () => {
      await expect(repository.findById('not-an-id')).resolves.toBeNull();
      // 12-char strings pass mongoose's own isValid; they must not pass here
      await expect(repository.findById('aaaaaaaaaaaa')).resolves.toBeNull();
      expect(mock.model.findById).not.toHaveBeenCalled();
    });
  });

  it('findOne passes the filter through', async () => {
    mock.model.findOne.mockReturnValue(queryMock(leanThing));

    const result = await repository.findOne({ name: 'alpha' });

    expect(mock.model.findOne).toHaveBeenCalledWith({ name: 'alpha' });
    expect(result?.name).toBe('alpha');
  });

  it('findAll applies sort, skip and limit', async () => {
    const query = queryMock([leanThing, leanThing]);
    mock.model.find.mockReturnValue(query);

    const result = await repository.findAll(
      { name: 'alpha' },
      { sort: { name: 1 }, skip: 5, limit: 2 },
    );

    expect(result).toHaveLength(2);
    expect(query.sort).toHaveBeenCalledWith({ name: 1 });
    expect(query.skip).toHaveBeenCalledWith(5);
    expect(query.limit).toHaveBeenCalledWith(2);
  });

  describe('findPaginated', () => {
    it('computes skip/limit and pagination metadata', async () => {
      const query = queryMock([leanThing]);
      mock.model.find.mockReturnValue(query);
      mock.model.countDocuments.mockReturnValue(queryMock(41));

      const result = await repository.findPaginated(
        { name: 'alpha' },
        { page: 3, limit: 10, sort: { field: 'name', direction: 'asc' } },
      );

      expect(query.skip).toHaveBeenCalledWith(20);
      expect(query.limit).toHaveBeenCalledWith(10);
      expect(query.sort).toHaveBeenCalledWith({ name: 1, _id: -1 });
      expect(mock.model.countDocuments).toHaveBeenCalledWith({ name: 'alpha' });
      expect(result).toEqual({
        items: [{ id: id.toString(), name: 'alpha' }],
        page: 3,
        limit: 10,
        total: 41,
        totalPages: 5,
      });
    });

    it('defaults to newest first and clamps oversized limits', async () => {
      const query = queryMock([]);
      mock.model.find.mockReturnValue(query);
      mock.model.countDocuments.mockReturnValue(queryMock(0));

      const result = await repository.findPaginated({}, { limit: 10_000 });

      expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
      expect(query.limit).toHaveBeenCalledWith(100);
      expect(result).toMatchObject({ page: 1, limit: 100, totalPages: 0 });
    });
  });

  describe('update', () => {
    it('uses $set, returns the updated document and runs validators', async () => {
      mock.model.findByIdAndUpdate.mockReturnValue(
        queryMock({ ...leanThing, name: 'beta' }),
      );

      const result = await repository.update(id.toString(), {
        name: 'beta',
        tag: undefined,
      });

      expect(mock.model.findByIdAndUpdate).toHaveBeenCalledWith(
        id.toString(),
        { $set: { name: 'beta' } },
        expect.objectContaining({
          returnDocument: 'after',
          runValidators: true,
        }),
      );
      expect(result).toEqual({ id: id.toString(), name: 'beta' });
    });

    it('returns null when missing or the id is invalid', async () => {
      mock.model.findByIdAndUpdate.mockReturnValue(queryMock(null));

      await expect(repository.update(id.toString(), {})).resolves.toBeNull();
      await expect(repository.update('bad', {})).resolves.toBeNull();
      expect(mock.model.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('translates duplicate key errors', async () => {
      mock.model.findByIdAndUpdate.mockReturnValue(
        queryMock(null, duplicateKeyError({ name: 'beta' })),
      );

      await expect(
        repository.update(id.toString(), { name: 'beta' }),
      ).rejects.toBeInstanceOf(DuplicateKeyError);
    });
  });

  describe('delete', () => {
    it('returns true when a record was removed', async () => {
      mock.model.findByIdAndDelete.mockReturnValue(queryMock(leanThing));

      await expect(repository.delete(id.toString())).resolves.toBe(true);
    });

    it('returns false when missing or the id is invalid', async () => {
      mock.model.findByIdAndDelete.mockReturnValue(queryMock(null));

      await expect(repository.delete(id.toString())).resolves.toBe(false);
      await expect(repository.delete('bad')).resolves.toBe(false);
      expect(mock.model.findByIdAndDelete).toHaveBeenCalledTimes(1);
    });
  });

  it('exists maps the result to a boolean', async () => {
    mock.model.exists.mockReturnValueOnce(queryMock({ _id: id }));
    mock.model.exists.mockReturnValueOnce(queryMock(null));

    await expect(repository.exists({ name: 'alpha' })).resolves.toBe(true);
    await expect(repository.exists({ name: 'zeta' })).resolves.toBe(false);
  });

  it('count delegates to countDocuments', async () => {
    mock.model.countDocuments.mockReturnValue(queryMock(7));

    await expect(repository.count({ name: 'alpha' })).resolves.toBe(7);
  });
});
