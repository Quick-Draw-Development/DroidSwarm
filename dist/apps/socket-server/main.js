const Module = require("module");
const path = require("path");
const fs = require("fs");
const originalResolveFilename = Module._resolveFilename;
const distPath = __dirname;
const manifest = [{ "module": "@protocol-alias/*", "pattern": "packages/protocol-alias/src/*" }, { "module": "@protocol/*", "pattern": "packages/protocol/src/*" }, { "module": "@protocol", "pattern": "packages/protocol/src" }, { "module": "@protocol-alias", "pattern": "packages/protocol-alias/src" }, { "module": "bootstrap", "exactMatch": "packages/bootstrap/src/index.js", "pattern": "packages/bootstrap/src/index.ts" }, { "module": "@shared-types", "exactMatch": "packages/shared-types/src/index.js", "pattern": "packages/shared-types/src/index.ts" }, { "module": "@shared-workers", "exactMatch": "packages/shared-workers/src/index.js", "pattern": "packages/shared-workers/src/index.ts" }, { "module": "@shared-routing", "exactMatch": "packages/shared-routing/src/index.js", "pattern": "packages/shared-routing/src/index.ts" }, { "module": "@shared-git", "exactMatch": "packages/shared-git/src/index.js", "pattern": "packages/shared-git/src/index.ts" }, { "module": "@shared-memory", "exactMatch": "packages/shared-memory/src/index.js", "pattern": "packages/shared-memory/src/index.ts" }, { "module": "@shared-projects", "exactMatch": "packages/shared-projects/src/index.js", "pattern": "packages/shared-projects/src/index.ts" }, { "module": "@shared-chat", "exactMatch": "packages/shared-chat/src/index.js", "pattern": "packages/shared-chat/src/index.ts" }, { "module": "@shared-skills", "exactMatch": "packages/shared-skills/src/index.js", "pattern": "packages/shared-skills/src/index.ts" }, { "module": "@shared-config", "exactMatch": "packages/shared-config/src/index.js", "pattern": "packages/shared-config/src/index.ts" }, { "module": "@shared-persistence", "exactMatch": "packages/shared-persistence/src/index.js", "pattern": "packages/shared-persistence/src/index.ts" }, { "module": "@shared-tracing", "exactMatch": "packages/shared-tracing/src/index.js", "pattern": "packages/shared-tracing/src/index.ts" }, { "module": "@shared-mux", "exactMatch": "packages/shared-mux/src/index.js", "pattern": "packages/shared-mux/src/index.ts" }, { "module": "@shared-llm", "exactMatch": "packages/shared-llm/src/index.js", "pattern": "packages/shared-llm/src/index.ts" }, { "module": "@shared-codex", "exactMatch": "packages/shared-codex/src/index.js", "pattern": "packages/shared-codex/src/index.ts" }, { "module": "@shared-blink", "exactMatch": "packages/shared-blink/src/index.js", "pattern": "packages/shared-blink/src/index.ts" }];
Module._resolveFilename = function(request, parent) {
  let found;
  for (const entry of manifest) {
    if (request === entry.module && entry.exactMatch) {
      const entry2 = manifest.find((x) => request === x.module || request.startsWith(x.module + "/"));
      const candidate = path.join(distPath, entry2.exactMatch);
      if (isFile(candidate)) {
        found = candidate;
        break;
      }
    } else {
      const re = new RegExp(entry.module.replace(/\*$/, "(?<rest>.*)"));
      const match = request.match(re);
      if (match?.groups) {
        const candidate = path.join(distPath, entry.pattern.replace("*", ""), match.groups.rest);
        if (isFile(candidate)) {
          found = candidate;
        }
      }
    }
  }
  if (found) {
    const modifiedArguments = [found, ...[].slice.call(arguments, 1)];
    return originalResolveFilename.apply(this, modifiedArguments);
  } else {
    return originalResolveFilename.apply(this, arguments);
  }
};
function isFile(s) {
  try {
    require.resolve(s);
    return true;
  } catch (_e) {
    return false;
  }
}
module.exports = require("./apps/socket-server/src/main.js");
