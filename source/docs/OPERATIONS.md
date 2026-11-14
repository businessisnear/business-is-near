# General business operations

The product target is bounded business operations, with NEAR controlling ownership, authorization, task state and spending, and NEAR AI providing inference/execution where supported. **A complete public business workflow is not implemented.** The [native requirements baseline](native-business-requirements.json) retains44capability and acceptance areas; [scope and evidence](BUSINESS_REQUIREMENTS.md) explains their limits. This extends the existing QA business; it does not turn draft generation into live marketing, support or engineering.

## What runs

The opt-in `business-operations-v1` profile accepts nine artifact operations—strategy plan, research summary, static website, content, support reply, outreach, social post, advertising copy and supplied-metrics analytics—and a bounded tested `engineering_patch` operation. Research can retrieve explicit owner-approved public HTTPS URLs. Every scope is encrypted and committed on NEAR, delegates a separate record key to the pinned RSA worker and records owner authorization. Only the owner can submit individual operations or approve a recurring template menu. The worker cannot invent new authorized scopes or obtain owner powers from model text.

Individual tasks can depend on up to four existing operation IDs and specify a chain-time `not_before` timestamp in seconds. Existing dependencies form an acyclic graph because tasks cannot be replaced or refer forward. The contract checks readiness; a successful predecessor attestation enables dependent work. Attestation is an authorized claim, not independent proof of research quality. Queue and storage limits remain finite. [Recurring mandates](AUTONOMOUS_OPERATIONS.md) add an immutable approved menu, planner choice, interval, expiry, daily/lifetime run caps and pause/cancellation. They require a continuously available polling worker.

