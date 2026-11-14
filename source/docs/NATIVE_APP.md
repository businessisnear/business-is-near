# Bounded native NEAR public app template

`contract/onchain/app.ts` is a real NEAR backend for owner-approved typed public records. It is a fixed template, not an arbitrary generated backend, database server, dependency installer, or claim of a complete public business workflow. `scripts/build_native_app.mjs` builds only `contract/build/app.wasm` and never deploys it. No cloud account or model is used by this component.

NEAR's predecessor account is the login principal. Every write requires that principal to match the record's account namespace, including writes by the app owner. The immutable `owner_id` controls only schema migrations. Initialization requires a contract-account self-call with an explicit reviewed owner, exact schema hash, and public acknowledgement; a first caller cannot seize initialization. There is no owner setter, financial field, withdrawal, checkout, arbitrary call, contract upgrade, code execution, or deletion method. As on other NEAR deployments, the holder of the deployment account's full-access key can replace the WASM outside this ABI; source and deployed-code pins matter. Production key custody is separate work.

All raw record values, historical transactions and schemas are public chain data. `PUBLIC_NONSECRET_PERMANENT` remains required on initialization, creation, updates and schema migration approval. Namespace checks authorize writes; they do not hide reads or history. The optional `sealedtext` scalar accepts a bounded client-prepared ciphertext envelope, not plaintext private data. The contract never encrypts/decrypts and provides no metadata privacy or erasure. Never put secrets in ordinary fields. The separate [generated intake workflow](GENERATED_APP.md) performs real client encryption, separate customer checkout and recovery.

## Schema and limits

A schema is exactly `{version, fields}`. Each field is exactly `{name, type, default}`. Fields must be unique and sorted by name, with 1–8 fields. Names use `[a-z][a-z0-9_]{0,23}` and exclude protected authentication, financial, storage, and record metadata names/tokens. Metadata lives outside user data and cannot be changed by a schema.

Supported types are `shortstring` (at most 128 UTF-8 bytes, valid Unicode, no controls), `int` (an integer within ±1,000,000,000), `bool` (an actual boolean), and `sealedtext`. At most one sealed field is allowed, with an empty schema default; nonempty values must be canonical AES-256-GCM/PBKDF2-SHA256 envelopes within 2048 UTF-8 bytes. The generated workflow limits client plaintext to 256 UTF-8 bytes. On-chain syntax checks do not prove that arbitrary callers encrypted correctly. Values/defaults are checked on chain, all fields are required for creation/replacement, and extra fields are rejected. No arbitrary object/blob, URL executor, nested collection or dependency field exists.

The exact schema hash is lowercase SHA-256 of UTF-8 compact JSON:

```text
["near-native-public-app-schema-v1",version,[[name,type,default],...]]
```

The persistent limits are 16 principals, 64 rows total, and 8 rows per principal. Record IDs use `[a-z][a-z0-9_-]{0,31}` and exclude protected IDs. A principal can use the same record ID as another principal. Updates require the current schema hash and exact record revision. Pagination returns at most 8 rows.

Schema versions are bounded to 1–32. Initial version is 1, each accepted migration increments exactly one, and every migration must add at least one field without changing any old field, type, or default. The eight-field limit therefore permits at most seven migrations. The bounded journal retains only the latest migration; old transactions remain public chain history.

## Actual NEAR ABI

| Method | Role and behavior |
| --- | --- |
| `init({owner_id,schema,approved_schema_hash,public_nonsecret_ack})` | Contract-account self-call only; explicit immutable schema-review owner; version 1. |
| `schema_info()` | Exact schema/hash, immutable owner, public-data flags, migration status. |
| `record_quote({account_id,record_id,data,schema_hash})` | Validates typed data; returns availability, lock state and exact retained storage charge. Does not reserve a row. |
| `create_record({account_id,record_id,data,schema_hash,approved_storage,public_nonsecret_ack})` | Principal only, exact fresh quote and attached deposit, unique row ID. |
| `update_record({account_id,record_id,data,schema_hash,expected_revision,approved_storage,public_nonsecret_ack})` | Principal only; full typed replacement with revision check; approved storage `"0"`, attached deposit zero. |
| `get_record({account_id,record_id})` | Public row, including its actual schema hash/version and revision. |
| `list_records({account_id,from_index,limit})` | Public bounded page and migration status. |
| `migration_quote({schema})` | Validates safe additive target; returns exact target hash, migration ID, row count and retained owner storage charge. |
| `begin_migration({schema,expected_schema_hash,approved_schema_hash,migration_id,owner_approved,approved_storage,public_nonsecret_ack})` | Immutable owner only; exact hash, ID, explicit approval, current quote, exact attached deposit; locks record writes. |
| `migrate_batch({migration_id,expected_cursor,limit})` | Immutable owner only; zero deposit, at most four rows, persistent expected cursor; retry is idempotent. |
| `migration_status()` / `state()` | Persistent progress and storage/public-data invariants. |

Method names and payable behavior are fixed by reviewed WASM. User/model text is never treated as an ABI method, signer, payer, shell command, dependency, or contract source.

