# Owner-reviewed goal decomposition

Goal planning proposes concrete requests and an actual dependency graph within an
owner-approved operation policy. The existing menu planner chooses one of the
owner's already written requests. These are different workflows. Neither grants
the model a wallet, creates child tasks automatically, changes financial limits,
retrieves new sources, sends messages or verifies business facts.

## Exact request and graph

An existing encrypted `strategy_plan` operation may carry top-level `goal_plan`:

```json
{
  "profile": "owner-goal-plan-v1",
  "company_id": "company.test.near",
  "plan_id": "0123456789abcdef",
  "revision": 1,
  "min_steps": 2,
  "max_steps": 3,
  "require_dependency": true,
  "allowed": [
    {"operation": "research_summary", "use_ai": false},
    {"operation": "website_build", "use_ai": false}
  ],
  "previous": null
}
```

The ordinary `brief` is the goal; context and 1–4 text sources remain exactly
owner supplied. Initial decomposition requires explicit `use_ai: true`. Optional
top-level `locale` accepts exact `en` or `es`; absent locale preserves legacy
English shape. The actual company identity comes from connected/trusted runtime
configuration and is compared before preparation, recovery and worker execution.

The owner chooses 1–4 step bounds and a boolean dependency requirement. Requiring
a dependency also requires at least two steps. Allowed operations are ordinary
research summaries, website drafts, content, support, outreach, social,
advertising and analytics. Each operation has an owner-fixed inference policy.
This version excludes recursive strategy/control, engineering, media, adopted
knowledge, recurring mandates and inbox grants.

The model returns exactly `{reason, steps}`. Reason is at most 300 characters.
Each step has exactly `{operation, brief, depends_on}` with a concrete request of
at most 240 characters. Dependencies are sorted, distinct earlier 1-based indices.
Forward/missing dependencies, cycles, extra authority fields, unapproved types,
duplicate policies and out-of-bounds graphs are rejected without regeneration.
The model does not return task IDs, source/context changes, inference policy,
budgets, recipients or transaction instructions.

The canonical plan ID is `goal_<plan_id>_<revision>_plan`. Its encrypted evidence
contains a compact normalized graph and the ordinary private artifact, provenance
and mandatory unverified claim-review receipt. Each normalized step contains
`step`, deterministic `task_id`, `operation`, `brief`, `depends_on` and
`scope_sha256`. Its selected ordinary scope is reconstructed from the exact
owner context/sources/locale and the step operation/request. Inference permission
comes from owner policy. The graph hash commits the canonical original request,
reason, step order, task IDs and selected scope hashes. All limits remain the
existing 2,700-byte scope, 6,000-byte plaintext record and 512 output tokens.

## Separate owner approvals and lineage

The parent must be archived before a child can be prepared. Every child is a new
ordinary owner-signed operation with canonical ID
`goal_<plan_id>_<revision>_step_<n>`. Its encrypted `goal_ref` has exact fields
`profile`, `company_id`, `plan_task_id`, `evidence_hash`, `plan_hash`, `step` and
`dependencies`. The required public dependency list is the plan ID followed by
the graph's declared earlier child IDs, in canonical order, with at most four
entries. Existing on-chain rules require those prior IDs to exist; dependent
children must therefore be approved in topological order.

JS preparation requires explicit connected company identity and owner, plus the
matching private recovery. It decrypts the exact archived parent ciphertext and
compares authenticated scope/evidence to the supplied plaintext before creating
a child. Raw prose and a caller-supplied graph are insufficient. Each child gets
its own encrypted scope and recovery key. The owner cannot silently alter its
request, context, sources, inference policy, locale, graph position or public
dependencies while using the old parent commitment.

The worker reads and authenticates parent scope/evidence from the same pinned
company's FINAL RPC surface, checks exact owner/worker/profile, canonical IDs,
graph/source/scope commitments and public dependencies, and reconstructs the
expected child scope. It also authenticates completed declared sibling scopes and
results. Known missing or pending lineage raises `GoalDeferred`, allowing other
eligible work to continue. Owner, company, worker, hash or network drift is fatal.
The worker rechecks lineage before cached evidence attestation without rewriting
the cached ciphertext. An unknown model outcome retains the existing reservation;
there is no automatic generation, translation or provider retry.

Dependencies order work and authenticate lineage. Original source facts and
context remain unchanged. A child may additionally carry optional `goal_ref.inputs`,
an explicitly selected, sorted list of one to three declared earlier dependencies:
`{step, evidence_hash, summary}`. A summary is the first 120 Unicode code points of
that dependency's authenticated archived artifact summary. Each selection adds
one supplied-text source named `goal_result_<step>` with the exact text
`Unverified prior result (<canonical child ID>): <summary>`.

These summaries are unverified inputs, not facts or new authority. A model brief
does not select them. Browser preparation requires the matching private recovery
for every selected archived result, decrypts its actual scope and evidence, checks
the same owner/company/worker/graph and displays its summary and evidence hash for
the later child's separate approval. The worker independently reopens the actual
FINAL dependency before generation and cached attestation. Pending input archives
defer work; changed evidence or summary bytes reject it. Original source IDs must
not conflict, and all existing four-source and 2,700-byte limits still apply. An
omitted `inputs` field preserves the original child scope and evidence shape.

Later revisions reference the immediately previous canonical plan and up to four
exact archived child evidence hashes through `previous`:

