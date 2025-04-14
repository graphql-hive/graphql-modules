import {
  GraphQLScalarType,
  concatAST,
  Kind,
  defaultFieldResolver,
  FieldNode,
  GraphQLResolveInfo,
  isScalarType,
} from 'graphql';
import { Resolvers, ModuleConfig } from './types';
import { ModuleMetadata } from './metadata';
import { InternalAppContext } from '../application/application';
import { Single, ResolveFn, ID, ResolveTypeFn } from './../shared/types';
import {
  useLocation,
  ExtraResolverError,
  ResolverDuplicatedError,
  ResolverInvalidError,
} from './../shared/errors';
import { isNil, isDefined, isPrimitive } from '../shared/utils';
import {
  createMiddleware,
  mergeMiddlewareMaps,
  MiddlewareMap,
  validateMiddlewareMap,
} from '../shared/middleware';

const resolverMetadataProp = Symbol('metadata');

interface ResolverMetadata {
  moduleId: ID;
}

export function createResolvers(
  config: ModuleConfig,
  metadata: ModuleMetadata,
  app: {
    middlewareMap: MiddlewareMap;
  }
) {
  const ensure = ensureImplements(metadata);
  const normalizedModuleMiddlewareMap = config.middlewares || {};
  const middlewareMap = mergeMiddlewareMaps(
    app.middlewareMap,
    normalizedModuleMiddlewareMap
  );

  validateMiddlewareMap(normalizedModuleMiddlewareMap, metadata);

  const resolvers = addDefaultResolvers(
    mergeResolvers(config),
    middlewareMap,
    config
  );

  // Wrap resolvers
  for (const typeName in resolvers) {
    if (resolvers.hasOwnProperty(typeName)) {
      const obj = resolvers[typeName];

      if (isScalarResolver(obj)) {
        continue;
      } else if (isEnumResolver(obj)) {
        continue;
      } else if (obj && typeof obj === 'object') {
        for (const fieldName in obj) {
          if (obj.hasOwnProperty(fieldName)) {
            ensure.type(typeName, fieldName);
            const path = [typeName, fieldName];

            // function
            if (isResolveFn(obj[fieldName])) {
              const resolver = wrapResolver({
                config,
                resolver: obj[fieldName],
                middlewareMap,
                path,
                isTypeResolver:
                  fieldName === '__isTypeOf' || fieldName === '__resolveType',
                isReferenceResolver: fieldName === '__resolveReference',
                isObjectResolver: fieldName === '__resolveObject',
              });
              resolvers[typeName][fieldName] = resolver;
            } else if (isResolveOptions(obj[fieldName])) {
              // { resolve }
              if (isDefined((obj[fieldName] as any).resolve)) {
                const resolver = wrapResolver({
                  config,
                  resolver: (obj[fieldName] as any).resolve,
                  middlewareMap,
                  path,
                });
                resolvers[typeName][fieldName].resolve = resolver;
              }

              // { subscribe }
              if (isDefined((obj[fieldName] as any).subscribe)) {
                const resolver = wrapResolver({
                  config,
                  resolver: (obj[fieldName] as any).subscribe,
                  middlewareMap,
                  path,
                });
                resolvers[typeName][fieldName].subscribe = resolver;
              }
            }
          }
        }
      }
    }
  }

  return resolvers;
}

/**
 * Wrap a resolver so we use module's context instead of app context.
 * Use a middleware if available.
 * Attach metadata to a resolver (we will see if it's helpful, probably in error handling)
 */
function wrapResolver({
  resolver,
  config,
  path,
  middlewareMap,
  isTypeResolver,
  isReferenceResolver,
  isObjectResolver,
}: {
  resolver: any;
  middlewareMap: MiddlewareMap;
  config: ModuleConfig;
  path: string[];
  isTypeResolver?: boolean;
  isReferenceResolver?: boolean;
  isObjectResolver?: boolean;
}): ResolveFn<InternalAppContext> | ResolveTypeFn<InternalAppContext> {
  if (isTypeResolver || isReferenceResolver) {
    const wrappedResolver: ResolveTypeFn<InternalAppContext> = (
      root,
      context,
      info
    ) => {
      const ctx = {
        root,
        context: isReferenceResolver
          ? context.ɵgetModuleContext(config.id, context)
          : // We mark the context object as possibly undefined,
            // because graphql-jit for some reason doesn't pass it for isTypeOf or resolveType methods
            context?.ɵgetModuleContext(config.id, context),
        info,
      };

      return resolver(ctx.root, ctx.context, ctx.info);
    };

    writeResolverMetadata(wrappedResolver, config);

    return wrappedResolver;
  }

  if (isObjectResolver) {
    const wrappedResolver = (
      root: any,
      fields: Record<string, FieldNode>,
      context: InternalAppContext,
      info: GraphQLResolveInfo
    ): ReturnType<ResolveTypeFn<InternalAppContext>> => {
      const moduleContext = context.ɵgetModuleContext(config.id, context);
      return resolver(root, fields, moduleContext, info);
    };

    writeResolverMetadata(wrappedResolver, config);

    return wrappedResolver;
  }

  const middleware = createMiddleware(path, middlewareMap);

  const wrappedResolver: ResolveFn<InternalAppContext> = (
    root,
    args,
    context,
    info
  ) => {
    const ctx = {
      root,
      args,
      context: context.ɵgetModuleContext(config.id, context),
      info,
    };

    return middleware(ctx, () =>
      resolver(ctx.root, ctx.args, ctx.context, ctx.info)
    );
  };

  writeResolverMetadata(wrappedResolver, config);

  return wrappedResolver;
}

