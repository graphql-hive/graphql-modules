---
'graphql-modules': patch
---

Fix memory leak: per-operation `context` was retained forever when any long-lived async resource (a global `setTimeout`/`setInterval`, a telemetry exporter, undici's module-scoped timer, …) snapshotted the current `AsyncContextFrame` during execution. Since [nodejs/node#48528](https://github.com/nodejs/node/pull/48528), every async resource scheduled inside an `AsyncLocalStorage.run(...)` captures a `kAsyncContextFrame` snapshot, and the value stored in our internal `AsyncLocalStorage` was a pair of closures that captured `context` — so the snapshot pinned the entire operation context (potentially multiple MBs).

The fix routes every per-operation reference to `context` through a mutable holder (`refs.context` / `refs.appContext`). `sharedContext` (exposed as `env.context`) and the cached `CONTEXT` injector value are now getter-based views over `refs.context` instead of shallow spreads, so they hold no user data of their own. `ɵdestroy` only nulls the holder slots — public-facing identities (`env.context`, `ɵinjector`) stay intact and continue to work, but the heavy user payload becomes unreachable from the (still-pinned) closure scope.
