---
'graphql-modules': minor
---

Add `defineProviders` to preserve type-safe provider inference for separately declared provider arrays and provider factories.

Inline providers now verify that `useValue` matches its `InjectionToken` or class token type, including union tokens. Explicit `Provider[]` annotations remain supported but opt out of this inference.

```ts
const ApiKey = new InjectionToken<string>('api-key')

createApplication({
  modules: [],
  providers: [{ provide: ApiKey, useValue: 'my-api-key' }]
})
```

Use `defineProviders` when providers are declared separately or returned from a provider factory:

```ts
const providers = defineProviders([{ provide: ApiKey, useValue: 'my-api-key' }])

createApplication({ modules: [], providers })

createApplication({
  modules: [],
  providers: () =>
    defineProviders([{ provide: ApiKey, useValue: 'my-api-key' }])
})
```
