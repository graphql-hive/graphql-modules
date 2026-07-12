import {
  createApplication,
  createModule,
  InjectionToken,
  Provider,
  testkit,
} from 'graphql-modules';

const StringToken = new InjectionToken<string>('string');
declare const StringOrNumberToken:
  | InjectionToken<string>
  | InjectionToken<number>;

// @ts-expect-error injection tokens retain their value type
const incorrectToken: InjectionToken<number> = StringToken;

void incorrectToken;

class Service {
  readonly kind = 'service';
}

class OtherService {
  readonly kind = 'other-service';
}

createApplication({
  modules: [],
  providers: [{ provide: StringToken, useValue: 'value' }],
});

createApplication({
  modules: [],
  // @ts-expect-error useValue must match the token value type
  providers: [{ provide: StringToken, useValue: 123 }],
});

createApplication({
  modules: [],
  // @ts-expect-error useValue must be valid for every token in the union
  providers: [{ provide: StringOrNumberToken, useValue: false }],
});

createApplication({
  modules: [],
  providers: [{ provide: Service, useValue: new Service() }],
});

createApplication({
  modules: [],
  // @ts-expect-error useValue must match the class token type
  providers: [{ provide: Service, useValue: new OtherService() }],
});

const widenedProviders: Provider[] = [{ provide: StringToken, useValue: 123 }];

createApplication({ modules: [], providers: widenedProviders });

createModule({
  id: 'provider-types',
  typeDefs: [],
  providers: [{ provide: StringToken, useValue: 'value' }],
});

createModule({
  id: 'invalid-provider-types',
  typeDefs: [],
  // @ts-expect-error useValue must match the token value type
  providers: [{ provide: StringToken, useValue: 123 }],
});

testkit.testInjector([{ provide: StringToken, useValue: 'value' }]);

// @ts-expect-error useValue must match the token value type
testkit.testInjector([{ provide: StringToken, useValue: 123 }]);
