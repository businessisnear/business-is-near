# Proof / Work: wallet, contract and headless executor

This is the new architecture. A static browser signs owner/customer actions through a NEAR wallet. The company contract owns policy, escrow, commitments, revenue, storage collateral, worker profiles and encrypted records. A replaceable **headless** executor reads that state and signs only a restricted list of operator calls. It runs no application HTTP server and holds no owner or customer signing key.

The complete-project source ZIP contains the reviewed project files and tests from the local Git index, excluding private state, generated demo recovery files and dependency/build directories. It can be unpacked as the full repository source for the commands below. The executor ZIP is a portable runtime source package: install its Python requirements and `npm ci --prefix executor`, then use the private setup below. Integration tests and contract build tooling require the full repository. The static ZIP is the built console. The contract ZIP contains candidate bytes and review source, not a public deployment. `SHA256SUMS.txt` identifies the exact packages; none contains credentials or runtime state.

The complete QA workflow has been tested against a real **local NEAR sandbox** with direct RPC, actual HTTP checks and independent verification, customer-funded encrypted records, restricted signing, restart, payment, refund, reserve and freeze. Live NEAR AI responses, public testnet deployment, real wallet interaction and stake-funded hosted-instance provisioning have not been verified. Model responses in the paid-call integration test are explicitly simulated. No mainnet transaction, real staking, real payment, public publication or hosted instance was created.

The separate [business operations profile](OPERATIONS.md) adds encrypted artifacts, [recurring mandates, approved research retrieval and bounded local numeric-Python repairs](AUTONOMOUS_OPERATIONS.md), plus an [encrypted NEAR-native customer inbox](NEAR_INBOX.md). Real local Gemma 4 is an explicit sandbox development substitute while no NEAR AI account exists; its receipts never claim Cloud/TEE execution. The wallet console still covers QA; operations/inbox preparation and recovery use the CLI. Current engineering isolation is verified on macOS and fails closed on Linux. The current copied checkout has no Git index: `python scripts/package_headless.py --runtime-only` creates only the explicit executor/console/contract archives, not a full-project source archive. Earlier full-source ZIP and image claims refer to the historical release recorded in [VERIFICATION.md](VERIFICATION.md).

## One command, real receipts and an offline report

After installing dependencies and building the contract, run:

```sh
python3 scripts/demo.py
# Only if the known bundled fixture already runs on 8788:
python3 scripts/demo.py --external-fixture
# Optional explicitly synthetic model transport, never live inference:
python3 scripts/demo.py --external-fixture --synthetic-ai
```

Each run creates a fresh mode-0700 directory under ignored `.artifacts/demos/`, runs the real isolated sandbox workflow, then stops that chain. It produces `index.html`, allowlisted `evidence.json`, exact accounting/receipt checkpoints, source identities and checksums. Private per-job recovery files are separate mode-0600 files under `recovery/`; the HTML contains no recovery/signing keys. Open the HTML locally, choose a matching recovery file to decrypt actual reports in the browser, and clear decrypted reports when done. It makes no network or local-storage requests. This is a captured evidence viewer, not a running hosted company, a replay animation or real customers/funds. A failed/interrupted run never produces a PASS page. Existing output paths and the preserved original company are never reset.

The full repository is required for this command; the executor ZIP contains the portable runtime, not sandbox build/test tooling.

## Reproduce the complete demonstration

From the full repository, with Python 3.11+, Node 22+, and npm:

```sh
python3 -m pip install -r requirements.txt
cd contract
npm ci
npm run build:onchain
cd ..
node integration/headless_e2e.mjs
```

The test starts a deliberately flawed local fixture on port 8788 and creates a private temporary NEAR sandbox. If the trusted bundled fixture is already running (for example, the original local console), use:

```sh
PROOF_WORK_EXTERNAL_FIXTURE=1 node integration/headless_e2e.mjs
PROOF_WORK_EXTERNAL_FIXTURE=1 PROOF_WORK_FAKE_AI=1 node integration/headless_e2e.mjs
```

