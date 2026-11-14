# Explicit Gmail delivery outbox

This is an isolated delivery code path. Existing `outreach_draft`, company,
controller, runtime, and UI operations do not invoke it. It has no dependency
installation, advertising, social posting, DNS, payee, fund-transfer, owner, or
policy-execution capability. Those adapters remain unimplemented.

The local E2E uses an **actual NEAR sandbox contract and restricted signing key**
with a **synthetic Gmail recording provider**. It sends no email and makes no
Google/OAuth HTTP request. The real HTTPS transport is implemented and tested
with mocked sockets only. No public deployment or real account enrollment was
performed. A `confirmed` receipt means an operator attested that an exact Gmail
SENT copy was verified; it does not prove recipient inbox delivery, reading,
absence of a later bounce, revenue, a TEE execution, or truthful operator behavior.

## Authority and limits

`contract/onchain/outbox.ts` is separate from the company contract. Its immutable
owner initializes one immutable operator account and exact ed25519 public key,
contract code hash, local source bundle hash, worker code hash, RSA worker key ID,
approved Gmail account profile hash, and finite daily/lifetime request caps. The
operator access key must be receiver-scoped to precisely `claim`,
`reserve_request`, and `record_receipt`, with a finite allowance. The Python/Node
bridge verifies the actual access-key permission, chain, contract code, and all
pins before work. It signs zero-deposit calls only and validates FINAL transaction
and complete receipt outcomes before issuing a provider request permit.

The owner approves each exact ciphertext hash, sealed separate record key,
expiry (at most seven days), private account profile, sender/recipient/content
commitments, and a per-intent request cap. Only these exact fields are admitted.
The plaintext is a single `near-gmail-text-v1` intent:

```json
{"schema":"near-gmail-text-v1","provider":"gmail-v1","intent_id":"approved-id","account_profile":"owner","sender":"owner@example.test","recipient":"one@example.test","subject":"Approved subject","body":"Approved plaintext body"}
```

No addresses, subject, body, token, local credential path, arbitrary URL, HTTP
method, attachment, HTML, CC, BCC, or instruction to install/execute code belongs
in a public approval. Addresses and content stay encrypted; unsalted public
commitments can still permit guessing known addresses or short content. The
intent ID, hashes, expiry, provider IDs, and operator receipts are public.
`executor.delivery.execution_manifest` derives the source/key pins from actual
local files and RSA public key. The ciphertext uses the existing interoperable
AES-256-GCM/PBKDF2 format; the record key is RSA-OAEP sealed to the worker.

Storage is a fixed finite 24,576-byte reservation, payable at the current NEAR
storage byte cost. Approval requires the exact quote and exact deposit. It is
nonrefundable and not withdrawable. The contract separately requires deployment
storage backing. There are no business cash/revenue/payable balances and no
transfer method. The on-chain reservation counter counts reserved bounded API attempts; a
reservation is consumed even if transport never occurs. It is not a fabricated
Google invoice or provider USD charge.

Daily counts use UTC chain days; lifetime counts never reset. There is no cap,
operator, key, profile, source, or owner reconfiguration method. Freeze and the
owner-only live flag do not reset counters. Owner cancellation is available only
before SEND is reserved. Terminal receipts are immutable; unknown may only become
confirmed after bounded reconciliation, never failed or resent.

## Durable requests and uncertainty

Before any provider request, the worker decrypts and validates the typed intent,
checks every commitment and credential-account/profile binding, then writes and
fsyncs an AES-GCM-encrypted private journal. For each request it durably records
the exact request hash, obtains a fresh FINAL NEAR reservation, writes `inflight`
and fsyncs again, then invokes transport. A duplicate reservation never grants
network permission. A journal lease prevents concurrent workers for the same
intent. A separate private bridge lease serializes NEAR nonces. Unknown NEAR
broadcasts remain in a durable transaction journal and block provider work until
FINAL reconciliation; signed transactions are never blindly rebroadcast.

The adapter has four fixed Gmail v1 request shapes, each reserving one unit:

1. `GET /gmail/v1/users/me/profile` verifies the actual account.
2. At most one `POST /gmail/v1/users/me/messages/send`, with one base64url RFC mail
   `raw` field, approved From/To/subject/plain body and deterministic Message-ID.
3. Unknown SEND can use one bounded `GET /messages` search by exact RFC Message-ID,
   with `maxResults=2`; zero/multiple/paginated results retain uncertainty.
