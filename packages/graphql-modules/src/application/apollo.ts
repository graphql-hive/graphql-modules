import { wrapSchema } from '@graphql-tools/wrap';
import { DocumentNode, execute, GraphQLSchema } from 'graphql';
import { uniqueId } from '../shared/utils';
import { InternalAppContext } from './application';
import { ExecutionContextBuilder, ExecutionContextEnv } from './context';
import { Application } from './types';

const CONTEXT_ID = Symbol.for('context-id');

export interface ApolloRequestContext {
  document: DocumentNode;
  operationName?: string | null;
  context?: any;
  schema: GraphQLSchema;
  request: {
    variables?: { [name: string]: any } | null;
  };
}

export function apolloExecutorCreator({
  createExecution,
}: {
  createExecution: Application['createExecution'];
}): Application['createApolloExecutor'] {
  return function createApolloExecutor(options) {
    const executor = createExecution(options);
    return async function executorAdapter(
      requestContext: ApolloRequestContext
    ) {
      return executor({
        schema: requestContext.schema,
        document: requestContext.document,
        operationName: requestContext.operationName,
        variableValues: requestContext.request.variables,
        contextValue: requestContext.context,
      });
    };
  };
}

export function apolloSchemaCreator({
  createSubscription,
  contextBuilder,
  schema,
}: {
  createSubscription: Application['createSubscription'];
  contextBuilder: ExecutionContextBuilder;
  schema: GraphQLSchema;
}) {
  const createApolloSchema = () => {
    const sessions: Record<
      string,
      {
        count: number;
        session: {
          destroy(): void;
          context: InternalAppContext;
        };
      }
    > = {};
    const subscription = createSubscription();

    function getSession(
      ctx: any,
      { context, ɵdestroy: destroy }: ExecutionContextEnv
    ) {
      if (!ctx[CONTEXT_ID]) {
        ctx[CONTEXT_ID] = uniqueId((id) => !sessions[id]);
        sessions[ctx[CONTEXT_ID]] = {
          count: 0,
          session: {
            context,
            destroy() {
              if (--sessions[ctx[CONTEXT_ID]].count === 0) {
                destroy();
                delete sessions[ctx[CONTEXT_ID]];
                delete ctx[CONTEXT_ID];
              }
            },
          },
        };
      }

      sessions[ctx[CONTEXT_ID]].count++;

      return sessions[ctx[CONTEXT_ID]].session;
    }

    return wrapSchema({
      schema,
      batch: true,
      executor(input) {
        if (input.operationType === 'subscription') {
          return subscription({
            schema,
            document: input.document,
            variableValues: input.variables as any,
            contextValue: input.context,
            rootValue: input.rootValue,
            operationName: input.operationName,
          });
        }

        // Create an execution context and run within it
        return contextBuilder(input.context!).runWithContext((env) => {
          const { context, destroy } = getSession(input.context!, env);

          // It's important to wrap the executeFn within a promise
          // so we can easily control the end of execution (with finally)
          return Promise.resolve()
            .then(
              () =>
                execute({
                  schema,
                  document: input.document,
                  contextValue: context,
                  variableValues: input.variables as any,
                  rootValue: input.rootValue,
                  operationName: input.operationName,
                }) as any
            )
            .finally(destroy);
        });
      },
    });
  };

  return createApolloSchema;
}
