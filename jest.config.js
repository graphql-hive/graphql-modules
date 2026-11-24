const { resolve } = require('path');
const createConfig = require('./jest.config.base');
const { GRAPHQL_VERSIONS } = require('./graphql-versions');

const PACKAGES = ['graphql-modules'];

// Every test runs against all supported graphql versions.
// Run a single one with `yarn test --selectProjects "graphql-modules (graphql v16)"`
module.exports = {
  reporters: ['default'],
  projects: PACKAGES.flatMap((name) =>
    GRAPHQL_VERSIONS.map((graphqlVersion) =>
      createConfig({
        dir: resolve(__dirname, 'packages', name),
        name,
        graphqlVersion,
      })
    )
  ),
};
