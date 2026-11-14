"""Reviewed editable owner-tool closure; no Git index, directory sweep or config."""
import hashlib
import json
from pathlib import Path
import zipfile

from executor.studio_workspace import SOURCE_FILES, OPTIONAL_SOURCE_FILES
from executor.portability import safe_relative

ROOT=Path(__file__).resolve().parents[1]
EXTRA_SOURCE_FILES=(
    'labs/procurement/candidate-v4-delivery/local-app-v2/prebirth-ownership.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v5/approval-flight.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v5/prebirth-repair.test.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v5/package.json',
    'labs/procurement/candidate-v4-delivery/local-app-v5/README.md',
    'labs/procurement/candidate-v4-delivery/local-app-v5/app.css',
    'labs/procurement/candidate-v4-delivery/local-app-v5/app.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v5/company-api.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v5/company-loop.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v5/company-loop.test.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v5/duration.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v5/duration.test.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v5/index.html',
    'labs/procurement/candidate-v4-delivery/local-app-v5/model-proxy.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v5/model-proxy.test.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v5/planner-transport.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v5/server.mjs',
    'web-chain/public-tool-links.mjs',
    'web-chain/tests/public-tool-links.test.mjs',
    'labs/procurement/candidate-v4-delivery/.gitignore',
    'labs/procurement/candidate-v4-delivery/MODULE-SOURCE-MANIFEST.json',
    'labs/procurement/candidate-v4-delivery/README.md',
    'labs/procurement/candidate-v4-delivery/delivery-envelope.mjs',
    'labs/procurement/candidate-v4-delivery/delivery-envelope.test.mjs',
    'labs/procurement/candidate-v4-delivery/financial-fork/assignment-client.mjs',
    'labs/procurement/candidate-v4-delivery/financial-fork/assignment-client.test.mjs',
    'labs/procurement/candidate-v4-delivery/financial-fork/build.mjs',
    'labs/procurement/candidate-v4-delivery/financial-fork/build/shared_procurement_v4.js',
    'labs/procurement/candidate-v4-delivery/financial-fork/build/shared_procurement_v4.wasm',
    'labs/procurement/candidate-v4-delivery/financial-fork/fixtures/quote-input.json',
    'labs/procurement/candidate-v4-delivery/financial-fork/package.json',
    'labs/procurement/candidate-v4-delivery/financial-fork/protocol-readable-work-v4.mjs',
    'labs/procurement/candidate-v4-delivery/financial-fork/sdk-v4.test.mjs',
    'labs/procurement/candidate-v4-delivery/financial-fork/shared_procurement_v4.ts',
    'labs/procurement/candidate-v4-delivery/financial-fork/transport.ts',
    'labs/procurement/candidate-v4-delivery/financial-fork/typecheck.mjs',
    'labs/procurement/candidate-v4-delivery/financial-fork/v4-financial.test.mjs',
    'labs/procurement/candidate-v4-delivery/financial-fork/v4-host.mjs',
    'labs/procurement/candidate-v4-delivery/financial-fork/v4-id.mjs',
    'labs/procurement/candidate-v4-delivery/financial-fork/v4-local-fixture.mjs',
    'labs/procurement/candidate-v4-delivery/financial-fork/v4-quote.mjs',
    'labs/procurement/candidate-v4-delivery/financial-fork/v4-quote.test.mjs',
    'labs/procurement/candidate-v4-delivery/financial-fork/v4-real-crypto.test.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v2/app.css',
    'labs/procurement/candidate-v4-delivery/local-app-v2/app.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v2/availability-regressions.test.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v2/fixtures/final-public-state.json',
    'labs/procurement/candidate-v4-delivery/local-app-v2/index.html',
    'labs/procurement/candidate-v4-delivery/local-app-v2/maintenance-and-input.test.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v2/maintenance.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v2/once-dispatcher.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v2/once-dispatcher.test.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v2/pending-review.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v2/policy-preparation.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v2/public-action-input.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v2/read-invariants.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v2/read-model.mjs',
    'labs/procurement/candidate-v4-delivery/local-app-v2/server.mjs',
    'labs/procurement/candidate-v4-delivery/setup-local-dependencies.mjs',
    'labs/procurement/candidate-v4-delivery/verify-source.mjs',
    'fixtures/historical-components/4b64fb487de57513fcf8897674e52bdac6e67b3f0a0d993ef4f4d25161aa3de2.json',
    'fixtures/historical-components/6ebb048a5271378f9801eb81bbfd1a14c7303029788d77d3afc575420bd18429.json',
    'fixtures/historical-components/MANIFEST.json',
    '.dockerignore',
    'THIRD-PARTY-NOTICES.md',
    'NIGHTLY-NOTICES-ADDENDUM.md',
    'scripts/owner_tools_source.py',
    'scripts/verify_owner_tools_source.mjs',
    'docs/HEADLESS.md',
    'docs/PUBLIC_TESTNET_MOCK.md',
    'contract/build_factory.mjs',
    'contract/test_factory_service.mjs',
    'executor/fleet_enrollment.mjs',
    'executor/test_fleet_enrollment.mjs',
    'executor/test_testnet_fleet.py',
    'executor/testnet_mock.py',
    'executor/testnet_fleet.py',
    'executor/test_testnet_mock.py',
    'web-chain/PUBLIC-TESTNET.md',
    'web-chain/build-public-testnet.mjs',
    'web-chain/founder-journey.test.mjs',
    'web-chain/founder.html',
    'web-chain/public-demo.html',
    'web-chain/public-testnet.test.mjs',
    'web-chain/site.html',
    'web-chain/public-testnet-assets/example-result.json',
    'web-chain/public-testnet-assets/example-website.html',
    'web-chain/public-testnet-assets/verification.json',
    'web-chain/src/business-ui.js',
    'web-chain/src/founder-config.json',
    'web-chain/src/founder-journey-client.js',
    'web-chain/src/founder-journey-core.js',
    'web-chain/src/founder-journey-ui.js',
    'web-chain/src/founder-journey.css',
    'web-chain/src/founder-journey.js',
    'web-chain/src/founder-next-actions.js',
    'web-chain/src/founder-next-actions-ui.js',
    'web-chain/src/founder-service-policy.js',
    'web-chain/src/founder-publication-ui.js',
    'web-chain/src/founder-publication.js',
    'web-chain/src/founder-rpc.js',
    'web-chain/src/founder-reconcile.js',
    'web-chain/src/founder-site.css',
    'web-chain/src/founder-site.js',
    'web-chain/src/founder-wallet-modal.js',
    'web-chain/src/founder-wallet-connectors.js',
    'web-chain/src/public-demo.css',
    'web-chain/src/public-demo.js',
    'web-chain/src/public-testnet-config.json',
    'web-chain/src/public-testnet.js',
    'web-chain/src/public-workspace.js',
    'web-chain/src/wallet-popup.js',
    'web-chain/tests/founder-next-actions.test.mjs',
    'web-chain/tests/founder-service-policy.test.mjs',
)
OWNER_TOOLS_README='''# Editable native owner tools

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


'''

