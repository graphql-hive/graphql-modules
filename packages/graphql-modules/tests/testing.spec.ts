import 'reflect-metadata';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { concatAST } from 'graphql';
import { RESTDataSource } from 'apollo-datasource-rest';
import {
  createApplication,
  createModule,
  testkit,
  gql,
  Injectable,
  Inject,
  InjectionToken,
  CONTEXT,
  Scope,
} from '../src';

describe('testModule', () => {
  test('should replace extensions with definitions on demand', () => {
    const initialModule = createModule({
      id: 'tested',
      typeDefs: gql`
        extend type Query {
          foo: Foo!
        }

        type Foo {
          id: ID
        }
      `,
    });
    expect(() =>
      testkit.testModule(initialModule, {
        replaceExtensions: true,
      })
    ).not.toThrow();
  });

  test('should add typeDefs to a module on demand', () => {
    const initialModule = createModule({
      id: 'tested',
      typeDefs: gql`
        type Query {
          foo: Foo!
        }
      `,
    });

    expect(() =>
      testkit.testModule(initialModule, {
        typeDefs: gql`
          type Foo {
            id: ID
          }
        `,
      })
    ).not.toThrow();
  });

  test('should add resolvers to a module on demand', async () => {
    const initialModule = createModule({
      id: 'tested',
      typeDefs: gql`
        type Query {
          foo: Foo!
        }

        type Foo {
          id: ID
        }
      `,
      resolvers: {
        Query: {
          foo() {
            return {
              id: 'not-mocked',
            };
          },
        },
      },
    });

    const app = testkit.testModule(initialModule, {
      resolvers: {
        Foo: {
          id() {
            return 'mocked';
          },
        },
      },
    });

    const result = await testkit.execute(app, {
      document: gql`
        {
          foo {
            id
          }
        }
      `,
    });

    expect(result.data).toEqual({
      foo: {
        id: 'mocked',
      },
    });
  });

  test('should overwrite singleton providers in a module on demand', async () => {
    @Injectable({
      scope: Scope.Singleton,
    })
    class Data {
      getById(id: string) {
        return {
          id,
        };
      }
    }

    const initialModule = createModule({
      id: 'tested',
      typeDefs: gql`
        type Query {
          foo(id: ID!): Foo!
        }

        type Foo {
          id: ID
        }
      `,
      resolvers: {
        Query: {
          foo(
            _: {},
            { id }: { id: string },
            { injector }: GraphQLModules.ModuleContext
          ) {
            return injector.get(Data).getById(id);
          },
        },
      },
      providers: [Data],
    });

    const app = testkit.testModule(initialModule, {
      providers: [
        {
          provide: Data,
          useValue: {
            getById() {
              return {
                id: 'mocked',
              };
            },
          },
        },
      ],
    });

    const result = await testkit.execute(app, {
      document: gql`
        {
          foo(id: "not-mocked") {
            id
          }
        }
      `,
    });

    expect(result.errors).not.toBeDefined();
    expect(result.data).toEqual({
      foo: {
        id: 'mocked',
      },
    });
  });

  test('should overwrite operation providers in a module on demand', async () => {
    @Injectable({
      scope: Scope.Operation,
    })
    class Data {
      getById(id: string) {
        return {
          id,
        };
      }
    }

    const initialModule = createModule({
      id: 'tested',
      typeDefs: gql`
        type Query {
          foo(id: ID!): Foo!
        }

        type Foo {
          id: ID
        }
      `,
      resolvers: {
        Query: {
          foo(
            _: {},
            { id }: { id: string },
            { injector }: GraphQLModules.ModuleContext
          ) {
            return injector.get(Data).getById(id);
          },
        },
      },
      providers: [Data],
    });

    const app = testkit.testModule(initialModule, {
      providers: [
        {
          provide: Data,
          scope: Scope.Operation,
          useValue: {
            getById() {
              return {
                id: 'mocked',
              };
            },
          },
        },
      ],
    });

    const result = await testkit.execute(app, {
      document: gql`
        {
          foo(id: "not-mocked") {
            id
          }
        }
      `,
    });

    expect(result.errors).not.toBeDefined();
    expect(result.data).toEqual({
      foo: {
        id: 'mocked',
      },
    });
  });

  test('should overwrite operation-scoped classes in a module on demand', async () => {
    @Injectable({
      scope: Scope.Operation,
    })
    class Data extends RESTDataSource {
      constructor() {
        super();
      }

      getById(id: string) {
        return {
          id,
        };
      }
    }

    const initialModule = createModule({
      id: 'tested',
      typeDefs: gql`
        type Query {
          foo(id: ID!): Foo!
        }

        type Foo {
          id: ID
        }
      `,
      resolvers: {
        Query: {
          foo(
            _: {},
            { id }: { id: string },
            { injector }: GraphQLModules.ModuleContext
          ) {
            return injector.get(Data).getById(id);
          },
        },
      },
      providers: [Data],
    });

    const app = testkit.testModule(initialModule, {
      providers: [
        {
          provide: Data,
          scope: Scope.Operation,
          useValue: {
            getById() {
              return {
                id: 'mocked',
              };
            },
          },
        },
      ],
    });

    const result = await testkit.execute(app, {
      document: gql`
        {
          foo(id: "not-mocked") {
            id
          }
        }
      `,
    });

    expect(result.errors).not.toBeDefined();
    expect(result.data).toEqual({
      foo: {
        id: 'mocked',
      },
    });
  });

  test('should inherit typeDefs from other modules', () => {
    const initialModule = createModule({
      id: 'tested',
      typeDefs: gql`
        type Query {
          foo: Foo!
          bar: Bar!
        }
      `,
    });

    const externalModule = createModule({
      id: 'external',
      typeDefs: gql`
        type Bar {
          id: ID!
        }
      `,
    });

    expect(() =>
      testkit.testModule(initialModule, {
        typeDefs: gql`
          type Foo {
            id: ID
          }
        `,
        inheritTypeDefs: [externalModule],
      })
    ).not.toThrow();
  });

  test('should inherit typeDefs from other modules and do tree-shaking of types', () => {
    const initialModule = createModule({
      id: 'tested',
      typeDefs: gql`
        type Query {
          foo: Foo!
          bar: Bar!
        }
      `,
    });

    const externalModule = createModule({
      id: 'external',
      typeDefs: gql`
        type Bar {
          id: ID!
        }

        extend type Query {
          unused: Unused
        }

        type Unused {
          id: ID!
        }
      `,
    });

    const app = testkit.testModule(initialModule, {
      typeDefs: gql`
        type Foo {
          id: ID
        }
      `,
      inheritTypeDefs: [externalModule],
    });

    const typeDefs = concatAST(app.typeDefs);

    expect(
      typeDefs.definitions.find((def: any) => def?.name.value === 'Unused')
    ).toBeUndefined();
  });
});

