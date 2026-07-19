# Shared Generator Core and Simple Data Objects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a shared PHP generator core, migrate the standard PHP and Laravel Data generators without compatibility regressions, add validation overlays where supported, and ship a complete Simple Data Objects generator.

**Architecture:** A new ESM package, `@php-skir/generator-core`, owns normalized Skir/PHP models, naming, imports, common PHP and RPC rendering, server manifests, Composer configuration, and CLI helpers. Three thin target adapters supply struct representation, type conversion, hydration, validation, and collection behavior; validation configuration exists only in the Laravel Data and Simple Data Objects adapters.

**Tech Stack:** TypeScript 5.9, Node 22/24, Vitest 4, Zod 4, `skir-internal` 0.2.21, PHP 8.4+, `php-skir/runtime`, Spatie Laravel Data 4, `std-out/simple-data-objects` 1.11, Composer, GitHub Actions.

---

## Repository and Branch Layout

Use isolated worktrees during execution. The current manifest/scaffolding work is intentionally preserved and becomes the base of the generator refactors:

- `packages/skir-php-generator/.worktrees/shared-generator-core`, branch `feature/shared-generator-core`, based on `feature/laravel-scaffolding` (`20076f3`), then cherry-pick the documentation commits from `feature/generator-core-and-simple-data-objects`.
- `packages/skir-laravel-data-generator/.worktrees/shared-generator-core`, branch `feature/shared-generator-core`, based on `feature/laravel-scaffolding` (`7d43238`).
- `packages/generator-core`, new standalone repository `php-skir/generator-core`.
- `packages/skir-simple-data-objects-generator`, new standalone repository `php-skir/skir-simple-data-objects-generator`.

Do not merge, push, publish, or create releases until Task 16 reaches its explicit approval checkpoint.

## Planned File Structure

### `packages/generator-core`

- `src/model.ts`: normalized modules, records, fields, types, methods, and output contexts.
- `src/normalize.ts`: conversion from real `skir-internal` shapes to the normalized model.
- `src/naming.ts`: PHP class/property/namespace naming and collision registries.
- `src/imports.ts`: deterministic import reservation and aliasing.
- `src/php.ts`: common file header, indentation, use statements, and PHP source assembly.
- `src/adapter.ts`: target adapter interfaces and render request types.
- `src/generate.ts`: generation orchestration.
- `src/render-enum.ts`: shared enum-wrapper rendering.
- `src/render-rpc.ts`: descriptors, method enums, clients, procedures, and providers.
- `src/server-manifest.ts`: schema-1 server manifest rendering.
- `src/validation.ts`: optional validation-overlay schema and selector resolution.
- `src/composer-autoload.ts`: PSR-4 JSON editing.
- `src/configure-composer.ts`: generic atomic Composer configurator.
- `src/cli.ts`: generic `configure-composer` CLI parser and runner.
- `src/config.ts`: canonical namespace schema.
- `src/index.ts`: public exports.
- `tests/*`: focused tests matching each source responsibility.

### Existing adapters

Each existing adapter keeps `src/config.ts`, `src/generator.ts`, `src/index.ts`, `src/cli.ts`, and its existing public exports. Add `src/target.ts` for target-specific rendering. Existing Composer modules become thin wrappers over the core.

### Simple Data Objects adapter

Mirror the established generator package surface and add:

- `src/target.ts`: `BaseData`, mapping, rules, typed collections, and wire conversions.
- `src/structural-rules.ts`: schema-to-Laravel structural rule mapping.
- `tests/simple-data-objects-integration.test.ts`: real package behavior in a temporary Composer project.

## Task 1: Prepare Isolated Branches and Confirm Baselines

**Files:**
- No source files modified.

- [ ] **Step 1: Create the standard-generator worktree from the manifest branch**

```bash
git -C packages/skir-php-generator worktree add .worktrees/shared-generator-core -b feature/shared-generator-core feature/laravel-scaffolding
git -C packages/skir-php-generator/.worktrees/shared-generator-core cherry-pick feature/laravel-scaffolding..feature/generator-core-and-simple-data-objects
```

Expected: the new branch contains server-manifest commit `20076f3` plus the approved design and implementation plan commits.

- [ ] **Step 2: Create the Laravel Data worktree from its manifest branch**

```bash
git -C packages/skir-laravel-data-generator worktree add .worktrees/shared-generator-core -b feature/shared-generator-core feature/laravel-scaffolding
```

Expected: the new branch starts at `7d43238` and the existing scaffolding worktree remains untouched.

- [ ] **Step 3: Run both existing full generator suites**

```bash
npm test
npm run typecheck
npm run build
npm run pack:dry-run
```

Run the four commands once in each new worktree. Expected: every command exits `0` before refactoring.

- [ ] **Step 4: Record clean branch state**

```bash
git status --short --branch
```

Expected: both implementation worktrees are clean.

## Task 2: Add Standard PHP Compatibility Fixtures

**Files:**
- Create: `packages/skir-php-generator/.worktrees/shared-generator-core/tests/fixtures/full-generator-input.ts`
- Create: `packages/skir-php-generator/.worktrees/shared-generator-core/tests/generator-compatibility.test.ts`
- Create: `packages/skir-php-generator/.worktrees/shared-generator-core/tests/__snapshots__/generator-compatibility.test.ts.snap`

- [ ] **Step 1: Create one producer-shaped input fixture**

Export `fullGeneratorInput` with two modules (`admin/users.skir` and `common/address.skir`), real `record-location` wrappers, cross-module references through a `recordMap`, duplicate `User` record names, removed fields, optionals, nested arrays, constant and payload enum variants, and two RPC methods. Use the public `PhpGeneratorInput` type:

