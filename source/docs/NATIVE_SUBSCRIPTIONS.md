# NEAR-native prepaid subscriptions

This local candidate implements finite prepaid recurring service payments on NEAR. Buyers prepay approved cycles; an automated runner can charge only the next due approved cycle. A charge moves escrow into a dispute hold. Merchant withdrawals, buyer refunds and arbitration are separate actions. The runner never debits a wallet.

No public contract, account or NEAR AI Cloud account is configured by this feature. Local sandbox evidence is not a production audit or a public deployment. This feature does not call Stripe, a card network, a model or an external payment provider.

## Files and validation

- Contract: `contract/onchain/native_subscriptions.ts`
- Isolated build: `node scripts/build_native_subscriptions.mjs`
- Due-cycle runner: `executor/native_subscriptions_client.mjs`
- Wallet page: `web-chain/native-subscriptions.html`
- Exact action builders: `web-chain/src/native-subscriptions-actions.js`
- Actual local-chain and Chrome check: `node integration/native_subscriptions_e2e.mjs`

The NEAR SDK compiler shares a generated methods header with other contract builds. Run contract compilers serially. Run the isolated sandbox/model suites serially on this development Mac.

Offline checks:

```sh
node --test contract/test/native_subscriptions.mjs executor/test_native_subscriptions_client.mjs web-chain/tests/native-subscriptions-actions.test.mjs
```

The 16 contract-host tests use the actual TypeScript under a synthetic host. The nine runner tests use synthetic RPC with real transaction serialization and signatures. Seven browser action tests check approval boundaries. They are separate from actual NEAR protocol evidence.

The integration check records raw complete FINAL receipt graphs and execution fees, exact native transfer receipts, a full 24-cycle buyer callback, scoped-key billing, lost acknowledgements, buyer/merchant browser actions and mobile isolation. Reports, partial failures, screenshots and the raw browser recording (`native-subscriptions-browser.webm`) are under `.artifacts/native-subscriptions/`. Video capture uses the same already-required browser actions and adds no payment or retry. Current run status is under `.artifacts/thread-completion/subscriptions/STATE.json`. Failed or unknown fixtures are stopped and retained; they are not automatically reset or retried.

## Immutable service terms

Initialization fixes:

- Merchant and a distinct independent arbiter.
- Public service terms, limited to 1024 UTF-8 bytes.
- Price, greater than zero and at most 1 NEAR per cycle.
- Billing period, 60 seconds through 30 days.
- Buyer dispute window, 30 seconds through seven days.
- Arbiter decision window, 60 seconds through 30 days after a dispute.

The terms SHA-256 commits to the profile, contract account, merchant, arbiter, full terms text, price and all three timing values. Buyer approval includes this exact hash. There are no term-edit or arbiter-replacement methods.

Contract account deployment keys can upgrade its code. The merchant/deployer trust assumption must be reviewed independently; the terms hash does not remove upgrade authority. The page and runner pin deployed code and chain identity. A code change stops them until a newly reviewed configuration is provided. This profile's `merchant_upgrade_trust` flag is a disclosure of that trust assumption, not proof of who currently possesses deployment keys.

The original buyer, merchant and arbiter must act as direct NEAR accounts: predecessor and original signer must both equal the expected account. Delegated contract-wallet or relayed signatures are outside this profile.

## Buyer approval and quote

A subscription authorizes 1–24 lifetime cycles, including all topups. It fixes a start and expiry. Start must be no earlier than execution and no more than 30 days ahead; expiry must follow start and be no more than 366 days ahead. The browser leaves at least two minutes before the selected start so a wallet review can complete.

The approval is for **up to** the chosen number of cycles before expiry. If the expiry comes first, remaining escrow is refundable. An approval is never permission to debit additional wallet funds.

At the same pinned FINAL block, read `quote({"cycles": 3})`. It returns:

```text
budget  = price × cycles
storage = 98304 × protocol storage_byte_cost
total   = budget + storage
```

The quote identifies the exact terms hash, cycles, protocol storage byte cost and retained storage bytes. Budget is refundable while uncharged. Storage is retained, cannot be refunded and cannot be withdrawn by the merchant.

`subscribe` requires the exact quote amount as its deposit and these exact fields:

```text
id, cycles, starts_at, expires_at, terms_sha256,
approved_storage, approved_budget,
prepaid_and_dispute_terms_ack=true, public_metadata_ack=true
```

Subscription IDs, accounts, cycle times, balances and decision commitments are permanent public metadata. Put no secrets in an ID or public service term. The page hashes a private dispute explanation locally and sends only its commitment; retain the explanation and supporting evidence for the arbiter.

`top_up` requires the original buyer, unchanged terms and expiry, the current authorized-cycle count, the exact additional-cycle budget and a total authorization no greater than 24. It takes no second storage contribution. Frozen, cancelled and expired subscriptions cannot be topped up.

