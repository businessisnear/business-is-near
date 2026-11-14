# Public Pages frontend

This opt-in build publishes a testnet guide, wallet-led founder setup, business
workspace, owner-published website reader and private-authentication refusal
page. It never exposes a private operator library or enables mainnet. The
separate operator service must be running before admitted work can be approved;
opening this site does not start that service. The current recovery mode pauses
new company creation and setup even when the shared heartbeat is online.

Install the existing pinned dependencies with `npm ci`, then run:

```sh
npm run test:public-testnet
npm run test:founder
npm run build:public-testnet
```

The default generated output is `dist-public-testnet/`. The builder also permits
the publication repository's dedicated `docs/app/` directory, but clears its
selected output. For release updates, build the default directory and use the
preserving overlay documented in the repository's `DEPLOYMENT.md`; keep every
older hashed asset and refuse a same-name asset with different bytes.

The builder refuses symlinked ancestors and excludes Vite's local `public/` fixture directory. Keep
`docs/index.html` as the separate project landing page. The app uses relative
assets and navigation under the Pages project path.

The public build sends its testnet RPC requests to the fixed
`https://test.rpc.fastnear.com` provider. A page URL or public deployment config
cannot select another RPC. Requests omit credentials, refuse redirects and send
no referrer. The shared local tools keep their existing client default; the
public build still checks that the provider reports the testnet chain.

`src/public-testnet-config.json` contains public identities only. A prepared or
unknown deployment has no live-company button. Change it to `finalized` only
after independently checking the actual public testnet deployment, code hash
and finalized business worker encryption identity. Rebuild after that change.
This status is a deployment observation, not an uptime guarantee. Opening the
example rechecks current code and worker identity against those public pins.

Visitors can inspect the example without a wallet. Its operator-held testnet
keys are never part of the frontend. Only an actual company owner can approve
that company's work. The separate founder setup verifies its pinned factory and
company template, creates a company through the owner wallet, and prepares its
encrypted mission, two task slots, fixed worker profile and bounded AI policy.

The public UI supports individual `content_draft` and `website_build` tasks.
The final dispatch checks the allowed operation again. Recurrence, private
media/documents, inbox/bookings and other operator tools are unavailable in
this build. Public mode refuses local fixture/private API entry before fetch;
revealing hidden DOM controls grants no private service authority. The public
callback clears wallet fragments and refuses authentication without forwarding
them. Its return link stays relative to the app directory.

The demonstration uses the pinned local Gemma mock through the bounded NEAR
AI-compatible client. This does not verify Cloud billing, TEE execution,
continuous hosting, commercial outcomes or universal feature parity. Existing
separate local/operator builds retain their original workflows.

An optional `result_url` can point only to a same-app `./example-result.json`
(or `./example-result-<label>.json`). The recorded draft appears only for a
finalized pinned demo and the exact bounded public schema. It must be curated
from one actual archived synthetic content or website task after freezing and key revocation;
never copy recovery files, record keys or private worker files into this output.
Text is rendered with safe DOM APIs. Transaction links are derived from validated
public hashes. The record is a completed example, not a running worker claim.

## Guided wallet journey

`founder.html` is the public owner-led setup. Its immutable deployment pins come
from `src/founder-config.json`; `prepared` refuses activation. Root must replace
prepared identifiers only after actual deployment verification. The existing
retired example and its separate `src/public-testnet-config.json` remain intact.

### Current recovery admission

`src/founder-service-policy.js` fixes this client to the original company’s
remaining AI website revision:
`harbor-studio-a94eef.bin-factory-986bd42f.testnet`. Creation, creation review,
setup preparation and setup dispatch refuse before new wallet authority can be
requested. Other companies are not marked ready for new work. Their records,
result recovery, original-action reconciliation, backing-refund inspection and
owner publication remain available through the existing separate paths.
Existing task cancellation also remains available; this gate blocks new work,
not every owner-approved action on other companies.

For the original company, readiness reads its company state, owner-approved
policy and original archived task at the same FINAL block as the heartbeat and
restricted worker permission. Exactly one used slot, no active task, the original
policy version/count and a fresh finite heartbeat are required. Preparation admits
only an ordinary AI website revision. The business workspace repeats admission
checks before review and immediately before wallet dispatch, refusing owner,
company or epoch changes. The worker must separately arm the exact prepared task
and scope before its owner approves it; frontend eligibility is not proof that a
request is armed. No second replacement is admitted after the remaining slot is
submitted.

