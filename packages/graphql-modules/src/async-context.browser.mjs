// noop
// TODO: typecheck

export default {
  getAsyncContext: () => undefined,
  runWithAsyncContext: (_asyncContext, callback, ...args) => callback(...args),
};
