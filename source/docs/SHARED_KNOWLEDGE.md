# Consent-based public playbooks on NEAR

`contract/onchain/knowledge.ts` is an isolated native NEAR registry for manually selected, owner-approved **public, nonsecret notes**. It has no company-storage reader, worker, inference connector, model-training pipeline, payment method or external messaging connector. Publishing and consuming are independently disabled for every account by default. It does not automatically publish a company's mission, customer messages, operation scopes, reports or credentials.

On-chain plaintext is public and permanent. Never submit private business information, personal details, credentials, access links, wallet material or secrets. The opt-in policy controls current eligibility in this contract; it does not encrypt public chain data or prevent someone from reading chain history. Revocation stops new eligible retrieval/adoption and makes existing adoption references currently ineligible. **Revocation is not erasure**: the archival `publication` and `publications` views deliberately preserve the published record, and chain history remains public. The component itself never trains a model; it cannot control third parties' uses of public plaintext or enforce license compliance.

The authority guarantees describe the pinned candidate code. Public deployment, account key custody, upgrade authority, provenance truth and production security require separate validation. No public deployment or real-fund action is part of this implementation.

## Consent and identity

`set_consent` authenticates `account_id` against NEAR's `predecessorAccountId`. An account may change only its own namespace. It independently sets `publication_enabled` and `adoption_enabled`; both are explicit booleans. Every consent call acknowledges the exact string `PUBLIC_NONSECRET_PERMANENT`. Enabling consent alone does not publish a note or adopt an input. Disabling publishing makes all of that account's publications ineligible while disabled; reenabling does not undo an individual version's permanent revocation. Disabling adoption makes that consumer's references ineligible while disabled.

Every `publish` is a separate signed approval with `public_nonsecret: true`, `rights_to_publish: true` and `permanent_public_ack: true`. The publisher account signs for its own namespace. There is no registry administrator that can publish, revoke or adopt on another account's behalf. This is account authentication, not proof that the publisher's factual assertions, ownership of material or license claims are true. A contract account may call for its own namespace; its own approval policy remains its responsibility.

Every `adopt` is signed by the named consumer account and sets `owner_approved: true`. Consumer approval is scoped to this registry account's input reference. It does **not** establish that this signer owns some separate company contract. A company integration must separately bind its company owner, exact operation scope, registry/network/code identity, and exact reference before scheduling work.

## Versions, provenance and hashes

Each immutable key is `(publisher_id, playbook_id, version)`. A version cannot be overwritten, including after revocation. A publication contains a title, public note content, source URI, provenance declaration and either `CC0-1.0` or `CC-BY-4.0`. A source URI is descriptive data; the registry does not fetch it. The publisher asserts rights to publish under the chosen license. Provenance is a publisher declaration rather than an attestation from the source.

`content_sha256` is lowercase SHA-256 of the exact UTF-8 content. `publication_sha256` is lowercase SHA-256 of UTF-8 JSON for this array, with ordinary JSON string escaping, no whitespace between elements, and literal Unicode:

```json
["near-public-playbook-v1", "publisher_id", "playbook_id", 1, "title", "content", "source_uri", "provenance", "license", "content_sha256"]
```

The array shown above is spaced for readability; hash the compact encoding. In JavaScript use `JSON.stringify(array)`; in Python use `json.dumps(array, ensure_ascii=False, separators=(',', ':'))`. The contract verifies both hashes before storage. The publication hash binds identity, exact version, content, source, provenance and license. Invalid Unicode surrogates are rejected.

An adoption binds a consumer-scoped `adoption_id` to the exact publisher, playbook, version and publication hash, retaining the content hash. Exact replays and conflicting IDs both fail without accepting another storage contribution. Inspect a submitted version/adoption ID and its exact FINAL transaction status after an ambiguous wallet/RPC response; do not blindly sign another paid mutation. Revocation is idempotent and takes no deposit.

## Bounded storage and money

