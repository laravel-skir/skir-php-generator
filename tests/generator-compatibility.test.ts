import { describe, expect, it } from "vitest";

import { generatePhpFiles } from "../src/generator.js";
import { fullGeneratorInput } from "./fixtures/full-generator-input.js";

describe("standard PHP compatibility", () => {
  it("keeps every generated file byte-for-byte stable", () => {
    expect(generatePhpFiles(fullGeneratorInput)).toMatchSnapshot();
  });
});
