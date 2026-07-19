import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

describe("skir CLI integration", () => {
  it("generates executable PHP from a real .skir fixture", () => {
    const projectPath = mkdtempSync(join(tmpdir(), "skir-php-cli-"));
    const skirSourcePath = join(projectPath, "skir-src");
    const adminSkirSourcePath = join(skirSourcePath, "admin");
    const commonSkirSourcePath = join(skirSourcePath, "common");
    const stubClientPath = join(projectPath, "stub-client", "Skir", "Client");
    const generatedPath = join(projectPath, "generated", "skirout");
    const runtimePath = process.env.SKIR_RUNTIME_PATH ?? resolve("../runtime");
    const generatorPath = resolve("dist/index.js");
    const skirBinPath = resolve("node_modules/skir/dist/compiler.js");

    expect(existsSync(generatorPath)).toBe(true);
    expect(existsSync(skirBinPath)).toBe(true);

    mkdirSync(adminSkirSourcePath, { recursive: true });
    mkdirSync(commonSkirSourcePath, { recursive: true });
    mkdirSync(stubClientPath, { recursive: true });

    writeFileSync(
      join(projectPath, "skir.yml"),
      [
        "generators:",
        `  - mod: ${pathToFileURL(generatorPath).href}`,
        "    outDir: generated/skirout",
        "    config:",
        '      namespace: "Skir"',
        "",
      ].join("\n"),
    );

    writeFileSync(
      join(adminSkirSourcePath, "users.skir"),
      [
        'import { Address } from "../common/address.skir";',
        "",
        "struct User {",
        "  user_id: int32;",
        "  name: string;",
        "  address: Address;",
        "  previous_addresses: [Address];",
        "  subscription_status: SubscriptionStatus;",
        "  status_history: [SubscriptionStatus];",
        "}",
        "",
        "enum SubscriptionStatus {",
        "  free;",
        "  premium_since: timestamp;",
        "}",
        "",
        "method GetUser(User): User = 3180856469;",
        "",
      ].join("\n"),
    );

    writeFileSync(
      join(adminSkirSourcePath, "profiles.skir"),
      [
        "struct User {",
        "  display_name: string;",
        "}",
        "",
      ].join("\n"),
    );

    writeFileSync(
      join(commonSkirSourcePath, "address.skir"),
      [
        "struct Address {",
        "  city: string;",
        "  postal_codes: [string];",
        "}",
        "",
      ].join("\n"),
    );

    writeFileSync(
      join(projectPath, "composer.json"),
      JSON.stringify(
        {
          repositories: [
            {
              type: "path",
              url: runtimePath,
              options: {
                symlink: false,
              },
            },
          ],
          require: {
            php: "^8.3",
            "php-skir/runtime": "*",
          },
          autoload: {
            "psr-4": {
              "Skir\\Client\\": "stub-client/Skir/Client/",
            },
          },
          config: {
            "sort-packages": true,
          },
          "minimum-stability": "dev",
          "prefer-stable": true,
        },
        null,
        2,
      ),
    );

    writeFileSync(
      join(stubClientPath, "SkirClient.php"),
      `<?php

declare(strict_types=1);

namespace Skir\\Client;

use Skir\\Runtime\\MethodDescriptor;

final class SkirClient
{
    public function invoke(MethodDescriptor $descriptor, mixed $request): mixed
    {
        if ($descriptor->name !== 'GetUser') {
            throw new \\RuntimeException('Unexpected method descriptor.');
        }

        return $request;
    }
}
`,
    );

    writeFileSync(
      join(projectPath, "verify.php"),
      `<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use Skir\\Admin\\SkirMethods;
use Skir\\Admin\\SkirRpcClient;
use Skir\\Admin\\SubscriptionStatus;
use Skir\\Admin\\UsersUser;
use Skir\\Common\\Address;
use Skir\\Client\\SkirClient as TransportSkirClient;

$user = new UsersUser(
    userId: 400,
    name: 'John Doe',
    address: new Address(city: 'Antwerp', postalCodes: ['2000', '2018']),
    previousAddresses: [
        new Address(city: 'Brussels', postalCodes: ['1000']),
    ],
    subscriptionStatus: SubscriptionStatus::premiumSince(1743682787000),
    statusHistory: [
        SubscriptionStatus::free(),
        SubscriptionStatus::premiumSince(1743682787000),
    ],
);

if ($user->toDenseJson() !== '[400,"John Doe",["Antwerp",["2000","2018"]],[["Brussels",["1000"]]],[2,1743682787000],[1,[2,1743682787000]]]') {
    throw new RuntimeException('Unexpected user dense JSON: '.$user->toDenseJson());
}

$decodedUser = UsersUser::fromDenseJson('[400,"John Doe",["Antwerp",["2000","2018"]],[["Brussels",["1000"]]],[2,1743682787000],[1,[2,1743682787000]]]');

if ($decodedUser->address->city !== 'Antwerp' || $decodedUser->previousAddresses[0]->city !== 'Brussels') {
    throw new RuntimeException('Unexpected decoded user.');
}

if ($decodedUser->subscriptionStatus->name() !== 'premium_since' || $decodedUser->subscriptionStatus->payload() !== 1743682787000) {
    throw new RuntimeException('Unexpected decoded status field.');
}

if (count($decodedUser->statusHistory) !== 2 || $decodedUser->statusHistory[0]->name() !== 'free') {
    throw new RuntimeException('Unexpected decoded status history.');
}

$status = SubscriptionStatus::premiumSince(1743682787000);

if ($status->toDenseJson() !== '[2,1743682787000]') {
    throw new RuntimeException('Unexpected status dense JSON: '.$status->toDenseJson());
}

$method = SkirMethods::getUser();

if ($method->name !== 'GetUser' || $method->number !== 3180856469) {
    throw new RuntimeException('Unexpected method descriptor.');
}

$rpcClient = new SkirRpcClient(new TransportSkirClient());
$rpcUser = $rpcClient->getUser($user);

if (! $rpcUser instanceof UsersUser || $rpcUser->name !== 'John Doe') {
    throw new RuntimeException('Unexpected generated client response.');
}
`,
    );

    try {
      execFileSync("node", [skirBinPath, "gen", "--root", projectPath], {
        cwd: resolve("."),
        stdio: "pipe",
      });

      const generatedFiles = [
        join(generatedPath, "Admin", "AbstractSkirProcedures.php"),
        join(generatedPath, "Admin", "UsersUser.php"),
        join(generatedPath, "Admin", "ProfilesUser.php"),
        join(generatedPath, "Admin", "SubscriptionStatus.php"),
        join(generatedPath, "Admin", "AdminSkirMethod.php"),
        join(generatedPath, "Admin", "SkirMethods.php"),
        join(generatedPath, "Admin", "SkirProcedureProvider.php"),
        join(generatedPath, "Admin", "SkirProcedures.php"),
        join(generatedPath, "Admin", "SkirRpcClient.php"),
        join(generatedPath, "Common", "Address.php"),
      ];

      for (const generatedFile of generatedFiles) {
        expect(existsSync(generatedFile)).toBe(true);
        execFileSync("php", ["-l", generatedFile], { stdio: "pipe" });
      }

      expect(existsSync(join(generatedPath, "Admin", "User.php"))).toBe(false);

      const manifestPath = join(generatedPath, "skir-server-manifest.json");

      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

      expect(manifest).toEqual({
        version: 1,
        generator: "skir-php-generator",
        modules: [
          {
            name: "Admin",
            methodEnum: "Skir\\Admin\\AdminSkirMethod",
            methods: [
              {
                name: "GetUser",
                enumCase: "GetUser",
                phpMethod: "getUser",
                requestType: "Skir\\Admin\\UsersUser",
                requestClass: "Skir\\Admin\\UsersUser",
                responseType: "Skir\\Admin\\UsersUser",
                responseClass: "Skir\\Admin\\UsersUser",
              },
            ],
          },
        ],
      });

      const userCode = readFileSync(join(generatedPath, "Admin", "UsersUser.php"), "utf8");
      const methodsCode = readFileSync(join(generatedPath, "Admin", "SkirMethods.php"), "utf8");
      const providerCode = readFileSync(join(generatedPath, "Admin", "SkirProcedureProvider.php"), "utf8");
      const clientCode = readFileSync(join(generatedPath, "Admin", "SkirRpcClient.php"), "utf8");

      expect(userCode).toContain("use Skir\\Common\\Address;");
      expect(userCode).not.toContain("\\Skir\\Common\\Address");
      expect(methodsCode).toContain("requestType: UsersUser::skirType()");
      expect(methodsCode).toContain("responseType: UsersUser::skirType()");
      expect(providerCode).toContain("namespace Skir\\Admin;");
      expect(clientCode).toContain("public function getUser(UsersUser $request): UsersUser");

      execFileSync("node", [resolve("dist/cli.js"), "configure-composer", "--root", projectPath, "--mod", pathToFileURL(generatorPath).href], {
        cwd: resolve("."),
        stdio: "pipe",
      });

      expect(JSON.parse(readFileSync(join(projectPath, "composer.json"), "utf8"))
        .autoload["psr-4"]["Skir\\"]).toBe("generated/skirout/");

      execFileSync("composer", ["install", "--no-interaction", "--no-progress"], {
        cwd: projectPath,
        stdio: "pipe",
      });

      execFileSync("php", ["verify.php"], {
        cwd: projectPath,
        stdio: "pipe",
      });
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  }, 180_000);
});
