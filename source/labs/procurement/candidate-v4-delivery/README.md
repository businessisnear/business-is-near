# Local native work review and settlement

This is a reproducible local prototype of owner-approved human work on NEAR:
share a readable brief, receive a bid, appoint a reviewer, receive encrypted
output, open it, accept it, pay the original reviewer and return unused funds.
The local UI uses a fictional Harbor Studio brief and three synthetic wallet
roles. It does not hire a real person or call an AI model.

The public Nightly company workspace is a separate application. This prototype
does not connect its company planner, recurring executor or actual owner wallet.
It is not a public marketplace, a production wallet adapter or a mainnet service.

## Reproduce the offline checks

The offline build and checks were validated with Node 22.23.4. From the repository root, use the included contract lockfile:

```sh
node source/scripts/verify_owner_tools_source.mjs
node source/labs/procurement/candidate-v4-delivery/verify-source.mjs
npm ci --prefix source/contract
node source/labs/procurement/candidate-v4-delivery/setup-local-dependencies.mjs
node source/labs/procurement/candidate-v4-delivery/financial-fork/typecheck.mjs
node source/labs/procurement/candidate-v4-delivery/financial-fork/build.mjs
npm --prefix source/labs/procurement/candidate-v4-delivery/financial-fork test
```

The locked sandbox package supports Linux x64 and macOS arm64. Its helper requires an installed local binary and refuses to start if that binary is missing. Dependency installation is the only installation step above. The setup script
checks installed versions against `source/contract/package-lock.json` and creates
an ignored local dependency link. It does not install packages or start a node.
On Apple Silicon, review the existing SDK setup instructions in
[`source/OWNER-TOOLS.md`](../../../OWNER-TOOLS.md) before rebuilding.

The package includes the reviewed compiled WASM and JavaScript. The validated
offline build reproduced WASM SHA-256
`bf13e856506ebfd3e2a532d79e9a3a657436ca299ae34e64654465b00633091d`.
Compare your build with that hash before using the local demo. A build does not
establish protocol execution or authorize public funding.

Tests cover synthetic financial transitions, actual WebCrypto envelope handling,
SDK export reconstruction, exact quote and public-sharing checks, original-request
dispatch recovery and maintenance inspection. Synthetic host callbacks are
explicit fixtures; they are not native transfer receipts. Fixture JSON contains
only public local-chain values for offline tests, not live quotes or state proofs.

## Run the local browser journey

After the checks, explicitly start the isolated demo:

```sh
node source/labs/procurement/candidate-v4-delivery/local-app-v2/server.mjs
```

This command creates a new local NEAR sandbox, deploys the pinned contract into
that sandbox and generates seeded test-role wallets. It prints one loopback URL.
Open that URL. It uses no personal wallet, public-network funds, NEAR AI account,
model or external service. Generated chain homes and signed requests stay in the
ignored `financial-fork/protocol-runs/` directory; keep that directory private.
The server is finite: at most 15 minutes and 32 original application requests.

Follow the displayed next step and choose the named **Local test wallet** role:

1. **Company owner:** review the plan, storage collateral, business budget and gas.
2. **Company operator:** post the job permitted by the original plan.
3. **Company owner:** read and explicitly approve the exact public brief.
4. **Independent reviewer (test role):** read the brief and offer a price.
5. **Company owner:** appoint that reviewer at the exact offered price.
6. **Independent reviewer:** claim the job, edit the finished text and encrypt it.
7. **Company owner:** open the original stored output, read it and accept it.
8. **Independent reviewer:** withdraw the original payment.
9. **Company owner:** close the budget and withdraw unused business funds.

Every transaction has a separate review. Acceptance is not payment; the UI waits
for the native transfer and callback. At the end, inspect **Activity & receipts**
and **Show technical details**. The example budget is 0.4 local NEAR: 0.1 goes to the
reviewer and 0.3 returns to the owner. Storage collateral and network fees are
separate; the prototype retains record storage collateral.

The brief is public, including transaction arguments. Output is encrypted for the
original owner and worker. Keys for opening output remain only in this page's
memory. Finish opening and reviewing before reloading. Reloading earlier loses
those keys; the application does not silently create replacements or another job.

## Inspect limitations

The included native protocol driver reproduces the one-slot workflow. The earlier two-record failure-run harness is not distributed here; its historical results are not a fresh execution of this package.

The financial V4 contract has earlier independently reviewed local evidence for
one-slot and two-record cases. A previous browser generation completed eleven
original FINAL transactions and two native transfers. Those results do not prove
this newer UI repair generation, maximum 8×8 capacity, real Nightly behavior,
real hiring, recurring business operations, hosted inference or mainnet operation.

This generation repairs positively known unsigned-refusal recovery and makes
original records readable during price/backing maintenance. Unsupported-price or
backing-deficit states disable financial actions. It never turns a generic error,
missing record or unresolved signed request into permission to retry.

Application plans and request inventory remain in server RAM. Page reload
recovery is limited to the same live server; process restart is not a supported
recovery procedure. Signed-original persistence in the local adapter is separate
from the unfinished production-wallet journal and recipient-key recovery work.
Do not restart or remove records to resolve an unknown original request. Stop the
local server with Ctrl-C when finished; do not reuse its seeded wallets elsewhere.

Original project materials remain [all rights reserved](../../../../LICENSE).
Installed dependencies and linked contract runtimes retain their upstream terms;
see the existing [third-party notices](../../../THIRD-PARTY-NOTICES.md). No new
dependency library, compiler binary, model weight, credential, private recovery
file, signing wire or historical private report is distributed by this package.
