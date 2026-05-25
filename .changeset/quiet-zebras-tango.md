---
'graphql-modules': patch
---

Fix `@ExecutionContext()` leaking across concurrent controller-backed operations: in `createExecution`/`createSubscription` the controller branch called `perform(options.controller)` directly, skipping `runWithContext`, so reads after an `await` fell through to the shared `appInjector` getter and resolved to the most recently created operation's context.

The controller now exposes its `runWithContext` as `ɵrunWithContext` and both execution paths wrap `perform` in it, giving controller-backed executions the same per-operation ALS isolation the non-controller path already had.
