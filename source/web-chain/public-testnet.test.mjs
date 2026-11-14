import test from 'node:test';
import assert from 'node:assert/strict';
import {PUBLIC_TESTNET_RPC, createPublicTestnetRPC, verifiedDemo, assertPublicOperation, publicWorkspaceURL, publicResultURL, validateRecordedResult, publicWebsiteDraftURL} from './src/public-testnet.js';

// Value: protects=fixed public testnet RPC and wrong-chain refusal;
// fails_when=public requests use another endpoint or accept mainnet;
// why_new=existing public tests cover pins and operations, not RPC dispatch;
// seam=none; no_claim=provider availability or live RPC acceptance (fetch is synthetic).
test('public RPC uses only the fixed Fastnear testnet provider and checks the actual chain response', async t => {
  const requests = [];
  let chain = 'testnet';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const request = JSON.parse(options.body);
    requests.push({url, options, request});
    return {ok: true, text: async () => JSON.stringify({jsonrpc: '2.0', id: request.id, result: {chain_id: chain}})};
  });
  const rpc = createPublicTestnetRPC();
  await rpc.checkNetwork();
  chain = 'mainnet';
  await assert.rejects(rpc.checkNetwork(), /not testnet/);
  assert.equal(PUBLIC_TESTNET_RPC, 'https://test.rpc.fastnear.com');
  assert.equal(requests.length, 2);
  for (const {url, options, request} of requests) {
    assert.equal(url, 'https://test.rpc.fastnear.com');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.method, 'POST');
    assert.equal(request.method, 'status');
    assert.deepEqual(request.params, []);
  }
});

const checked = {
  schema: 1, network: 'testnet', deployment_status: 'finalized',
  company_id: 'example-company.testnet', code_hash: '5nPd4tqK33eJZqgkoX8s8m4Fefm2UyrAy1oMxKpbUs4K',
  worker_key_id: 'a'.repeat(64), execution_backend: 'local_gemma_mock',
  cloud_billing_verified: false, tee_verified: false,
};

test('a prepared deployment never becomes an inspectable live example', () => {
  for (const status of ['prepared', 'pending', 'unknown', null]) {
    const config = {...checked, deployment_status: status};
    assert.equal(verifiedDemo(config), false);
    assert.throws(() => publicWorkspaceURL(config, 'https://example.com/project/app/'));
  }
  assert.equal(verifiedDemo(checked), true);
});

test('demo identity requires testnet pins and honest mock provenance', () => {
  for (const changed of [
    {network: 'mainnet'}, {company_id: 'example.near'}, {code_hash: 'unverified'},
    {worker_key_id: null}, {worker_key_id: 'a'.repeat(63)},
    {execution_backend: 'near_ai_cloud'}, {cloud_billing_verified: true}, {tee_verified: true},
  ]) assert.equal(verifiedDemo({...checked, ...changed}), false);
});

test('inspection keeps the GitHub Pages project and app path', () => {
  assert.equal(publicWorkspaceURL(checked, 'https://businessisnear.github.io/business-is-near/app/').href,
    'https://businessisnear.github.io/business-is-near/app/business.html?demo=1');
  assert.equal(publicWorkspaceURL(checked, 'https://example.com/another/project/app/index.html').pathname,
    '/another/project/app/business.html');
});

test('public text work cannot authorize recurrence or other operator workflows', () => {
  for (const operation of ['content_draft', 'website_build']) assert.doesNotThrow(() => assertPublicOperation({operation}));
  for (const operation of ['strategy_plan', 'research_summary', 'support_draft', 'engineering_patch', 'social_draft']) {
    assert.throws(() => assertPublicOperation({operation}));
  }
  assert.throws(() => assertPublicOperation({operation: 'content_draft'}, true));
});

const recorded = {schema: 1, network: 'testnet', company_id: checked.company_id, task_id: 'synthetic_content_once',
  operation: 'content_draft', task_status: 'archived', company_frozen: true, worker_key_revoked: true,
  execution_backend: 'local_gemma_mock', artifact: {title: 'Synthetic example', summary: 'A completed test draft.',
    items: [{text: 'This is a synthetic testnet example.', source_ids: ['company_facts']}]},
  receipts: [{label: 'Synthetic archived task', tx_hash: '1'.repeat(44)}]};

test('recorded result accepts only bound archived/frozen/revoked public data', () => {
  assert.equal(validateRecordedResult(recorded, checked), recorded);
  for (const changed of [{company_id: 'other.testnet'}, {task_status: 'awaiting_evidence'},
    {company_frozen: false}, {worker_key_revoked: false}, {record_key: 'must never be public'},
    {receipts: [{label: 'Unsafe link', tx_hash: 'javascript:alert(1)'}]},
    {artifact: {...recorded.artifact, extra_private_field: 'refuse extra fields'}}]) {
    assert.throws(() => validateRecordedResult({...recorded, ...changed}, checked));
  }
});

test('recorded result URL cannot select another origin, operator route or arbitrary path', () => {
  assert.equal(publicResultURL({...checked, result_url: './example-result.json'},
    'https://example.com/project/app/index.html').href, 'https://example.com/project/app/example-result.json');
  for (const result_url of ['https://elsewhere.example/result.json', '//elsewhere.example/result.json',
    '/__private/config', '../example-result.json', './unexpected.json']) {
    assert.throws(() => publicResultURL({...checked, result_url}, 'https://example.com/project/app/'));
  }
});

// Value: protects=website-build result acceptance without broadening operator tasks;
// layer=unit; no_claim=live inference, archival or public deployment evidence.
test('recorded website draft is supported while other operation classes remain refused', () => {
  const website = {...recorded, operation: 'website_build', task_id: 'synthetic_website_once'};
  assert.equal(validateRecordedResult(website, checked), website);
  assert.equal(validateRecordedResult(recorded, checked), recorded);
  for (const operation of ['strategy_plan', 'research_summary', 'support_draft',
    'engineering_patch', 'social_draft', '', null]) {
    assert.throws(() => validateRecordedResult({...recorded, operation}, checked));
  }
});

test('website preview is a fixed same-app asset for a validated website result only', () => {
  const website = {...recorded, operation: 'website_build'};
  const base = 'https://businessisnear.github.io/business-is-near/app/index.html';
  assert.equal(publicWebsiteDraftURL(website, checked, base).href,
    'https://businessisnear.github.io/business-is-near/app/example-website.html');
  assert.equal(publicWebsiteDraftURL(recorded, checked, base), null);
  assert.throws(() => publicWebsiteDraftURL({...website, preview_url: 'https://elsewhere.example/'}, checked, base));
  assert.throws(() => publicWebsiteDraftURL({...website, task_status: 'awaiting_evidence'}, checked, base));
});
