import { z } from "zod";

export const GENERATOR_MODULE = "skir-php-generator";
export const DEFAULT_NAMESPACE = "Skir";

export const PhpNamespace = z.string().regex(
  /^[A-Za-z_][A-Za-z0-9_]*(?:\\[A-Za-z_][A-Za-z0-9_]*)*$/u,
  "Namespace must be a canonical PHP namespace using ASCII identifier segments separated by single backslashes.",
);

export const GeneratorConfig = z.strictObject({
  namespace: PhpNamespace.default(DEFAULT_NAMESPACE),
});

export type GeneratorConfig = z.infer<typeof GeneratorConfig>;
export type GeneratorConfigInput = z.input<typeof GeneratorConfig>;
