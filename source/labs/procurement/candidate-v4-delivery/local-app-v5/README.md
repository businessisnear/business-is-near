# A company goal, a draft, and work you can verify

This local prototype joins a company goal to a bounded offer draft, an advisory
task queue, owner-approved native procurement, encrypted human-review output,
settlement and a linked company result. The owner compares the unverified draft
with their own facts before approving the exact public review brief and limits.

The reviewer is a seeded local test role controlled by the evaluator. This does
not hire an actual person. Only one review task executes. Publication is a later
suggestion; recurrence and ongoing company operation are not implemented. The
public Nightly testnet workspace is a separate application.

## Verify and run locally

Use Node 22. From the repository root, first verify the explicit source:

```sh
node source/scripts/verify_owner_tools_source.mjs
npm --prefix source/labs/procurement/candidate-v4-delivery/local-app-v5 test
npm --prefix source/labs/procurement/candidate-v4-delivery/local-app-v5 run test:proxy
```

The current company profile has 83 focused checks: 30 repaired original-request
checks, 28 company/duration checks and 25 affected base guards. This is a different
suite from the historical 83 financial/V2 checks; the old 40-row module inventory
and inner verifier are historical, not current acceptance. Seven portable proxy
checks are separate. These checks use synthetic terminal states/effect ports and
perform no live model or native transaction. Install the existing contract lockfile and prepare its local dependency link:

```sh
npm ci --prefix source/contract
node source/labs/procurement/candidate-v4-delivery/setup-local-dependencies.mjs
```

The pinned financial WASM is unchanged: SHA-256
`bf13e856506ebfd3e2a532d79e9a3a657436ca299ae34e64654465b00633091d`.
The [parent module guide](../README.md) documents its build and native protocol
boundaries. Do not open this folder's raw `index.html`: it needs its local server.

Explicitly start a **fresh** local sandbox and browser server:

```sh
V5_LOCAL_DURATION_MINUTES=30 node source/labs/procurement/candidate-v4-delivery/local-app-v5/server.mjs
```

The default planner is clearly labelled **deterministic API-contract mock**. It
is not a model inference. The server creates new local role wallets, deploys the
pinned contract, prints one loopback URL and stops at the configured deadline.
It defaults to 15 minutes; only integer duration settings from 15 through 30 are
accepted. The application-request limit remains 32. Setup transactions are
separate from the 11 application transactions in the complete journey.

For an actual local Gemma trial, supply an **already running**, user-controlled
loopback Ollama service with cached `gemma4:e2b-it-q4_K_M`. The model, weights and
service are separate prerequisites; this source does not install or start them.
Run the portable one-attempt advisory proxy:

```sh
node source/labs/procurement/candidate-v4-delivery/local-app-v5/model-proxy.mjs http://127.0.0.1:OLLAMA_PORT
```

Replace `OLLAMA_PORT` with that service's port. The default exact input matches
this UI's fictional Harbor Studio example. For different facts, pass a private
JSON file with exactly `name`, `goal`, `facts`, `budget` as the optional second
argument, and enter the same values in the app. Keep input files out of Git.
Use the proxy's printed URL as `V5_PLANNER_URL` in the fresh server command.

The proxy verifies cached model digest
`b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2`,
then maps the exact one-shot completion request to `/api/chat` with exported
`PLANNER_RESPONSE_SCHEMA`, `think:false`, context 4096 and at most 512 output
tokens. It refuses external endpoints, changed requests, tools, truncation,
wrong model/digest and retry. The original response content is not rewritten.
It waits up to 10 minutes for a request and closes shortly after the one accepted
attempt; it does not stop the user's model service. No key or Cloud account is
used. Stop your separately owned model service yourself when finished.

The recorded actual Gemma trial used a private finite supervisor with these
same model, digest, schema, thinking and token settings. This portable helper
has seven transport/strict-byte tests and was not itself run against a live model
during packaging. Direct Ollama `/v1` JSON-object mode is not presented as exact
reproduction: the explicit schema/thinkfalse translation above matters.
A malformed UTF-8 response/request is rejected without replacement decoding.
A malformed or unknown result authorizes no plan and must not be silently
rewritten or replayed. Default deterministic mode remains independently usable.

