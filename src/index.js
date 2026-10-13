import { loadSpec } from './spec/loadSpec.js';
import { createServer } from './server/createServer.js';

export { loadSpec };

/**
 * Create an Express app that mocks every operation in an OpenAPI 3.x spec.
 * @param {{ spec: string|object, validateRequests?: boolean, cors?: boolean, logger?: boolean }} options
 */
export async function createMockServer({ spec, validateRequests = true, cors = true, logger = true }) {
  const loaded = await loadSpec(spec);
  return createServer(loaded, { validateRequests, cors, logger });
}