Do not use that flag for an unknown service. The normal variant has no model/provider credential. The second uses a test-only synthetic provider, real on-chain AI reservations and encrypted cache: exactly two simulated requests serve two paid jobs across a worker restart. Production `executor.main` has no fake-provider flag. Both variants test invalid-scope refund, insufficient reserve and owner freeze, and do not start the application API server. Temporary owner/customer keys belong only to the test controller; the separate worker receives only a function-call-restricted operator key.

The original already-running local demonstration is preserved separately. `scripts/preserve_local_demo.py` exports its existing deployed bytes through local read-only RPC and verifies them against the saved manifest. Its launchd service can pin that protected artifact while newer contracts are built, rather than overwriting or resetting the existing company. This does not migrate that old company into the new flow.

### Verify frontend transactions and browser behavior

```sh
cd web-chain
npm ci
npm test
npm run build
CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser
node tests/static_actions_e2e.mjs
```

Set `CHROME_EXECUTABLE` to an installed Chrome, or install Playwright Chromium as described in the console README. Build the console from the full project source because it shares the pure `executor/outcome.mjs` finalized-result validator. The resulting `dist/` is a standalone static site with relative paths; it needs no Proof / Work API or worker process to load. Browser tests mock testnet RPC and never invoke a real wallet; request-helper unit tests use a fake wallet. The final command executes the exact SDK action objects against a real local sandbox: the six-action owner batch succeeded with 240 Tgas prepaid and approximately 104.905 Tgas burnt; the customer order succeeded with 60 Tgas prepaid and approximately 22.394 Tgas burnt; the customer refund succeeded with 100 Tgas prepaid and approximately 35.583 Tgas burnt. Customer-only authorization, retained storage, refund while frozen, and refusal after acceptance or a prior refund were also checked. These are observed local measurements, not guaranteed future protocol prices or proof of real wallet compatibility.

Public demo deployment requires a compatible, initialized contract actually owned by the connected testnet wallet. No contract ID is fabricated or preselected. `contract/testnet.mjs` is a separate preparation helper; its generated full-access owner keys must never be handed to the executor. Public provisioning/deployment is not run automatically and remains subject to the owner's publication restrictions. The helper is not a production wallet-custody or key-transfer solution.

## Provision an executor without giving it the company

Use a dedicated private persistent directory. For example, create a directory outside the repository with mode 0700, then substitute its absolute path below:

```sh
python3 -m executor.main init --data-dir /absolute/private/proofwork
```

This generates an RSA-4096 delegated-record identity under `vault/` and prints only a public manifest. Save that public JSON for the owner's console to import. Its `worker_key_id` is SHA-256 of the exact SPKI PEM bytes, including its final newline. Private RSA and cache material must stay in the private volume and its independent encrypted backup. The worker can decrypt delegated data; file permissions and encryption do not protect against a compromised host.

The NEAR operator is a separate account from the contract owner. Grant its executor signing key a **FunctionCall** permission with exactly the company as receiver, a finite gas allowance, and only:

```text
approve_order,company_tick,company_attest,settle,pay,cancel,decline_order,
company_archive,ai_reserve_call,ai_complete_call
```

The key file is private mode 0600 and contains `{"account_id":"YOUR-OPERATOR.testnet","secret_key":"YOUR-RESTRICTED-KEY"}`. These are placeholders, not accounts or credentials. The gateway queries the actual access key and rejects FullAccess, wildcard methods, wrong receiver, unsupported methods, depleted/unlimited allowance, wrong chain and mismatched contract code. It does not accept owner policy, funding, customer orders or arbitrary transfers. Creating/granting the key is an owner/operator-wallet action; no production grant is performed by the test harness or installer.

Copy `executor/config.example.json` to a protected file, set mode 0600, and replace every placeholder. Testnet RPC is pinned to `https://rpc.testnet.near.org`; the verified deployed **NEAR code hash** is required. This is NEAR's encoded code identity, distinct from a hex source/archive checksum. The worker key ID must match the active execution profile. A separate explicit numeric-loopback/chain-ID configuration is supported only for sandbox tests; mainnet is refused.

