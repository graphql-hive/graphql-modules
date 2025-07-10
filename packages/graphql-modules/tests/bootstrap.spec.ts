import 'reflect-metadata';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { createApplication, createModule, testkit, gql } from '../src';
import { NonDocumentNodeError } from '../src/shared/errors';
import { resolve } from 'path';

test('fail when modules have non-unique ids', async () => {
  const modFoo = createModule({
    id: 'foo',
    typeDefs: gql`
      type Query {
        foo: String
      }
    `,
  });

  const modBar = createModule({
    id: 'foo',
    typeDefs: gql`
      type Query {
        bar: String
      }
    `,
  });

  expect(() => {
    createApplication({
      modules: [modFoo, modBar],
    });
  }).toThrow(`Modules with non-unique ids: foo`);
});

test('should allow multiple type extensions in the same module', async () => {
  const m1 = createModule({
    id: 'test',
    typeDefs: gql`
      type Query {
        dummy: String!
      }
      type Mutation {
        foo: String!
      }
      extend type Mutation {
        bar: String!
      }
      extend type Mutation {
        test: String!
      }
    `,
    resolvers: {
      Mutation: {
        foo: () => '1',
        bar: () => '1',
        test: () => '1',
      },
    },
  });

  const app = createApplication({
    modules: [m1],
  });

  const schema = app.schema;
  expect(Object.keys(schema.getMutationType()?.getFields() || {}).length).toBe(
    3
  );
});

test('should not thrown when isTypeOf is used', async () => {
  const m1 = createModule({
    id: 'test',
    typeDefs: gql`
      type Query {
        entity: Node
      }
      interface Node {
        id: ID!
      }
      type Entity implements Node {
        id: ID!
        f: String
      }
    `,
    resolvers: {
      Query: {
        entity: () => ({
          id: 1,
          type: 'entity',
        }),
      },
      Entity: {
        __isTypeOf: (obj: any) => obj.type === 'entity',
        id: () => 1,
        f: () => 'test',
      },
    },
  });

  const app = createApplication({
    modules: [m1],
  });

  const result = await testkit.execute(app, {
    document: gql`
      query test {
        entity {
          ... on Entity {
            f
          }
        }
      }
    `,
  });

  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    entity: {
      f: 'test',
    },
  });
});

test('should allow to add __isTypeOf to type resolvers', () => {
  const m1 = createModule({
    id: 'test',
    typeDefs: gql`
      type Query {
        entity: Node
      }
      interface Node {
        id: ID!
      }
      type Entity implements Node {
        id: ID
        f: String
      }
    `,
    resolvers: {
      Query: {
        entity: () => ({
          id: 1,
          type: 'entity',
        }),
      },
      Entity: {
        __isTypeOf: (obj: any) => obj.type === 'entity',
        id: () => 1,
        f: () => 'test',
      },
    },
  });

  expect(() => {
    createApplication({
      modules: [m1],
    });
  }).not.toThrow();
});

test('should support __resolveType', async () => {
  const m1 = createModule({
    id: 'test',
    typeDefs: gql`
      type Query {
        entity: Node
        item: Item
      }

      interface Node {
        id: ID!
      }

      union Item = Entity | Post

      type Entity implements Node {
        id: ID!
        f: String
      }

      type Post implements Node {
        id: ID!
        e: String
      }
    `,
    resolvers: {
      Query: {
        entity: () => ({
          type: 'Entity',
        }),
        item: () => ({
          type: 'Post',
        }),
      },
      Entity: {
        id: () => 1,
        f: () => 'test',
      },
      Post: {
        id: () => 2,
        e: () => 'post',
      },
      Node: {
        __resolveType: (obj: any) => obj.type,
      },
      Item: {
        __resolveType: (obj: any) => obj.type,
      },
    },
  });

  const app = createApplication({
    modules: [m1],
  });

  const result = await testkit.execute(app, {
    document: gql`
      query test {
        entity {
          ... on Entity {
            f
          }
        }
        item {
          ... on Post {
            e
          }
        }
      }
    `,
  });

  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    entity: {
      f: 'test',
    },
    item: {
      e: 'post',
    },
  });
});

test('allow field resolvers in an interface without objects inheriting them', async () => {
  const mod = createModule({
    id: 'test',
    typeDefs: gql`
      type Query {
        entity: Node
        item: Item
      }

      interface Node {
        id: ID!
        d: String
      }

      union Item = Entity | Post

      type Entity implements Node {
        id: ID!
        f: String
        d: String
      }

      type Post implements Node {
        id: ID!
        e: String
        d: String
      }
    `,
    resolvers: {
      Query: {
        entity: () => ({
          type: 'Entity',
        }),
        item: () => ({
          type: 'Post',
        }),
      },
      Entity: {
        id: () => 1,
        f: () => 'test',
      },
      Post: {
        id: () => 2,
        e: () => 'post',
      },
      Node: {
        __resolveType: (obj: any) => obj.type,
        d: () => `should work only when there's a custom schema builder`,
      },
      Item: {
        __resolveType: (obj: any) => obj.type,
      },
    },
  });

  const app = createApplication({
    modules: [mod],
  });

  const result = await testkit.execute(app, {
    document: gql`
      query test {
        entity {
          ... on Entity {
            d
          }
        }
      }
    `,
  });

  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    entity: {
      d: null,
    },
  });
});

test('pass field resolvers of an interface to schemaBuilder', async () => {
  const mod = createModule({
    id: 'test',
    typeDefs: gql`
      type Query {
        entity: Node
      }

      interface Node {
        id: ID!
        d: String
      }

      type Entity implements Node {
        id: ID!
        f: String
        d: String
      }
    `,
    resolvers: {
      Query: {
        entity: () => ({
          type: 'Entity',
        }),
      },
      Entity: {
        id: () => 1,
        f: () => 'test',
      },
      Node: {
        __resolveType: (obj: any) => obj.type,
        d: () => `works`,
      },
    },
  });

  const app = createApplication({
    modules: [mod],
    schemaBuilder(input) {
      return makeExecutableSchema({
        ...input,
        inheritResolversFromInterfaces: true,
      });
    },
  });

  const result = await testkit.execute(app, {
    document: gql`
      query test {
        entity {
          ... on Entity {
            d
          }
        }
      }
    `,
  });

  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({
    entity: {
      d: 'works',
    },
  });
});

test('fail when modules have non-DocumentNode typeDefs', async () => {
  expect(() => {
    createModule({
      id: 'foo',
      typeDefs: `
        type Query {
          foo: String
        }
      ` as any,
    });
  }).toThrow(NonDocumentNodeError);
});

test('should allow resolver extensions', async () => {
  const m1 = createModule({
    id: 'test',
    typeDefs: gql`
      type Query {
        dummy: String!
      }
    `,
    resolvers: {
      Query: {
        dummy: {
          resolve: () => '1',
          extensions: {
            test: 'test',
          },
        },
      },
    },
  });

  const app = createApplication({
    modules: [m1],
  });

  const schema = app.schema;
  expect(
    Object.keys(schema.getQueryType()?.getFields().dummy.extensions || {})
      .length
  ).toBe(1);
});
