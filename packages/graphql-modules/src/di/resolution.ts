import {
  Provider,
  ValueProvider,
  ClassProvider,
  FactoryProvider,
  Type,
  isClassProvider,
  isFactoryProvider,
} from './providers';
import { invalidProviderError, noAnnotationError } from './errors';
import { Key } from './registry';
import { resolveForwardRef } from './forward-ref';
import {
  readInjectableMetadata,
  InjectableParamMetadata,
  hasInjectableMetadata,
} from './metadata';
import { ReflectiveInjector } from './injector';
import { Injectable } from './decorators';

export type NormalizedProvider<T = any> =
  | ValueProvider<T>
  | ClassProvider<T>
  | FactoryProvider<T>;

const _EMPTY_LIST: any[] = [];

export type GlobalProviderMap = {
  has(key: Key['id']): boolean;
  get(key: Key['id']): ReflectiveInjector;
};

export class ResolvedProvider {
  constructor(
    public key: Key,
    public factory: ResolvedFactory
  ) {}
}

export class ResolvedFactory {
  constructor(
    /**
     * Factory function which can return an instance of an object represented by a key.
     */
    public factory: Function,
    /**
     * Arguments (dependencies) to the `factory` function.
     */
    public dependencies: Dependency[],
    /**
     * Methods invoked within ExecutionContext.
     */
    public executionContextIn: Array<string | symbol>,
    /**
     * Has onDestroy hook
     */
    public hasOnDestroyHook: boolean,
    /**
     * Is Global
     */
    public isGlobal: boolean
  ) {}
}

export class Dependency {
  constructor(
    public key: Key,
    public optional: boolean
  ) {}

  static fromKey(key: Key): Dependency {
    return new Dependency(key, false);
  }
}

export function resolveProviders(providers: Provider[]): ResolvedProvider[] {
  const normalized = normalizeProviders(providers, []);
  const resolved = normalized.map(resolveProvider);
  const resolvedProviderMap = mergeResolvedProviders(resolved, new Map());

  return Array.from(resolvedProviderMap.values());
}

function resolveProvider(provider: NormalizedProvider): ResolvedProvider {
  return new ResolvedProvider(
    Key.get(provider.provide),
    resolveFactory(provider)
  );
}

function mergeResolvedProviders(
  providers: ResolvedProvider[],
  normalizedProvidersMap: Map<number, ResolvedProvider>
): Map<number, ResolvedProvider> {
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    normalizedProvidersMap.set(provider.key.id, provider);
  }

  return normalizedProvidersMap;
}

function normalizeProviders(
  providers: Provider[],
  res: Provider[]
): NormalizedProvider[] {
  providers.forEach((token) => {
    if (token instanceof Type) {
      res.push({ provide: token, useClass: token });
    } else if (
      token &&
      typeof token === 'object' &&
      (token as any).provide !== undefined
    ) {
      res.push(token as NormalizedProvider);
    } else if (token instanceof Array) {
      normalizeProviders(token as Provider[], res);
    } else {
      throw invalidProviderError(token);
    }
  });

  return res as NormalizedProvider[];
}

function resolveFactory(provider: NormalizedProvider): ResolvedFactory {
  let factoryFn: Function;
  let resolvedDeps: Dependency[] = _EMPTY_LIST;
  let executionContextIn: Array<string | symbol> = _EMPTY_LIST;
  let hasOnDestroyHook = false;
  let isGlobal: boolean | undefined;

  if (isClassProvider(provider)) {
    const useClass = resolveForwardRef(provider.useClass);

    // Support ES6 (no TypeScript)
    // Sets params coming from static parameters getter
    if (!hasInjectableMetadata(useClass)) {
      Injectable(provider)(useClass);
    }

    factoryFn = makeFactory(useClass);
    resolvedDeps = dependenciesFor(useClass);
    executionContextIn = executionContextInFor(useClass);
    isGlobal = globalFor(useClass);
    hasOnDestroyHook = typeof useClass.prototype.onDestroy === 'function';
  } else if (isFactoryProvider(provider)) {
    factoryFn = provider.useFactory;
    resolvedDeps = constructDependencies(
      provider.useFactory,
      provider.deps || []
    );
    isGlobal = provider.global;

    if (provider.executionContextIn) {
      executionContextIn = provider.executionContextIn;
    }
  } else {
    factoryFn = () => provider.useValue;
    resolvedDeps = _EMPTY_LIST;
    isGlobal = provider.global;
  }

  return new ResolvedFactory(
    factoryFn,
    resolvedDeps,
    executionContextIn,
    hasOnDestroyHook,
    isGlobal ?? false
  );
}

function dependenciesFor(type: any): Dependency[] {
  const { params } = readInjectableMetadata(type, true);

  if (!params) {
    return [];
  }

  if (params.some((p) => p.type == null)) {
    throw noAnnotationError(type, params);
  }

  return params.map((p) => extractToken(p, params));
}

function executionContextInFor(type: any): Array<string | symbol> {
  const { options } = readInjectableMetadata(type, true);

  if (
    options?.executionContextIn &&
    options.executionContextIn !== _EMPTY_LIST
  ) {
    return options?.executionContextIn;
  }

  return [];
}

function globalFor(type: any): boolean {
  const { options } = readInjectableMetadata(type);

  return options?.global ?? false;
}

function constructDependencies(
  typeOrFunc: any,
  dependencies?: any[]
): Dependency[] {
  if (!dependencies) {
    return dependenciesFor(typeOrFunc);
  } else {
    const params = dependencies.map((d) => ({ type: d, optional: false }));
    return params.map((t) => extractToken(t, params));
  }
}

function extractToken(
  param: InjectableParamMetadata,
  params: InjectableParamMetadata[]
) {
  const token = resolveForwardRef(param.type);

  if (token) {
    return createDependency(token, param.optional);
  }

  throw noAnnotationError(param.type, params);
}

function createDependency(token: any, optional: boolean): Dependency {
  return new Dependency(Key.get(token), optional);
}

function makeFactory<T>(t: Type<T>): (args: any[]) => T {
  return (...args: any[]) => new t(...args);
}
