---
'graphql-modules': patch
---

Restore the `types` conditions in the published `exports` map.

`package.json` has declared `exports["."].types` and `exports["./*"].types` for
years, but `bob build` discards them: its `rewriteExports` rebuilds every entry
as `{ require, import }` only. Every published tarball up to and including
3.1.2 therefore ships an `exports` map with no `types` condition, which makes
the declarations unreachable under `moduleResolution` `bundler`, `node16` and
`nodenext` — TypeScript reports

```
error TS7016: Could not find a declaration file for module 'graphql-modules'.
  There are types at '.../graphql-modules/index.d.ts', but this result could
  not be resolved when respecting package.json "exports".
```

Only the legacy `node10` resolver worked, because it reads the top-level
`typings` field and ignores `exports` entirely.

The conditions are now reinstated in `scripts/fix-async-context.js`, which
already post-processes `dist/package.json` for the same class of loss — bob also
strips the `imports` field. Fixes the problem reported in #2480.
