# Editable native owner tools

This editable source tree contains the fixed reviewed source, contract templates/WASM,
dependency locks and public fixtures needed by the owner tools. It includes all
Vite entrypoints, the private owner service, native source watch/editorial review,
portfolio retirement, GENERAL record apps and their existing shared modules.
It also includes the wallet-led founder journey, finite public-testnet fleet,
factory source/build metadata and their offline/native test sources.
It is an editable project closure, not an installed or configured hosted service.
No private runtime configuration, wallet/operator/provider credential, private
workspace, customer record or recovery file is included. Public frontend
deployment pins are informational and restore no authority. The executor and
prebuilt static-console ZIPs are separate artifacts.

Use a clean copy of this source tree with Node 22 and Python 3.12, then install the
included pinned dependencies using your normal reviewed installation process:

```sh
python3.12 -m venv .artifacts/venv
.artifacts/venv/bin/python -m pip install -r requirements.txt
npm ci --prefix web-chain
npm ci --prefix executor
node scripts/verify_owner_tools_source.mjs
npm --prefix web-chain run build
```

The compiled frontend is written to web-chain/dist with the complete fixed HTML
entrypoint set. Vite is needed by the local owner-tool launchers; the flat static
console ZIP alone does not supply Vite or editable source. Install the separate
contract dependencies with `npm ci --prefix contract` only when rebuilding a
contract or using the explicitly enabled local seeded rehearsal. On Apple Silicon
review scripts/setup_near_sdk_arm.py before rebuilding the pinned SDK templates.

Read docs/NATIVE_RETIREMENT.md and docs/NATIVE_SOURCE_WATCH.md for the separately
reviewed, protected owner configurations. For example, the retirement launcher is
`node scripts/native-retirement.mjs --config /protected/retirement.json` after
you prepare that configuration yourself. Its runtime only inspects and journals
exact original wallet actions; wallet signatures remain separate. Source watch
does not approve generated editorial copy or publish it. The private owner
service setup is in docs/OWNER_AUTHENTICATION.md and docs/HEADLESS.md.

OWNER-TOOLS-SOURCE.json records every included source hash and size. The verifier
checks those bytes, relative JS/CSS/HTML imports and every fixed Vite input before
you build. No verifier step signs, sends a transaction, starts a wallet/provider,
installs dependencies or creates configuration. Deployment keys and a trusted RPC
remain separate operational assumptions. Source verification does not activate a
public deployment or supply a live Cloud account.

The separate opt-in `executor.testnet_mock` launcher is documented in
`docs/PUBLIC_TESTNET_MOCK.md`. Its `validate` and `run --dry-run` commands are
offline; actual finite testnet activation requires an explicit confirmation
flag and separately prepared owner/operator authority. It does not change the
existing sandbox-only `--local-model` flag or configure a hosted service.

The public-testnet frontend is documented in `web-chain/PUBLIC-TESTNET.md`.
The guided founder and founder-bound workspace choosers use only the pinned
Nightly browser-extension connector. The unrelated generic workspace fallback
remains separate. Additional dependency notices are retained in
NIGHTLY-NOTICES-ADDENDUM.md; the original third-party notices remain unchanged.
Its founder journey guides a testnet wallet owner through a complete funding
quote and custody review, fresh company creation, encrypted mission and private
recovery files, bounded AI policy, an approved website/content task and revision,
then review and publication of selected plain text. Publication and unpublication
require owner approval; historical on-chain data remains public. Private operator
services remain unavailable in this public build. Run
`npm --prefix web-chain run test:public-testnet` and
`node --test web-chain/founder-journey.test.mjs` for the offline frontend checks.
Run `npm --prefix web-chain run build:public-testnet` to produce the dedicated
`web-chain/dist-public-testnet` static output. A build does not verify deployment
pins, provision accounts, start a worker or authorize a wallet action.

