import 'reflect-metadata';
import {
  createApplication,
  createModule,
  Injectable,
  Scope,
  ExecutionContext,
  gql,
  InjectionToken,
  testkit,
  CONTEXT,
  Inject,
} from '../src';
import { compileQuery, isCompiledQuery } from 'graphql-jit';

const posts = ['Foo', 'Bar'];

test('ExecutionContext on module level provider', async () => {
  const spies = {
    posts: jest.fn(),
    connection: jest.fn(),
    connectionId: jest.fn(),
  };

  @Injectable({
    scope: Scope.Singleton,
  })
  class Posts {
    @ExecutionContext()
    context!: ExecutionContext;

    constructor() {
      spies.posts();
    }

    all() {
      const connection = this.context.injector.get(PostsConnection);
      spies.connectionId(connection.id);

      return connection.all();
    }
  }

  @Injectable({
    scope: Scope.Operation,
  })
  class PostsConnection {
    id: number;

    constructor() {
      spies.connection();
      this.id = Math.random();
    }

    all() {
      return posts;
    }
  }

  const postsModule = createModule({
    id: 'posts',
    providers: [Posts, PostsConnection],
    typeDefs: gql`
      type Post {
        title: String!
      }

      type Query {
        posts: [Post!]!
      }
    `,
    resolvers: {
      Query: {
        posts(
          _parent: {},
          __args: {},
          { injector }: GraphQLModules.ModuleContext
        ) {
          return injector.get(Posts).all();
        },
      },
      Post: {
        title: (title: any) => title,
      },
    },
  });

  const app = createApplication({
    modules: [postsModule],
  });

  const createContext = () => ({ request: {}, response: {} });
  const document = gql`
    {
      posts {
        title
      }
    }
  `;

  const data = {
    posts: posts.map((title) => ({ title })),
  };

  const result1 = await testkit.execute(app, {
    contextValue: createContext(),
    document,
  });

  expect(result1.errors).toBeUndefined();
  expect(result1.data).toEqual(data);

  const result2 = await testkit.execute(app, {
    contextValue: createContext(),
    document,
  });

  expect(result2.errors).toBeUndefined();
  expect(result2.data).toEqual(data);

  expect(spies.posts).toBeCalledTimes(1);
  expect(spies.connection).toBeCalledTimes(2);
  expect(spies.connectionId).toBeCalledTimes(2);

  // ExecutionContext accessed in two executions
  // should equal two different connections
  expect(spies.connectionId.mock.calls[0][0]).not.toEqual(
    spies.connectionId.mock.calls[1][0]
  );
});

test('ExecutionContext on application level provider', async () => {
  const spies = {
    posts: jest.fn(),
    connection: jest.fn(),
    connectionId: jest.fn(),
  };

  @Injectable({
    scope: Scope.Singleton,
  })
  class Posts {
    @ExecutionContext()
    context!: ExecutionContext;

    constructor() {
      spies.posts();
    }

    all() {
      const connection = this.context.injector.get(PostsConnection);
      spies.connectionId(connection.id);

      return connection.all();
    }
  }

  @Injectable({
    scope: Scope.Operation,
  })
  class PostsConnection {
    id: number;

    constructor() {
      spies.connection();
      this.id = Math.random();
    }

    all() {
      return posts;
    }
  }

  const postsModule = createModule({
    id: 'posts',
    typeDefs: gql`
      type Post {
        title: String!
      }

      type Query {
        posts: [Post!]!
      }
    `,
    resolvers: {
      Query: {
        posts(
          _parent: {},
          __args: {},
          { injector }: GraphQLModules.ModuleContext
        ) {
          return injector.get(Posts).all();
        },
      },
      Post: {
        title: (title: any) => title,
      },
    },
  });

  const app = createApplication({
    modules: [postsModule],
    providers: [Posts, PostsConnection],
  });

  const createContext = () => ({ request: {}, response: {} });
  const document = gql`
    {
      posts {
        title
      }
    }
  `;

  const data = {
    posts: posts.map((title) => ({ title })),
  };

  const result1 = await testkit.execute(app, {
    contextValue: createContext(),
    document,
  });

  expect(result1.data).toEqual(data);

  const result2 = await testkit.execute(app, {
    contextValue: createContext(),
    document,
  });

  expect(result2.data).toEqual(data);

  expect(spies.posts).toBeCalledTimes(1);
  expect(spies.connection).toBeCalledTimes(2);
  expect(spies.connectionId).toBeCalledTimes(2);

  // ExecutionContext accessed in two executions
  // should equal two different connections
  expect(spies.connectionId.mock.calls[0][0]).not.toEqual(
    spies.connectionId.mock.calls[1][0]
  );
});

