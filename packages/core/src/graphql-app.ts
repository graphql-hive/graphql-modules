import { GraphQLSchema } from 'graphql';
import { makeExecutableSchema, IResolvers } from 'graphql-tools';
import { DepGraph } from 'dependency-graph';
import { mergeResolvers, mergeGraphQLSchemas } from '@graphql-modules/epoxy';
import logger from '@graphql-modules/logger';
import { GraphQLModule, IGraphQLContext, ModuleConfig } from './graphql-module';
import { CommunicationBridge } from './communication';
import {
  composeResolvers,
  IResolversComposerMapping,
} from './resolvers-composition';
import { Injector } from './di';
import { Provider, Injector as SimpleInjector } from './di/types';

export interface NonModules {
  typeDefs?: any;
  resolvers?: any;
}

export interface InitParams {
  [key: string]: any;
}

export interface GraphQLAppOptions {
  modules: GraphQLModule[];
  nonModules?: NonModules;
  communicationBridge?: CommunicationBridge;
  resolversComposition?: IResolversComposerMapping;
  providers?: Provider[];
}

export class GraphQLApp {
  private readonly _modules: GraphQLModule[];
  private _schema: GraphQLSchema;
  private _resolvers: IResolvers;
  private _initModulesValue: { [key: string]: any } = {};
  private _resolvedInitParams: { [key: string]: any } = {};
  private _currentContext = null;
  private _allImplementations: { [key: string]: any };
  private _typeDefs: string;
  private _injector = new Injector({
    defaultScope: 'Singleton',
    autoBindInjectable: false,
  });

  constructor(private options: GraphQLAppOptions) {
    this._modules = options.modules;
  }

  private buildSchema() {
    const allTypes = this.options.modules
      .map<string>(m => m.typeDefs)
      .filter(t => t);
    const nonModules = this.options.nonModules || {};
    const mergedResolvers = mergeResolvers(
      this._modules
        .map(m => m.resolvers || {})
        .concat(nonModules.resolvers || {}),
    );
    this._resolvers = this.composeResolvers(
      mergedResolvers,
      this.options.resolversComposition,
    );
    this._typeDefs = mergeGraphQLSchemas([
      ...allTypes,
      ...(Array.isArray(nonModules.typeDefs)
        ? nonModules.typeDefs
        : nonModules.typeDefs
          ? [nonModules.typeDefs]
          : []),
    ]);
  }

  private buildSchemaObject() {
    this._schema = makeExecutableSchema({
      typeDefs: this._typeDefs,
      resolvers: this._resolvers,
    });
  }

  public getModulesDependencyGraph(modules: GraphQLModule[]) {
    const graph = new DepGraph({ circular: true });

    for (const module of modules) {
      graph.addNode(module.name);
    }

    for (const module of modules) {
      (module.dependencies || []).forEach(dep => {
        graph.addDependency(
          module.name,
          typeof dep === 'string' ? dep : dep.name,
        );
      });
    }

    const order = graph.overallOrder() || [];

    if (order.length !== modules.length) {
      return [...order, ...modules.filter(m => !order.includes(m.name)).map(m => m.name)];
    }

    return order;
  }

  public get implementations() {
    return this._allImplementations;
  }

  private composeResolvers(
    resolvers: IResolvers,
    composition: IResolversComposerMapping,
  ) {
    if (composition) {
      return composeResolvers(resolvers, composition);
    }

    return resolvers;
  }

