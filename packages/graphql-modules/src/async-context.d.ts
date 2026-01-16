export interface AsyncContext {
  getApplicationContext(): GraphQLModules.AppContext;
  getModuleContext(moduleId: string): GraphQLModules.ModuleContext;
}

export type GetAsyncContext = () => AsyncContext | undefined;

export type RunWithAsyncContext = <R, TArgs extends any[]>(
  asyncContext: AsyncContext,
  callback: (...args: TArgs) => R,
  ...args: TArgs
) => R;

// safe, will be replaced in package json
export const getAsyncContext: GetAsyncContext = undefined;
export const runWithAsyncContext: RunWithAsyncContext = undefined;
