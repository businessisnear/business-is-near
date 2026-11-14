# NEAR-native company exit and runtime migration

Credential fields in the JSON examples intentionally contain empty strings. They are placeholders, not valid approvals: supply the real passphrase and selected record keys only through protected local input. Empty examples are rejected.


This workflow exports the complete **current storage of every explicitly selected contract** in a company portfolio. The owner signs a declaration covering all supported contract families, including families that are not associated with the company. The collector uses one FINAL block and records the network genesis, deployed code hash, reviewed WASM hash and owner or merchant identity.

Restore creates a new private workspace. Further execution reconnects the **same existing NEAR company**, after separate owner approval of a fresh worker and restricted operator authority. Restore never deploys a replacement company, imports raw storage into another chain, copies a wallet, or silently rebinds a signer.

## What completeness means

Every declaration includes these sorted families:

`app`, `appointments`, `company`, `factory`, `feed`, `knowledge`, `mail`, `outbox`, `promotion`, `public_page`, `service`, `social`, `subscriptions`.

For each family, the owner declares either `included` with its complete known contract list, or `not_associated` with an empty list. Contract accounts must be unique. Exactly one owned `company` account is required. Owned contracts must identify the signing company owner; applications use `owner_id`, subscriptions and service offers use `merchant`, and other owned families use `owner`. Feed and promotion records must point to the selected company. A public knowledge registry is declared `shared_public`; mail and factory registries can also be explicitly declared shared public. Shared public inclusion does not claim ownership of other participants' records.

The collector reads `view_state` with `prefix_base64: ""` for every selected contract. It exports all returned key/value entries, including storage absent from a convenient list view. Partial paging, missing contracts, foreign owners, unreviewed WASM, block mismatches, duplicate keys, RPC errors and oversized responses stop the operation. Nothing is silently omitted to obtain a successful export.

This is a **trusted-RPC current-state snapshot**, not an independently verified NEAR light-client proof. It does not discover every contract that an owner may have created, reconstruct deleted records, export a chain's entire transaction history, or prove an owner's declaration that no additional contracts exist. The signed declaration makes those limits reviewable. The genesis and FINAL block pins prevent silently mixing networks or storage from different blocks.

The bounded implementation accepts up to 32 selected contracts, 8 MiB of decoded storage per contract, 64 MiB in total and a 96 MiB serialized snapshot. Oversized companies fail closed and require a separately reviewed larger export implementation. Private selections are limited to 64 files, 4 MiB per file and 16 MiB in total.

## 1. Prepare a read-only owner review

Use the approved runtime release, including its reviewed `contract/build/*.wasm` assets. The collector loads a fixed family-to-template map; its CLI does not accept arbitrary replacement WASM pins. The source release and package manifest remain separate from company business data.

Create a private mode-0700 directory for request files, results and the final export receipt. Keep files mode 0600. Commands accept protected JSON on stdin so passwords and other private inputs do not appear in process arguments.

```sh
node scripts/company-exit.mjs < /absolute/private/prepare-request.json > /absolute/private/prepared.json
```

The request contains exactly:

```json
{
  "command": "prepare",
  "configuration": {
    "network": "testnet",
    "rpc_url": "https://rpc.testnet.near.org/",
    "chain_id": "testnet",
    "genesis_hash": "REVIEWED_NETWORK_GENESIS_HASH",
    "genesis_height": 0
  },
  "selection": {
    "company_id": "company.example.testnet",
    "owner_id": "owner.testnet",
    "selection_complete_ack": "ALL_KNOWN_COMPANY_CONTRACTS_DECLARED",
    "families": ["ALL_THIRTEEN_SORTED_DECLARATIONS_REQUIRED"]
  }
}
```

The abbreviated example is a schema guide, not a complete runnable declaration. An included declaration is `{"family":"company","status":"included","contracts":[{"account_id":"company.example.testnet","relationship":"owned"}]}`. An excluded declaration is `{"family":"app","status":"not_associated","contracts":[]}`. Network genesis values must come from the approved network configuration. Local sandbox RPC is restricted to numeric `127.0.0.1`; public networks use fixed approved HTTPS NEAR RPC endpoints.

The result contains an exact `charter` and a NEP-413 `challenge`. Review the company, owner, network, FINAL block, all family declarations, contract accounts and code hashes before signing.

## 2. Sign the NEP-413 charter and collect

The wallet signs the returned message, nonce and recipient using NEP-413. This is message authentication; there is no export transaction, deposit or function-call delegation. Do not substitute a transaction signature. The message commits to the exact canonical charter digest.

The wallet result has exactly `accountId`, `publicKey`, base64 `signature` and `state`. The collector checks the cryptographic signature and verifies that this key had FullAccess on the declared owner account at the same FINAL snapshot block.

```sh
node scripts/company-exit.mjs < /absolute/private/collect-request.json > /absolute/private/collected.json
```

