import 'reflect-metadata';
import {
  createApplication,
  createModule,
  Injectable,
  Scope,
  gql,
} from '../src';
import { PubSub } from 'graphql-subscriptions';
import { ExecutionResult } from 'graphql';
import { isAsyncIterable } from '../src/shared/utils';

test('Operation-Scope provider instantiated on every subscription', async () => {
  const spies = {
    posts: jest.fn(),
  };

  @Injectable({
    scope: Scope.Operation,
  })
  class Posts {
    constructor(private pubsub: PubSub) {
      spies.posts();
    }

    all() {
      return [];
    }

    add(title: string) {
      setTimeout(() => {
        this.pubsub.publish('MESSAGE', title);
      }, 0);

      return title;
    }

    listen() {
      return this.pubsub.asyncIterableIterator(['MESSAGE']);
    }
  }

  const pubsub = new PubSub();
  const postsModule = createModule({
    id: 'posts',
    providers: [
      Posts,
      {
        provide: PubSub,
        useValue: pubsub,
      },
    ],
    typeDefs: gql`
      type Post {
        title: String!
      }

      type Query {
        posts: [Post!]!
      }

      type Mutation {
        addPost(title: String!): Post!
      }

      type Subscription {
        onPost: Post!
      }
    `,
    resolvers: {
      Query: {
        posts() {},
      },
      Mutation: {
        addPost(
          _parent: {},
          args: { title: string },
          { injector }: GraphQLModules.ModuleContext
        ) {
          return injector.get(Posts).add(args.title);
        },
      },
      Subscription: {
        onPost: {
          subscribe(
            _parent: {},
            _args: {},
            { injector }: GraphQLModules.ModuleContext
          ) {
            return injector.get(Posts).listen();
          },
          resolve(title: string) {
            return title;
          },
        },
      },
      Post: {
        title: (title: string) => title,
      },
    },
  });

  const newTitle = 'new-title';

  const app = createApplication({
    modules: [postsModule],
  });

  const createContext = () => ({});
  const mutation = gql`
    mutation addPost($title: String!) {
      addPost(title: $title) {
        title
      }
    }
  `;
  const subscription = gql`
    subscription onPost {
      onPost {
        title
      }
    }
  `;

  const execute = app.createExecution();
  const subscribe = app.createSubscription();

  const sub = await subscribe({
    schema: app.schema,
    contextValue: createContext(),
    document: subscription,
  });

  await execute({
    schema: app.schema,
    contextValue: createContext(),
    variableValues: {
      title: newTitle,
    },
    document: mutation,
  });

  await execute({
    schema: app.schema,
    contextValue: createContext(),
    variableValues: {
      title: newTitle,
    },
    document: mutation,
  });

  let receivedEvents: ExecutionResult[] = [];

  if (!isAsyncIterable(sub)) {
    throw new Error('Subscription is not async iterable');
  }
  for await (let event of sub) {
    receivedEvents.push(event);
    if (receivedEvents.length === 2) {
      break;
    }
  }

  expect(receivedEvents[0].data).toEqual({
    onPost: {
      title: newTitle,
    },
  });

  expect(receivedEvents[1].data).toEqual({
    onPost: {
      title: newTitle,
    },
  });

  expect(spies.posts).toHaveBeenCalledTimes(3);
});
