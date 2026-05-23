import { Injector, ReflectiveInjector } from '../di';
import { ResolvedProvider } from '../di/resolution';
import { ID } from '../shared/types';
import { once, merge } from '../shared/utils';
import type { InternalAppContext, ModulesMap } from './application';
import async_context from '#async-context';
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

    // See https://github.com/graphql-hive/graphql-modules/pull/2681
    //
    // Heavy per-operation values (the user-supplied `context`, and the
    // `appContext` we derive from it) are reachable via this function's
    // closure scope, which is shared by every closure created below of it —
    // including the one used by AsyncLocalStorae frame.
    //
    // Since https://github.com/nodejs/node/pull/48528, any async resource
    // scheduled while we're inside that `AsyncLocalStorage.run` (like global setTimeout,
    // an telemetry exporter timer, a deferred promise reaction, …)
    // snapshots and captures the current `AsyncContextFrame`.
    //
    // If that resource outlives the operation (=defined globally, or just have a longer lifetime),
    // then the snapshot keeps the AsyncLocalStorage-stored object alive, which keeps this scope alive — which
    // pins `context` forever.
    //
    // Routing the heavy values through a mutable holder lets `ɵdestroy`
    // detach them from the (still pinned) scope by nulling the holder's
    // properties; the closures continue to exist but no longer reach
    // anything that matters.
    const refs: {
      context: GraphQLModules.GlobalContext | undefined;
      appContext: GraphQLModules.AppContext | undefined;
    } = {
      context,
      appContext: undefined,
    };

    attachGlobalProvidersMap({
      injector: appInjector,
      globalProvidersMap: singletonGlobalProvidersMap,
      moduleInjectorGetter(moduleId) {
        return modulesMap.get(moduleId)!.injector;
      },
    });

    appInjector.setExecutionContextGetter(function executionContextGetter() {
      return (
        async_context.getAsyncContext()?.getApplicationContext() ||
        refs.appContext
      );
    } as any);

    function createModuleExecutionContextGetter(moduleId: string) {
      return function moduleExecutionContextGetter() {
        return (
          async_context.getAsyncContext()?.getModuleContext(moduleId) ||
          (refs.context ? getModuleContext(moduleId, refs.context) : undefined)!
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
    //
    // The CONTEXT provider used to be `useValue: context` — but a useValue
    // provider's resolved factory closure captures `context`,
    // creating an independent retention path (Provider → ResolvedFactory →
    // factory closure → useValue) that `ɵdestroy` cannot reach.
    //
    // Switching to a `useFactory` that reads through the `refs` holder routes that
    // path through the same indirection as the rest of the scope, so
    // nulling `refs.context` in `ɵdestroy` also severs the provider path.
    const operationAppInjector = ReflectiveInjector.createFromResolved({
      name: 'App (Operation Scope)',
      providers: appLevelOperationProviders.concat(
        ReflectiveInjector.resolve([
          {
            provide: CONTEXT,
            useFactory: () => refs.context,
            deps: [],
          },
        ])
      ),
      parent: appInjector,
    });

    // Create a context for application-level ExecutionContext
    refs.appContext = merge(refs.context!, {
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
        providersToDestroy = [];

        // Detach every closure-captured path from the user-supplied
        // `context` so a pinned AsyncContextFrame snapshot can no
        // longer keep it in memory.
        refs.context = undefined;
        refs.appContext = undefined;

        // `sharedContext` is exposed as `env.context`,
        //  so we keep its identity but strip its data fields
        for (const key of Object.keys(sharedContext)) {
          if (key !== 'ɵgetModuleContext') {
            delete (sharedContext as any)[key];
          }
        }

        // Drop the operation-scoped injector's resolved-instance
        // cache AND its static provider configs
        const op = operationAppInjector as unknown as {
          _providers: unknown[];
          _objs: unknown[];
          _keyIds: unknown[];
        };
        op._providers.length = 0;
        op._objs.length = 0;
        op._keyIds.length = 0;
      }),
      ɵinjector: operationAppInjector,
      context: sharedContext,
    };

    return {
      ...env,
      runWithContext(cb) {
        return async_context.runWithAsyncContext(
          {
            getApplicationContext() {
              return refs.appContext!;
            },
            getModuleContext(moduleId) {
              return refs.context
                ? getModuleContext(moduleId, refs.context)
                : (undefined as any);
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
