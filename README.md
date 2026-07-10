# Skir PHP Generator

Generates framework-agnostic PHP data objects, RPC clients, and server procedure contracts from Skir schemas.

Generated PHP uses `php-skir/runtime` for dense JSON serialization. Install `php-skir/client` when using generated RPC clients and `php-skir/server` when using generated server contracts.

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

## Releasing

Create a GitHub release for the version in `package.json`. The release workflow reruns type checks, build, package validation, and tests before publishing to npm with provenance. It expects an `NPM_TOKEN` repository secret.