test('ExecutionContext on module level global provider', async () => {
  const spies = {
    posts: jest.fn(),
    executionContext: jest.fn(),
  };

  @Injectable({
    scope: Scope.Singleton,
    global: true,
  })
  class Posts {
    @ExecutionContext()
    context!: ExecutionContext;

    constructor() {
      spies.posts();
    }

    all() {
      spies.executionContext(this.context);

      return [];
    }
  }

  const postsModule = createModule({
    id: 'posts',
    typeDefs: gql`
      type Post {
        title: String!
      }

      type Query {
        posts: [Post!]!
      }
    `,
    resolvers: {
      Query: {
        posts(
          _parent: {},
          __args: {},
          { injector }: GraphQLModules.ModuleContext
        ) {
          return injector.get(Posts).all();
        },
      },
      Post: {
        title: (title: any) => title,
      },
    },
    providers: [Posts],
  });

  const app = createApplication({
    modules: [postsModule],
  });

  const createContext = () => ({ request: {}, response: {} });
  const document = gql`
    {
      posts {
        title
      }
    }
  `;

  const expectedData = {
    posts: [],
  };

  const contextValue = createContext();

  const result = await testkit.execute(app, {
    contextValue,
    document,
  });

  expect(result.data).toEqual(expectedData);
  expect(spies.posts).toBeCalledTimes(1);
  expect(spies.executionContext).toHaveBeenCalledTimes(1);
  expect(spies.executionContext).toHaveBeenCalledWith(
    expect.objectContaining(contextValue)
  );
});

test('ExecutionContext on application level global provider', async () => {
  const spies = {
    posts: jest.fn(),
    executionContext: jest.fn(),
  };

  @Injectable({
    scope: Scope.Singleton,
    global: true,
  })
  class Posts {
    @ExecutionContext()
    context!: ExecutionContext;

    constructor() {
      spies.posts();
    }

    all() {
      spies.executionContext(this.context);

      return [];
    }
  }

  const postsModule = createModule({
    id: 'posts',
    typeDefs: gql`
      type Post {
        title: String!
      }

      type Query {
        posts: [Post!]!
      }
    `,
    resolvers: {
      Query: {
        posts(
          _parent: {},
          __args: {},
          { injector }: GraphQLModules.ModuleContext
        ) {
          return injector.get(Posts).all();
        },
      },
      Post: {
        title: (title: any) => title,
      },
    },
  });

  const app = createApplication({
    modules: [postsModule],
    providers: [Posts],
  });

  const createContext = () => ({ noop() {} });
  const document = gql`
    {
      posts {
        title
      }
    }
  `;

  const expectedData = {
    posts: [],
  };

  const contextValue = createContext();

  const result = await testkit.execute(app, {
    contextValue,
    document,
  });

  expect(result.data).toEqual(expectedData);
  expect(spies.posts).toBeCalledTimes(1);
  expect(spies.executionContext).toHaveBeenCalledTimes(1);
  expect(spies.executionContext).toHaveBeenCalledWith(
    expect.objectContaining(contextValue)
  );
});

test('accessing a singleton provider with execution context in another singleton provider', async () => {
  const spies = {
    foo: jest.fn(),
    bar: jest.fn(),
  };

  const Name = new InjectionToken<string>('name');

  @Injectable({
    scope: Scope.Singleton,
  })
  class Foo {
    @ExecutionContext()
    public context!: ExecutionContext;

    constructor() {
      spies.foo();
    }

    getName() {
      return this.context.injector.get(Name);
    }
  }

  @Injectable({
    scope: Scope.Singleton,
  })
  class Bar {
    constructor(private foo: Foo) {
      spies.bar(foo);
    }

    getName() {
      return this.foo.getName();
    }
  }

  const mod = createModule({
    id: 'mod',
    providers: [Foo, Bar],
    typeDefs: gql`
      type Query {
        getName: String
        getDependencyName: String
      }
    `,
    resolvers: {
      Query: {
        getName: (_a: {}, _b: {}, { injector }: GraphQLModules.Context) =>
          injector.get(Foo).getName(),
        getDependencyName: (
          _a: {},
          _b: {},
          { injector }: GraphQLModules.Context
        ) => injector.get(Bar).getName(),
      },
    },
  });

  const expectedName = 'works';

  const app = createApplication({
    modules: [mod],
    providers: [
      {
        provide: Name,
        useValue: expectedName,
      },
    ],
  });

  const result = await testkit.execute(app, {
    contextValue: {},
    document: gql`
      {
        getName
        getDependencyName
      }
    `,
  });

  expect(spies.bar).toHaveBeenCalledTimes(1);
  expect(spies.foo).toHaveBeenCalledTimes(1);

  expect(result.errors).not.toBeDefined();
  expect(result.data).toEqual({
    getName: expectedName,
    getDependencyName: expectedName,
  });
});

