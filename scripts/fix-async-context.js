const fs = require('fs');
const path = require('path');

const __project = path.resolve(__dirname, '..');

// bob publishes from this directory, and rewrites exports paths relative to it.
const DIST_DIR = 'dist';

console.log('Fixing async context imports in dist package.json...');

const distPkg = JSON.parse(
  fs.readFileSync(
    path.join(__project, 'packages', 'graphql-modules', 'dist', 'package.json'),
    'utf8'
  )
);

const srcPkg = JSON.parse(
  fs.readFileSync(
    path.join(__project, 'packages', 'graphql-modules', 'package.json'),
    'utf8'
  )
);

// update package json in dist folder (because bob removes the "imports" field)
if (!srcPkg.imports) {
  throw new Error(
    'Source package.json does not have "imports" subpath definitions'
  );
}

const { node, default: browser } = srcPkg.imports['#async-context'];
if (!node || !browser) {
  throw new Error(
    'Source package.json does not have proper "#async-context" subpath definitions'
  );
}

for (const file of [node, browser]) {
  const src = path.join(__project, 'packages', 'graphql-modules', 'src', file);
  const dest = path.join(
    __project,
    'packages',
    'graphql-modules',
    'dist',
    file
  );
  console.log(`Copying ${src} to ${dest}...`);
  fs.copyFileSync(src, dest);
}

console.log('Updating imports field in dist package.json...');
distPkg.imports = srcPkg.imports;

// Restore the "types" conditions as well. bob's rewriteExports rebuilds every
// entry as { require, import } only, so any "types" condition in the source
// exports map is dropped on the way to dist -- even though package.json has
// declared it for years. Without it, a consumer on moduleResolution
// bundler/node16/nodenext cannot see the declarations at all: only the legacy
// node10 resolver can, via "typings". That is the cause of #2480 and #2686.
console.log('Restoring types conditions in dist package.json exports...');
for (const [subpath, srcCondition] of Object.entries(srcPkg.exports || {})) {
  if (
    !srcCondition ||
    typeof srcCondition !== 'object' ||
    !srcCondition.types
  ) {
    continue;
  }

  const distCondition = distPkg.exports && distPkg.exports[subpath];
  if (!distCondition || typeof distCondition !== 'object') {
    continue;
  }

  // "types" first: that is the documented order, and it keeps the condition
  // ahead of the runtime ones for any resolver that short-circuits.
  distPkg.exports[subpath] = {
    types: srcCondition.types.replace(`${DIST_DIR}/`, ''),
    ...distCondition,
  };
}
fs.writeFileSync(
  path.join(__project, 'packages', 'graphql-modules', 'dist', 'package.json'),
  JSON.stringify(distPkg, null, 2) + '\n'
);

console.log('OK');