Quotes charge an explicit fixed storage reservation at NEAR's current `storageByteCost`, rather than claiming to measure actual lifetime bytes or gas. A first account profile reserves 4,096 bytes; each publication reserves 16,384; each adoption reserves 4,096. Updating an existing consent profile quotes zero deposit. Mutations require the exact canonical quoted `approved_storage` string **and** the exact attached deposit. Underpayment, overpayment or a different approved quote fails atomically. Storage contributions are nonrefundable, nonwithdrawable, and remain collected after opt-out/revocation. The contract exposes no transfer or withdrawal method.

The record write must fit its bounded reservation. Class indices and bounded updates are covered by the conservative record reservations and a separately checked 65,536-byte deployment/gas cushion. The account must already have sufficient deployment backing; a failed storage/backing assertion reverts the call. Attached storage contributions are not sales, provider charges, revenue, worker rewards or profit. Gas is paid separately by the transaction signer. Default account funding in the integration is sandbox setup rather than business earnings.

Limits are permanent and not reset by revocation: 64 account profiles, 256 publications, 256 adoptions, at most 32 publications and 32 adoptions per account. IDs are 1–32 lowercase letters/digits/`_`/`-`, begin with a letter, and reject reserved prototype names. Versions are integers 1–32. UTF-8 maxima are 128 bytes for title, 4,096 for content, 256 for source URI and 512 for provenance. Pagination permits 1–20 records per page. These limits are an intentionally small registry candidate, with no Sybil resistance or fair-allocation guarantee; another account can consume remaining global capacity.

## ABI

All storage amounts and timestamps are decimal strings. Timestamps are chain nanoseconds. `ref` below means `{publisher_id, playbook_id, version, publication_sha256}`. `publication` means the ten immutable fields described above.

| Method | Authorization and result |
| --- | --- |
| `init({})` | One-time initialization with separate deployment backing; creates no opt-ins. |
| `consent({account_id})` | View of named account flags/counts; unknown accounts return both flags false. |
| `consent_quote({account_id})` | View of profile existence/capacity, exact storage contribution, reserved bytes and byte cost. |
| `set_consent({account_id,publication_enabled,adoption_enabled,acknowledgement,approved_storage})` + exact quote | Only that account. Creates/updates consent; exact acknowledgement required even for disabling. |
| `publication_quote(publication)` | Validates hashes/bounds; reports opt-in, immutable-version availability, capacity and exact reservation charge. |
| `publish({publication,public_nonsecret,rights_to_publish,permanent_public_ack,approved_storage})` + exact quote | Only publisher with publication consent; all three acknowledgements true. Stores immutable public record. |
| `publication({publisher_id,playbook_id,version})` | **Archival** public record including content and revocation flag, or null. |
| `publications({publisher_id,from_index?,limit?})` | Paginated archival public records, including revoked records. |
| `revoke_publication(ref)` | Only publisher, exact existing hash; irreversible eligibility revocation. Returns `plaintext_erased:false`. |
| `eligible_publication({consumer_id,...ref})` | Policy view of named consumer; returns content only when both relevant consents are enabled, hash matches, and version is unrevoked. This is not authenticated/private access control. |
| `adoption_quote({consumer_id,adoption_id,...ref})` | Current eligibility, ID availability, capacity and exact reservation charge. |
| `adopt({consumer_id,adoption_id,...ref,owner_approved,approved_storage})` + exact quote | Only named consumer with adoption consent; current exact eligible version; explicit owner approval. Stores an input adoption, performs no operation. |
| `adoption({consumer_id,adoption_id})` | Durable exact adoption plus current eligibility and false operation/payment/tool-authority markers. |
| `operation_reference({consumer_id,adoption_id})` | Currently eligible exact typed reference. Throws on revoked/disabled/missing reference. Declares untrusted data, separate operation approval, and no operation/payment/tool authority. |
| `state({})` | Counts/limits, storage accounting, policy markers and current byte cost/usage. |

`operation_reference` returns profile `near-public-playbook-reference-v1`, the registry account, consumer/adoption IDs, exact publisher/playbook/version/publication hash/content hash and original adoption timestamp. A reference is source identity, not a tool instruction, credential, executed-task record or completed-operation attestation.

## Read-only proposal and resolution helper