## Follow one complete company task

1. As **Company owner**, enter the goal and facts. The default fictional example
   is Harbor Studio: prepare a factual offer for a one-hour photography session
   with five edited images. Choose a business budget from 0.2 to 0.4 local NEAR;
   the one reviewer price is 0.1. Storage collateral and network gas are separate.
2. Request the draft and plan. Compare the unverified draft against all your
   facts, read the typed queue and exact public brief, then approve those words
   and limits. This review does not fund, publish or sign a native transaction.
3. Prepare the original delivery keys and review the native mandate funding.
   Its goal, plan, draft/brief scope and criteria commitments bind the approved
   company work; the planner cannot change recipients or authorize spending.
4. As **Company operator**, post the approved job. As owner, separately review
   and share its exact brief. This makes the draft and facts public permanently
   on the local chain, including transaction arguments.
5. As **Independent reviewer (test role)**, read the brief and offer the bounded
   price. As owner, approve that exact award. As reviewer, claim the work, correct
   unsupported claims and wording against the owner facts, then encrypt/deliver.
6. As owner, open the stored ciphertext, read the actual output and accept only
   if it meets the brief. Both original recipients are checked. Acceptance is
   separate from payment. As reviewer, withdraw the original payment; as owner,
   close the budget and withdraw unused business principal.
7. Choose **Link this verified result to my company**. The server accepts no
   client-supplied receipt/state: it re-reads the validated original native job,
   full policy/recipients, final transaction inventory and exact native transfers.
   The result links the draft, human-output content, delivery and transaction
   commitments. The suggested next publication review grants no new authority.

Every native step has its own exact cost review. With the 0.4 budget, reviewer
principal is 0.1 and unused owner principal is 0.3 local NEAR. Record storage
collateral remains locked in this prototype; these amounts are not net wallet
balances after storage and network fees.

## State, recovery and proof boundaries

Company goal/queue and signing state live in server RAM. The local chain retains
their approved commitments; this is not durable production company storage.
Output-opening keys live only in the page's memory. Finish opening and accepting
before reloading. Same-live-server inspection is supported; process restart,
production RSA recovery and real Nightly signing are separate unimplemented work.

An unresolved original request blocks new preparation and company reconciliation.
Inspect that same request. Only the exact positively unsigned refusal can be
explicitly discarded; unknown signing/broadcast state is never permission to
replay, recreate a mandate or replace a recipient. Stop the owned server with
Ctrl-C, verify its sandbox stopped, and preserve generated private run files.
Do not reuse local wallet keys or copy `protocol-runs/` into Git or a download.

The repaired trial is a fresh isolated 30-minute run with one observed local Gemma
response, eleven original FINAL transactions, two native principal transfers and
a linked company result. An initial UI harness timed out after 25 seconds; saved
state then showed the same completed model plan, no owner approval and zero app
requests. The 14-stage continuation used that same plan/app, with no model or
transaction retry. Its labelled stills are not continuous footage. Prior partial
and completed generations retain their own evidence; this is not ten complete
successful runs, real hiring, recurrence, public Nightly, Cloud/TEE or mainnet.
See the repository's current verification summary for the separate proof.

The prior trial generation's prebirth result-reader and delayed-ACK cache issues
were repaired in this separate generation. The repair has 30 focused author
checks and 12 independent stage/storage/concurrency checks. The recorded repaired
trial exercises the positive path, not live fault injection of every branch.
Restarted/failed-storage uncertainty and signed originals remain UNKNOWN; there
is no automatic reset, re-sign or rebroadcast. P3 reviewer-input prefill and lack
of a visible countdown remain: review the text independently and inspect the
finite deadline in technical details.

The broader historical 44-area catalogue still lacks its complete original audit
corpus. This V5 task does not promote those historical receipts into current-source
acceptance or remove that known audit error.

Original project materials remain [all rights reserved](../../../../../LICENSE).
Preserve the existing [third-party notices](../../../../THIRD-PARTY-NOTICES.md).
