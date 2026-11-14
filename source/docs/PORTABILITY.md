# Private company export, restore and media

These modules implement real local file workflows. A company export copies only an explicit selection of code, business data, history, conversations, evidence and media. Every payload has a SHA-256 identity. Restore validates the entire bundle before creating a fresh private destination, then independently verifies the restored bytes. It never installs dependencies, runs restored code, imports keys, contacts a provider or provisions a public company.

The local acceptance test exports all six file categories, deletes the original company directory, runs the restored application using Python's standard library, edits the restored source and observes the changed output. This demonstrates an independently editable local application. It does not demonstrate recovery of a hosted company, a production database, public DNS or external accounts.

## Export an explicit business selection

Create a private directory for the output and prepare a selection JSON:

```json
[
  {"path":"app.py","kind":"code"},
  {"path":"data/company.json","kind":"data"},
  {"path":"data/history.json","kind":"history"},
  {"path":"data/conversations.json","kind":"conversation"},
  {"path":"data/evidence.json","kind":"evidence"},
  {"path":"public/logo.png","kind":"media"}
]
```

```sh
python -m executor.portability export --root /absolute/company --company-id company.near --selection-file /private/selection.json --output /absolute/private/exports/company.zip
python -m executor.portability inspect --bundle /absolute/private/exports/company.zip
python -m executor.portability restore --bundle /absolute/private/exports/company.zip --destination /absolute/private/restored-company
```

The output parent must already be owner-controlled and mode 0700. The destination ZIP and restored files are created privately without overwriting existing paths. Restore refuses an existing destination, even when it is empty. A local I/O interruption preserves its private destination with an `incomplete` restore marker for inspection; it is not presented as a completed restore. A completed restore has `.proofwork-restore.json` with the bundle identity and remaining external service requirements.

Optional `--metadata-file` supplies bounded company metadata. `--required-services-file` contains a JSON array naming any external services still required, for example `["NEAR contract account", "authorized email provider"]`. These dependencies are preserved as requirements, never falsely marked as restored. Empty requirements are appropriate only for a genuinely self-contained local artifact.

Exports use a reproducible versioned ZIP format. They include neither runtime directory sweeps nor signing/provider/vault/recovery keys. Hidden directories, known credential/runtime paths, symlinks, hard links, nonregular files, path traversal, case collisions, duplicate members and unlisted payloads are rejected. Known private-key/token bodies, credential literals, structured credential fields and duplicate JSON fields are also rejected. These filters complement explicit owner file selection; arbitrary opaque secrets cannot be reliably classified from bytes alone. Review selected plaintext business data before sharing it. Encrypted chain records remain ciphertext; retain necessary recovery material through the separate protected recovery process.

Limits are 2,048 files, 32 MiB per file, 256 MiB total and normalized ASCII relative paths up to 240 characters. Dependencies such as `node_modules` are excluded; include their public package manifest/lockfile instead. No dependency install is automatic. Hashes establish integrity, not a signature, original-owner identity, database consistency or correctness of the exported app. Stop unrelated business-data writers when a consistent multi-file snapshot is required.

## Private media library

The media library stores one immutable private blob per SHA-256 asset identity, separate import receipts, owner-supplied provenance and exact operation associations. Import IDs prevent duplicate receipt recording. Reimporting the same bytes with a distinct receipt preserves that receipt and its reported cost while deduplicating the bytes. Existing operation/role bindings cannot silently change to a different scope or asset.

Supported containers are PNG, JPEG, WebP, GIF, MP3, WAV, MP4 and PDF. Header checks establish the declared container shape; they do not decode the entire file, scan for malware, establish copyright permission or prove publication eligibility. No image/audio/video generation provider is called by this library.

Example provenance and cost files:

```json
{"origin":"owner_upload","source":"owner-approved company logo","license":"owner supplied"}
```

```json
{"status":"unknown"}
```

```sh
python -m executor.media --library /absolute/private/media import --file /private/logo.png --import-id logo_original --mime-type image/png --provenance-file /private/provenance.json --cost-file /private/cost.json
python -m executor.media --library /absolute/private/media list
```

The import response includes `asset_id`. Reuse that exact value:

```sh
python -m executor.media --library /absolute/private/media reuse --asset-id ACTUAL_SHA256 --operation-id website_1 --scope-hash ACTUAL_ENCRYPTED_SCOPE_SHA256 --role hero --import-id logo_original
python -m executor.media --library /absolute/private/media reuse --asset-id ACTUAL_SHA256 --operation-id social_1 --scope-hash ACTUAL_SECOND_SCOPE_SHA256 --role hero --import-id logo_original
python -m executor.media --library /absolute/private/media export --company-id company.near --output /absolute/private/exports/media.zip
```

These associations record local intent. They confer **no NEAR execution authorization** and do not publish an image or a social post. Before a worker uses an association, its integration must separately validate the exact owner-approved NEAR task/scope and permitted channel.

Cost must be explicitly unknown, or an exact owner-reported amount with a supporting evidence hash:

```json
{"status":"known","currency":"USD","amount":"0.0123","evidence_sha256":"64 lowercase hexadecimal characters identifying the actual receipt"}
```

The library totals USD and NEAR separately using exact decimal arithmetic and reports the number of unknown-cost imports. It never silently converts missing cost to zero, combines currencies or treats an estimated rate as a provider invoice. Evidence hashes are owner-supplied references, not independent verification of payment. Local compute cost normally remains unknown. Invoice reconciliation and provider billing integration remain separate work.

## Programmatic integration

```python
from executor.media import MediaLibrary
from executor.portability import export_company, restore_company

library = MediaLibrary('/absolute/company/media')
with library.export_snapshot('media') as media_selection:
    receipt = export_company(
        '/absolute/company', '/absolute/private/exports/company.zip',
        'company.near', [{'path': 'index.html', 'kind': 'code'}, *media_selection],
        metadata={'language': 'en'}, required_services=[])

restored = restore_company(receipt['path'], '/absolute/private/restored-company')
```

`export_snapshot` holds the cooperative media write lock while the whole-company export reads the catalog and its assets. `MediaLibrary.export()` uses that guard automatically. `export_selections()` is a listing convenience; callers must pause media writers or use the guarded context to avoid selecting an older catalog's asset list. The concurrency test verifies that a simultaneous import waits and the exported snapshot restores its original exact catalog/asset identity.

Run the focused checks with:

```sh
python -m unittest executor.test_portability -v
python scripts/demo_portability.py
```

The checks include actual restore/edit execution, deterministic export, every file category, two exact media associations, private permissions, exact reported-cost arithmetic, source/provider independence, concurrent media snapshotting, and rejection of credential material, traversal, links, collisions, ZIP tampering, unknown members and corrupted assets. This is local component evidence, not a complete public business workflow or a verified public/hosted restore.

The demonstration requires the full checkout, installed `web-chain` Playwright dependency and local Google Chrome on macOS. It exports a seeded company with all six file categories and its private media library, removes the original, restores it and starts a temporary loopback HTTP server for the restored files. Real Chrome verifies the restored quote at $25.00; an actual source edit changes it to $20.00 without the original directory or provider. The original/restored temporary directories and server are removed afterward. A private timestamped folder under `.artifacts/portability-demos/` retains the actual company ZIP, two screenshots and a source-bound JSON report. The file identifies both media associations as local records with no verified NEAR authority. No customer, publication, provider charge or public deployment is implied by this fixture.
# Local workspace interface

The loopback rehearsal's **Media & export** panel connects these components to local operator actions. Its controller checks a fixed loopback Host, an exact mandatory workspace Origin, the session token and the seeded owner actor. This is local fixture authority; it is not a production wallet signature. The local operator can select either actor; this role field is not cryptographic owner authentication or proof of isolation between real users. The production wallet interface separately offers authenticated private media import, preview and local associations through the owner-signature service, with archives and image tasks disabled there. See [OWNER_AUTHENTICATION.md](OWNER_AUTHENTICATION.md) for the independently tested boundary and remaining public-wallet/live-host acceptance limits.

The panel accepts owner-reviewed plain RGB/RGBA PNG files only: at most 1 MiB, 4096 pixels per edge and four million pixels. The server independently checks PNG chunks, CRCs, dimensions, expanded pixel bounds and filters; metadata/ancillary chunks and recognized secret patterns are refused. The original accepted bytes are stored privately at `worker/media`, named by SHA-256. Preview uses a local-session-token read followed by a private blob URL and verifies the exact byte hash and decoded dimensions. Owners must review visible image content for private information; these checks are not an image-content confidentiality guarantee. Import, preview and local associations do not call a model. Eligible PNGs of at most 256 KiB and 512 pixels per edge can enter a separate explicitly approved local Gemma observation task: save its recovery file, review its exact scope, sign, then recover only an attested result. The scope permits a caption, visible text and uncertainty; image instructions grant no authority. Local compute cost remains unknown and no Cloud inference or invoice reconciliation is claimed.

