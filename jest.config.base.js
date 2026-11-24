const { resolve } = require('path');
const { pathsToModuleNameMapper } = require('ts-jest');
const { getGraphQLModuleNameMapper } = require('./graphql-versions');

const ROOT_DIR = __dirname;
const TSCONFIG_PATH = resolve(ROOT_DIR, 'tsconfig.json');
const tsconfig = require(TSCONFIG_PATH);
const CI = !!process.env.CI;

module.exports = ({ dir, name, graphqlVersion }) => {
  return {
    displayName: `${name} (graphql v${graphqlVersion})`,
    testEnvironment: 'node',
    rootDir: dir,
    modulePathIgnorePatterns: ['dist', '.bob'],
    transform: {
      '\\.[jt]sx?$': [
        'babel-jest',
        { configFile: resolve(ROOT_DIR, 'babel.config.js') },
      ],
    },
    moduleNameMapper: {
      ...pathsToModuleNameMapper(tsconfig.compilerOptions.paths, {
        prefix: `${ROOT_DIR}/`,
      }),
      ...getGraphQLModuleNameMapper(graphqlVersion),
      // node
      '^#async\\-context$': `${ROOT_DIR}/packages/graphql-modules/src/async-context.node.cjs`,
      // browser
      // '^#async\\-context$': `${ROOT_DIR}/packages/graphql-modules/src/async-context.browser.mjs`,
    },
    // exposed to tests, see `tests/graphql-version.spec.ts`
    globals: { GRAPHQL_VERSION: graphqlVersion },
    cacheDirectory: resolve(
      ROOT_DIR,
      `${CI ? '' : 'node_modules/'}.cache/jest`
    ),
  };
};
