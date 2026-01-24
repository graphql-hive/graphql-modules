import {
  visit,
  Kind,
  concatAST,
  DocumentNode,
  TypeNode,
  FieldDefinitionNode,
  TypeDefinitionNode,
  TypeExtensionNode,
  DirectiveDefinitionNode,
  ObjectTypeDefinitionNode,
  ObjectTypeExtensionNode,
  UnionTypeDefinitionNode,
  UnionTypeExtensionNode,
  InterfaceTypeDefinitionNode,
  InterfaceTypeExtensionNode,
  InputObjectTypeDefinitionNode,
  InputObjectTypeExtensionNode,
  ScalarTypeDefinitionNode,
  ScalarTypeExtensionNode,
  NamedTypeNode,
} from 'graphql';
import { moduleFactory } from '../module/factory';
import { createApplication } from '../application/application';
import { ApplicationConfig } from '../application/types';
import { MockedModule, Module, ModuleConfig } from '../module/types';
import { createModule } from '../module/module';
import { hasOwnProperty } from '../shared/utils';

type TestModuleConfig = {
  replaceExtensions?: boolean;
  inheritTypeDefs?: Module[];
} & Partial<
  Pick<
    ApplicationConfig,
    'providers' | 'modules' | 'middlewares' | 'schemaBuilder'
  >
> &
  Partial<Pick<ModuleConfig, 'typeDefs' | 'resolvers'>>;

type MockModuleConfig = Partial<Pick<ModuleConfig, 'providers'>>;

export function mockModule(
  testedModule: Module,
  overrideConfig: MockModuleConfig
): MockedModule {
  const sourceProviders =
    typeof testedModule.config.providers === 'function'
      ? testedModule.config.providers()
      : testedModule.config.providers;
  const overrideProviders =
    typeof overrideConfig.providers === 'function'
      ? overrideConfig.providers()
      : overrideConfig.providers;

  const newModule = createModule({
    ...testedModule.config,
    providers: [...(sourceProviders || []), ...(overrideProviders || [])],
  }) as MockedModule;

  newModule['ɵoriginalModule'] = testedModule;

  return newModule as MockedModule;
}

export function testModule(testedModule: Module, config?: TestModuleConfig) {
  const mod = transformModule(testedModule, config);
  const modules = [mod].concat(config?.modules ?? []);

  return createApplication({
    ...(config || {}),
    modules,
    providers: config?.providers,
    middlewares: config?.middlewares,
  });
}

function transformModule(mod: Module, config?: TestModuleConfig) {
  const transforms: ((m: Module) => Module)[] = [];

  if (config?.replaceExtensions) {
    transforms.push((m) =>
      moduleFactory({
        ...m.config,
        typeDefs: replaceExtensions(m.typeDefs),
      })
    );
  }

  if (config?.typeDefs) {
    transforms.push((m) =>
      moduleFactory({
        ...m.config,
        typeDefs: m.typeDefs.concat(config.typeDefs!),
      })
    );
  }

  if (config?.inheritTypeDefs) {
    transforms.push((m) =>
      moduleFactory({
        ...m.config,
        typeDefs: inheritTypeDefs(m.typeDefs, config.inheritTypeDefs!),
      })
    );
  }

  if (config?.resolvers) {
    transforms.push((m) => {
      const resolvers = m.config.resolvers
        ? Array.isArray(m.config.resolvers)
          ? m.config.resolvers
          : [m.config.resolvers]
        : [];
      return moduleFactory({
        ...m.config,
        resolvers: resolvers.concat(config.resolvers!),
      });
    });
  }

  if (config?.providers) {
    transforms.push((m) => {
      const sourceProviders =
        typeof m.config.providers === 'function'
          ? m.config.providers()
          : m.config.providers;
      const overrideProviders =
        typeof config.providers === 'function'
          ? config.providers()
          : config.providers;
      return moduleFactory({
        ...m.config,
        providers: [...(sourceProviders || []), ...(overrideProviders || [])],
      });
    });
  }

  if (transforms) {
    return transforms.reduce((m, transform) => transform(m), mod);
  }

  return mod;
}

