# Private document source ingestion

Owners can import bounded UTF-8 text, CSV and native-text PDF files into a private company workspace, inspect the exact extraction, and separately approve a specific excerpt as the source of an encrypted ordinary work task. Import and preview do not call a model or grant task, payment, publishing, contact, engineering, recurring or company-control authority.

## Exact bytes, extraction and approval

Accepted raw files contain 1 byte to 1 MiB. UTF-8 decoding is strict. Text and CSV preserve original Unicode code points, combining marks, BOM, CR, LF and CSV quoting: there is no normalization, translation, formula evaluation or reserialization. CSV is limited to 256 rows, 32 columns per row and 4096 characters per cell; all extracted text is bounded to 64 KiB. Invalid UTF-8, unreadable/empty text and unsupported controls are refused.

The UI displays text through literal DOM text nodes. It never embeds an imported PDF in a browser, executes CSV cells or treats source instructions as tools. Owners choose a half-open `[start,end)` span of at most 600 Unicode code points, explicitly approve that exact untrusted excerpt, then use the existing recovery-file-before-wallet approval flow. Original CR and LF count separately. The excerpt's original UTF-8 SHA-256 remains unchanged in the scope, result source receipt and claim review.

A new ordinary scope has exactly the existing `profile`, `operation`, `brief`, `context`, `sources`, `use_ai`, optional `locale`, and `documents`. The sole source is `{id:"document_excerpt",text:exact_selected_text}`. The extension is:

```json
{"profile":"owner-document-input-v1","company_id":"company.test.near","asset_sha256":"<raw SHA-256>","extraction_sha256":"<whole extracted text SHA-256>","format":"utf8-text-v1","parser_sha256":"<observed parser identity SHA-256>","selection":{"start":0,"end":80}}
```

Supported formats are `utf8-text-v1`, `csv-v1`, and `pdf-native-v1`. Supported work types are research summary, website draft, content/support/outreach/social/advertising draft and analytics report. Every task requires its own owner approval. Documents cannot combine with mandates, customer inbox, goal graphs, conversation control, media analysis, knowledge adoption, engineering or lead discovery. The full worker-serialized request retains the 2700-byte limit and the encrypted result retains the 6000-byte limit. Missing `documents` leaves legacy byte shapes unchanged. English/Spanish is optional and fixed at approval; original source data stays literal.

`use_ai:false` produces a source extract without a model. Optional inference requires its separate checkbox, current FINAL owner policy and existing worker limits; this form cannot increase those limits. The acceptance fixtures deliberately use no inference.

## Private storage and worker association

The worker uses only `worker_dir/documents/SHA256(company_id)`. Each store has an immutable company binding, content-addressed raw bytes and extraction files, and typed parser metadata. Requests and encrypted scopes never supply filesystem paths. Directories must be canonical, nonsymlink and owner private (0700); regular files must be owner private (0600), bounded, singly linked and stable while reading. Stored raw bytes and extractions are private local plaintext, as with the existing media store; no at-rest encryption claim is made.

The worker reopens the exact private source, hashes its raw bytes, re-extracts with the current parser, checks the whole extraction and selected offsets, and compares the excerpt byte for byte before work. It repeats source/receipt validation before attesting cached evidence. Missing source files defer that task for owner review and let unrelated tasks proceed. Hash, company or parser drift is fatal and preserves the existing encrypted cache. Restoring the exact approved bytes does not create new authority. Restart never rewrites an already cached result or calls a model to reconstruct it.

Importing into a public authenticated private workspace does **not** provision an operator worker. Those endpoints always report `task_prepare_ready:false`, `worker_binding:null`; their public configuration advertises `document_worker_associated:false` and `document_tasks:false`. Document task submission and inference remain disabled there. Existing keys copied into a workspace alone do not establish association.

The seeded local studio may pass the trusted CLI flag `--worker-associated` with the actual fixed directory used by its current worker configuration. The adapter then requires an already existing protected RSA-4096 worker key and returns its public identity. It never creates a vault or accepts a request-provided association flag/path. Before preparation, the UI compares this key to the connected company's current manifest and FINAL execution profile/code/owner. A different key, unconfigured directory or revoked private owner identity disables preparation. The seeded local actor remains a rehearsal authority, not public wallet authentication.