test('accessing a singleton provider with execution context in another singleton provider (parallel requests)', async () => {
  const spies = {
    foo: jest.fn(),
    bar: jest.fn(),
    baz: jest.fn(),
  };

  const Name = new InjectionToken<Promise<string>>('name');

  @Injectable({
    scope: Scope.Singleton,
  })
  class Foo {
    @ExecutionContext()
    public context!: ExecutionContext;

    constructor() {
      spies.foo();
    }

    async getName() {
      return this.context.injector.get(Name);
    }
  }

  @Injectable({
    scope: Scope.Singleton,
  })
  class Bar {
    constructor(private foo: Foo) {
      spies.bar();
    }

    async getName() {
      return this.foo.getName();
    }
  }

  @Injectable({
    scope: Scope.Operation,
  })
  class Baz {
    constructor(
      @Inject(Name)
      private name: Promise<string>
    ) {
      spies.baz();
    }

    async getName() {
      return this.name;
    }
  }

  const mod = createModule({
    id: 'mod',
    providers: [Foo, Bar, Baz],
    typeDefs: gql`
      type Query {
        getName: String
        getDependencyName: String
        getNameFromContext: String
      }
    `,
    resolvers: {
      Query: {
        getName: async (_a: {}, _b: {}, { injector }: GraphQLModules.Context) =>
          injector.get(Foo).getName(),
        getDependencyName: async (
          _a: {},
          _b: {},
          { injector }: GraphQLModules.Context
        ) => injector.get(Bar).getName(),
        getNameFromContext: async (
          _a: {},
          _b: {},
          { injector }: GraphQLModules.Context
        ) => injector.get(Baz).getName(),
      },
    },
  });

  const app = createApplication({
    modules: [mod],
    providers: [
      {
        provide: Name,
        scope: Scope.Operation,
        useFactory(ctx) {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(`request-${ctx.requestId}`);
            }, Math.random() * 200);
          });
        },
        deps: [CONTEXT],
      },
    ],
  });

  const requests = new Array({ length: 5 }).map((_, i) => i);

  const results = await Promise.all(
    requests.map((i) =>
      testkit.execute(app, {
        contextValue: {
          requestId: i,
        },
        document: gql`
          {
            getName
            getDependencyName
            getNameFromContext
          }
        `,
      })
    )
  );

  expect(spies.bar).toHaveBeenCalledTimes(results.length);
  expect(spies.foo).toHaveBeenCalledTimes(results.length);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const expectedName = `request-${i}`;
    expect(result.errors).not.toBeDefined();
    expect(result.data).toEqual({
      getName: expectedName,
      getDependencyName: expectedName,
      getNameFromContext: expectedName,
    });
  }
});

