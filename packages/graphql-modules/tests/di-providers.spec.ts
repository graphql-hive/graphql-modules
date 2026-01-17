import 'reflect-metadata';
import {
  createApplication,
  createModule,
  Injectable,
  Inject,
  InjectionToken,
  CONTEXT,
  MODULE_ID,
  Scope,
  gql,
  testkit,
} from '../src';
import { execute } from 'graphql';
import { ExecutionContext } from '../src/di';

const Test = new InjectionToken<string>('test');

const posts = ['Foo', 'Bar'];
const comments = ['Comment #1', 'Comment #2'];

// Workaround for Babel TypeScript Metadata plugin
type GraphQLModulesModuleContext = GraphQLModules.ModuleContext;
type GraphQLModulesGlobalContext = GraphQLModules.GlobalContext;

test('general test', async () => {
  const spies = {
    logger: jest.fn(),
    posts: {
      moduleId: jest.fn(),
      test: jest.fn(),
      postService: jest.fn(),
      eventService: jest.fn(),
    },
    comments: {
      moduleId: jest.fn(),
      test: jest.fn(),
      commentsService: jest.fn(),
    },
  };

  @Injectable({
    scope: Scope.Operation,
  })
  class Logger {
    constructor() {
      spies.logger();
    }

    log() {}
  }

  @Injectable({
    scope: Scope.Operation,
  })
  class Events {
    constructor() {
      spies.posts.eventService();
    }

    emit() {}
  }

  @Injectable()
  class Posts {
    constructor() {
      spies.posts.postService();
    }

    all() {
      return posts;
    }
  }

  @Injectable()
  class Comments {
    constructor() {
      spies.comments.commentsService();
    }

    all() {
      return comments;
    }
  }

  // Child module
  const commonModule = createModule({
    id: 'common',
    typeDefs: gql`
      type Query {
        _noop: String
      }
    `,
  });

  // Child module
  const postsModule = createModule({
    id: 'posts',
    providers: [
      Posts,
      Events,
      {
        provide: Test,
        useValue: 'mod',
      },
    ],
    typeDefs: gql`
      type Post {
        title: String!
      }

      extend type Query {
        posts: [Post!]!
      }
    `,
    resolvers: {
      Query: {
        posts(
          _parent: {},
          __args: {},
          { injector }: GraphQLModulesModuleContext
        ) {
          spies.posts.moduleId(injector.get(MODULE_ID));
          spies.posts.test(injector.get(Test));
          injector.get(Events).emit();
          injector.get(Logger).log();

          return injector.get(Posts).all();
        },
      },
      Post: {
        title: (title: any) => title,
      },
    },
  });

  // Child module
  const commentsModule = createModule({
    id: 'comments',
    providers: [Comments],
    typeDefs: gql`
      type Comment {
        text: String!
      }

      extend type Query {
        comments: [Comment!]!
      }
    `,
    resolvers: {
      Query: {
        comments(
          _parent: {},
          __args: {},
          { injector }: GraphQLModulesModuleContext
        ) {
          spies.comments.moduleId(injector.get(MODULE_ID));
          spies.comments.test(injector.get(Test));
          injector.get(Logger).log();

          return injector.get(Comments).all();
        },
      },
      Comment: {
        text: (text: any) => text,
      },
    },
  });

  // root module as application
  const appModule = createApplication({
    modules: [commonModule, postsModule, commentsModule],
    providers: [
      Logger,
      {
        provide: Test,
        useValue: 'app',
      },
    ],
  });

  const createContext = () => ({ request: {}, response: {} });

  const document = gql`
    {
      comments {
        text
      }
      posts {
        title
      }
    }
  `;

  const result = await testkit.execute(appModule, {
    contextValue: createContext(),
    document,
  });

  // Should resolve data correctly
  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    comments: comments.map((text) => ({ text })),
    posts: posts.map((title) => ({ title })),
  });

  // Child Injector has priority over Parent Injector
  expect(spies.posts.test).toHaveBeenCalledWith('mod');
  expect(spies.comments.test).toHaveBeenCalledWith('app');

  // Value of MODULE_ID according to module's resolver
  expect(spies.posts.moduleId).toHaveBeenCalledWith('posts');
  expect(spies.comments.moduleId).toHaveBeenCalledWith('comments');

  await testkit.execute(appModule, {
    contextValue: createContext(),
    document,
  });

  // Singleton providers should be called once
  expect(spies.posts.postService).toHaveBeenCalledTimes(1);
  expect(spies.comments.commentsService).toHaveBeenCalledTimes(1);

  // Operation provider should be called twice
  expect(spies.posts.eventService).toHaveBeenCalledTimes(2);
  expect(spies.logger).toHaveBeenCalledTimes(2);
});