## Native PDF boundary

PDF extraction uses installed local `pdfinfo` and `pdftotext`, with their observed executable hashes and version strings, Python/parser source identity, native helper hash and resource policy committed into `parser_sha256`. It accepts one to eight unencrypted pages and at most 64 KiB readable extracted UTF-8. PDF text is clearly labelled **native extracted text**, not an original raw-PDF byte quotation, OCR, image analysis, fact verification or a guarantee of visual reading order. Scanned PDFs without native text and unsupported/encrypted/malformed/over-limit files fail without fallback. Embedded actions, scripts, links, forms, attachments and images are never executed or opened by this workflow.

Native tools run through a fixed no-shell child exec helper in a private temporary directory with no inherited application secrets. CPU is limited to 3 seconds (hard 4), wall time to 8 seconds, open descriptors to 32, file writes to 2 MiB, stdout to 64 KiB (metadata/version checks use smaller bounds), and stderr to 8 KiB. Linux additionally uses hard 512 MiB address-space/data limits. This macOS host refuses DATA/AS/RSS `setrlimit` calls; its parent instead samples the retained child's resident memory every 100 ms and kills the process group if it exceeds 512 MiB or cannot be measured. This sampled budget is not a hard allocation limit. Parser identity records this distinction. Missing native tools or failed enforcement refuses extraction; there is no Cloud, OCR or model fallback. Native binary/version pinning is an observed local identity, not a TEE or whole operating-system attestation.

A synthetic positive PDF fixture was rendered with `pdftoppm` and visually checked for legibility; parser tests also exercise malformed PDFs, nine-page refusal and output limits. These are test inputs, not user documents or independently verified business facts.

## Receipt and offline recovery

New results carry `document_receipt` only when the exact document extension was approved. Its exact fields are `profile:"owner-document-receipt-v1"`, `scope_sha256`, `company_id`, `asset_sha256`, `extraction_sha256`, `parser_sha256`, `format`, `selection`, `excerpt_sha256`, `untrusted_data:true`, `authority:false`, `training:false`, `network_reads:0`. Standard artifact, generation, source hash, language and unverified claim-review fields remain required. A receipt cannot establish business truth, identity, consent, training permission or external execution.

JS and CLI recovery require the connected company context, matching private record key and exact immutable ciphertext/hash. Recovery checks receipt consistency and source hashes without needing local raw files or rerunning a parser. The operator's live source revalidation is a separate boundary. No document receipt is accepted on an ordinary legacy task. CR is permitted only for document excerpt/artifact item text; request, context, title, summary and ordinary operation guards retain their existing restrictions. Claim review commits original characters rather than normalizing line endings.

## Modules and API

- `executor/document_store.py`: fixed private store, exact extraction, observed parser identity; `document_native.py`: bounded native exec helper.
- `executor/document_input.py`: scope/source/receipt validation, trusted local import/preview API and CLI; narrow dispatch/export integration in `operations.py` and `operations_cli.py`.
- `executor/private_workspace_server.py`: authenticated company document import/preview routes with worker association always false.
- `web-chain/src/document-input.js`: `validateDocumentScope`, `validateDocumentSource`, `validateDocumentPreview`, `documentScope`, `prepareDocument(scope,manifest,id,version,companyId)`, `validateDocumentEvidence(payload,scope,scopeHash,companyId)`.
- `web-chain/src/document-ui.js`: `createDocumentUI({getState,local,stage,notice,requireCompany,invalidateDraft,lockControl,setControlDisabled,readTask,mount})`, returning `update()` and `clear()`; fixed Spanish templates are in `document-messages.js`.

Private API import takes exactly `{document_base64,format}`; preview takes exactly `{asset_sha256,format,parser_sha256}`. The company comes from captured authenticated/controller context. Responses are `{profile:"document-preview-v1",company_id,metadata,text,task_prepare_ready,worker_binding}`. Paths and private keys are never returned. Cpy owns main/studio/private-client wiring and lifecycle/source-export integration; importing modules alone does not prove end-to-end UI provisioning.

