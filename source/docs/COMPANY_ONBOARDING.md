# Experimental NEAR company factory

This guide records the experimental standalone factory and its local-sandbox acceptance. Those historical checks do not establish public wallet acceptance or production onboarding. The current release separately includes a guided public-testnet founder journey in [PUBLIC-TESTNET.md](../web-chain/PUBLIC-TESTNET.md) and a separately activated finite worker described in [PUBLIC_TESTNET_MOCK.md](PUBLIC_TESTNET_MOCK.md). The standalone `web-chain/src/company-factory-actions.js` only prepares explicit wallet reviews and actions; it never signs or submits them. Its full-repository commands and local acceptance record below remain scoped to that standalone workflow.

The factory embeds the exact compiled `company.wasm` bytes. Its `template` view reports their SHA-256, NEAR base58 code hash, byte length, initializer schema, gas floors, finite registry limit (128) and bounded attempt limits (3 each). `scripts/build_company_factory.mjs` builds company then factory and writes `contract/build/company_factory.metadata.json` with independent source/artifact hashes. `--company-already-built` embeds the existing company artifact. Hold the shared near-sdk-js compiler slot before either build. No script deploys publicly.

## Owner authority and custody

Only an originating account with `signerAccountId() === predecessorAccountId()` can create or recover a request. The factory itself cannot be that creator. A wallet transaction explicitly reviews the **actual original Ed25519 transaction signer public key** and the literal custody acknowledgement `I_REVIEWED_ORIGINAL_SIGNER_FULL_ACCESS_CUSTODY`. The key is compared with `near.signerAccountPk()`, captured immutably and installed as the child's sole full-access key. No private key, arbitrary selected owner key, server key or worker key is accepted or generated. Function-call access keys cannot attach the positive creation deposit. The equality authenticates the originating account identity; it cannot prove a human is using that account.

A full-access key can transfer funds, delete the child, change keys or replace its contract, bypassing the business contract's method restrictions. Reusing the same wallet key across companies gives account/state isolation, not independent key compromise isolation. Factory account code upgrades are also a trust boundary. Pin and review the actual factory account code independently; template hashes alone do not make an upgradeable factory trustless.

The company initializer adds only optional `factory_owner`. If absent, its owner remains the predecessor with exactly the legacy state. If present, it must be a valid account equal to the originating signer and different from the cross-contract predecessor. The operator must differ from that final owner. Existing policy checks execute with the temporary predecessor owner; final ownership is assigned only after they succeed. The factory and worker never become the business owner. No other business ABI/state/profile changes are required.

## Exact funding and atomic creation

`quote` binds an immutable request ID, immediate child account, originating wallet, captured key, exact company policy, embedded code identity and funding. The wallet approves its full request hash, template SHA, storage and backing. Deposit must match exactly; extra or missing funds fail. Configuration amounts are bounded decimal yoctoNEAR strings; operator and supplier are validated account IDs. No destination, command, HTTP endpoint or model-selected configuration is executed.

The fixed retained storage contribution is `8192 * storageByteCost`. It is nonrefundable and has no contract withdrawal or admin spending method. Separate child initial account backing is `(exact company WASM bytes + 262144) * storageByteCost`, a conservative key/state/storage cushion outside business cash and revenue. The positive total has a 50 NEAR ceiling. The quote uses the installed NEAR SDK storageByteCost (currently a protocol constant, 10^19 yoctoNEAR per byte). Clients must independently compare it with the target chain protocol configuration before signing; a protocol price change requires a compatible build and fresh review. The sandbox test asserts that exact match. The quote is not an invoice, sale, profit estimate or gas estimate. Factory deployment backing and transaction gas are separate.

Before dispatch the factory persists one of 128 never-recycled identities and reserves both request ID and child account. Each child's batch performs create, transfer initial backing, deploy exact code, add the captured full-access key and initialize with the originating wallet owner. NEAR batches are atomic for one receiver: an existing child or failed initializer rolls back that entire child batch. Two companies use two independent batches; their outcomes are not globally atomic. Parent account naming does not grant the factory authority over a child's access keys.

## Recovery and money accounting

`creating` and `refunding` mean pending or unknown until an attempt-matched private callback reads exactly one promise result. A timeout, lost RPC response or apparent missing account does not prove failure. Inspect the original FINAL transaction, descendants and callback. Do not blindly repeat a write. Clients may independently inspect child code, owner and keys, but that does not authorize changing an unknown factory financial state.

An actual failed creation callback moves backing to `create_failed`. Only the original creator can explicitly retry, using the exact original request hash, key, template, policy and funding, with no additional deposit. The original captured key must again sign and be explicitly reviewed. A rotated key cannot silently replace it; refund remains available to the original account identity. At most three creation attempts are allowed; no retry is permitted after active, pending, refunded or refund states. No existing child is overwritten.

