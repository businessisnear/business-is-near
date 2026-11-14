# Retire a declared NEAR-native portfolio

The local owner review workflow stops new work across an explicitly declared native portfolio, then re-observes every declared control at FINAL. It never deletes public history, seizes customer escrow, loads wallet keys, sends transactions, retries an unknown outcome or shuts down another company's shared service.

This is a local candidate. Actual isolated-chain reports are under `.artifacts/portfolio-retirement/`; the current run state is `.artifacts/thread-completion/retirement/STATE.json`. A sandbox report is not public deployment, hosted Cloud acceptance or a production security audit.

## Declare the complete portfolio

Use the current `near-native-company-exit-v2` selection workflow in `scripts/company-exit.mjs` to prepare the exact portfolio charter and obtain its original owner NEP-413 signature. Retirement requires all current families, in this order:

```text
app, appointments, company, factory, feed, knowledge, mail, outbox,
promotion, public_page, service, social, subscriptions
```

Each family is explicitly `included` or `not_associated`; each included contract has an exact account, owned/shared relationship, deployed code hash and WASM SHA-256. The charter fixes the company, owner, chain/genesis identity and approved FINAL block. Retirement verifies the owner's signature and its FullAccess permission at that original block, then validates every selected account and code pin again against fresh FINAL state.

The exit selection signature authorizes read-only collection. It is **not** shutdown permission. Each shutdown action still receives its own exact owner wallet review and transaction approval.

Legacy 12-family v1 archives remain historical export evidence. They cannot establish complete current retirement coverage because they omit the service family. Prepare a new explicit v2 selection; do not silently add contracts or rewrite a previous signature.

The owner must also explicitly declare that any global controls marked `owned` are dedicated to this company. Code cannot discover undeclared business relationships. Only knowledge, mail and factory may be `shared_public`; knowledge must be shared. A shared-public service is never given a global freeze by this workflow.

## Protected configuration and local UI

Create a canonical absolute directory owned by the current OS user, mode `0700`, and a protected configuration file mode `0600`. Keep the journal in a private existing directory. Do not put wallet, operator, recovery or provider secrets in this configuration.

The configuration has exactly:

```json
{
  "schema": 1,
  "configuration": {
    "network": "testnet",
    "rpc_url": "https://rpc.testnet.near.org/",
    "chain_id": "testnet",
    "genesis_hash": "REVIEWED_BASE58_GENESIS_HASH",
    "genesis_height": 42376888
  },
  "charter": {"COPY": "the exact current owner-reviewed exit-v2 charter"},
  "signed": {"COPY": "the exact original NEP-413 owner selection signature"},
  "exclusive_owned_resources_ack": "OWNED_CONTROLS_ARE_DEDICATED_TO_THIS_COMPANY",
  "journal_directory": "/ABSOLUTE/PRIVATE/retirement-journal"
}
```

The `COPY` objects and hash are placeholders, not valid example approvals. Retain the complete original typed charter and signature objects unchanged. Sandbox accepts only a pinned numeric loopback HTTP endpoint. Public mode accepts only the fixed NEAR testnet RPC endpoints. Mainnet is disabled here. No account, public deployment or key grant is created by these commands.

From the project root:

```sh
node scripts/native-retirement.mjs --config /ABSOLUTE/PRIVATE/retirement.json
```

Open the printed numeric loopback URL. The server builds the local owner interface and original wallet control pages. It exposes only bounded inspection/review/journal/reconciliation routes. It has no private wallet key, signing API or broadcast RPC method. On testnet, connect the original owner wallet. The seeded Node wallet bridge exists only when deliberately injected by an isolated integration test; it is not production authentication or a multi-tenant wallet service.

Review the family list and dedicated-resource declaration. Select one proposed control, inspect the exact account/method/arguments, and separately approve that action. The runtime rechecks fresh FINAL/genesis/code/owner state before it durably reserves the intent. The wallet receives one fixed zero-deposit function call with 150 Tgas allowance. Model output cannot supply a method, recipient or account.

A draft cancelled during revalidation is invalidated before reservation. If a reservation has already happened, it is retained until the original wallet transaction is identified and reconciled. Switching accounts or closing a review cannot resurrect a stale approval.

## Controls and retained rights