An association requires an existing import ID and an actual company task/scope hash read from one FINAL block after checking the pinned company code. It records exact local reuse and grants no new NEAR authority. Costs are explicitly unknown or owner-reported exact USD/NEAR amounts with an evidence hash; reported totals and unknown counts remain separate. Evidence hashes do not establish invoice reconciliation.

Archive selection includes actual allowlisted workspace source files and the current compiled frontend, the selected task records and encrypted evidence, one pinned FINAL chain data snapshot, the first 20 history IDs with continuation recorded, optional encrypted conversation records (first 20 messages per inbox with continuation recorded), and selected exact media/catalog associations. The manifest records source and payload hashes and exact coverage. It does not sweep the worker directory: vaults, provider/wallet keys, runtime configuration, recovery files, analysis journals, screenshots and decrypted prompts are excluded. Encrypted records travel without recovery keys and remain encrypted.

`executor/studio_workspace.py` is the bounded private adapter; `scripts/studio-local-workspace.mjs` captures one FINAL chain reference and enforces the local owner route boundary. `web-chain/src/library-ui.js` implements the panel. Restoring creates a fresh private destination and never installs dependencies, signs, imports keys or restores external services. The actual frontend source and compiled output are selected explicitly. The independent restore check installs exact pinned dependencies from the existing offline npm cache with empty user/global configuration, edits actual `src/business.js`, rebuilds, and clicks a changed company-required booking navigation guard in Chrome. It uses its own dependencies and does not link to the original service or node_modules. A fresh machine must supply those pinned dependencies separately. Restored chain bindings grant no account authority.

The optional document checkbox selects the currently inspected document by its exact raw and parser hashes, off by default. The archive contains `documents/selected-private-documents.zip` with the WHOLE selected original file, WHOLE exact extraction and typed metadata, UNENCRYPTED, plus a receipt. This exceeds the approved excerpt; protect the whole downloaded archive. It excludes unchecked documents and arbitrary parser caches. Generic company restore retains this nested data archive without running a parser. Explicit document restore requires a fresh private company store and the same company ID; it restores no worker key, configuration or authority. Current parser validation is required before a worker uses the bytes. The document transfer command and bounds are described in [DOCUMENT_INGESTION.md](DOCUMENT_INGESTION.md).

All eight frontend entries and their explicit relative dependencies are included, alongside the selected worker and contract sources/build artifacts. The bounded archive metadata refers to `source/SELECTED-SOURCE-HASHES.json` by hash and count; every individual payload is also hashed by the archive manifest. Separate knowledge, native-app, factory, outbox and public-page contract state is outside this company snapshot. Their source code does not migrate their accounts, credentials or deployments.

Focused checks are `python -m unittest executor.test_studio_workspace executor.test_portability executor.test_document_transfer`, `node --test scripts/test_studio_local_workspace.mjs scripts/test_studio_documents.mjs` and `node integration/studio_library_component.mjs`. The last uses actual Chrome and private Python storage but explicitly mocks chain reads and makes zero inference requests. `node integration/studio_archive_roundtrip.mjs` verifies the source/dependency/rebuild/browser behavior, selected document transfer and resolution of the same approved excerpt using independent restored source; chain records are explicitly mocked and no model is called. The extended full studio acceptance uses the same roundtrip with an actual pinned FINAL snapshot, four approved model tasks (website, customer reply, image observations and one owner-menu proposal), separately signed No-AI work approval and rejection, an exact No-AI document task, private media and downloaded ciphertext.

Successful broad rehearsal cleanup normally removes its private archive, restored files, media and recovery downloads. Explicit `PROOF_STUDIO_RETAIN_FOR_VIDEO=1` retains the accepted fixture only after the studio has stopped successfully, with mode 0700, every recurring mandate paused, and the protected path and reason in the private report. Retention authorizes no additional inference or signatures. This permits recording the accepted current-source state without generating another set of model tasks.