test('useFactory with dependencies', async () => {
  const logSpy = jest.fn();

  @Injectable({
    scope: Scope.Singleton,
  })
  class Posts {
    @ExecutionContext()
    context!: ExecutionContext;

    all() {
      const connection = this.context.injector.get(PostsConnection);

      return connection.all();
    }
  }

  class PostsConnection {
    constructor(logger: Logger) {
      logger.log();
    }

    all() {
      return posts;
    }
  }

  @Injectable()
  class Logger {
    log() {
      logSpy();
    }
  }

  const postsModule = createModule({
    id: 'posts',
    providers: [
      Logger,
      Posts,
      {
        provide: PostsConnection,
        scope: Scope.Operation,
        useFactory(logger: Logger) {
          return new PostsConnection(logger);
        },
        deps: [Logger],
      },
    ],
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
          { injector }: GraphQLModulesModuleContext
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

  expect(result1.data).toEqual(data);
  expect(logSpy).toHaveBeenCalledTimes(1);

  const result2 = await testkit.execute(app, {
    contextValue: createContext(),
    document,
  });

  expect(result2.data).toEqual(data);
  expect(logSpy).toHaveBeenCalledTimes(2);
});

test('Use @Inject decorator in constructor', async () => {
  const request = new Object();
  const requestSpy = jest.fn();

  @Injectable({ scope: Scope.Operation })
  class Auth {
    constructor(@Inject(CONTEXT) private context: any) {}

    ping() {
      requestSpy(this.context.request);

      return 'pong';
    }
  }

  const mod = createModule({
    id: 'auth',
    providers: [Auth],
    typeDefs: gql`
      type Query {
        ping: String
      }
    `,
    resolvers: {
      Query: {
        ping(_: any, __: any, { injector }: GraphQLModulesModuleContext) {
          return injector.get(Auth).ping();
        },
      },
    },
  });

  const app = createApplication({ modules: [mod] });

  const result = await testkit.execute(app, {
    contextValue: { request },
    document: gql`
      {
        ping
      }
    `,
  });

  expect(result.errors).not.toBeDefined();
  expect(result.data).toEqual({ ping: 'pong' });
  expect(requestSpy).toHaveBeenCalledWith(request);
});

test('Use useFactory with deps', async () => {
  const request = new Object();
  const requestSpy = jest.fn();
  const REQUEST = new InjectionToken('request');

  @Injectable({ scope: Scope.Operation })
  class Auth {
    constructor(@Inject(REQUEST) private request: any) {}

    ping() {
      requestSpy(this.request);

      return 'pong';
    }
  }

  const mod = createModule({
    id: 'auth',
    providers: [
      Auth,
      {
        provide: REQUEST,
        useFactory(ctx: any) {
          return ctx.request;
        },
        deps: [CONTEXT],
        scope: Scope.Operation,
      },
    ],
    typeDefs: gql`
      type Query {
        ping: String
      }
    `,
    resolvers: {
      Query: {
        ping(_: any, __: any, { injector }: GraphQLModulesModuleContext) {
          return injector.get(Auth).ping();
        },
      },
    },
  });

  const app = createApplication({ modules: [mod] });

  const result = await testkit.execute(app, {
    contextValue: { request },
    document: gql`
      {
        ping
      }
    `,
  });

  expect(result.errors).not.toBeDefined();
  expect(result.data).toEqual({ ping: 'pong' });
  expect(requestSpy).toHaveBeenCalledWith(request);
});

test('Application allows injector access', () => {
  @Injectable()
  class SomeProvider {}
  const { injector } = createApplication({
    modules: [],
    providers: [SomeProvider],
  });
  expect(injector.get(SomeProvider)).toBeInstanceOf(SomeProvider);
});

test('Operation scoped provider should be created once per GraphQL Operation', async () => {
  const constructorSpy = jest.fn();
  const loadSpy = jest.fn();

  @Injectable({
    scope: Scope.Operation,
  })
  class Dataloader {
    constructor(@Inject(CONTEXT) context: GraphQLModulesGlobalContext) {
      constructorSpy(context);
    }

    load(id: number) {
      loadSpy(id);
      return {
        id,
        title: 'Sample Title',
      };
    }
  }

  const postsModule = createModule({
    id: 'posts',
    providers: [Dataloader],
    typeDefs: gql`
      type Post {
        id: Int!
        title: String!
      }

      type Query {
        post(id: Int!): Post!
      }
    `,
    resolvers: {
      Query: {
        post(
          _parent: {},
          args: { id: number },
          { injector }: GraphQLModulesModuleContext
        ) {
          return injector.get(Dataloader).load(args.id);
        },
      },
    },
  });

  const app = createApplication({
    modules: [postsModule],
  });

  const contextValue = { request: {}, response: {} };
  const document = gql`
    {
      foo: post(id: 1) {
        id
        title
      }
      bar: post(id: 1) {
        id
        title
      }
    }
  `;

  const result = await testkit.execute(app, {
    contextValue,
    document,
  });

  // Should resolve data correctly
  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    foo: {
      id: 1,
      title: 'Sample Title',
    },
    bar: {
      id: 1,
      title: 'Sample Title',
    },
  });

  expect(constructorSpy).toHaveBeenCalledTimes(1);
  expect(constructorSpy).toHaveBeenCalledWith(
    expect.objectContaining(contextValue)
  );

  expect(loadSpy).toHaveBeenCalledTimes(2);
  expect(loadSpy).toHaveBeenCalledWith(1);
});

