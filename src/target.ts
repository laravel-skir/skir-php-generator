import {
  importClass,
  importClassAs,
  indent,
  renderPhpFile,
  toClassName,
  toPhpNamespaceSegment,
  toPropertyName,
  type GeneratedFile,
  type NormalizedField,
  type NormalizedRecord,
  type NormalizedType,
  type PhpTargetAdapter,
  type RenderContext,
  type StructRenderRequest,
} from "@php-skir/generator-core";

import { GENERATOR_MODULE } from "./config.js";

export class StandardPhpTarget implements PhpTargetAdapter {
  public readonly id = GENERATOR_MODULE;

  public recordClassName(record: NormalizedRecord): string {
    return toClassName(record.qualifiedName);
  }

  public renderStruct({ record, context }: StructRenderRequest): GeneratedFile {
    if (record.recordType !== "struct") {
      throw new Error(`Cannot render non-struct record ${record.identity} as a struct.`);
    }

    const className = classNameForRecord(record, context);
    const denseJson = importClass(context.imports, "Skir\\Runtime\\DenseJson");
    const fieldClass = importClass(context.imports, "Skir\\Runtime\\Field");
    const typeClass = importClass(context.imports, "Skir\\Runtime\\Type");
    const fields = record.fields.filter(isStructField);
    const constructor = this.renderConstructor(fields, context);
    const members = [
      constructor,
      this.renderSkirType(record, context, fieldClass, typeClass),
      this.renderToArray(fields, context),
      this.renderFromArray(className, fields, context),
      this.renderToDenseJson(denseJson),
      this.renderFromDenseJson(className, denseJson),
    ].filter((member): member is string => member !== null);
    const body = [
      `final readonly class ${className}`,
      "{",
      ...members.flatMap((member, index) => index === 0
        ? [indent(member)]
        : ["", indent(member)]),
      "}",
    ].join("\n");

    return {
      path: outputPath(context, `${className}.php`),
      code: renderPhpFile({
        namespace: context.namespace,
        imports: renderStandardUseStatements(context),
        body,
      }),
    };
  }

  public phpType(type: NormalizedType, context: RenderContext): string {
    if (type.kind === "bool") {
      return "bool";
    }

    if (type.kind === "int32" || type.kind === "timestamp") {
      return "int";
    }

    if (type.kind === "int64" || type.kind === "hash64") {
      return "int|string";
    }

    if (type.kind === "float32" || type.kind === "float64") {
      return "float";
    }

    if (type.kind === "string" || type.kind === "bytes") {
      return "string";
    }

    if (type.kind === "array") {
      return "array";
    }

    if (type.kind === "optional") {
      return `?${this.phpType(type.inner, context)}`;
    }

    if (type.kind === "record") {
      return recordTypeClassName(type, context);
    }

    return "mixed";
  }

  public toSkirExpression(
    type: NormalizedType,
    expression: string,
    context: RenderContext,
  ): string {
    if (type.kind === "record") {
      return type.recordType === "enum"
        ? `${expression}->toSkirValue()`
        : `${expression}->toArray()`;
    }

    if (type.kind === "optional") {
      if (type.inner.kind === "record" || type.inner.kind === "array") {
        return `${expression} === null ? null : ${this.toSkirExpression(type.inner, expression, context)}`;
      }

      return expression;
    }

    if (type.kind === "array") {
      if (
        type.item.kind === "record"
        || type.item.kind === "optional"
        || type.item.kind === "array"
      ) {
        return `array_map(fn (mixed $item): mixed => ${this.toSkirExpression(type.item, "$item", context)}, ${expression})`;
      }
    }

    return expression;
  }

