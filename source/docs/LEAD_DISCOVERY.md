# Read-only public directory lead discovery

This workflow lets the actual company owner approve one encrypted `research_summary` task to extract contact candidates from one to four exact public directory URLs. It does not perform global search, buy enrichment, call a model, establish identity or consent, contact anyone, or grant outreach authority.

The owner supplies a private request/context, exact directory pages, one to four literal matching terms, one to eight exact lowercase email domains, a maximum of one to four candidates, and optionally `locale: "en" | "es"`. The company language is a presentation default; the approved request language is immutable. Original email locators, quoted source text, URLs and hashes remain literal.

## Approval and retrieval boundary

The ordinary scope has exactly `profile`, `operation`, `brief`, `context`, `sources`, `use_ai`, `leads`, and optionally `locale`. `operation` is `research_summary`; `use_ai` must be the boolean `false`. Every source is exactly `{id, url}`. The extension is:

```json
{"profile":"public-business-lead-discovery-v1","terms":["web inspection"],"contact_domains":["example.test"],"max_leads":4}
```

All other extensions are rejected: recurring mandates, customer inbox, goal graphs, conversation control, images, engineering and knowledge input. Discovery is an ordinary separate owner approval. The operator can execute its exact approved scope, but cannot authorize discovery or change the filters. The full encrypted scope keeps the existing 2700-byte worker serialization limit; the encrypted result stays within 6000 bytes.

The existing `ScopedQA` fetcher retains public DNS validation, pinned numeric connections with original-host TLS verification, path confinement, absolute time/body bounds, and no redirect, proxy, script, form or external subresource execution. URLs cannot contain credentials, query strings, fragments, percent escapes or arbitrary ports. IP literals and private/reserved destinations are denied. The existing fixed bundled sandbox URL is the only production-code loopback exception; no arbitrary loopback exception was added.

Matching is literal and page-wide. It does not prove that a term and an email describe the same business, that a page is accurate or current, or that an address belongs to a person. Script/style/template content and mailto query/header recipients are excluded. Email addresses deduplicate without case; only exact approved domains survive.

Before any DNS or HTTP, the worker fsyncs a per-task `leads_fetch` intent bound to the encrypted `scope_hash`. An interrupted, failed or over-budget attempt remains awaiting owner review without polling or fetching that task again. Other eligible work can proceed. To request another fetch, the owner must inspect the retained attempt and separately approve a new task. No automatic fallback or retry occurs.

A successful result is cached encrypted, validated again before attestation, and reused byte for byte after restart. Recovery/export checks the exact scope, filters, source URLs, artifact, typed receipt and claim-review hashes. Offline validation checks receipt consistency; it does not refetch a directory or independently prove its body hash.

## Suppression and consent

An optional owner-maintained file at the fixed private worker path `leads-suppression.json` uses the existing protected `SuppressionList` format:

```json
{"schema":1,"suppressed":[],"opted_out":["sales@example.test"]}
```

The directory and file must be owner controlled, nonsymlink, and private (directory 0700, file 0600). There is no request-controlled suppression path or credential option. The worker validates the file before fetching and rereads suppression before finishing extraction. An unsafe file defers the task to owner review. If absent, the receipt explicitly records `suppression_applied: false`. This never establishes consent. Suppression is the snapshot used when the immutable result is created; cached receipts are not rewritten after later file changes.

Each candidate carries a deterministic ID, literal email, bounded page title, approved source IDs and original contact observations, with fixed `status: "uncontacted"`, `consent: "not_established"`, and `business_identity_verified: false`. The receipt commits the exact source list and policy, counts candidates/suppressed/domain-discarded records, reports bounded extraction and suppression presence, and fixes `outreach_authorized: false`, `messages_sent: 0`, `model_calls: 0`. Retrieved source receipts bind IDs, exact URLs, HTTP status, body/text hashes, UTC observation time and truncation flags. Results remain unverified copy.

## Browser workflow and privacy

`web-chain/src/leads-ui.js` exports `createLeadsUI({getState, stage, notice, requireCompany, invalidateDraft, lockControl, setControlDisabled, readTask, mount})`, returning `update()` and `clear()`. The main application supplies the current company/owner/profile and a fixed-company FINAL task reader. Review encrypts through `prepareLeads`, then uses the existing recovery-file-before-wallet approval flow. No directory is fetched during preparation.