Without AI, artifact operations produce explicitly labeled source extracts and a recurring planner uses round-robin selection. With `use_ai: true`, they use the existing capped NEAR AI client, or the explicitly enabled [sandbox-only local Gemma substitute](AUTONOMOUS_OPERATIONS.md#local-gemma-as-an-explicit-development-substitute). Engineering requires inference only when its real baseline tests fail. The contract admits inference only during an authorized active evidence stage. Policy, lifetime/day/task reservations, encrypted cache and unknown-outcome guards apply. The nine-artifact sandbox integration remains synthetic; the new mandate integration was also run with real local Gemma. Neither establishes NEAR AI Cloud or independent enclave verification. Source references prove which text was used, not that its assertions are true.

The report is encrypted on chain. A restart reuses retained encrypted evidence, and finalized attestation/archive prevents regeneration. No recipient, shell command or payment instruction is accepted in the typed result. A website exports as static HTML with escaped text and a policy disabling scripts, forms and network assets. It remains private until separately deployed. Engineering edits only owner-approved pure numeric Python source, keeps acceptance tests read-only, runs real isolated tests and creates a recoverable local Git commit. Other artifacts export JSON drafts. These tasks neither earn revenue nor spend treasury funds; gas/storage and optional inference have separate costs.

The [NEAR-native inbox](NEAR_INBOX.md) separately delivers encrypted support replies to named customers on chain. It uses owner-approved immutable policy grants, authenticated customer messages, daily/lifetime quotas, expiry and customer recovery. Unsupported message/policy ciphertext is retained for owner review without inference or blocking unrelated work. This is an on-chain channel, not email/social integration. The existing wallet console still covers QA; inbox/operations preparation and recovery use the CLI.

## Prepare and run

Use Python 3.11+ and the pinned `requirements.txt`, Node 22+, `npm ci --prefix executor`, and a compatible independently verified contract. Use a separate company/worker directory for this profile. The existing wallet console supports the QA profile; general operations currently use the CLI and owner-reviewed contract calls.

```sh
python -m executor.main init --data-dir /absolute/private/operations --profile business-operations-v1
```

Save the public manifest. As owner, configure the encrypted company mandate and permanent task storage, then `set_execution_profile` with the manifest, `mission_sealed_key` and `target_origin: ""`. The mission key delegation uses the same RSA-OAEP format as QA. To run inference, configure the owner AI policy and install a dedicated capped provider key as described in [HEADLESS.md](HEADLESS.md). The worker never signs these owner configuration calls.

A scope file has this exact shape:

```json
{
  "profile": "business-operations-v1",
  "operation": "website_build",
  "brief": "Create the inspection company's homepage",
  "context": "Use only these owner-provided facts; do not invent customers.",
  "sources": [{"id": "company_facts", "text": "We inspect authorized websites for broken links."}],
  "use_ai": false
}
```

```sh
python -m executor.operations_cli prepare --scope /private/scope.json --manifest /private/manifest.json --task-id op_homepage --profile-version 1 --output-dir /absolute/private/prepared
```

This writes encrypted `owner-call.json` and a separate private `recovery.json`. Review the operation, dependencies and schedule, then use the owner wallet to call the specified `company_submit_operation` method with the exact arguments. The preparation command sends no transaction. Pre-fund enough permanent task capacity with `company_fund_storage`. Never attach funds to the submit method. The worker's restricted key needs only `company_tick`, `company_attest`, `company_archive`, `ai_reserve_call` and `ai_complete_call` for this profile, scoped to the exact contract with a finite allowance.

```sh
python -m executor.main run --config /absolute/private/operations/config.json --profile business-operations-v1
```

The private config format, code hash pin, lease, provider key, recovery and unknown transaction reconciliation are the same as QA. Freeze halts new work and inference. A failed or unknown operation does not authorize a retry of an uncertain provider call. Save the `company_task` view with its public `id` field, then recover locally:

```sh
python -m executor.operations_cli export --task /private/task.json --recovery /private/prepared/recovery.json --output-dir /absolute/private/exported
```

For `website_build`, this creates `index.html` and `artifact.json`; otherwise it creates `artifact.json`. Exported files contain plaintext: review them before sharing. The output directory must be private and empty; files are created without overwriting existing paths.

## Verification and next acceptance criteria

```sh
python -m unittest executor.test_operations -q
PROOF_WORK_PYTHON=/absolute/path/to/python node integration/operations_e2e.mjs
python scripts/verify_native_requirements.py --structure-only
```

The integration test uses a real isolated local NEAR sandbox, a receiver/method/allowance-restricted key and the actual Python worker over RPC. It covers nine encrypted operation artifacts, chain-enforced dependencies and schedules, owner/freeze guards, restart, an explicitly synthetic model request with on-chain reservation/completion, offline website export and unchanged zero business revenue/spend. It tears down its chain and ephemeral keys. Its evidence is written under ignored `.artifacts/operations-e2e.json`.

The structure-only command checks the exact44-ID requirements/catalogue link and selected hashes, not feature completion. Without that flag, the offline verifier checks the declared immutable component reports and exits **2** when required evidence is missing, stale or incomplete. It launches no runtime, model or chain process. Historical reports retain their original consumed source/contract identities; editorial changes do not make them evidence of this build. The public source export may omit predecessor report files, which remains an explicit reproducibility limit. Existing integration commands above are separate, potentially stateful test harnesses and must not be run as live recovery actions.

Remaining requirements include general goal decomposition/application engineering, independent research verification and source discovery, authenticated customer channels, channel-specific delivery/reconciliation, live payments/provider accounting, media adapters, company isolation, and a verified hosted runtime. Email/social/ads/card services need a decision on whether external delivery providers are acceptable behind a NEAR-controlled worker; NEAR cannot directly operate those proprietary services without their interfaces and credentials. Live channel tests also need specific authorized accounts, recipients/campaigns and spend limits. No such credentials or real-money operations were created here.

On Apple Silicon, near-sdk-js 2.0.0 installs an Intel-only compiler. `python scripts/setup_near_sdk_arm.py` configures a checksum-pinned native WASI SDK 24 compiler while retaining the original SDK sysroot and restricting generated WASM features. Run it after `npm ci --prefix contract`, before `npm run build:onchain --prefix contract`. It changes ignored tool dependencies only. A native compiler with the new sysroot produced WASM the local chain rejected; compilation alone is insufficient, so sandbox execution is mandatory.
