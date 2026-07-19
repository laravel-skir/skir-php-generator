# Skir PHP Generator

[![Tests](https://github.com/php-skir/skir-php-generator/actions/workflows/tests.yml/badge.svg)](https://github.com/php-skir/skir-php-generator/actions/workflows/tests.yml)
[![Coverage](https://raw.githubusercontent.com/php-skir/skir-php-generator/badges/coverage.svg)](https://github.com/php-skir/skir-php-generator/actions/workflows/tests.yml)
[![npm](https://img.shields.io/npm/v/skir-php-generator?label=npm&logo=npm)](https://www.npmjs.com/package/skir-php-generator)
[![Node.js](https://img.shields.io/badge/Node.js-22%20%7C%2024-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/php-skir/skir-php-generator)](LICENSE)

Generates framework-agnostic PHP data objects, RPC clients, and server procedure contracts from Skir schemas.

Generated PHP uses `php-skir/runtime` for dense JSON serialization. Install `php-skir/client` when using generated RPC clients and `php-skir/server` when using generated server contracts.

The npm package uses [`@php-skir/generator-core`](https://github.com/php-skir/generator-core) at generation time for schema normalization, PHP naming and imports, shared enum and RPC rendering, server manifests, and Composer configuration. This package remains the framework-agnostic adapter: it owns the standard PHP data-object representation and conversions, while `php-skir/runtime` remains the Composer dependency used by the generated PHP at runtime.

## Installation

```bash
npm install --save-dev skir skir-php-generator
composer require php-skir/runtime
```

For generated typed RPC clients:

```bash
composer require php-skir/client
```

For generated server contracts:

```bash
composer require php-skir/server
```

## Configure Skir

Add the PHP generator to the root `skir.yml`:

```yaml
generators:
  - mod: skir-php-generator
    outDir: generated/php/skirout
    config:
      namespace: Skir
```

The `generators` value uses Skir's current array syntax. Skir owns the configured `outDir` and may replace generated files there, so do not store handwritten PHP in that directory. Keep each generator in a dedicated output directory whose path ends in `/skirout`; the suffix identifies it as generator-owned output.

The root namespace defaults to `Skir`, so the `config` block can be omitted when that default is suitable. Schema directories become PHP subnamespaces and output directories:

```text
skir-src/health/health.skir -> generated/php/skirout/Health/HealthRequest.php
                            -> Skir\Health\HealthRequest
```

Only source directories become namespace segments. The `.skir` filename itself does not add a namespace segment, so `health.skir` does not produce another `Health` level.

A separate `Generated` namespace segment is unnecessary. The dedicated `generated/php/skirout` directory already separates generated code from handwritten application code, while the short `Skir` namespace keeps imports clear.

Every emitted PHP file contains a `DO NOT EDIT` banner. Change the `.skir` source or generator configuration and regenerate instead of editing generated PHP.

## Generate and configure Composer

Run generation before configuring Composer because the configurator verifies that every output directory already exists:

```bash
npx skir gen
npx skir-php-generator configure-composer
composer dump-autoload
```

`configure-composer` reads `skir.yml` and `composer.json` from the current project root. It finds the exact `mod: skir-php-generator` entry, normalizes the namespace and output path, and adds the matching Composer PSR-4 mapping. It prints whether the mapping was added or already unchanged.

The command only updates `composer.json`. It does not run Composer, so run `composer dump-autoload` afterward. Use `--root <dir>` for another project root or `--mod <module>` when the generator's `mod` is an exact alternative identifier such as a local file URL:

```bash
npx skir-php-generator configure-composer --root ../api --mod file:///path/to/skir-php-generator/dist/index.js
```

The operation is idempotent. An existing equivalent mapping is left byte-for-byte unchanged. If the namespace prefix already points somewhere else, the command exits with an error and does not modify `composer.json`. It also stops with a useful error when `skir.yml` or `composer.json` is missing or invalid, the matching generator configuration is missing or invalid, an output path escapes the project root, or a generated output directory does not exist.

When `outDir` is an ordered array, the configurator preserves that order in Composer's array-valued PSR-4 mapping. An existing Composer path array must match the entire configured array in the same order. Any difference is a conflict: the configurator fails without appending, merging, or modifying the existing mapping.

### Package script automation

The workflow can be kept in `package.json`:

```json
{
  "scripts": {
    "skir:generate": "skir gen && skir-php-generator configure-composer"
  }
}
```

Then run:

```bash
npm run skir:generate
```

Refresh Composer's autoloader as a separate follow-up step:

```bash
composer dump-autoload
```

### Manual Composer mapping

To configure Composer manually, map the root namespace to the same generator-owned `outDir` and include trailing slashes:

```json
{
  "autoload": {
    "psr-4": {
      "Skir\\": "generated/php/skirout/"
    }
  }
}
```

After editing `composer.json`, run:

```bash
composer dump-autoload
```

## Generated PHP

The generator emits readonly PHP classes for Skir structs and enum wrapper classes for Skir enums. Generated classes expose:

- `skirType()` for runtime type descriptors.
- `toArray()` and `fromArray()` for PHP array conversion.
- `toDenseJson()` and `fromDenseJson()` for dense JSON payloads.
- `toSkirValue()` and `fromSkirValue()` on generated enum classes.

SkirRPC methods are emitted in `SkirMethods.php` as `MethodDescriptor` instances. The generator also emits a module-scoped method enum such as `AdminSkirMethod.php` for typed server routing.

When a module defines SkirRPC methods, the generator emits `SkirRpcClient.php`. It wraps `Skir\Client\SkirClient` and exposes typed methods:

```php
use Skir\Admin\SkirRpcClient;
use Skir\Client\SkirClient as TransportSkirClient;

$client = new SkirRpcClient(new TransportSkirClient('https://example.com/skir'));
$user = $client->getUser($request);
```

For servers, the generator emits a module method enum, `AbstractSkirProcedures.php`, `SkirProcedures.php`, and `SkirProcedureProvider.php`.

When two generated records would otherwise use the same PHP class name in one namespace, the generator prefixes each class with its module basename to keep output deterministic.

## Validation ownership

This generator intentionally performs no application validation. In Laravel, validate untrusted input with a handwritten Form Request before constructing generated objects. In other frameworks, use that framework's validator or an application-owned validation boundary.

The generated classes describe and convert the Skir wire format; they are not an input-validation boundary. Keep validation code outside `skirout`, because Skir owns that directory and regeneration overwrites its contents.

## Server scaffolding manifest

Each generation run writes `skir-server-manifest.json` at the root of the configured `outDir`. For the configuration above, the path is:

```text
generated/php/skirout/skir-server-manifest.json
```

The manifest is consumed by the [`php-skir/server`](https://github.com/php-skir/server) Laravel scaffolding commands. Keep the manifest path in the server package configuration aligned with the generator `outDir`.

Manifest module names use the generated PHP namespace segments joined with dots: `user-profile/` becomes `UserProfile`, nested `admin/users/` becomes `Admin.Users`, and a literal `admin.users/` directory becomes `AdminUsers`. Root-level methods use the reserved `_Root` module, while a real `Root/` directory remains `Root`. These names prefix exact server method IDs such as `_Root.Health` and `UserProfile.GetProfile`. Generation fails when distinct source directories normalize to the same PHP module instead of merging them.

The current schema version is `1`:

```json
{
  "version": 1,
  "generator": "skir-php-generator",
  "modules": [
    {
      "name": "Admin",
      "methodEnum": "Skir\\Admin\\AdminSkirMethod",
      "methods": [
        {
          "name": "GetUser",
          "enumCase": "GetUser",
          "phpMethod": "getUser",
          "requestType": "Skir\\Admin\\GetUserRequest",
          "requestClass": "Skir\\Admin\\GetUserRequest",
          "responseType": "Skir\\Admin\\GetUserResponse",
          "responseClass": "Skir\\Admin\\GetUserResponse"
        }
      ]
    }
  ]
}
```

`methodEnum` and record request and response types are fully qualified PHP names without a leading backslash. `requestClass` is non-null only when the request is a generated object/struct DTO that can be hydrated through a Form Request; enum and other value requests use `null` while `requestType` retains their PHP type. `responseClass` identifies a generated response class that can be imported. Scalar and union types use PHP type syntax and have a `null` class field. Optional object/struct requests keep their underlying DTO in `requestClass`. Names are derived from the actual generated record location, including nested and cross-module references.

Run `npx skir gen` after changing a schema. No extra generator option is required to emit the manifest.

## Releasing

`@php-skir/generator-core` is a normal semver dependency of this package. Publish the required core version first, replace any local development link with that published version, update the lockfile, and verify a clean `npm ci` before releasing this adapter.

Create a GitHub release for the version in `package.json`. The release workflow reruns type checks, build, package validation, and tests before publishing to npm with provenance. Configure this GitHub repository and its `release.yml` workflow as an npm trusted publisher; the workflow authenticates through OIDC and does not use a long-lived npm token.
