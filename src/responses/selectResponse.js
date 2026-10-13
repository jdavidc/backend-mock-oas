import { generateFromSchema } from './generateFromSchema.js';

/** Parse a Prism-style Prefer header: "code=404, example=notFound". */
export function parsePrefer(header) {
  const prefs = {};
  for (const part of String(header ?? '').split(/[,;]/)) {
    const [key, ...rest] = part.split('=');
    if (key?.trim() && rest.length) prefs[key.trim().toLowerCase()] = rest.join('=').trim().replace(/^"|"$/g, '');
  }
  return prefs;
}

/**
 * Choose status, media type, body and headers for an operation.
 * @param {object} operation normalized operation
 * @param {{ prefer?: string, accept?: string }} request
 */
export function selectResponse(operation, { prefer, accept } = {}) {
  const prefs = parsePrefer(prefer);
  const { status, response } = selectStatus(operation.responses ?? {}, prefs.code);
  const mediaType = selectMediaType(Object.keys(response?.content ?? {}), accept);
  const media = mediaType ? response.content[mediaType] : undefined;
  return {
    status,
    mediaType,
    body: media ? selectBody(media, prefs.example) : undefined,
    headers: buildHeaders(response?.headers ?? {}),
  };
}

const rangeKey = (code) => `${String(code)[0]}XX`;

function selectStatus(responses, preferredCode) {
  if (preferredCode) {
    const key = [preferredCode, rangeKey(preferredCode)].find((k) => findKey(responses, k));
    if (key) return { status: Number(preferredCode), response: responses[findKey(responses, key)] };
  }
  const keys = Object.keys(responses);
  const success = keys
    .filter((k) => /^2(\d\d|XX)$/i.test(k))
    .map((k) => ({ key: k, status: /XX$/i.test(k) ? 200 : Number(k) }))
    .sort((a, b) => a.status - b.status)[0];
  if (success) return { status: success.status, response: responses[success.key] };
  if (responses.default) return { status: 200, response: responses.default };
  const first = keys.find((k) => /^\d/.test(k));
  return first ? { status: /XX$/i.test(first) ? Number(first[0]) * 100 : Number(first), response: responses[first] } : { status: 200 };
}

const findKey = (responses, key) => Object.keys(responses).find((k) => k.toUpperCase() === String(key).toUpperCase());

/** Pick the first declared media type acceptable per Accept (highest q first). */
function selectMediaType(declared, accept) {
  if (!declared.length) return undefined;
  for (const range of parseAccept(accept)) {
    const found = declared.find((d) => mediaMatches(range, d.split(';')[0].trim().toLowerCase()));
    if (found) return found;
  }
  return declared[0];
}

function parseAccept(accept) {
  if (!accept) return [];
  return accept
    .split(',')
    .map((part) => {
      const [type, ...params] = part.trim().toLowerCase().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return { type: type.trim(), q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((r) => r.type && r.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((r) => r.type);
}

function mediaMatches(range, type) {
  if (range === '*/*' || range === type) return true;
  return range.endsWith('/*') && type.startsWith(range.slice(0, -1));
}

function selectBody(media, exampleName) {
  const named = exampleName && media.examples?.[exampleName];
  if (named && 'value' in named) return named.value;
  if (media.example !== undefined) return media.example;
  const firstExample = Object.values(media.examples ?? {}).find((e) => e && 'value' in e);
  if (firstExample) return firstExample.value;
  if (media.schema?.example !== undefined) return media.schema.example;
  return generateFromSchema(media.schema);
}

function buildHeaders(headers) {
  const out = {};
  for (const [name, header] of Object.entries(headers)) {
    if (name.toLowerCase() === 'content-type') continue;
    const value = headerValue(header);
    if (value !== undefined) out[name] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

function headerValue(header) {
  if (header.example !== undefined) return header.example;
  const firstExample = Object.values(header.examples ?? {}).find((e) => e && 'value' in e);
  if (firstExample) return firstExample.value;
  if (header.schema?.example !== undefined) return header.schema.example;
  if (header.schema?.default !== undefined) return header.schema.default;
  return generateFromSchema(header.schema);
}
