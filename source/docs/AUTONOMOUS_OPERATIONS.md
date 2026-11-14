# Recurring operations, research and local engineering

The business worker now supports a recurring **plan → select approved work → execute → verify → archive → wait** loop. The contract creates work only from the owner's immutable encrypted menu. The planner cannot create a new operation, choose a new payment destination, modify spending policy, publish or contact anyone through this interface. This is a bounded operating loop, not a complete public business workflow.

## Owner authority and recurrence

`company_create_mandate` binds one encrypted planning scope, one to four encrypted work templates, the worker identity/profile version, a start and expiry, an interval from 60 seconds to 30 days, up to 1,000 lifetime runs and 1–24 runs per chain UTC day. Sixteen mandates are supported. Each cycle consumes two permanent task slots; pre-fund storage and keep a finite gas allowance. AI call/day/lifetime limits remain separate and may stop a mandate before its run limit.

The worker calls `company_run_mandate(id, expected_run)` when readiness permits. The contract creates a uniquely numbered planning task. `company_commit_plan` accepts only a menu index and encrypted plan evidence, then creates the work task from the **stored owner template**, rather than accepting new scope from a model or worker. The next cycle waits for both records to be archived. Missed intervals are not backfilled in a burst; the next due time is based on the actual cycle start.

The planner receives the bounded owner context, approved menu and previous archived result summary. Optional AI selects an index and reason. Without AI consent, it uses an explicitly labeled round-robin selection. A previous private artifact or local commit is never presented as a sale or production deployment. The worker persists encrypted planning evidence before committing it and reuses it after restart.

The owner can pause/resume with `company_set_mandate_enabled`. Pause and expiry block unfinished task advancement, new inference reservations and plan commits. They cannot undo an HTTP request or local edit already executed. `company_cancel_operation` cancels queued/active operation work and pauses its mandate. Cancelled records can be archived with `reason: owner_cancelled` and no success evidence; cancellation is not completion. Global freeze still applies.

## Local Gemma as an explicit development substitute