Only the original creator can explicitly claim known-failed creation backing. Transfers always target that exact original account. There is no chosen payee, retained-storage refund, general withdrawal or admin spending route. A failed refund callback records `refund_failed`; only an explicit original-account retry is possible, at most three total refund attempts. A pending or unknown refund never retries automatically.

Failed action funds can return after their callback. Therefore recording failure does not imply immediate spendability. Before refund or creation retry, actual factory account balance must cover all still-pending/refundable/refunding backing plus actual storage, a 64 KiB mutation cushion and every retained storage contribution. This conservatively blocks recovery until solvency is observable, without using another request's backing. Callbacks record results even when returned funds have not arrived; they do not assert premature solvency. Freeze blocks new/retried creation, preserves every record/counter/fund, and still permits callbacks and original-wallet refunds.

At every transition:

```
accepted_backing = deployed_backing + creation_pending
                 + refundable_backing + refund_pending + refunded_backing
```

Successful deployment backing belongs to that child's account and storage. It is not factory-held cash or business revenue. The factory ledger reports business cash/revenue as zero. Successful owner keys can later move child funds or upgrade code; the factory does not prevent those full-access actions.

## Validation and boundaries

Run:

```
node --test web-chain/tests/company-factory-actions.test.mjs
node scripts/build_company_factory.mjs --test-fixture
node integration/company_factory_e2e.mjs
```

The optional `--test-fixture` build runs from the contract directory and copies the local-only refund fixture to integration; this still uses the shared SDK slot. Before the narrow initializer edit, preserve the previous artifact as `integration/company_factory_legacy.wasm` and its exact original source and hashes as the adjacent `.ts` and `.metadata.json` archive for exact missing-field legacy equivalence. The test-only refund wallet deliberately deletes its own local seeded account before requesting a refund, making the fixed-recipient transfer genuinely fail. Recreating that exact account with the same local test key permits an explicit known-failure refund retry. This fixture is never embedded in the factory and must never be deployed publicly.

The actual sandbox harness checks exact company/factory code identity, originating wallet ownership and sole full-access key, two isolated states, missing-field legacy equivalence, quote/key/custody guards, callback privacy, duplicate reservation, known-failure retry, persisted registry across an actual node restart, fixed-recipient refunds, actual transfer-failure callbacks, conservation and node teardown. It records raw FINAL transaction outcomes and exact tokens burnt, including known failures, in `.artifacts/company-factory-e2e.json`. Setup account funding is seeded test currency, not a real expense. No model or provider is used. Pending/unknown UI logic is explicitly inspection-only.

No claim is made of a security audit, live wallet acceptance, public factory deployment, independent factory governance, complete production recovery, TEE enforcement or business success. Deployment governance and public wallet-specific acceptance remain separate work.

## Experimental wallet wizard

The standalone `web-chain/factory.html` entry is linked from company settings. Supply independently reviewed factory code and company-template hashes, connect the intended owner wallet, and read the factory and FullAccess public keys at one FINAL block. The wizard displays exact 24-decimal NEAR amounts, nonrefundable registry storage, initial account/storage backing, the immutable request hash and original key. The separate custody acknowledgement explicitly grants that key full account powers. Account backing is not business revenue or spendable company cash.

Every write uses a fresh reviewed quote or phase-specific recovery action. Cross-tab locks serialize approval, a public pending fingerprint is saved before wallet dispatch, and unknown responses permit original-hash inspection without automatic resend. A captured UI review guard and cloned transaction are rechecked after both asynchronous wallet lookup and account inspection; switching away and back cannot revive a cleared approval. Public history is bounded and checkpoints contain public identifiers and transaction hashes only. Restoring a checkpoint grants no signing authority.

`node --test web-chain/tests/company-factory-client.test.mjs` checks exact amounts, key encoding, action/outcome bindings and delayed-wallet guards. `node integration/company_factory_browser.mjs` bundles the actual UI and helper, then uses an explicitly seeded Node-held test signer on real local NEAR. Its current eleven groups cover actual creation, a deliberately lost response, exact FINAL reconciliation with no duplicate signature, deployed child code/original owner/sole key/cash zero, public checkpoint/reload/history, account-change cancellation and deferred-wallet account ABA refusal, mobile containment and zero remote/model requests. This fixture is not an external wallet or public deployment acceptance. It stops its browser and chain and deletes its private temporary fixture.

Primary protocol references: [NEAR batch actions and account creation](https://docs.near.org/smart-contracts/anatomy/actions), [asynchronous calls](https://docs.near.org/smart-contracts/anatomy/crosscontract), [private callback rules](https://docs.near.org/smart-contracts/security/cross-contract-calls/callbacks), [failed-call refunds](https://docs.near.org/smart-contracts/security/cross-contract-calls/refunds), and [full-access versus function-call keys](https://docs.near.org/protocol/accounts-contracts/access-keys). The installed near-sdk-js source defines the includeBytes macro, public-key encoding and promise APIs used here.
