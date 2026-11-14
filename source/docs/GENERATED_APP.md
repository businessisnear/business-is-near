# Reviewed generated native intake app

The shipped local operator service creates a fresh company, private worker/store, fixed native app and appointment service **after an explicit UI approval**. A separate owner-approved request then uses one capped local Gemma call to propose one or two ordinary public fields. Trusted code adds `booking_ref` and `intake`, validates a sorted version-one schema and binds the result to the reviewed company, app and template source/WASM hashes. The model generates schema data, not backend code or deployment authority.

This is an operator-controlled local NEAR rehearsal with seeded accounts and test tokens. One local session controls the owner, Alice and Bob roles. Origin/CSRF checks protect that local controller; they do not authenticate production tenants or a public wallet. The existing `native-app.html` public-wallet path remains separate.

## Run

Run this service from the complete repository or an independently restored company source export, after installing its included Python requirements and Node dependencies in `contract`, `executor` and `web-chain`. The executor runtime ZIP alone contains worker code and this documentation, and does not include the local operator service, sandbox harness, frontend source or all three contracts needed by the command below. The separate static-console ZIP is a compiled browser build.

Use the repository's installed Python requirements, Node dependencies and pinned local Gemma setup. The local model must match `gemma4:e2b-it-q4_K_M` and digest `b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2`, served only at numeric loopback port 11434. No Cloud account is needed for this authorized local stage.

Build `app.wasm` with `node scripts/build_native_app.mjs`, and build the frontend with `npm --prefix web-chain run build`. Do not run a shared SDK compiler concurrently with another contract build.

```sh
node scripts/generated_app_studio.mjs \
  --data-dir /absolute/private/generated-app-workspace \
  --port 5198 \
  --python /absolute/python-with-installed-requirements
```

Open `http://127.0.0.1:5198/generated-app.html?rehearsal=1`. The service binds numeric loopback and serves only the built generated-app page and public build assets. Private paths, keys, logs, configuration and recovery files are never static web roots. Keep the private directory outside the served project; the shared rehearsal-path guard enforces permitted locations.

1. Review the complete provisioning manifest, acknowledge local authority, storage and public metadata, then approve the separate modal. There is no company or worker/store before this action. The service persists the provision intent before creating accounts. It requires a healthy first stock-worker tick before reporting readiness.
2. Describe the app and supplied requirements, explicitly consent to inference, and prepare the encrypted request. Download its private task recovery and confirm it is saved before the owner approves the native task. The on-chain policy caps this service at one call; reservations are authorization estimates, not a Cloud invoice.
3. Recover the attested/archived proposal with its matching file. Pending results refuse recovery without another model call. Review the exact schema, then approve app initialization separately. In this local fixture, initialization is an owner-reviewed contract-account self-call performed by the server-held seeded key.
4. Select Alice or Bob. Review the offered slot's exact UTC time, deposit, retained booking storage and cancellation deadline, then separately approve checkout.
5. Complete the generated public fields and private intake note. Encrypt locally, download the note recovery and confirm it is saved before reviewing the record. The service checks the declared booking reference against that customer's actual booking at the same FINAL block.
6. Read the public namespace and select the record. Upload its private note recovery to decrypt locally. A revision-checked update can preserve the exact existing ciphertext or use an explicitly replaced note and new recovery.
7. As owner, review an additive schema change and exact retained migration storage, then approve batches of at most four rows. Record writes lock during migration. Existing types/defaults, values, customer namespaces, IDs, revisions and ciphertext remain unchanged. Reload or restart the service and continue from its actual cursor.

## Privacy and authority

Only `intake` is client-encrypted. Account IDs, record IDs, booking references, ordinary fields, ciphertext lengths and history are public and permanent. The fixed app contract does not encrypt or decrypt; its legacy `encryption:false` / `public_plaintext:true` markers describe public raw storage and absence of contract-side encryption. The UI distinguishes public metadata/ciphertext from the locally recovered note.

There is at most one `sealedtext` field per schema, with an empty default. Nonempty values must be canonical bounded AES-256-GCM / PBKDF2-SHA256 envelopes of at most 2048 UTF-8 bytes. The client limits the typed note to 256 UTF-8 bytes. Syntax validation cannot independently prove that arbitrary caller-supplied ciphertext was correctly encrypted; the accepted browser workflow performs real WebCrypto encryption.