```ts
import type { PhpGeneratorInput } from "../../src/generator.js";

export const fullGeneratorInput = {
  config: { namespace: "Skir" },
  modules: [
    {
      path: "common/address.skir",
      records: [{
        kind: "record-location",
        modulePath: "common/address.skir",
        record: {
          kind: "struct",
          key: "address-key",
          name: "Address",
          fields: [
            { kind: "field", name: "city", number: 0, type: { kind: "string" } },
            { kind: "field", name: "postal_codes", number: 1, type: { kind: "array", item: { kind: "string" } } },
          ],
        },
      }],
    },
    {
      path: "admin/users.skir",
      records: [
        {
          kind: "struct",
          key: "admin-user-key",
          name: "User",
          fields: [
            { kind: "field", name: "user_id", number: 0, type: { kind: "int32" } },
            { kind: "removed", number: 1 },
            { kind: "field", name: "address", number: 2, type: { kind: "record", key: "address-key", name: "Address" } },
            { kind: "field", name: "previous_addresses", number: 3, type: { kind: "array", item: { kind: "record", key: "address-key", name: "Address" } } },
            { kind: "field", name: "nickname", number: 4, type: { kind: "optional", other: { kind: "string" } } },
            { kind: "field", name: "matrix", number: 5, type: { kind: "array", item: { kind: "array", item: { kind: "int32" } } } },
          ],
        },
        {
          kind: "enum",
          recordType: "enum",
          name: "SubscriptionStatus",
          fields: [
            { kind: "field", name: "free", number: 0 },
            { kind: "field", name: "premium_since", number: 1, type: { kind: "timestamp" } },
          ],
        },
      ],
      methods: [
        { kind: "method", name: "GetUser", number: 1, requestType: { kind: "record", key: "admin-user-key", name: "User" }, responseType: { kind: "record", key: "admin-user-key", name: "User" } },
        { kind: "method", name: "FindUsers", number: 2, requestType: { kind: "optional", other: { kind: "string" } }, responseType: { kind: "array", item: { kind: "record", key: "admin-user-key", name: "User" } } },
      ],
    },
  ],
  recordMap: new Map([
    ["address-key", {
      kind: "record-location",
      modulePath: "common/address.skir",
      record: {
        kind: "struct",
        key: "address-key",
        name: "Address",
        fields: [
          { kind: "field", name: "city", number: 0, type: { kind: "string" } },
          { kind: "field", name: "postal_codes", number: 1, type: { kind: "array", item: { kind: "string" } } },
        ],
      },
    }],
    ["admin-user-key", {
      kind: "record-location",
      modulePath: "admin/users.skir",
      record: {
        kind: "struct",
        key: "admin-user-key",
        name: "User",
        fields: [],
      },
    }],
  ]),
} satisfies PhpGeneratorInput;
```

- [ ] **Step 2: Snapshot the complete ordered output**

```ts
import { describe, expect, it } from "vitest";

import { generatePhpFiles } from "../src/generator.js";
import { fullGeneratorInput } from "./fixtures/full-generator-input.js";

describe("standard PHP compatibility", () => {
  it("keeps every generated file byte-for-byte stable", () => {
    expect(generatePhpFiles(fullGeneratorInput)).toMatchSnapshot();
  });
});
```

- [ ] **Step 3: Generate and inspect the baseline snapshot**

```bash
npm test -- tests/generator-compatibility.test.ts -u
npm test -- tests/generator-compatibility.test.ts
```

Expected: the second command passes and the snapshot contains PHP artifacts plus `skir-server-manifest.json`.

- [ ] **Step 4: Commit the characterization fixture**

```bash
git add tests/fixtures/full-generator-input.ts tests/generator-compatibility.test.ts tests/__snapshots__/generator-compatibility.test.ts.snap
git commit -m "Test standard generator output compatibility"
```

## Task 3: Add Laravel Data Compatibility Fixtures

**Files:**
- Create: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/tests/fixtures/full-generator-input.ts`
- Create: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/tests/generator-compatibility.test.ts`
- Create: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/tests/__snapshots__/generator-compatibility.test.ts.snap`

- [ ] **Step 1: Add a producer-shaped Laravel Data fixture**

Create `fullGeneratorInput` with no validation configuration:

```ts
import type { PhpGeneratorInput } from "../../src/generator.js";

const address = {
  kind: "struct",
  key: "address-key",
  name: "Address",
  fields: [
    { kind: "field", name: "city", number: 0, type: { kind: "string" } },
    { kind: "field", name: "postal_codes", number: 1, type: { kind: "array", item: { kind: "string" } } },
  ],
} as const;

const user = {
  kind: "struct",
  key: "admin-user-key",
  name: "User",
  fields: [
    { kind: "field", name: "user_id", number: 0, type: { kind: "int32" } },
    { kind: "removed", number: 1 },
    { kind: "field", name: "address", number: 2, type: { kind: "record", key: "address-key", name: "Address" } },
    { kind: "field", name: "previous_addresses", number: 3, type: { kind: "array", item: { kind: "record", key: "address-key", name: "Address" } } },
    { kind: "field", name: "nickname", number: 4, type: { kind: "optional", other: { kind: "string" } } },
    { kind: "field", name: "matrix", number: 5, type: { kind: "array", item: { kind: "array", item: { kind: "int32" } } } },
  ],
} as const;

export const fullGeneratorInput = {
  config: { namespace: "Skir" },
  modules: [
    {
      path: "common/address.skir",
      records: [{ kind: "record-location", modulePath: "common/address.skir", record: address }],
    },
    {
      path: "admin/users.skir",
      records: [
        user,
        {
          kind: "enum",
          recordType: "enum",
          name: "SubscriptionStatus",
          fields: [
            { kind: "field", name: "free", number: 0 },
            { kind: "field", name: "premium_since", number: 1, type: { kind: "timestamp" } },
          ],
        },
      ],
      methods: [
        { kind: "method", name: "GetUser", number: 1, requestType: { kind: "record", key: "admin-user-key", name: "User" }, responseType: { kind: "record", key: "admin-user-key", name: "User" } },
        { kind: "method", name: "FindUsers", number: 2, requestType: { kind: "optional", other: { kind: "string" } }, responseType: { kind: "array", item: { kind: "record", key: "admin-user-key", name: "User" } } },
      ],
    },
  ],
  recordMap: new Map([
    ["address-key", { kind: "record-location", modulePath: "common/address.skir", record: address }],
    ["admin-user-key", { kind: "record-location", modulePath: "admin/users.skir", record: user }],
  ]),
} satisfies PhpGeneratorInput;
```

- [ ] **Step 2: Snapshot the no-overlay output**

```ts
import { describe, expect, it } from "vitest";

import { generateLaravelDataFiles } from "../src/generator.js";
import { fullGeneratorInput } from "./fixtures/full-generator-input.js";

