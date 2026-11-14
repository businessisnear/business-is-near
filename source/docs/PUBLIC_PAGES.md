# NEAR static-page publication

`contract/onchain/public_page.ts` stores owner-approved static HTML versions on
NEAR. `web-chain/public-page.html` prepares exact wallet approvals. The separate
`executor.public_page` viewer reads and verifies that public content without a
wallet, model, private workspace or provider credential. This is a bounded native
publication component. Its `web4_get` view also returns a bounded inline Web4
response suitable for a compatible gateway. Local acceptance does not establish
a live gateway URL, DNS/TLS availability, domain renewal or a general full-stack
application service.

The publisher starts disabled. Its owner separately enables it before publishing.
Each new version requires three explicit boolean acknowledgements: reviewed public
nonsecret content, rights to publish, and permanent public history. The browser
shows the exact title/HTML/source reference, content and record hashes, exact
retained storage and additional gas before requesting one wallet action. Preparing
or previewing HTML does not submit a transaction. Drafts and previews remain in
memory and clear on account changes/reload; no recovery key exists for these
deliberately public publication records.

## Version and money rules

Each publisher holds at most sixteen immutable records of at most 16 KiB UTF-8
HTML and a 128-byte title. Versions are sequential. The record hash commits the
publisher, actual owner, version, title, HTML hash and optional source reference.
A new publication must name the exact currently active hash; stale approvals and
duplicate versions fail atomically. Reactivation chooses an existing version and
also compares the original active hash. Disabling stops the current view; explicit
historical views and prior blockchain transaction data remain public.

A publication contributes exactly 65,536 storage bytes at the SDK storage price,
with an actual storage-growth check. The browser requires an independently
observed protocol storage price and refuses a mismatch. These retained,
nonwithdrawable contributions are neither business cash nor revenue. The deployed
account needs separate backing for its own WASM/state and gas. There is no business
withdrawal, customer payment, recurring charge or transfer method in this component.

An optional `{company_id, task_id, evidence_hash}` source reference is an owner
assertion. The publisher does not decrypt private business evidence or prove that
HTML equals that private artifact. Every record explicitly reports
`source_independently_verified: false`. Content and business claims stay unverified.

## Native Web4 response

`web4_get({request: {path: "/"}})` reads the enabled current publication. A disabled
or empty publisher returns 404. Canonical `/version/N` paths, where N is 1–16,
explicitly read immutable public history even after disabling the current view.
Unknown, missing or malformed paths/arguments return the same bounded unavailable
page. The inline ABI has exactly `status`, `contentType`, base64 `body` and
`cacheControl: "no-store"`; it has no `bodyUrl`, preloads, redirects or remote fetch.
The complete UTF-8 wrapper is capped at 114,688 bytes. Raw publication bytes and
record commitments remain unchanged.

The response contains a trusted outer provenance/unverified label and an
empty-sandbox `srcdoc` iframe. Fixed parent and first-child meta CSP restrict
scripts, forms, network images/media and nested frames; owner HTML stays escaped
inside that iframe. It supports static HTML/CSS copy, not script applications or
third-party embeds. A valid-input native-regex fast path retains the original
reject loop/error ordering. Bounded UTF-8 byte escaping and a generated, checked
4,096-pair base64 table keep maximum-size rendering inside the observed local VM
budget. These changes preserve the same bytes, input limits and confinement policy.