## Protect the runner configuration

Use a canonical absolute private directory owned by the current OS user. Directory modes must be `0700`, configuration/key files `0600`, and files must not be symlinks or hard-linked copies. Keep private material out of repository source, screenshots, chat and logs.

The runner does not create or grant keys. During a separately reviewed owner deployment, provision an operator account with one **function-call access key restricted to `charge` on the exact subscription contract**, with a finite gas allowance. A full-access key, another receiver, any additional method, an unlimited allowance or an allowance above the configured maximum is rejected. The key cannot cancel a subscription, withdraw funds, resolve a dispute or edit policy.

The protected key file has exactly `account_id` and `secret_key`; populate it through the owner's protected provisioning flow. Do not paste a key into shell history or documentation.

Configuration has exactly these fields:

```json
{
  "schema": 1,
  "network": "sandbox",
  "chain_id": "REVIEWED_LOCAL_CHAIN_ID",
  "genesis_height": 0,
  "genesis_hash": "REVIEWED_BASE58_GENESIS_HASH",
  "rpc_url": "http://127.0.0.1:REVIEWED_PORT/",
  "subscriptions_id": "reviewed-subscriptions-account",
  "code_hash": "REVIEWED_BASE58_DEPLOYED_CODE_HASH",
  "merchant_id": "reviewed-merchant-account",
  "terms_sha256": "REVIEWED_64_LOWERCASE_HEX_TERMS_HASH",
  "operator_id": "reviewed-operator-account",
  "operator_public_key": "ed25519:REVIEWED_PUBLIC_KEY",
  "operator_key_file": "/ABSOLUTE/PRIVATE/operator.json",
  "journal_directory": "/ABSOLUTE/PRIVATE/billing-journal",
  "max_allowance": "100000000000000000000000",
  "public_execution_enabled": false
}
```

The example placeholders are not executable credentials or a deployment. Review every value against the actual account and FINAL chain state. Create the journal directory before opening the client; it must be empty on first use and must be retained afterward. Do not point a new configuration at another deployment's journal.

Sandbox accepts only an explicit numeric loopback HTTP endpoint and disallows public execution. Public mode accepts only explicitly enabled `testnet`, pinned testnet identity and one of the runner's two fixed HTTPS testnet RPC URLs. Mainnet is disabled. A testnet configuration still requires owner-reviewed deployment and key provisioning; no such action is implied by this document.

## Inspect, run one cycle and reconcile

The CLI accepts one bounded command from standard input. Run from the project root. These commands do not print key contents:

```sh
subscription_cfg=/ABSOLUTE/PRIVATE/subscriptions.json
printf '%s\n' '{"command":"inspect"}' | node executor/native_subscriptions_client.mjs --config "$subscription_cfg"
printf '%s\n' '{"command":"run_once"}' | node executor/native_subscriptions_client.mjs --config "$subscription_cfg"
printf '%s\n' '{"command":"reconcile"}' | node executor/native_subscriptions_client.mjs --config "$subscription_cfg"
```

`inspect` verifies pinned chain/genesis/code/terms and reads the complete bounded queue at FINAL. `run_once` charges at most one eligible next cycle, with zero attached deposit. If a prior signed transaction is pending, it reconciles that original hash instead. A scheduler may invoke one command at a time according to an owner's reviewed operating policy; this CLI does not silently install a daemon or recurring OS job.

For a read-only quote from the exact FINAL block already verified by `inspect`, use the runner library and its reviewed RPC configuration:

```js
import fs from 'node:fs/promises';
import {openNativeSubscriptionsClient} from './executor/native_subscriptions_client.mjs';
const config = JSON.parse(await fs.readFile(process.env.SUBSCRIPTIONS_CONFIG, 'utf8'));
const client = await openNativeSubscriptionsClient(config);
try {
  const inspected = await client.inspect();
  const args_base64 = Buffer.from(JSON.stringify({cycles: 3})).toString('base64');
  const response = await fetch(config.rpc_url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 'quote', method: 'query', params: {
      request_type: 'call_function', account_id: config.subscriptions_id,
      method_name: 'quote', args_base64, block_id: inspected.final_block
    }})
  });
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 16384) throw Error('Quote response too large');
  const envelope = JSON.parse(raw);
  if (!response.ok || envelope.jsonrpc !== '2.0' || envelope.id !== 'quote' ||
      envelope.error || envelope.result?.block_hash !== inspected.final_block ||
      !Array.isArray(envelope.result.result) || envelope.result.result.length > 8192 ||
      envelope.result.result.some(n => !Number.isInteger(n) || n < 0 || n > 255))
    throw Error('Quote did not match the reviewed FINAL block');
  console.log(JSON.parse(Buffer.from(envelope.result.result).toString('utf8')));
} finally { await client.close(); }
```