describe("Laravel Data compatibility", () => {
  it("keeps no-overlay output byte-for-byte stable", () => {
    expect(generateLaravelDataFiles(fullGeneratorInput)).toMatchSnapshot();
  });
});
```

- [ ] **Step 3: Generate and verify the baseline**

```bash
npm test -- tests/generator-compatibility.test.ts -u
npm test -- tests/generator-compatibility.test.ts
```

Expected: the snapshot contains `*Data` classes, all RPC artifacts, and the server manifest.

- [ ] **Step 4: Commit the Laravel characterization fixture**

```bash
git add tests/fixtures/full-generator-input.ts tests/generator-compatibility.test.ts tests/__snapshots__/generator-compatibility.test.ts.snap
git commit -m "Test Laravel Data output compatibility"
```

## Task 4: Create the Generator Core Package Shell

**Files:**
- Create: `packages/generator-core/AGENTS.md`
- Create: `packages/generator-core/LICENSE`
- Create: `packages/generator-core/.gitignore`
- Create: `packages/generator-core/package.json`
- Create: `packages/generator-core/tsconfig.json`
- Create: `packages/generator-core/src/index.ts`
- Create: `packages/generator-core/tests/package.test.ts`

- [ ] **Step 1: Create and clone the empty GitHub repository with `gh`**

```bash
gh repo create php-skir/generator-core --public --description "Shared generation core for PHP Skir code generators" --clone
```

Run from `packages/`. Expected: `packages/generator-core/.git` exists and no files from another repository are copied.

- [ ] **Step 2: Add package metadata**

Use this package contract:

```json
{
  "name": "@php-skir/generator-core",
  "version": "0.1.0",
  "description": "Shared generation core for PHP Skir code generators.",
  "type": "module",
  "license": "MIT",
  "author": {
    "name": "Maxim Kerstens",
    "email": "maxim.kerstens@gmail.com"
  },
  "homepage": "https://github.com/php-skir/generator-core#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/php-skir/generator-core.git"
  },
  "bugs": {
    "url": "https://github.com/php-skir/generator-core/issues"
  },
  "publishConfig": {
    "access": "public"
  },
  "exports": {
    ".": "./dist/index.js"
  },
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "prepack": "npm run build",
    "pack:dry-run": "npm pack --dry-run --cache .npm-cache",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "jsonc-parser": "^3.3.1",
    "skir-internal": "^0.2.21",
    "yaml": "^2.9.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Copy the standard generator's MIT license, TypeScript compiler options, and ignore patterns. `AGENTS.md` must say the core is build-time TypeScript, must remain DTO-library independent, and must preserve adapter compatibility.

- [ ] **Step 3: Write the failing public-package test**

```ts
import { describe, expect, it } from "vitest";

import { PHP_FILE_HEADER } from "../src/index.js";

describe("generator core package", () => {
  it("exports the canonical generated file header", () => {
    expect(PHP_FILE_HEADER).toContain("DO NOT EDIT");
  });
});
```

- [ ] **Step 4: Run the test and verify the missing export**

```bash
npm install
npm test -- tests/package.test.ts
```

Expected: FAIL because `PHP_FILE_HEADER` is not exported.

- [ ] **Step 5: Add the minimal export and pass the test**

```ts
export const PHP_FILE_HEADER = [
  "/**",
  " * +------------------------------------------------------------+",
  " * |                        DO NOT EDIT                         |",
  " * |      Generated by Skir. Changes will be overwritten.       |",
  " * +------------------------------------------------------------+",
  " */",
].join("\n");
```

Run `npm test -- tests/package.test.ts`, `npm run typecheck`, and `npm run build`. Expected: PASS.

- [ ] **Step 6: Commit the package shell**

```bash
git add AGENTS.md LICENSE .gitignore package.json package-lock.json tsconfig.json src/index.ts tests/package.test.ts
git commit -m "Initialize PHP generator core package"
```

## Task 5: Normalize Skir Models and Resolve PHP Identities in Core

**Files:**
- Create: `packages/generator-core/src/model.ts`
- Create: `packages/generator-core/src/normalize.ts`
- Create: `packages/generator-core/src/naming.ts`
- Create: `packages/generator-core/tests/normalize.test.ts`
- Create: `packages/generator-core/tests/naming.test.ts`
- Modify: `packages/generator-core/src/index.ts`

- [ ] **Step 1: Write failing normalization tests**

Cover real token objects, `record-location` wrappers, record ancestors, record keys, imported record references, removed fields, module directory normalization, `_Root`, and collisions. The central assertion should use this public shape:

```ts
const schema = normalizeSchema({ modules, recordMap });

expect(schema.modules[0]).toMatchObject({
  path: "admin/users.skir",
  sourceDirectory: "admin",
  namespaceSegments: ["Admin"],
  moduleIdentity: "Admin",
});
expect(schema.recordsByIdentity.get("admin/users.skir::User")?.qualifiedName)
  .toBe("User");
```

Run `npm test -- tests/normalize.test.ts tests/naming.test.ts`. Expected: FAIL because the model and functions do not exist.

- [ ] **Step 2: Define normalized model types**

Use discriminated unions that remove raw compiler-shape branching from renderers:

```ts
export type NormalizedType =
  | { readonly kind: "bool" | "int32" | "int64" | "hash64" | "float32" | "float64" | "string" | "bytes" | "timestamp" | "mixed" }
  | { readonly kind: "array"; readonly item: NormalizedType }
  | { readonly kind: "optional"; readonly inner: NormalizedType }
  | { readonly kind: "record"; readonly recordIdentity: string; readonly recordType: "struct" | "enum" };

export interface NormalizedField {
  readonly kind: "field";
  readonly name: string;
  readonly number: number;
  readonly type: NormalizedType;
}

export interface NormalizedRecord {
  readonly identity: string;
  readonly modulePath: string;
  readonly qualifiedName: string;
  readonly recordType: "struct" | "enum";
  readonly fields: readonly (NormalizedField | { readonly kind: "removed"; readonly number: number })[];
  readonly key?: string;
}

export interface NormalizedMethod {
  readonly name: string;
  readonly number: number;
  readonly requestType: NormalizedType;
  readonly responseType: NormalizedType;
}

export interface NormalizedModule {
  readonly path: string;
  readonly sourceDirectory: string;
  readonly namespaceSegments: readonly string[];
  readonly moduleIdentity: string;
  readonly records: readonly NormalizedRecord[];
  readonly methods: readonly NormalizedMethod[];
}

export interface NormalizedSchema {
  readonly modules: readonly NormalizedModule[];
  readonly recordsByIdentity: ReadonlyMap<string, NormalizedRecord>;
  readonly recordsByKey: ReadonlyMap<string, NormalizedRecord>;
}

export interface CoreGeneratorInput {
  readonly modules: readonly SkirModule[];
  readonly recordMap?: ReadonlyMap<string, SkirRecordLocation>;
}

export interface GeneratedFile {
  readonly path: string;
  readonly code: string;
}
```

- [ ] **Step 3: Move and adapt the existing normalization and naming logic**

Move these established responsibilities out of the standard generator, preserving behavior: `tokenText`, `recordNamePartText`, `normalizeRecord`, `recordIdentity`, `recordKeyForRecord`, `modulePathForRecord`, `typeKind`, `arrayItemType`, `optionalInnerType`, `toClassName`, `toPropertyName`, `toPhpNamespaceSegment`, module directory normalization, class collision prefixing, and record-location resolution.