test('Operation scoped provider should be created once per GraphQL Operation (Apollo Server)', async () => {
  const constructorSpy = jest.fn();
  const loadSpy = jest.fn();

  @Injectable({
    scope: Scope.Operation,
  })
  class Dataloader {
    constructor(@Inject(CONTEXT) context: GraphQLModulesGlobalContext) {
      constructorSpy(context);
    }

    load(id: number) {
      loadSpy(id);
      return {
        id,
        title: 'Sample Title',
      };
    }
  }

  const postsModule = createModule({
    id: 'posts',
    providers: [Dataloader],
    typeDefs: gql`
      type Post {
        id: Int!
        title: String!
      }

      type Query {
        post(id: Int!): Post!
      }
    `,
    resolvers: {
      Query: {
        post(
          _parent: {},
          args: { id: number },
          { injector }: GraphQLModulesModuleContext
        ) {
          return injector.get(Dataloader).load(args.id);
        },
      },
    },
  });

  const app = createApplication({
    modules: [postsModule],
  });

  const schema = app.createSchemaForApollo();

  const contextValue = { request: {}, response: {} };
  const document = gql`
    {
      foo: post(id: 1) {
        id
        title
      }
      bar: post(id: 1) {
        id
        title
      }
    }
  `;

  const result = await execute({
    schema,
    contextValue,
    document,
  });

  // Should resolve data correctly
  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    foo: {
      id: 1,
      title: 'Sample Title',
    },
    bar: {
      id: 1,
      title: 'Sample Title',
    },
  });

  expect(constructorSpy).toHaveBeenCalledTimes(1);
  expect(constructorSpy).toHaveBeenCalledWith(
    expect.objectContaining(contextValue)
  );

  expect(loadSpy).toHaveBeenCalledTimes(2);
  expect(loadSpy).toHaveBeenCalledWith(1);
});