  public fromSkirExpression(
    type: NormalizedType,
    expression: string,
    context: RenderContext,
  ): string {
    if (type.kind === "record") {
      const className = recordTypeClassName(type, context);

      return type.recordType === "enum"
        ? `${className}::fromSkirValue(${expression})`
        : `${className}::fromArray(${expression})`;
    }

    if (type.kind === "optional") {
      if (type.inner.kind === "record" || type.inner.kind === "array") {
        return `${expression} === null ? null : ${this.fromSkirExpression(type.inner, expression, context)}`;
      }

      return expression;
    }

    if (type.kind === "array") {
      if (
        type.item.kind === "record"
        || type.item.kind === "optional"
        || type.item.kind === "array"
      ) {
        return `array_map(fn (mixed $item): mixed => ${this.fromSkirExpression(type.item, "$item", context)}, ${expression})`;
      }
    }

    return expression;
  }

  public clientResponseExpression(
    type: NormalizedType,
    expression: string,
    context: RenderContext,
  ): string {
    return this.fromSkirExpression(type, expression, context);
  }

  public manifestObjectClass(type: NormalizedType, context: RenderContext): string | null {
    if (type.kind !== "record") {
      return null;
    }

    return fullyQualifiedRecordClassName(type, context);
  }

  private renderConstructor(
    fields: readonly NormalizedField[],
    context: RenderContext,
  ): string | null {
    if (fields.length === 0) {
      return null;
    }

    return [
      "public function __construct(",
      ...fields.map((field) => (
        `    public ${this.phpType(field.type, context)} $${toPropertyName(field.name)},`
      )),
      ") {}",
    ].join("\n");
  }

  private renderSkirType(
    record: NormalizedRecord,
    context: RenderContext,
    fieldClass: string,
    typeClass: string,
  ): string {
    const entries = record.fields.map((field) => {
      if (field.kind === "removed") {
        return `    ${fieldClass}::removed(${field.number}),`;
      }

      if (!field.hasPayload) {
        throw new Error(`Struct field ${field.name} in ${record.identity} has no payload type.`);
      }

      return `    ${fieldClass}::value('${field.name}', ${field.number}, ${runtimeTypeExpression(field.type, context, this, typeClass)}),`;
    }).join("\n");

    return [
      `public static function skirType(): ${typeClass}`,
      "{",
      `    return ${typeClass}::struct([`,
      entries,
      "    ]);",
      "}",
    ].join("\n");
  }

  private renderToArray(
    fields: readonly NormalizedField[],
    context: RenderContext,
  ): string {
    return [
      "/** @return array<string, mixed> */",
      "public function toArray(): array",
      "{",
      "    return [",
      ...fields.map((field) => {
        const property = toPropertyName(field.name);

        return `        '${field.name}' => ${this.toSkirExpression(field.type, `$this->${property}`, context)},`;
      }),
      "    ];",
      "}",
    ].join("\n");
  }

  private renderFromArray(
    className: string,
    fields: readonly NormalizedField[],
    context: RenderContext,
  ): string {
    return [
      "/** @param array<string, mixed> $data */",
      `public static function fromArray(array $data): ${className}`,
      "{",
      "    return new self(",
      ...fields.map((field) => (
        `        ${toPropertyName(field.name)}: ${this.fromSkirExpression(field.type, `$data['${field.name}']`, context)},`
      )),
      "    );",
      "}",
    ].join("\n");
  }

  private renderToDenseJson(denseJson: string): string {
    return [
      "public function toDenseJson(): string",
      "{",
      `    return ${denseJson}::toJson(self::skirType(), $this->toArray());`,
      "}",
    ].join("\n");
  }

  private renderFromDenseJson(className: string, denseJson: string): string {
    return [
      `public static function fromDenseJson(string $json): ${className}`,
      "{",
      `    return self::fromArray(${denseJson}::fromJson(self::skirType(), $json));`,
      "}",
    ].join("\n");
  }
}

function isStructField(
  field: NormalizedRecord["fields"][number],
): field is NormalizedField {
  return field.kind === "field" && field.hasPayload;
}

