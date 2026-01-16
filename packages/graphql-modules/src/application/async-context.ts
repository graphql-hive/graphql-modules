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

// TODO: use async-context.node for node and async-context.browser for browser