test('accessing a singleton provider with execution context in another singleton provider (parallel requests and graphql-jit)', async () => {
  const spies = {
    foo: jest.fn(),
    bar: jest.fn(),
    baz: jest.fn(),
  };

  const Name = new InjectionToken<Promise<string>>('name');

  @Injectable({
    scope: Scope.Singleton,
  })
  class Foo {
    @ExecutionContext()
    public context!: ExecutionContext;

    constructor() {
      spies.foo();
    }

    async getName() {
      return this.context.injector.get(Name);
    }
  }

  @Injectable({
    scope: Scope.Singleton,
  })
  class Bar {
    constructor(private foo: Foo) {
      spies.bar();
    }

    async getName() {
      return this.foo.getName();
    }
  }

  @Injectable({
    scope: Scope.Operation,
  })
  class Baz {
    constructor(
      @Inject(Name)
      private name: Promise<string>
    ) {
      spies.baz();
    }

    async getName() {
      return this.name;
    }
  }

  const mod = createModule({
    id: 'mod',
    providers: [Foo, Bar, Baz],
    typeDefs: gql`
      type Query {
        name: Name
      }

      type Name {
        getName: String
        getDependencyName: String
        getNameFromContext: String
      }
    `,
    resolvers: {
      Query: {
        name: () => ({}),
      },
      Name: {
        // make sure that __isTypeOf works with JIT
        __isTypeOf: () => true,
        getName: async (_a: {}, _b: {}, { injector }: GraphQLModules.Context) =>
          injector.get(Foo).getName(),
        getDependencyName: async (
          _a: {},
          _b: {},
          { injector }: GraphQLModules.Context
        ) => injector.get(Bar).getName(),
        getNameFromContext: async (
          _a: {},
          _b: {},
          { injector }: GraphQLModules.Context
        ) => injector.get(Baz).getName(),
      },
    },
  });

  const app = createApplication({
    modules: [mod],
    providers: [
      {
        provide: Name,
        scope: Scope.Operation,
        useFactory(ctx) {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(`request-${ctx.requestId}`);
            }, Math.random() * 200);
          });
        },
        deps: [CONTEXT],
      },
    ],
  });

  const requests = new Array({ length: 5 }).map((_, i) => i);

  const query = gql`
    {
      name {
        getName
        getDependencyName
        getNameFromContext
      }
    }
  `;
  const compiledQuery = compileQuery(app.schema, query, undefined);

  if (!isCompiledQuery(compiledQuery)) {
    throw new Error('Failed to to compile a query');
  }

  const results = await Promise.all(
    requests.map(async (i) => {
      const controller = app.createOperationController({
        context: {
          requestId: i,
        },
        autoDestroy: false,
      });
      return Promise.resolve(
        compiledQuery.query(
          {}, // root
          controller.context, // context
          {} // variables
        )
      ).finally(() => {
        controller.destroy();
      });
    })
  );

  expect(spies.bar).toHaveBeenCalledTimes(results.length);
  expect(spies.foo).toHaveBeenCalledTimes(results.length);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const expectedName = `request-${i}`;
    expect(result.errors).not.toBeDefined();
    expect(result.data).toEqual({
      name: {
        getName: expectedName,
        getDependencyName: expectedName,
        getNameFromContext: expectedName,
      },
    });
  }
});

test('accessing a singleton provider context after another asynchronous execution', async () => {
  @Injectable({ scope: Scope.Singleton })
  class IdentifierProvider {
    @ExecutionContext()
    private context: any;
    getId() {
      return this.context.identifier;
    }
  }

  const { promise: gettingBefore, resolve: gotBefore } = createDeferred();

  const { promise: waitForGettingAfter, resolve: getAfter } = createDeferred();

  const mod = createModule({
    id: 'mod',
    providers: [IdentifierProvider],
    typeDefs: gql`
      type Query {
        getAsyncIdentifiers: Identifiers!
      }

      type Identifiers {
        before: String!
        after: String!
      }
    `,
    resolvers: {
      Query: {
        async getAsyncIdentifiers(
          _0: unknown,
          _1: unknown,
          context: GraphQLModules.Context
        ) {
          const before = context.injector.get(IdentifierProvider).getId();
          gotBefore();
          await waitForGettingAfter;
          const after = context.injector.get(IdentifierProvider).getId();
          return { before, after };
        },
      },
    },
  });

  const app = createApplication({
    modules: [mod],
  });

  const document = gql`
    {
      getAsyncIdentifiers {
        before
        after
      }
    }
  `;

  const firstResult$ = testkit.execute(app, {
    contextValue: {
      identifier: 'first',
    },
    document,
  });

  await gettingBefore;

  const secondResult$ = testkit.execute(app, {
    contextValue: {
      identifier: 'second',
    },
    document,
  });

  getAfter();

  await expect(firstResult$).resolves.toEqual({
    data: {
      getAsyncIdentifiers: {
        before: 'first',
        after: 'first',
      },
    },
  });

  await expect(secondResult$).resolves.toEqual({
    data: {
      getAsyncIdentifiers: {
        before: 'second',
        after: 'second',
      },
    },
  });
});

function createDeferred<T = void>() {
  let resolve!: (val: T) => void, reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    promise,
    resolve,
    reject,
  };
}
