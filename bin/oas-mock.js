#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createMockServer } from '../src/index.js';

const USAGE = `Usage: oas-mock <spec> [options]

Options:
  --port <n>               Port to listen on (default 3000)
  --host <host>            Host to bind (default 0.0.0.0)
  --no-validate-request    Disable request validation
  --no-cors                Disable CORS headers
  -h, --help               Show this help`;

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      port: { type: 'string', default: '3000' },
      host: { type: 'string', default: '0.0.0.0' },
      'validate-request': { type: 'boolean', default: true },
      cors: { type: 'boolean', default: true },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  return { ...values, spec: positionals[0] };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  let options;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (err) {
    fail(`${err.message}\n\n${USAGE}`);
  }
  if (options.help) return console.log(USAGE);
  if (!options.spec) fail(`Missing <spec> argument.\n\n${USAGE}`);

  let app;
  try {
    app = await createMockServer({ spec: options.spec, validateRequests: options['validate-request'], cors: options.cors });
  } catch (err) {
    fail(`Failed to load spec: ${err.message}`);
  }
  const server = app.listen(Number(options.port), options.host, () => {
    console.log(`Mock server for ${options.spec} listening on http://${options.host}:${server.address().port}`);
  });
  server.on('error', (err) => fail(err.message));
}

main();
