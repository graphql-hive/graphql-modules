import type { Application } from './types';
import type { ExecutionContextBuilder } from './context';

export function operationControllerCreator(options: {
  contextBuilder: ExecutionContextBuilder<GraphQLModules.GlobalContext>;
}): Application['createOperationController'] {
  const { contextBuilder } = options;

  return (input) => {
    const operation = contextBuilder(input.context);
    const ɵdestroy = input.autoDestroy ? operation.ɵdestroy : () => {};

    return {
      context: operation.context,
      injector: operation.ɵinjector,
      destroy: operation.ɵdestroy,
      ɵdestroy,
      ɵrunWithContext: operation.runWithContext,
    };
  };
}
