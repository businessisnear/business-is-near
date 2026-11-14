# Explicit public-testnet local Gemma worker

`executor.testnet_mock` is a separate, opt-in launcher for a **finite public
NEAR testnet worker** using the pinned local Gemma model. It is not deployed or
activated by installation, validation or a website visit. There is no mainnet
mode, hosted service or inbound worker HTTP listener.

The ordinary `executor.main --local-model` option remains sandbox-only. This
adapter never sets `sandbox=True` against a public chain or exposes the seeded
local rehearsal controller. Pages can submit reviewed wallet transactions to
testnet while a private worker polls the chain and returns encrypted evidence.

## Authority and model provenance

Actual requests use `gemma4:e2b-it-q4_K_M` at numeric loopback port 11434, verifying
the installed digest `b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2`.
The bounded `NearAIClient`, `LocalModelClient`, `OperationAIAuthority`, restricted
gateway, leases, journals and encrypted cache remain in use. Owner policy,
freeze, actual admitted operation, worker/profile identity, token/count/budget
ceilings and confirmed output commitment remain required. No Cloud fallback or
owner/customer key is supplied to the worker.

On-chain `economy` is an authorization/reservation class, not proof of a
provider. Results identify actual local Gemma, its digest, `local_ollama`, zero
Cloud charge and unknown local compute cost. Cloud billing, TEE execution,
attestation, business outcomes and continuous hosting remain unverified.

## Independently prepared prerequisites

- A fresh compatible testnet company, reviewed deployed code hash and intended
  owner. Do not reuse the retired public company or retry an unknown intent.
- A distinct testnet operator with a finite FunctionCall key restricted to that
  company and the needed methods; never an owner/customer full-access key.
- A fresh private worker directory with its existing RSA vault/public manifest,
  owner-approved `business-operations-v1` profile and independent private backup.
- Owner-signed AI policy and individual encrypted text work. This adapter adopts
  policy; it cannot enable or increase it. Plain `content_draft`/`website_build`
  work does not require the separate `/__private` library APIs.
- The pinned local model already installed on the same trusted host. Validation
  does not check installation, contact Ollama or start/download a model.

## Protected configuration

Both JSON files must be outside served source, regular/user-owned mode 0600,
with private mode-0700 parents and canonical absolute paths. Symlink/hard-link
aliases and extra fields are refused. These are **invalid schema examples**,
not deployed identities or credentials.

When installed under the publication repository, the entire discovered Git or
publication-manifest root is excluded, including its sibling `docs/` tree.
Mode 0700/0600 does not make files inside that public repository acceptable.
A standalone editable closure excludes its entire source root.

The existing worker file has exactly `data_dir` and `gateway`:

```json
{
  "data_dir": "/absolute/private/mock-demo/worker",
  "gateway": {
    "network": "testnet",
    "rpc_url": "https://test.rpc.fastnear.com",
    "chain_id": "testnet",
    "contract_id": "your-company.testnet",
    "operator_id": "your-operator.testnet",
    "operator_key_file": "/absolute/private/mock-demo/worker/operator.json",
    "journal": "/absolute/private/mock-demo/worker/rpc-journal.json",
    "expected_code_hash": "REPLACE_WITH_REVIEWED_NEAR_CODE_HASH",
    "worker_key_id": "REPLACE_WITH_EXACT_PUBLIC_MANIFEST_SHA256"
  }
}
```

The separate mock profile requires the exact acknowledgement and public pins
matching the protected gateway. Activation also checks the actual existing vault
identity; validation only checks its file metadata, without reading key bytes.

```json
{
  "schema": 1,
  "profile": "public-testnet-local-gemma-mock-v1",
  "worker_config": "/absolute/private/mock-demo/worker-config.json",
  "pins": {
    "contract_id": "your-company.testnet",
    "expected_code_hash": "REPLACE_WITH_REVIEWED_NEAR_CODE_HASH",
    "worker_key_id": "REPLACE_WITH_EXACT_PUBLIC_MANIFEST_SHA256"
  },
  "model": "gemma4:e2b-it-q4_K_M",
  "model_digest": "b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2",
  "acknowledgement": "I authorize the pinned local Gemma mock on public NEAR testnet. This is not NEAR AI Cloud; Cloud billing and TEE execution are unverified."
}
```

