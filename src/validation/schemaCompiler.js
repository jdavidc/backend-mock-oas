import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { normalizeSchema } from './normalizeSchema.js';

/**
 * Create a compile(schema, { mode }) function backed by one Ajv instance.
 * Validators are cached per (schema object, mode).
 */
export function createSchemaCompiler() {
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  addFormats(ajv);
  const cache = new WeakMap();

  return function compile(schema, { mode = 'validate' } = {}) {
    if (!cache.has(schema)) cache.set(schema, new Map());
    const byMode = cache.get(schema);
    if (!byMode.has(mode)) byMode.set(mode, ajv.compile(normalizeSchema(schema, { mode })));
    return byMode.get(mode);
  };
}