test('Singleton scoped provider should be created once', async () => {
  const constructorSpy = jest.fn();

  @Injectable({
    scope: Scope.Singleton,
  })
  class Data {
    constructor() {
      constructorSpy();
    }

    lorem() {
      return 'ipsum';
    }
  }

  const mod = createModule({
    id: 'mod',
    // providers: [Data],
    typeDefs: gql`
      type Query {
        lorem: String!
      }
    `,
    resolvers: {
      Query: {
        lorem(
          _parent: {},
          _args: {},
          { injector }: GraphQLModulesModuleContext
        ) {
          return injector.get(Data).lorem();
        },
      },
    },
  });

  const app = createApplication({
    modules: [mod],
    providers: [Data],
  });

  const contextValue = { request: {}, response: {} };
  const document = gql`
    {
      lorem
    }
  `;

  const execution = app.createExecution();

  const result1 = await execution({
    schema: app.schema,
    contextValue,
    document,
  });

  expect(result1.errors).toBeUndefined();
  expect(result1.data).toEqual({
    lorem: 'ipsum',
  });
  expect(constructorSpy).toHaveBeenCalledTimes(1);

  const result2 = await execution({
    schema: app.schema,
    contextValue,
    document,
  });

  expect(result2.errors).toBeUndefined();
  expect(result2.data).toEqual({
    lorem: 'ipsum',
  });
  expect(constructorSpy).toHaveBeenCalledTimes(1);
});

test('Global Token provided by one module should be accessible by other modules (operation)', async () => {
  @Injectable({
    scope: Scope.Operation,
    global: true,
  })
  class Data {
    lorem() {
      return 'ipsum';
    }
  }

  const fooModule = createModule({
    id: 'foo',
    providers: [Data],
    typeDefs: gql`
      type Query {
        foo: String!
      }
    `,
    resolvers: {
      Query: {
        foo(_parent: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
          return injector.get(Data).lorem();
        },
      },
    },
  });

  const barModule = createModule({
    id: 'bar',
    typeDefs: gql`
      extend type Query {
        bar: String!
      }
    `,
    resolvers: {
      Query: {
        bar(_parent: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
          return injector.get(Data).lorem();
        },
      },
    },
  });

  const app = createApplication({
    modules: [fooModule, barModule],
  });

  const contextValue = { request: {}, response: {} };
  const document = gql`
    {
      foo
      bar
    }
  `;

  const result = await testkit.execute(app, {
    contextValue,
    document,
  });

  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    foo: 'ipsum',
    bar: 'ipsum',
  });
});

test('Global Token (module) should use other local tokens (operation)', async () => {
  const LogLevel = new InjectionToken<string>('log-level');
  const logger = jest.fn();

  @Injectable({
    scope: Scope.Operation,
    global: true,
  })
  class Data {
    constructor(@Inject(LogLevel) private logLevel: string) {}

    lorem() {
      logger(this.logLevel);
      return 'ipsum';
    }
  }

  @Injectable({
    scope: Scope.Operation,
  })
  class AppData {
    constructor(private data: Data) {}

    ispum() {
      return this.data.lorem();
    }
  }

  const fooModule = createModule({
    id: 'foo',
    providers: [Data, { provide: LogLevel, useValue: 'info' }],
    typeDefs: gql`
      type Query {
        foo: String!
      }
    `,
    resolvers: {
      Query: {
        foo(_parent: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
          return injector.get(Data).lorem();
        },
      },
    },
  });

  const barModule = createModule({
    id: 'bar',
    providers: [
      {
        provide: LogLevel,
        useValue: 'error',
        scope: Scope.Operation,
      },
    ],
    typeDefs: gql`
      extend type Query {
        bar: String!
      }
    `,
    resolvers: {
      Query: {
        bar(_parent: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
          return injector.get(Data).lorem();
        },
      },
    },
  });

  const app = createApplication({
    modules: [fooModule, barModule],
    providers: [
      AppData,
      {
        provide: LogLevel,
        useValue: 'verbose',
        scope: Scope.Operation,
      },
    ],
  });

  const contextValue = { request: {}, response: {} };
  const document = gql`
    {
      foo
      bar
    }
  `;

  const result = await testkit.execute(app, {
    contextValue,
    document,
  });

  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    foo: 'ipsum',
    bar: 'ipsum',
  });

  expect(logger).toHaveBeenCalledTimes(2);
  expect(logger).toHaveBeenNthCalledWith(1, 'info');
  expect(logger).toHaveBeenNthCalledWith(2, 'info');
});

