import SwaggerParser from '@apidevtools/swagger-parser';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/**
 * Validate and dereference an OpenAPI 3.x document (file path, URL or object).
 * Returns the dereferenced document, its base path and a flat operations list.
 */
export async function loadSpec(source) {
  const input = typeof source === 'string' ? source : structuredClone(source);
  assertOpenApi3(typeof input === 'string' ? await SwaggerParser.parse(input) : input);
  const document = await SwaggerParser.validate(input);
  return {
    document,
    basePath: resolveBasePath(document.servers),
    operations: collectOperations(document.paths ?? {}),
  };
}

function assertOpenApi3(doc) {
  if (doc?.swagger) throw new Error('Swagger 2.0 is not supported; only OpenAPI 3.x documents are accepted');
  if (!/^3\./.test(String(doc?.openapi ?? ''))) throw new Error('Not an OpenAPI 3.x document (missing "openapi: 3.x" field)');
}

function resolveBasePath(servers) {
  const server = servers?.[0];
  if (!server?.url) return '';
  const url = server.url.replace(/\{([^}]+)\}/g, (_, name) => server.variables?.[name]?.default ?? '');
  const pathname = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? new URL(url).pathname : url;
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' || trimmed === '/' ? '' : trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function collectOperations(paths) {
  const operations = [];
  for (const [path, item] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const op = item?.[method];
      if (!op) continue;
      operations.push({
        method,
        path,
        operationId: op.operationId,
        parameters: mergeParameters(item.parameters, op.parameters),
        requestBody: op.requestBody,
        responses: op.responses ?? {},
      });
    }
  }
  return operations;
}

// Operation-level parameters override path-level ones with the same name+location.
function mergeParameters(pathParams = [], opParams = []) {
  const byKey = new Map();
  for (const p of [...pathParams, ...opParams]) byKey.set(`${p.in}:${p.name}`, p);
  return [...byKey.values()];
}
