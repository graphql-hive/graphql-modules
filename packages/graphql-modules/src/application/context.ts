import { Injector, ReflectiveInjector } from '../di';
import { ResolvedProvider } from '../di/resolution';
import { ID } from '../shared/types';
import { once, merge } from '../shared/utils';
import type { InternalAppContext, ModulesMap } from './application';
import { getAsyncContext, runWithAsyncContext } from './async-context';
import { attachGlobalProvidersMap } from './di';
import { CONTEXT } from './tokens';

export type ExecutionContextBuilder<
  TContext extends {
    [key: string]: any;
  } = {},
> = (context: TContext) => ExecutionContextEnv & {
  runWithContext<TReturn = any>(
    cb: (env: ExecutionContextEnv) => TReturn
  ): TReturn;
};

export type ExecutionContextEnv = {
  context: InternalAppContext;
  ɵdestroy(): void;
  ɵinjector: Injector;
};

export function createContextBuilder({
  appInjector,
  modulesMap,
  appLevelOperationProviders,
  singletonGlobalProvidersMap,
  operationGlobalProvidersMap,
}: {
  appInjector: ReflectiveInjector;
  appLevelOperationProviders: ResolvedProvider[];
  singletonGlobalProvidersMap: {
    [key: string]: string;
  };
  operationGlobalProvidersMap: {
    [key: string]: string;
  };
  modulesMap: ModulesMap;
}) {
  // This is very critical. It creates an execution context.
  // It has to run on every operation.

  const contextBuilder: ExecutionContextBuilder<
    GraphQLModules.GlobalContext
  > = (context) => {
    // Cache for context per module
    let contextCache: Record<ID, GraphQLModules.ModuleContext> = {};
    // A list of providers with OnDestroy hooks
    // It's a tuple because we want to know which Injector controls the provider
    // and we want to know if the provider was even instantiated.
    let providersToDestroy: Array<[ReflectiveInjector, number]> = [];

    function registerProvidersToDestroy(injector: ReflectiveInjector) {
      injector._providers.forEach((provider) => {
        if (provider.factory.hasOnDestroyHook) {
          // keep provider key's id (it doesn't change over time)
          // and related injector
          providersToDestroy.push([injector, provider.key.id]);
        }
      });
    }

    let appContext: GraphQLModules.AppContext;

    attachGlobalProvidersMap({
      injector: appInjector,
      globalProvidersMap: singletonGlobalProvidersMap,
      moduleInjectorGetter(moduleId) {
        return modulesMap.get(moduleId)!.injector;
      },
    });

    appInjector.setExecutionContextGetter(function executionContextGetter() {
      return getAsyncContext()?.getApplicationContext() || appContext;
    } as any);

    function createModuleExecutionContextGetter(moduleId: string) {
      return function moduleExecutionContextGetter() {
        return (
          getAsyncContext()?.getModuleContext(moduleId) ||
          getModuleContext(moduleId, context)
        );
      };
    }

    modulesMap.forEach((mod, moduleId) => {
      mod.injector.setExecutionContextGetter(
        createModuleExecutionContextGetter(moduleId)
      );
    });

    // As the name of the Injector says, it's an Operation scoped Injector
    // Application level
    // Operation scoped - means it's created and destroyed on every GraphQL Operation
    const operationAppInjector = ReflectiveInjector.createFromResolved({
      name: 'App (Operation Scope)',
      providers: appLevelOperationProviders.concat(
        ReflectiveInjector.resolve([
          {
            provide: CONTEXT,
            useValue: context,
          },
        ])
      ),
      parent: appInjector,
    });

    // Create a context for application-level ExecutionContext
    appContext = merge(context, {
      injector: operationAppInjector,
    });

    // Track Providers with OnDestroy hooks
    registerProvidersToDestroy(operationAppInjector);

    function getModuleContext(
      moduleId: string,
      ctx: GraphQLModules.GlobalContext
    ): GraphQLModules.ModuleContext {
      // Reuse a context or create if not available
      if (!contextCache[moduleId]) {
        // We're interested in operation-scoped providers only
        const providers = modulesMap.get(moduleId)?.operationProviders!;

        // Create module-level Operation-scoped Injector
        const operationModuleInjector = ReflectiveInjector.createFromResolved({
          name: `Module "${moduleId}" (Operation Scope)`,
          providers: providers.concat(
            ReflectiveInjector.resolve([
              {
                provide: CONTEXT,
                useFactory() {
                  return contextCache[moduleId];
                },
              },
            ])
          ),
          // This injector has a priority
          parent: modulesMap.get(moduleId)!.injector,
          // over this one
          fallbackParent: operationAppInjector,
        });

        // Same as on application level, we need to collect providers with OnDestroy hooks
        registerProvidersToDestroy(operationModuleInjector);

        contextCache[moduleId] = merge(ctx, {
          injector: operationModuleInjector,
          moduleId,
        });
      }

      return contextCache[moduleId];
    }

    const sharedContext = merge(
      // We want to pass the received context
      context || {},
      {
        // Here's something very crutial
        // It's a function that is used in module's context creation
        ɵgetModuleContext: getModuleContext,
      }
    );

    attachGlobalProvidersMap({
      injector: operationAppInjector,
      globalProvidersMap: operationGlobalProvidersMap,
      moduleInjectorGetter(moduleId) {
        return getModuleContext(moduleId, sharedContext).injector as any;
      },
    });

    const env: ExecutionContextEnv = {
      ɵdestroy: once(() => {
        providersToDestroy.forEach(([injector, keyId]) => {
          // If provider was instantiated
          if (injector._isObjectDefinedByKeyId(keyId)) {
            // call its OnDestroy hook
            injector._getObjByKeyId(keyId).onDestroy();
          }
        });
        contextCache = {};
      }),
      ɵinjector: operationAppInjector,
      context: sharedContext,
    };

    return {
      ...env,
      runWithContext(cb) {
        return runWithAsyncContext(
          {
            getApplicationContext() {
              return appContext;
            },
            getModuleContext(moduleId) {
              return getModuleContext(moduleId, context);
            },
          },
          cb,
          env
        );
      },
    };
  };

  return contextBuilder;
}
