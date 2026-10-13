const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compile an OAS path template such as "/pets/{id}" into a regex. */
export function compilePath(template) {
  const paramNames = [];
  const source = template
    .split(/(\{[^}]+\})/)
    .map((part) => {
      const m = /^\{([^}]+)\}$/.exec(part);
      if (!m) return escapeRegex(part);
      paramNames.push(m[1]);
      return '([^/]+)';
    })
    .join('');
  return { regex: new RegExp(`^${source}/?$`), paramNames };
}

const staticLength = (template) => template.replace(/\{[^}]+\}/g, '').length;

/** Build a router; more specific (more static characters) paths are tried first. */
export function createRouter(operations) {
  const routes = new Map();
  for (const op of operations) {
    if (!routes.has(op.path)) routes.set(op.path, { ...compilePath(op.path), path: op.path, methods: {} });
    routes.get(op.path).methods[op.method] = op;
  }
  const ordered = [...routes.values()].sort((a, b) => staticLength(b.path) - staticLength(a.path));

  function match(method, path) {
    for (const route of ordered) {
      const m = route.regex.exec(path);
      if (!m) continue;
      const operation = route.methods[method.toLowerCase()];
      if (!operation) return { allowedMethods: Object.keys(route.methods).map((x) => x.toUpperCase()) };
      return { operation, pathParams: extractParams(route.paramNames, m) };
    }
    return null;
  }

  return { match };
}

function extractParams(names, match) {
  const params = {};
  names.forEach((name, i) => {
    try {
      params[name] = decodeURIComponent(match[i + 1]);
    } catch {
      params[name] = match[i + 1];
    }
  });
  return params;
}
