# Shared PHP Generator Core and Simple Data Objects Adapter

Date: 2026-07-18
Status: Approved for implementation planning

## Purpose

The PHP Skir generator ecosystem currently has separate standard PHP and Spatie Laravel Data generators with substantial duplicated schema normalization, naming, import, wire-conversion, RPC, CLI, and Composer logic.

This change introduces a shared generator core, migrates both existing generators onto it, adds validation overlays to the Laravel Data generator, and adds a full generator for `std-out/simple-data-objects`.

## Goals

- Share target-independent PHP generation behavior across all three PHP generators.
- Preserve the standard PHP generator's generated output byte for byte.
- Preserve Laravel Data output when no validation overlay is configured.
- Add custom string-rule overlays to Laravel Data and Simple Data Objects generation.
- Generate the complete Simple Data Objects surface: DTOs, enum wrappers, method descriptors, typed RPC client, and server procedure contracts.
- Use Simple Data Objects' native hydration, mapping, validation, immutable-copy, serialization, and typed-collection features where they fit Skir semantics.
- Keep handwritten validation and application code outside compiler-owned `skirout` directories.
- Document installation, generated APIs, validation customization, runtime dependencies, and generated ownership clearly.

## Non-goals

- Adding validation behavior to the standard PHP generator.
- Embedding arbitrary PHP expressions, closures, or serialized validation-rule objects in `skir.yml`.
- Converting payload-free Skir enums to native PHP enums. All Skir enums retain the stable wrapper-class representation.
- Moving PHP wire-format execution into the TypeScript generator core.
- Changing server routing, HTTP transport, or the Skir protocol.
- Refactoring unrelated packages.

## Package Boundaries

### `packages/generator-core`

Published as `@php-skir/generator-core`. This is an ESM TypeScript/npm package used at generation time.

It owns:

- normalization of real `skir-internal` `Module` and `RecordLocation` values;
- normalized PHP-oriented intermediate representations for modules, records, fields, types, and methods;
- module identity, qualified record identity, namespace, output-path, and class-name resolution;
- deterministic collision handling and import aliasing;
- PHP file/header/import/rendering primitives;
- common enum-wrapper generation;
- common method descriptor, method enum, typed client, procedure, abstract procedure, and provider generation;
- adapter hooks for target-specific struct declarations, field representations, hydration, validation, and wire conversion;
- shared namespace configuration primitives;
- shared Composer PSR-4 configuration and atomic file-update utilities;
- shared CLI argument parsing and output helpers.

It does not depend on a PHP DTO library and does not impose validation behavior on adapters.

### `packages/runtime`

Remains the Composer package `php-skir/runtime`. It is used by generated PHP at application runtime for Skir types and dense JSON. It does not contain TypeScript generator logic.

### `packages/skir-php-generator`

Remains the standard, framework-independent adapter and npm CLI. It consumes `@php-skir/generator-core`, supplies plain readonly PHP struct rendering, and accepts no validation configuration.

Its generated files must remain byte-for-byte compatible for the same normalized Skir input and configuration.

### `packages/skir-laravel-data-generator`

Remains the Spatie Laravel Data adapter and npm CLI. It consumes the shared core, preserves current output without validation overlays, and adds optional validation overlays using Laravel Data's native manual-rule merging.

### `packages/skir-simple-data-objects-generator`

New npm package and CLI with generator module ID `skir-simple-data-objects-generator`. It consumes the shared core and generates `std-out/simple-data-objects` classes plus the full existing PHP RPC surface.

Generated applications require PHP 8.4 or newer, `std-out/simple-data-objects`, and `php-skir/runtime`. Generated clients and server contracts continue to require `php-skir/client` and `php-skir/server` respectively.

## Core Generation Pipeline

1. Parse the adapter's strict configuration.
2. Normalize compiler-owned Skir modules and record locations into the shared intermediate representation.
3. Resolve stable module and qualified-record identities.
4. Validate any adapter-owned configuration against those identities.
5. Build a deterministic PHP class-name and import registry.
6. Render struct files through the selected adapter.
7. Render enum wrappers and RPC artifacts through common renderers plus adapter conversion hooks.
8. Return generated files to Skir without writing outside the configured `outDir`.

The core must not read application PHP files or write handwritten scaffolding. Skir remains the owner of each configured `skirout` directory.

## Adapter Contract

The core exposes a typed adapter contract covering the behavior that differs by target:

- struct class-name policy;
- class declaration, base class, and class-level attributes;
- target-specific imports;
- constructor field type, default, attributes, and documentation;
- direct and collection representations for record references;
- conversion from decoded Skir values into target values;
- conversion from target values into Skir runtime values;
- validated and trusted hydration entry points;
- struct serialization method names;
- response hydration for generated clients and procedure dispatch;
- optional custom validation-rule rendering.