Export these exact public functions:

```ts
export function normalizeSchema(input: {
  readonly modules: readonly SkirModule[];
  readonly recordMap?: ReadonlyMap<string, SkirRecordLocation>;
}): NormalizedSchema;

export function buildPhpNameRegistry(
  rootNamespace: string,
  schema: NormalizedSchema,
  recordClassName: (record: NormalizedRecord) => string,
): PhpNameRegistry;

export interface PhpNameRegistry {
  readonly namesByIdentity: ReadonlyMap<string, string>;
  readonly namesByRecordKey: ReadonlyMap<string, string>;
}

export function toClassName(name: string): string;
export function toPropertyName(name: string): string;
export function toPhpNamespaceSegment(name: string): string;
```

Keep `SkirModule`, `SkirRecordLocation`, and related producer-compatible input types exported from `model.ts` so existing adapters do not lose their public TypeScript types.

- [ ] **Step 4: Run focused tests**

```bash
npm test -- tests/normalize.test.ts tests/naming.test.ts
npm run typecheck
```

Expected: PASS, including case-insensitive namespace collision failures.

- [ ] **Step 5: Commit normalization**

```bash
git add src/model.ts src/normalize.ts src/naming.ts src/index.ts tests/normalize.test.ts tests/naming.test.ts
git commit -m "Add normalized Skir model and PHP naming"
```

## Task 6: Add Imports, PHP Rendering, and the Target Adapter Contract

**Files:**
- Create: `packages/generator-core/src/imports.ts`
- Create: `packages/generator-core/src/php.ts`
- Create: `packages/generator-core/src/adapter.ts`
- Create: `packages/generator-core/tests/imports.test.ts`
- Create: `packages/generator-core/tests/adapter.test.ts`
- Modify: `packages/generator-core/src/index.ts`

- [ ] **Step 1: Write failing import and adapter tests**

Assert deterministic aliasing when a generated class reserves `Type`, cross-module records share short names, and runtime imports collide. Define a minimal fake adapter and assert the core can request all target-specific operations without inspecting DTO-library names.

- [ ] **Step 2: Define the adapter contract**

```ts
export interface PhpTargetAdapter {
  readonly id: string;
  prepare?(schema: NormalizedSchema): void;
  recordClassName(record: NormalizedRecord): string;
  renderStruct(request: StructRenderRequest): GeneratedFile;
  phpType(type: NormalizedType, context: RenderContext): string;
  toSkirExpression(type: NormalizedType, expression: string, context: RenderContext): string;
  fromSkirExpression(type: NormalizedType, expression: string, context: RenderContext): string;
  clientResponseExpression(type: NormalizedType, expression: string, context: RenderContext): string;
  manifestObjectClass(type: NormalizedType, context: RenderContext): string | null;
}

export interface StructRenderRequest {
  readonly record: NormalizedRecord;
  readonly context: RenderContext;
}

export interface RenderContext {
  readonly rootNamespace: string;
  readonly namespace: string;
  readonly pathPrefix: string;
  readonly names: PhpNameRegistry;
  readonly imports: ImportRegistry;
}

export interface ImportRegistry {
  readonly reservedNames: ReadonlySet<string>;
  readonly imports: Map<string, string>;
}

export interface PhpFileInput {
  readonly namespace: string;
  readonly imports: readonly string[];
  readonly body: string;
}
```

- [ ] **Step 3: Implement import and PHP helpers**

Move the existing import behavior behind:

```ts
export function createImportRegistry(reservedNames: Iterable<string>): ImportRegistry;
export function importClass(registry: ImportRegistry, fullyQualifiedClassName: string): string;
export function renderUseStatements(registry: ImportRegistry): readonly string[];
export function indent(code: string): string;
export function renderPhpFile(input: PhpFileInput): string;
```

`renderPhpFile` must produce the existing `<?php`, strict-types line, exact banner, namespace, imports, body, and trailing newline.

- [ ] **Step 4: Verify focused behavior**

```bash
npm test -- tests/imports.test.ts tests/adapter.test.ts tests/package.test.ts
npm run typecheck
```

Expected: PASS with exact import aliases and header formatting.

- [ ] **Step 5: Commit the rendering boundary**

```bash
git add src/imports.ts src/php.ts src/adapter.ts src/index.ts tests/imports.test.ts tests/adapter.test.ts
git commit -m "Define PHP generator adapter contract"
```

## Task 7: Move Shared Enum, RPC, and Manifest Rendering into Core

**Files:**
- Create: `packages/generator-core/src/generate.ts`
- Create: `packages/generator-core/src/render-enum.ts`
- Create: `packages/generator-core/src/render-rpc.ts`
- Create: `packages/generator-core/src/server-manifest.ts`
- Create: `packages/generator-core/tests/generate.test.ts`
- Create: `packages/generator-core/tests/server-manifest.test.ts`
- Modify: `packages/generator-core/src/index.ts`

- [ ] **Step 1: Write failing orchestration tests**

Use a fake adapter that records method calls. Assert one struct render per struct, shared enum output, six RPC PHP artifacts per method-bearing module, one schema-1 manifest, deterministic ordering, and the adapter ID in the manifest.

- [ ] **Step 2: Add the core entry point**

```ts
export interface GeneratePhpInput {
  readonly namespace: string;
  readonly modules: readonly SkirModule[];
  readonly recordMap?: ReadonlyMap<string, SkirRecordLocation>;
  readonly adapter: PhpTargetAdapter;
}

export interface GenerateNormalizedPhpInput {
  readonly namespace: string;
  readonly schema: NormalizedSchema;
  readonly names: PhpNameRegistry;
  readonly adapter: PhpTargetAdapter;
}

export function generatePhp(input: GeneratePhpInput): GeneratedFile[] {
  const schema = normalizeSchema(input);
  const names = buildPhpNameRegistry(input.namespace, schema, (record) => input.adapter.recordClassName(record));
  input.adapter.prepare?.(schema);

  return generateNormalizedPhp({
    namespace: input.namespace,
    schema,
    names,
    adapter: input.adapter,
  });
}

export function generateNormalizedPhp(input: GenerateNormalizedPhpInput): GeneratedFile[];
```

- [ ] **Step 3: Extract established common renderers**

Move enum constructors/accessors/dense conversion, methods, method enum, client constructor, procedures, abstract procedures, provider registration, runtime type expressions, module grouping, module identity, and manifest JSON rendering from the manifest branches. Replace only target-specific calls with `PhpTargetAdapter` methods.

