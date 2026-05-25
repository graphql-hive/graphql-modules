import 'reflect-metadata';
import {
  createApplication,
  createModule,
  gql,
  testkit,
  Injectable,
  Scope,
  OnDestroy,
  ExecutionContext,
} from '../src';

test('should share context and injection', async () => {
  @Injectable({ scope: Scope.Operation })
  class Data {
    enabled = true;
    enable() {
      this.enabled = true;
    }
    disable() {
      this.enabled = false;
    }
  }

  const mod = createModule({
    id: 'test',
    typeDefs: [
      gql`
        type Query {
          enabled: Boolean
        }
      `,
    ],
    resolvers: {
      Query: {
        enabled(_: any, __: any, { injector }: GraphQLModules.ModuleContext) {
          return injector.get(Data).enabled;
        },
      },
    },
  });

  const app = createApplication({
    modules: [mod],
    providers: [Data],
  });

  const controller = app.createOperationController({
    context: {},
  });

  const data = controller.injector.get(Data);

  const query = {
    document: gql`
      {
        enabled
      }
    `,
  };

  expect(
    await testkit.execute(app, query, {
      controller,
    })
  ).toMatchObject({
    data: {
      enabled: true,
    },
  });

  data.disable();

  expect(
    await testkit.execute(app, query, {
      controller,
    })
  ).toMatchObject({
    data: {
      enabled: false,
    },
  });
});

test('execution should not destroy operation', async () => {
  const destroySpy = jest.fn();

  @Injectable({ scope: Scope.Operation })
  class Data implements OnDestroy {
    enabled = true;
    enable() {
      this.enabled = true;
    }
    disable() {
      this.enabled = false;
    }

    onDestroy() {
      destroySpy();
    }
  }

  const mod = createModule({
    id: 'test',
    typeDefs: [
      gql`
        type Query {
          enabled: Boolean
        }
      `,
    ],
    resolvers: {
      Query: {
        enabled(_: any, __: any, { injector }: GraphQLModules.ModuleContext) {
          return injector.get(Data).enabled;
        },
      },
    },
  });

  const app = createApplication({
    modules: [mod],
    providers: [Data],
  });

  const controller = app.createOperationController({
    context: {},
  });

  const query = {
    document: gql`
      {
        enabled
      }
    `,
  };

  await testkit.execute(app, query, {
    controller,
  });

  expect(destroySpy).not.toHaveBeenCalled();

  controller.destroy();

  expect(destroySpy).toHaveBeenCalledTimes(1);
});

test('autoDestroy enabled should destroy operation after execution', async () => {
  const destroySpy = jest.fn();

  @Injectable({ scope: Scope.Operation })
  class Data implements OnDestroy {
    enabled = true;
    enable() {
      this.enabled = true;
    }
    disable() {
      this.enabled = false;
    }

    onDestroy() {
      destroySpy();
    }
  }

  const mod = createModule({
    id: 'test',
    typeDefs: [
      gql`
        type Query {
          enabled: Boolean
        }
      `,
    ],
    resolvers: {
      Query: {
        enabled(_: any, __: any, { injector }: GraphQLModules.ModuleContext) {
          return injector.get(Data).enabled;
        },
      },
    },
  });

  const app = createApplication({
    modules: [mod],
    providers: [Data],
  });

  const controller = app.createOperationController({
    context: {},
    autoDestroy: true,
  });

  const query = {
    document: gql`
      {
        enabled
      }
    `,
  };

  await testkit.execute(app, query, {
    controller,
  });

  expect(destroySpy).toHaveBeenCalledTimes(1);
});

test('controller-backed @ExecutionContext(): overlapping requests do not leak context across awaits', async () => {
  // Two operations, A and B, each backed by its own OperationController.
  //
  // A's resolver awaits an external barrier; while A is suspended, B runs
  // to completion. Then A resumes and reads its own context via
  // `@ExecutionContext()`.
  //
  // The risk this test guards against:
  //
  // `contextBuilder(input.context)` (called from createOperationController)
  // installs a fresh `executionContextGetter` on the shared `appInjector` on
  // every call — the getter closes over *that* operation's `appContext`.
  // The non-controller execution path wraps `perform` in `runWithContext`,
  // which puts each operation's `{ getApplicationContext, getModuleContext }`
  // in AsyncLocalStorage so the getter prefers the ALS value over its
  // closed-over fallback. The controller execution path calls
  // `perform(options.controller)` directly, *without* the ALS wrapper.
  //
  // So once controllerB has been created, the shared getter on `appInjector`
  // closes over B's appContext. When A is later resumed after `await`, no
  // ALS frame is restored, the getter falls back to its closed-over value,
  // and A reads B's context. With the controller path wrapped in
  // `runWithContext`, A's resumed code is restored into A's own ALS frame
  // and `@ExecutionContext()` resolves correctly.
  let releaseA!: () => void;
  const aBarrier = new Promise<void>((resolve) => {
    releaseA = resolve;
  });

  type ReqCtx = { id: 'A' | 'B' };

  @Injectable({ scope: Scope.Singleton })
  class Inspector {
    @ExecutionContext()
    context!: ExecutionContext;

    currentId(): string | undefined {
      return (this.context as unknown as ReqCtx).id;
    }
  }

  const mod = createModule({
    id: 'test',
    typeDefs: [
      gql`
        type Query {
          idNow: String
          idAfterAwait: String
        }
      `,
    ],
    resolvers: {
      Query: {
        idNow(_: any, __: any, { injector }: GraphQLModules.ModuleContext) {
          return injector.get(Inspector).currentId();
        },
        async idAfterAwait(
          _: any,
          __: any,
          { injector }: GraphQLModules.ModuleContext
        ) {
          const inspector = injector.get(Inspector);
          // Suspend; while we're paused, B will run to completion.
          await aBarrier;
          return inspector.currentId();
        },
      },
    },
  });

  const app = createApplication({
    modules: [mod],
    providers: [Inspector],
  });

  const controllerA = app.createOperationController({
    context: { id: 'A' } as any,
  });
  // Creating controllerB rewrites `appInjector._executionContextGetter` to a
  // closure over B's `appContext`. From this point on, anyone who reads
  // `@ExecutionContext()` *outside* an ALS frame sees B.
  const controllerB = app.createOperationController({
    context: { id: 'B' } as any,
  });

  const queryA = {
    document: gql`
      {
        idAfterAwait
      }
    `,
  };
  const queryB = {
    document: gql`
      {
        idNow
      }
    `,
  };

  // Start A. It enters its resolver and suspends at `await aBarrier`.
  const promiseA = testkit.execute(app, queryA, { controller: controllerA });

  // Run B to completion. B's resolver runs synchronously and returns 'B'.
  const resultB = await testkit.execute(app, queryB, {
    controller: controllerB,
  });
  expect(resultB).toMatchObject({ data: { idNow: 'B' } });

  // Release A. It resumes and reads `@ExecutionContext()`.
  releaseA();
  const resultA = await promiseA;

  // With the fix in place (controller path wrapped in `runWithContext`),
  // A resumes inside its own ALS frame and reads A's context.
  // Without the fix, A falls back to the shared getter — B's appContext —
  // and this assertion fails with `idAfterAwait: 'B'`.
  expect(resultA).toMatchObject({ data: { idAfterAwait: 'A' } });

  controllerA.destroy();
  controllerB.destroy();
});
