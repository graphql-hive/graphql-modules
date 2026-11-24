---
'graphql-modules': major
---

Add support for `graphql@17`, drop support for `graphql@14` and `graphql@15` and require Node.js `>=22.18.0`.

- `graphql` peer dependency is now `^16.0.0 || ^17.0.0`
- `@graphql-tools/schema` updated to `^11.0.9` and `@graphql-tools/wrap` to `^12.0.0` (requires Node.js `>=22.18`)
- `ramda` dependency removed
- `engines.node` set to `>=22.18.0`; Node.js 18 and 20 are no longer supported