function runtimeTypeExpression(
  type: NormalizedType,
  context: RenderContext,
  adapter: StandardPhpTarget,
  typeClass: string,
): string {
  if (type.kind === "array") {
    return `${typeClass}::array(${runtimeTypeExpression(type.item, context, adapter, typeClass)})`;
  }

  if (type.kind === "optional") {
    return `${typeClass}::optional(${runtimeTypeExpression(type.inner, context, adapter, typeClass)})`;
  }

  if (type.kind === "record") {
    return `${adapter.phpType(type, context)}::skirType()`;
  }

  return `${typeClass}::${type.kind}()`;
}

function classNameForRecord(record: NormalizedRecord, context: RenderContext): string {
  const className = context.names.namesByIdentity.get(record.identity);

  if (className === undefined) {
    throw new Error(`No PHP class name was resolved for struct ${record.identity}.`);
  }

  return className;
}

function recordTypeClassName(
  type: Extract<NormalizedType, { readonly kind: "record" }>,
  context: RenderContext,
): string {
  const className = context.names.namesByIdentity.get(type.recordIdentity);

  if (className === undefined) {
    throw new Error(`No PHP class name was resolved for record ${type.recordIdentity}.`);
  }

  const namespace = recordNamespace(type.recordIdentity, context.rootNamespace);

  if (namespace === context.namespace) {
    return className;
  }

  const fullyQualifiedClassName = canonicalRecordClassName(namespace, className);
  const isReserved = [...context.imports.reservedNames].some((reservedName) => (
    reservedName.toLowerCase() === className.toLowerCase()
  ));

  if (isReserved) {
    return `\\${fullyQualifiedClassName}`;
  }

  const existingImport = [...context.imports.imports.entries()]
    .find(([localName]) => localName.toLowerCase() === className.toLowerCase());

  if (existingImport === undefined) {
    return importClassAs(context.imports, fullyQualifiedClassName, className);
  }

  return existingImport[1].toLowerCase() === fullyQualifiedClassName.toLowerCase()
    ? existingImport[0]
    : `\\${fullyQualifiedClassName}`;
}

function fullyQualifiedRecordClassName(
  type: Extract<NormalizedType, { readonly kind: "record" }>,
  context: RenderContext,
): string {
  const className = context.names.namesByIdentity.get(type.recordIdentity);

  if (className === undefined) {
    throw new Error(`No PHP class name was resolved for record ${type.recordIdentity}.`);
  }

  return canonicalRecordClassName(
    recordNamespace(type.recordIdentity, context.rootNamespace),
    className,
  );
}

function canonicalRecordClassName(namespace: string, className: string): string {
  const fullyQualifiedClassName = `${namespace}\\${className}`.replace(/^\\+/u, "");
  const parts = fullyQualifiedClassName.split("\\");

  if (parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(part))) {
    throw new Error(`Invalid normalized PHP record class name ${fullyQualifiedClassName}.`);
  }

  if (parts.at(-1) !== className) {
    throw new Error(`Invalid normalized PHP record basename ${className}.`);
  }

  return fullyQualifiedClassName;
}

function recordNamespace(recordIdentity: string, rootNamespace: string): string {
  const separatorIndex = recordIdentity.lastIndexOf("::");

  if (separatorIndex === -1) {
    throw new Error(`Invalid normalized record identity ${recordIdentity}.`);
  }

  const modulePath = recordIdentity.slice(0, separatorIndex);
  const namespaceSegments = modulePath
    .split("/")
    .slice(0, -1)
    .map((segment) => toPhpNamespaceSegment(segment))
    .filter((segment) => segment !== "");

  return [rootNamespace, ...namespaceSegments]
    .filter((segment) => segment !== "")
    .join("\\");
}

function outputPath(context: RenderContext, fileName: string): string {
  return context.pathPrefix === "" ? fileName : `${context.pathPrefix}/${fileName}`;
}

function renderStandardUseStatements(context: RenderContext): readonly string[] {
  return [...context.imports.imports.entries()].map(([alias, fullyQualifiedClassName]) => {
    const shortName = fullyQualifiedClassName.split("\\").at(-1);

    return alias === shortName
      ? `use ${fullyQualifiedClassName};`
      : `use ${fullyQualifiedClassName} as ${alias};`;
  });
}
