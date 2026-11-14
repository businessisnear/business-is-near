import './public-demo.css';
import config from './public-testnet-config.json';
import {verifiedDemo, publicWorkspaceURL, publicResultURL, validateRecordedResult, publicWebsiteDraftURL} from './public-testnet.js';

const status = document.querySelector('#demo-status');
const inspect = document.querySelector('#inspect-demo');
if (verifiedDemo(config)) {
  status.textContent = 'Open the demonstration company to read its finalized records directly from NEAR testnet. No wallet is needed to inspect it.';
  inspect.href = publicWorkspaceURL(config, location.href).href;
  inspect.hidden = false;
} else {
  status.textContent = 'The public company is being prepared. You can explore the workspace now; a live example appears here only after its deployment and worker identity are verified.';
}

async function showRecordedResult() {
  if (!verifiedDemo(config) || config.result_url === null || config.result_url === undefined) return;
  const url = publicResultURL(config, location.href);
  const response = await fetch(url, {redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10000)});
  if (!response.ok || !response.body) throw Error('Recorded result unavailable.');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 65536) throw Error('Recorded result exceeds its bound.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const result = validateRecordedResult(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)), config);
  const write = (selector, value) => { document.querySelector(selector).textContent = value; };
  const draftKind = result.operation === 'website_build' ? 'website draft' : 'content draft';
  write('.demo-result-caption', 'A synthetic ' + draftKind + ' from local Gemma, with its finalized NEAR testnet records. The company is now frozen and the worker signing key is revoked.');
  write('#recorded-result-title', result.artifact.title);
  write('#recorded-result-summary', result.artifact.summary);
  const items = document.querySelector('#recorded-result-items');
  for (const item of result.artifact.items) {
    const row = document.createElement('li'), words = document.createElement('p'); words.textContent = item.text; row.append(words);
    if (item.source_ids.length) { const sources = document.createElement('small'); sources.textContent = 'Sources: ' + item.source_ids.join(', '); row.append(sources); }
    items.append(row);
  }
  const websiteURL = publicWebsiteDraftURL(result, config, location.href);
  if (websiteURL) {
    const link = document.createElement('a');
    link.href = websiteURL.href; link.className = 'demo-button demo-button-dark';
    link.textContent = 'Open website draft'; link.rel = 'noreferrer';
    document.querySelector('.demo-result-card').append(link);
  }
  write('#recorded-result-identity', result.company_id + ' · task ' + result.task_id + ' · archived · local Gemma mock');
  const receipts = document.querySelector('#recorded-result-receipts');
  for (const receipt of result.receipts) {
    const row = document.createElement('li'), link = document.createElement('a');
    link.href = 'https://testnet.nearblocks.io/txns/' + receipt.tx_hash; link.rel = 'noreferrer';
    link.textContent = receipt.label + ' ↗'; row.append(link); receipts.append(row);
  }
  document.querySelector('#recorded-result').hidden = false;
}
showRecordedResult().catch(() => {
  // The workspace remains available. Never display a partial or unbound result.
  document.querySelector('#recorded-result').hidden = true;
});