4. One `GET /messages/{id}?format=raw` verifies provider message/thread IDs, SENT
   label, exact unique original headers, Message-ID, intent ID, and plaintext body.

A normal confirmed submission uses three requests; timeout reconciliation can use
four. Approved smaller caps may deliberately leave a submission unknown. An HTTP
200 object without valid IDs and the exact verified sent copy is not confirmation.
A timeout, nondefinitive status, mismatched metadata/body, exhausted verification
budget, interrupted private write/network boundary, or ambiguous outcome retains
uncertainty. There is no automatic POST retry, including after restart or loss of
private cache. GETs are bounded too: this first adapter does not poll indefinitely
or refresh provider request allowances. A transient read can therefore leave an
intent unknown for owner review.

Private owner-managed suppression and opt-out state is checked before any SEND
work and re-read immediately before SEND reservation and again after the FINAL reservation, immediately before transport. This is a local
suppression mechanism; provider webhooks, bounce processing, external opt-out
collection, and reply ingestion are not implemented.

## Default disabled and dormant live transport

Importing or constructing the default worker opens no provider connection. Running the default worker raises a disabled error before any chain or provider work.
`RecordingTransport` is explicitly synthetic. The actual private HTTPS transport
has a fixed `gmail.googleapis.com:443` TLS connection, exact method/path allowlist,
15-second timeout, bounded JSON response, and no proxy, redirect, retry, arbitrary
host, or model-controlled credential/endpoint selection. Its socket code is tested
by replacing `HTTPSConnection`; it was never executed with a real socket here.

`production_worker` is an explicit separate factory. It requires a real
`NearOutboxAuthority` configured for the fixed official mainnet/testnet RPC, an
explicit owner live configuration, protected credential/suppression files, the
on-chain owner live flag, exact actual contract/source/account pins, and a fresh
FINAL NEAR reservation carrying `live=true` for every provider request. The flag
defaults false and the contract checks it at each live reservation. This factory
is not wired into the existing executor or UI and was never activated in this session; its refusal path was tested offline.
Operator software remains a trust boundary: these checks are not an enclave or a
cryptographic proof of provider execution.

`CredentialRegistry` only accepts an absolute owner-owned regular file in a
private owner-owned directory, with no symlink traversal and no group/world
permissions. It opens with `O_NOFOLLOW`; token values never enter arguments,
exports, journals, or logs. Its exact schema is `schema: 1`, `profiles: {alias:
{provider: "gmail-v1", account, access_token, scopes}}`. The scopes are exactly
`gmail.send` plus `gmail.readonly` full Google scope URLs. A token-URI, arbitrary
host, refresh command, or extra credential field is rejected. Account aliases
must match the owner-approved profile. Suppression files use `schema: 1`,
`suppressed: [mailboxes]`, and `opted_out: [mailboxes]`, with the same file guards.
Missing/malformed suppression files fail closed.

**Live gaps:** Owner Google OAuth application enrollment and consent, obtaining
and rotating valid access tokens, and actual account/provider delivery remain
unverified. There is no implemented OAuth refresh request, no token discovery, no
Cloud account creation, no account probing, no live Google call, and no secret
search. If refresh is later implemented, its requests must also be explicitly
budgeted before transport. Google documents API enablement and OAuth consent as
prerequisites; local Gemma does not replace mailbox authorization.

## Reproduction and evidence

```sh
node scripts/build_outbox.mjs
.artifacts/venv/bin/python -m unittest executor.test_delivery -v
node integration/outbox_e2e.mjs
node integration/outbox_authority_e2e.mjs
```

SDK builds share transient `contract/build/methods.h`; coordinate builds. This
script builds only `outbox.wasm` and never deploys company/runtime artifacts.
The E2E owns and tears down its temporary local sandbox. Its public evidence is
`.artifacts/outbox-e2e.json`; direct contract-only guard evidence is also in .artifacts/outbox-authority-e2e.json. Unit/build logs are beside them. Evidence includes
exact consumed source hashes, FINAL call/receipt fees (including denied contract
calls, excluding account/key/deploy setup), exact storage contributions, zero
business money, synthetic provider call shapes, and successful node teardown.
Private record/worker/operator keys and decrypted mail are not exported.

Official API behavior references:

- [Google: create and send email](https://developers.google.com/workspace/gmail/api/guides/sending)
- [Google: messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Google: users.getProfile](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile)
- [Google: messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- [Google: messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)
- [Google: message resource and raw format](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages)
- [Google: desktop OAuth prerequisites and consent](https://developers.google.com/identity/protocols/oauth2/native-app)
