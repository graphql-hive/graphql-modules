import { GraphQLSchema } from 'graphql';

export function hasOwnProperty(v:unknown, key:PropertyKey){
  return Object.prototype.hasOwnProperty.call(v, key);
}

export function flatten<T>(arr: T[]): T extends (infer A)[] ? A[] : T[] {
  return Array.prototype.concat(...arr) as any;
}

export function isDefined<T>(val: T | null | undefined): val is T {
  return !isNil(val);
}

export function isNil<T>(val: T | null | undefined): val is null | undefined {
  return val === null || typeof val === 'undefined';
}

export function isObject(val: any) {
  return Object.prototype.toString.call(val) === '[object Object]';
}

export function isPrimitive(
  val: any
): val is number | string | boolean | symbol | bigint {
  return ['number', 'string', 'boolean', 'symbol', 'bigint'].includes(
    typeof val
  );
}

export function isAsyncIterable(obj: any): obj is AsyncIterableIterator<any> {
  return obj && typeof obj[Symbol.asyncIterator] === 'function';
}

export function tapAsyncIterator<
  T,
  TAsyncIterableIterator extends AsyncIterableIterator<T>,
>(
  iterable: TAsyncIterableIterator,
  doneCallback: () => void
): TAsyncIterableIterator {
  const iteratorMethod = iterable[Symbol.asyncIterator];
  const iterator = iteratorMethod.call(iterable);

  function mapResult(result: IteratorResult<T, any>) {
    if (result.done) {
      doneCallback();
    }

    return result;
  }

  return {
    async next() {
      try {
        let result = await iterator.next();
        return mapResult(result);
      } catch (error) {
        doneCallback();
        throw error;
      }
    },
    async return(value: any) {
      try {
        const result = await iterator.return!(value);

        return mapResult(result);
      } catch (error) {
        doneCallback();
        throw error;
      }
    },
    throw(error) {
      doneCallback();
      return iterator.throw!(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  } as TAsyncIterableIterator;
}

export function once(cb: () => void) {
  let called = false;

  return () => {
    if (!called) {
      called = true;
      cb();
    }
  };
}

export function share<T, A>(factory: (arg?: A) => T): (arg?: A) => T {
  let cached: T | null = null;

  return (arg?: A) => {
    if (!cached) {
      cached = factory(arg);
    }

    return cached;
  };
}

export function uniqueId(isNotUsed: (id: string) => boolean) {
  let id: string;

  while (!isNotUsed((id = Math.random().toString(16).substr(2)))) {}

  return id;
}

export function isNotSchema<T>(obj: any): obj is T {
  return obj instanceof GraphQLSchema === false;
}

export function merge<S extends object, T extends object>(
  source: S,
  target: T
): S & T {
  const result: any = {
    ...source,
    ...target,
  };

  function attachSymbols<O extends T | S>(obj: O): void {
    const symbols = Object.getOwnPropertySymbols(obj) as Array<keyof O>;

    for (const symbol of symbols) {
      result[symbol] = obj[symbol];
    }
  }

  if (source) {
    attachSymbols(source);
  }

  attachSymbols(target);

  return result;
}
