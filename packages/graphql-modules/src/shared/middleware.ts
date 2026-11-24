import { GraphQLResolveInfo } from 'graphql';
import { ModuleMetadata } from './../module/metadata';
import { isDefined } from './utils';
import { ExtraMiddlewareError, useLocation } from './errors';

export type Next<T = any> = () => Promise<T>;

export type Middleware<TContext = MiddlewareContext> = (
  context: TContext,
  next: Next
) => Promise<any>;

export function compose<TContext>(middleware: Array<Middleware<TContext>>) {
  if (!Array.isArray(middleware)) {
    throw new TypeError('Middleware stack must be an array!');
  }

  for (const fn of middleware) {
    if (typeof fn !== 'function') {
      throw new TypeError('Middleware must be composed of functions!');
    }
  }

  return function composed(context: TContext, next: Next) {
    // last called middleware
    let index = -1;

    function dispatch(i: number): Promise<any> {
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'));
      }

      index = i;

      const fn = i === middleware.length ? next : middleware[i];

      if (!fn) {
        return Promise.resolve();
      }

      try {
        return Promise.resolve(fn(context, dispatch.bind(null, i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return dispatch(0);
  };
}

export interface MiddlewareContext {
  root: any;
  args: {
    [argName: string]: any;
  };
  context: GraphQLModules.ModuleContext;
  info: GraphQLResolveInfo;
}

export type MiddlewareMap = {
  [type: string]: {
    [field: string]: Middleware[];
  };
};

export function createMiddleware(
  path: string[],
  middlewareMap?: MiddlewareMap
) {
  const middlewares = middlewareMap ? pickMiddlewares(path, middlewareMap) : [];

  return compose(middlewares);
}

export function mergeMiddlewareMaps(
  app: MiddlewareMap,
  mod: MiddlewareMap
): MiddlewareMap {
  return mergeDeep(app, mod);
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * Deeply merges two middleware maps.
 * Nested objects are merged recursively, arrays of middlewares are concatenated
 * (left first) and for any other value the right side wins.
 */
function mergeDeep(left: any, right: any): any {
  const result: Record<string, any> = { ...left };

  for (const key of Object.keys(right)) {
    const r = right[key];

    if (!Object.prototype.hasOwnProperty.call(left, key)) {
      result[key] = r;
      continue;
    }

    const l = left[key];

    if (isPlainObject(l) && isPlainObject(r)) {
      result[key] = mergeDeep(l, r);
    } else if (Array.isArray(l)) {
      result[key] = l.concat(r || []);
    } else {
      result[key] = r;
    }
  }

  return result;
}

function pickMiddlewares(path: string[], middlewareMap: MiddlewareMap) {
  const middlewares: Middleware[] = [];

  const [type, field] = path;

  if (middlewareMap['*']?.['*']) {
    middlewares.push(...middlewareMap['*']['*']);
  }

  const typeMap = middlewareMap[type];

  if (typeMap) {
    if (typeMap['*']) {
      middlewares.push(...typeMap['*']);
    }

    if (field && typeMap[field]) {
      middlewares.push(...typeMap[field]);
    }
  }

  return middlewares.filter(isDefined);
}

export function validateMiddlewareMap(
  middlewareMap: MiddlewareMap,
  metadata: ModuleMetadata
) {
  const exists = checkExistence(metadata);

  for (const typeName in middlewareMap.types) {
    if (middlewareMap.types.hasOwnProperty(typeName)) {
      const typeMiddlewareMap = middlewareMap[typeName];

      if (!exists.type(typeName)) {
        throw new ExtraMiddlewareError(
          `Cannot apply a middleware to non existing "${typeName}" type`,
          useLocation({ dirname: metadata.dirname, id: metadata.id })
        );
      }

      for (const fieldName in typeMiddlewareMap[typeName]) {
        if (typeMiddlewareMap[typeName].hasOwnProperty(fieldName)) {
          if (!exists.field(typeName, fieldName)) {
            throw new ExtraMiddlewareError(
              `Cannot apply a middleware to non existing "${typeName}.${fieldName}" type.field`,
              useLocation({ dirname: metadata.dirname, id: metadata.id })
            );
          }
        }
      }
    }
  }
}

/**
 * Helps to make sure a middleware has a corresponding type/field definition.
 * We don't want to pass a module-level middlewares that are not related to the module.
 * Not because it's dangerous but to prevent unused middlewares.
 */
function checkExistence(metadata: ModuleMetadata) {
  return {
    type(name: string) {
      return isDefined(metadata.implements?.[name] || metadata.extends?.[name]);
    },
    field(type: string, name: string) {
      return isDefined(
        metadata.implements?.[type]?.includes(name) ||
          metadata.extends?.[type]?.includes(name)
      );
    },
  };
}
