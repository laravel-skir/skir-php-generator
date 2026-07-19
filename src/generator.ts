import {
  generatePhp,
  PHP_FILE_HEADER,
  type CoreGeneratorInput,
  type GeneratedFile,
} from "@php-skir/generator-core";

import {
  GeneratorConfig,
  type GeneratorConfigInput,
} from "./config.js";
import { StandardPhpTarget } from "./target.js";

export { PHP_FILE_HEADER };

export type PhpGeneratorConfig = GeneratorConfigInput;

export interface PhpGeneratorInput extends CoreGeneratorInput {
  readonly config?: PhpGeneratorConfig;
}

export function generatePhpFiles(input: PhpGeneratorInput): GeneratedFile[] {
  const { namespace } = GeneratorConfig.parse(input.config ?? {});

  return generatePhp({
    ...input,
    namespace,
    adapter: new StandardPhpTarget(),
  });
}

export type {
  GeneratedFile,
  SkirField,
  SkirMethod,
  SkirModule,
  SkirRecord,
  SkirRecordLocation,
  SkirRecordNamePart,
  SkirToken,
  SkirType,
} from "@php-skir/generator-core";
