import { GraphQLResolveInfo } from 'graphql';
import { mergeDeepWith } from 'ramda';
import { ModuleMetadata } from './../module/metadata';
import { hasOwnProperty, isDefined } from './utils';
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
  const merge = (left: any, right: any): any => {
    return mergeDeepWith(
      (l, r) => {
        if (Array.isArray(l)) {
          return l.concat(r || []);
        }

        return merge(l, r);
      },
      left,
      right
    );
  };
  return merge(app, mod);
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
    if (hasOwnProperty(middlewareMap.types,typeName)) {
      const typeMiddlewareMap = middlewareMap[typeName];

      if (!exists.type(typeName)) {
        throw new ExtraMiddlewareError(
          `Cannot apply a middleware to non existing "${typeName}" type`,
          useLocation({ dirname: metadata.dirname, id: metadata.id })
        );
      }

      for (const fieldName in typeMiddlewareMap[typeName]) {
        if (hasOwnProperty(typeMiddlewareMap[typeName],fieldName)) {
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
