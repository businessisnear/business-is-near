// Public Pages is a deliberately limited build of the existing wallet UI.
// Neither a URL parameter nor a DOM change can enable operator/private APIs.
import {TestnetRPC} from './chain.js';

export const PUBLIC_TESTNET = import.meta.env?.MODE === 'public-testnet';
export const PUBLIC_TESTNET_RPC = 'https://test.rpc.fastnear.com';
export const PUBLIC_OPERATIONS = Object.freeze(['content_draft', 'website_build']);
export function createPublicTestnetRPC() {
  // The shared client's default stays unchanged for existing local tools.
  // This public build has one fixed provider, never a requester-selected URL.
  const fetcher = globalThis.fetch.bind(globalThis);
  return new TestnetRPC((_url, options) => fetcher(PUBLIC_TESTNET_RPC, {
    ...options, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
  }));
}
export function verifiedDemo(config) {
  return !!config && config.schema === 1 && config.network === 'testnet' &&
    config.deployment_status === 'finalized' &&
    typeof config.company_id === 'string' && /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(config.company_id) &&
    typeof config.code_hash === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(config.code_hash) &&
    typeof config.worker_key_id === 'string' && /^[a-f0-9]{64}$/.test(config.worker_key_id) &&
    config.execution_backend === 'local_gemma_mock' &&
    config.cloud_billing_verified === false && config.tee_verified === false;
}
export function assertPublicOperation(scope, repeating = false) {
  if (!scope || !PUBLIC_OPERATIONS.includes(scope.operation) || repeating) {
    throw Error('This public demo supports one content or website draft at a time. Other workflows require the operator project.');
  }
}
export function publicWorkspaceURL(config, base) {
  if (!verifiedDemo(config)) throw Error('The demonstration deployment has not been verified.');
  const url = new URL('./business.html', base);
  url.searchParams.set('demo', '1');
  return url;
}

function exact(value, fields) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...fields].sort().join(',');
}
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
const identifier = value => text(value, 64) && /^[A-Za-z0-9_-]+$/.test(value);
export function publicResultURL(config, base) {
  if (!verifiedDemo(config) || typeof config.result_url !== 'string' ||
      !/^\.\/example-result(?:-[a-z0-9-]{1,40})?\.json$/.test(config.result_url)) {
    throw Error('A verified same-app recorded result is required.');
  }
  return new URL(config.result_url, new URL('./', base));
}
export function validateRecordedResult(value, config) {
  if (!verifiedDemo(config) || !exact(value, ['schema', 'network', 'company_id', 'task_id',
      'operation', 'task_status', 'company_frozen', 'worker_key_revoked',
      'execution_backend', 'artifact', 'receipts']) || value.schema !== 1 ||
      value.network !== 'testnet' || value.company_id !== config.company_id ||
      !identifier(value.task_id) || !PUBLIC_OPERATIONS.includes(value.operation) ||
      value.task_status !== 'archived' || value.company_frozen !== true ||
      value.worker_key_revoked !== true || value.execution_backend !== 'local_gemma_mock') {
    throw Error('The recorded result differs from the published demonstration.');
  }
  const artifact = value.artifact;
  if (!exact(artifact, ['title', 'summary', 'items']) || !text(artifact.title, 200) ||
      !text(artifact.summary, 1500) || !Array.isArray(artifact.items) ||
      artifact.items.length < 1 || artifact.items.length > 8 || artifact.items.some(item =>
        !exact(item, ['text', 'source_ids']) || !text(item.text, 2000) ||
        !Array.isArray(item.source_ids) || item.source_ids.length > 16 ||
        !item.source_ids.every(identifier))) throw Error('Invalid public draft content.');
  if (!Array.isArray(value.receipts) || value.receipts.length < 1 || value.receipts.length > 16 ||
      value.receipts.some(row => !exact(row, ['label', 'tx_hash']) || !text(row.label, 100) ||
        typeof row.tx_hash !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.tx_hash))) {
    throw Error('Invalid public receipt identities.');
  }
  return value;
}
export function publicWebsiteDraftURL(value, config, base) {
  const result = validateRecordedResult(value, config);
  // This is an explicit curated build asset, never a URL supplied by a model
  // or the result JSON. The final publisher separately verifies this file.
  return result.operation === 'website_build' ? new URL('./example-website.html', base) : null;
}
