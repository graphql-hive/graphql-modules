import { Container } from 'inversify';

export { injectable, inject, optional, LazyServiceIdentifer as Lazy } from 'inversify';
export interface Type<T> extends Function {
  new (...args: any[]): T;
}
export interface ValueProvider {
  provide: any;
  useValue: any;
}
export interface ClassProvider {
  provide: any;
  useClass: Type<any>;
}
export interface TypeProvider extends Type<any> {}
export type Provider = TypeProvider | ValueProvider | ClassProvider | any[];

export class Injector extends Container {
  public provide(provider: Provider): void {
    if (Array.isArray(provider)) {
      return provider.forEach(p => this.provide(p));
    }

    if (isType(provider)) {
      this.bind(provider).toSelf().inSingletonScope();
    } else if (isValue(provider)) {
      this.bind(provider.provide).toConstantValue(provider.useValue);
    } else if (isClass(provider)) {
      this.bind(provider.provide).to(provider.useClass).inSingletonScope();
    } else {
      throw new Error(`Couldn't provide ${provider}`);
    }
  }

  public init(provider: Provider): void {
    if (Array.isArray(provider)) {
      return provider.forEach(p => this.init(p));
    }

    if (isType(provider)) {
      this.get(provider);
    } else if (isClass(provider)) {
      this.get(provider.provide);
    }
  }
}

function isType(v: any): v is Type<any> {
  return typeof v === 'function';
}

function isValue(v: any): v is ValueProvider {
  return typeof v.useValue !== 'undefined';
}

function isClass(v: any): v is ClassProvider {
  return typeof v.useClass !== 'undefined';
}
