# Typed NEAR record apps

The explicit `native-record-app-schema-proposal-v1` profile proposes a bounded
record schema for the reviewed native app contract. Task trackers, inventories,
customer lists and similar record workflows can use one to eight sorted fields:
`shortstring`, `int`, `bool`, and at most one `sealedtext`. No booking or intake
field is added. The existing intake/booking profile keeps its previous behavior.

The model proposes data. Trusted code supplies empty string, zero, or false
defaults and rejects protected authority/payment names, credential-shaped field
labels (including public or encrypted password/key/recovery fields), duplicate
fields, unsupported types, extra keys and executable code. Deployment and schema
initialization are separate explicit owner actions. The general compiler validates
each exact field first, then orders the unique field set by ASCII name for the
canonical schema and receipt. Original provider text/cache stays unchanged. The
legacy intake profile continues to require sorted model input. Each local actor can create
and update only its own account namespace. Updates require the current revision;
ordinary fields, account namespaces and ciphertext are public chain history.

Start a new local workspace after installing the pinned project dependencies,
building the fixed company/app/appointments contracts, and configuring the pinned
local Gemma model described in `LOCAL_MODEL.md`:

```sh
npm --prefix web-chain run build -- --config vite.general.config.js
node scripts/general_app_studio.mjs --data-dir /absolute/private/record-app-data
```

Open the numeric-loopback URL printed by the launcher. Provisioning creates a
fresh company, private worker store and fixed contracts only after the displayed
local-owner approvals. One separately approved Gemma schema task is permitted
for this isolated workspace. Download its private recovery before approval,
recover and inspect the archived schema, then review initialization separately.
The page supports typed record creation, public namespace reads, revision-checked
updates, optional browser-local encrypted notes and owner-approved additive
schema migrations. Every signature has its own exact review. A pending or unknown
request must be reconciled by its original transaction hash before another action.

`sealedtext` is optional and defaults to empty. To publish a private value, encrypt
it in the browser and download its recovery first. The field recovery binds the
network, genesis block, app and code identity, author, record ID and field name.
Recovery is bearer access: anyone holding it can decrypt that ciphertext.
Plaintext and recovery keys are excluded from service calls and browser storage.

The **Download editable app source** button exports the selected public schema,
actual transitive HTML/JavaScript/CSS, fixed NEAR contract source, package locks,
build configuration and compiled frontend. It exports no customer records,
operator configuration, worker files or recovery keys. Restore into a new private
directory using the checked repository helper:

```sh
node scripts/general_app_source.mjs restore editable-source.json /absolute/new/source
```

Restore validates the bounded allowlist, exact file hashes and schema; it runs no
commands. The manifest records the frontend and fixed-contract rebuild commands.
Pinned development dependencies are needed separately. In the restored source
root, install the reviewed lockfile dependencies explicitly:

```sh
npm --prefix web-chain ci
npm --prefix contract ci
```

On Apple Silicon, the exported reviewed platform helper is also required before
rebuilding the fixed contract:

```sh
python3 scripts/setup_near_sdk_arm.py
node scripts/build_native_app.mjs
```

Review that helper and its pinned toolchain/network boundary before invoking it.
The accepted local rebuild used the already reviewed existing SDK/dependency
bytes; it does not establish successful fresh-machine installation or authorize
automatic dependency downloads during restore. `dependencies_included` stays
false. Rebuilt source still
requires an explicitly configured reviewed runtime; an archive grants no signer,
RPC, model, account or deployment authority.

This mode runs actual local NEAR with seeded accounts and test tokens, plus a
local Gemma mock of the NEAR AI contract. It does not authenticate public wallets,
create a hosted production tenant, verify NEAR AI Cloud/TEE execution, synthesize
arbitrary backend code, or grant the app payment authority. The reusable service
also provisions the reviewed appointments component for compatibility, but the
record-app UI requires no appointment and the general signing route refuses
appointment actions.

Verification: `integration/general_app_browser_e2e.mjs` exercises two isolated
model-proposed apps, typed records, namespace/revision refusals, optional field
encryption, additive migration, and editable export/restore/rebuild with a live
rebuilt-frontend update. Acceptance reports under `.artifacts` state whether a
particular run completed; the presence of this test is not evidence of a pass.