The intermediate representation contains semantic types and stable identities, not target-specific PHP source fragments. PHP source is produced only by core renderers and adapter hooks.

## Simple Data Objects Output Contract

### Structs

Each Skir struct becomes a `*Data` class extending `StdOut\SimpleDataObjects\BaseData`.

Generated classes use constructor-promoted, public readonly properties and expose:

- `skirType()`;
- `makeFromSkirPayload()`;
- `fromSkir()`;
- `toSkirArray()`;
- `toSkir()`;
- `toSkirJson()`.

They inherit Simple Data Objects' `from()`, `fromValidated()`, `tryFrom()`, `fromJson()`, `with()`, `equals()`, `diff()`, `toArray()`, `toJson()`, collection helpers, and JSON/string interfaces.

Empty Skir structs remain instantiable without a constructor.

### Field Mapping

- A Skir field whose original name differs from its PHP camelCase property receives `#[MapPropertyName('<skir-name>')]`.
- A direct nested Skir struct is typed as its generated `*Data` class and uses Simple Data Objects' nested hydration.
- A direct array of Skir structs uses `#[DataCollection(ItemData::class)]` and `TypedDataCollection`.
- Optional direct struct collections use a nullable `TypedDataCollection` representation.
- Primitive arrays, enum arrays, and nested array shapes remain PHP arrays.
- Wire conversion explicitly unwraps typed collections and converts nested DTOs and enum wrappers before calling `php-skir/runtime`.

### Enums

Every Skir enum remains a generated wrapper class, including enums containing only constant variants. This avoids changing the public PHP type if a later schema revision adds a payload variant.

Enum wrappers retain the existing Skir runtime API, including `toSkirValue()`, `fromSkirValue()`, dense-value conversion, and variant accessors.

### RPC Artifacts

For modules containing methods, the generator emits the same complete artifact categories as the Laravel Data generator:

- `SkirMethods.php`;
- a module-scoped method enum;
- `SkirRpcClient.php`;
- `SkirProcedures.php`;
- `AbstractSkirProcedures.php`;
- `SkirProcedureProvider.php`.

Typed clients hydrate response structs through `makeFromSkirPayload()`. Server dispatch uses the same method descriptors and Skir array conversion contract as the existing adapters.

## Validation

### Configuration Shape

Validation overlays are accepted only by the Laravel Data and Simple Data Objects adapters:

```yaml
generators:
  - mod: skir-simple-data-objects-generator
    outDir: app/Skir/skirout
    config:
      namespace: Skir
      validation:
        "admin/users.skir":
          CreateUser:
            email:
              - email:rfc,dns
              - company_email
```

The first selector is the normalized Skir module path. The second is the qualified Skir record name. The third is the original Skir field name, not the generated PHP property name.

Rules are ordered, non-empty strings. They are additive and cannot remove schema-derived structural rules. Developers remain responsible for ensuring added rules do not contradict the Skir field type. The configuration does not support PHP expressions, closures, or instantiated rule objects.

Unknown modules, records, or fields fail generation with an error containing the complete selector. A malformed rule fails configuration parsing.

### Simple Data Objects Validation

The adapter derives structural rules from Skir types and emits `#[Rules([...])]` on constructor properties. Structural rules cover presence/nullability and safely representable primitive or array shape; they do not invent business constraints.

Configured rules are appended to structural rules in deterministic order.

`makeFromSkirPayload()` first calls `validate()` on the raw decoded array, while array and primitive values still have the shapes expected by Laravel's validator. It then recursively calls `makeFromSkirPayload()` for nested structs and direct struct collections before hydrating the prepared values with trusted `from()`. This ensures generated rule overlays on every nested generated type execute at RPC boundaries without applying array rules to already-hydrated objects.

Developers can register named custom string rules in Laravel's validator or provide a configured `ValidatorFactory` through Simple Data Objects in standalone applications. Object or closure rules with runtime dependencies belong in a handwritten Form Request or domain validator.

Trusted internal construction can continue to use inherited `from()` without validation.

### Laravel Data Validation

Laravel Data continues to infer structural and nested validation rules from generated property types.

When a record has configured overlays, the generated class receives `#[MergeValidationRules]` and a static `rules(): array` method containing only the configured additions. This preserves Laravel Data's inferred rules while adding the developer-owned rules.

Records without overlays receive no new class attribute or method, preserving current generated output.

Existing `makeFromSkirPayload()` validation remains the incoming RPC boundary.

### Standard PHP Validation

The standard generator's strict configuration does not accept `validation`.

Its README states that validation is application-owned: Laravel applications should use handwritten Form Requests or validators, and other frameworks should use their own validation facilities before constructing generated objects.

## Errors and Safety