Install the minimal signing dependencies with `npm ci --prefix executor`. The full development checkout can also resolve its installed contract client dependencies. Then run:

```sh
python3 -m executor.main run --config /absolute/private/proofwork/config.json
```

There is no inbound listener, owner key, customer key, marketplace wallet or autonomous permission expansion. Idle polling reads the bounded queue and makes zero model requests. Incoming orders fund their own records; the operator reviews a decrypted exact scope before calling `approve_order`, and only then can a keeper hire. After checks and a separate recheck, the executor encrypts the report, attests its hash/envelope, settles escrow, pays the fixed supplier, and archives the terminal task. The browser can be closed after wallet approval. An operator attestation is a trusted software claim, not an on-chain proof of website correctness or TEE execution.

## Owner and customer walkthrough

1. Inspect the intended contract in the static console and compare its code hash with an independent trusted build/deployment record. Connect its owner wallet. The page never asks for a seed phrase or owner private key.
2. Import the executor's public manifest. Enter the idea, goal, approved controlled-fixture URL, supplier, price, fee, reserve, spending limits, initial operating funds and separately funded account backing. Review the exact deposits, download the private company recovery file, and approve the owner batch. Mission/goal plaintext and its record key stay in the browser until encrypted/sealed; only ciphertext and a delegated-key box go on-chain.
3. A customer reads the quote, confirms authorization for the fixed target, downloads a private per-job recovery file, and approves one atomic `company_order`. The contract binds each approved quote component and worker-profile version; changed terms reject atomically. Service price is escrow, not available cash or revenue. The task begins `pending_review`.
4. The worker executes without another owner action. The customer can inspect job/task status, fetch the encrypted report and decrypt it locally with its recovery file. The browser matches the exact encrypted-envelope hash to the on-chain attestation. No dedicated backend receives the customer's recovery key.
5. Owner changes to supplier/pricing/reserves/model consent and global freeze require wallet signatures. Freeze blocks new commitments and contract-controlled spending; it cannot recall an already-sent HTTPS request or transfer. The customer retains its allowed on-chain refund path for unaccepted work.

### Recover unaccepted customer service escrow

Read the task in the static console, connect the original customer wallet and verify the company code hash. **Review service refund in wallet** requests only the service deposit with zero attached deposit; testnet gas is separate. The contract sends funds only to that job's original customer. Permanent job/task storage and account backing remain nonrefundable. Owner freeze stops autonomous spending but does not disable this customer refund path. Once work has been accepted, settled or paid, or a refund is pending, the customer cannot submit another refund through the console.

The browser writes a nonsecret refund intent immediately before wallet dispatch, after local validation. It records identities, code pin, starting finalized block, request ID and any returned signed hash; no report key or credentials. Same-origin Web Locks coordinate browser tabs. Task/account/code-pin changes invalidate stale inspection and signing preflight.

If redirected or uncertain, inspect the pending refund. A finalized `refunded` job confirms the callback completed. To enable an explicit retry after failure, the exact wallet hash must identify a `FINAL` failed transaction with complete known receipt fees, the same customer/contract/job and zero-deposit `refund` action, executed after this intent began; fresh state must still hold unaccepted service escrow. An unknown/mismatched hash, ordinary wallet error, escrow view alone, or success whose callback is pending never clears the intent or causes an automatic retry. A cancellation without a provable signed hash remains unresolved; preserve the intent and wallet history rather than deleting them to force another signature.

The static `web-chain/public/fixture/` site has reproducible missing-alt and broken-link defects. A future hosted demo should pin that controlled HTTPS directory in the owner profile. The existing local test uses only `http://127.0.0.1:8788/`. The worker accepts no arbitrary customer URL: target and path scope must exactly match the owner profile, TLS is validated, DNS is checked for every request, only public IPv4 is selected, private/reserved/transition addresses and redirects are rejected, and DNS/TLS/body reads run in killable eight-second subprocesses. IPv6-only sites are unsupported. No scripts, forms or external resources execute.

