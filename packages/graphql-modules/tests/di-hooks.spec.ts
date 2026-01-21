import 'reflect-metadata';
import {
  createApplication,
  createModule,
  Injectable,
  Scope,
  ExecutionContext,
  gql,
  testkit,
} from '../src';

const posts = ['Foo', 'Bar'];

test('OnDestroy hook', async () => {
  const spies = {
    onDestroy: jest.fn(),
  };

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

  @Injectable({
    scope: Scope.Operation,
  })
  class PostsConnection {
    id: number;

    constructor() {
      this.id = Math.random();
    }

    all() {
      return posts;
    }

    onDestroy() {
      spies.onDestroy();
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

  expect(result1.data).toEqual(data);
  expect(spies.onDestroy).toHaveBeenCalledTimes(1);

  const result2 = await testkit.execute(app, {
    contextValue: createContext(),
    document,
  });

  expect(result2.data).toEqual(data);
  expect(spies.onDestroy).toHaveBeenCalledTimes(2);
});