The [Web4 gateway README](https://github.com/vgrichina/web4/blob/65186a0fba63470c7c33d6420db7c88594b27dfa/README.md)
describes account-derived `account.testnet.page`/`account.near.page` names and a
currently free service with possible future charges. Its FAQ excludes deeper
subaccounts; a factory child is not automatically a supported hostname. A NEAR
account, signer and storage/gas funding are still required. These are gateway
operator domains, not DNS managed by NEAR consensus. Custom domains, renewal,
public browser-wallet operation and live gateway delivery remain separate tests.

The [reviewed inline gateway branch](https://github.com/vgrichina/web4/blob/65186a0fba63470c7c33d6420db7c88594b27dfa/app.js#L274-L469)
decodes the inline body but does not forward arbitrary response headers. Therefore
the contract relies on its meta policies and sandbox; it does not supply HTTP CSP
or `nosniff` through this ABI. The gateway/RPC, DNS/TLS, caching and full-access
upgrade key remain trust boundaries. The HTML is not a FINAL/code-pin attestation;
independent readers must verify deployment, owner and record commitments.

## Exact wallet recovery

Before dispatch, the browser stores a public request UUID, network/genesis,
publisher/owner/code identity, starting FINAL height, method, amounts, version and
argument/intent/content hashes. It stores no draft HTML, title, recipient, wallet
key or private recovery key in browser storage. Web Locks serialize approvals
across tabs. Wallet errors or missing hashes retain the original request and block
another signature; matching visible state alone does not clear it.

After reload, the owner can reconnect and inspect the original transaction hash.
Reconciliation requires the exact signer, receiver, one typed function call,
canonical arguments, gas/deposit, original hashes, a newer FINAL transaction block
and complete actual receipt/fee evidence. A wrong hash, incomplete outcome or
changed network/code/owner remains unresolved. A completed publication additionally
reopens its exact historical content commitment. No reconciliation path resends a
transaction. Known FINAL failures permit a new explicit review.

The standalone public manifest schema is:

```json
{
  "schema": 1,
  "network": "testnet",
  "chain_id": "testnet",
  "publisher_id": "your-reviewed-publisher.testnet",
  "owner_id": "your-owner.testnet",
  "expected_code_hash": "INDEPENDENTLY_REVIEWED_32_BYTE_BASE58_CODE_HASH",
  "genesis_height": 0,
  "genesis_hash": "INDEPENDENTLY_REVIEWED_32_BYTE_BASE58_GENESIS_HASH"
}
```

Hash placeholders and the genesis height must be replaced with observed trusted
deployment/network values. This file is public metadata, not a wallet or worker
configuration. The production browser path uses the fixed official testnet RPC;
the explicit loopback rehearsal uses seeded Node-held test accounts. Actual
external-wallet acceptance remains separate from that fixture.

## Read-only viewer

Build with `node scripts/build_public_page.mjs`; this never deploys a contract.
After an independently reviewed deployment, run
`python -m executor.public_page --config /canonical/private/viewer.json`.
The protected configuration contains `schema: 1`, a numeric loopback `port`,
`publisher_id`, `owner_id` and `authority` with the same fixed network/RPC/genesis/
company-code allowlist schema as `NearWalletAuthority`. Its allowlist must contain
exactly this publisher. It contains no signer or model key.

Every request checks network/genesis, actual code and owner, and one FINAL block
shared by account/state/content reads. Raw UTF-8 and record commitments are
recomputed. The viewer refuses regressing observed heights and serves no cached
content when verification fails. `/` reads the current view, `/version/N` explicitly
reads public history, `/manifest.json` gives public commitments and `/source/N`
returns exact published HTML as `text/plain` with `nosniff`.

The visible page retains a trusted outer provenance/unverified label. HTML is
escaped into an empty-sandbox `srcdoc` frame. Restrictive HTTP CSP blocks scripts,
forms, external images/resources and nested external frames; the source route
never serves raw HTML as active markup. This intentionally supports static copy,
not JavaScript applications, third-party embeds or arbitrary network tools.

The full-access account owner can upgrade underlying code. Readers independently
pin code, genesis and owner and deny a change; the current implementation does not
claim trustless protection against owner upgrades or deletion. Public blockchain
history is not an erasable private store.

## Verification

`executor/test_public_page.py` covers exact UTF-8 commitments, owner/code/network/
FINAL drift, public history, read-only behavior and markup confinement. Six JS
public-page tests cover cross-language commitments, consent, exact protocol price,
typed controls, pending metadata, original FINAL actions and wallet/account races.
The six `integration/public_page_network_guard.test.mjs` cases reject unmatched,
non-CSP, unfinished and dispatched remote requests, including different Request
objects with the same URL. Every observed remote request must either terminate
with an exact CSP failure on that same Request before routing, or fail acceptance;
all remote route-handler dispatch is rejected.

A browser `Page.request` notification is not proof of a network connection. The
separate seven-case render-only canary diagnostic observed zero physical canary
hits in six secured cases. Its deliberately unsecured positive control reached
11 canary HTTP requests despite only nine routed observations; a later guard test
still observed two CSS/prefetch connections while rejecting that control. CDP
capture was blind in that diagnostic. Routing is an observer/detector, not a
universal egress firewall; neither absent CDP events nor zero Page notifications
are claimed as proof. The policies and physical canary evidence are independent
of that harness classification.

Fresh local acceptance is saved immutably at
`.artifacts/accepted-components/1baf76585682365f991e906288aa81edc8158e378ece12c5b28968fe2426d3d7.json`
(SHA-256 matches the filename), with its original report at
`.artifacts/public-page/20261110T210315913Z-5c76b497/report.json`.
It passed fifteen checks with 25 unchanged source/build identities, nineteen actual
FINAL transactions, five public versions, two seeded owner UI signatures,
53 native Web4 views (including 36 malformed-input cases), sixteen header-free
HTTP/Chrome scenes, actual node/viewer restart and exact unknown-wallet recovery.
The maximum quote page produced a 100,386-byte wrapper. All raw record/account
amount/storage comparisons and FINAL fee rechecks passed. Owned teardown and
private-fixture removal completed; model/provider calls were zero.

An additional isolated native probe passed four exact 16 KiB HTML variants
(quotes, ampersands, apostrophes and Unicode/BOM/CRLF), each with a 128-byte title,
byte-for-byte full ABI equality, native codec lengths 0–1,024, all 4,096 table
indices and Unicode/error-order cases. It is performance/codec evidence, not live
hosting. Earlier BOM-decoder harness and maximum-gas failures remain preserved.
`node integration/public_page_e2e.mjs` durably checkpoints every FINAL/native result
before teardown. A cleanup error remains failure and cannot replace the primary
cause or produce a passing report. This evidence is local NEAR with test tokens
and seeded Node-held signing; it is not public gateway, real-wallet, hosted-worker,
Cloud/TEE or complete public business workflow acceptance.
