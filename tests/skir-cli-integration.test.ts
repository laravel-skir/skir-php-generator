import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

describe("skir CLI integration", () => {
  it("generates executable PHP from a real .skir fixture", () => {
    const projectPath = mkdtempSync(join(tmpdir(), "skir-php-cli-"));
    const skirSourcePath = join(projectPath, "skir-src");
    const generatedPath = join(projectPath, "generated", "skirout");
    const runtimePath = process.env.SKIR_RUNTIME_PATH ?? resolve("../runtime");
    const generatorPath = resolve("dist/index.js");
    const skirBinPath = resolve("node_modules/skir/dist/compiler.js");

    expect(existsSync(generatorPath)).toBe(true);
    expect(existsSync(skirBinPath)).toBe(true);

    mkdirSync(skirSourcePath, { recursive: true });

    writeFileSync(
      join(projectPath, "skir.yml"),
      [
        "generators:",
        `  - mod: ${pathToFileURL(generatorPath).href}`,
        "    outDir: generated/skirout",
        "    config:",
        '      namespace: "App\\\\Skir"',
        "",
      ].join("\n"),
    );

    writeFileSync(
      join(skirSourcePath, "users.skir"),
      [
        "struct Address {",
        "  city: string;",
        "  postal_codes: [string];",
        "}",
        "",
        "struct User {",
        "  user_id: int32;",
        "  name: string;",
        "  address: Address;",
        "  previous_addresses: [Address];",
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
            "laravel-skir/runtime": "*",
          },
          autoload: {
            "psr-4": {
              "App\\Skir\\": "generated/skirout/",
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
      join(projectPath, "verify.php"),
      `<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use App\\Skir\\Address;
use App\\Skir\\SkirMethods;
use App\\Skir\\SubscriptionStatus;
use App\\Skir\\User;

$user = new User(
    userId: 400,
    name: 'John Doe',
    address: new Address(city: 'Antwerp', postalCodes: ['2000', '2018']),
    previousAddresses: [
        new Address(city: 'Brussels', postalCodes: ['1000']),
    ],
);

if ($user->toDenseJson() !== '[400,"John Doe",["Antwerp",["2000","2018"]],[["Brussels",["1000"]]]]') {
    throw new RuntimeException('Unexpected user dense JSON: '.$user->toDenseJson());
}

$decodedUser = User::fromDenseJson('[400,"John Doe",["Antwerp",["2000","2018"]],[["Brussels",["1000"]]]]');

if ($decodedUser->address->city !== 'Antwerp' || $decodedUser->previousAddresses[0]->city !== 'Brussels') {
    throw new RuntimeException('Unexpected decoded user.');
}

$status = SubscriptionStatus::premiumSince(1743682787000);

if ($status->toDenseJson() !== '[2,1743682787000]') {
    throw new RuntimeException('Unexpected status dense JSON: '.$status->toDenseJson());
}

$method = SkirMethods::getUser();

if ($method->name !== 'GetUser' || $method->number !== 3180856469) {
    throw new RuntimeException('Unexpected method descriptor.');
}
`,
    );

    try {
      execFileSync("node", [skirBinPath, "gen", "--root", projectPath], {
        cwd: resolve("."),
        stdio: "pipe",
      });

      expect(existsSync(join(generatedPath, "Address.php"))).toBe(true);
      expect(existsSync(join(generatedPath, "User.php"))).toBe(true);
      expect(existsSync(join(generatedPath, "SubscriptionStatus.php"))).toBe(true);
      expect(existsSync(join(generatedPath, "SkirMethods.php"))).toBe(true);

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
  }, 60_000);
});
