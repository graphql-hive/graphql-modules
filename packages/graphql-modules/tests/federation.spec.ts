import 'reflect-metadata';
import { describe, test, expect } from 'vitest';
import { mergeResolvers } from '@graphql-tools/merge';
import { buildSubgraphSchema } from '@apollo/federation';
import { createApplication, createModule, gql } from '../src';

describe('federation', () => {
  test('allow __resolveReference', async () => {
    const mod = createModule({
      id: 'test',
      typeDefs: gql`
        type Query {
          me: User!
        }

        type User {
          id: ID!
          username: String
        }
      `,
      resolvers: {
        User: {
          __resolveReference() {},
        },
      },
    });

    expect(() =>
      createApplication({
        modules: [mod],
        schemaBuilder(input) {
          return buildSubgraphSchema({
            typeDefs: input.typeDefs,
            resolvers: mergeResolvers(input.resolvers) as any,
          });
        },
      })
    ).not.toThrow();
  });

  test('allow __resolveObject', async () => {
    const mod = createModule({
      id: 'test',
      typeDefs: gql`
        type Query {
          me: User!
        }

        type User {
          id: ID!
          username: String
        }
      `,
      resolvers: {
        User: {
          __resolveObject() {},
        },
      },
    });

    expect(() =>
      createApplication({
        modules: [mod],
        schemaBuilder(input) {
          return buildSubgraphSchema({
            typeDefs: input.typeDefs,
            resolvers: mergeResolvers(input.resolvers) as any,
          });
        },
      })
    ).not.toThrow();
  });
});
