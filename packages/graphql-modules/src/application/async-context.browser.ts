import { GetAsyncContext, RunWithAsyncContext } from './async-context';

export const getAsyncContext: GetAsyncContext = () => undefined;

export const runWithAsyncContext: RunWithAsyncContext = (
  _asyncContext,
  callback,
  ...args
) => callback(...args);
