import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { generatePhpFiles } from "../src/generator.js";

describe("StandardPhpTarget", () => {
  it("is exposed by the package entrypoint", async () => {
    const packageExports = await import("../src/index.js");

    expect("StandardPhpTarget" in packageExports).toBe(true);
  });

  it("keeps recursive standard PHP conversions and scalar unions", () => {
    const files = generatePhpFiles({
      modules: [{
        path: "models/types.skir",
        records: [{
          kind: "enum",
          name: "Status",
          fields: [{ kind: "field", name: "ready", number: 1 }],
        }, {
          kind: "struct",
          name: "Payload",
          fields: [{ kind: "field", name: "sequence", number: 1, type: "int64" }, {
            kind: "field",
            name: "checksum",
            number: 2,
            type: "hash64",
          }, {
            kind: "field",
            name: "statuses",
            number: 3,
            type: {
              kind: "optional",
              other: {
                kind: "array",
                item: {
                  kind: "array",
                  item: {
                    kind: "record",
                    name: "Status",
                    recordType: "enum",
                  },
                },
              },
            },
          }],
        }],
      }],
    });
    const payload = files.find((file) => file.path === "Models/Payload.php")?.code ?? "";

    expect(payload).toContain("public int|string $sequence");
    expect(payload).toContain("public int|string $checksum");
    expect(payload).toContain(
      "'statuses' => $this->statuses === null ? null : array_map(fn (mixed $item): mixed => array_map(fn (mixed $item): mixed => $item->toSkirValue(), $item), $this->statuses)",
    );
    expect(payload).toContain(
      "statuses: $data['statuses'] === null ? null : array_map(fn (mixed $item): mixed => array_map(fn (mixed $item): mixed => Status::fromSkirValue($item), $item), $data['statuses'])",
    );
  });

  it("uses a fully qualified record name when its basename is reserved locally", () => {
    const commonAddress = {
      kind: "record" as const,
      key: "common-address",
      name: "Address",
      recordType: "struct" as const,
      fields: [],
    };
    const files = generatePhpFiles({
      config: { namespace: "App\\Skir" },
      modules: [{
        path: "common/address.skir",
        records: [commonAddress],
      }, {
        path: "admin/address.skir",
        records: [{
          kind: "record",
          name: "Address",
          recordType: "struct",
          fields: [{
            kind: "field",
            name: "billing_address",
            number: 1,
            type: {
              kind: "record",
              key: "common-address",
              recordType: "struct",
            },
          }],
        }],
      }],
    });
    const address = files.find((file) => file.path === "Admin/Address.php")?.code ?? "";

    expect(address).not.toContain("use App\\Skir\\Common\\Address");
    expect(address).toContain("public \\App\\Skir\\Common\\Address $billingAddress");
    expect(address).toContain(
      "Field::value('billing_address', 1, \\App\\Skir\\Common\\Address::skirType())",
    );
  });

  it("uses the first external basename and fully qualifies a later collision", () => {
    const commonAddress = {
      kind: "record" as const,
      key: "common-address",
      name: { text: "Address" },
      recordType: "struct" as const,
      fields: [],
    };
    const billingAddress = {
      kind: "record" as const,
      key: "billing-address",
      name: { text: "Address" },
      recordType: "struct" as const,
      fields: [],
    };
    const commonLocation = {
      kind: "record-location" as const,
      record: commonAddress,
      recordAncestors: [commonAddress],
      modulePath: "common/address.skir",
    };
    const billingLocation = {
      kind: "record-location" as const,
      record: billingAddress,
      recordAncestors: [billingAddress],
      modulePath: "billing/address.skir",
    };
    const files = generatePhpFiles({
      config: { namespace: "App\\Skir" },
      modules: [{
        path: "common/address.skir",
        records: [commonLocation],
      }, {
        path: "billing/address.skir",
        records: [billingLocation],
      }, {
        path: "admin/order.skir",
        records: [{
          kind: "record",
          name: { text: "Order" },
          recordType: "struct",
          fields: [{
            kind: "field",
            name: { text: "shipping_address" },
            number: 1,
            type: {
              kind: "record",
              key: "common-address",
              recordType: "struct",
              nameParts: [{ token: { text: "Address" } }],
            },
          }, {
            kind: "field",
            name: { text: "billing_address" },
            number: 2,
            type: {
              kind: "record",
              key: "billing-address",
              recordType: "struct",
              nameParts: [{ token: { text: "Address" } }],
            },
          }],
        }],
      }],
      recordMap: new Map([
        ["common-address", commonLocation],
        ["billing-address", billingLocation],
      ]),
    });
    const order = files.find((file) => file.path === "Admin/Order.php")?.code ?? "";

    expect(order).toContain("use App\\Skir\\Common\\Address;");
    expect(order).not.toContain("use App\\Skir\\Billing\\Address");
    expect(order).not.toContain("CommonAddress");
    expect(order).not.toContain("BillingAddress");
    expect(order).toContain("public Address $shippingAddress");
    expect(order).toContain("public \\App\\Skir\\Billing\\Address $billingAddress");
    expect(order).toContain(
      "Field::value('shipping_address', 1, Address::skirType())",
    );
    expect(order).toContain(
      "Field::value('billing_address', 2, \\App\\Skir\\Billing\\Address::skirType())",
    );
  });

  it("renders valid nullable unions across structs and RPC signatures", () => {
    const files = generateNullableTypeFiles();
    const values = files.find((file) => file.path === "Models/NullableValues.php")?.code ?? "";
    const client = files.find((file) => file.path === "Models/SkirRpcClient.php")?.code ?? "";
    const procedures = files.find((file) => file.path === "Models/SkirProcedures.php")?.code ?? "";
    const abstractProcedures = files.find((file) => file.path === "Models/AbstractSkirProcedures.php")?.code ?? "";
    const php = files.filter((file) => file.path.endsWith(".php"))
      .map((file) => file.code)
      .join("\n");

    expect(values).toContain("public int|string|null $optionalInt64");
    expect(values).toContain("public int|string|null $optionalHash64");
    expect(values).toContain("public mixed $optionalMixed");
    expect(values).toContain("public int|string|null $nestedOptionalInt64");
    expect(values).toContain("public ?string $optionalString");
    expect(values).toContain("public ?array $optionalStrings");
    expect(values).toContain("public ?Marker $optionalMarker");
    expect(client).toContain(
      "public function echoInt64(int|string|null $request): int|string|null",
    );
    expect(client).toContain("public function echoMixed(mixed $request): mixed");
    expect(client).toContain(
      "public function echoNested(int|string|null $request): int|string|null",
    );
    expect(procedures).toContain(
      "public function echoInt64(int|string|null $request, SkirContext $context): int|string|null;",
    );
    expect(procedures).toContain(
      "public function echoMixed(mixed $request, SkirContext $context): mixed;",
    );
    expect(procedures).toContain(
      "public function echoNested(int|string|null $request, SkirContext $context): int|string|null;",
    );
    expect(abstractProcedures).toContain(
      "abstract public function echoInt64(int|string|null $request, SkirContext $context): int|string|null;",
    );
    expect(abstractProcedures).toContain(
      "abstract public function echoMixed(mixed $request, SkirContext $context): mixed;",
    );
    expect(abstractProcedures).toContain(
      "abstract public function echoNested(int|string|null $request, SkirContext $context): int|string|null;",
    );
    expect(php).not.toMatch(/\?int\|string|\?mixed|\?\?|null\|null/u);
  });

  const phpProbe = spawnSync("php", ["-v"], { stdio: "ignore" });
  const phpUnavailable = phpProbe.error !== undefined
    && "code" in phpProbe.error
    && phpProbe.error.code === "ENOENT";
  const phpLintIt = phpUnavailable ? it.skip : it;

  phpLintIt("passes php -l for generated nullable type files when PHP is available", () => {
    const outputPath = mkdtempSync(join(tmpdir(), "skir-nullable-types-"));

    try {
      for (const file of generateNullableTypeFiles().filter((file) => file.path.endsWith(".php"))) {
        const filePath = join(outputPath, file.path);

        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, file.code);
        execFileSync("php", ["-l", filePath], { stdio: "pipe" });
      }
    } finally {
      rmSync(outputPath, { recursive: true, force: true });
    }
  });
});

