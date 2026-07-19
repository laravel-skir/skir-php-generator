import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { generatePhpFiles } from "../src/generator.js";

const COMPOSER_INSTALL_TIMEOUT_MS = 45_000;
const PROCESS_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const projectPaths = new Set<string>();

afterEach(() => {
  for (const projectPath of projectPaths) {
    rmSync(projectPath, { recursive: true, force: true });
  }

  projectPaths.clear();
});

function createProject(): string {
  const projectPath = mkdtempSync(join(tmpdir(), "skir-php-generator-"));
  projectPaths.add(projectPath);

  return projectPath;
}

describe("generated PHP", () => {
  it("round-trips dense JSON through php-skir/runtime", () => {
    const projectPath = createProject();
    const sourcePath = join(projectPath, "src");
    const runtimePath = process.env.SKIR_RUNTIME_PATH ?? resolve("../runtime");

    mkdirSync(sourcePath, { recursive: true });

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
              "App\\Skir\\": "src/",
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

    const files = generatePhpFiles({
      config: {
        namespace: "App\\Skir",
      },
      modules: [
        {
          path: "fixtures.skir",
          records: [
            {
              kind: "struct",
              name: "Address",
              fields: [
                { kind: "field", name: "city", number: 0, type: { kind: "string" } },
                { kind: "field", name: "postal_codes", number: 1, type: { kind: "array", item: { kind: "primitive", primitive: "string" } } },
              ],
            },
            {
              kind: "struct",
              name: "HealthCheckRequest",
              fields: [],
            },
            {
              kind: "struct",
              name: "User",
              fields: [
                { kind: "field", name: "user_id", number: 0, type: { kind: "int32" } },
                { kind: "removed", number: 1 },
                { kind: "field", name: "name", number: 2, type: { kind: "string" } },
                { kind: "field", name: "address", number: 3, type: { kind: "record", name: "Address" } },
                { kind: "field", name: "tags", number: 4, type: { kind: "array", item: { kind: "primitive", primitive: "string" } } },
                { kind: "field", name: "nickname", number: 5, type: { kind: "optional", other: { kind: "primitive", primitive: "string" } } },
                { kind: "field", name: "previous_addresses", number: 6, type: { kind: "array", item: { kind: "record", name: "Address" } } },
                { kind: "field", name: "subscription_status", number: 7, type: { kind: "record", name: "SubscriptionStatus", recordType: "enum" } },
                { kind: "field", name: "status_history", number: 8, type: { kind: "array", item: { kind: "record", name: "SubscriptionStatus", recordType: "enum" } } },
              ],
            },
            {
              recordType: "enum",
              name: "SubscriptionStatus",
              fields: [
                { kind: "field", name: "free", number: 1 },
                { kind: "field", name: "premium_since", number: 2, type: { kind: "timestamp" } },
              ],
            },
          ],
          methods: [
            {
              kind: "method",
              name: "GetUser",
              number: 3180856469,
              requestType: { kind: "record", name: "User" },
              responseType: { kind: "record", name: "User" },
            },
          ],
        },
      ],
    });

    for (const file of files) {
      const filePath = join(sourcePath, file.path);

      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, file.code);
      execFileSync("php", ["-l", filePath], { stdio: "pipe" });
    }

    writeFileSync(
      join(projectPath, "verify.php"),
      `<?php

declare(strict_types=1);

require __DIR__.'/vendor/autoload.php';

use App\\Skir\\SubscriptionStatus;
use App\\Skir\\SkirMethods;
use App\\Skir\\Address;
use App\\Skir\\HealthCheckRequest;
use App\\Skir\\User;

$healthCheckRequest = new HealthCheckRequest();

if ($healthCheckRequest->toDenseJson() !== '[]') {
    throw new RuntimeException('Unexpected health check dense JSON: '.$healthCheckRequest->toDenseJson());
}

$user = new User(
    userId: 400,
    name: 'John Doe',
    address: new Address(city: 'Antwerp', postalCodes: ['2000', '2018']),
    tags: ['admin', 'beta'],
    nickname: 'johnny',
    previousAddresses: [
        new Address(city: 'Brussels', postalCodes: ['1000']),
        new Address(city: 'Ghent', postalCodes: ['9000']),
    ],
    subscriptionStatus: SubscriptionStatus::premiumSince(1743682787000),
    statusHistory: [
        SubscriptionStatus::free(),
        SubscriptionStatus::premiumSince(1743682787000),
    ],
);

if ($user->toDenseJson() !== '[400,0,"John Doe",["Antwerp",["2000","2018"]],["admin","beta"],"johnny",[["Brussels",["1000"]],["Ghent",["9000"]]],[2,1743682787000],[1,[2,1743682787000]]]') {
    throw new RuntimeException('Unexpected user dense JSON: '.$user->toDenseJson());
}

$decodedUser = User::fromDenseJson('[400,0,"John Doe",["Antwerp",["2000","2018"]],["admin","beta"],"johnny",[["Brussels",["1000"]],["Ghent",["9000"]]],[2,1743682787000],[1,[2,1743682787000]]]');

if ($decodedUser->userId !== 400 || $decodedUser->name !== 'John Doe') {
    throw new RuntimeException('Unexpected decoded user.');
}

if (! $decodedUser->address instanceof Address || $decodedUser->address->city !== 'Antwerp') {
    throw new RuntimeException('Unexpected decoded address.');
}

if ($decodedUser->tags !== ['admin', 'beta'] || $decodedUser->nickname !== 'johnny') {
    throw new RuntimeException('Unexpected decoded array or optional field.');
}

if (count($decodedUser->previousAddresses) !== 2 || ! $decodedUser->previousAddresses[0] instanceof Address) {
    throw new RuntimeException('Unexpected decoded record array.');
}

if ($decodedUser->subscriptionStatus->name() !== 'premium_since' || $decodedUser->subscriptionStatus->payload() !== 1743682787000) {
    throw new RuntimeException('Unexpected decoded enum field.');
}

if (count($decodedUser->statusHistory) !== 2 || $decodedUser->statusHistory[0]->name() !== 'free') {
    throw new RuntimeException('Unexpected decoded enum array.');
}

$status = SubscriptionStatus::premiumSince(1743682787000);

if ($status->toDenseJson() !== '[2,1743682787000]') {
    throw new RuntimeException('Unexpected status dense JSON: '.$status->toDenseJson());
}

$decodedStatus = SubscriptionStatus::fromDenseJson('[2,1743682787000]');

if ($decodedStatus->name() !== 'premium_since' || $decodedStatus->payload() !== 1743682787000) {
    throw new RuntimeException('Unexpected decoded status.');
}

$method = SkirMethods::getUser();

if ($method->name !== 'GetUser' || $method->number !== 3180856469) {
    throw new RuntimeException('Unexpected method descriptor.');
}
`,
    );

    try {
      execFileSync("composer", ["install", "--no-interaction", "--no-progress"], {
        cwd: projectPath,
        env: {
          ...process.env,
          COMPOSER_HOME: join(projectPath, ".composer"),
        },
        maxBuffer: PROCESS_MAX_BUFFER_BYTES,
        stdio: "pipe",
        timeout: COMPOSER_INSTALL_TIMEOUT_MS,
      });

      execFileSync("php", ["verify.php"], {
        cwd: projectPath,
        stdio: "pipe",
      });
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
      projectPaths.delete(projectPath);
    }

    expect(files.map((file) => file.path).sort()).toEqual([
      "AbstractSkirProcedures.php",
      "Address.php",
      "HealthCheckRequest.php",
      "SkirMethod.php",
      "SkirMethods.php",
      "SkirProcedureProvider.php",
      "SkirProcedures.php",
      "SkirRpcClient.php",
      "SubscriptionStatus.php",
      "User.php",
    ]);
  }, 60_000);
});
