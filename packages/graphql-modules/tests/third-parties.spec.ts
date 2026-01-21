import 'reflect-metadata';
import {
  createApplication,
  createModule,
  gql,
  Injectable,
  Scope,
} from '../src';
import { ApolloServer } from 'apollo-server-express';

describe('Apollo Server', () => {
  test('cacheControl available in info object', async () => {
    const spy = jest.fn();
    const mod = createModule({
      id: 'test',
      typeDefs: gql`
        type Query {
          foo: Boolean!
        }
      `,
      resolvers: {
        Query: {
          foo(_: {}, __: {}, ___: {}, { cacheControl }: any) {
            spy(cacheControl);
            return true;
          },
        },
      },
    });
    const app = createApplication({
      modules: [mod],
    });
    const apollo = new ApolloServer({
      typeDefs: app.typeDefs,
      resolvers: app.resolvers,
      executor: app.createApolloExecutor(),
    });

    const response = await apollo.executeOperation({
      query: /* GraphQL */ `
        query foo {
          foo
        }
      `,
      operationName: 'foo',
    });

    expect(response.errors).toBeUndefined();
    expect(response.data?.foo).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        setCacheHint: expect.any(Function),
      })
    );
  });

  test('createApolloExecutor should instantiate operation-scoped provider once per many fields', async () => {
    const constructor = jest.fn();
    const log = jest.fn();

    @Injectable({
      scope: Scope.Operation,
    })
    class Logger {
      constructor() {
        constructor();
      }

      log() {
        log();
      }
    }

    const mod = createModule({
      id: 'foo',
      typeDefs: gql`
        type Query {
          q1: String
          q2: String
        }

        type Mutation {
          m1: String
          m2: String
        }
      `,
      resolvers: {
        Query: {
          q1(_root: {}, _args: {}, { injector }: GraphQLModules.ModuleContext) {
            injector.get(Logger).log();

            return 'q1';
          },
          q2(_root: {}, _args: {}, { injector }: GraphQLModules.ModuleContext) {
            injector.get(Logger).log();
            return 'q2';
          },
        },
        Mutation: {
          m1(_root: {}, _args: {}, { injector }: GraphQLModules.ModuleContext) {
            injector.get(Logger).log();
            return 'm1';
          },
          m2(_root: {}, _args: {}, { injector }: GraphQLModules.ModuleContext) {
            injector.get(Logger).log();
            return 'm2';
          },
        },
      },
      providers: [Logger],
    });

    const app = createApplication({
      modules: [mod],
    });

    const apollo = new ApolloServer({
      typeDefs: app.typeDefs,
      resolvers: app.resolvers,
      executor: app.createApolloExecutor(),
    });

    const result = await apollo.executeOperation({
      query: /* GraphQL */ `
        mutation m {
          m1
          m2
        }
      `,
      operationName: 'm',
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      m1: 'm1',
      m2: 'm2',
    });

    expect(constructor).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(2);
  });
});