/**
 * We iterate over every defined resolver and check if it's valid and not duplicated
 */
function mergeResolvers(config: ModuleConfig): Single<Resolvers> {
  if (!config.resolvers) {
    return {};
  }

  const resolvers = Array.isArray(config.resolvers)
    ? config.resolvers
    : [config.resolvers];

  const container: Single<Resolvers> = {};

  for (const currentResolvers of resolvers) {
    for (const typeName in currentResolvers) {
      if (currentResolvers.hasOwnProperty(typeName)) {
        const value = currentResolvers[typeName];

        if (isNil(value)) {
          continue;
        } else if (isScalarResolver(value)) {
          addScalar({ typeName, resolver: value, container, config });
        } else if (isEnumResolver(value)) {
          addEnum({ typeName, resolver: value, container, config });
        } else if (value && typeof value === 'object') {
          addObject({ typeName, fields: value, container, config });
        } else {
          throw new ResolverInvalidError(
            `Resolver of "${typeName}" is invalid`,
            useLocation({ dirname: config.dirname, id: config.id })
          );
        }
      }
    }
  }

  return container;
}

function addObject({
  typeName,
  fields,
  container,
  config,
}: {
  typeName: string;
  fields: Record<string, any>;
  container: Single<Resolvers>;
  config: ModuleConfig;
}): void {
  if (!container[typeName]) {
    container[typeName] = {};
  }

  for (const fieldName in fields) {
    if (fields.hasOwnProperty(fieldName)) {
      const resolver = fields[fieldName];

      if (isResolveFn(resolver)) {
        if (container[typeName][fieldName]) {
          throw new ResolverDuplicatedError(
            `Duplicated resolver of "${typeName}.${fieldName}"`,
            useLocation({ dirname: config.dirname, id: config.id })
          );
        }

        writeResolverMetadata(resolver, config);
        container[typeName][fieldName] = resolver;
      } else if (isResolveOptions(resolver)) {
        if (!container[typeName][fieldName]) {
          container[typeName][fieldName] = {};
        }

        // resolve
        if (isDefined(resolver.resolve)) {
          if (container[typeName][fieldName].resolve) {
            throw new ResolverDuplicatedError(
              `Duplicated resolver of "${typeName}.${fieldName}" (resolve method)`,
              useLocation({ dirname: config.dirname, id: config.id })
            );
          }

          writeResolverMetadata(resolver.resolve, config);
          container[typeName][fieldName].resolve = resolver.resolve;
        }

        // subscribe
        if (isDefined(resolver.subscribe)) {
          if (container[typeName][fieldName].subscribe) {
            throw new ResolverDuplicatedError(
              `Duplicated resolver of "${typeName}.${fieldName}" (subscribe method)`,
              useLocation({ dirname: config.dirname, id: config.id })
            );
          }

          writeResolverMetadata(resolver.subscribe, config);
          container[typeName][fieldName].subscribe = resolver.subscribe;
        }
      }
    }
  }
}

function addScalar({
  typeName,
  resolver,
  container,
  config,
}: {
  typeName: string;
  resolver: GraphQLScalarType;
  container: Single<Resolvers>;
  config: ModuleConfig;
}): void {
  if (container[typeName]) {
    throw new ResolverDuplicatedError(
      `Duplicated resolver of scalar "${typeName}"`,
      useLocation({ dirname: config.dirname, id: config.id })
    );
  }

  writeResolverMetadata(resolver.parseLiteral, config);
  writeResolverMetadata(resolver.parseValue, config);
  writeResolverMetadata(resolver.serialize, config);

  container[typeName] = resolver;
}