Only the exact fixed HTTPS FastNear testnet endpoint is accepted by this profile.
FastNear is listed in [NEAR's RPC provider documentation](https://docs.near.org/api/rpc/providers).
The retired `https://rpc.testnet.near.org` endpoint, mainnet, loopback, other
public RPCs and requester-selected providers are refused. There is no endpoint
fallback. NEAR describes the retired endpoints and their reduced rate limits in
its [RPC endpoint deprecation notice](https://near.org/blog/deprecation-of-near-org-and-pagoda-co-rpc-endpoints).

## Validate offline

From the extracted source after installing pinned dependencies:

```sh
python -m executor.testnet_mock validate --config /absolute/private/mock-demo/mock-profile.json
python -m executor.testnet_mock run --dry-run --config /absolute/private/mock-demo/mock-profile.json
```

Both commands read only the two configuration files, stat private assets, make
zero network requests, load no credential contents and create no runtime state.
They print only public identities and explicit unverified boundaries. A passing
validation is not live RPC/model/wallet acceptance or permission to deploy.

## Explicit finite activation

After separately reviewing the real testnet setup and signing authority:

```sh
python -m executor.testnet_mock run --config /absolute/private/mock-demo/mock-profile.json --confirm-testnet-local-mock --steps 1
```

This command **can sign restricted testnet worker calls** and is not part of
offline validation. There is no automatic service or startup registration.
One to 32 ticks are allowed, with a
two-to-30-second interval and `autonomous=False`.

The gateway first obtains its existing exclusive process lease and verifies
startup identity and pending-journal state, before engine/cache construction.
Lease or pending-state refusal creates no mock engine, ledger or mode marker.
First activation then binds an immutable private mode marker. Existing worker state
without it is refused. The mock uses a separate ledger and domain-separated
cache/call identity. Restart retains journals/cache/original model identity.
Missing identity/ledger files and unknown outcomes are never reset or retried.
A pending RPC journal blocks activation; inspect and reconcile its original
intent through the existing separate reviewed process.

The gateway verifies live network, code, profile, scoped key and finite
allowance. The launcher checks returned worker identity before ticking. This
trusts the configured RPC, not a light-client proof. Whole-volume rollback/loss
and host compromise are outside these local file protections.

For public testnet the gateway's Node child receives fixed
`--dns-result-order=ipv4first` and
`--network-family-autoselection-attempt-timeout=2000` arguments. These select
connection behavior for the same fixed endpoint. The sandbox child arguments
are unchanged; no `NODE_OPTIONS`, provider fallback or new signing authority is
introduced.

The explicit mock profile emits bounded refusal diagnostics on stderr before
the inference client can catch them: trusted bridge stage, allowlisted error
kind, and HTTP status only. It logs no prompt, request arguments, provider
message, response payload or keys. Invalid diagnostic metadata produces a
generic unavailable label. Results and exceptions retain their original behavior.
A read refusal after a durable local reservation may still leave an unknown
budget entry before any signed AI reservation or model request. Diagnostics do
not clear that entry, authorize another attempt or resolve an unknown outcome.

## Provider changes and existing local state

The stock bridge already permits the fixed FastNear testnet endpoint. Its local
RPC journal identity binds chain, company, operator, public signing key and code
hash, rather than the RPC URL. That identity can remain intact for a separately
reviewed pre-start provider change when an actual trusted startup diagnostic
proves refusal before signing, the original journal has `pending=null` and empty
`history`, and no worker mode marker, work cache or model ledgers were created.
The same chain/code/operator/worker pins must still be verified on startup.

Keep the original configurations, refusal evidence and journal unchanged; use
separately reviewed replacement protected configuration and source pins. This
adapter performs no configuration migration or journal reset. A runtime already
bound to another RPC URL is refused rather than silently migrated. A pending or
nonempty original journal needs its own explicit recovery review.

If a refused worker call occurred after engine construction, a mode marker and
disabled empty ledgers may already exist. That is a different state from the
marker-free case above. It requires a separately reviewed, lease-held migration
with immutable before-state evidence, fresh FINAL chain/code/profile/task and
zero-reservation checks, and unchanged ledger/sentinel/vault bytes. The adapter
provides no migration bypass. Empty local calls alone do not prove that no chain
reservation or model request occurred.

## Completed finite demonstration and budget limits

The 2026-11-13 demonstration completed one distinct owner-approved
`website_build` task on public testnet through this profile. One actual local
Gemma POST returned successfully; the task and encrypted output were archived.
The company was then frozen, its rotated restricted key revoked and all local
model services stopped. Recovery was verified with model transport and signed
writes denied. The curated public record is published separately as
`docs/app/verification.json` in the repository; it is not a running-service
promise or a replacement for the older local-release evidence.

Local accounting retains two logical reservation records: the older unknown
entry still carries `658400` nanos, and the successful distinct website request
reserved `680000` nanos. The new policy permits at most two calls per day and
`2000000` nanos of daily/lifetime budget, while keeping that older charge. These
are conservative authorization/accounting units, not a Cloud invoice. Unknown
fees and unknown outcomes are not assumed to cost zero; the earlier call is
not retried or cleared. Local compute cost remains unknown.

The older entry's underlying failure cause was not retained. Its observed lack
of a signed AI reservation or model POST does not identify that cause; separate
connection probes and synthetic HTTP 429 tests do not establish it.

For this demonstration the operator observed testnet protocol version 88 with
`min_gas_purchase_price = 1000000000` yoctoNEAR per gas. At that observed floor,
100 Tgas needs 0.1 test NEAR of prepaid gas **plus fees**, even when a block
header reports a lower gas price. The rotated key used a finite 1-test-NEAR
FunctionCall allowance for the same receiver and five restricted methods.
That allowance is an authorization ceiling, not a transfer or an assertion of
actual spend; test tokens are not mainnet funds. Inspect current protocol
parameters and actual transaction fees before preparing a different run.

## Offline evidence and remaining work

```sh
python -m unittest executor.test_testnet_mock -v
node scripts/verify_owner_tools_source.mjs
```

Tests use synthetic chain authority and deterministic model replies with actual
`BusinessExecutor`, bounded client, encrypted cache and recovery code. Network
and subprocess access are denied. Tests cover configuration/permission refusal,
the unchanged sandbox-only flag, owner/freeze/task/count limits, no Cloud
fallback, truthful model metadata, cache reuse after restart, retained unknown
outcomes, lost-state refusal, fixed testnet child arguments, redacted refusal
diagnostics, and a read refusal after local reservation without a signed AI call.

The finite demonstration has separate public evidence for its actual testnet
deployment, one Gemma request, encrypted output and recovery, archival and final
containment. Offline tests do not replace that evidence. A different deployment,
real visitor-wallet UX, continuous operation, Cloud billing, hosted TEE execution
and mainnet use still need their own acceptance with fresh source/config/model
pins and all failed/unknown evidence retained.
# Bounded public founder service

The opt-in `executor.testnet_fleet` service extends the single-company adapter.
It discovers at most eight records from one pinned public testnet factory and
serves ordinary owner-approved `website_build` and `content_draft` work. It has
no incoming HTTP endpoint. The frontend reads the registry, task state and
encrypted result directly from NEAR; the owner decrypts with the separate
recovery file in their browser. The factory's optional site methods publish
only separately owner-approved plain text.

The service uses actual pinned local Gemma. It is not NEAR AI Cloud or a TEE.
Operator file/process separation is not strong isolation from another process
running as the same OS user. No founder owner key is requested by this service.

## Public and private authority

- Factory `set_worker_service` is owner-only and immutable before the first
  registry record. It pins the service operator, RSA public encryption key and
  at most 48 hours of service, eight cumulative company records, two logical
  inference reservations per company and sixteen across the service.
- Factory `heartbeat` is signed by a separate operator function-call key scoped
  only to that factory's `heartbeat` method, with a finite 3 TESTNEAR allowance.
  A heartbeat expires within 600 seconds; cadence is 300 seconds. The fleet
  permits at most 579 signed heartbeat attempts, reserving one additional
  bootstrap heartbeat outside its journal. Unknown attempts remain pending and
  halt production; there is no automatic rebroadcast or extension.
- `fleet_enrollment.mjs` alone reads the configured service-operator FullAccess
  key to add a unique per-company function-call key. Each grant is scoped to
  that company receiver and exactly `company_tick`, `ai_reserve_call`,
  `ai_complete_call`, `company_attest`, and `company_archive`, with a finite
  1 TESTNEAR allowance. An allowance is a ceiling, not funded escrow or an
  actual fee. Normal ticks do not reload the FullAccess issuer key.
- Service and worker startup verify the fixed testnet genesis, RPC network,
  factory/company code, original creator, operator and encryption profile.
  Registry account/function responses must match the requested FINAL block
  hash and height. These are RPC observations, not a light-client proof.
- Before new model reservations and every worker write, the service checks the
  current operator liquid balance against 0.5 TESTNEAR plus current gas-purchase
  upfront costs, including one concurrent heartbeat. It stops on shortfall.

The frontend must display the actual last heartbeat time/age and block new work
after expiry. A recent heartbeat records a bounded readiness observation; it
does not guarantee future uptime. Existing published pages and original refund
rights remain available when the worker service is offline or expired.

## One private fleet configuration

The exact configuration has these fields; replace public pins from the actually
reviewed deployment and keep the complete file outside all Git/served trees:

```json
{
  "schema": 1,
  "profile": "public-testnet-founder-fleet-v1",
  "factory_id": "REVIEWED_FACTORY.testnet",
  "factory_code_hash": "REVIEWED_FACTORY_CODE_HASH",
  "template_sha256": "REVIEWED_COMPANY_TEMPLATE_SHA256",
  "company_code_hash": "REVIEWED_COMPANY_CODE_HASH",
  "operator_id": "REVIEWED_OPERATOR.testnet",
  "worker_key_id": "REVIEWED_RSA_PUBLIC_PEM_SHA256",
  "worker_public_key": "REVIEWED_RSA4096_PUBLIC_PEM",
  "service_expires_at": "REVIEWED_UNIX_SECONDS",
  "operator_key_file": "/protected/project/accounts/operator.json",
  "heartbeat_key_file": "/protected/project/keys/heartbeat.json",
  "root_dir": "/protected/project/fleet-runtime"
}
```

Every private directory must be canonical, user-owned and mode `0700`; every
private regular file must be mode `0600`, unlinked to other files, and outside
the publication/source root. `root_dir/vault/master.key` and `launch.pem` must
already exist. When the bootstrap creates `shared-vault`, copy its exact same
master/RSA bytes into a new `fleet-runtime/vault`; never generate a replacement
identity over existing accounting. The issuer/heartbeat JSON files contain the
service account's `account_id`, `public_key`, `secret_key`. The bootstrap's
additional schema/network/role metadata is allowed.

Validation stats credential files without reading their contents or making a
network request. Preparation creates only the private fleet state/directories:

```sh
python -m executor.testnet_fleet validate --config /protected/project/fleet.json
python -m executor.testnet_fleet prepare --config /protected/project/fleet.json
```

Before the first public heartbeat, separately verify the actual pinned Gemma
model tags, owned model process, exact final source/configuration and prepared
private fleet. Then explicitly activate the finite worker:

```sh
python -m executor.testnet_fleet run --config /protected/project/fleet.json \
  --confirm-testnet-founder-service --seconds 169200 --interval 15
```

Run from the editable `source/` directory with the configured Python environment
and pinned executor dependencies installed. The ordinary sandbox-only local
model switch is unchanged. There is no Cloud fallback, mainnet switch, model
download, inbound endpoint or arbitrary command/recipient selection.

## Retained outcomes and recovery

The fleet holds one OS lease across model-producing ticks. Each company retains
its own adapter profile, restricted signing key, RPC signed-intent journal,
encrypted work/cache and inference ledger. Counts include unknown reservations.
Previously observed counts cannot decrease. Missing initialized ledgers or RPC
journals fail closed. Existing complete cache IDs remain usable at the service
caps through the actual bounded client's cache/chain commitment checks.

The issuer writes exact signed bytes/hash before its sole send. Company-specific
profile, policy, code/key, unsupported task, decryption and unknown worker/model
outcomes durably quarantine only that company. Its original journals and logical
reservation counts remain intact, and other companies can use the remaining
global budget. Quarantine never automatically clears or retries. Missing or
decreased accounting, changed shared service identities and uncertain shared
FullAccess enrollment/heartbeat outcomes stop the whole service.

Every new logical reservation, actual model dispatch and worker write checks a
fresh FINAL factory code/state, native worker-service pins, heartbeat, finite
lease and operator liquidity. The issuer repeats its dispatch checks before
signing and before its single send. Offline, expired or frozen services start
no new model call or write. Exact already-sent intents can still be reconciled
through read-only status checks after expiry or freeze; this does not resend or
create a model call. A response arriving after expiry may retain staged encrypted
output and an unknown reservation pending explicit operator review.

Inspect the original hash and FINAL receipts; a timeout is not evidence of
failure. Do not clear the ledger, recreate a private root, generate another key,
reissue the action or change model identity to recover. Manual reconciliation
retains all original identities/charges; an identity refusal does not authorize
a resend.

## Explicit recovery from a read-only transport halt

Local Gemma readiness checks use only fixed loopback GET `/api/tags`.
Transient transport failures make at most three attempts with a five-second
request timeout and 2s/4s pauses, then use the existing 30/60/120-second read
cooldown. Model identity, malformed JSON and nontransient errors still fail
closed. Local health must recover before a retained Native heartbeat can
clear a pause, before normal discovery and before each new dispatch or
reservation. Read-only public recovery audits do not require a running model.
Inference and signed effects are never retried by this health recovery.
The same local-health gate runs before worker writes, including completion and
archival. If health fails after a model response, terminal writes can pause
while encrypted output and original outcome evidence remain retained. This
does not authorize an automatic completion retry or another inference.

Fixed registry reads make at most three attempts for HTTP 429/500/502/503/504
or connection timeouts, with a ten-second per-attempt timeout and two-/four-second
backoff. JSON/RPC identity failures are not retried. Exhaustion records the read
method, HTTP status and attempt count, then pauses the finite service for
30, 60 and at most 120 seconds before fresh native checks. The original deadline
and all gas/call budgets remain unchanged. A recent heartbeat can expire during
a provider outage; the UI then blocks new work. Once reads recover, a required
heartbeat renewal still uses the original scoped key, allowance and finite
heartbeat-attempt cap. An otherwise compatible company is not permanently
quarantined merely by this source-controlled read failure. Signing, model calls and submitted
transactions are never automatically retried by this mechanism. Any unknown
model reservation remains charged and quarantines its company; any uncertain
shared signed transaction still halts the service for original-hash review.

After an operator inspects the original halt, the following two explicit steps
use the same protected configuration as the stopped fleet, from the source root:

```sh
python -m executor.testnet_fleet audit-resume --config /protected/project/fleet.json
python -m executor.testnet_fleet resume --config /protected/project/fleet.json --approved-resume-sha THE_REVIEWED_AUDIT_SHA256
```

The first command performs local journal/ledger validation and fresh public
identity reads. It creates only a protected five-minute audit report and prints
its hash. The second requires that exact reviewed hash, repeats the audit, saves
the original halted state byte-for-byte, appends halt/quarantine/resume history,
and records the explicit transport recovery. Neither command starts a model,
signs, submits, clears a journal, reduces a charge or activates the fleet. The
operator separately uses the documented finite `run` command afterward. A stale
heartbeat is allowed during this read-only audit; the run's first heartbeat
renews it only after the existing model/readiness checks. An expired service
lease or frozen/changed factory still refuses recovery.

Any pending signed intent or unknown model reservation blocks recovery. Retained
completed calls continue counting toward both lifetime caps. The older untyped
`HTTPError` halt is eligible only when the audit proves there were no worker
writes or inference reservations. Later structured transport halts retain all
completed work. Other company quarantines remain in place. At most three explicit
transport recoveries are allowed during this service lease; none is automatic.

Enrollment checks shared pending grants before company-scoped reads. A proved
pre-sign refusal stops only that company. New enrollment preparation persists its
empty identity-bound journal before its restricted key; an interrupted pristine
preparation cannot conceal a signed grant or block unrelated companies. An
original key with a missing journal, a non-pristine journal with a missing key,
or any possibly submitted grant still requires review and stops shared issuance.

### Dispatch phases and operator stops

Recovery audits retained companies by dispatch phase. A proved unstarted or
pristine preparation needs no worker RPC journal; a FINAL enrollment can also
precede worker startup. These lanes retain their original quarantine/preparation
state and do not block other companies from resuming. Previously initialized
accounting still requires all original ledgers and RPC history. Unknown signed
or model outcomes, missing initialized accounting and decreased counters remain
hard stops. A frozen or incompatible company stays skipped; it cannot require
otherwise compatible companies to remain offline.

The bridge's correlated pre-sign transport refusal and the issuer's own
source-controlled pre-sign read proof preserve the method/status and explicit
no-dispatch disposition. Generic errors and unknown signed outcomes are never
reclassified as safe transport failures. Heartbeat-thread failures retain their
original exception cause. New restricted keys are installed atomically after
fsync with no overwrite; damaged pristine preparation is quarantined locally,
without regenerating its original key or erasing its journal.

The same explicit hash-reviewed audit can handle a separately labeled
`OPERATOR_STOP` after the operator stops the owned worker. It requires every
original signed intent to be resolved and every original model reservation
complete. It preserves the exact original stopped state, all journal bytes,
charges and counters. The audit/report and resume history label this case
separately from `TRANSPORT_RECOVERY`. Both commands remain inactive: restarting
the finite worker is a separate explicit operator action. The three-resume cap
is shared by both cases.

## Owner-controlled site publication

For an active factory record, only its original creator can call
`publish_site({id, expected_version, content})`. Content is exactly
`{title, summary, items:[{text}]}` with bounded lengths and at most 12 KiB of
UTF-8 JSON. Markup, URLs, controls and recognizable private/recovery credential
markers are rejected. This filter does not establish that arbitrary human text
contains no private information; the owner reviews the plain text explicitly.

The first publication attaches exactly `16384 * storageByteCost`; later updates
attach zero. `expected_version` is zero for an absent site, otherwise the exact
current revision. `unpublish_site({id, expected_version})` also attaches zero,
increments the revision and hides the current public view. Republish uses the
new revision and the same reserved storage. Original on-chain data/history
remain public; unpublishing is not erasure or a storage refund.

The factory verifies the original creator's signature, content bounds and CAS
revision. It does not prove that the published plain text equals an encrypted
AI result or certify the truth of business claims. The browser's fixed safe
template renders approved text; the model supplies no active HTML, scripts,
arbitrary URLs or publishing authority.


### Final transport and recovery boundaries

The fleet classifies an error returned by a read command only after the trusted
RPC gateway has correlated that response. Its exact failed frame must contain a
read-only command, no transaction, no pending write, and a known transport
diagnostic in an RPC stage. Snapshot reads use this same boundary. Reconcile,
unknown writes, local identity and decode failures never enter this retry path.
A TypeError in an RPC transport stage is treated as a connection failure; raw
error text or an arbitrary object is not a transport proof.

A heartbeat read pause still blocks new reservations and writes. An already
reserved model call instead performs its own fresh local-model and native readiness checks,
checking fatal/stop state, the original runtime deadline and the native service
lease both before and after the reads. A queued read pause alone does not burn
that reservation. An actual failure of this fresh gate still preserves the
original unknown reservation and charge; no second inference is authorized.

New company rows retain monotone enrollment-attempt and no-dispatch counters.
Only the exact current trusted issuer refusal can close one unsigned attempt.
An earlier unclosed attempt or recorded FINAL effect cannot be cleared by a
later refusal. Missing originals on an untracked legacy row are ambiguous and
require manual inspection. The audit never treats a sticky read-error hint as
proof that a key was never granted. A pristine journal cannot override a prior
enrolled phase or recorded effect.

New issuer locks include protected owner PID, action and identity metadata. A
read-only recovery audit reports a lock only if that exact owner is proved dead
(ESRCH). The separately hash-approved resume repeats the audit under the fleet
lease, archives the owner facts and original halted state, then removes only
those exact dead locks. Live, uncertain, changed, legacy empty or ownerless
locks refuse recovery without deletion. Pending signed intents and unknown model
reservations still block approval. If interruption occurs during lock cleanup,
retained audit/owner archives support manual inspection; the code does not guess
that an ownerless partial cleanup is safe.