## Economics, limits and recovery

`company_order_quote` separates refundable service price from nonrefundable job-record storage (2 KiB), permanent encrypted-task reserve (64 KiB), and separate storage backing (64 KiB), using the live byte cost. A declined/refunded job returns only its service escrow; storage funds remain because its permanent record remains. Each atomic order funds one new lifetime slot, preserving the owner's prepaid headroom. All three storage contributions are excluded from cash, revenue and profit and are recorded per job. The old manual demo's `order_quote` remains a different legacy flow.

The contract separately tracks unsettled escrow, committed specialist fee, paid fee, settled service revenue, reserve, pending withdrawal, operating cash and funding. Customer storage and account backing are not sales. Available cash subtracts reserve, commitments and pending withdrawals. Gas is paid by transaction signers and must be reported separately; a margin before gas is not net profit. Actual worker transaction hashes, receipts and exact yocto fees are journaled. Missing fees remain unknown. Provider USD credit estimates are never added to NEAR balances.

The executor persists a signed transaction hash/intent before broadcast, disables automatic RPC retries/redirects and halts on unknown outcomes. Reconciliation queries finalized status, never resends the original intent:

```sh
python3 -m executor.main reconcile --config /absolute/private/proofwork/config.json
```

Inference responses now remain encrypted and durably staged before the completion transaction is submitted. After reconciling the original RPC pending hash, an operator can use the configured client's explicit read-only `reconcile_staged(call_id)` API to verify the exact on-chain output commitment and recover that saved cache. It performs no model, reservation or completion request. A legacy unknown call with no saved cache remains unrecoverable; preserve it and its reservation. See [local model recovery](LOCAL_MODEL.md).

Retain the same contract, scoped key, delegated RSA identity, code pin, volume and journals across restart. Never “reset” them to clear an uncertain payment. Do not remove another process's lock. A missing key or mismatched code/profile fails closed. Worker RSA rotation requires draining/refunding and archiving all active tasks first; historical same-key mission profiles retain their ciphertext. RSA rotation does not revoke the old NEAR access key—revoke/replace that separately through the operator account's authorized custody.

The Python gateway and its Node child both hold a protected POSIX `.lease` file lock. The OS releases it only after both processes exit, including crashes; a second worker cannot acquire the same journal meanwhile. An old direct-Node `.lock` directory still blocks startup. Investigate its owner before any manual migration; it is never automatically stolen or deleted.

A customer refund can race the worker's earlier view of an unaccepted job. A worker write that is independently verified `FINAL` and failed is retained with its known gas. The worker may resume read-only observation only when narrowly scoped current freeze/refund state explains that failed transition; it never resends the failed signed intent. Unknown outcomes, malformed receipts and unexplained failures still halt. A failed archive is not made recoverable merely because its job is refunded; archive failures remain fatal and require explicit inspection. This recovery does not cancel an in-flight external request or authorize spending after freeze.

Finalized RPC and worker traces now roll at 128 active records into immutable hash-linked private archives, retaining 64 active entries after each rollover. A durable request-ID index keeps replay/conflicting reuse blocked across rollover and restart. Unknown signed intents stay active and never move into finalized archives. Terminal encrypted task cache is removed only after authoritative paid/refunded and archived confirmation. Missing/corrupt archive chunks or request indexes fail closed.

Back up `<rpc-journal>.archive/`, `<rpc-journal>.requests/` and `work.archive/` together with the active journals and keys. Do not discard old archive/index files to reclaim space. This implementation requires private POSIX same-filesystem hard-link/fsync/locking semantics, which need verification on a hosted volume. There is a finite 8,192-segment archive ceiling (524,288 archived records), not an infinite ledger.

Queue, profile history, AI reservations, storage, gas allowance, disk and archive capacity are finite. The company can continue while funds, policy, available workers, keys and infrastructure permit, but no finite budget or network can guarantee eternal operation. It does not acquire real customers, run arbitrary businesses, contact people, place advertisements, or achieve a complete public business workflow.

