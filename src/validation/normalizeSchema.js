const DROPPED_KEYWORDS = new Set(['discriminator', 'xml', 'externalDocs', 'example', 'nullable']);

/**
 * Convert an OAS schema into a plain JSON Schema tree.
 * - mode "request": readOnly properties are not required
 * - mode "response": writeOnly properties are not required
 * - mode "generate": `example` becomes `examples` for json-schema-faker
 * Cycles (from dereferenced $refs) are cut after `maxDepth` repetitions.
 */
export function normalizeSchema(schema, { mode = 'validate', maxDepth = 3 } = {}) {
  return walk(schema, { mode, maxDepth, stack: [] });
}

function walk(node, ctx) {
  if (Array.isArray(node)) return node.map((n) => walk(n, ctx));
  if (!node || typeof node !== 'object') return node;
  if (ctx.stack.filter((n) => n === node).length >= ctx.maxDepth) return {};
  ctx.stack.push(node);
  try {
    return transform(node, ctx);
  } finally {
    ctx.stack.pop();
  }
}

function transform(node, ctx) {
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED_KEYWORDS.has(key)) continue;
    out[key] = isLiteralKeyword(key) ? value : walk(value, ctx);
  }
  applyNullable(node, out);
  applyExclusiveBounds(out);
  applyRequiredFilter(node, out, ctx.mode);
  if (ctx.mode === 'generate' && 'example' in node && !out.examples) out.examples = [node.example];
  return out;
}

// Keywords whose values are data, not sub-schemas.
const isLiteralKeyword = (key) => ['enum', 'const', 'default', 'examples', 'required'].includes(key);

function applyNullable(node, out) {
  if (node.nullable !== true) return;
  if (typeof out.type === 'string') out.type = [out.type, 'null'];
  else if (Array.isArray(out.type) && !out.type.includes('null')) out.type = [...out.type, 'null'];
  if (Array.isArray(out.enum) && !out.enum.includes(null)) out.enum = [...out.enum, null];
}

// OAS 3.0 uses boolean exclusiveMinimum/Maximum; JSON Schema uses numbers.
function applyExclusiveBounds(out) {
  for (const [excl, bound] of [['exclusiveMinimum', 'minimum'], ['exclusiveMaximum', 'maximum']]) {
    if (typeof out[excl] !== 'boolean') continue;
    if (out[excl] && bound in out) {
      out[excl] = out[bound];
      delete out[bound];
    } else delete out[excl];
  }
}

function applyRequiredFilter(node, out, mode) {
  const flag = mode === 'request' ? 'readOnly' : mode === 'response' ? 'writeOnly' : null;
  if (!flag || !Array.isArray(out.required) || !node.properties) return;
  out.required = out.required.filter((name) => node.properties[name]?.[flag] !== true);
  if (out.required.length === 0) delete out.required;
}