All plaintext forms, preview text, selections and transient file/recovery references stay in memory and clear on account, company, language, manifest/profile/pin, external epoch, private logout or authenticated key/network identity changes. Async guards follow every awaited file read, hash, private response, FINAL read and encryption before state changes or staging; stale callbacks cannot restore plaintext. There is no browser storage.

## Acceptance

Focused offline checks cover real local file/native parser behavior, exact Unicode/CRLF/BOM/CSV/native-PDF hashes, company and key binding, unsafe files and symlinks, parser drift, typed receipts, wrong offsets, ordinary CR rejection, disabled public worker association, encrypted cache restart and source drift before attestation. JavaScript uses actual RSA/AES crypto and Python-produced fixtures for all three formats.

`integration/documents_e2e.mjs` and `documents_worker.py` are the separate zero-model actual NEAR acceptance. `web-chain/tests/browser/document-component.mjs` uses actual Chrome and real File/crypto handling with explicitly synthetic private API/NEAR identities and actual pre-extracted native PDF fixture bytes. Neither claims paid search, provider accounts, live business facts, OCR or outreach.

Current acceptance completed on 2026-11-10:

- Focused Python: 27 passing tests across document input/HTTP/runtime, ordinary operations and claim review; the final three runtime cache tests passed again after adding the explicit 6000-byte encrypted document guard. Focused document JavaScript: six passing helper/UI tests.
- Actual private NEAR sandbox attempt `8b2ff954-83ab-4672-aaa6-620e18428058`: all 14 recorded checks passed on the first run. UTF-8, CSV and native PDF used separate actual owner approvals and recovery keys. Every format restarted from identical cached ciphertext; an explicitly injected raw-byte mismatch was rejected before attestation, without rewriting that cache. The fixture restored the exact original synthetic bytes before continuing the same approved task. Wrong-key decryption, wrong-company offline export, operator authorization and unsolicited receipt checks passed. Model/provider/source-network/message counts were zero. The owned workers and chain stopped and the successful private fixture was removed.
- Chain report `.artifacts/documents-evidence.json` SHA-256: `a394addc8e47024c0902b344b283b9fc02f2ec827fd685e416fa0f69d4c87c02`. The report records observed parser executable/version/helper identities and the macOS sampled-RSS memory boundary.
- Actual Chrome production-bundle component: eight passing groups, zero page errors or external requests, zero models/signatures/external RPC. It proves real File bytes, actual crypto, exact Unicode/BOM/CRLF approval, explicit excerpt consent, CSV/native-PDF presentation, disabled public/no-worker and mismatched-key task/inference controls, authenticated key/logout/account/company/language/manifest/epoch clearing, an actually delayed private response that cannot restore old plaintext, forged-preview rejection, and Spanish labels at 390px.
- Component report `.artifacts/document-ui-component.json` SHA-256: `240d61fc3edd54caf7cc6e33b6746517add0b64220cbe2b9d4868df372f52d5f`. It pins every consumed Vite source module, emitted bundle identities and synthetic fixture hash. Its private API and chain identities are explicitly synthetic; main application integration and actual owner authentication retain their separate acceptance receipts.

Run focused checks with `.artifacts/venv/bin/python -m unittest executor.test_document_input executor.test_document_http executor.test_document_runtime executor.test_operations executor.test_claims -q`, `node --test web-chain/tests/document-input.test.mjs web-chain/tests/document-ui.test.mjs`, and `node web-chain/tests/browser/document-component.mjs`. In a source-stable available sandbox window, `PROOF_DOCUMENTS_SANDBOX=1 node integration/documents_e2e.mjs` runs the separate actual chain acceptance without any model/provider key or SDK build.

## Explicit selected-document transfer

The original company export did not preserve the private document store. That omission is now addressed by the optional, default-off document selection in the local company export. The checkbox includes the **whole original private document, whole extraction and metadata, unencrypted**, rather than only the approved 600-character excerpt. It identifies the exact selected hashes. Existing callers without `document_refs` select no documents.