def owner_tools_inventory():
    # Reuse the already-reviewed explicit project filenames, excluding compiled
    # frontend copies. Additional files must be named explicitly above.
    return tuple(sorted({name for name in (*SOURCE_FILES,*OPTIONAL_SOURCE_FILES,*EXTRA_SOURCE_FILES)
                         if not name.startswith('web-chain/dist/')}))

def owner_source_relative(name):
    # These are exact reviewed public UI modules, not wallet state. Keep
    # this source-archive exception out of the company-export runtime policy.
    if name in ('web-chain/src/founder-wallet-modal.js', 'web-chain/src/founder-wallet-connectors.js', 'web-chain/src/wallet-popup.js'):
        return name
    return safe_relative(name)

def owner_tools_source_files(output_directory,root=ROOT):
    root=Path(root).absolute();output=Path(output_directory)
    if root!=root.resolve():raise ValueError('Canonical editable source root required')
    files=[];manifest=[];total=0
    for name in owner_tools_inventory():
        owner_source_relative(name);file=root/name
        if any(part.is_symlink() for part in (file,*file.parents) if part==root or root in part.parents):
            raise ValueError('Editable source symlink forbidden')
        if not file.is_file() or file.stat().st_size>8*1024*1024:
            raise ValueError('Missing or oversized reviewed editable source: '+name)
        raw=file.read_bytes();total+=len(raw)
        if total>64*1024*1024:raise ValueError('Editable owner source exceeds64MiB')
        files.append((file,name));manifest.append({'path':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    output.mkdir(parents=True,exist_ok=True)
    readme=output/'owner-tools-README.md';raw=OWNER_TOOLS_README.encode();readme.write_bytes(raw)
    manifest.append({'path':'OWNER-TOOLS.md','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    record=output/'owner-tools-source-manifest.json';record.write_text(json.dumps({
        'profile':'proofwork-owner-tools-editable-source-v1','files':manifest,
        'dependency_installation_required':True,'runtime_configuration_included':False,
        'private_records_included':False,'restored_authority':False,
        'fixed_wasm_templates_included':True},indent=2)+'\n')
    return files+[(readme,'OWNER-TOOLS.md'),(record,'OWNER-TOOLS-SOURCE.json')]

def verify_owner_tools_archive(file):
    """Check the actual ZIP bytes, including concurrent source-change failure."""
    with zipfile.ZipFile(file) as archive:
        names=archive.namelist()
        if len(names)!=len(set(names)):raise ValueError('Duplicate editable source archive path')
        record=json.loads(archive.read('OWNER-TOOLS-SOURCE.json'))
        expected={row['path'] for row in record['files']}|{'OWNER-TOOLS-SOURCE.json'}
        if record['profile']!='proofwork-owner-tools-editable-source-v1' or set(names)!=expected:
            raise ValueError('Editable source archive inventory changed')
        total=0
        for row in record['files']:
            owner_source_relative(row['path']);raw=archive.read(row['path']);total+=len(raw)
            if len(raw)!=row['bytes'] or hashlib.sha256(raw).hexdigest()!=row['sha256']:
                raise ValueError('Editable source changed during packaging: '+row['path'])
        if total>64*1024*1024:raise ValueError('Editable source archive exceeds64MiB')
        return {'profile':record['profile'],'files':len(record['files']),'bytes':total,'verified_archive_bytes':True}