test('Global Token provided by one module should be accessible by other modules (singleton)', async () => {
  @Injectable({
    scope: Scope.Singleton,
    global: true,
  })
  class Data {
    lorem() {
      return 'ipsum';
    }
  }

  @Injectable({
    scope: Scope.Singleton,
  })
  class AppData {
    constructor(private data: Data) {}

    ispum() {
      return this.data.lorem();
    }
  }

  const fooModule = createModule({
    id: 'foo',
    providers: [Data],
    typeDefs: gql`
      type Query {
        foo: String!
      }
    `,
    resolvers: {
      Query: {
        foo(_parent: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
          return injector.get(Data).lorem();
        },
      },
    },
  });

  const barModule = createModule({
    id: 'bar',
    typeDefs: gql`
      extend type Query {
        bar: String!
      }
    `,
    resolvers: {
      Query: {
        bar(_parent: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
          return injector.get(Data).lorem();
        },
      },
    },
  });

  const app = createApplication({
    modules: [fooModule, barModule],
    providers: [AppData],
  });

  const contextValue = { request: {}, response: {} };
  const document = gql`
    {
      foo
      bar
    }
  `;

  const result = await testkit.execute(app, {
    contextValue,
    document,
  });

  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    foo: 'ipsum',
    bar: 'ipsum',
  });
});

test('Global Token (module) should use other local tokens (singleton)', async () => {
  const LogLevel = new InjectionToken<string>('log-level');
  const logger = jest.fn();

  @Injectable({
    scope: Scope.Singleton,
    global: true,
  })
  class Data {
    constructor(@Inject(LogLevel) private logLevel: string) {}

    lorem() {
      logger(this.logLevel);
      return 'ipsum';
    }
  }

  @Injectable({
    scope: Scope.Singleton,
  })
  class AppData {
    constructor(private data: Data) {}

    ispum() {
      return this.data.lorem();
    }
  }

  const fooModule = createModule({
    id: 'foo',
    providers: [Data, { provide: LogLevel, useValue: 'info' }],
    typeDefs: gql`
      type Query {
        foo: String!
      }
    `,
    resolvers: {
      Query: {
        foo(_parent: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
          return injector.get(Data).lorem();
        },
      },
    },
  });

  const barModule = createModule({
    id: 'bar',
    providers: [
      {
        provide: LogLevel,
        useValue: 'error',
      },
    ],
    typeDefs: gql`
      extend type Query {
        bar: String!
      }
    `,
    resolvers: {
      Query: {
        bar(_parent: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
          return injector.get(Data).lorem();
        },
      },
    },
  });

  const app = createApplication({
    modules: [fooModule, barModule],
    providers: [
      AppData,
      {
        provide: LogLevel,
        useValue: 'verbose',
      },
    ],
  });

  const contextValue = { request: {}, response: {} };
  const document = gql`
    {
      foo
      bar
    }
  `;

  const result = await testkit.execute(app, {
    contextValue,
    document,
  });

  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    foo: 'ipsum',
    bar: 'ipsum',
  });

  expect(logger).toHaveBeenCalledTimes(2);
  expect(logger).toHaveBeenNthCalledWith(1, 'info');
  expect(logger).toHaveBeenNthCalledWith(2, 'info');
});