The opt-in `executor.testnet_fleet` service uses the pinned local Gemma model as
the authorized NEAR AI API-contract mock. Its protected issuer and company-scoped
keys are separately configured outside the source tree. The pilot is finite,
with at most eight companies, two logical model reservations per company and
sixteen globally; unknown outcomes retain their original reservations. The
native factory service view reports the actual lease and recent heartbeat.
Company-specific failures quarantine that company without clearing its journals.
Fresh native service, lease and liquidity checks gate new work. See
`docs/PUBLIC_TESTNET_MOCK.md` for offline validation, preparation, explicit
activation and original-hash reconciliation. The offline runtime checks are
`python -m unittest executor.test_testnet_fleet executor.test_testnet_mock` and
`node --test executor/test_fleet_enrollment.mjs`. No Cloud account, verified
Cloud billing, hosted TEE or permanent worker is supplied by this source.

External wallet-provider account registration, human authentication/redirects
and native mobile recovery-file downloads still need separate acceptance; a
controlled SDK-adapter browser run does not prove them. Public pilot setup and
wallet approvals use testnet tokens. Mainnet production remains outside this
pilot. The separate recorded example remains frozen, with its restricted key
revoked and old model services stopped, and can be inspected without a wallet.
The historical narrated video remains a record of the earlier local prototype.
The older nested delivery archive and source/evidence JSONs are privately preserved
with their exact hashes and withdrawn from this clean candidate. The new source
package and current-source summary describe their own verification scope; neither
relabels the old catalogue run as acceptance of the current code.

The founder workspace offers ready-made starting points and one revision of the
actual opened result. Choosing a suggestion fills an editable request without
running work or changing the owner's AI choice. Review the facts, request and
private recovery file before approval. These alternatives are not an automated
task queue or an AI assessment of the business. Optional task details remain
available. Run `node --test web-chain/tests/founder-next-actions.test.mjs` for the
offline guidance checks; see `web-chain/PUBLIC-TESTNET.md` for the full journey.

The current public frontend pauses new company creation and setup. Its temporary
recovery mode admits only the original company's remaining AI website revision,
subject to fresh company, policy and heartbeat checks and separately armed exact
worker admission. Other companies can inspect records, recover results and review
publication, but cannot submit new work through this client. This frontend gate
does not restrict older cached clients or direct contract calls. A shared native
heartbeat is not general fleet availability. Run
`node --test web-chain/tests/founder-service-policy.test.mjs` for the offline
admission checks. Static publication does not start the finite worker.

For the optional executor image, build from this editable source root with
`docker build -f executor/Dockerfile -t proofwork-headless .`. The included
`.dockerignore` excludes installed dependencies, conventional private runtime
paths and signing material from the build context. Dependencies are installed
from the included lockfiles. Source verification does not build the image or
verify a Docker engine, hosted instance or enclave.

The separate local native work-review prototype is under
`labs/procurement/candidate-v4-delivery/`. Its README provides source verification,
existing-lock dependency setup, offline tests/build and a finite seeded-role
browser journey. No wallet credentials or AI account are needed for its offline
checks. It is separate from the public Nightly workspace and does not establish
real human hiring, production recovery or an integrated recurring company loop.
The current source download is one reproducible source package, not the old nested
component delivery. Earlier broad catalogue receipts describe historical runs;
missing original fixtures are not evidence for current-source acceptance.

The separate [bounded company workflow](labs/procurement/candidate-v4-delivery/local-app-v5/README.md)
adds an
advisory offer draft and typed queue, explicit owner limits and a company result
linked to the original native review/delivery/settlement records. It uses either
an explicitly labelled deterministic mock or one capped local Gemma API call.
A portable strict-schema proxy is included for a separately user-started local
model. The guide states the separately qualified repaired local proof, seeded
roles and same-live-process recovery limits. The current company test profile is
30 repair + 28 company/duration + 25 base guards (83 total, different from the
historical financial/V2 83); seven proxy checks are separate. Old40 module
inventory and old83 commands are retained only as historical lineage. This is a local Node workflow, not an available
static Nightly company service. Recurrence, real hiring, Cloud and mainnet remain
outside its verified scope.