A displayed quote is not a wallet approval. The browser's action builder independently validates quote fields and amounts and refreshes them before dispatch.

The runner records and fsyncs the exact signed bytes, transaction hash, nonce, argument fingerprint and identity **before one reserved broadcast**. A lost response keeps that signed intent. Reconcile only its original hash. Never delete or replace the journal, resend signed bytes, invent a new intent ID, or grant a broader key to bypass an unknown outcome. A held lease is not automatically taken over after a crash; first establish that its prior process stopped.

## Hold, cancellation, arbitration and withdrawal

`charge` moves one due sequential cycle from escrow into held funds. It never transfers NEAR to the merchant. Repeating an already charged cycle returns the existing record. Freeze blocks new subscriptions, topups and charges; it does not remove buyer cancellation or dispute recovery.

`cancel` lets the original buyer move only uncharged escrow into buyer credit. `expire` allows anyone to perform that same unused-budget release after expiry. Previously charged holds remain subject to their original dispute rules.

`settle` releases an undisputed held cycle into merchant credit only after its dispute window closes. The original buyer can `dispute` before that boundary. The named immutable arbiter can `resolve` an active dispute with an exact buyer share from zero to the cycle amount; the remainder becomes merchant credit. After the arbiter deadline, `timeout_dispute` refunds the entire held cycle to buyer credit. No unilateral merchant refund decision can seize a disputed hold.

Current cycle state stores its latest `reason_sha256`. An arbiter decision replaces that current field; the original buyer commitment remains in the permanent dispute transaction history. Export original receipts when retaining a full case record.

`withdraw_buyer` and `withdraw_merchant` send the **whole available original credit** to the original buyer or immutable merchant. Recipients cannot be supplied or changed. The approved amount and unique transfer ID are reviewed in the wallet. Credit is debited into pending liability before the native transfer promise is created.

A private callback marks a proven successful native transfer paid. A known failure restores the original credit, but a new explicitly reviewed intent also requires sufficient returned backing and storage. An ambiguous or failed callback remains pending; repeating that original intent sends nothing, and every new transfer is blocked while the pending transfer is unresolved. Inspect original transfer and callback receipts. There is no automatic administrative clear or unknown-transfer resend.

The page uses the selected original wallet and verifies one fixed contract action, exact signer, code pin, chain, arguments, gas, deposit and active review generation. A browser journal is reserved before wallet dispatch. After an unresolved wallet result or reload, enter the original transaction hash for FINAL reconciliation; it does not sign again.

## Funding, storage, capacity and gas bounds

```text
funded = escrow + held + buyer_credit + merchant_credit
       + transfer_pending + buyer_paid + merchant_paid
```

Current liabilities and retained storage must be backed by the contract balance. Provider estimates and business revenue are not invented from these internal transfers.

Bounds are:

- 128 retained subscriptions; 24 lifetime authorized cycles each.
- 1024 NEAR lifetime funded budget, including amounts already paid or refunded. This ceiling does not reset.
- 32 buyer withdrawal intents per subscription.
- Merchant intent capacity of `32 × funded subscription count`, at most 4096.
- 8192 total retained transfer records.
- A 98304-byte prepaid retained reservation per subscription. It covers a value bounded to 12288 bytes plus 32 buyer and 32 merchant transfer allocations of at most 1280 measured storage bytes each, with key/index room.
- Each transfer value is padded to exactly 1024 bytes on creation and all callback rewrites. A new dispatch must also prove its storage increase is at most 1280 bytes. Merchant capacity grows only when these reservations are funded.
- A separate 65536-byte root-state/storage cushion.
- Withdrawal actions require at least 100 Tgas prepaid and reserve 60 Tgas for their callback. The supplied wallet/runner actions use 150 Tgas. These are execution allowances, not fabricated actual fees; reports sum complete FINAL execution costs.

Whole-credit withdrawals support all normal lifetime cycle credits without tiny partial withdrawals consuming history. Repeated known-failure attempts still consume explicit finite intent capacity. State exposes the total and funded capacity; do not promise an unlimited billing lifetime or erase history to extend it.

Initial local verification found that the earlier 15-Tgas buyer callback could exhaust gas after a native transfer succeeded. That exact failed local fixture and paid/pending intent are retained and must never be resent. The current 60-Tgas callback is checked with an actual 24-cycle buyer history in the isolated integration run. The 2026-11-12 fresh local run passed all 12 acceptance checks across 108 complete FINAL transactions, including this larger history and the browser flow. It verified six exact native transfers and four reviewed browser signatures, with no remaining escrow, holds, credits or pending transfer. The raw browser video is 78.24 seconds; its finalized hash is recorded in the report and the separate video-finalization record. Public deployment and production readiness remain outside this evidence.