function inheritTypeDefs(originalTypeDefs: DocumentNode[], modules: Module[]) {
  const original = concatAST(originalTypeDefs);

  const typeDefs = treeshakeTypesDefs(
    original,
    modules!.reduce<DocumentNode[]>(
      (typeDefs, externalMod) => typeDefs.concat(externalMod.typeDefs!),
      []
    )
  );

  return typeDefs;
}

function replaceExtensions(typeDefs: DocumentNode[]) {
  const types: string[] = [];
  const extensions: string[] = [];

  // List all object types
  typeDefs.forEach((doc) => {
    visit(doc, {
      ObjectTypeDefinition(node) {
        types.push(node.name.value);
      },
    });
  });

  // turn object type extensions into object types
  return typeDefs.map((doc) => {
    return visit(doc, {
      ObjectTypeExtension(node) {
        // only if object type doesn't exist
        if (
          extensions.includes(node.name.value) ||
          types.includes(node.name.value)
        ) {
          return node;
        }

        return {
          ...node,
          kind: Kind.OBJECT_TYPE_DEFINITION,
        } as ObjectTypeDefinitionNode;
      },
    });
  });
}

function treeshakeTypesDefs(
  originalSource: DocumentNode,
  sources: DocumentNode[]
): DocumentNode {
  const namedTypes = originalSource.definitions.filter(isNamedTypeDefinition);
  const typesToVisit = namedTypes.map((def) => def.name.value);
  const rootFields = namedTypes.reduce<Record<string, string[]>>(
    (acc, node) => {
      const typeName = node.name.value;

      if (isRootType(typeName) && hasFields(node)) {
        if (!acc[typeName]) {
          acc[typeName] = [];
        }

        (node.fields as FieldDefinitionNode[]).forEach((field) => {
          acc[typeName].push(field.name.value);
        });
      }

      return acc;
    },
    {}
  );
  const schema = concatAST([originalSource].concat(sources));

  const involvedTypes = new Set(visitTypes(schema, typesToVisit, rootFields));

  return {
    kind: Kind.DOCUMENT,
    definitions: schema.definitions.filter((def) => {
      if (isNamedTypeDefinition(def)) {
        const typeName = def.name.value;

        if (!involvedTypes.has(def.name.value)) {
          return false;
        }

        if (rootFields[typeName]?.length) {
          const rootType = def as
            | ObjectTypeDefinitionNode
            | ObjectTypeExtensionNode;

          if (
            rootType.fields?.every(
              (field) => !rootFields[typeName].includes(field.name.value)
            )
          ) {
            return false;
          }
        }
      }

      return true;
    }),
  };
}

type NamedDefinitionNode =
  | TypeDefinitionNode
  | DirectiveDefinitionNode
  | TypeExtensionNode;

function isNamedTypeDefinition(def: any): def is NamedDefinitionNode {
  return (
    !!def &&
    def.kind !== Kind.SCHEMA_DEFINITION &&
    def.kind !== Kind.SCHEMA_EXTENSION
  );
}

