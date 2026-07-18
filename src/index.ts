import { type CodeGenerator } from "skir-internal";

import { GeneratorConfig, GENERATOR_MODULE } from "./config.js";
import { generatePhpFiles } from "./generator.js";

class PhpGenerator implements CodeGenerator<GeneratorConfig> {
  readonly id = GENERATOR_MODULE;
  readonly configType: CodeGenerator<GeneratorConfig>["configType"] = GeneratorConfig;

  generateCode(input: CodeGenerator.Input<GeneratorConfig>): CodeGenerator.Output {
    return {
      files: generatePhpFiles(input),
    };
  }
}

export const GENERATOR = new PhpGenerator();

export { generatePhpFiles };
export { StandardPhpTarget } from "./target.js";
export default GENERATOR;