The user authorized a cheap local model while no NEAR AI account exists. The opt-in sandbox runtime uses **Gemma 4 E2B Q4_K_M** through Ollama, with model manifest digest `b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2`. Model identity is checked against the installed manifest before a request. The [Gemma/Ollama guide](https://ai.google.dev/gemma/docs/integrations/ollama) and [Ollama local-only configuration](https://docs.ollama.com/faq) document these tools. Local execution is not NEAR AI Cloud or TEE verification.

```sh
brew install ollama
OLLAMA_MODELS=/absolute/private/models OLLAMA_HOST=127.0.0.1:11434 OLLAMA_NO_CLOUD=1 OLLAMA_CONTEXT_LENGTH=4096 OLLAMA_NUM_PARALLEL=1 OLLAMA_MAX_LOADED_MODELS=1 ollama serve
# In another terminal, while that server is running:
ollama pull gemma4:e2b-it-q4_K_M
```

Only numeric loopback `127.0.0.1:11434` is contacted. There is no proxy, URL configuration, tool execution or remote fallback in the adapter. Context is 4,096 tokens, output at most 512, thinking disabled, one request with a 65-second outer deadline. The fixed installed model must match the pinned digest; no automatic download or model escalation occurs inside the worker. The model download is about 4.6 GB in this tested setup.

The adapter supplies fixed artifact/planning/repair JSON schemas through Ollama's [structured output format](https://docs.ollama.com/capabilities/structured-outputs), selected from the application's system instructions. Customer/source text cannot choose the schema. Independent validation still checks the result, including menu bounds, source IDs and approved edits. A schema constrains shape; it does not establish factual accuracy or grant new execution powers. An earlier unconstrained-JSON support run returned an invalid item shape and was rejected before delivery; it was not counted as a successful integration.

The existing contract policy authorizes calls under its logical `economy` label. Its NEAR AI rate-derived reservations remain conservative authorization/count estimates, not local invoices. Reports identify `local_ollama`, the actual Gemma model/digest, the separate `authorization_model`, zero cloud-provider charge and unknown local compute cost. This avoids labeling a Gemma response as a Qwen/NEAR AI result. Local and Cloud caches have distinct private identities. The local substitute is refused outside the sandbox network.

```sh
python -m executor.main run --config /absolute/private/worker/config.json --profile business-operations-v1 --autonomous --local-model
```

Without `--local-model`, the original explicitly consented and capped NEAR AI client remains the inference path. The local flag does not provision an account, stake, supply a Cloud key or establish hosted process compatibility.

## Prepare an encrypted mandate

Use the public business worker manifest and exact profile version. A planning scope is the existing `strategy_plan` scope with a brief, context, supplied sources and `use_ai`. Work templates use the same operation format described in [OPERATIONS.md](OPERATIONS.md).

```sh
python -m executor.operations_cli prepare-mandate --plan /private/plan.json --template /private/work.json --manifest /private/manifest.json --id maintain --profile-version 1 --interval 3600 --expires 1797000000 --max-runs 30 --daily-limit 2 --output-dir /absolute/private/prepared-mandate
```

Choose an actual future expiry for your chain; the timestamp above is only an example. Review `owner-call.json` and submit the exact `company_create_mandate` call with the owner wallet. `recovery.json` contains separate record keys for the plan/templates and must stay private. It can export any matching cycle task through the existing `export` command, including a tested local repository result. No preparation command signs or publishes.

The operator's receiver-scoped, finite-allowance key needs the existing operation methods plus `company_run_mandate` and `company_commit_plan`. It must not receive owner configuration/cancellation methods or general transfer authority. A changed mandate needs a new owner-approved ID; templates cannot be silently rewritten by the operator.

## Research retrieval

A `research_summary` source can now be `{"id":"reference","url":"https://example.com/page"}` instead of supplied text. Up to four explicitly approved sources are fetched through the existing killable, DNS-pinned public-IPv4 HTTPS boundary. Credentials, query strings, redirects, arbitrary loopback, scripts and unapproved resources are excluded. The exact bundled fixture remains available only in sandbox mode.

The encrypted report records HTTP status, retrieval time, original-body hash, extracted-text hash and truncation. It either produces an explicitly labeled source extract or asks the bounded model to summarize retrieved text. Source content is untrusted data. Retrieval/hash provenance does not establish factual correctness or implement autonomous source discovery. Retained evidence is reused after restart rather than refetching and inventing a different observation.

## Bounded repository repairs

`engineering_patch` adds an `engineering` reference to the usual scope:

```json
{"repository_id":"pricing","policy_hash":"SHA256_OF_CANONICAL_REPOSITORY_POLICY"}
```

The private `repositories.json` under the worker data directory contains `{"repositories":[POLICY]}`. Each policy has exactly `id`, absolute private `root`, exact initial `base_revision`, `editable` (1–4 tracked files) and `read_only` (1–8 tracked acceptance/support files). Canonicalize with Python `json.dumps(policy, sort_keys=True, separators=(',', ':'), ensure_ascii=True)` and hash its UTF-8 bytes. Bind that hash into the encrypted owner-approved scope. The repository must be a dedicated, clean, local repository without remotes, filters, includes or custom Git commands. Its HEAD must descend from the approved base. Never point this at an unrelated working checkout.

The initial executor supports small **pure numeric Python functions**. Imports, function calls, attributes, decorators, exponentiation, string operations and broader executable structures are rejected in generated source. Edits are exact replacements in approved source files; models cannot edit acceptance tests, select shell commands, install packages or add files. This does not implement general application engineering or a web-app builder.

On macOS, tests run in a separate copied workspace under `sandbox-exec`, with network access denied, protected company/repository/home data unreadable, and writes restricted to scratch space. OS libraries/system data remain readable. Generated-source restrictions also prevent code from altering the test runner. Read-only acceptance tests are owner-trusted inputs. CPU, output size, complexity and wall time are bounded; no universal memory-isolation claim is made. Linux engineering execution fails closed until an equivalent verified sandbox is implemented. Research, planning and artifact operations remain separate from that host limitation.

The executor first runs the original acceptance tests. If they already pass, it reports `no_change_needed` without another repair inference request. Otherwise it requests at most four typed edits, verifies their exact matches, independently reruns the same tests, and commits locally only on success. It records before/after test counts, output hashes, source hashes and the Git revision. A durable intent and compare-and-swap Git ref update recover interrupted commits without applying the same patch twice. Concurrent changes cause a halt and are preserved; there is no automatic reset, force push or public deployment.

## Verification

```sh
python -m unittest executor.test_autonomy executor.test_operations -q
PROOF_WORK_PYTHON=/absolute/path/to/python PROOF_WORK_LOCAL_MODEL=1 node integration/mandates_e2e.mjs
```

The integration uses a real isolated NEAR sandbox, restricted signing and actual isolated tests/Git commits. With the local flag it makes real Gemma calls; without it the inference fixture is synthetic. It checks owner/menu authority, pause, restart, recurrence, daily/lifetime limits, idle behavior, expiry and cancellation. Fast-forward advances only the isolated chain clock. The evidence records provider provenance and exact consumed source/WASM identities; it cannot establish live hosting or a complete public business workflow.

After a successful observed exit and sandbox teardown, run `python scripts/render_autonomy_evidence.py --sandbox-stopped`. This validates current consumed source identities, ZIP content and the captured Git commit before writing `.artifacts/autonomy-demo/index.html`. The actual source ZIP and Git bundle remain in a commit-named subdirectory. It is captured evidence of a two-file arithmetic repair, not a live company dashboard. The renderer does not start a worker or provision hosting.
