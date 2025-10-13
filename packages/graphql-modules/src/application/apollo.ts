import { wrapSchema } from '@graphql-tools/wrap';
import { DocumentNode, execute, ExecutionArgs, GraphQLSchema } from 'graphql';
import { uniqueId } from '../shared/utils';
import { InternalAppContext } from './application';
import { ExecutionContextBuilder } from './context';
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
  const createApolloSchema = ({
    fieldResolver,
  }: Pick<ExecutionArgs, 'fieldResolver'> = {}) => {
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

    function getSession(ctx: any) {
      if (!ctx[CONTEXT_ID]) {
        ctx[CONTEXT_ID] = uniqueId((id) => !sessions[id]);
        const { context, ɵdestroy: destroy } = contextBuilder(ctx);

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
        // Create an execution context
        const { context, destroy } = getSession(input.context!);

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
                fieldResolver,
              }) as any
          )
          .finally(destroy);
      },
    });
  };

  return createApolloSchema;
}
