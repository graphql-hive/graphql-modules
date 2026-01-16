import Benchmark from 'benchmark';
import {
  createApplication,
  createModule,
  InjectionToken,
} from 'graphql-modules';
import { parse, execute, GraphQLSchema, ExecutionArgs } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { strictEqual } from 'assert';

interface TestResult {
  id: string;
  name: string;
  hz: number;
}

const typeDefs = parse(/* GraphQL */ `
  type Post {
    title: String!
  }

  type Query {
    posts: [Post!]!
  }
`);
const posts = ['Foo', 'Bar'];
const app = createApplication({
  modules: [
    createModule({
      id: 'posts',
      typeDefs,
      resolvers: {
        Query: {
          posts(_parent: string, __args: any) {
            return posts;
          },
        },
        Post: {
          title: (title: string) => title,
        },
      },
    }),
  ],
});

class Posts {
  all() {
    return posts;
  }
}

const PostsToken = new InjectionToken('Posts');

const appWithDI = createApplication({
  modules: [
    createModule({
      id: 'posts',
      typeDefs,
      providers: [
        {
          provide: PostsToken,
          useFactory() {
            return new Posts();
          },
        },
      ],
      resolvers: {
        Query: {
          posts(_parent: any, __args: any, { injector }: any) {
            return injector.get(PostsToken).all();
          },
        },
        Post: {
          title: (title: string) => title,
        },
      },
    }),
  ],
});

const pureSchema = makeExecutableSchema({
  typeDefs,
  resolvers: {
    Query: {
      posts() {
        return posts;
      },
    },
    Post: {
      title: (title) => title,
    },
  },
});

let showedError = false;

const executeAppWithDI = appWithDI.createExecution();
const executeApp = app.createExecution();
const apolloWithDIExecutor = appWithDI.createApolloExecutor();
const executeApolloWithDI = (args: ExecutionArgs) => {
  return apolloWithDIExecutor({
    schema: args.schema,
    document: args.document,
    operationName: args.operationName,
    context: args.contextValue,
    request: {
      variables: args.variableValues,
    },
  });
};

const apolloExecutor = app.createApolloExecutor();
const executeApollo = (args: ExecutionArgs) => {
  return apolloExecutor({
    schema: args.schema,
    document: args.document,
    operationName: args.operationName,
    context: args.contextValue,
    request: {
      variables: args.variableValues,
    },
  });
};

const query = parse(/* GraphQL */ `
  query getPosts {
    posts {
      title
    }
  }
`);

async function graphql(schema: GraphQLSchema, executeFn: typeof execute) {
  const result: any = await executeFn({
    schema,
    document: query,
    contextValue: {},
  });

  if (result.errors && !showedError) {
    console.log(result.errors);
    showedError = true;
  }

  strictEqual(result.errors, undefined);
  strictEqual(result.data?.posts[0].title, 'Foo');
  strictEqual(result.data?.posts[1].title, 'Bar');
}

const suites: Record<string, { name: string; runner: Function }> = {
  'graphql-js': {
    name: 'GraphQL-JS',
    runner: () => graphql(pureSchema, execute),
  },
  'with-di': {
    name: 'Modules (DI)',
    runner: () => graphql(appWithDI.schema, executeAppWithDI),
  },
  'without-di': {
    name: 'Modules',
    runner: () => graphql(app.schema, executeApp),
  },
  'apollo-with-id': {
    name: 'ApolloServer (DI)',
    runner: () => graphql(appWithDI.schema, executeApolloWithDI as any),
  },
  apollo: {
    name: 'ApolloServer',
    runner: () => graphql(app.schema, executeApollo as any),
  },
};

function shuffle(list: string[]) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

function sum(testResults: TestResult[]): number {
  return testResults.reduce((total, val) => val.hz + total, 0);
}

let runId = 1;

async function run(onResult: (testResult: TestResult) => void) {
  console.log(`Running benchmarks (${runId++})`);
  return new Promise<void>((resolve, reject) => {
    // add tests
    const suite = new Benchmark.Suite();

    const ids = Object.keys(suites);
    shuffle(ids);

    ids.forEach((id) => {
      suite.add(suites[id].name, suites[id].runner, {
        id,
      });
    });

    suite
      .on('cycle', (event: any) => {
        console.log(String(event.target));
        onResult({
          id: event.target.id,
          name: event.target.name,
          hz: event.target.hz,
        });
      })
      .on('error', (error: any) => {
        reject(error);
      })
      .on('complete', () => {
        resolve();
      })
      .run({ async: true, delay: 15, queued: true });
  });
}

async function main() {
  const results: Record<string, TestResult[]> = {};

  function onResult(testResult: TestResult) {
    if (!results[testResult.id]) {
      results[testResult.id] = [];
    }

    results[testResult.id].push(testResult);
  }

  await run(onResult);
  await run(onResult);
  await run(onResult);

  const baseId = 'graphql-js';
  const base = results[baseId];
  const baseTotal = sum(base);
  const baseAverage = baseTotal / base.length;

  function compare(id: string): [string, number] {
    const current = results[id];

    const total = sum(current);
    const average = total / current.length;

    return [current[0].name, Math.round((average / baseAverage) * 100)];
  }

  const averageRecords: Record<string, string> = {};
  let belowThreshold: number = 0;
  const threshold = 65; // because of async_hooks, would be 75 otherwise

  Object.keys(results)
    .map(compare)
    .sort((a, b) => b[1] - a[1])
    .forEach(([key, value]) => {
      if (value <= threshold) {
        belowThreshold = value;
      }
      averageRecords[key] = `${value}%`;
    });

  console.table(averageRecords);

  if (belowThreshold) {
    throw new Error(
      `Below threshold: ${belowThreshold} (threshold: ${threshold})`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
