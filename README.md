# oas-mock

A mock HTTP backend driven by an OpenAPI 3.x document (YAML or JSON). Every operation in the
spec is exposed over HTTP, incoming requests are validated against the spec, and responses are
built from the examples (or schemas) declared in it.

## Install

```bash
npm install
npm test
```

Requires Node.js 20+.

## CLI

```bash
oas-mock <spec> [--port 3000] [--host 0.0.0.0] [--no-validate-request] [--no-cors]
# or
npm start -- test/fixtures/petstore.yaml --port 4000
```

## Programmatic API

```js
import { createMockServer, loadSpec } from './src/index.js';

const app = await createMockServer({
  spec: './openapi.yaml',  // path, URL or an in-memory object (it is cloned, never mutated)
  validateRequests: true,
  cors: true,
  logger: true,            // logs "METHOD path → status (ms)"
});
app.listen(3000);
```

`createMockServer` returns an Express 5 app. `loadSpec(spec)` returns
`{ document, basePath, operations }`.

## Routing

- The base path is taken from `servers[0].url` (e.g. `https://api.x.com/v1` → `/v1`; server
  variables are replaced by their defaults). Requests outside the base path return 404.
- Static paths win over templated ones (`/pets/mine` before `/pets/{petId}`).
- Unknown path → `404 { "error": "NotFound", "message" }`.
- Known path, undeclared method → `405` with an `Allow` header.
- `HEAD` falls back to the `GET` operation when not declared.

## Response selection

- **Status**: `Prefer: code=XXX` if that code (or its `4XX`-style range) is declared; otherwise the
  lowest declared 2xx (`2XX` → 200); otherwise `default` (sent as 200); otherwise the first code.
- **Media type**: the first declared type acceptable by `Accept` (q-values and wildcards
  supported), otherwise the first declared one. No `content` → empty body.
- **Body**: `Prefer: example=<name>` → media `example` → first of media `examples` → schema
  `example` → generated from the schema with json-schema-faker.
- **Headers**: declared response headers get their `example`, first `examples`, schema
  `example`/`default`, or a generated value.

`Prefer` values can be combined: `Prefer: code=404, example=notFound`.

## Validation

Path, query, header and cookie parameters are checked (required, coerced from strings to
integer/number/boolean, arrays from repeated keys or comma-separated values) and validated with
Ajv. Header names are case-insensitive.

Request bodies: a missing required body is a 400; an undeclared `Content-Type` is a 415 (media
type parameters are ignored, `application/*`, `*/*` and `+json` types are supported). JSON bodies
are validated against the schema; `readOnly` properties are not required in requests. Malformed
JSON is a 400.

Error format:

```json
{
  "error": "RequestValidationError",
  "details": [{ "in": "body", "path": "/", "message": "must have required property 'name'" }]
}
```

`in` is one of `path`, `query`, `header`, `cookie`, `body`; parameter errors carry `name`, body
errors carry `path`.

## Limitations

- Only OpenAPI 3.x; Swagger 2.0 is rejected.
- Only `servers[0]` is used for the base path.
- Parameter styles other than `form`/`simple` (e.g. `deepObject`, `matrix`, `label`) and
  `content`-based parameters are not deserialized.
- Only JSON bodies are schema-validated; form, text and binary bodies only get Content-Type checks.
- OAS 3.1 schemas are compiled with Ajv's default draft (strict mode off): unknown 2020-12
  keywords such as `prefixItems` are ignored.
- Recursive schemas are truncated after a few levels (validation accepts anything below that
  depth; generated data stops there).
- `externalValue` examples and callbacks/webhooks are ignored.
- Uses `json-schema-faker@0.5.9`: 0.6.x changed its API and ignores the example options.