Keep these exact artifact names and ordering:

```ts
[
  ...recordFiles,
  ...methodGroups.flatMap(renderRpcGroup),
  generateServerManifestFile(adapter.id, manifestModules),
]
```

The six files from `renderRpcGroup` remain `SkirMethods.php`, the module method enum, `SkirRpcClient.php`, `SkirProcedures.php`, `AbstractSkirProcedures.php`, and `SkirProcedureProvider.php`.

- [ ] **Step 4: Run generation tests**

```bash
npm test -- tests/generate.test.ts tests/server-manifest.test.ts
npm run typecheck
npm run build
```

Expected: PASS and `dist/index.d.ts` exposes only target-independent APIs.

- [ ] **Step 5: Commit shared generation**

```bash
git add src/generate.ts src/render-enum.ts src/render-rpc.ts src/server-manifest.ts src/index.ts tests/generate.test.ts tests/server-manifest.test.ts
git commit -m "Add shared PHP and RPC rendering"
```

## Task 8: Move Composer and CLI Utilities into Core

**Files:**
- Create: `packages/generator-core/src/config.ts`
- Create: `packages/generator-core/src/composer-autoload.ts`
- Create: `packages/generator-core/src/configure-composer.ts`
- Create: `packages/generator-core/src/cli.ts`
- Create: `packages/generator-core/tests/config.test.ts`
- Create: `packages/generator-core/tests/composer-autoload.test.ts`
- Create: `packages/generator-core/tests/configure-composer.test.ts`
- Create: `packages/generator-core/tests/cli.test.ts`
- Modify: `packages/generator-core/src/index.ts`

- [ ] **Step 1: Copy the existing tests and make them generic**

Replace hard-coded module/bin names with test arguments and assert the generic functions receive a strict config parser. Run the four new test files and expect missing exports.

- [ ] **Step 2: Export shared configuration and generic APIs**

```ts
export const DEFAULT_NAMESPACE = "Skir";
export const PhpNamespace = z.string().regex(
  /^[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)*$/u,
  "Namespace must be a canonical PHP namespace using ASCII identifier segments separated by single backslashes.",
);

export interface ConfigureComposerOptions<Config> {
  readonly module: string;
  readonly root?: string;
  readonly parseConfig: (value: unknown) => Config;
  readonly namespace: (config: Config) => string;
}

export async function configureComposer<Config>(
  options: ConfigureComposerOptions<Config>,
): Promise<ComposerPsr4MappingResult>;

export function runConfigureComposerCli<Config>(options: {
  readonly argv: readonly string[];
  readonly bin: string;
  readonly module: string;
  readonly parseConfig: (value: unknown) => Config;
  readonly namespace: (config: Config) => string;
}): Promise<void>;
```

- [ ] **Step 3: Move existing behavior without semantic changes**

Move `ensureComposerPsr4Mapping`, path normalization, JSON formatting detection, containment validation, realpath/symlink checks, atomic writes, YAML generator lookup, CLI argument parsing, and user-facing Added/Unchanged output. Parameterize only generator module, binary name, and config parsing.

- [ ] **Step 4: Verify tooling**

```bash
npm test -- tests/config.test.ts tests/composer-autoload.test.ts tests/configure-composer.test.ts tests/cli.test.ts
npm run typecheck
npm run build
npm run pack:dry-run
```

Expected: all commands pass.

- [ ] **Step 5: Commit tooling**

```bash
git add src/config.ts src/composer-autoload.ts src/configure-composer.ts src/cli.ts src/index.ts tests/config.test.ts tests/composer-autoload.test.ts tests/configure-composer.test.ts tests/cli.test.ts
git commit -m "Share Composer and CLI generator tooling"
```

## Task 9: Migrate the Standard PHP Generator

**Files:**
- Create: `packages/skir-php-generator/.worktrees/shared-generator-core/src/target.ts`
- Modify: `packages/skir-php-generator/.worktrees/shared-generator-core/src/generator.ts`
- Modify: `packages/skir-php-generator/.worktrees/shared-generator-core/src/config.ts`
- Modify: `packages/skir-php-generator/.worktrees/shared-generator-core/src/configure-composer.ts`
- Modify: `packages/skir-php-generator/.worktrees/shared-generator-core/src/composer-autoload.ts`
- Modify: `packages/skir-php-generator/.worktrees/shared-generator-core/src/cli.ts`
- Modify: `packages/skir-php-generator/.worktrees/shared-generator-core/src/index.ts`
- Modify: `packages/skir-php-generator/.worktrees/shared-generator-core/package.json`
- Test: all existing tests plus `tests/generator-compatibility.test.ts`

- [ ] **Step 1: Link the local core without changing release metadata**

```bash
npm link --no-save --package-lock=false /Users/maximkerstens/.projects/trackr/packages/generator-core
```

Add `"@php-skir/generator-core": "^0.1.0"` to `dependencies`, but leave the lockfile transition for Task 16.

- [ ] **Step 2: Write the target adapter using existing plain-PHP behavior**

`StandardPhpTarget` must use record names without a suffix, `final readonly class`, constructor-promoted properties, `toArray()`, `fromArray()`, `toDenseJson()`, and `fromDenseJson()`. Move the current `phpType`, `valueToArrayExpression`, and `valueFromArrayExpression` branches into the adapter unchanged, including `int|string` for `int64`/`hash64`, nullable rendering, enum `toSkirValue()`/`fromSkirValue()`, struct `toArray()`/`fromArray()`, and recursive `array_map` expressions.

```ts
export class StandardPhpTarget implements PhpTargetAdapter {
  readonly id = GENERATOR_MODULE;

  recordClassName(record: NormalizedRecord): string {
    return toClassName(record.qualifiedName);
  }
}
```

Implement every other interface method by moving its current function body from `src/generator.ts`; the compatibility snapshot is the required exact result and must not be updated.

- [ ] **Step 3: Replace the monolithic generator with a thin public wrapper**

```ts
import type { CoreGeneratorInput } from "@php-skir/generator-core";

export interface PhpGeneratorInput extends CoreGeneratorInput {
  readonly config?: PhpGeneratorConfig;
}

export type {
  GeneratedFile,
  SkirField,
  SkirMethod,
  SkirModule,
  SkirRecord,
  SkirRecordLocation,
  SkirRecordNamePart,
  SkirToken,
  SkirType,
} from "@php-skir/generator-core";

export function generatePhpFiles(input: PhpGeneratorInput): GeneratedFile[] {
  const { namespace } = GeneratorConfig.parse(input.config ?? {});

  return generatePhp({ ...input, namespace, adapter: new StandardPhpTarget() });
}
```