function visitTypes(
  schema: DocumentNode,
  types: string[],
  rootFields: Record<string, string[]>
): string[] {
  const visitedTypes: string[] = [];
  const scalars = schema.definitions
    .filter(
      (def): def is ScalarTypeDefinitionNode | ScalarTypeExtensionNode =>
        def.kind === Kind.SCALAR_TYPE_DEFINITION ||
        def.kind === Kind.SCALAR_TYPE_EXTENSION
    )
    .map((def) => def.name.value);

  for (const typeName of types) {
    collectType(typeName);
  }

  return visitedTypes;

  function collectField(field: FieldDefinitionNode, parentTypeName?: string) {
    if (
      parentTypeName &&
      isRootType(parentTypeName) &&
      rootFields[parentTypeName]?.length &&
      !rootFields[parentTypeName].includes(field.name.value)
    ) {
      return;
    }

    collectType(resolveType(field.type));

    if (field.arguments) {
      field.arguments.forEach((arg) => {
        collectType(resolveType(arg.type));
      });
    }

    if (field.directives) {
      field.directives.forEach((directive) => {
        collectType(directive.name.value);
      });
    }
  }

  function collectType(typeName: string) {
    if (visitedTypes.includes(typeName)) {
      return;
    }

    if (isScalar(typeName)) {
      visitedTypes.push(typeName);
      return;
    }

    const types = findTypes(typeName);

    visitedTypes.push(typeName);

    types.forEach((type) => {
      if (hasFields(type)) {
        (type.fields as FieldDefinitionNode[]).forEach((field) => {
          collectField(field, typeName);
        });
      }

      if (hasTypes(type)) {
        type.types.forEach((t) => {
          collectType(resolveType(t));
        });
      }

      if (hasInterfaces(type)) {
        type.interfaces.forEach((i) => {
          collectType(resolveType(i));
        });
      }
    });
  }

  function resolveType(type: TypeNode): string {
    if (type.kind === 'ListType') {
      return resolveType(type.type);
    }

    if (type.kind === 'NonNullType') {
      return resolveType(type.type);
    }

    return type.name.value;
  }

  function isScalar(name: string) {
    return scalars
      .concat(['String', 'Boolean', 'Int', 'ID', 'Float'])
      .includes(name);
  }

  function findTypes(typeName: string): NamedDefinitionNode[] {
    const types = schema.definitions.filter(
      (def): def is NamedDefinitionNode =>
        isNamedTypeDefinition(def) && def.name.value === typeName
    );

    if (!types.length) {
      throw new Error(`Missing type "${typeName}"`);
    }

    return types;
  }
}

type RequiredProp<T, K extends keyof T> = T & Required<Pick<T, K>>;

function hasInterfaces(
  def: NamedDefinitionNode
): def is TypeDefinitionNode & { interfaces: NamedTypeNode[] } {
  return (
    hasPropValue(def, 'interfaces') &&
    [
      Kind.OBJECT_TYPE_DEFINITION,
      Kind.OBJECT_TYPE_EXTENSION,
      Kind.INTERFACE_TYPE_DEFINITION,
      Kind.INTERFACE_TYPE_EXTENSION,
    ].includes(def.kind as any)
  );
}

function hasTypes(
  def: NamedDefinitionNode
): def is RequiredProp<
  UnionTypeDefinitionNode | UnionTypeExtensionNode,
  'types'
> {
  return (
    [Kind.UNION_TYPE_DEFINITION, Kind.UNION_TYPE_EXTENSION].includes(
      def.kind as any
    ) && hasPropValue(def, 'types')
  );
}

function hasFields(
  def: NamedDefinitionNode
): def is RequiredProp<
  | ObjectTypeDefinitionNode
  | ObjectTypeExtensionNode
  | InterfaceTypeDefinitionNode
  | InterfaceTypeExtensionNode
  | InputObjectTypeDefinitionNode
  | InputObjectTypeExtensionNode,
  'fields'
> {
  return (
    [
      Kind.OBJECT_TYPE_DEFINITION,
      Kind.OBJECT_TYPE_EXTENSION,
      Kind.INTERFACE_TYPE_DEFINITION,
      Kind.INTERFACE_TYPE_EXTENSION,
      Kind.INPUT_OBJECT_TYPE_DEFINITION,
      Kind.INPUT_OBJECT_TYPE_EXTENSION,
    ].includes(def.kind as any) && hasPropValue(def, 'fields')
  );
}

function hasPropValue<T extends Record<string, any>, K extends string>(
  obj: T,
  prop: K
): obj is T {
  return hasOwnProperty(obj, prop) && obj[prop];
}

function isRootType(typeName: string) {
  return (
    typeName === 'Query' ||
    typeName === 'Mutation' ||
    typeName === 'Subscription'
  );
}
