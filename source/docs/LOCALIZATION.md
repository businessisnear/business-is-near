# English and Spanish company workflows

The company contract and worker support exact `en` and `es` values. Spanish
presentation uses Puerto Rico conventions (`es-PR`); English uses `en-US`.
Unsupported values, including `null`, `es-PR` in an approved scope, and arbitrary
instruction strings are rejected. Legacy requests without `locale` mean English.

The contract/worker implementation does not claim full application translation.
Contract, action boundary, worker and UI acceptance are distinct. Coverage must
be reported for the flows actually exercised; knowledge,
native app and the separate QA console are not translated by importing a module.

## Persistence and owner authority

The authoritative setting is `company_state.locale`, default `en` for a
new company and legacy state. `company_set_locale({locale: 'en' | 'es'})`
requires the actual company owner and is nonpayable. Operators and customers cannot
change it. The setting uses prefixed storage rather than a serialized treasury
state migration. The setter changes only this setting and its event; existing worker
profiles, financial policy, grants, queued requests and accounting stay intact.

Wire the setter through the existing typed action whitelist, with exact argument
keys, a fixed gas limit, zero attached deposit, and `ownerOnly: true`. Review must
name the requested language and normal network gas. Recheck the owner, code pin,
account/company and pending intent before requesting a wallet signature. Reflect
the new setting only after reading finalized state; reconcile redirects and
unknown outcomes using the existing pending-intent flow.

`createLocaleContext()` stores only the public preconnection browser preference
under `proofwork-business-locale-v1`. It never writes company state. After a
company is connected, call `bindCompany(contract, company_state.locale ?? 'en')`;
the authoritative company locale wins over that browser preference. `clearCompany()`
returns to the browser preference. A missing/corrupt/blocked local store defaults
to English. No prompts, plaintext, provider secrets, wallets or recovery keys are
stored by localization.

## Approved scope and worker integration

1. Add optional top-level `locale` to the exact approved operation scope and both
   conversation scope variants. Validate it with `scope_locale()` / `scopeLocale()`.
   Do not add it to sources, source IDs or arbitrary prompt instructions. Capture
   the selected locale before encrypting the new request; display it during review.
2. Keep the existing 2,700-byte serialized scope and 6,000-byte plaintext encrypted
   record limits. Including a locale does not increase either bound. Scope hashing,
   conversation canonical JSON and approved decision links must include the exact
   new field. Do not normalize source Unicode or rewrite old scope commitments.
3. Read the language from the decrypted authenticated scope, rather than the
   current company default. Append `language_instruction(scope_locale(scope))`
   to the existing trusted system instruction for new explicit locale requests.
   Keep the original system prefix intact so the pinned local model schema
   selector still applies. Do not accept a source-supplied instruction, make a
   second model call to translate, retry a paid call, or select another provider.
4. `source_extract_artifact(scope)` keeps the exact existing English behavior by
   default and translates only its fixed extraction summary for Spanish. Briefs,
   source excerpts and source IDs stay literal. Continue calling the normal scope
   and artifact validators before/after extraction. Direct quotations are not
   represented as translated text.
5. New explicit-locale encrypted results carry `locale` equal to the
   approved scope. Recovery validates exact equality. Legacy scope/result pairs
   without it keep their existing schemas and English meaning. A current company
   language change must never relabel the language of old generated work.
6. Keep artifact provenance and unverified claim-review receipts intact. Translated
   labels do not create verified claims, independent evidence, delivery or revenue.
   Existing category detection patterns are English; Spanish category-detection
   parity is a separate task and is not claimed by these helpers.

Owner conversation choices and approved/rejected decisions retain their
original scope locale. Stored fixed protocol titles, proposal/rejection notices
and rejection artifacts remain unchanged English strings. The UI translates their
presentation. Model-written reasons and deterministic planner selection summaries
use the approved locale. Locale does not grant execution authority.