describe('execute', () => {
  test('should work with TypedDocumentNode', async () => {
    const mod = createModule({
      id: 'tested',
      typeDefs: gql`
        type Query {
          foo(id: ID!): Foo!
        }

        type Foo {
          id: ID
        }
      `,
      resolvers: {
        Query: {
          foo(_: {}, { id }: { id: string }) {
            return {
              id,
            };
          },
        },
      },
    });

    const app = createApplication({ modules: [mod] });
    const query: TypedDocumentNode<{ foo: { id: string } }, { id: string }> =
      gql`
        query getFoo($id: String!) {
          foo(id: $id) {
            id
          }
        }
      `;

    const result = await testkit.execute(app, {
      document: query,
      variableValues: {
        id: 'foo',
      },
    });

    expect(result.errors).not.toBeDefined();
    expect(result.data?.foo.id).toEqual('foo');
  });
});

describe('testInjector', () => {
  test('should provide an empty context', () => {
    @Injectable({
      scope: Scope.Singleton,
    })
    class Data {
      constructor(@Inject(CONTEXT) private context: any) {}
      getById(id: string) {
        return {
          ...this.context,
          id,
        };
      }
    }

    const injector = testkit.testInjector([Data]);
    const data = injector.get(Data).getById('mocked');

    expect(data.id).toEqual('mocked');
    expect(Object.keys(data)).toHaveLength(1);
  });

  test('should instantiate all providers', () => {
    const UNKNOWN = new InjectionToken<unknown>('UNKNOWN-TOKEN');

    @Injectable({
      scope: Scope.Singleton,
    })
    class Data {
      constructor(@Inject(UNKNOWN) private missing: any) {}
      getById(id: string) {
        return {
          ...this.missing,
          id,
        };
      }
    }

    expect(() => testkit.testInjector([Data])).toThrow(/UNKNOWN-TOKEN/);
  });
});