Keep the existing exported function and input type names source-compatible.

- [ ] **Step 4: Replace local tooling bodies with core wrappers**

`config.ts` keeps `GENERATOR_MODULE` and its strict `GeneratorConfig`. `configure-composer.ts`, `composer-autoload.ts`, and `cli.ts` delegate to core exports while preserving every existing adapter export and CLI message.

- [ ] **Step 5: Prove compatibility**

```bash
npm test -- tests/generator-compatibility.test.ts
npm test
npm run typecheck
npm run build
npm run pack:dry-run
```

Expected: the snapshot is unchanged; do not update it. All commands pass.

- [ ] **Step 6: Commit the standard migration**

```bash
git add package.json src tests
git commit -m "Migrate standard generator to shared core"
```

## Task 10: Migrate the Laravel Data Generator Without Output Changes

**Files:**
- Create: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/src/target.ts`
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/src/generator.ts`
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/src/config.ts`
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/src/configure-composer.ts`
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/src/composer-autoload.ts`
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/src/cli.ts`
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/src/index.ts`
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/package.json`
- Test: all existing tests plus `tests/generator-compatibility.test.ts`

- [ ] **Step 1: Link core and add the future semver dependency**

```bash
npm link --no-save --package-lock=false /Users/maximkerstens/.projects/trackr/packages/generator-core
```

Add `"@php-skir/generator-core": "^0.1.0"` to `dependencies`; defer the lockfile update to Task 16.

- [ ] **Step 2: Implement `LaravelDataTarget` from current target-specific behavior**

The adapter retains the `Data` suffix, `final class ... extends Data`, `MapInputName`, `DataCollectionOf`, `toSkirArray()`, `makeFromSkirPayload()`, `fromSkir()`, `toSkir()`, `toSkirJson()`, and current client response hydration.

```ts
export class LaravelDataTarget implements PhpTargetAdapter {
  readonly id = GENERATOR_MODULE;

  recordClassName(record: NormalizedRecord): string {
    const name = toClassName(record.qualifiedName);

    return name.endsWith("Data") ? name : `${name}Data`;
  }
}
```

- [ ] **Step 3: Make the public generator a thin wrapper**

Parse the existing namespace-only config, instantiate `LaravelDataTarget`, call core `generatePhp`, and re-export all existing public TypeScript names.

- [ ] **Step 4: Prove no-overlay compatibility**

```bash
npm test -- tests/generator-compatibility.test.ts
npm test
npm run typecheck
npm run build
npm run pack:dry-run
```

Expected: no snapshot update and all commands pass.

- [ ] **Step 5: Commit the Laravel migration**

```bash
git add package.json src tests
git commit -m "Migrate Laravel Data generator to shared core"
```

## Task 11: Add Shared Validation Overlay Resolution

**Files:**
- Create: `packages/generator-core/src/validation.ts`
- Modify: `packages/generator-core/src/index.ts`
- Create: `packages/generator-core/tests/validation.test.ts`

- [ ] **Step 1: Write failing selector and rule tests**

Cover successful lookup, qualified nested record names, original snake_case field names, unknown module, unknown record, unknown field, empty rule, non-string rule, and stable rule order.

- [ ] **Step 2: Add the strict validation config schema**

```ts
export const ValidationRule = z.string().min(1, "Validation rules must be non-empty strings.");
export const ValidationConfig = z.record(
  z.string(),
  z.record(
    z.string(),
    z.record(z.string(), z.array(ValidationRule).min(1)),
  ),
).default({});

export type ValidationConfig = z.infer<typeof ValidationConfig>;
export type ResolvedValidationRules = ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
```

- [ ] **Step 3: Resolve selectors against normalized schema**

```ts
export function resolveValidationRules(
  schema: NormalizedSchema,
  config: ValidationConfig,
): ResolvedValidationRules {
  const resolved = new Map<string, Map<string, readonly string[]>>();

  for (const [modulePath, records] of Object.entries(config)) {
    const module = schema.modules.find((candidate) => candidate.path === modulePath);

    if (module === undefined) {
      throw new Error(`Unknown validation module ${JSON.stringify(modulePath)}.`);
    }

    for (const [qualifiedName, fields] of Object.entries(records)) {
      const identity = `${modulePath}::${qualifiedName}`;
      const record = schema.recordsByIdentity.get(identity);

      if (record === undefined) {
        throw new Error(`Unknown validation record ${JSON.stringify(identity)}.`);
      }

      const rulesByField = new Map<string, readonly string[]>();

      for (const [fieldName, rules] of Object.entries(fields)) {
        const fieldExists = record.fields.some((field) => field.kind === "field" && field.name === fieldName);

        if (! fieldExists) {
          throw new Error(`Unknown validation field ${JSON.stringify(`${identity}.${fieldName}`)}.`);
        }

        rulesByField.set(fieldName, rules);
      }

      resolved.set(identity, rulesByField);
    }
  }

  return resolved;
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm test -- tests/validation.test.ts
npm run typecheck
git add src/validation.ts src/index.ts tests/validation.test.ts
git commit -m "Resolve generator validation overlays"
```

## Task 12: Generate Laravel Data Validation Overlays

**Files:**
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/src/config.ts`
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/src/generator.ts`
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/src/target.ts`
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/tests/config.test.ts`
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/tests/generator.test.ts`
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/tests/generated-php-integration.test.ts`

- [ ] **Step 1: Write failing config and rendering tests**

Assert that a configured `admin/users.skir -> CreateUser -> email` overlay emits:

```php
use Spatie\LaravelData\Attributes\MergeValidationRules;

#[MergeValidationRules]
final class CreateUserData extends Data
{
    public static function rules(): array
    {
        return [
            'email' => ['email:rfc,dns', 'company_email'],
        ];
    }
}
```

Also run `tests/generator-compatibility.test.ts` without snapshot-update flags and assert invalid module, record, and field selectors fail generation.

- [ ] **Step 2: Extend the strict generator config**

```ts
export const GeneratorConfig = z.strictObject({
  namespace: PhpNamespace.default(DEFAULT_NAMESPACE),
  validation: ValidationConfig.optional(),
});
```

- [ ] **Step 3: Resolve rules before rendering and pass them to the target**

Construct `LaravelDataTarget` with the parsed `ValidationConfig`. Its `prepare(schema)` method calls `resolveValidationRules(schema, config)` once before rendering. Add `MergeValidationRules` and `rules()` only for records with configured fields.

- [ ] **Step 4: Prove custom aliases execute**

In the temporary Laravel Data Composer fixture, register:

```php
$validator->extend('company_email', static fn (string $attribute, mixed $value): bool => is_string($value) && str_ends_with($value, '@company.test'));
```

