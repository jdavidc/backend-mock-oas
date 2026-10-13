import express from 'express';
import { createRouter } from '../routing/pathMatcher.js';
import { createSchemaCompiler } from '../validation/schemaCompiler.js';
import { validateRequest, isJsonType } from '../validation/validateRequest.js';
import { selectResponse } from '../responses/selectResponse.js';

/**
 * Build an Express app serving the operations of a loaded spec.
 * @param {{ operations: object[], basePath: string }} spec result of loadSpec
 */
export function createServer({ operations, basePath }, { validateRequests = true, cors = true, logger = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (logger) app.use(requestLogger);
  if (cors) app.use(corsMiddleware);
  app.use(express.json({ type: (req) => isJsonType(req.headers['content-type'] ?? '') }));
  app.use(express.text({ type: 'text/*' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.raw({ type: () => true }));
  app.use(createMockHandler({ router: createRouter(operations), basePath, validateRequests }));
  app.use(errorHandler);
  return app;
}

function createMockHandler({ router, basePath, validateRequests }) {
  const compile = createSchemaCompiler();
  return (req, res) => {
    const path = stripBasePath(req.path, basePath);
    const match = path === null ? null : routeRequest(router, req.method, path);
    if (!match) return res.status(404).json({ error: 'NotFound', message: `No operation for ${req.method} ${req.path}` });
    if (match.allowedMethods) {
      return res.status(405).set('Allow', match.allowedMethods.join(', '))
        .json({ error: 'MethodNotAllowed', message: `${req.method} not allowed for ${req.path}` });
    }
    if (validateRequests) {
      const result = validateRequest(match.operation, toValidationInput(req, match.pathParams), compile);
      if (!result.ok) return res.status(result.status).json({ error: 'RequestValidationError', details: result.details });
    }
    sendMockResponse(res, selectResponse(match.operation, { prefer: req.get('prefer'), accept: req.get('accept') }));
  };
}

function routeRequest(router, method, path) {
  const match = router.match(method, path);
  if (method === 'HEAD' && match?.allowedMethods?.includes('GET')) return router.match('GET', path);
  return match;
}

function stripBasePath(path, basePath) {
  if (!basePath) return path;
  if (path === basePath) return '/';
  return path.startsWith(`${basePath}/`) ? path.slice(basePath.length) : null;
}

function toValidationInput(req, pathParams) {
  return {
    pathParams,
    query: req.query,
    headers: req.headers,
    cookies: parseCookies(req.headers.cookie),
    body: req.body,
    hasBody: hasBody(req),
  };
}

const hasBody = (req) => Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined;

function parseCookies(header = '') {
  const cookies = {};
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx > 0) cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return cookies;
}

function sendMockResponse(res, { status, mediaType, body, headers }) {
  res.status(status).set(headers);
  if (!mediaType || body === undefined || status === 204 || status === 304) return res.end();
  res.type(mediaType);
  if (isJsonType(mediaType)) return res.send(JSON.stringify(body));
  res.send(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function corsMiddleware(req, res, next) {
  res.set('Access-Control-Allow-Origin', req.get('origin') ?? '*');
  res.set('Vary', 'Origin');
  res.set('Access-Control-Expose-Headers', '*');
  if (req.method === 'OPTIONS' && req.get('access-control-request-method')) {
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
    res.set('Access-Control-Allow-Headers', req.get('access-control-request-headers') ?? '*');
    res.set('Access-Control-Max-Age', '600');
    return res.status(204).end();
  }
  next();
}

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms.toFixed(1)}ms)`);
  });
  next();
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'RequestValidationError', details: [{ in: 'body', message: `Malformed body: ${err.message}` }] });
  }
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ error: status >= 500 ? 'InternalServerError' : 'BadRequest', message: err.message });
}
