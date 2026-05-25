import {
  execute,
  subscribe,
  DocumentNode,
  GraphQLSchema,
  ExecutionResult,
} from 'graphql';
import type { Provider, Injector } from '../di';
import type { Resolvers, Module, MockedModule } from '../module/types';
import type { MiddlewareMap } from '../shared/middleware';
import type { ApolloRequestContext } from './apollo';
import type { Single } from '../shared/types';
import type { InternalAppContext } from './application';
import { ExecutionContextEnv } from './context';

type Execution = typeof execute;
type Subscription = typeof subscribe;
export type ApolloExecutor = (
  requestContext: ApolloRequestContext
) => Promise<ExecutionResult>;

export interface MockedApplication extends Application {
  replaceModule(mockedModule: MockedModule): MockedApplication;
  addProviders(providers: ApplicationConfig['providers']): MockedApplication;
}

/**
 * @api
 * A return type of `createApplication` function.
 */
export interface Application {
  /**
   * A list of type definitions defined by modules.
   */
  readonly typeDefs: DocumentNode[];
  /**
   * An object with resolve functions defined by modules.
   */
  readonly resolvers?: Single<Resolvers>;
  /**
   * Ready to use GraphQLSchema object combined from modules.
   */
  readonly schema: GraphQLSchema;
  /**
   * The application (Singleton) injector.
   */
  readonly injector: Injector;
  /**
   * Take over control of GraphQL Operation
   */
  createOperationController(input: {
    context: any;
    autoDestroy?: boolean;
  }): OperationController;
  /**
   * Creates a `subscribe` function that runs the subscription phase of GraphQL.
   * Important when using GraphQL Subscriptions.
   */
  createSubscription(options?: {
    subscribe?: typeof subscribe;
    controller?: OperationController;
  }): Subscription;
  /**
   * Creates a `execute` function that runs the execution phase of GraphQL.
   * Important when using GraphQL Queries and Mutations.
   */
  createExecution(options?: {
    execute?: typeof execute;
    controller?: OperationController;
  }): Execution;
  /**
   * @deprecated Use `createApolloExecutor`, `createExecution` and `createSubscription` methods instead.
   */
  createSchemaForApollo(): GraphQLSchema;
  /**
   * Experimental
   */
  createApolloExecutor(options?: {
    controller?: OperationController;
  }): ApolloExecutor;
  /**
   * @internal
   */
  ɵfactory(config?: ApplicationConfig | undefined): Application;
  /**
   * @internal
   */
  ɵconfig: ApplicationConfig;
}

export interface OperationController {
  /**
   * Destroys
   */
  destroy(): void;
  /**
   * @internal
   */
  ɵdestroy(): void;
  context: InternalAppContext;
  /**
   * Operation Injector (application)
   */
  injector: Injector;
  /**
   * @internal
   *
   * Wraps a callback in this operation's AsyncLocalStorage frame so that
   * `@ExecutionContext()` reads resolve to *this* operation, not whichever
   * operation most recently called `contextBuilder`.
   *
   * Required for safe concurrent controller-backed executions — without
   * the wrapper, `appInjector._executionContextGetter` (shared, last-writer
   * wins) leaks context across overlapping requests after any `await`.
   */
  ɵrunWithContext<TReturn>(cb: (env: ExecutionContextEnv) => TReturn): TReturn;
}

/**
 * @api
 * Application's configuration object. Represents the first argument of `createApplication` function.
 */
export interface ApplicationConfig {
  /**
   * A list of GraphQL Modules
   */
  modules: Module[];
  /**
   * A list of Providers - read the ["Providers and Tokens"](./di/providers) chapter.
   */
  providers?: Provider[] | (() => Provider[]);
  /**
   * A map of middlewares - read the ["Middlewares"](./advanced/middlewares) chapter.
   */
  middlewares?: MiddlewareMap;
  /**
   * Creates a GraphQLSchema object out of typeDefs and resolvers
   *
   * @example
   *
   * ```typescript
   * import { createApplication } from 'graphql-modules';
   * import { makeExecutableSchema } from '@graphql-tools/schema';
   *
   * const app = createApplication({
   *   modules: [],
   *   schemaBuilder: makeExecutableSchema
   * })
   * ```
   */
  schemaBuilder?(input: {
    typeDefs: DocumentNode[];
    resolvers: Record<string, any>[];
  }): GraphQLSchema;
}
