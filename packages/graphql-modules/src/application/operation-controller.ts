import type { Application } from './types';
import type { ExecutionContextBuilder } from './context';

export function operationControllerCreator(options: {
  contextBuilder: ExecutionContextBuilder<GraphQLModules.GlobalContext>;
}): Application['createOperationController'] {
  const { contextBuilder } = options;

  return (input) => {
    const operation = contextBuilder(input.context);
    const ɵdestroy = input.autoDestroy ? operation.ɵdestroy : () => {};
    const controller = {
      context: operation.context,
      injector: operation.ɵinjector,
      destroy: operation.ɵdestroy,
      ɵdestroy,
      runWithContext(cb) {
        return operation.runWithContext(() =>
          cb({
            context: operation.context,
            ɵdestroy,
            ɵinjector: operation.ɵinjector,
          })
        );
      },
    };

    return controller;
  };
}
