import { describe, expect, it } from "vitest";

import {
  ComposerAutoloadConflictError,
  ensureComposerPsr4Mapping,
} from "../src/composer-autoload.js";

describe("ensureComposerPsr4Mapping", () => {
  it("adds a normalized PSR-4 mapping without reformatting unrelated content", () => {
    const source = `{
  "name": "example/project",
  "autoload": {
    "classmap": ["src/Legacy"]
  },
  "require": {}
}
`;

    const result = ensureComposerPsr4Mapping(source, "Skir", "./generated\\php\\skirout");

    expect(result.changed).toBe(true);
    expect(result.namespace).toBe("Skir\\");
    expect(result.paths).toBe("generated/php/skirout/");
    expect(JSON.parse(result.source).autoload).toEqual({
      classmap: ["src/Legacy"],
      "psr-4": {
        "Skir\\": "generated/php/skirout/",
      },
    });
    expect(result.source.indexOf('"name"')).toBeLessThan(result.source.indexOf('"autoload"'));
    expect(result.source.indexOf('"autoload"')).toBeLessThan(result.source.indexOf('"require"'));
  });

  it("leaves an equivalent normalized mapping unchanged", () => {
    const source = `{
  "autoload": {
    "psr-4": {
      "Skir\\\\": "generated/php/skirout/"
    }
  }
}
`;

    const result = ensureComposerPsr4Mapping(source, "Skir", "./generated\\php\\skirout");

    expect(result).toEqual({
      changed: false,
      namespace: "Skir\\",
      paths: "generated/php/skirout/",
      source,
    });
  });

  it("preserves ordered output directories", () => {
    const result = ensureComposerPsr4Mapping(
      "{}\n",
      "Skir",
      ["./generated\\primary", "generated/fallback/"],
    );

    expect(result.paths).toEqual([
      "generated/primary/",
      "generated/fallback/",
    ]);
    expect(JSON.parse(result.source).autoload["psr-4"]["Skir\\"]).toEqual([
      "generated/primary/",
      "generated/fallback/",
    ]);
  });

  it("preserves an unrelated empty fallback prefix", () => {
    const source = '{"autoload":{"psr-4":{"":"src/"}}}\n';

    const result = ensureComposerPsr4Mapping(source, "Skir", "generated/skirout");

    expect(JSON.parse(result.source).autoload["psr-4"]).toEqual({
      "": "src/",
      "Skir\\": "generated/skirout/",
    });
  });

  it.each([
    "Skir",
    "Skir/",
    " Skir\\",
    "Skir\\ ",
    "Skir\\\\",
  ])("rejects malformed near-match Composer prefix %j", (prefix) => {
    const source = `${JSON.stringify({
      autoload: {
        "psr-4": {
          [prefix]: "generated/skirout/",
        },
      },
    }, null, 2)}\n`;

    expect(() => ensureComposerPsr4Mapping(source, "Skir", "generated/skirout"))
      .toThrow(/malformed Composer PSR-4 prefix/i);
  });

  it("preserves whitespace in Composer paths", () => {
    const source = '{"autoload":{"psr-4":{"Skir\\\\":" generated/skirout /"}}}\n';

    const result = ensureComposerPsr4Mapping(source, "Skir", " generated\\skirout ");

    expect(result).toEqual({
      changed: false,
      namespace: "Skir\\",
      paths: " generated/skirout /",
      source,
    });
  });

  it("throws a conflict error for an existing different mapping", () => {
    const source = '{"autoload":{"psr-4":{"Skir\\\\":"src/"}}}\n';

    expect(() => ensureComposerPsr4Mapping(source, "Skir", "generated/skirout"))
      .toThrow(ComposerAutoloadConflictError);

    try {
      ensureComposerPsr4Mapping(source, "Skir", "generated/skirout");
    } catch (error) {
      expect(error).toMatchObject({
        namespace: "Skir\\",
        existingPaths: "src/",
        requestedPaths: "generated/skirout/",
      });
    }
  });

  it("rejects invalid JSON and non-object Composer sections", () => {
    expect(() => ensureComposerPsr4Mapping("{", "Skir", "generated/skirout"))
      .toThrow(/invalid composer\.json/i);
    expect(() => ensureComposerPsr4Mapping('{"autoload":[]}\n', "Skir", "generated/skirout"))
      .toThrow(/autoload.*object/i);
    expect(() => ensureComposerPsr4Mapping('{"autoload":{"psr-4":[]}}\n', "Skir", "generated/skirout"))
      .toThrow(/psr-4.*object/i);
  });
});
