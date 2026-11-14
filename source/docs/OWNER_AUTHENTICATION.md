# NEAR owner authentication for private media

The separate private media service authenticates a current company owner with a
NEP-413 message signature. It never receives the owner's wallet secret, signs a
transaction, calls a model or invokes a provider. The shared-token development
rehearsal remains a separate fixture and does not become tenant authentication.

The protocol follows the [final NEP-413 specification](https://github.com/near/NEPs/blob/master/neps/nep-0413.md):
the fixed tag is `2**31 + 413`, followed by Borsh message, 32-byte nonce,
recipient and optional callback URL. The Ed25519 signature covers the SHA-256 of
those bytes. A real owner full-access public key is required. A restricted worker
function-call key does not authenticate an owner. The pinned Wallet Selector's
serializer is independently compared with the Python implementation in tests.

## Boundary

`executor/wallet_auth.py` persists one-use, two-minute challenges and 15-minute
sessions in an owner-controlled private directory. Each challenge includes the
exact origin, company, account and callback, and binds a separate protected
browser cookie. A consumed signature cannot be exchanged again after restart.
Sessions store only HMACs of random bearer and CSRF tokens. Every private request
rechecks the actual FINAL account/key association, full-access permission,
company owner, configured network/genesis and contract code hash. Key revocation,
expiry, backwards time/height or identity drift denies access. This is RPC-based
authentication, not a TEE or independently verified state proof.

`NearWalletAuthority` uses only the exact official mainnet/testnet RPC, or explicit
numeric loopback in sandbox mode. The expected genesis height/hash and company
code allowlist are trusted administrator configuration. It follows no redirects,
uses no proxies and accepts no requester-selected host, code pin or filesystem
path. Failed or pruned genesis reads deny access; no public-network acceptance is
claimed from the sandbox. Only the configured companies (at most 16) are enabled.

## Private service

Run `python -m executor.private_workspace_server --config /absolute/protected/config.json`.
The configuration file and parent must be owner-controlled/private. Configuration
and data inside this repository are allowed only under `.artifacts`, which the
development server explicitly denies. Served-source paths are rejected before
creation. The exact JSON keys are:

```json
{
  "schema": 1,
  "origin": "https://business.example",
  "port": 8901,
  "data_dir": "/absolute/private/business-data",
  "authority": {
    "network": "testnet",
    "chain_id": "testnet",
    "rpc_url": "https://rpc.testnet.near.org",
    "genesis_height": 0,
    "genesis_hash": "INDEPENDENTLY_VERIFIED_GENESIS_BLOCK_HASH",
    "companies": {"company.testnet": "INDEPENDENTLY_VERIFIED_COMPANY_CODE_HASH"},
    "sandbox": false
  }
}
```

This is a schema example, not a deployable account configuration or an assertion
about the current public genesis height. Supply observed, independently reviewed
values. The example contains no credential field. The service listens only on
127.0.0.1 and expects a same-origin proxy for `/__private`; production HTTPS and
wallet redirect behavior require separate acceptance. Numeric loopback HTTP is
explicitly supported for local development. Host and Origin are exact, JSON and
images are bounded, request concurrency is bounded to eight, and responses use
`no-store`. Request bodies, signatures and cookies are not logged.

The session cookie is HttpOnly; the separate CSRF cookie is readable by the
same-origin client and has no authentication authority without the session.
Cookies use SameSite=Strict and Secure on HTTPS origins. The client sends an
explicit CSRF header, clears state on company changes, denial and logout, and
rejects late asynchronous private results. No session token is exposed in JSON,
URLs, localStorage, archives or screenshots.

The implemented private actions are media inventory, plain RGB/RGBA PNG import,
exact asset read and association with an actual approved FINAL company operation.
An actor string cannot confer authority. Each company has a distinct derived
private directory even when its owner is the same account. Requests cannot select
another directory. The service does not expose worker vaults, record keys,
credentials, arbitrary file reads, company creation or private export. Configure
the corresponding worker to use that company's `worker` directory if its
separately approved image operations must consume this media; the service does
not provision or reconfigure that worker.

## Evidence and remaining integration

- `executor.test_wallet_auth`: real signatures, independent pinned SDK bytes,
  replay/state/origin/callback, expiry including during slow verification,
  session/company/key/pin binding, private paths and hard links; synthetic chain
  snapshots are identified as synthetic.
- `executor.test_private_workspace_server`: actual loopback HTTP and files,
  signed owner login, cookies, CSRF/Origin/Host guards, distinct company media,
  revocation and startup path rejection; chain authority is synthetic here.
- `.artifacts/wallet-auth-e2e.json`: actual NEAR key association and revocation,
  real NEP-413 signatures, replay, restart, same-owner company binding and pins.
- `.artifacts/private-workspace-e2e.json`: actual NEAR plus the private HTTP media
  path, exact imported PNG, two-company isolation, service restart and actual key
  revocation. A Node client checks cookie flags; this is not a real browser/wallet
  or production TLS test. Its first attempt correctly rejected a PNG containing
  ancillary metadata; the rejection remains recorded, and only the synthetic
  fixture was replaced with authored plain pixels.

Reports pin their historical consumed source. Subsequent startup hardening and
frontend integration require affected acceptance again. The business page's
public-mode connection and real wallet callback have not yet passed acceptance.
The standalone `private-owner-client.js` and callback files are prepared; they are
not evidence of a deployed multi-tenant application or working public account.

## Main workspace media integration

A connected company owner can explicitly authenticate the private library, restore
an existing owner session, or sign out. The public wallet path lazily configures
the private client and checks the company, reviewed code pin and testnet chain
before requesting a wallet message signature. Company/account/manifest/locale
changes clear the client identity, media inventory, form values and blob preview.
A denied private request clears browser access. Clearing local UI access does not
itself revoke an otherwise valid server session; explicit sign-out, expiry and
fresh on-chain key/owner checks govern that session.

The signed challenge is literal protocol text. Interface translation never
rewrites the signed message, nonce, origin, wallet accounts or scope commitments.
A redirect callback consumes and clears its fragment. After returning, the user
reconnects the same company and owner wallet, then explicitly restores the private
session. No private session token or recovery key is put in local storage.

Authenticated media uses only the fixed private-service inventory/import/asset/
reuse routes. The server validates exact task commitments for local associations;
those associations grant no new NEAR authority. Image inference and company
archive downloads are hidden and refused in this mode. Its asset store has not
been accepted as the standard worker's image-analysis directory, and no private
export endpoint exists. The shared-token rehearsal remains separately labeled and
restricted in the UI to its configured company.

`integration/studio_private_library_component.mjs` passed in actual Chrome with
explicitly mocked authentication and media replies. It checks explicit sign-in,
restore and sign-out, adapter routing, exact preview hashing, local reuse,
literal provenance, hidden/refused image inference and export, busy-state button
restoration, and delayed-response clearing after account changes. That component
makes no signatures, model requests or external service calls. The separate NEAR
and HTTP/browser-cookie acceptance establishes the service protocol. A public
wallet, hosted TLS deployment and live user onboarding remain unverified.
