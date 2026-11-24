import * as graphql from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';

declare const GRAPHQL_VERSION: string;

/**
 * Guards the graphql version mapping (`graphql-versions.js`): tests must run against the graphql
 * version of the current jest project, with a single graphql instance shared by all importers.
 */
describe('graphql version', () => {
  // set by the jest project, see `jest.config.base.js`
  const expectedMajor = Number(GRAPHQL_VERSION);

  it('runs inside a graphql version project', () => {
    expect(expectedMajor).toBeGreaterThan(0);
  });

  it('resolves the selected graphql version', () => {
    expect(graphql.versionInfo.major).toBe(expectedMajor);
  });

  it('shares one graphql instance with dependencies', () => {
    // @graphql-tools/schema imports `graphql` from within node_modules
    const schema = makeExecutableSchema({
      typeDefs: 'type Query { hello: String }',
      resolvers: { Query: { hello: () => 'world' } },
    });

    expect(schema).toBeInstanceOf(graphql.GraphQLSchema);
    expect(graphql.graphqlSync({ schema, source: '{ hello }' }).data).toEqual({
      hello: 'world',
    });
  });
});
