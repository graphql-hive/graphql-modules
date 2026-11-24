import { InjectionToken, FactoryProvider, Scope } from 'graphql-modules';
import { createPubSub, PubSub as TPubSub } from 'graphql-yoga';
import { Post } from './types';

type PubSub = TPubSub<{
  POST_ADDED: [
    {
      postAdded: Post;
    },
  ];
}>;

export const PUB_SUB = new InjectionToken<PubSub>('PubSub');

export { PubSub };

export function providePubSub(): FactoryProvider<PubSub> {
  return {
    provide: PUB_SUB,
    scope: Scope.Singleton,
    useFactory() {
      return createPubSub();
    },
  };
}
