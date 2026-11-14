// Build only the supported public Pages surface. No credentials or runtime data
// enter this build; the public JSON contains independently checked public pins.
import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {publicOwnerToolLinks} from './public-tool-links.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const recordedAssets = {
  'example-result.json': 'd81571e6d0f28baf6a1a2e7bb426f82d28a64927150dc402fce060e06ac00635',
  'example-website.html': 'de143a28c573ddf57325305ae1a4e963b33d12c94c133cac608d7a74b0b786df',
  'verification.json': 'edc373e58290fd08733322a4e86b6f1d3863c55dc7585f9baafebd2d3b08f85e',
};
const args = process.argv.slice(2);
if (args.length > 1 || args.some(value => !path.isAbsolute(value))) {
  throw Error('Optional output directory must be one absolute path.');
}
const outDir = path.resolve(args[0] || path.join(root, 'dist-public-testnet'));
const allowed = [path.join(root, 'dist-public-testnet'), path.resolve(root, '../../docs/app')];
if (!allowed.includes(outDir)) throw Error('Output must be the dedicated local or Pages app build directory.');
// Vite clears generated output. Never follow an alias into another directory.
for (let check = outDir; check !== path.parse(check).root; check = path.dirname(check)) {
  try {
    const info = await fs.lstat(check);
    if (info.isSymbolicLink() || !info.isDirectory()) throw Error('Output directories must be regular canonical directories.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await build({root, configFile: path.join(root, 'vite.config.js'), mode: 'public-testnet', base: './', build: {outDir, emptyOutDir: true}});
await fs.rename(path.join(outDir, 'public-demo.html'), path.join(outDir, 'index.html'));
// Normal local owner-tool pages are intentionally not deployed by this builder.
// Keep their discovery links truthful on the five-page public surface.
const businessPage = path.join(outDir, 'business.html');
await fs.writeFile(businessPage, publicOwnerToolLinks(await fs.readFile(businessPage, 'utf8')));
// Recorded public artifacts are reviewed source inputs, never private runtime
// files. Copy after Vite clears the dedicated output so rebuilds retain them.
const assetRoot = path.join(root, 'public-testnet-assets');
const assetDirectory = await fs.lstat(assetRoot);
if (!assetDirectory.isDirectory() || assetDirectory.isSymbolicLink() || await fs.realpath(assetRoot) !== assetRoot) {
  throw Error('Recorded public artifacts require a regular canonical source directory.');
}
for (const [name, expected] of Object.entries(recordedAssets)) {
  const source = path.join(assetRoot, name), info = await fs.lstat(source);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || await fs.realpath(source) !== source) {
    throw Error('Recorded public artifacts require regular source files.');
  }
  const bytes = await fs.readFile(source);
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw Error('Recorded public artifact differs from its reviewed bytes.');
  await fs.writeFile(path.join(outDir, name), bytes);
}
const entries = await fs.readdir(outDir);
if (entries.some(name => !['index.html', 'founder.html', 'site.html', 'business.html', 'wallet-auth-callback.html', 'assets', ...Object.keys(recordedAssets)].includes(name))) {
  throw Error('Unexpected public build output.');
}
console.log(JSON.stringify({public_testnet_build: 'complete', pages: ['index.html', 'founder.html', 'site.html', 'business.html', 'wallet-auth-callback.html'], recorded_assets: Object.keys(recordedAssets), deployment_is_verified_by_build: false}));
