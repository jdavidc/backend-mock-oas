import jsf from 'json-schema-faker';
import { normalizeSchema } from '../validation/normalizeSchema.js';

jsf.option({
  alwaysFakeOptionals: true,
  useExamplesValue: true,
  useDefaultValue: true,
  failOnInvalidTypes: false,
  failOnInvalidFormat: false,
  maxItems: 3,
  maxLength: 20,
});

/** Generate a fake value for a schema; recursion is cut by normalizeSchema. */
export function generateFromSchema(schema) {
  if (!schema || typeof schema !== 'object') return undefined;
  return jsf.generate(normalizeSchema(schema, { mode: 'generate', maxDepth: 2 }));
}
