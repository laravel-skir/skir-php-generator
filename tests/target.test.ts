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
});