Customer messages accept optional top-level `locale` as a presentation preference
only. The effective response language is explicit message locale, else encrypted
owner-policy locale, else English. A customer cannot change the company setting,
operation, inference consent, retrieval scope, financial policy or other authority.
An explicit customer message locale must match the encrypted reply locale exactly.
A legacy message may inherit its owner's typed policy locale; offline customer
recovery can validate the returned enum but cannot independently decrypt the
owner-only policy. Changing the company default does not require recreating an
inbox grant.

Image scopes use the same optional top-level `locale`. For explicit locales only,
the internal image approval, identity/cache commitment and compact receipt include
`requested_locale` with that exact value. The fixed trusted vision suffix requests
caption and uncertainty in that language and explicitly leaves `visible_text` in
its original language. Fixed artifact titles and field prefixes stay protocol
English. Legacy image identities/prompts/receipts omit the new field. The exact
4,096-byte padded prompt, 4,352-token input reservation, 512-token output ceiling,
local-only backend and existing record limits remain unchanged. Offline tests prove
typed binding and cache conflicts; actual Spanish vision quality is not established
by the separate text-generation run.

## UI integration

Use `t('English application label', locale, {parameter: literalValue})` for dynamic
labels and fixed errors; unknown error messages stay literal. Pass the locale
explicitly at the rendering boundary. `statusLabel()` translates only known
status enums. Do not run generated drafts, quotations, user facts, account IDs,
hashes, URLs, ciphertext, recovery JSON or arbitrary technical output through a
whole-document text replacement.

For static leaf labels use `data-i18n="English application label"`. A label that
contains a form control or styled child should mark a separate leaf `<span>`.
Use `data-i18n-placeholder`, `data-i18n-title` and `data-i18n-aria-label` for these
three allowlisted attributes. `applyDocumentLocale(document, locale)` updates
the document language and calls `translateMarked()`. The helper never observes
mutations and skips nested content, user-editable content, `pre`, `code`, scripts,
styles, templates and `[data-i18n-literal]` subtrees. It does not replace form values.

`formatDate(value, locale, options)` uses `Intl.DateTimeFormat`; retain explicit UTC
time in transaction review and pass a chosen timezone when the flow requires it.
`formatNear()` and `formatUsdNanos()` format exact integer units without floating
point conversion, rounding or foreign exchange. A language change cannot turn a
NEAR deposit into USD, or make a reservation estimate into a provider invoice.

Before asynchronous preparation/recovery, capture a locale ticket using
`context.capture()`. After awaiting, require `context.isCurrent(ticket)` as well
as the existing account/company/form checks. Switching locale or company and
switching back invalidates old tickets. Invalidate a prepared approval and clear
old plaintext views when the effective locale changes so later callbacks cannot
render under another language or revive a stale approval. Updating the same
finalized company/locale during polling leaves valid tickets intact.

## Offline checks and remaining evidence

Run `.artifacts/venv/bin/python -m unittest executor.test_localization executor.test_localization_integration` and
`node --test web-chain/tests/localization.test.mjs`. These cover strict enum
validation, literal Unicode source hashes, actual encrypted Unicode roundtrip,
browser preference reload, company precedence, stale locale tickets, explicit
DOM-label boundaries, dates and exact separate currencies. No model or browser
is invoked by these tests. The existing operations, conversation, inbox, media,
knowledge and revocation suites also pass with missing-locale legacy behavior.

`node contract/test/company_locale.mjs` exercises the actual compiled contract in
an isolated local NEAR sandbox, including owner-only changes, invalid values,
nonpayability, persistence through other calls and unchanged treasury/profile.
Its public receipt is `.artifacts/company-locale-protocol.json`; it makes zero
model or provider calls.

`PROOF_LOCALIZATION_MODEL=1 node integration/localization_e2e.mjs` is a separate,
explicitly gated one-call local Gemma proof. Never use it as an automatic retry:
attempts and source pins are retained in
`.artifacts/localization-model-attempts.jsonl`, including a failed attempt's private
fixture location. It checks literal Unicode quotes with a no-model extraction,
then an owner-approved Spanish draft, a pause after encrypted cache persistence,
a company default change to English, restart without regeneration, exact cached
ciphertext attestation and offline recovery. It does not call NEAR AI Cloud.

