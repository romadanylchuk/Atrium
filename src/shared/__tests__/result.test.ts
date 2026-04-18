import { describe, it, expect, expectTypeOf } from 'vitest';
import { ok, err, type Ok, type Err, type Result } from '../result.js';

describe('ok()', () => {
  it('sets ok to true', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
  });

  it('sets data to the provided value', () => {
    const r = ok('hello');
    expect(r.data).toBe('hello');
  });

  it('sets data to undefined for ok(undefined)', () => {
    const r = ok(undefined);
    expect(r.ok).toBe(true);
    expect(r.data).toBeUndefined();
  });

  it('produces an Ok<T> type', () => {
    expectTypeOf(ok(1)).toMatchTypeOf<Ok<number>>();
  });
});

describe('err()', () => {
  it('sets ok to false', () => {
    const r = err('SOME_CODE', 'something went wrong');
    expect(r.ok).toBe(false);
  });

  it('sets error.code', () => {
    const r = err('NOT_FOUND', 'missing');
    expect(r.error.code).toBe('NOT_FOUND');
  });

  it('sets error.message', () => {
    const r = err('INTERNAL', 'boom');
    expect(r.error.message).toBe('boom');
  });

  it('produces an Err<E> type', () => {
    expectTypeOf(err('X', 'y')).toMatchTypeOf<Err<string>>();
  });
});

describe('Result discriminated union narrowing', () => {
  function process(r: Result<number, string>): number | string {
    if (r.ok) {
      // TypeScript must narrow r to Ok<number> here
      return r.data * 2;
    } else {
      // TypeScript must narrow r to Err<string> here
      return r.error.code;
    }
  }

  it('narrows to data on ok branch', () => {
    expect(process(ok(5))).toBe(10);
  });

  it('narrows to error on err branch', () => {
    expect(process(err('BAD', 'msg'))).toBe('BAD');
  });

  it('ok branch type is Ok<number>', () => {
    const r: Result<number, string> = ok(3);
    if (r.ok) {
      expectTypeOf(r).toMatchTypeOf<Ok<number>>();
    }
  });

  it('err branch type is Err<string>', () => {
    const r: Result<number, string> = err('E', 'm');
    if (!r.ok) {
      expectTypeOf(r).toMatchTypeOf<Err<string>>();
    }
  });
});