- Namespace configuration remains strict and accepts only canonical PHP namespace segments.
- Module, record, field, class, and import collisions remain deterministic or fail with actionable errors.
- Validation selector and rule failures occur before files are returned.
- Output paths remain contained by Skir's configured generated root.
- Composer PSR-4 updates remain atomic, minimal, idempotent, and conflict-aware.
- A missing generated output directory still causes `configure-composer` to stop without modifying `composer.json`.
- Generated files retain the exact `DO NOT EDIT` banner.
- Handwritten code is never generated inside or moved into a compiler-owned directory.

## Documentation

### Simple Data Objects README

Document:

- npm and Composer installation;
- `skir.yml` configuration;
- Composer PSR-4 configuration workflow;
- generated ownership and `skirout` conventions;
- generated struct, enum, client, and server APIs;
- inherited Simple Data Objects capabilities;
- `MapPropertyName` behavior;
- `TypedDataCollection` behavior and the public API difference from arrays;
- structural rules and recursive RPC validation;
- validation overlay syntax and stable selectors;
- Laravel custom named-rule registration;
- standalone custom `ValidatorFactory` setup;
- why object and closure rules remain in handwritten validation;
- trusted `from()` versus validated RPC construction;
- release workflow.

### Laravel Data README

Document validation overlay syntax, stable selectors, inferred-rule merging, named custom rules, the handwritten boundary for object or closure rules, and unchanged behavior when no overlay exists.

### Standard PHP README

Document that the generator deliberately performs no validation and point Laravel users to Form Requests and other users to their framework or application validator.

### Generator Core README

Document the adapter contract, intermediate representation boundary, compatibility expectations, local development, and release ordering.

## Testing Strategy

### Core

- Normalize real `skir-internal` `Module` and `RecordLocation` shapes.
- Cover module paths, qualified record identities, nested records, optional and array types, imports, namespace aliases, and collisions.
- Exercise the adapter contract with focused fixtures.
- Test shared Composer and CLI helpers independently.

### Standard PHP Adapter

- Capture representative generated files before extraction.
- Assert byte-for-byte output compatibility after migration.
- Run the complete existing unit, Skir CLI, generated PHP, Composer, typecheck, build, and package tests.

### Laravel Data Adapter

- Preserve all existing tests.
- Assert unchanged output without overlays.
- Cover overlay parsing, manual rules, merge attributes, selector errors, rule order, nested generated types, and registered custom aliases.
- Execute generated PHP in a temporary Composer project.

### Simple Data Objects Adapter

- Cover namespace and configuration validation.
- Cover exact banners, paths, imports, and artifact counts.
- Cover empty structs, field mapping, nested structs, typed collections, optional collections, primitive and nested arrays, enum wrappers, cross-module imports, and collisions.
- Cover method descriptors, method enums, typed clients, procedures, abstract procedures, and providers.
- Run a real Skir CLI fixture.
- Lint every emitted PHP file.
- Execute a temporary Composer project using `std-out/simple-data-objects` and `php-skir/runtime`.
- Round-trip dense JSON through nested DTOs, enum wrappers, arrays, optionals, and typed collections.
- Exercise inherited hydration, serialization, `with()`, and comparison behavior.
- Verify valid and invalid structural rules, custom named rules, recursive nested validation, and trusted construction.

### Repository Verification

Each affected repository runs its relevant full suite:

- `npm test`;
- `npm run typecheck`;
- `npm run build`;
- `npm pack --dry-run` through the repository's package script when present;
- generated PHP lint and Composer integration tests;
- formatting;
- `git diff --check`;
- clean branch status.

## Delivery Sequence

1. Characterize existing standard and Laravel Data output with failing-first compatibility tests where coverage is missing.
2. Create and test `@php-skir/generator-core`.
3. Migrate the standard generator and prove byte-for-byte compatibility.
4. Migrate Laravel Data and prove no-overlay compatibility.
5. Add Laravel Data validation overlays.
6. Add the Simple Data Objects adapter and its integration suite.
7. Complete all README updates.
8. Verify every repository and report branch and release order explicitly.

The core must be published before adapter releases that depend on its published version. No branch is merged or pushed without an explicit integration decision.

## Acceptance Criteria

- All three generators use `@php-skir/generator-core`.
- Standard PHP output remains byte-for-byte compatible.
- Laravel Data output remains compatible without validation configuration.
- Both validation-aware adapters accept and enforce documented string-rule overlays.
- Invalid validation selectors fail generation.
- Simple Data Objects output uses mapped names, native nested hydration, typed struct collections, structural validation, and the complete RPC surface.
- Dense JSON round trips pass for all supported Skir shapes.
- All affected repositories pass their full verification sets.
- The four READMEs describe their intended audience and behavior without implying validation support in the standard generator.
- Generated ownership boundaries remain unchanged.