  async init(
    initParams?: InitParams | (() => InitParams) | (() => Promise<InitParams>),
  ): Promise<void> {
    let params: InitParams = null;
    const builtResult = {};

    if (initParams) {
      if (typeof initParams === 'object') {
        params = initParams;
      } else if (typeof initParams === 'function') {
        params = initParams();
      }
    }

    this._resolvedInitParams = params;

    const relevantModules: GraphQLModule[] = this._modules.filter(
      f => f.onInit,
    );
    let module;

    try {
      for (module of relevantModules) {
        const appendToContext: any = await module.onInit(params, module.config);

        if (typeof module.options.typeDefs === 'function') {
          module.typeDefs = module.options.typeDefs(params, appendToContext);
        }

        if (typeof module.options.resolvers === 'function') {
          module.resolvers = module.options.resolvers(params, appendToContext);
        }

        if (appendToContext && typeof appendToContext === 'object') {
          Object.assign(builtResult, { [module.name]: appendToContext });
        }
      }
    } catch (e) {
      logger.error(
        `Unable to initialized module! Module "${module.name}" failed: `,
        e,
      );

      throw e;
    }

    // bind global providers
    if (this.options.providers) {
      this.options.providers.forEach(provider => {
        this._injector.provide(provider);
      });
    }
    // bind communication birdge
    if (this.options.communicationBridge) {
      this._injector.provide({
        provide: CommunicationBridge,
        useValue: this.options.communicationBridge,
      });
    }

    this._initModulesValue = builtResult;
    this.buildSchema();
    this._allImplementations = await this.buildImplementationsObject();
    this.initializeProviders();
  }

  get schema(): GraphQLSchema {
    if (!this._schema) {
      this.buildSchemaObject();
    }

    return this._schema;
  }

  get modules(): GraphQLModule[] {
    return this._modules;
  }

  get resolvers(): IResolvers {
    return this._resolvers;
  }

  get typeDefs(): string {
    return this._typeDefs;
  }

  private async buildImplementationsObject() {
    const result = {};
    const depGraph = this.getModulesDependencyGraph(this._modules);

    for (const depName of depGraph) {
      const module = this.getModule(depName);

      // bind module's config
      this._injector.provide({
        provide: ModuleConfig(module.name),
        useValue: module.config,
      });

      // bind module's providers
      if (module && module.providers) {
        module.providers.forEach(provider => {
          this._injector.provide(provider);
        });
      }

      if (module && module.implementation) {
        result[module.name] =
          typeof module.implementation === 'function'
            ? await module.implementation(
                result,
                module.config,
                this.options.communicationBridge,
                { getCurrentContext: () => this.getCurrentContext() },
              )
            : module.implementation;
      }
    }

    return result;
  }

  private initializeProviders(): void {
    if (this.options.providers) {
      this.options.providers.forEach(provider => {
        this._injector.init(provider);
      });
    }

    this._modules.forEach(module => {
      if (module.providers) {
        module.providers.forEach(provider => {
          this._injector.init(provider);
        });
      }
    });
  }

  private getCurrentContext() {
    return this._currentContext;
  }

  public getModule(name) {
    return this._modules.find(module => module.name === name);
  }

  public get injector(): SimpleInjector {
    return this._injector;
  }

  public getModuleImplementation(name) {
    const impl = this._allImplementations[name];

    if (impl !== null && impl !== undefined) {
      return impl;
    }

    return null;
  }

  async buildContext(networkRequest?: any): Promise<IGraphQLContext> {
    const depGraph = this.getModulesDependencyGraph(this._modules);
    const builtResult = {
      ...this._initModulesValue,
      initParams: this._resolvedInitParams || {},
      injector: {
        get: this._injector.get.bind(this._injector),
      },
    };
    const result = { ...this._allImplementations };

    let module;
    try {
      for (const depName of depGraph) {
        module = this.getModule(depName);

        if (module && module.contextBuilder) {
          const appendToContext: any = await module.contextBuilder(
            networkRequest,
            this._allImplementations,
            result,
          );

          if (appendToContext && typeof appendToContext === 'object') {
            Object.assign(builtResult, appendToContext);
          }
        }
      }
    } catch (e) {
      logger.error(
        `Unable to build context! Module "${module.name}" failed: `,
        e,
      );

      throw e;
    }

    const builtKeys = Object.keys(builtResult);

    for (const key of builtKeys) {
      if (result.hasOwnProperty(key)) {
        logger.warn(
          `One of you context builders returned a key named ${key}, and it's conflicting with a root module name! Ignoring...`,
        );
      } else {
        result[key] = builtResult[key];
      }
    }

    this._currentContext = result;

    return result;
  }
}
