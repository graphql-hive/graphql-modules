/**
 * Allows running the test suite against multiple major versions of `graphql`:
 * - graphql v17 is installed as `graphql`
 * - graphql v16 is installed as `graphql-16` (npm alias `npm:graphql@16`)
 *
 * `vitest.config.ts` defines one vitest project per version, so every test runs against all of them.
 *
 * Every `graphql` and `graphql/*` import must resolve to the exact same module instance, otherwise
 * graphql-js throws `Cannot use GraphQLSchema "..." from another module or realm`. Imports come
 * from two places, so the resolution is hooked into both:
 * - source and test files, transformed by Vite → {@link graphqlVitePlugin}
 * - dependencies loaded natively by Node.js (@graphql-tools/*, …) → Node.js resolve hook,
 *   registered when this file is preloaded with the version as query parameter, see
 *   {@link getGraphQLResolverImportArg}. Vitest workers of each project preload it via `--import`.
 */
import * as nodeModule from 'node:module';
import { pathToFileURL } from 'node:url';
// `import type` is required: Node.js loads this file via `--import` with type stripping
import type { Plugin } from 'vitest/config';

const PACKAGE_NAME_BY_VERSION = {
  '16': 'graphql-16',
  '17': 'graphql',
} as const;

export type GraphQLVersion = keyof typeof PACKAGE_NAME_BY_VERSION;

export const GRAPHQL_VERSIONS = Object.keys(
  PACKAGE_NAME_BY_VERSION
) as GraphQLVersion[];

const VERSION_QUERY_PARAM = 'graphql';

const require = nodeModule.createRequire(import.meta.url);

let isResolving = false;

/**
 * Resolves `graphql` or `graphql/<subpath>` to an absolute file path of the given graphql version.
 * Returns `undefined` for any other specifier.
 *
 * Node.js' `require` resolution is used for both CJS and ESM importers, so all of them end up with
 * the same file (graphql v17 exposes its ESM build to both via the `module-sync` condition).
 */
export function resolveGraphQL(
  specifier: string,
  version: GraphQLVersion
): string | undefined {
  // `require.resolve` below goes through the registered resolve hook again
  if (
    isResolving ||
    (specifier !== 'graphql' && !specifier.startsWith('graphql/'))
  ) {
    return;
  }
  isResolving = true;
  try {
    return require.resolve(
      PACKAGE_NAME_BY_VERSION[version] + specifier.slice('graphql'.length)
    );
  } finally {
    isResolving = false;
  }
}

export function graphqlVitePlugin(version: GraphQLVersion): Plugin {
  return {
    name: `graphql-version-resolver-v${version}`,
    enforce: 'pre',
    resolveId(source) {
      return resolveGraphQL(source, version);
    },
  };
}

/** `--import` value preloading this file, which registers the resolve hook for `version` */
export function getGraphQLResolverImportArg(version: GraphQLVersion): string {
  const url = new URL(import.meta.url);
  url.searchParams.set(VERSION_QUERY_PARAM, version);
  return url.href;
}

const hookVersion = new URL(import.meta.url).searchParams.get(
  VERSION_QUERY_PARAM
);

if (hookVersion) {
  if (!(hookVersion in PACKAGE_NAME_BY_VERSION)) {
    throw new Error(
      `Unsupported graphql version "${hookVersion}", expected one of: ${GRAPHQL_VERSIONS.join(', ')}`
    );
  }
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = resolveGraphQL(specifier, hookVersion as GraphQLVersion);
      if (resolved) {
        return { url: pathToFileURL(resolved).href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}
