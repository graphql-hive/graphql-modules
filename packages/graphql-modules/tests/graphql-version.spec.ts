import { createRequire } from 'node:module';
import * as graphql from 'graphql';
import { describe, expect, it } from 'vitest';

/**
 * Guards the custom graphql resolver (`graphql-resolver.mts`): tests must run against the graphql
 * version of the current vitest project, with a single graphql instance shared by all importers.
 */
describe('graphql version', () => {
  // set by the vitest project, see `vitest.config.ts`
  const expectedMajor = Number(process.env.GRAPHQL_VERSION);

  it('runs inside a graphql version project', () => {
    expect(expectedMajor).toBeGreaterThan(0);
  });

  it('resolves the selected graphql version', () => {
    expect(graphql.versionInfo.major).toBe(expectedMajor);
  });

  it('shares one graphql instance with dependencies loaded natively by Node.js', () => {
    const require = createRequire(import.meta.url);
    // resolve `graphql` the way @graphql-tools/* does, from inside its package directory
    const requireFromGraphQLTools = createRequire(
      require.resolve('@graphql-tools/schema')
    );
    const graphqlFromDependency: typeof graphql =
      requireFromGraphQLTools('graphql');

    expect(graphqlFromDependency.versionInfo.major).toBe(expectedMajor);
    expect(graphqlFromDependency.GraphQLSchema).toBe(graphql.GraphQLSchema);
  });
});