Assert `makeFromSkirPayload()` accepts `maxim@company.test` and throws `ValidationException` for `maxim@example.test`.

- [ ] **Step 5: Run focused and full tests**

```bash
npm test -- tests/config.test.ts tests/generator.test.ts tests/generated-php-integration.test.ts tests/generator-compatibility.test.ts
npm test
npm run typecheck
npm run build
```

Expected: PASS and the no-overlay snapshot remains untouched.

- [ ] **Step 6: Commit Laravel validation**

```bash
git add src tests
git commit -m "Add Laravel Data validation overlays"
```

## Task 13: Create the Simple Data Objects Generator Package

**Files:**
- Create the package shell under `packages/skir-simple-data-objects-generator`
- Create: `src/config.ts`, `src/index.ts`, `src/generator.ts`, `src/target.ts`, `src/structural-rules.ts`
- Create: `tests/config.test.ts`, `tests/generator.test.ts`

- [ ] **Step 1: Create and clone the repository with `gh`**

```bash
gh repo create php-skir/skir-simple-data-objects-generator --public --description "Skir generator for std-out/simple-data-objects" --clone
```

Run from `packages/`.

- [ ] **Step 2: Add package metadata and repository instructions**

Use the exact scripts and TypeScript compiler options listed in Task 4, the MIT license owned by Maxim Kerstens, ignore `/node_modules/`, `/dist/`, `/.npm-cache/`, and `/.worktrees/`, and the workflow command sequence `npm ci`, `npm run typecheck`, `npm run build`, `npm run pack:dry-run`, `npm test`. Set:

```json
{
  "name": "skir-simple-data-objects-generator",
  "version": "0.1.0",
  "description": "Skir code generator for std-out/simple-data-objects.",
  "bin": {
    "skir-simple-data-objects-generator": "./dist/cli.js"
  },
  "dependencies": {
    "@php-skir/generator-core": "^0.1.0",
    "skir-internal": "^0.2.21",
    "zod": "^4.0.0"
  }
}
```

Keep `skir` and Vitest as development dependencies. Link the local core with `npm link --no-save --package-lock=false /Users/maximkerstens/.projects/trackr/packages/generator-core`.

- [ ] **Step 3: Write failing config and empty-struct tests**

Assert module ID `skir-simple-data-objects-generator`, namespace default `Skir`, strict validation config, class path `Health/HealthRequestData.php`, import `StdOut\SimpleDataObjects\BaseData`, `final class HealthRequestData extends BaseData`, no constructor for an empty struct, and the exact generated banner.

- [ ] **Step 4: Add minimal config, generator wrapper, and struct renderer**

Use the same config shape as Laravel Data. Implement `SimpleDataObjectsTarget.recordClassName()` with the stable `Data` suffix and render an empty `BaseData` class through core PHP helpers.

- [ ] **Step 5: Verify red-to-green and commit**

```bash
npm test -- tests/config.test.ts tests/generator.test.ts
npm run typecheck
npm run build
git add .
git commit -m "Initialize Simple Data Objects generator"
```

## Task 14: Generate Simple Data Objects Fields, Collections, and Validation

**Files:**
- Modify: `packages/skir-simple-data-objects-generator/src/target.ts`
- Modify: `packages/skir-simple-data-objects-generator/src/structural-rules.ts`
- Modify: `packages/skir-simple-data-objects-generator/src/generator.ts`
- Modify: `packages/skir-simple-data-objects-generator/tests/generator.test.ts`
- Create: `packages/skir-simple-data-objects-generator/tests/simple-data-objects-integration.test.ts`

- [ ] **Step 1: Write failing generated-source tests**

Cover:

- `skirType()`, `makeFromSkirPayload()`, `fromSkir()`, `toSkirArray()`, `toSkir()`, and `toSkirJson()`;
- `#[MapPropertyName('user_id')] public readonly int $userId`;
- direct `AddressData $address`;
- `#[DataCollection(AddressData::class)] public readonly TypedDataCollection $previousAddresses`;
- nullable direct struct collections;
- primitive, enum, optional, and nested arrays remaining arrays;
- wrapper enums;
- structural plus custom rule order;
- recursive raw validation before hydration.

- [ ] **Step 2: Implement safely representable structural rules**

```ts
export function structuralRules(type: NormalizedType, optional = false): readonly string[] {
  const presence = optional ? "nullable" : "required";
  const inner = type.kind === "optional" ? type.inner : type;
  const shape = (() => {
    switch (inner.kind) {
      case "bool": return "boolean";
      case "int32":
      case "timestamp": return "integer";
      case "float32":
      case "float64": return "numeric";
      case "string":
      case "bytes": return "string";
      case "array": return "array";
      case "record": return inner.recordType === "struct" ? "array" : null;
      default: return null;
    }
  })();

  return shape === null ? [presence] : [presence, shape];
}
```

Do not emit a narrowing rule for `int64` or `hash64`, whose PHP representation is `int|string`.

- [ ] **Step 3: Render native Simple Data Objects attributes and types**

Use constructor-parameter attributes from `StdOut\SimpleDataObjects\Attributes`. Direct struct arrays become `TypedDataCollection`; other arrays use `array`. Merge structural rules followed by configured rules in the exact configured order.

- [ ] **Step 4: Implement the validation/hydration sequence**

Generate this order:

```php
/** @param array<string, mixed> $data */
public static function makeFromSkirPayload(array $data): self
{
    self::validate($data);

    $payload = [
        'user_id' => $data['user_id'],
        'address' => AddressData::makeFromSkirPayload($data['address']),
        'previous_addresses' => array_map(
            static fn (array $item): AddressData => AddressData::makeFromSkirPayload($item),
            $data['previous_addresses'],
        ),
    ];

    return self::from($payload);
}
```

Optional nested values guard `null`. Enum wrappers use `fromSkirValue()`. The inherited `from()` call receives already validated/prepared values.

- [ ] **Step 5: Execute real Simple Data Objects behavior**

The integration test creates a temporary Composer project requiring:

```json
{
  "require": {
    "php": "^8.4",
    "php-skir/runtime": "*",
    "std-out/simple-data-objects": "^1.11"
  }
}
```

It lints every PHP file, configures a `ValidatorFactory` with `company_email`, calls `BaseData::setValidatorFactory($validator)`, and verifies mapping, recursive validation, `TypedDataCollection`, `with()`, `equals()`, `toArray()`, and dense JSON round trips.

- [ ] **Step 6: Run focused tests and commit**

