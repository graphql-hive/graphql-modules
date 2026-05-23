---
'graphql-modules': patch
---

Fix memory leak: per-operation `context` was retained forever when any long-lived async resource (e.g. a global `setTimeout`/`setInterval`, an telemetry exporter) snapshotted the current `AsyncContextFrame` during execution.

Since [nodejs/node#48528](https://github.com/nodejs/node/pull/48528), every async resource scheduled inside an `AsyncLocalStorage.run(...)` captures a `kAsyncContextFrame` snapshot. Because the value stored in our internal `AsyncLocalStorage` was a pair of closures that captured `context`, the snapshot also kept the entire operation context, and potentially multiple MBs of data.

The fix routes the heavy per-operation values through a mutable holder, switches the operation-scoped `CONTEXT` provider from `useValue` to a `useFactory` that reads through the holder, and also improves the clean process of `destroy` function.