```json
{
  "plan_task_id": "goal_0123456789abcdef_1_plan",
  "evidence_hash": "<64 lowercase hex>",
  "results": [{"step": 1, "evidence_hash": "<64 lowercase hex>"}]
}
```

The worker authenticates/decrypts these actual records and validates their
original graph bindings. Summaries are bounded to 120 characters each and passed
as `previous_results_untrusted` to the next owner-approved model request. They
remain unverified statements. The implementation does not fabricate historical
progress, read arbitrary accounts/URLs or recursively expand history.

## Integration and checks

Python helpers are in `executor/goal_plan.py`. `operations.py` routes only the new
explicit controls, preserving existing operation/conversation behavior. The CLI
derives canonical child IDs/dependencies and validates exported graph/result
evidence. The local model adapter recognizes one fixed trusted system prefix and
uses the fixed graph JSON grammar; existing grammar prefixes remain unchanged.
No company ABI or WASM change is required.

New goal CLI prepare/export paths require explicit `--company-id`. Preparation
derives dependencies from the encrypted goal reference rather than caller-supplied
dependency instructions. Export checks the canonical graph task ID and exact
public dependency list. Legacy CLI paths keep their existing arguments and
behavior. Standalone child recovery proves its own ciphertext, source commitments
and referenced parent identity; independently reopening the parent also requires
the parent's private recovery material.

JS helpers are in `web-chain/src/goal-plan-actions.js`:

- `goalScope`, `validateGoalScope`, `validateGoalStepScope`, `goalTaskId` and
  `canonicalGoal` define exact owner requests and portable commitments.
- `validateGoalPlan`, `selectedGoalScope`, `goalStepDependencies` and
  `goalStepScope` validate/reconstruct exact graph choices.
- `prepareGoalPlan(scope, manifest, version, companyId)` requires a connected
  company binding before encryption.
- `prepareGoalStep({task, scope, payload, step, companyId, owner, recovery, dependencyInputs},
  manifest, version)` authenticates the archived parent and creates one separate
  child approval. Optional `dependencyInputs` contains sorted `{task, recovery}`
  pairs for selected archived dependencies; raw caller summaries are insufficient.
- `validateGoalStepResult` binds result reference, source hashes, locale and
  no-inference/model provenance; generic recovery continues its normal artifact
  validation. New recovery paths require explicit connected company context.

Offline adversarial checks are `executor/test_goal_plan.py` and
`web-chain/tests/goal-plan-actions.test.mjs`. They cover graph authority/size/type
boundaries, cross-language Unicode commitments, foreign company/owner/parent,
exact child dependencies and source scope, pending lineage, actual authenticated
encrypted parent recovery and untrusted prior-result summaries. They make no
model call. Actual Gemma/sandbox evidence and owner UI acceptance are separate;
neither is implied by these unit checks.

The explicitly gated integration command is
`PROOF_GOAL_PLAN_MODEL=1 node integration/goal_plan_e2e.mjs`. It must be run only
after approval for one actual local Gemma call and after releasing other runtime
source verification holds. `integration/goal_plan_worker.py` bounds each process
and refuses inference without its explicit local-model flag. The fixture's
owner policy requires 2–3 steps and at least one real dependency; the graph is
the model's actual output and is not hardcoded. Invalid or unknown output fails
the run with no regeneration, fallback or second inference.

The intended proof covers separate actual owner-signed child approvals,
independent recovery keys, on-chain dependency waiting, no-model child source
extracts and exact plan ciphertext reuse after restart. It then queues a later
separately owner-approved revision and reads its authenticated prior-result
context without making a second model call. That read does not claim a second
generated plan. Attempt records/source pins belong in
`.artifacts/goal-plan-model-attempts.jsonl`; successful evidence belongs in
`.artifacts/goal-plan-model-evidence.json`. A failed attempt retains its private
fixture for inspection. UI acceptance, model factual quality, actual delivery,
payments and public deployment remain separate.

## Recorded execution

The first actual integration attempt passed with exactly one local Gemma call:
`97bf257e-1d0d-4485-984a-e7e8c962997f`. The evidence file
`.artifacts/goal-plan-model-evidence.json` has SHA-256
`fc542939a65b2dc44d28a53729b71a1d4f4f3cca4d71c7c50e491ce2d08b0d80`.
Its source pins, actual FINAL owner/operator receipts and per-process counters are
recorded with the model output. No graph was substituted or regenerated.

The model selected a three-node chain: `research_summary` → `content_draft` →
`content_draft`. It proposed a company-fact summary, main website copy and a short
explainer. All were allowed types; the model chose content drafts rather than the
also permitted website artifact operation. Three separate real sandbox owner
approvals used independent child recovery keys and exact graph scopes/dependencies.
The chain reported dependency waiting before work. All three children produced
explicit no-model source extracts, retained the original supplied Unicode facts
and source hash, and were archived. They are private artifacts, not a published
website or delivered campaign.

The plan was cached before attestation, the worker restarted, and the identical
ciphertext/hash was attested with zero repeated completion/transport calls. An
actually owner-approved second revision was queued, and its actual archived prior
child summaries were authenticated read-only as untrusted context. It did not
generate a second plan. There was one on-chain AI reservation and completion,
zero Cloud requests, and no business revenue, external delivery or payments.

The third generated request referred to using main copy as context. This version
does not automatically add that generated sibling copy as a new source. All copy
remains unverified and requires owner review; the execution proof establishes
bounded graph planning, exact approvals, scheduling and provenance rather than
semantic completeness of every proposed work request. Owner UI acceptance remains
separate from this worker/protocol evidence.
