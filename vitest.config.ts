import path from 'node:path';
import { defineConfig } from 'vitest/config';
import {
  getGraphQLResolverImportArg,
  GRAPHQL_VERSIONS,
  graphqlVitePlugin,
} from './graphql-resolver.mts';

const ROOT_DIR = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      'graphql-modules': path.join(
        ROOT_DIR,
        'packages/graphql-modules/src/index.ts'
      ),
      // node
      '#async-context': path.join(
        ROOT_DIR,
        'packages/graphql-modules/src/async-context.node.cjs'
      ),
      // browser
      // '#async-context': path.join(ROOT_DIR, 'packages/graphql-modules/src/async-context.browser.mjs'),
    },
  },
  test: {
    include: ['packages/*/tests/**/*.spec.ts'],
    pool: 'forks',
    // Run every test against each supported graphql version, filter with `--project graphql-v16`
    projects: GRAPHQL_VERSIONS.map((version) => ({
      extends: true,
      plugins: [graphqlVitePlugin(version)],
      test: {
        name: `graphql-v${version}`,
        env: { GRAPHQL_VERSION: version },
        execArgv: [
          // makes dependencies loaded natively by Node.js resolve the same graphql version
          '--import',
          getGraphQLResolverImportArg(version),
          // required by `memory-leak.spec.ts`
          '--expose-gc',
        ],
      },
    })),
  },
});
