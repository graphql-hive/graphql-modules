# graphql-modules

## 2.4.1

### Patch Changes

- [#2634](https://github.com/graphql-hive/graphql-modules/pull/2634) [`d5efab6`](https://github.com/graphql-hive/graphql-modules/commit/d5efab6f629b63a4861510736e9f50acf34b3309) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Bind context to async execution avoiding race-conditions

## 2.4.0

### Minor Changes

- [#2503](https://github.com/Urigo/graphql-modules/pull/2503) [`cf6e51f`](https://github.com/Urigo/graphql-modules/commit/cf6e51f7e0f331da33f4c4e66297f0e3f4b0dfa1) Thanks [@n1ru4l](https://github.com/n1ru4l)! - Support passing an abstract class to `Injector.get` call and `Provider` value.

## 2.3.0

### Minor Changes

- [#2465](https://github.com/Urigo/graphql-modules/pull/2465) [`72403485`](https://github.com/Urigo/graphql-modules/commit/724034855db747d456110156758cb4b8cad26cc1) Thanks [@kamilkisiela](https://github.com/kamilkisiela)! - Support graphql-jit

## 2.2.1

### Patch Changes

- [#2461](https://github.com/Urigo/graphql-modules/pull/2461) [`472733b1`](https://github.com/Urigo/graphql-modules/commit/472733b1b3b2f2b89ccc34f3e5093b16d082f13d) Thanks [@enisdenjo](https://github.com/enisdenjo)! - Execution context getters using closures

## 2.2.0

### Minor Changes

- [#2395](https://github.com/Urigo/graphql-modules/pull/2395) [`d9e91d0a`](https://github.com/Urigo/graphql-modules/commit/d9e91d0a972bce633e3d7f4fe9234880aefae839) Thanks [@TomKlaverAH](https://github.com/TomKlaverAH)! - Use AsyncLocalStorage for execution context if available

### Patch Changes

- [#2338](https://github.com/Urigo/graphql-modules/pull/2338) [`4d9150f0`](https://github.com/Urigo/graphql-modules/commit/4d9150f0f46db32fe35259c74caabe6b36d8a13b) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-tools/schema@^10.0.0` ↗︎](https://www.npmjs.com/package/@graphql-tools/schema/v/10.0.0) (from `^9.0.0`, in `dependencies`)
  - Updated dependency [`@graphql-tools/wrap@^10.0.0` ↗︎](https://www.npmjs.com/package/@graphql-tools/wrap/v/10.0.0) (from `^9.0.0`, in `dependencies`)

- [#2354](https://github.com/Urigo/graphql-modules/pull/2354) [`d49191d9`](https://github.com/Urigo/graphql-modules/commit/d49191d9a692023ce35877f2b4ddc9024bfe9da0) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:
  - Updated dependency [`ramda@^0.29.0` ↗︎](https://www.npmjs.com/package/ramda/v/0.29.0) (from `^0.28.0`, in `dependencies`)

## 2.1.2

### Patch Changes

- [#2329](https://github.com/Urigo/graphql-modules/pull/2329) [`df7e2dba`](https://github.com/Urigo/graphql-modules/commit/df7e2dbab4b52ffb24010faa6717f17b24a18cf0) Thanks [@darkbasic](https://github.com/darkbasic)! - TypeScript 5 support for the Inject and Optional decorators

## 2.1.1

### Patch Changes

- [#2233](https://github.com/Urigo/graphql-modules/pull/2233) [`1d6b7fb7`](https://github.com/Urigo/graphql-modules/commit/1d6b7fb7a7c9021f4a052825a0951ab948ef684f) Thanks [@renovate](https://github.com/apps/renovate)! - dependencies updates:

  - Updated dependency [`@graphql-tools/schema@^9.0.0` ↗︎](https://www.npmjs.com/package/@graphql-tools/schema/v/^9.0.0) (was `^8.3.1`, in `dependencies`)
  - Updated dependency [`@graphql-tools/wrap@^9.0.0` ↗︎](https://www.npmjs.com/package/@graphql-tools/wrap/v/^9.0.0) (was `^8.3.1`, in `dependencies`)

- [#2324](https://github.com/Urigo/graphql-modules/pull/2324) [`42599bfe`](https://github.com/Urigo/graphql-modules/commit/42599bfe2d5c19151f840d3fa05ed6fa00a5c487) Thanks [@patrickjm](https://github.com/patrickjm)! - Fix missing attributes in package.json (as preparation for TS 5.0)

## 2.1.0

### Minor Changes

- c0a3d556: Allow to overwrite providers when using testkit.testModule

### Patch Changes

- 9e5ec3ae: Add a deprecation note for createSchemaForApollo method
- 285987c6: Fix a memory leak related to ExecutionContext and Promises

## 2.0.0

### Major Changes

- d0a662d4: Update graphql-tools/schema & graphql-tools/wrap to major v8

  Check [graphql-tools/schema v8.0.0 release](https://github.com/ardatan/graphql-tools/releases/tag/%40graphql-tools%2Fschema%408.0.0) for possible breaking changes

### Minor Changes

- 75552e67: feat: GraphQL v16 support
- c084f1e4: ESM support

## 1.4.4

### Patch Changes

- 9ec7fa0c: Fix the failure of missing session when multi-mutation operation

## 1.4.3

### Patch Changes

- e206539c: Use correct \_\_resolveObject signature
- 648d81fe: Adds a validation of typeDefs to be DocumentNodes

## 1.4.2

### Patch Changes

- f8e6e15: Fix missing ApolloServer cacheControl in GraphQLResolveInfo

## 1.4.1

### Patch Changes

- fefca5d: Fix race condition between Inject and Injectable

## 1.4.0

### Minor Changes

- 499c81a: Support \_\_resolveObject
- 499c81a: Manual control of GraphQL operation

## 1.3.0

### Minor Changes

- f138e08: Support \_\_resolverReference resolver for federation

## 1.2.1

### Patch Changes

- 9a59787: Allow inheritance of resolvers defined in interfaces

## 1.2.0

### Minor Changes

- f38ff90: Introduce testkit.mockApplication
- f38ff90: Custom GraphQLSchema builder
- f38ff90: Introduce testkit.mockModule

## 1.1.0

### Minor Changes

- 8db9f91: Testing utilities

## 1.0.0

Complete rewrite of GraphQL Modules based on lessons learned from using and maintaining v0 releases.
The ["Introduction to GraphQL Modules"](https://graphql-modules.com/docs) page will help you understand the new version.

For migration guide, please check ["Migration from v0.X"](https://graphql-modules.com/docs/recipes/migration) chapter in docs.
