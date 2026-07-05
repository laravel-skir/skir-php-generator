# Skir PHP Generator

Generates framework-agnostic PHP data objects for Skir schemas.

Generated PHP code uses `laravel-skir/runtime` for dense JSON serialization. If you use generated RPC clients, install `laravel-skir/client` as well.

## Installation

```bash
npm install --save-dev skir-php-generator
composer require laravel-skir/runtime
```

For generated typed RPC clients:

```bash
composer require laravel-skir/client
```

## Releasing

Create a GitHub release for the version in `package.json`. The release workflow reruns type checks, build, package validation, and tests before publishing to npm with provenance. It expects an `NPM_TOKEN` repository secret.

## Usage with Skir

Add the generator to `skir.yml`:

```yaml
generators:
  php:
    package: skir-php-generator
    output: generated/php
    config:
      namespace: App\Skir
```

Then run the Skir generator command for your project.

## Generated PHP

The generator emits readonly PHP classes for Skir structs and enum wrapper classes for Skir enums. Generated classes expose:

- `skirType()` for runtime type descriptors.
- `toArray()` and `fromArray()` for PHP array conversion.
- `toDenseJson()` and `fromDenseJson()` for dense JSON payloads.
- `toSkirValue()` and `fromSkirValue()` on generated enum classes.

SkirRPC methods are emitted in `SkirMethods.php` as `MethodDescriptor` instances.

When a module defines SkirRPC methods, the generator also emits `SkirRpcClient.php`. It wraps `LaravelSkir\Client\SkirClient` and exposes typed methods:

```php
use App\Skir\Admin\SkirRpcClient;
use LaravelSkir\Client\SkirClient as TransportSkirClient;

$client = new SkirRpcClient(new TransportSkirClient('https://example.com/skir'));
$user = $client->getUser($request);
```

For servers, the generator emits `AbstractSkirProcedures.php`, `SkirProcedures.php`, and `SkirProcedureProvider.php`.

The recommended Laravel server path is to extend the generated abstract class and register your concrete procedure class directly:

```php
use App\Skir\Admin\AbstractSkirProcedures;
use App\Skir\Admin\GetUserRequest;
use App\Skir\Admin\User;
use Illuminate\Support\Facades\Route;
use LaravelSkir\Server\RequestContext;

final class AdminProcedures extends AbstractSkirProcedures
{
    public function getUser(GetUserRequest $request, RequestContext $context): User
    {
        return new User(
            userId: $request->userId,
            name: 'Maxim',
        );
    }
}

Route::skirRpc('/api/skir', [
    AdminProcedures::class,
]);
```

`AbstractSkirProcedures` registers generated method descriptors, converts incoming Skir payload arrays into generated PHP DTOs, calls your typed methods, and converts returned DTOs back into Skir payload arrays.

The interface/provider pair remains available if you prefer binding `SkirProcedures` in the container and registering `SkirProcedureProvider`.

## Namespaces and modules

The configured namespace defaults to `App\Skir`. Module directories become PHP subnamespaces and output directories:

```text
admin/users.skir -> App\Skir\Admin
```

When two generated records would otherwise use the same PHP class name in the same namespace, the generator prefixes the class with the module basename to keep output deterministic.

## Current scope

This package generates framework-agnostic PHP DTOs, method descriptors, typed client adapters, and Laravel Skir server procedure adapters. Laravel-specific data objects and server routing live in separate packages.
