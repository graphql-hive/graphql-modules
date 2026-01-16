// use async hooks
// TODO: typecheck

const hooks = require('async_hooks');

const alc = new hooks.AsyncLocalStorage();

// we dont use named exports (exports.getAsyncContext) because node with typescript is weird

module.exports = {
  getAsyncContext: () => alc.getStore(),
  runWithAsyncContext: (asyncContext, callback, ...args) =>
    alc.run(asyncContext, callback, ...args),
};