The collection request is `{"command":"collect","configuration":...,"charter":...,"signed":...}`. The response contains `snapshot` and `snapshot_sha256`. The snapshot records complete raw storage, ownership views and explicit coverage limits. No wallet secret, operator key, API key, or worker private key is requested by this collector.

## 3. Add explicitly selected private business data

The Python exporter accepts the validated snapshot and only the private paths explicitly chosen by the owner. It does not scan the runtime directory. Allowed kinds are `document`, `media` and `record_recoveries`.

```sh
python -m executor.company_exit --root /absolute/private/export-root export < /absolute/private/export-request.json > /absolute/private/export-receipt.json
```

The exact request is:

```json
{
  "snapshot": {"COMPLETE_COLLECTED_SNAPSHOT": "required"},
  "destination": "company-exit.zip",
  "password": "",
  "selections": [
    {"path": "company-notes.txt", "kind": "document"},
    {"path": "logo.png", "kind": "media"},
    {"path": "record-recoveries.json", "kind": "record_recoveries"}
  ]
}
```

The owner-record recovery input has this exact structure:

```json
{
  "format": "proofwork-owner-record-capsules-v1",
  "company_id": "company.example.testnet",
  "records": [
    {
      "contract_id": "company.example.testnet",
      "record_id": "archived_task_id",
      "scope_hash": "LOWERCASE_64_HEX_SCOPE_HASH",
      "record_key": ""
    }
  ]
}
```

Contract IDs must occur in the selected snapshot. Record keys decrypt business records and have no signing authority. They are deliberately different from wallet, operator, provider and worker credentials. Retain all necessary owner record keys, including mission keys needed to approve a replacement worker. The exporter does not derive missing keys from a worker vault.

Every selected private file and its inventory are encrypted with AES-256-GCM. Chunk authentication binds the snapshot digest, file identity and chunk position. A random data key is wrapped by the existing owner-password envelope using PBKDF2-SHA256 with 600,000 iterations. Existing worker encryption limits remain unchanged. Private filenames do not appear as ZIP member names.

Wallet/operator/API credentials, worker vaults, signer journals, runtime configuration, secret paths, symlinks, hard links and recognizable credential material are refused. Selecting an actual credential as a document or media file does not make it business data. For a public-only export, pass `password: null` and `selections: []`.

Keep the returned **`bundle_sha256` outside the ZIP**, in a trusted receipt. Restore requires it. Authenticated encryption protects selected private content; an independent receipt also detects removal of the entire optional private section or replacement of the public archive.

## 4. Inspect and restore into a new private workspace

```sh
python -m executor.company_exit --root /absolute/private/export-root inspect < /absolute/private/inspect-request.json
python -m executor.company_exit --root /absolute/private/export-root restore < /absolute/private/restore-request.json
```

Inspect accepts `{"bundle":"company-exit.zip","password":""}` and reports metadata without printing private file contents or record keys. Restore accepts:

```json
{
  "bundle": "company-exit.zip",
  "destination": "restored-company",
  "password": "",
  "expected_sha256": "TRUSTED_BUNDLE_SHA256_FROM_EXPORT_RECEIPT"
}
```

The destination must not exist. Restore verifies all snapshot signatures, entry commitments, archive bounds, authenticated chunks and paths before publishing anything. It creates mode-0700 directories and mode-0600 files:

- `public-state/<account>.json`: every selected contract's raw current storage and ownership view.
- `business/<selected-path>`: decrypted owner-selected documents, media and record recovery capsules.
- `exit-snapshot.json` and `exit-manifest.json`: original reviewed snapshot and export metadata.
- `reconnect.json`: an **inactive** same-company migration descriptor.

An interrupted publication has no active runtime marker. Existing workspaces are never overwritten. Restore imports no raw chain state and no old signing/provider authority. Restored record keys let the owner decrypt retained archived tasks independently of the old worker vault.

## 5. Explicitly approve a fresh runtime on the same company

Install the approved runtime package on the new host. Initialize a fresh worker in the restored workspace using `python -m executor.main init --data-dir /absolute/private/restored-company/new-runtime --profile business-operations-v1`. Retain its public manifest. Do not copy the old vault, cache identity, signer journal, provider credentials or unknown in-flight requests.

Using the owner's wallet and normal NEAR account/profile controls, explicitly approve the new RSA worker public key and mission sealed key in a newer company execution profile. Archive or cancel and archive prior active work first; worker-profile rotation and reconnect verification require an empty active queue. New work is submitted only after the owner reviews the new runtime.

Create an independently controlled new NEAR operator account. The owner explicitly calls `company_set_operator({operator, expected_operator})` on the original company. This is a separate, reviewable owner transaction. The contract requires the company to be frozen, every active task archived, escrow and committed liabilities zero, no pending treasury withdrawal, and the exact previous operator address. A stale approval, invalid account, current operator or owner address is rejected. Unfreeze only after the fresh profile and scoped key are approved.