This gate restricts the current frontend, not the contract. Older cached bundles
and direct contract callers remain outside it; a shared factory heartbeat does
not prove general company enrollment or fleet availability. The general worker
is stopped, and publishing this client does not activate the separate temporary
worker. Its original lease remains unchanged. These checks run offline:

```sh
node --test tests/founder-service-policy.test.mjs founder-journey.test.mjs public-testnet.test.mjs tests/founder-next-actions.test.mjs
```

The broader setup workflow below describes the implemented normal journey.
It is paused for new companies in this recovery release.

The guided pilot accepts a named `.testnet` or implicit testnet wallet whose
current finalized account has exactly one Ed25519 FullAccess key. It reads that
public key and asks the owner to review its custody powers. No wallet private
key is imported. Accounts with multiple or unsupported owner keys receive a
clear unsupported-state explanation instead of choosing a key blindly. The
factory enforces the exact reviewed original key during the actual signature.

The guided founder and founder-bound workspace choosers use Nightly's injected
browser-extension connector only, pinned at WalletSelector 10.1.4. Open the app
in the browser where Nightly is installed and select NEAR testnet in the wallet.
An embedded Orca page does not inherit Chrome extensions; the chooser explains
a missing extension. Nightly does not use a web-popup reservation. The connector
rejects mainnet and custom-provider initialization. Its two added packages and
license texts are listed in `../NIGHTLY-NOTICES-ADDENDUM.md`.
Offline injected-metadata tests do not prove human extension authorization or
actual Nightly signatures; those require the separate real-browser acceptance.

The browser remembers only a bounded public testnet connection hint, not a
credential or permission to act. Returning pages ask the pinned extension for
its current public account through its trusted-only restore path; they do not
open the chooser or request a signature automatically. Resume business reads
existing records. Switch wallet and Reconnect Nightly open the explicit chooser.
Creating or configuring a company, approving a task, and publishing or
unpublishing each need their own reviewed wallet approval.
If a stale connection cannot reset, unlock Nightly, disconnect this site in the
extension, then choose Reconnect Nightly. Unrelated generic workspace wallet
fallbacks and their existing browser data are outside this guided flow.

