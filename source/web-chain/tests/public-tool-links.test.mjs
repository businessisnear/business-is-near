import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {publicOwnerToolLinks, LOCAL_OWNER_TOOL_PAGES, OWNER_TOOLS_GUIDE} from '../public-tool-links.mjs';

// Protects public navigation without broadening the five-page wallet surface.
// Reads source HTML only; no browser, network, provider, wallet or runtime.
test('public-only tool links name source/setup while normal source retains its pages', async () => {
  const original = await fs.readFile(new URL('../business.html', import.meta.url), 'utf8');
  const transformed = publicOwnerToolLinks(original);
  assert.equal(LOCAL_OWNER_TOOL_PAGES.length, 17);
  for (const page of LOCAL_OWNER_TOOL_PAGES) {
    assert.ok(original.includes('href="./' + page + '"'), page);
    assert.ok(!transformed.includes('href="./' + page + '"'), page);
    await fs.stat(new URL('../' + page, import.meta.url));
  }
  const links = [...transformed.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].filter(x => x[1] === OWNER_TOOLS_GUIDE);
  assert.equal(links.length, 17);
  for (const link of links) assert.match(link[2], /(?:code &amp; local setup|View source &amp; setup)/);
  assert.equal(OWNER_TOOLS_GUIDE, 'https://github.com/businessisnear/business-is-near/blob/main/source/OWNER-TOOLS.md');
  const builder = await fs.readFile(new URL('../build-public-testnet.mjs', import.meta.url), 'utf8');
  assert.match(builder, /publicOwnerToolLinks/);
  const normalConfig = await fs.readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.ok(!normalConfig.includes('publicOwnerToolLinks'));
  assert.ok(transformed.includes('href="./index.html"'));
});

test('missing or duplicate local tool inventory fails instead of silently changing availability', async () => {
  const original = await fs.readFile(new URL('../business.html', import.meta.url), 'utf8');
  assert.throws(() => publicOwnerToolLinks(original.replace('href="./native-app.html"', 'href="./different.html"')), /inventory/);
  assert.throws(() => publicOwnerToolLinks(original + '<a href="./native-app.html">extra</a>'), /Duplicate/);
});
