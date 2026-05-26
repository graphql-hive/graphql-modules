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

/**
 * Installs a getter-based view of `refs.context` onto `target` — every
 * string/symbol-keyed property of `source` (captured at call time) becomes
 * an accessor on `target` that delegates to `refs.context` dynamically.
 *
 * The view therefore holds no user data of its own; once `refs.context`
 * is nulled (in `ɵdestroy`), every accessor returns `undefined` and the
 * original user-context object is no longer reachable from the view.
 *
 * The helper lives at module scope (rather than inside `contextBuilder`)
 * so it doesn't close over the per-operation `context` parameter — that
 * keeps the operation's V8 scope free of any captured reference to the
 * user context other than `refs`, which is what makes the leak fix work.
 */
function defineUserContextAccessors(
  target: object,
  source: GraphQLModules.GlobalContext | undefined,
  refs: { context: GraphQLModules.GlobalContext | undefined }
): void {
  if (source === undefined || source === null) return;
  const define = (key: string | symbol): void => {
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: true,
      get(): unknown {
        return refs.context === undefined
          ? undefined
          : (refs.context as Record<string | symbol, unknown>)[key];
      },
      set(value: unknown): void {
        if (refs.context !== undefined) {
          (refs.context as Record<string | symbol, unknown>)[key] = value;
        }
      },
    });
  };
  for (const key of Object.keys(source)) define(key);
  for (const sym of Object.getOwnPropertySymbols(source)) define(sym);
}

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

    // The cached `CONTEXT` injection value. `ReflectiveInjector` caches
    // the resolved instance forever in `_objs[i]`, so if we returned the
    // raw `refs.context` here that cache would pin the user's context
    // object even after `ɵdestroy` nulls `refs.context`. Returning a
    // view that *reads through* `refs.context` keeps the cached object
    // payload-free. See `defineUserContextAccessors` at module scope.
    const contextView: GraphQLModules.GlobalContext = Object.create(null);
    defineUserContextAccessors(contextView, context, refs);

    // As the name of the Injector says, it's an Operation scoped Injector
    // Application level
    // Operation scoped - means it's created and destroyed on every GraphQL Operation
    const operationAppInjector = ReflectiveInjector.createFromResolved({
      name: 'App (Operation Scope)',
      providers: appLevelOperationProviders.concat(
        ReflectiveInjector.resolve([
          {
            provide: CONTEXT,
            useFactory: () => contextView,
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

    // sharedContext — exposed publicly as `env.context`. Same shape as a
    // `merge(context, { ɵgetModuleContext })` would produce, but its
    // user-context fields are getter accessors over `refs.context`
    // (see `defineUserContextAccessors` at module scope) rather than
    // independent shallow copies. Once `refs.context` is nulled the user
    // payload is unreachable from `sharedContext` too, without us having
    // to mutate the object's keys in `ɵdestroy`.
    const sharedContext: InternalAppContext = {
      // It's a function that is used in module's context creation
      ɵgetModuleContext: getModuleContext,
    };
    defineUserContextAccessors(sharedContext, context, refs);

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

        // All retention paths from this closure scope to the
        // user-supplied `context` route through `refs`:
        //   - `sharedContext` (= env.context) and the cached CONTEXT
        //     injector value are getter-based views over `refs.context`,
        //   - `appInjector._executionContextGetter` reads through
        //     `refs.appContext`.
        // Nulling the holder slots is the only cleanup required —
        // public-facing identities (`sharedContext`, `ɵinjector`) keep
        // working for any post-destroy reads, but the heavy user
        // payload becomes unreachable from this scope.
        refs.context = undefined;
        refs.appContext = undefined;
        // The function parameter `context` is itself a captured binding
        // in this lexical scope. Even though no surviving closure reads
        // it directly (everything goes through `refs`), V8's scope info
        // may keep the binding alive for as long as any closure in this
        // scope is reachable. Reassigning it here makes that binding
        // empty too — without this, the original user `context` object
        // remains pinned by the scope itself.
        context = undefined as any;
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