test('instantiate all singleton providers', async () => {
  const spies = {
    logger: jest.fn(),
    data: jest.fn(),
    appData: jest.fn(),
  };

  @Injectable()
  class MyLogger {
    constructor() {
      spies.logger();
    }
  }

  @Injectable()
  class Data {
    constructor(logger: MyLogger) {
      spies.data(logger);
    }

    value() {
      return 'foo';
    }
  }

  @Injectable()
  class AppData {
    constructor() {
      spies.appData();
    }
  }

  const fooModule = createModule({
    id: 'foo',
    providers: [Data],
    typeDefs: gql`
      type Query {
        foo: String!
      }
    `,
    resolvers: {
      Query: {
        foo(_parent: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
          return injector.get(Data).value();
        },
      },
    },
  });

  const app = createApplication({
    modules: [fooModule],
    providers: [AppData, MyLogger],
  });

  // make sure all providers are instantiated
  expect(spies.logger).toBeCalledTimes(1);
  expect(spies.data).toBeCalledTimes(1);
  expect(spies.appData).toBeCalledTimes(1);

  const contextValue = { request: {}, response: {} };
  const document = gql`
    {
      foo
    }
  `;

  const result = await testkit.execute(app, {
    contextValue,
    document,
  });

  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    foo: 'foo',
  });

  // make sure no providers are instantiated again
  expect(spies.logger).toBeCalledTimes(1);
  expect(spies.data).toBeCalledTimes(1);
  expect(spies.appData).toBeCalledTimes(1);
});

test('instantiate all singleton and global providers', async () => {
  const spies = {
    logger: jest.fn(),
    data: jest.fn(),
    appData: jest.fn(),
  };

  @Injectable()
  class MyLogger {
    constructor() {
      spies.logger();
    }
  }

  @Injectable({
    global: true,
  })
  class Data {
    constructor(logger: MyLogger) {
      spies.data(logger);
    }

    value() {
      return 'foo';
    }
  }

  @Injectable()
  class AppData {
    constructor() {
      spies.appData();
    }
  }

  const fooModule = createModule({
    id: 'foo',
    providers: [Data],
    typeDefs: gql`
      type Query {
        foo: String!
      }
    `,
    resolvers: {
      Query: {
        foo() {},
      },
    },
  });

  const barModule = createModule({
    id: 'bar',
    typeDefs: gql`
      extend type Query {
        bar: String!
      }
    `,
    resolvers: {
      Query: {
        bar(_parent: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
          return injector.get(Data).value();
        },
      },
    },
  });

  const app = createApplication({
    modules: [fooModule, barModule],
    providers: [AppData, MyLogger],
  });

  // make sure all providers are instantiated
  expect(spies.logger).toBeCalledTimes(1);
  expect(spies.data).toBeCalledTimes(1);
  expect(spies.appData).toBeCalledTimes(1);

  const contextValue = { request: {}, response: {} };
  const document = gql`
    {
      bar
    }
  `;

  const result = await testkit.execute(app, {
    contextValue,
    document,
  });

  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    bar: 'foo',
  });

  // make sure no providers are instantiated again
  expect(spies.logger).toBeCalledTimes(1);
  expect(spies.data).toBeCalledTimes(1);
  expect(spies.appData).toBeCalledTimes(1);
});

test('instantiate operation-scoped provider once per many fields', async () => {
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
        q1(_root: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
          injector.get(Logger).log();

          return 'q1';
        },
        q2(_root: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
          injector.get(Logger).log();
          return 'q2';
        },
      },
      Mutation: {
        m1(_root: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
          injector.get(Logger).log();
          return 'm1';
        },
        m2(_root: {}, _args: {}, { injector }: GraphQLModulesModuleContext) {
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

  let result = await testkit.execute(app, {
    contextValue: {},
    document: gql`
      {
        q1
        q2
      }
    `,
  });

  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    q1: 'q1',
    q2: 'q2',
  });

  expect(constructor).toBeCalledTimes(1);
  expect(log).toBeCalledTimes(2);

  constructor.mockClear();
  log.mockClear();

  result = await testkit.execute(app, {
    contextValue: {},
    document: gql`
      mutation m {
        m1
        m2
      }
    `,
  });

  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    m1: 'm1',
    m2: 'm2',
  });

  expect(constructor).toBeCalledTimes(1);
  expect(log).toBeCalledTimes(2);
});