- **Company:** freeze new work, disable base AI and media grants, pause every declared mandate/inbox, and cancel still-cancellable approved operations. Existing AI/provider reservations remain reported; an already-issued request is not declared cancelled.
- **Feed:** disable new publication and comments; cancel each exact queued schedule commitment. Previously published posts, media and comments remain public.
- **Public page:** disable current/new publication. Permanent historical version paths remain readable.
- **Promotion:** freeze new placements and stop each campaign. Unspent budget and pending native transfer/refund identities remain reported. Use the original campaign refund controls; retirement does not resend a payout.
- **Subscriptions:** merchant freeze stops new subscriptions, topups and due charges. Original buyers retain cancellation/refund/dispute rights; immutable arbitration, settlement and timeout rules remain.
- **Native service:** merchant freeze stops requests, qualification, offers, counters and acceptance. Existing original-buyer cancellation, merchant refund, acknowledgement, timeout and whole-credit withdrawal rules remain.
- **Apps:** the additive prefixed lifecycle pause stops create/update. Old root/state ABI fields are unchanged. Reads, record export and owner additive schema migration remain available, and migration does not remove the pause.
- **Appointments:** freeze new intake while preserving original booking/refund/settlement rules. Escrow, earned balances and pending withdrawals remain visible.
- **Owned delivery/social outboxes:** disable live requests, freeze new authority, and cancel only unsent intents whose provider write has not been reserved. Reserved or unknown writes are retained for original-identity reconciliation.
- **Shared mail:** disable only the owner's receiving consent and withdraw only the owner's directory listing. Other company profiles and the global mail contract remain available. A dedicated owned mail contract may be frozen under the explicit dedicated-resource declaration.
- **Shared knowledge:** disable only the owner's publication/adoption consent. Other publishers, registry access and permanent public notes remain.
- **Factory:** only a dedicated owned factory may be frozen. A shared factory stays available; original creation/refund identities associated with this company remain reported.

Retirement does not revoke an unrelated account's keys or erase the owner's general wallet authority. A later separately authorized transaction or deployment-key upgrade can change state. The report describes the explicit portfolio at its displayed FINAL block, not an irreversible global ban.

## Unknown outcomes and completion

The protected journal records the exact reviewed action fingerprint, portfolio identity, approval block and request UUID **before wallet dispatch**. A returned transaction hash is attached once and cannot be replaced. If the wallet loses its response, inspect its original history and supply that exact original hash. Reconciliation is read-only: it validates the signer, target, arguments, gas/deposit, post-approval block and complete FINAL receipt graph. It never signs or broadcasts another transaction.

CLI read-only operations:

```sh
printf '%s\n' '{"command":"inspect"}' | node executor/native_portfolio_retirement.mjs --config /ABSOLUTE/PRIVATE/retirement.json
printf '%s\n' '{"command":"reconcile"}' | node executor/native_portfolio_retirement.mjs --config /ABSOLUTE/PRIVATE/retirement.json
```

The UI permits attaching only the original wallet hash to its existing reservation. Do not delete or replace the journal, invent another intent or take over a lease without establishing that the original process stopped. A changed RPC port may reconnect to the same pinned chain; it does not change the journal's company/code/owner identity.

`all_declared_controls_verified` is true only after re-observation finds every declared shutdown control stopped. `fully_retired` additionally requires no remaining native liabilities, reserved/unknown provider outcomes or unresolved owner wallet action. Pending balances are shown with the original customer or merchant rights; owner cash/assets are distinguished from customer liabilities. The UI links to the original wallet control pages for refunds and settlement and can export its exact verified report.

No retirement claim covers undeclared accounts, deleted history, semantic business outcomes, external provider shutdown or a private multi-tenant service. Shared public services deliberately remain available to others.

## Verification and recovery evidence

Offline checks:

```sh
node --test contract/test/app_retirement.mjs executor/test_native_portfolio_retirement.mjs web-chain/tests/native-retirement-actions.test.mjs
```

The host tests use the actual app TypeScript under a synthetic host; the RPC tests use explicit synthetic responses. They do not count as native protocol evidence.

The actual multi-contract check is:

```sh
node integration/portfolio_retirement_e2e.mjs
```

Run it only in a reserved serial chain/browser slot. It deploys the declared native families on one private persistent sandbox, proves wrong-owner denials, separately reviewed shutdowns, original-hash recovery, shared-service isolation, no due publication/charge after retirement, actual original-buyer native refunds and preserved public history/owner migration. It records raw FINAL receipt graphs and fees, source/WASM pins, a mobile screenshot and a browser recording. The report is emitted only after owned browser/server/chain teardown succeeds and the successful private fixture is removed. Failed or unknown fixtures are retained and never automatically replayed.

The subscription harness also now explicitly closes its browser context before closing the browser, so its recorder is flushed before hashing. The original financial acceptance report and separate video-finalization evidence remain preserved unchanged.
