import { makeExecutableSchema } from '@graphql-tools/schema';
import {
  Provider,
  ReflectiveInjector,
  onlySingletonProviders,
  onlyOperationProviders,
  Scope,
} from '../di';
import { ResolvedModule } from '../module/factory';
import { ID } from '../shared/types';
import {
  ModuleDuplicatedError,
  ModuleNonUniqueIdError,
} from '../shared/errors';
import { flatten, isDefined } from '../shared/utils';
import { ApplicationConfig, Application } from './types';
import {
  createGlobalProvidersMap,
  attachGlobalProvidersMap,
  instantiateSingletonProviders,
} from './di';
import { createContextBuilder } from './context';
import { executionCreator } from './execution';
import { subscriptionCreator } from './subscription';
import { apolloSchemaCreator, apolloExecutorCreator } from './apollo';
import { operationControllerCreator } from './operation-controller';
import { Module } from '../module/types';

export type ModulesMap = Map<ID, ResolvedModule>;

/**
 * @internal
 */
export interface InternalAppContext {
  ɵgetModuleContext(
    moduleId: ID,
    context: GraphQLModules.GlobalContext
  ): GraphQLModules.ModuleContext;
}

/**
 * @api
 * Creates Application out of Modules. Accepts `ApplicationConfig`.
 *
 * @example
 *
 * ```typescript
 * import { createApplication } from 'graphql-modules';
 * import { usersModule } from './users';
 * import { postsModule } from './posts';
 * import { commentsModule } from './comments';
 *
 * const app = createApplication({
 *   modules: [
 *     usersModule,
 *     postsModule,
 *     commentsModule
 *   ]
 * })
 * ```
 */
export function createApplication<
  const TProviders extends Provider[] = Provider[],
>(applicationConfig: ApplicationConfig<TProviders>): Application {
  function applicationFactory(cfg?: ApplicationConfig): Application {
    const config = cfg || applicationConfig;
    const providers =
      config.providers && typeof config.providers === 'function'
        ? config.providers()
        : config.providers;
    // Creates an Injector with singleton classes at application level
    const appSingletonProviders = ReflectiveInjector.resolve(
      onlySingletonProviders(providers)
    );
    const appInjector = ReflectiveInjector.createFromResolved({
      name: 'App (Singleton Scope)',
      providers: appSingletonProviders,
    });
    // Filter Operation-scoped providers, and keep it here
    // so we don't do it over and over again
    const appOperationProviders = ReflectiveInjector.resolve(
      onlyOperationProviders(providers)
    );
    const middlewareMap = config.middlewares || {};

    // Validations
    ensureModuleUniqueIds(config.modules);

    // Create all modules
    const modules = config.modules.map((mod) =>
      mod.factory({
        injector: appInjector,
        middlewares: middlewareMap,
      })
    );
    const modulesMap = createModulesMap(modules);
    const singletonGlobalProvidersMap = createGlobalProvidersMap({
      modules,
      scope: Scope.Singleton,
    });
    const operationGlobalProvidersMap = createGlobalProvidersMap({
      modules,
      scope: Scope.Operation,
    });

    attachGlobalProvidersMap({
      injector: appInjector,
      globalProvidersMap: singletonGlobalProvidersMap,
      moduleInjectorGetter(moduleId) {
        return modulesMap.get(moduleId)!.injector;
      },
    });

    // Creating a schema, flattening the typedefs and resolvers
    // is not expensive since it happens only once
    const typeDefs = flatten(modules.map((mod) => mod.typeDefs));
    const resolvers = modules.map((mod) => mod.resolvers).filter(isDefined);
    const schema = (applicationConfig.schemaBuilder || makeExecutableSchema)({
      typeDefs,
      resolvers,
    });

    const contextBuilder = createContextBuilder({
      appInjector,
      appLevelOperationProviders: appOperationProviders,
      modulesMap: modulesMap,
      singletonGlobalProvidersMap,
      operationGlobalProvidersMap,
    });

    const createOperationController = operationControllerCreator({
      contextBuilder,
    });
    const createSubscription = subscriptionCreator({ contextBuilder });
    const createExecution = executionCreator({ contextBuilder });
    const createSchemaForApollo = apolloSchemaCreator({
      createSubscription,
      contextBuilder,
      schema,
    });
    const createApolloExecutor = apolloExecutorCreator({
      createExecution,
    });

    instantiateSingletonProviders({
      appInjector,
      modulesMap,
    });

    return {
      typeDefs,
      resolvers,
      schema,
      injector: appInjector,
      createOperationController,
      createSubscription,
      createExecution,
      createSchemaForApollo,
      createApolloExecutor,
      ɵfactory: applicationFactory,
      ɵconfig: config,
    };
  }

  return applicationFactory();
}

function createModulesMap(modules: ResolvedModule[]): ModulesMap {
  const modulesMap = new Map<string, ResolvedModule>();

  for (const module of modules) {
    if (modulesMap.has(module.id)) {
      const location = module.metadata.dirname;
      const existingLocation = modulesMap.get(module.id)?.metadata.dirname;

      const info = [];

      if (existingLocation) {
        info.push(`Already registered module located at: ${existingLocation}`);
      }

      if (location) {
        info.push(`Duplicated module located at: ${location}`);
      }

      throw new ModuleDuplicatedError(
        `Module "${module.id}" already exists`,
        ...info
      );
    }

    modulesMap.set(module.id, module);
  }

  return modulesMap;
}

function ensureModuleUniqueIds(modules: Module[]) {
  const collisions = modules
    .filter((mod, i, all) => i !== all.findIndex((m) => m.id === mod.id))
    .map((m) => m.id);

  if (collisions.length) {
    throw new ModuleNonUniqueIdError(
      `Modules with non-unique ids: ${collisions.join(', ')}`,
      `All modules should have unique ids, please locate and fix them.`
    );
  }
}
