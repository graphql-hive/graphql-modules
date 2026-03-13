import { Type, ProviderOptions, isType, InjectionToken } from './providers';
import {
  INJECTABLE,
  InjectableMetadata,
  readInjectableMetadata,
  ensureInjectableMetadata,
} from './metadata';
import { Injector } from './injector';

function ensureReflect() {
  if (!(Reflect && Reflect.getOwnMetadata)) {
    throw 'reflect-metadata shim is required when using class decorators';
  }
}

export function Injectable(options?: ProviderOptions): ClassDecorator {
  return (target) => {
    ensureReflect();

    const params: Type<any>[] = (
      Reflect.getMetadata('design:paramtypes', target) ||
      (target as any).parameters || // ES6
      []
    ).map((param: any) => (isType(param) ? param : null));

    const existingMeta = readInjectableMetadata(target as any);

    const meta: InjectableMetadata = {
      params:
        existingMeta?.params?.length > 0 && params.length === 0
          ? existingMeta?.params
          : params.map((param, i) => {
              const existingParam = existingMeta?.params?.[i];
              return {
                type: existingParam?.type || param,
                optional:
                  typeof existingParam?.optional === 'boolean'
                    ? existingParam.optional
                    : false,
              };
            }),
      options: {
        ...(existingMeta?.options || {}),
        ...((target as any).options || {}), // ES6
        ...(options || {}),
      },
    };

    (target as any)[INJECTABLE] = meta;

    return target;
  };
}

// https://github.com/microsoft/TypeScript/issues/52435
type ParameterDecorator = (
  target: Object,
  propertyKey: string | symbol | undefined,
  parameterIndex: number
) => void;

export function Optional(): ParameterDecorator {
  return (target, _, index) => {
    ensureReflect();
    ensureInjectableMetadata(target as any);
    const meta = readInjectableMetadata(target as any);

    meta.params[index] = {
      ...meta.params[index],
      optional: true,
    };
  };
}

export function Inject(
  type: Type<any> | InjectionToken<any>
): ParameterDecorator {
  return (target, _, index) => {
    ensureReflect();
    ensureInjectableMetadata(target as any);
    const meta = readInjectableMetadata(target as any);

    meta.params[index] = {
      type,
      optional: false,
    };

    return target;
  };
}

export type ExecutionContext = {
  injector: Injector;
} & GraphQLModules.ModuleContext;

export function ExecutionContext(): PropertyDecorator {
  return (obj, propertyKey) => {
    ensureReflect();
    const target = obj.constructor;

    ensureInjectableMetadata(target as any);

    const meta = readInjectableMetadata(target as any);

    if (!meta.options) {
      meta.options = {};
    }

    if (!meta.options.executionContextIn) {
      meta.options!.executionContextIn = [];
    }

    meta.options!.executionContextIn.push(propertyKey);
  };
}