`executor/knowledge.py` provides `prepare_publication` to create an unsigned bounded proposal and `resolve_operation_input` to check an already-adopted exact reference through caller-supplied FINAL view reads. The helper contains no provider, wallet, vault, company-storage, inference, filesystem, signing or tool connector. It is deliberately not wired into the frozen browser, worker, RPC method allowlist or existing operation schema.

Resolution requires explicit owner approval to read this operation input, a known registry account and named consumer. The caller must already pin the network, endpoint, deployed code identity and finalized-read boundary; this pure helper cannot authenticate arbitrary RPC responses. It rereads the exact adoption reference and current eligible publication, verifies content/provenance/license hashes and returns typed **untrusted public data**. Extra fields, an authority/completion flag, principal substitution, changed version/hash, malformed UTF-8, revoked/disabled input or bad provenance hash fail closed.

Views and later company execution are not atomic. Consent or revocation can change after a successful read. A future integration must revalidate immediately before separately approving or consuming an operation input, and decide how to handle changes after dispatch. Current adoption does not issue a company operation, worker payment, inference reservation, tool grant or task completion. No behavior in an adopted note may override owner policy or a connector allowlist.

## Build and isolated verification

From `contract/`, build only this isolated artifact with the installed native SDK/compiler setup:

```sh
node_modules/.bin/near-sdk-js build onchain/knowledge.ts build/knowledge.wasm
```

Then from the project root:

```sh
python3 -m unittest executor.test_knowledge -v
node integration/knowledge_e2e.mjs
```

The native SDK uses shared transient `contract/build/code.h`, `builder.c` and `methods.h`; avoid concurrent contract compilation. This build never deploys publicly and does not rebuild the company or appointments artifact. The local integration starts its own private temporary NEAR sandbox, deploys the isolated WASM, uses newly seeded accounts and test tokens, records successful complete FINAL transaction/receipt traces using the existing validator, stops its sandbox and removes its own fixture. It never reads, logs or exports real wallet/provider/vault material. Sandbox-generated keys remain private inside the temporary fixture and are removed during teardown.

Evidence is written only after successful assertions and sandbox teardown to `.artifacts/knowledge-e2e.json`. It includes exact source/build hashes, deployed code hash, all successful FINAL traces, expected rejection labels, final storage accounting and explicit scope limitations. Tests cover default isolation, foreign namespace writes, explicit public/consumer consent, under/overpayment, source/provenance/license tampering, immutable-version and adoption hash conflicts/replays, publisher/consumer opt-out, revocation with archival plaintext preserved, no operation/payment/tool authority, actual 32-publication and 32-adoption account-capacity exhaustion and pagination. The eight helper tests cover exact resolution, owner approval, identity/schema/authority substitution, hash binding, revocation/opt-out, changed references, tampering and UTF-8 bounds.

Global 64/256/256 limits are enforced by contract guards but the integration exhausts the per-account limits rather than allocating every global record. It does not demonstrate a public network, honest provenance, license enforcement, model training, a completed business operation or production custody. No inference or external message is issued by this workflow.

The completed 10 November local run passed all 10 contract boundary groups, recording 73 successful FINAL transaction traces and 38 expected rejected signed calls. Final state has two explicit account profiles, 32 permanent publications, 32 adoption records and exactly `6635520000000000000000000` yoctoNEAR (6.63552 sandbox NEAR) of retained storage contributions. Business revenue, requested payment transfers and model calls are zero. The sandbox stopped and its temporary fixture was removed before successful evidence export. The eight helper tests also pass, and independent Python/JavaScript compact-JSON hashing agrees for accented text, emoji, U+2028 and newline characters.

The 553,784-byte `knowledge.wasm` SHA-256 is `7897fc3fea5ec8ffd69a0f52a248f81eafbe50e48a42f64cb1c9cf54704c21eb`; independently encoding that digest as base58 matches the observed deployed code hash `97kLjvWex58it3gBwucmkd1BXWcoRTwrekeGBXGS88nv`. Evidence SHA-256 is `cc9bc03af20ff1ecbf6bb7e092f1eb22c15326b06313670b0666874c136c1067`. Its source hash for `contract/onchain/knowledge.ts` is `93a5352582a0dd62c22173b5afac22f1a9600230fde4b95b0349361c0450e8aa`.
