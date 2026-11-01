import type { Mock } from 'vitest';

/**
 * Chainable, awaitable stand-in for a Mongoose Query: every builder method
 * returns the query itself, and awaiting it resolves (or rejects) `result`.
 */
export function queryMock<T>(result: T, error?: unknown) {
  const query = {
    lean: vi.fn(() => query),
    sort: vi.fn(() => query),
    skip: vi.fn(() => query),
    limit: vi.fn(() => query),
    session: vi.fn(() => query),
    // Deliberately thenable: real Mongoose queries are, which is what lets
    // code under test `await Model.find()`.
    // oxlint-disable-next-line unicorn/no-thenable
    then<R1 = T, R2 = never>(
      onFulfilled?: (value: T) => R1 | PromiseLike<R1>,
      onRejected?: (reason: unknown) => R2 | PromiseLike<R2>,
    ): Promise<R1 | R2> {
      const settled: Promise<T> =
        error === undefined ? Promise.resolve(result) : Promise.reject(error);
      return settled.then(onFulfilled, onRejected);
    },
  };
  return query;
}

type AnyFn = (...args: never[]) => unknown;

export interface ModelMock {
  /** Constructor (`new model(data)`); its `save()` delegates to `save`. */
  model: Mock<AnyFn> &
    Record<
      | 'findById'
      | 'findOne'
      | 'find'
      | 'findByIdAndUpdate'
      | 'findByIdAndDelete'
      | 'exists'
      | 'countDocuments',
      Mock
    >;
  save: Mock<(data: Record<string, unknown>) => Promise<unknown>>;
}

export function createModelMock(): ModelMock {
  const save = vi.fn<(data: Record<string, unknown>) => Promise<unknown>>();
  const ctor = vi.fn(function (data: Record<string, unknown>) {
    return { save: () => save(data) };
  });
  const model = Object.assign(ctor, {
    findById: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    exists: vi.fn(),
    countDocuments: vi.fn(),
  });
  return { model, save } as ModelMock;
}

/** `save()` result whose `toObject()` echoes the data plus generated fields. */
export function savedDocument<T extends object>(data: T, extra: object = {}) {
  return { toObject: () => ({ ...data, ...extra }) };
}