A private recovery is a **bearer capability**: anyone possessing it can decrypt the matching record. It binds network, actual genesis block hash, app account/code pin, customer account, record, field and ciphertext hash, and authenticates those same values inside the encrypted note. It intentionally excludes the mutable schema hash, so additive migrations preserve recovery. Owner schema authority does not supply a customer's recovery key. Public reads require no decryption permission; foreign writes still require the original record namespace principal on chain.

The booking reference is a declared, fixed-component integration verified by the client/service at FINAL. The app contract does not perform a cross-contract booking attestation or gain payment authority. App storage reservations remain separate from booking escrow, service deposits, gas and unknown local compute costs. Account-creation backing allocations are not reported as consumed fees; the acceptance report explicitly excludes account-creation fees from its recorded controller subset.

No source or data package grants account authority, restores worker/provider keys or provisions another host automatically. Cross-account/chain relocation needs an explicit customer-reviewed privacy/binding plan; an additive schema migration within this app is not a complete platform migration. This service does not provide arbitrary backend synthesis, private metadata, deletion, production wallet authentication, hosted multi-tenant service, Cloud/TEE attestation or verified business outcomes.

## Recovery and evidence

Pending or unknown requests retain their exact UUID, reviewed intent and original hash. They are never automatically resubmitted. Provisioning is a finite multiwrite local operation; an interrupted or refused setup is retained for review rather than silently recreated. A changed source/WASM provision manifest refuses an existing private directory. The stock worker, its encrypted cache, scoped operator key and journal remain private and distinct from the deployment keys.

`integration/generated_app_e2e.mjs` exercises real native storage, checkout, five encrypted customer rows and a four-plus-one migration. Its early accepted run `c098fc8d…` proved data/migration behavior but did not establish worker health; that limitation and the later startup refusal are preserved. The current harness now asserts genuine worker readiness.

The full actual UI report `3053ced9f2bba2e4ccc0a2ab555a4cdec3439cff97a9afa9f16107bb9c9f6e29` covers 11 groups, 46 unchanged source pins, 19 recorded controller FINALs and five complete worker FINALs. It used one actual local Gemma request (500 input / 95 output tokens), then separately initialized the proposed schema, booked as Alice, encrypted/downloaded/recovered intake, performed a revision update and additive migration, restarted the actual worker/chain, and recovered the identical ciphertext again. Cache and inference count remained unchanged. Wrong keys, stale plaintext cleanup, role clearing, 390-pixel layout, zero remote requests and clean owned teardown were checked. Account-creation fees are outside that recorded subset.

Optional `PROOF_CAPTURE_ACCEPTANCE_VIDEO=1` records private acceptance footage. Context closure and completed `video.saveAs` precede browser closure and final file hashing. Recovery downloads remain under the private attempt directory and are never narrated or exported as credentials. This component proof is local; it is not public hosting or full platform-parity evidence.

The historical `3053ced9…` report pins frontend transforms and selected worker inputs, rather than the complete stock-worker import/SDK closure. Its post-migration equality is supported by actual harness/browser assertions rather than a separately retained final row object. The final-refresh harness now captures the actual project Python import closure, loaded RPC SDK dependencies, and created/updated/migrated row objects with exact ciphertext/view hashes. Do not treat an unlisted later worker change as covered by the historical receipt.

The fresh accepted report `a6305db6c20474c2080a0731147011965a1d8cccda88ba59f09b539c1c7490a5` repeats all 11 UI groups with 239 unchanged consumed source pins, including the stock-worker Python imports and RPC SDK dependencies. It retains the created, updated and migrated rows at their respective FINAL blocks; independently recomputed view hashes and the identical intake ciphertext establish preservation through the additive migration and real restart. Its one complete local Gemma call used 500 input and 95 output tokens. The 19 controller and five worker complete FINAL graphs, wrong-key and role cleanup, zero remote requests, finalized private footage and clean owned teardown remain explicit in that report. These are local bounded workflow observations, not general backend generation or public-wallet deployment evidence.