The connected wallet supplies its public receive address; Copy receive address
copies that address without asking the user to paste another account. An
unactivated address receives an estimated setup budget, about 12 testNEAR, and
the fixed [official built-in faucet page](https://docs.near.org/getting-started/faucet).
Copy the address there, complete any provider verification, then return and use
Check again. A grant may cover only part of setup, and requests may be limited
or unavailable. Opening the faucet never means funding succeeded. Fresh FINAL
reads verify activation and the exact factory quote, permanent setup storage,
gas headroom and remaining shortfall before creation review is enabled.
Provider/read failures do not classify an account as unactivated. This is a free
testnet pilot; there is no mainnet switch or real-money top-up.

One owner-approved setup batch calls `company_set`, `company_fund_storage`,
`set_execution_profile` and `ai_set_policy`. The mission is encrypted in the
browser using existing random record keys and RSA-4096 worker sealing. The
private mission recovery file is downloaded before approval. It is distinct
from each task's separate recovery file. The plain business brief is retained
only in the current browser tab's session storage for the wallet return/handoff;
it is not placed in URLs or persistent public checkpoints.

The native factory `worker_service` view must match the model, public encryption
key and operator pins, with an unexpired heartbeat no longer than ten minutes.
Company readiness also requires an actual operator FunctionCall access key for
that exact company, exactly the five worker methods and finite allowance of at
least 0.2 testNEAR. The interface shows the actual lease end in UTC and the on-chain heartbeat age.
These observations are recent service evidence, not a guarantee
that a model request is executing. Actual worker preflight remains authoritative.
The worker is a finite 48-hour local Gemma pilot with max 8 companies, two logical
reservations per company and max 16 globally; unknown calls retain their counts.

The existing business handler is exported from `src/business-ui.js` for an
ordinary dependency-injected test harness; production `business.js` always
mounts it with the actual WalletSelector. There is no URL-selectable test wallet,
private API, synthetic operator or provider override in production. Existing
local/operator behavior is preserved. Wallet return hashes are matched to the
original saved intent and complete FINAL receipts before clearing pending state.
A missing, mismatched or post-dispatch error remains unresolved and never
authorizes an automatic replacement. Pre-dispatch refusals can clear only their
exact intent when the local sender proves the wallet request was not invoked.

The existing generic, nonfounder MyNearWallet module waits for RPC before opening its named popup.
An explicit owner approval therefore reserves the same named window synchronously
before preflight. No global `window.open` patch is used; only a still-blank
reserved window is closed by the app. Blocked or pre-dispatch-closed windows
receive an actionable refusal. A wallet-origin window is left to the wallet.
That popup path is not offered in the guided Nightly pilot. The guided chooser adds dialog
semantics, labelled controls, 44px close targets, keyboard wallet selection,
focus containment and focus restoration to the installed wallet modal.
A shared owner signing lease coordinates wizard, task and publication approvals
across same-origin tabs; each flow rechecks pending actions inside that lease.
Only the creator of a still-blank reservation can close it.

## Recommended next steps

The founder-bound workspace presents Draft, Improve and Publish with one
recommended next move. A first website draft is recommended; More ideas offers
an offer description, FAQ, business introduction, offer checklist or introduction
post. These six starting points are alternatives within the first task slot,
not a queue of six tasks. They are static suggestions, not model analysis.

Selecting an idea fills the existing editable form without submitting it,
opening a wallet, invoking a model or publishing. What do you offer? remains
visible. Adjust task details contains the brief, operation, context and AI
choice. The existing AI choice, including an unchecked box, is preserved;
recurrence stays disabled. Review the approved facts and the request, prepare
it, save the separate recovery file and review the wallet action explicitly.

After opening the actual matching completed result, the owner can use the one
remaining slot to shorten it, simplify its language or remove unsupported
claims. Revision suggestions reuse the original approved facts and retain a
bounded excerpt of the prior draft as untrusted context. The full saved goal
is unchanged; a notice explains when the request uses a shorter goal excerpt.
Reading results and reviewing public copy remain available without a new
generation. Unknown wallet/publication actions, an existing prepared review,
active work, missing authoritative slot counts and used slots lead to their
original inspection or review step rather than another draft.

English/Spanish guidance updates preserve typed owner facts and requests. A
wallet/company context change invalidates an in-flight suggestion before any
form mutation. The existing form nodes and listeners are retained when optional
controls move into details. The guidance tests run offline:

```sh
node --test tests/founder-next-actions.test.mjs
```

These checks cover state decisions, request bounds, consent preservation and
asynchronous selection guards. They do not establish real wallet authorization,
model quality, full founder acceptance or first-time-founder usability.

## Owner publication

After decrypting a completed draft, the owner can edit its bounded public title,
summary and text sections, review all public copy and approve `publish_site`.
The first publication funds the exact 16 KiB reserve at the current protocol
storage price; updates take no deposit and enforce a compare-and-swap revision.
`unpublish_site` hides the current page through a separate explicit owner review.
Earlier content and transaction history remain public on NEAR. Neither action
requires a running model service. The UI does not claim that the contract
independently verifies business claims.

After a publication or unpublication receipt is verified at FINAL, a failed
published-version read keeps that confirmation and retires its approval. Choose
Check published version to retry only the read; no publication is replayed.
The confirmation is shown only while the original wallet and company context
still match.

`site.html?id=<factory-request-id>` reads the current publication at a FINAL
block, checks its factory/company/owner binding and content commitment, and
renders typed text through DOM APIs. It executes no model-provided HTML, script,
URLs, forms or external collectors. Unpublished sites show an explicit notice.
The safe renderer is a fixed cream/green website template, not arbitrary code
generation or a hosted general application.

## Returning and recovery

The company account name, wallet and transaction metadata are public. Mission
and task plaintext stay encrypted until the owner explicitly publishes public
website copy. Clearing browser storage does not erase on-chain company records.

Disconnect & forget clears the public connection hint and asks the extension
to sign out. It keeps company selections/history, unresolved original wallet
actions and recovery records; it does not submit or replace any action. The
browser's forget choice suppresses silent restore even if extension sign-out
fails. Account changes clear private views and prepared approvals. Remembering
the public wallet does not restore decrypted private work after a browser
restart: keep the downloaded company and separate task recovery files.

A returning owner can connect without entering another brief. The guide reads
the entire bounded factory registry, verifies ownership and the deployed company
code, and restores a unique owned company or offers a chooser for multiple
records. It never creates a replacement automatically. The private mission file
is checked against the owner, company and both on-chain ciphertext hashes before
local decryption. Its key is not persisted. Existing task results use their
separate recovery files and remain readable when the service is offline, the
lease has expired or the two task slots have been used.

Known failed creation/refund records offer an explicit backing-refund review to
the original creator. Refund recovery works with service offline, factory frozen
or owner keys rotated. Creating or refunding states with unknown outcomes remain
inspection-only. The permanent factory-record storage is not refunded.