## Bounded NEAR AI and hosted activation

Without a provider key, the worker uses a labeled deterministic fallback. Optional inference always goes through the single budgeted client: owner-signed on-chain consent/model policy, durable pre-call reservation, 2 calls/job, 4/day, 512 output tokens, encrypted cross-job cache, no idle inference, no automatic model upgrade or retry. Default estimated ceilings are $0.01/call, $0.02/day and $0.05 total. Reservations remain held on timeout. Fixed-endpoint HTTPS runs in a killable 25-second subprocess, including DNS. Operator-only reservation/completion transactions and their gas remain distinct from estimated provider USD billing.

To install a separately capped key privately, use `python3 -m executor.main set-ai-key --data-dir /absolute/private/proofwork`; no network call or policy enablement occurs. The owner must explicitly approve data scope, model and budget through the wallet. Actual provider billing/prices and use of a key outside this worker are not controlled by the contract. This client does not verify TEE attestations or provide client-to-model encryption.

NEAR's [staking-funded hosting announcement](https://www.near.org/blog/staking-for-near-ai) is the target hosting direction. This deliverable includes a portable executor Dockerfile and source archive, **not** a provisioned NEAR AI hosted instance. No hosted agent exists in this session. Before activation, verify the current hosted tier supports the exact custom process/tool/container, persistent encrypted storage, restricted signing, private secret injection, recovery, outbound allowlist and effective cost cap. Its native IronClaw planning/heartbeat/subagent calls must stay disabled or separately provably capped; they do not inherit this client's limits merely by invoking a tool. Do not enable a second uncontrolled inference loop.

No staking or paid service is activated by any installer or example. The current staking quote, locked principal/reward economics and wallet transaction must be reviewed and approved by the owner before real funds are used. These publication/payment gates do not prevent reproducing the full sandbox demonstration above. See [provider research and trust boundaries](SERVERLESS_CHAIN.md) and [hosted activation evidence](HOSTING_ACTIVATION.md).

Build the portable headless image from the full repository with `docker build -f executor/Dockerfile -t proofwork-headless .`. It contains the minimal NEAR signing client, Python checker and bounded intelligence, not a NEAR sandbox node or app API server. A network-disabled local Linux container successfully exported its public worker manifest. That does not establish hosted NEAR AI custom-process compatibility or a verified enclave measurement.

## Current funding catalog and IronClaw probe

The static console has an explicit **mainnet read-only** NEAR AI catalog panel, separate from testnet company wallet actions. It reads `stake.dao` and its NEAR AI pool products at one finalized block, displays exact catalog/storage terms and both product/price status, and downloads a labeled snapshot. It has no staking action, mainnet wallet, provider call or automatic network request. A changed code pin invalidates in-flight results/exports. RPC data is trusted infrastructure; the optional independent code pin is an identity comparison, not a light-client proof, audit, total-cost quote or credit-eligibility guarantee.

```sh
node scripts/near_ai_catalog.mjs --output /absolute/path/new-catalog.json
# Optional live browser read-only integration, after building web-chain:
cd web-chain
CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:catalog:live
```

The CLI and browser have both read the real catalog without any signature, stake, funding or provider call. Historical catalog snapshots must be refreshed before any later owner-approved financial decision. Source ABI reference and RPC-reported code identity are captured separately; they are not claimed to match compiled source.

An additional [IronClaw WASM inspector](../executor/ironclaw/README.md) builds against the pinned current `near:agent@0.4.1` ABI. Native tests, the actual IronClaw v3 manifest parser and real Wasmtime runtime with a synthetic HTTP host passed. The local ZIP is **read-only inspection, not the autonomous executor**. No hosted import or tenant has been tested; current source makes ZIP import admin-only and offers no guest NEAR signing, RSA private decryption or atomic durable journal-write API. The ordinary cron path invokes a model loop. A safe full hosted port still requires verified host services/private process support and effective caps across native inference. The probe requests no secrets/signing/model capability and forbids automation invocation. See [activation boundaries](HOSTING_ACTIVATION.md).