```bash
npm test -- tests/generator.test.ts tests/simple-data-objects-integration.test.ts
npm run typecheck
npm run build
git add src tests
git commit -m "Generate validated Simple Data Objects"
```

## Task 15: Complete Simple Data Objects RPC, CLI, Composer, and Real-Skir Coverage

**Files:**
- Create: `packages/skir-simple-data-objects-generator/src/cli.ts`
- Create: `packages/skir-simple-data-objects-generator/src/configure-composer.ts`
- Create: `packages/skir-simple-data-objects-generator/src/composer-autoload.ts`
- Create: `packages/skir-simple-data-objects-generator/tests/cli.test.ts`
- Create: `packages/skir-simple-data-objects-generator/tests/composer-autoload.test.ts`
- Create: `packages/skir-simple-data-objects-generator/tests/configure-composer.test.ts`
- Create: `packages/skir-simple-data-objects-generator/tests/skir-cli-integration.test.ts`
- Modify: `packages/skir-simple-data-objects-generator/tests/generator.test.ts`
- Modify: `packages/skir-simple-data-objects-generator/tests/simple-data-objects-integration.test.ts`

- [ ] **Step 1: Write failing full-artifact tests**

Assert nine outputs for a module with one struct, one enum, and one method: two record files, six PHP RPC files, and one server manifest. Verify typed method signatures, client response hydration through `makeFromSkirPayload()`, procedure conversion through `toSkirArray()`, and `Data`-suffixed manifest classes.

- [ ] **Step 2: Enable common RPC and manifest rendering**

Implement `phpType`, `toSkirExpression`, `fromSkirExpression`, `clientResponseExpression`, and `manifestObjectClass` for primitives, records, optionals, arrays, enum wrappers, nested structs, and typed direct struct collections so core `render-rpc.ts` can produce the complete surface. Typed collections must unwrap with `->all()` before recursive Skir conversion:

```ts
return `array_map(fn (mixed $item): mixed => ${itemExpression}, ${expression}->all())`;
```

- [ ] **Step 3: Add thin Composer and CLI wrappers**

Delegate to core with binary and module ID `skir-simple-data-objects-generator`, preserving the established usage shape:

```text
skir-simple-data-objects-generator configure-composer [--root <dir>] [--mod <module>]
```

- [ ] **Step 4: Add a real Skir CLI fixture**

Use `skir gen` with imported `Address`, nested `User`, `SubscriptionStatus`, typed struct collections, optionals, and `GetUser`. Assert the generated directory is executable and the server manifest matches exact module/method identities.

- [ ] **Step 5: Run the complete new-package suite**

```bash
npm test
npm run typecheck
npm run build
npm run pack:dry-run
```

Expected: all commands pass.

- [ ] **Step 6: Commit full integration**

```bash
git add src tests package.json
git commit -m "Add complete Simple Data Objects RPC generation"
```

## Task 16: Document Every Package and Verify Release Readiness

**Files:**
- Create: `packages/generator-core/README.md`
- Modify: `packages/skir-php-generator/.worktrees/shared-generator-core/README.md`
- Modify: `packages/skir-laravel-data-generator/.worktrees/shared-generator-core/README.md`
- Create: `packages/skir-simple-data-objects-generator/README.md`
- Create/modify: `.github/workflows/tests.yml` and `.github/workflows/release.yml` in both new repositories
- Modify: adapter `package-lock.json` files only after the core package is available from npm

- [ ] **Step 1: Write the four README contracts**

The core README documents its build-time role, adapter interface, compatibility guarantees, local linking, tests, and release order.

The standard README explicitly states:

```text
This generator intentionally performs no application validation. In Laravel, validate untrusted input with a handwritten Form Request before constructing generated objects. In other frameworks, use that framework's validator or an application-owned validation boundary.
```

The Laravel Data README documents the exact nested `validation` configuration, original Skir selector names, `MergeValidationRules`, custom named-rule registration, no-overlay compatibility, and the handwritten boundary for object/closure rules.

The Simple Data Objects README documents npm/Composer installation, `skir.yml`, `configure-composer`, `skirout` ownership, inherited APIs, mapped names, typed collection semantics, structural rules, recursive RPC validation, custom named rules in Laravel and standalone `ValidatorFactory`, object/closure limitations, enums, clients, procedures, manifests, and release steps.

- [ ] **Step 2: Add CI for the two new repositories**

Core CI runs install, typecheck, build, pack dry-run, and tests on Node 22. Its release workflow uses Node 24 and trusted npm publishing.

Simple Data Objects CI additionally checks out `php-skir/runtime`, configures PHP 8.4 and Composer, and passes `SKIR_RUNTIME_PATH` to tests, matching existing generator workflows.

- [ ] **Step 3: Run all repository verification before external release actions**

In core, standard, Laravel Data, and Simple Data Objects repositories run:

```bash
npm test
npm run typecheck
npm run build
npm run pack:dry-run
git diff --check
git status --short --branch
```

Expected: tests and builds pass. Before semver dependency installation, adapter worktrees may show only the intentionally deferred lockfile state; source trees must have no unrelated changes.

- [ ] **Step 4: Commit documentation and workflows per repository**

```bash
git add README.md .github
git commit -m "Document generator package workflows"
```

Use the narrower relevant file list in repositories where `.github` did not change.

- [ ] **Step 5: Stop for explicit release/integration approval**

Report all four branch heads, tests, local-link dependency state, and this required order:

```text
1. Merge and publish @php-skir/generator-core 0.1.0.
2. Replace local links by installing @php-skir/generator-core@^0.1.0 in each adapter.
3. Commit adapter package-lock.json changes.
4. Re-run npm ci plus every full verification command.
5. Merge/release the standard, Laravel Data, and Simple Data Objects adapters.
```

Do not run `git push`, create releases, or run `npm publish` without approval.

- [ ] **Step 6: After approval, install the published dependency and prove clean installs**

```bash
npm install @php-skir/generator-core@^0.1.0
npm ci
npm test
npm run typecheck
npm run build
npm run pack:dry-run
```

Run in each adapter, commit only `package.json` and `package-lock.json` changes with message `Use published PHP generator core`, and verify clean status.

## Final Acceptance Check

- Standard compatibility snapshot unchanged.
- Laravel Data no-overlay snapshot unchanged.
- Both validation-aware adapters reject bad selectors and execute custom named rules.
- Simple Data Objects uses `BaseData`, mapped input names, typed struct collections, wrapper enums, raw-first recursive validation, and the complete RPC/manifest surface.
- All READMEs clearly document validation ownership and customization.
- All four packages pass tests, typecheck, build, and package dry-run from clean installs.
- Branch heads and release order are reported without implicit merge, push, release, or publish actions.
