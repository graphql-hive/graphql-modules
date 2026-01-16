import module from 'module';
import { GetAsyncContext, RunWithAsyncContext } from './async-context';

const require = module.createRequire(
  'file:///' /** path is not relevant since we're only loading a builtin */
);
const hooks = require('async_hooks') as typeof import('async_hooks');
const alc = new hooks.AsyncLocalStorage();

export const getAsyncContext: GetAsyncContext = () =>
  // @ts-expect-error type will be correct
  alc.getStore();

export const runWithAsyncContext: RunWithAsyncContext = (
  asyncContext,
  callback,
  ...args
) => alc.run(asyncContext, callback, ...args);