describe('readProviderOptions', () => {
  test('should instantiate all providers', () => {
    @Injectable({
      scope: Scope.Singleton,
    })
    class Data {
      getById(id: string) {
        return {
          id,
        };
      }
    }

    const options = testkit.readProviderOptions(Data);

    expect(options?.scope).toBe(Scope.Singleton);
    expect(options?.global).not.toBe(true);
    expect(options?.executionContextIn).not.toBeDefined();
  });
});

describe('mockApplication', () => {
  test('should be able to add providers to Application', async () => {
    const ENV = new InjectionToken<string>('environment');

    @Injectable()
    class Config {
      constructor(@Inject(ENV) private env: string) {}

      getEnv() {
        return this.env;
      }
    }

    const envModule = createModule({
      id: 'env',
      typeDefs: gql`
        type Query {
          env: String!
        }
      `,
      resolvers: {
        Query: {
          env(_source: {}, _args: {}, context: GraphQLModules.ModuleContext) {
            return context.injector.get(Config).getEnv();
          },
        },
      },
    });

    const originalApp = createApplication({
      providers: [
        Config,
        {
          provide: ENV,
          useValue: 'production',
        },
      ],
      modules: [envModule],
    });

    const app = testkit.mockApplication(originalApp).addProviders([
      {
        provide: ENV,
        useValue: 'testing',
      },
    ]);

    const result = await testkit.execute(app, {
      document: gql`
        {
          env
        }
      `,
    });

    expect(result.errors).not.toBeDefined();
    expect(result.data).toEqual({
      env: 'testing',
    });
  });

  test('should be able to replace a module', async () => {
    @Injectable()
    class Config {
      getEnv() {
        return 'production';
      }
    }

    const envModule = createModule({
      id: 'env',
      typeDefs: gql`
        type Query {
          env: String!
        }
      `,
      resolvers: {
        Query: {
          env(_source: {}, _args: {}, context: GraphQLModules.ModuleContext) {
            return context.injector.get(Config).getEnv();
          },
        },
      },
    });

    const originalApp = createApplication({
      providers: [Config],
      modules: [envModule],
    });

    const app = testkit.mockApplication(originalApp).replaceModule(
      testkit.mockModule(envModule, {
        providers: [
          {
            provide: Config,
            useValue: {
              getEnv() {
                return 'mocked';
              },
            },
          },
        ],
      })
    );

    const result = await testkit.execute(app, {
      document: gql`
        {
          env
        }
      `,
    });

    expect(result.errors).not.toBeDefined();
    expect(result.data).toEqual({
      env: 'mocked',
    });
  });

  test('should replace operation-scoped provider in a module', async () => {
    @Injectable({
      scope: Scope.Operation,
      global: true,
    })
    class Config {
      getEnv() {
        return 'production';
      }
    }

    const envModule = createModule({
      id: 'env',
      typeDefs: gql`
        type Query {
          env: String!
        }
      `,
      resolvers: {
        Query: {
          env(_source: {}, _args: {}, context: GraphQLModules.ModuleContext) {
            return context.injector.get(Config).getEnv();
          },
        },
      },
      providers: [Config],
    });

    const extraModule = createModule({
      id: 'extra',
      typeDefs: gql`
        extend type Query {
          extraEnv: String!
        }
      `,
      resolvers: {
        Query: {
          extraEnv(
            _source: {},
            _args: {},
            context: GraphQLModules.ModuleContext
          ) {
            return context.injector.get(Config).getEnv();
          },
        },
      },
    });

    const NOOP = new InjectionToken('noop');

    const originalApp = createApplication({
      providers: [
        {
          provide: NOOP,
          useValue: 'initial',
        },
      ],
      modules: [envModule, extraModule],
    });

    const app = testkit
      .mockApplication(originalApp)
      .replaceModule(
        testkit.mockModule(envModule, {
          providers: [
            {
              provide: Config,
              useValue: {
                getEnv() {
                  return 'mocked';
                },
              },
              scope: Scope.Operation,
              global: true,
            },
          ],
        })
      )
      .addProviders([
        {
          provide: NOOP,
          useValue: 'mocked',
        },
      ]);

    const result = await testkit.execute(app, {
      document: gql`
        {
          env
          extraEnv
        }
      `,
    });

    expect(result.errors).not.toBeDefined();
    expect(result.data).toEqual({
      env: 'mocked',
      extraEnv: 'mocked',
    });
  });
});
