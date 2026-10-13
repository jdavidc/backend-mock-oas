/**
 * Validate a request against an operation.
 * @param {object} operation normalized operation from loadSpec
 * @param {{ pathParams, query, headers, cookies, body, hasBody }} request headers keyed lowercase
 * @param {Function} compile schema compiler from createSchemaCompiler
 * @returns {{ ok: true } | { ok: false, status: number, details: object[] }}
 */
export function validateRequest(operation, request, compile) {
  const details = validateParameters(operation.parameters ?? [], request, compile);
  const body = validateBody(operation.requestBody, request, compile);
  if (body.status === 415) return { ok: false, status: 415, details: body.details };
  details.push(...body.details);
  return details.length ? { ok: false, status: 400, details } : { ok: true };
}

const parameterSources = {
  path: (r) => r.pathParams ?? {},
  query: (r) => r.query ?? {},
  header: (r) => r.headers ?? {},
  cookie: (r) => r.cookies ?? {},
};

function validateParameters(parameters, request, compile) {
  const details = [];
  for (const param of parameters) {
    const source = parameterSources[param.in]?.(request);
    if (!source) continue;
    const key = param.in === 'header' ? param.name.toLowerCase() : param.name;
    const raw = source[key];
    if (raw === undefined || raw === '') {
      if (param.required) details.push({ in: param.in, name: param.name, message: `${param.in} parameter "${param.name}" is required` });
      continue;
    }
    if (!param.schema) continue;
    const validate = compile(param.schema, { mode: 'request' });
    const value = coerce(raw, param.schema);
    if (!validate(value)) details.push(...toDetails(validate.errors, { in: param.in, name: param.name }));
  }
  return details;
}

const typeOf = (schema) => (Array.isArray(schema?.type) ? schema.type.find((t) => t !== 'null') : schema?.type);

/** Coerce string input (from URL/headers) into the type the schema expects. */
export function coerce(raw, schema) {
  if (typeOf(schema) === 'array') {
    const list = Array.isArray(raw) ? raw : String(raw).split(',');
    return list.map((item) => coerceScalar(item, schema.items));
  }
  return coerceScalar(Array.isArray(raw) ? raw[raw.length - 1] : raw, schema);
}

function coerceScalar(value, schema) {
  if (typeof value !== 'string') return value;
  const type = typeOf(schema);
  if ((type === 'integer' || type === 'number') && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  if (type === 'boolean' && (value === 'true' || value === 'false')) return value === 'true';
  if (type === 'null' && value === 'null') return null;
  return value;
}

function validateBody(requestBody, request, compile) {
  if (!requestBody) return { details: [] };
  if (!request.hasBody) {
    return requestBody.required
      ? { details: [{ in: 'body', message: 'Request body is required' }] }
      : { details: [] };
  }
  const contentType = request.headers?.['content-type'] ?? '';
  const declared = Object.keys(requestBody.content ?? {});
  const mediaKey = matchMediaType(contentType, declared);
  if (!mediaKey) {
    const message = `Unsupported Content-Type "${contentType || '(none)'}"; expected one of: ${declared.join(', ')}`;
    return { status: 415, details: [{ in: 'header', name: 'Content-Type', message }] };
  }
  const schema = requestBody.content[mediaKey]?.schema;
  if (!schema || !isJsonType(contentType)) return { details: [] };
  const validate = compile(schema, { mode: 'request' });
  return { details: validate(request.body) ? [] : toDetails(validate.errors, { in: 'body' }) };
}

const essence = (type) => String(type).split(';')[0].trim().toLowerCase();

export const isJsonType = (type) => /^application\/(.+\+)?json$/.test(essence(type)) || /\+json$/.test(essence(type));

/** Return the declared media type key matching `actual`, or null. */
export function matchMediaType(actual, declared) {
  const type = essence(actual);
  if (!type) return null;
  const [main] = type.split('/');
  const candidates = [
    (d) => essence(d) === type,
    (d) => isJsonType(type) && essence(d) === 'application/json',
    (d) => essence(d) === `${main}/*`,
    (d) => essence(d) === '*/*',
  ];
  for (const test of candidates) {
    const found = declared.find(test);
    if (found) return found;
  }
  return null;
}

function toDetails(errors = [], base) {
  return errors.map((err) => ({
    ...base,
    ...(base.in === 'body' ? { path: err.instancePath || '/' } : {}),
    message: `${err.instancePath ? `${err.instancePath} ` : ''}${err.message}`,
  }));
}
