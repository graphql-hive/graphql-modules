const fs = require('fs');
const path = require('path');

const __project = path.resolve(__dirname, '..');

console.log('Fixing async context imports in dist package.json...');

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

const modTypes = ['cjs', 'esm', '.'];

for (const file of [node, browser]) {
  const src = path.join(__project, 'packages', 'graphql-modules', 'src', file);
  for (const modType of modTypes) {
    const dest = path.join(
      __project,
      'packages',
      'graphql-modules',
      'dist',
      modType,
      file
    );
    console.log(`Copying ${src} to ${dest}...`);
    fs.copyFileSync(src, dest);
  }
}

console.log('Updating imports field in dist package.json...');

for (const modType of modTypes) {
  try {
    const distPath = path.join(
      __project,
      'packages',
      'graphql-modules',
      'dist',
      modType,
      'package.json'
    );
    const distFile = fs.readFileSync(distPath, 'utf8');
    const distPkg = JSON.parse(distFile);
    distPkg.imports = srcPkg.imports;

    fs.writeFileSync(distPath, JSON.stringify(distPkg, null, 2) + '\n');
  } catch (err) {
    console.warn(
      `Warning: Could not update imports field in dist package.json for module type "${modType}": ${err.message}`
    );
  }
}

console.log('OK');
