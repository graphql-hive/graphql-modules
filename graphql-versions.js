/**
 * Allows running the test suite against multiple major versions of `graphql`:
 * - graphql v17 is installed as `graphql`
 * - graphql v16 is installed as `graphql-16` (npm alias `npm:graphql@16`)
 *
 * `jest.config.js` defines one jest project per version, so every test runs against all of them.
 *
 * Every `graphql` and `graphql/*` import must resolve to the exact same module instance, otherwise
 * graphql-js throws `Cannot use GraphQLSchema "..." from another module or realm`.
 * Jest's `moduleNameMapper` also applies to modules imported from `node_modules`
 * (@graphql-tools/*, …), so mapping the specifiers is enough.
 */
const { dirname, join } = require('path');

const PACKAGE_NAME_BY_VERSION = {
  16: 'graphql-16',
  17: 'graphql',
};

const GRAPHQL_VERSIONS = Object.keys(PACKAGE_NAME_BY_VERSION);

/** jest `moduleNameMapper` entries resolving `graphql` to the given version */
function getGraphQLModuleNameMapper(version) {
  const packageName = PACKAGE_NAME_BY_VERSION[version];
  if (!packageName) {
    throw new Error(
      `Unsupported graphql version "${version}", expected one of: ${GRAPHQL_VERSIONS.join(', ')}`
    );
  }
  // graphql v17 does not expose `./package.json`, so locate the package via its main entry.
  // Node.js may resolve `graphql` to the ESM build (`module-sync` condition), jest needs the CJS one.
  const packageDir = dirname(require.resolve(packageName));

  return {
    '^graphql$': join(packageDir, 'index.js'),
    '^graphql/(.*)$': `${packageDir}/$1`,
  };
}

module.exports = { GRAPHQL_VERSIONS, getGraphQLModuleNameMapper };