## Retained storage and money

Quotes reserve 8,192 bytes per permanent row plus 2,048 bytes for a new principal, at the chain's current byte cost. A migration reserves 8,192 owner-paid bytes for bounded schema/journal state. Row reservations cover the maximum future eight-field row, including additive default expansion. These are exact quoted charges for fixed storage reservations, not refunds based on later measured byte deltas. They are retained, nonrefundable, nonwithdrawable, and never business revenue. Gas is additional. Updates and migration batches require no attached funds.

The template enforces deployment backing against actual storage usage plus a 65,536-byte cushion. It exposes record and migration storage totals separately. Business revenue stays zero. It sends no transfers. Retained/nonwithdrawable describes this reviewed ABI: the local deployment fixture retains a full-access contract-account key that can sign native account transfers or replace WASM outside the ABI, and production key custody is not demonstrated. The appointment escrow/payment contract remains separate; this template gains no payment authority. The generated-app workflow composes actual checkout and a declared booking reference checked at FINAL by the client/local service; it is not an on-chain cross-contract booking attestation.

## Owner-approved real migration

A migration ID hashes compact JSON `["near-native-public-app-migration-v1",from_hash,to_hash,row_count]`. A new row between quote and approval changes the ID and invalidates the old approval. Unsupported types, protected fields, removals, renames, default changes, type changes, version rollback/skips, foreign callers, wrong hashes, and wrong storage deposits fail before migration state is written.

`begin_migration` stores the exact approved target and locks every record write. Each batch atomically fills only new defaults and advances the on-chain cursor. IDs, principal ownership, existing values, revisions, and storage-money totals are preserved. A transaction failure rolls back that batch. If the client or node stops between committed batches, the next client reads `migration_status`; no off-chain cursor is authoritative. A repeated earlier cursor returns duplicate progress without migrating more rows. A future cursor, wrong migration ID, or batch size above four is rejected. The last batch commits the target schema and unlocks writes. Subsequent writes require the new schema and all its fields.

During a migration, public reads remain available. Rows already migrated report the target hash; remaining rows report the old hash, and `schema_info` remains at the old committed schema until the last batch. Clients must show migration status and the actual row hash during this interval. There is no rollback or destructive migration API.

## Unsigned local preparation

`executor/app_schema.py` provides deterministic `prepare_schema`, `prepare_migration`, `prepare_review`, and `prepare_source_bundle`. Its canonical hash is cross-checked against the deployed WASM in the sandbox acceptance. It performs no inference, networking, deployment, signing, dependency installation, or command execution.

The source bundle contains a static form and manifest with exact schema hash, fixed NEAR ABI/source paths, and caller-supplied trusted SHA-256 pins for the actual template source/WASM. The form treats defaults as inert text and prepares only an unsigned `record_quote` request. It does not connect a wallet or submit a transaction. Its manifest explicitly says `ai_generated: false`. An integrating caller must obtain source/WASM pins from the trusted built files, obtain the live chain quote, and provide a separately approved wallet flow. This helper alone does not demonstrate model-driven selection, a connected product UI, public deployment or arbitrary backend generation. The separate generated-app workflow now demonstrates one real model-proposed typed schema with distinct owner initialization and customer approvals; backend code stays fixed.

## Verification

```sh
node scripts/build_native_app.mjs
python3 -m unittest executor.test_app_schema
node integration/native_app_e2e.mjs
node integration/native_app_crash_e2e.mjs
```

The integration runs actual WASM on a private persistent `near-workspaces` sandbox. It checks explicit immutable-owner initialization, actual principal creation/read/update, foreign and owner cross-namespace write denial, strict types/hashes/IDs, exact retained charges, bounded actual accounts/rows, and a distinct fresh schema serving public records. It migrates 64 persisted rows from V1 to V2 under owner approval, stops and reopens the same sandbox after a committed batch, retries the old batch, finishes from persistent progress, checks every preserved row/default, and performs functional V2 writes. It also checks malformed/destructive/foreign migration rejection and final backing/money invariants.

`.artifacts/native-app-e2e.json` records source/WASM hashes, deployed code hash, FINAL transaction/receipt traces, expected finalized failures, and exact storage totals. It contains no private fixture keys or raw account credential exports. The sandbox is stopped and the test-owned private chain/credential directory is removed on completion. Tokens are sandbox tokens; public deployment, business payments, model calls and provider fees are zero.

The separate `native_app_crash_e2e.mjs` companion deliberately kills a real controller subprocess with `SIGKILL` after its migration batch is FINAL and before any client cursor checkpoint. A new client reads the committed cursor from chain, retries the stale batch without advancing, continues the remaining batches, verifies preserved rows and performs a functional V2 update. `.artifacts/native-app-crash-e2e.json` keeps its own source pins, actual termination signal and FINAL traces. This hard controller crash is distinct from the clean node restart in the main 64-row proof. The companion also checks that the deployed base58 code hash exactly matches the pinned WASM SHA-256.