test('Last operation-scoped provider in the list wins', async () => {
  const token = new InjectionToken<string>('token');

  const app = createApplication({
    modules: [
      createModule({
        id: 'mod',
        typeDefs: gql`
          type Query {
            token: String
          }
        `,
        resolvers: {
          Query: {
            token(_: {}, __: {}, { injector }: GraphQLModules.ModuleContext) {
              return injector.get(token);
            },
          },
        },
      }),
    ],
    providers: [
      {
        provide: token,
        useValue: 'first',
      },
      {
        provide: token,
        useValue: 'second',
      },
      {
        provide: token,
        useValue: 'last',
      },
    ],
  });

  const result = await testkit.execute(app, {
    contextValue: {},
    document: gql`
      {
        token
      }
    `,
  });

  expect(result.errors).not.toBeDefined();
  expect(result.data?.token).toEqual('last');
});

test('accessing global singleton provider (app) from global singleton provider (module)', async () => {
  @Injectable({
    scope: Scope.Singleton,
    global: true,
  })
  class AppData {
    public async uppercase(text: string) {
      return text.toUpperCase();
    }
  }

  @Injectable({
    scope: Scope.Singleton,
    global: true,
  })
  class ModuleData {
    constructor(private appData: AppData) {}

    public async uppercase(text: string) {
      return this.appData.uppercase(text);
    }
  }

  const fooModule = createModule({
    id: 'foo',
    providers: [ModuleData],
    typeDefs: gql`
      type Query {
        uppercase(text: String!): String!
      }
    `,
    resolvers: {
      Query: {
        uppercase(
          _: {},
          { text }: { text: string },
          { injector }: GraphQLModules.ModuleContext
        ) {
          return injector.get(ModuleData).uppercase(text);
        },
      },
    },
  });

  const app = createApplication({
    modules: [fooModule],
    providers: [AppData],
  });

  const result = await testkit.execute(app, {
    contextValue: {},
    variableValues: {
      text: 'gil',
    },
    document: gql`
      query up($text: String!) {
        uppercase(text: $text)
      }
    `,
  });

  expect(result.errors).not.toBeDefined();
  expect(result.data?.uppercase).toBe('GIL');
});

test('accessing global singleton provider (app) from global singleton provider (module) that depends on non-global singleton (app)', async () => {
  @Injectable({
    scope: Scope.Singleton,
  })
  class TextTransforms {
    uppercase(text: string) {
      return text.toUpperCase();
    }
  }

  @Injectable({
    scope: Scope.Singleton,
    global: true,
  })
  class AppData {
    constructor(private textTransforms: TextTransforms) {}

    public async uppercase(text: string) {
      return this.textTransforms.uppercase(text);
    }
  }

  @Injectable({
    scope: Scope.Singleton,
    global: true,
  })
  class ModuleData {
    constructor(private appData: AppData) {}

    public async uppercase(text: string) {
      return this.appData.uppercase(text);
    }
  }

  const fooModule = createModule({
    id: 'foo',
    providers: [ModuleData],
    typeDefs: gql`
      type Query {
        uppercase(text: String!): String!
      }
    `,
    resolvers: {
      Query: {
        uppercase(
          _: {},
          { text }: { text: string },
          { injector }: GraphQLModules.ModuleContext
        ) {
          return injector.get(ModuleData).uppercase(text);
        },
      },
    },
  });

  const app = createApplication({
    modules: [fooModule],
    providers: [AppData, TextTransforms],
  });

  const result = await testkit.execute(app, {
    contextValue: {},
    variableValues: {
      text: 'gil',
    },
    document: gql`
      query up($text: String!) {
        uppercase(text: $text)
      }
    `,
  });

  expect(result.errors).not.toBeDefined();
  expect(result.data?.uppercase).toBe('GIL');
});