The dedicated recovery viewer requires a matching private recovery file, exact archived task, connected owner, company, worker key/profile and current code pin. It displays literal candidates, observations and source body hashes, with explicit no-consent/no-contact notices and no contact buttons or active mailto links. Plaintext, forms, results and recovery references stay in memory and clear on account, company, language, manifest, profile, code-pin or external epoch changes. Late async callbacks cannot restore private data or enable old controls. There is no browser storage.

## Implementation and checks

Runtime: `executor/leads.py`, `executor/operations.py`, `executor/operations_cli.py`. Focused tests: `executor/test_leads.py`, `executor/test_leads_runtime.py`. Browser helpers/UI: `web-chain/src/leads-actions.js`, `leads-ui.js`, `leads-messages.js`; tests `web-chain/tests/leads-actions.test.mjs`, `leads-ui.test.mjs`, and `web-chain/tests/browser/leads-component.mjs` with its explicitly synthetic fixture.

The component acceptance uses actual Chrome, a production bundle and real encryption, with clearly labelled synthetic archived directory records. It proves exact NoAI preparation, literal quotes/hashes, wrong-key rejection, private epoch clearing, stale callback handling, Spanish labels and 390px layout. It performs zero model calls, wallet signatures, external RPC or directory fetches. Report: `.artifacts/leads-ui-component.json`.

The isolated chain acceptance is `integration/leads_e2e.mjs` with `integration/leads_worker.py`. It deploys the actual current company WASM in a private NEAR sandbox, uses separate real owner approvals and a restricted operator, and runs zero models. Its approved logical public fixture URLs map through a test-only transport to an owned loopback HTTP server with synthetic `.test` directory bytes. This positive fixture does not exercise production public DNS/TLS or claim live directory discovery. It checks owner/operator separation, durable pre-fetch intent, exact encrypted cache restart without refetch, private opt-out filtering, wrong-key and exact offline CLI recovery, failed-fetch owner review without repeat retrieval, unrelated-task progress and absence of unsolicited receipts on ordinary work. Evidence is recorded separately from the browser component, with source identities, attempt history and owned-process teardown.

Current acceptance completed on 2026-11-10:

- Focused Python: 21 passing tests (`executor.test_leads`, `executor.test_leads_runtime`, `executor.test_operations`). Focused JavaScript: seven passing lead action/UI tests.
- Actual Chrome component: six passing groups, zero page errors and external requests. Its report records every consumed Vite module, emitted bundle identities and the synthetic fixture hash. Current report SHA-256: `37fae1d974d353b034375eebd8a630f376e6a3e6b03bb24a3eed18753a88c72a`.
- Actual private NEAR sandbox: `4953f007-dee6-40a9-a5b0-129ac19e2a8f`, all eleven recorded checks passed. Positive discovery returned two synthetic candidates; private opt-out excluded Sales and retained Support. Exactly three synthetic directory fetches occurred across all processes, with zero repeated cached/failed-task fetches, model calls, Cloud requests or messages. The restricted operator could not authorize discovery. Successful fixture removal and owned worker/server/chain teardown completed. Receipt `.artifacts/leads-evidence.json` SHA-256: `d34b356aa0c2e29e452e60f57869efc94b85ed3eb40468d6d93009590acb1ceb`.
- The first chain attempt remains in `.artifacts/leads-attempts.jsonl`. Its positive task and exact cached restart passed, then the suppression file was correctly refused before network because the test configured a macOS `/var` alias instead of a canonical `/private/var` path. That task stayed for owner review and was never refetched. The private failed fixture is retained for audit. The harness corrected its path with `fs.realpath`; a fresh separately approved zero-model sandbox passed. No protected path rule was relaxed.

Run the focused checks with `.artifacts/venv/bin/python -m unittest executor.test_leads executor.test_leads_runtime executor.test_operations -q`, `node --test web-chain/tests/leads-actions.test.mjs web-chain/tests/leads-ui.test.mjs`, and `node web-chain/tests/browser/leads-component.mjs`. Run the separate actual chain fixture only in an available source-stable sandbox window with `PROOF_LEADS_SANDBOX=1 node integration/leads_e2e.mjs`. It never requires a model or provider key. Main application lifecycle and source-export hooks are owned and verified separately from the isolated component.
