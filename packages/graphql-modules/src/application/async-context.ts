import type { AsyncLocalStorage } from 'async_hooks';

export interface AsyncContext {
  getApplicationContext(): GraphQLModules.AppContext;
  getModuleContext(moduleId: string): GraphQLModules.ModuleContext;
}

let alc: AsyncLocalStorage<AsyncContext> | undefined;
if (typeof process !== 'undefined') {
  const hooks = require('async_hooks') as typeof import('async_hooks');
  alc = new hooks.AsyncLocalStorage();
}

export function getAsyncContext() {
  return alc?.getStore();
}

export function runWithAsyncContext<R, TArgs extends any[]>(
  asyncContext: AsyncContext,
  callback: (...args: TArgs) => R,
  ...args: TArgs
): R {
  if (!alc) {
    return callback(...args);
  }
  return alc.run(asyncContext, callback, ...args);
}
