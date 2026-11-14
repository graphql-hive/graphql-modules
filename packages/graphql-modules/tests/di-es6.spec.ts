import 'reflect-metadata';
import {
  ReflectiveInjector,
  forwardRef,
  Scope,
  ExecutionContext,
} from '../src/di';
import { OnDestroy } from '../src/shared/di';

test('take params from a static parameters getter', () => {
  const spies = {
    http: jest.fn(),
    service: jest.fn(),
  };

  class Http {
    constructor() {
      spies.http();
    }
  }

  class Service {
    static get parameters() {
      return [Http];
    }

    constructor(http: any) {
      spies.service(http);
    }
  }

  const providers = ReflectiveInjector.resolve([Http, Service]);
  const injector = ReflectiveInjector.createFromResolved({
    name: 'root',
    providers,
  });

  expect(injector.get(Service)).toBeInstanceOf(Service);
  expect(spies.http).toHaveBeenCalledTimes(1);
  expect(spies.service).toHaveBeenCalledTimes(1);
});

test('support forwardRef in static parameters getter', () => {
  const spies = {
    http: jest.fn(),
    service: jest.fn(),
  };

  class Http {
    constructor() {
      spies.http();
    }
  }

  class Service {
    static get parameters() {
      return [forwardRef(() => Http)];
    }

    constructor(http: any) {
      spies.service(http);
    }
  }

  const providers = ReflectiveInjector.resolve([Http, Service]);
  const injector = ReflectiveInjector.createFromResolved({
    name: 'root',
    providers,
  });

  expect(injector.get(Service)).toBeInstanceOf(Service);
  expect(spies.http).toHaveBeenCalledTimes(1);
  expect(spies.service).toHaveBeenCalledTimes(1);
});

test('support options getter', () => {
  const spies = {
    service: jest.fn(),
  };

  class Service {
    context!: ExecutionContext;

    static get options() {
      return {
        scope: Scope.Operation,
        executionContextIn: ['context'],
        global: true,
      };
    }

    constructor() {
      spies.service();
    }
  }

  const providers = ReflectiveInjector.resolve([Service]);
  const injector = ReflectiveInjector.createFromResolved({
    name: 'root',
    providers,
  });

  expect(injector.get(Service)).toBeInstanceOf(Service);
  expect(spies.service).toHaveBeenCalledTimes(1);

  expect(providers[0].factory.isGlobal).toBe(true);
  expect(providers[0].factory.executionContextIn).toContainEqual('context');
});

test('support destroy hook', () => {
  const spies = {
    service: jest.fn(),
  };

  class Service implements OnDestroy {
    constructor() {
      spies.service();
    }

    onDestroy() {}
  }

  const providers = ReflectiveInjector.resolve([Service]);
  const injector = ReflectiveInjector.createFromResolved({
    name: 'root',
    providers,
  });

  expect(injector.get(Service)).toBeInstanceOf(Service);

  expect(providers[0].factory.hasOnDestroyHook).toBe(true);
});
