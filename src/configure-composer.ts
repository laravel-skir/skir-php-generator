import {
  configureComposer as configureCoreComposer,
  type ComposerPsr4MappingResult,
} from "@php-skir/generator-core";

import { GeneratorConfig, GENERATOR_MODULE } from "./config.js";

export interface ConfigureComposerOptions {
  readonly mod?: string;
  readonly root?: string;
}

export function configureComposer(
  options: ConfigureComposerOptions = {},
): Promise<ComposerPsr4MappingResult> {
  return configureCoreComposer({
    module: options.mod ?? GENERATOR_MODULE,
    ...(options.root === undefined ? {} : { root: options.root }),
    parseConfig: (value) => GeneratorConfig.parse(value),
    namespace: (config) => config.namespace,
  });
}
