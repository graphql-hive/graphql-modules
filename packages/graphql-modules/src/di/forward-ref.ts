import { stringify } from './utils';
import { Type } from './providers';
import { hasOwnProperty } from '../shared/utils';

export type ForwardRefFn<T> = () => T;

const forwardRefSymbol = Symbol('__forward_ref__');

/**
 * Useful in "circular dependencies of modules" situation
 */
export function forwardRef<T>(forwardRefFn: ForwardRefFn<T>) {
  (forwardRefFn as any)[forwardRefSymbol] = forwardRef;
  (<any>forwardRefFn).toString = function () {
    return stringify(this());
  };
  return <Type<any>>(<any>forwardRefFn);
}

export function resolveForwardRef(type: any): any {
  if (
    typeof type === 'function' &&
    hasOwnProperty(type, forwardRefSymbol) &&
    type[forwardRefSymbol] === forwardRef
  ) {
    return (type as ForwardRefFn<any>)();
  } else {
    return type;
  }
}
