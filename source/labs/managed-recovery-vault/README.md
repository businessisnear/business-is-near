# Wallet-authenticated managed recovery — local prototype

This bounded local prototype keeps recovery records encrypted in a private
service directory and uses NEAR ownership to authorize access. It removes the
routine backup-file step for records already imported into that service.
It is **service-custodied**, not private storage inside Nightly or end-to-end
secrecy against the service operator. There is no transaction, payment, worker,
model, pending-request reset, retry or reconciliation endpoint.

The published source is qualified for synthetic/offline tests. **Actual Nightly
login, human-private legacy import and subsequent real restore are still pending
for this capsule generation.** Hosting, TLS, cloud persistence and cross-device
availability are not demonstrated. The current public business app's new-task
backup workflow has not been connected to this prototype. A separate future
coordinator API is included without granting it live financial authority.

## Source and evidence

- `service/`: exact qualified Python V2 owner auth, AEAD store, fixed-route host
  and tests. 17 author checks plus 6 independent probes passed. Real generated
  NEP-413 signatures, actual newly created fixture files/fsync/restart and AES-GCM
  were tested; chain authority was synthetic. No listener was needed by those tests.
- `web/`: exact qualified UI V2 and explicit public-validator closure. 14 author
  checks plus 2 independent interface probes passed. Tests use real mission
  encryption and synthetic service/DOM ports. The nine prebuilt static files are
  included with exact hashes for local use, not as a new actual-wallet result.
- `node/`: exact qualified V2 reference vault/coordinator. 30 author checks plus
  6 independent probes passed. AES-GCM is real; effect/auth/store ports are fake.
- `PROVENANCE.json` pins each consumed source/asset generation. Historical failed
  predecessors and private review records are deliberately not republished here.
  Those generations are not being relabelled as this source's real-world proof.

The reused owner authentication verifies one-use, 120-second NEP-413 challenges,
the current FINAL FullAccess key/company owner, code and chain/genesis pins.
Sessions expire after 900 seconds and use HttpOnly cookies with CSRF protection.
Each vault operation rechecks authority before access and before returning.
Public/RPC identity is trusted to the configured official endpoint, not an
independently verified state proof. Failed or pruned identity reads deny access.

Recovery is AES-256-GCM encrypted with fresh IVs and immutable owner/company/
network/code/record/scope binding. New keys are generated internally by the
service, never by a public signature and never printed. Every startup reconfirms
the retained key/marker and directory durability. Losing an initialized service
key fails closed; it never regenerates a substitute over old records. Exact
duplicates are idempotent; conflicts never overwrite. File and directory fsync
plus exact decrypting readback precede a saved acknowledgement. The operator
must protect and back up the service key and encrypted data together.

## Verify and test

From this directory, using Python with the pinned `requirements.txt` dependency:

```sh
python -B tools/verify-capsule.py
cd service
python -B -m unittest -v test_vault_service
```

From `node/`, run `node --test recovery-vault.test.mjs recovery-coordinator.test.mjs`.
From `web/`, run `node --test vault.test.mjs` with a current Node runtime providing
WebCrypto. These tests generate their own synthetic material; they do not use
wallets, live RPC, existing configuration, recovery files or service runtime.

The optional bootstrap helper has a separate no-listener test:
`python -B -m unittest discover -s tools -p test_bootstrap.py`.

## Local setup and run

1. Supply a **reviewed public** authority JSON with exact testnet network/chain,
   official RPC URL, independently checked genesis height/hash, and a 1..16
   company/code allowlist. `fixtures/public-pins.example.json` contains synthetic
   placeholders and **must not** be treated as real company/genesis evidence.
   No wallet secret, recovery key or cookie belongs in this document.
2. Create a protected configuration outside the source checkout. The helper
   generates no secret and starts no process:

```sh
python -B tools/bootstrap.py --public-pins reviewed-public-pins.json \
  --state-dir "$HOME/.local/share/business-is-near-managed-vault" --port 18902
```

3. Start the finite loopback host explicitly:

```sh
python -B service/serve_vault.py \
  --config "$HOME/.local/share/business-is-near-managed-vault/managed-vault-config.json" \
  --seconds 900
```

Open `http://127.0.0.1:18902/__vault/`. Reuse the same protected state directory
when restarting; never delete its key/records to resolve an error. The bootstrap
refuses changed existing configuration and the service refuses a lost initialized
key. It never prints a key, signature, payload, cookie or private record.

The host binds only numeric loopback, enforces same Origin/Host and CSRF, serves
only the explicit static manifest, and uses no-store/CSP without CORS bypasses.
It stops after 30..1800 seconds. Persistent or cross-device use requires a
separately configured same-origin HTTPS deployment and protected operational
storage/key backups. GitHub Pages cannot run this backend.

Connect the intended testnet owner and request the explicit message-only private
workspace login. The narrow Nightly message port forwards the exact callback URL
to the injected wallet because Wallet Selector 10.1.4's wrapper drops that field.
Never approve an access-key, payment or transaction prompt for this vault.
Actual injected-wallet callback acceptance remains a real acceptance gate.

For an existing record, select its private recovery file **once inside the UI**.
The UI validates the exact company/task and locally decrypts its existing chain
record before saving. File contents and keys stay out of screenshots/logs/tools;
the service intentionally receives the recovery over the same-origin private
channel as the selected managed custodian. Later unlocks restore/decrypt saved
records automatically into browser memory. Missing original record keys cannot
be derived from wallet ownership. The UI clears opened data on logout, denial,
account/company changes and stale epochs. The old worker and unresolved original
wallet requests are unaffected.

## Optional UI rebuild

The prebuilt nine-file manifest is sufficient for local startup. To rebuild,
install the repository's reviewed frontend lockfile under `source/web-chain`
using its normal setup, then run `node tools/link-build-deps.mjs`. This creates
only an ignored local dependency link after checking Vite 7.3.7, Wallet Selector
core/Nightly 10.1.4 and Buffer 6.0.3. It installs nothing. Run the linked Vite
binary with `--config web/vite.config.mjs --emptyOutDir`. A rebuild is a new
artifact generation: regenerate the fixed static hashes/map and recheck it;
do not claim the old static receipt covers changed output. No dependencies or
generated service data are shipped in this source capsule.

## Future new-task integration

The browser-compatible coordinator requires trusted host ports for current
context, exact prepared bytes, existing owner authentication, vault APIs and
the existing original-transaction dispatcher. It validates full immutable saved
ACKs, issues an opaque one-use current-instance backup ticket, and checks exact
intent bytes and independent pending-UNKNOWN gates before one new dispatch.
An unknown dispatch is never retried or reset. This in-memory ticket does not
replace the dispatcher's durable cross-tab/process original-request claim.
That production integration has not been performed by publishing these files.

Project-authored source remains all rights reserved. Upstream attribution is
preserved verbatim in `notices/`; dependency licenses remain applicable.
