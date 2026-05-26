/**
 * Regression test for the AsyncLocalStorage / AsyncContextFrame retention leak.
 *
 * graphql-modules wraps every operation in `alc.run({ getApplicationContext,
 * getModuleContext }, cb, env)`. The closures stored in that AsyncLocalStorage
 * value capture the per-operation `context` in their scope.
 *
 * Since this change in nodejs: https://github.com/nodejs/node/pull/48528, every async
 * resource scheduled while inside the frame snapshots the current
 * AsyncContextFrame onto a `kAsyncContextFrame` symbol.
 *
 * If any such resource outlives the operation, the snapshot keeps the ALS value alive,
 * which keeps the closure scope alive, which keeps `context` (and every
 * field/data on it) alive forever.
 *
 * This test reproduces the leak deterministically by scheduling a long-pending
 * setTimeout inside the resolver, then dropping the test-side reference to `contextValue`
 * and asserting that GC reclaims it.
 *
 * Run with:
 *   NODE_OPTIONS=--expose-gc yarn jest tests/memory-leak.spec.ts
 */
import 'reflect-metadata';
import { createApplication, createModule, gql, testkit } from '../src';

// 5 MB payload — large enough so we can spot it easily in memory measurements.
const PAYLOAD_BYTES = 5 * 1024 * 1024;

// We can't use  `'x'.repeat(N)` to create a string, because V8 will optimize it and will mark it as constant,
// So we can't see it in `heapUsed`.
// The idea here is to allocate a real string on the heap, so it will be considered like a payload we get.
function makeFlatPayload(): string {
  return Buffer.alloc(PAYLOAD_BYTES, 'x').toString('latin1');
}

let pinnedTimer = undefined as any;

function pinCurrentAsyncContext() {
  // Clear any prior pinning so we only ever hold one snapshot.
  if (pinnedTimer) {
    clearTimeout(pinnedTimer);
  }

  // 10-minute delay so the timer never fires during the test, but its
  // kAsyncContextFrame snapshot is captured at scheduling time. unref() so
  // the timer doesnt keep the event loop alive between tests.
  pinnedTimer = setTimeout(() => {
    /* never fires during this test */
  }, 10 * 60_000);
  pinnedTimer.unref();
}

async function forceFullGC() {
  // WeakRefs are not cleared during a microtask checkpoint, so drain
  // microtasks between GCs. Three passes is enough in practice for V8 to
  // both collect the now-unreachable object AND clear the WeakRef cell.
  for (let i = 0; i < 3; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    (global as { gc?: () => void }).gc?.();
  }
}

beforeAll(() => {
  if (typeof (global as { gc?: () => void }).gc !== 'function') {
    throw new Error(
      'This test requires V8 GC to be exposed. Run with:\n' +
        '  NODE_OPTIONS=--expose-gc yarn jest tests/memory-leak.spec.ts'
    );
  }
});

afterEach(() => {
  if (pinnedTimer) {
    clearTimeout(pinnedTimer);
    pinnedTimer = undefined;
  }
});

test('does not retain contextValue past operation completion when a long-lived async resource snapshots the AsyncContextFrame frame', async () => {
  const mod = createModule({
    id: 'mod',
    typeDefs: gql`
      type Query {
        ping: String!
      }
    `,
    resolvers: {
      Query: {
        ping() {
          // Schedule a setTimeout from inside the resolver, while we're in
          // graphql-modules' AsyncLocalStorage closure/callback.
          //
          // The Timeout captures the current AsyncContextFrame
          // And the current AsyncContextFrame slot holding { getApplicationContext, getModuleContext } — which eventually points to the contextValue.
          pinCurrentAsyncContext();

          return 'pong';
        },
      },
    },
  });

  const app = createApplication({ modules: [mod] });

  function snap(label: string) {
    const m = process.memoryUsage();
    console.log(
      `${label.padEnd(28)} heapUsed=${m.heapUsed} external=${m.external} total=${m.heapUsed + m.external}`
    );
    return m;
  }

  // Take the baseline BEFORE allocating the payload
  await forceFullGC();
  const before = snap('before allocate');

  // Build a context that's really heap allocated, like an HTTP server will do
  // when it's parsing/getting an HTTP req.
  let contextValue: unknown = {
    bigPayload: makeFlatPayload(),
    requestId: `req-${Math.random().toString(36).slice(2)}`,
  };
  const ref = new WeakRef(contextValue as object);

  snap('after allocate');
  const result = await testkit.execute(app, {
    contextValue,
    document: gql`
      {
        ping
      }
    `,
  });
  snap('after execute');
  expect(result.errors).toBeUndefined();
  expect(result.data).toEqual({ ping: 'pong' });

  // Drop the value and the reference that we created during the test.
  // This is done in order to make sure that it's marked as non-needed
  // and we expect GC to clean it in case nothing refers to it.
  contextValue = null;

  // Clean GC and measure again
  await forceFullGC();
  const after = snap('after drop + GC');

  const leakedBytes =
    after.heapUsed + after.external - (before.heapUsed + before.external);

  /// It's ok to have some stuff left, but it should never be such a big number
  // or a full payload of 5MB provided by the user.
  expect(leakedBytes).toBeLessThan(700000);

  //  `ref.deref()` is the original wekref to the context object, retained through this path:
  //
  //   pinned setTimeout
  //     -> kAsyncContextFrame -> AsyncContextFrame
  //       -> AsyncLocalStorage -> { getApplicationContext, getModuleContext }
  //         -> closure scope (`context` param of contextBuilder)
  //           -> contextValue (with the 5MB payload)
  //
  // `deref` will return `undefined` if nothing points to the object and if it's still pinned by the async context frame.
  expect(ref.deref() == undefined).toBeTruthy();
});