The previous host retains its own account keys, but its old address loses the company's operator-only authority immediately. No cooperation, private-key export or deletion of foreign-account keys is required. Public views and permissionless maintenance remain public. The old worker profile remains historical data and cannot approve new work for the new profile.

The new operator account's FINAL key list must contain exactly the owner's FullAccess administration key and one fresh restricted function-call key. That new key targets only the existing company, has a positive finite allowance at most 3 NEAR, and grants one explicitly selected supported method set:

| Selection | Exact permissions |
| --- | --- |
| Core (default) | `ai_complete_call`, `ai_reserve_call`, `company_archive`, `company_attest`, `company_tick` |
| Autonomy | Core plus `company_commit_plan`, `company_run_mandate` |
| Media | Core plus `ai_complete_media_call`, `ai_reserve_media_call` |
| Autonomy and media | All nine methods above |

Pass an optional sorted `input.method_names` array to select the exact expanded set. Omitting it approves only the five core methods; the collector never infers extra permissions from an existing key. Empty sets, unknown methods, duplicates, arbitrary subsets, wrong receivers and grants exceeding the finite allowance are rejected. Separate owner AI/media policies, asset-upload consent and fresh mandate/task approvals are still required; granting a method alone does not approve model spending or replay old work.

The fresh worker key and profile version must differ from the source profile. Reconnect binds both the previous and new operator addresses, verifies the company now names the new address, and requires separate current owner reapproval. Neither restore nor activation submits these owner transactions or copies old authority.

Prepare and verify the new owner message:

```sh
node scripts/company-exit.mjs < /absolute/private/prepare-reconnect-request.json > /absolute/private/reconnect-review.json
node scripts/company-exit.mjs < /absolute/private/verify-reconnect-request.json > /absolute/private/reconnect-proof.json
```

Preparation takes `command: "prepare-reconnect"`, the pinned `configuration`, full source `snapshot`, trusted `source_bundle_sha256`, and public-only `input` containing `worker_key_id`, `worker_public_key`, `operator_public_key`, `owner_admin_public_key`, optionally `method_names`. The owner signs its returned NEP-413 challenge. Verification takes `command: "verify-reconnect"`, configuration, snapshot, charter and signed result, and rechecks current FINAL owner access, code, profile, operator grant and empty queue.

Finally call `python -m executor.company_exit --root /absolute/private/export-root activate` with `{"workspace":"restored-company","proof":...,"public_worker_manifest":...}`. This writes a new `reapproved-runtime.json` once. It imports no credentials and starts no service. Configure the new restricted operator key and any new provider account separately in protected local configuration. The existing RPC gateway must continue to recheck live authority before every write; a stored ready marker is not ongoing chain authority.

## Verification

Offline checks are `python -m unittest executor.test_company_exit` and `node --test scripts/test_company_exit.mjs`. They cover signed declarations, complete storage, foreign ownership/merchant/company pointers, truncation and duplicates, encryption/tampering, safe paths, credential refusal, trusted receipt requirements, no overwrite and fresh owner reapproval.

`integration/company_exit_e2e.mjs` is the functional local-chain acceptance test. It creates archived NoAI work and a native publication, captures full declared storage at one FINAL block, exports selected encrypted business files and owner recovery keys, restores a new workspace, decrypts old history, obtains explicit fresh profile/operator approval and archives a new NoAI task on the same company while old history and publication remain unchanged. It records actual FINAL receipts and zero model calls. A successful report is written under `.artifacts/company-exit/<run>/report.json`; a failed run preserves its isolated fixture and signed intents and makes no success claim. This local proof does not demonstrate public deployment or a live NEAR AI account.

The core-grant independent-operator proof passed on 2026-11-12: `.artifacts/company-exit/20261112T170501601Z-df917e46/report.json`, SHA-256 `fcb7685171e3eb50a6163a5737504e9bfea138ab3f8c49de1139b8c26d7d5cdb`. It pinned 213 consumed source files, recorded 30 successful FINAL transactions and 8 expected FINAL guard failures, and stopped its sandbox and removed its successful synthetic fixture. The report covers zero model/provider calls.

New complete exports use `near-native-company-exit-v2` and require all thirteen family declarations, including explicit `service: not_associated` when appropriate. The service template is `native_service.wasm` and merchant authority is checked. Signed v1 twelve-family archives remain readable, inspectable and restorable as historical scope; returned metadata sets `historical_family_scope: true` and `current_family_declarations_complete: false`. They are never relabeled complete for the new service family. Fresh exports and runtime activation require a new v2 owner declaration.

The thirteen-family v2 proof with the separately selected nine-method `autonomy_media` grant passed on 2026-11-12: `.artifacts/company-exit/20261112T182028511Z-77eaa426/report.json`, SHA-256 `6b5db9693ceafeb8187588a2e9bf5686ba140de9088bf062d812c7ce3629d61d`. It checked all 213 consumed source pins before completion and retained their exact preimages separately. This run explicitly declared no associated service contract; the independent service tests exercise service-state behavior. It does not claim that an undeclared contract was discovered or migrated.
