import {
  DEFAULT_NAMESPACE,
  PhpNamespace,
} from "@php-skir/generator-core";
import { z } from "zod";

export const GENERATOR_MODULE = "skir-php-generator";
export { DEFAULT_NAMESPACE, PhpNamespace };

export const GeneratorConfig = z.strictObject({
  namespace: PhpNamespace.default(DEFAULT_NAMESPACE),
});

export type GeneratorConfig = z.infer<typeof GeneratorConfig>;
export type GeneratorConfigInput = z.input<typeof GeneratorConfig>;