`executor/document_transfer.py` exports at most eight exact `{asset_sha256,format,parser_sha256}` references from the fixed company store. The company ZIP retains their data-only bundle at `data/documents/selected-private-documents.zip`. Its deterministic uncompressed ZIP is bounded to 10 MiB and contains only selected raw bytes, exact extraction text, typed observed parser metadata, the company binding and a strict manifest. Every name is derived from a checked hash. No wallet, vault, key, configuration or worker/runtime source tree is swept into the archive. Imported document text remains data even if it contains a code example. Unknown paths, duplicate entries/references, symlinks, compression, hidden/trailing data, hash/size/type changes and wrong-company input are refused. Source export revalidates the live fixed store before packaging.

Known private-key/provider-token signatures, structured credential fields, recognized credential CSV columns (including BOM-prefixed headers) and credential-labelled text are refused in raw bytes, extraction, metadata and manifest. Arbitrary opaque secrets cannot universally be classified from text. `credentials_included:false` means this transfer imported no wallet/vault/config credential sources and passed those known-pattern checks; it is not proof that arbitrary owner-supplied business data contains no sensitive string. Owners still review the whole selected source before exporting it.

Company restore preserves the nested ZIP without executing it. `inspect_documents_archive(bytes,company_id)` validates its contents without creating files or running a parser. After separately provisioning a private worker directory, the operator may call `restore_documents(worker_dir,company_id,bytes)` or the explicit CLI:

```sh
python -m executor.document_transfer --worker-dir /absolute/private/worker \
  --company-id company.test.near --archive /absolute/private/selected-private-documents.zip restore
```

Restore validates the **entire** bundle before creating a fresh fixed company document store. Existing stores are never overwritten. It imports no signing/recovery key, worker configuration or execution authority; it never executes imported code, launches a subprocess, or parses a PDF. Failed filesystem writes retain their partial private store for inspection rather than deleting or silently overwriting it. Live worker use subsequently performs the normal exact source/current-parser validation. A different parser identity still requires explicit reimport/review; restoring a metadata snapshot never silently updates an approved scope. Cross-host key migration and worker provisioning remain separate, and no cross-host parser equivalence is claimed.

The nested document bundle is distinct from the company snapshot's encrypted records. Separate factory, Gmail/social outbox, public-page, knowledge and native-app contract state and provider/domain authority are not automatically restored by the company archive. No archive restores external services or wallet permissions.

The transfer APIs are `export_documents(worker_dir,company_id,refs)->bytes`, `inspect_documents_archive(bytes,company_id)->receipt`, and `restore_documents(worker_dir,company_id,bytes)->receipt`. The CLI offers explicit `export`, `inspect` and `restore`; request JSON never supplies worker paths. `executor/test_document_transfer.py` has four passing test groups covering all three formats, no-native/no-subprocess restore, exact source consumption, wrong-company/path/key material/duplicate/tamper/symlink/hidden-byte refusal before filesystem writes, parser drift and fresh-store protection.

The current source-pinned actual transfer acceptance is `.artifacts/document-transfer-evidence.json`, attempt `3cecb043-3e34-466c-9a8f-95f687b7fcc4`, SHA-256 `6c5637f5e2545212bfa6a2b699fe96182c9840d70d3d5a2251aaf4c67827190c`. All 16 checks passed with three separate actual owner-approved UTF-8/CSV/native-PDF tasks. Each was paused with an encrypted cache, exported, had its private source store deleted, deferred without changing cached ciphertext, restored under explicit extraction/subprocess blockers, then completed after a real worker restart with the same exact source/parser/ciphertext. Wrong-company restore wrote nothing; no keys or authority were restored. There were zero model calls, provider/source-network requests or messages. All owned processes stopped and the successful private fixture was removed.

The earlier passing transfer candidate, before the additional recognized-credential-header guard, remains immutable at `.artifacts/document-transfer-prior/62685a41570f60f8695b42a9b9bdaccaa7817221317d4553dc1f3c18020e4da9.json`; it was not relabelled as the later candidate. Run `python -m unittest executor.test_document_transfer -q` and, in an available source-stable private sandbox, `PROOF_DOCUMENT_TRANSFER_SANDBOX=1 node integration/document_transfer_e2e.mjs`. No model/provider key or SDK build is required.
