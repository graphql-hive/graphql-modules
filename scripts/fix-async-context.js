const fs = require('fs');
const path = require('path');

const __project = path.resolve(__dirname, '..');

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
fs.writeFileSync(
  path.join(__project, 'packages', 'graphql-modules', 'dist', 'package.json'),
  JSON.stringify(distPkg, null, 2) + '\n'
);

console.log('OK');
