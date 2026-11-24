import { describe, test, expect } from 'vitest';
import {
  mergeMiddlewareMaps,
  createMiddleware,
  Middleware,
} from '../src/shared/middleware';
import { createApplication, createModule, gql, testkit } from '../src';

test('should pick * middlewares before field and before type', async () => {
  const order: string[] = [];

  function createFn(label: string): Middleware {
    return (_, next) => {
      order.push(label);
      return next();
    };
  }

  const map = {
    '*': {
      '*': [createFn('*')],
    },
    Query: {
      '*': [createFn('Query.*')],
      foo: [createFn('Query.foo')],
    },
  };

  const middleware = createMiddleware(['Query', 'foo'], map);

  await middleware(
    {
      root: {},
      args: {},
      context: {} as any,
      info: {} as any,
    },
    async () => null
  );

  expect(order).toEqual(['*', 'Query.*', 'Query.foo']);
});

test('middleware should intercept the resolve result', async () => {
  const normalized = {
    '*': {
      '*': [async () => 'intercepted'],
    },
  };

  const middleware = createMiddleware(['Query', 'foo'], normalized);

  const result = await middleware(
    {
      root: {},
      args: {},
      context: {} as any,
      info: {} as any,
    },
    async () => 'not intercepted'
  );

  expect(result).toEqual('intercepted');
});

test('middleware should intercept the arguments', async () => {
  const middleware = createMiddleware(['Query', 'foo'], {
    '*': {
      '*': [
        async ({ args }, next) => {
          args.foo = 'intercepted';
          return next();
        },
        async ({ args }) => args.foo,
      ],
    },
  });

  const result = await middleware(
    {
      root: {},
      args: {
        foo: 'foo',
      },
      context: {} as any,
      info: {} as any,
    },
    async () => 'not intercepted'
  );

  expect(result).toEqual('intercepted');
});

test('middleware should intercept the resolve result even when there are more middlewares to run', async () => {
  const normalized = {
    '*': {
      '*': [async () => 'intercepted'],
    },
    Query: {
      foo: [async () => 'NO NO NO'],
    },
  };

  const middleware = createMiddleware(['Query', 'foo'], normalized);

  const result = await middleware(
    {
      root: {},
      args: {},
      context: {} as any,
      info: {} as any,
    },
    async () => 'not intercepted'
  );

  expect(result).toEqual('intercepted');
});

test('middleware should intercept the resolve function with an error', async () => {
  const normalized = {
    '*': {
      '*': [
        async () => {
          throw new Error('intercepted');
        },
      ],
    },
  };

  const middleware = createMiddleware(['Query', 'foo'], normalized);

  try {
    await middleware(
      {
        root: {},
        args: {},
        context: {} as any,
        info: {} as any,
      },
      async () => 'not intercepted'
    );
  } catch (error: any) {
    expect(error.message).toEqual('intercepted');
  }

  expect.hasAssertions();
});

test('should put app first when merging', async () => {
  const order: string[] = [];

  function createFn(label: string): Middleware {
    return (_, next) => {
      order.push(label);
      return next();
    };
  }

  const app = {
    '*': {
      '*': [createFn('app - *')],
    },
    Query: {
      '*': [createFn('app - Query.*')],
      foo: [createFn('app - Query.foo')],
    },
  };

  const mod = {
    '*': {
      '*': [createFn('mod - *')],
    },
    Query: {
      '*': [createFn('mod - Query.*')],
      foo: [createFn('mod - Query.foo')],
    },
  };

  const merged = mergeMiddlewareMaps(app, mod);

  const middleware = createMiddleware(['Query', 'foo'], merged);

  await middleware(
    {
      root: {},
      args: {},
      context: {} as any,
      info: {} as any,
    },
    async () => null
  );

  expect(order).toEqual([
    'app - *',
    'mod - *',
    'app - Query.*',
    'mod - Query.*',
    'app - Query.foo',
    'mod - Query.foo',
  ]);
});

describe('should use a middleware on a field with no implemented resolver', () => {
  const typeDefs = gql`
    type Query {
      me: User!
    }

    type User {
      name: String!
    }
  `;

  const middleware = async () => 'Me';

  const document = gql`
    {
      me {
        name
      }
    }
  `;

  const resolvers = {
    Query: {
      me() {
        return {
          name: 'Not me',
        };
      },
    },
  };

  test('with a mask for all types and all fields', async () => {
    const mod = createModule({
      id: 'mod',
      typeDefs,
      middlewares: {
        '*': {
          '*': [middleware],
        },
      },
    });
    const app = createApplication({
      modules: [mod],
    });

    const result = await testkit.execute(app, {
      document,
    });

    expect(result.data).toEqual({
      me: {
        name: 'Me',
      },
    });
  });

  test('with a mask for exact type and all fields', async () => {
    const mod = createModule({
      id: 'mod',
      typeDefs,
      resolvers,
      middlewares: {
        User: {
          '*': [middleware],
        },
      },
    });
    const app = createApplication({
      modules: [mod],
    });

    const result = await testkit.execute(app, {
      document,
    });

    expect(result.data).toEqual({
      me: {
        name: 'Me',
      },
    });
  });

  test('with a mask for exact type and exact field', async () => {
    const mod = createModule({
      id: 'mod',
      typeDefs,
      resolvers,
      middlewares: {
        User: {
          name: [middleware],
        },
      },
    });
    const app = createApplication({
      modules: [mod],
    });

    const result = await testkit.execute(app, {
      document,
    });

    expect(result.data).toEqual({
      me: {
        name: 'Me',
      },
    });
  });
});