function generateNullableTypeFiles() {
  const marker = {
    kind: "record" as const,
    key: "marker",
    name: { text: "Marker" },
    recordType: "struct" as const,
    fields: [],
  };
  const nullableValues = {
    kind: "record" as const,
    key: "nullable-values",
    name: { text: "NullableValues" },
    recordType: "struct" as const,
    fields: [{
      kind: "field" as const,
      name: { text: "optional_int64" },
      number: 1,
      type: { kind: "optional", other: { kind: "primitive", primitive: "int64" } },
    }, {
      kind: "field" as const,
      name: { text: "optional_hash64" },
      number: 2,
      type: { kind: "optional", other: { kind: "primitive", primitive: "hash64" } },
    }, {
      kind: "field" as const,
      name: { text: "optional_mixed" },
      number: 3,
      type: { kind: "optional", other: { kind: "primitive", primitive: "mixed" } },
    }, {
      kind: "field" as const,
      name: { text: "nested_optional_int64" },
      number: 4,
      type: {
        kind: "optional",
        other: {
          kind: "optional",
          other: { kind: "primitive", primitive: "int64" },
        },
      },
    }, {
      kind: "field" as const,
      name: { text: "optional_string" },
      number: 5,
      type: { kind: "optional", other: { kind: "primitive", primitive: "string" } },
    }, {
      kind: "field" as const,
      name: { text: "optional_strings" },
      number: 6,
      type: {
        kind: "optional",
        other: {
          kind: "array",
          item: { kind: "primitive", primitive: "string" },
        },
      },
    }, {
      kind: "field" as const,
      name: { text: "optional_marker" },
      number: 7,
      type: {
        kind: "optional",
        other: {
          kind: "record",
          key: "marker",
          recordType: "struct" as const,
          nameParts: [{ token: { text: "Marker" } }],
        },
      },
    }],
  };
  const markerLocation = {
    kind: "record-location" as const,
    record: marker,
    recordAncestors: [marker],
    modulePath: "models/types.skir",
  };
  const valuesLocation = {
    kind: "record-location" as const,
    record: nullableValues,
    recordAncestors: [nullableValues],
    modulePath: "models/types.skir",
  };
  const optionalInt64 = {
    kind: "optional",
    other: { kind: "primitive", primitive: "int64" },
  } as const;
  const optionalHash64 = {
    kind: "optional",
    other: { kind: "primitive", primitive: "hash64" },
  } as const;
  const optionalMixed = {
    kind: "optional",
    other: { kind: "primitive", primitive: "mixed" },
  } as const;
  const nestedOptionalInt64 = {
    kind: "optional",
    other: optionalInt64,
  } as const;
  const nestedOptionalHash64 = {
    kind: "optional",
    other: optionalHash64,
  } as const;
  const nestedOptionalMixed = {
    kind: "optional",
    other: optionalMixed,
  } as const;

  return generatePhpFiles({
    config: { namespace: "App\\Skir" },
    modules: [{
      path: "models/types.skir",
      records: [markerLocation, valuesLocation],
      methods: [{
        kind: "method",
        name: { text: "EchoInt64" },
        number: 1,
        requestType: optionalInt64,
        responseType: optionalHash64,
      }, {
        kind: "method",
        name: { text: "EchoMixed" },
        number: 2,
        requestType: optionalMixed,
        responseType: nestedOptionalMixed,
      }, {
        kind: "method",
        name: { text: "EchoNested" },
        number: 3,
        requestType: nestedOptionalInt64,
        responseType: nestedOptionalHash64,
      }],
    }],
    recordMap: new Map([
      ["marker", markerLocation],
      ["nullable-values", valuesLocation],
    ]),
  });
}