The contract receipt establishes its owner setting, rejection and persistence
checks. A passing model receipt is separate evidence for the Spanish text/cache
flow. Browser reload, errors, booking and owner-chat checks still require their
own acceptance evidence. Local Gemma evidence is not NEAR AI Cloud evidence;
provider-account blockers and remaining application translation remain separate.

## Recorded local execution

The company locale protocol passed on the compiled company WASM. Its source and
WASM fingerprints are recorded in `.artifacts/company-locale-protocol.json`.

The actual Spanish text flow passed with exactly one local model transport and
one on-chain reservation/completion. Evidence is
`.artifacts/localization-model-evidence.json` (SHA-256
`c8fe939612564306f8e13d6b2585a69c66d6ecdb0ff5eeccacaaf76a3c4945a6`). The
company default changed from Spanish to English after the Spanish result was
cached but before attestation. The restarted worker made zero completion and
transport calls and attested the identical cached envelope/hash. Offline export
recovered the exact Spanish payload. A separate no-model extraction preserved
the original Unicode quotation, combining marks, USD/NEAR amounts and source hash.

The initial attempt (`91958926-82f5-40e6-942d-75cdaddb038a`) stopped on a harness
phase assertion before inference: an archived extraction first needed its normal
private-cache reconciliation tick. Every completion/transport counter was zero.
The failed attempt, source pins and retained private fixture are recorded in the
append-only attempt JSONL; `.artifacts/localization-model-e2e.log` retains its log.
The corrected bounded setup advanced that reconciliation tick and started the
model task before the separate inference step. The passing attempt is
`38b8b533-7b94-4f1e-9581-cd483d511b38`, with its log in
`.artifacts/localization-model-e2e-rerun.log`. No inference was regenerated or
retried, and no Cloud request, external message or business payment occurred.

The Spanish draft added correction/implementation wording beyond the supplied
inspection-only facts. It remains unverified and requires owner review; the
English claim heuristic did not detect that semantic expansion. The passing
language/cache result does not establish factual correctness or production copy.

## Main workspace browser acceptance

The source-bound main browser rehearsal passed ten groups with five actual FINAL
owner transactions and zero inference requests:
`.artifacts/studio-locale-browser/20261110T154340047Z-cd5f184b/report.json`
(SHA-256 `dfbb7dda0e05072c2211e6530dcdbfca36a6e5d3de425614596c8a413c21074d`).
Its 137 selected file identities stayed unchanged; owned processes exited cleanly
and its private fixture was removed. This is historical evidence for that source
snapshot; later integrations require their own final candidate verification.

It exercised public preconnection preference, finalized company authority over
that preference, owner-reviewed persistent `en`/`es` changes and reload, an actual
No-AI Spanish task and authenticated encrypted recovery preserving exact English
and combining-Unicode source bytes, customer reply-language preparation without
sending a message, customer-disabled company settings, private menu/form clearing,
and old Spanish result recovery after the company switched to English. Existing
scope/evidence hashes stayed unchanged, and a language change invalidated a stale
prepared request and decrypted result. Viewport captures at 390 pixels show the
Spanish unverified/English-heuristic warning, customer controls and validation
error without horizontal page overflow. Browser-native file-picker strings remain
under the browser's own language setting.

The seed-account controller signed actual local NEAR transactions. This was not
an external browser-wallet or hosted-user test. Customer message language binding
is additionally covered by encrypted helper tests; no customer message was sent
in this zero-inference browser run. Four earlier development rehearsals were
rejected for harness details/async preparation/result-action/inbox-selection
errors; their failure records remain under `.artifacts/studio-locale-browser/`.
They are not counted as passing acceptance or model evidence.