function addEnum({
  typeName,
  resolver,
  container,
  config,
}: {
  typeName: string;
  resolver: EnumResolver;
  container: Single<Resolvers>;
  config: ModuleConfig;
}): void {
  if (!container[typeName]) {
    container[typeName] = {};
  }

  for (const key in resolver) {
    if (resolver.hasOwnProperty(key)) {
      const value = resolver[key];

      if (container[typeName][key]) {
        throw new ResolverDuplicatedError(
          `Duplicated resolver of "${typeName}.${key}" enum value`,
          useLocation({ dirname: config.dirname, id: config.id })
        );
      }

      container[typeName][key] = value;
    }
  }
}

/**
 * Helps to make sure a resolver has a corresponding type/field definition.
 * We don't want to pass resolve function that are not related to the module.
 */
function ensureImplements(metadata: ModuleMetadata) {
  return {
    type(name: string, field: string) {
      const type: string[] = []
        .concat(
          metadata.implements?.[name] as any,
          metadata.extends?.[name] as any
        )
        .filter(isDefined);

      if (type?.includes(field)) {
        return true;
      }

      const id = `"${name}.${field}"`;

      throw new ExtraResolverError(
        `Resolver of "${id}" type cannot be implemented`,
        `${id} is not defined`,
        useLocation({ dirname: metadata.dirname, id: metadata.id })
      );
    },
    scalar(name: string) {
      if ((metadata.implements?.__scalars || []).includes(name)) {
        return true;
      }

      throw new ExtraResolverError(
        `Resolver of "${name}" scalar cannot be implemented`,
        `${name} is not defined`,
        useLocation({ dirname: metadata.dirname, id: metadata.id })
      );
    },
  };
}

function writeResolverMetadata(resolver: Function, config: ModuleConfig): void {
  if (!resolver) {
    return;
  }

  (resolver as any)[resolverMetadataProp] = {
    moduleId: config.id,
  } as ResolverMetadata;
}

export function readResolverMetadata(resolver: ResolveFn): ResolverMetadata {
  return (resolver as any)[resolverMetadataProp];
}

/**
 * In order to use middlewares on fields
 * that are defined in SDL but have no implemented resolvers,
 * we would have to recreate GraphQLSchema and wrap resolve functions.
 *
 * Since we can't access GraphQLSchema on a module level
 * and recreating GraphQLSchema seems unreasonable,
 * we can create default resolvers instead.
 *
 * @example
 *
 * gql`
 *  type Query {
 *    me: User!
 *  }
 *
 *  type User {
 *    name: String!
 *  }
 * `
 *
 * The resolver of `Query.me` is implemented and resolver of `User.name` is not.
 * In case where a middleware wants to intercept the resolver of `User.name`,
 * we use a default field resolver from `graphql` package
 * and put it next to other defined resolvers.
 *
 * This way our current logic of wrapping resolvers and running
 * middleware functions stays untouched.
 */
function addDefaultResolvers(
  resolvers: Single<Resolvers>,
  middlewareMap: MiddlewareMap,
  config: ModuleConfig
): Single<Resolvers> {
  const container: Single<Resolvers> = resolvers;

  const sdl = Array.isArray(config.typeDefs)
    ? concatAST(config.typeDefs)
    : config.typeDefs;

  function hasMiddleware(typeName: string, fieldName: string) {
    return (
      (middlewareMap['*']?.['*']?.length ||
        middlewareMap[typeName]?.['*']?.length ||
        middlewareMap[typeName]?.[fieldName]?.length) > 0
    );
  }

  sdl.definitions.forEach((definition) => {
    if (
      definition.kind === Kind.OBJECT_TYPE_DEFINITION ||
      definition.kind === Kind.OBJECT_TYPE_EXTENSION
    ) {
      // Right now we only support Object type
      if (definition.fields) {
        const typeName = definition.name.value;
        definition.fields.forEach((field) => {
          const fieldName = field.name.value;

          if (
            !container[typeName]?.[fieldName] &&
            hasMiddleware(typeName, fieldName)
          ) {
            if (!container[typeName]) {
              container[typeName] = {};
            }

            container[typeName][fieldName] = defaultFieldResolver;
          }
        });
      }
    }
  });

  return container;
}

//
// Resolver helpers
//

function isResolveFn(value: any): value is ResolveFn {
  return typeof value === 'function';
}

interface ResolveOptions {
  resolve?: ResolveFn;
  subscribe?: ResolveFn;
}

function isResolveOptions(value: any): value is ResolveOptions {
  return isDefined(value.resolve) || isDefined(value.subscribe);
}

function isScalarResolver(obj: any): obj is GraphQLScalarType {
  return isScalarType(obj);
}

interface EnumResolver {
  [key: string]: string | number | boolean;
}

function isEnumResolver(obj: any): obj is EnumResolver {
  return Object.values(obj).every(isPrimitive);
}
