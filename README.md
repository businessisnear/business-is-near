# Business is NEAR — wallet-led company work

Business is NEAR explores a company workspace where the owner sets the goal, approves bounded work and keeps authority on NEAR. The intended journey connects planning, AI work, native human procurement, delivery review and crypto settlement. Those parts are at different stages; an integrated autonomous company service is not available today.

## Choose a starting point

- [Explore the testnet workspace](https://businessisnear.github.io/business-is-near/app/business.html) to read existing company records. New company creation and setup are paused; the general worker is stopped. Connecting a wallet does not activate a service or authorize a transaction.
- [Inspect the recorded website example](https://businessisnear.github.io/business-is-near/app/) without a wallet. Its company is frozen and its worker key is revoked.
- [Run the complete local work-review workflow](source/labs/procurement/candidate-v4-delivery/README.md) as a technical evaluator. This separate prototype uses seeded local roles: publish a bounded request, reserve native funds, accept a quote, deliver an encrypted result, review it and settle or refund. Its local browser controller keeps signing keys in RAM. It is not the public Nightly app or a real human marketplace.

The public frontend is static. NEAR contracts hold permissions and records; a separately operated worker performs approved AI tasks. This pilot uses pinned local `gemma4:e2b-it-q4_K_M` through the NEAR AI-compatible client. Live NEAR AI Cloud billing, hosted TEE execution, mainnet operation and continuous hosted availability are unverified. No model runs on GitHub Pages.

## What is reproducible

The editable source is under [`source/`](source/OWNER-TOOLS.md). The new [local native work-review module](source/labs/procurement/candidate-v4-delivery/README.md) includes its source, tests, explicit byte manifest, pinned compiled contract and finite reproduction instructions. Its 83 offline tests cover the financial/delivery helpers and the repaired local browser controller; they do not create a NEAR node or prove a live wallet journey. A new local protocol run produces new records rather than replaying a historical receipt.

The repaired browser controller separately passed 43 offline tests and 16 independent focused probes. Its initial page, nonfinancial key preparation and open-review/Go Back browser smoke submitted no application transaction. A full browser cycle for that controller and Nightly signing are not established by those checks. Earlier one-slot and two-record local protocol proofs, and an older browser cycle, are separate historical evidence with the same pinned financial WASM; their proof hashes are not current-source acceptance.

The broader 44-area catalogue records historical module coverage and limitations. Its two included immutable report fixtures are a partial test dependency, not the full historical audit corpus. Other original reports are unavailable in this package; a complete historical catalogue audit therefore fails honestly. Metadata cleanup and newly included source have their own hashes. See [`docs/evidence/current-source-verification.json`](docs/evidence/current-source-verification.json) for the exact current checks and scope.

## Build and inspect

Read [`SETUP.md`](SETUP.md) for the source download and local workflow. The source and module verifiers require no dependency installation, account or network access:

```sh
node source/scripts/verify_owner_tools_source.mjs
node source/labs/procurement/candidate-v4-delivery/verify-source.mjs
```

To build the public static frontend from the existing lockfile:

```sh
npm ci --prefix source/web-chain
node source/web-chain/build-public-testnet.mjs
node --test source/web-chain/tests/founder-next-actions.test.mjs
node --test source/web-chain/tests/founder-service-policy.test.mjs
node --test source/web-chain/tests/public-tool-links.test.mjs
```

The result is `source/web-chain/dist-public-testnet/`. The normal owner-tools build is `npm --prefix source/web-chain run build`. Neither build deploys a contract, starts a worker, calls a model or signs a transaction. Release instructions are in [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Authority and recovery

Account names, owners, funding, permissions, task hashes and transaction history are public on NEAR. Missions, work requests and results use encrypted envelopes until the owner deliberately publishes selected plaintext. Separate private recovery files contain independent decryption keys; wallet login does not replace them. Local application plans and request inventory support same-server reload, but the local page's output-opening keys are lost on reload. Server signing keys and request memory are lost when its process stops. Restoration of a process, owner key, Nightly session or private file is not automatic.

The public testnet client pauses creation/setup and admits only a narrowly bounded remaining revision for the original company if its service checks and exact operator admission pass. This frontend restriction does not constrain older clients or direct contract calls. A shared recent heartbeat does not establish general fleet availability. Existing records, recovery and published pages can be read independently of the worker. Use test tokens only; mainnet funds do not reopen this pilot.

## Recorded material and source rights

The earlier 103-second [narrated local demo](https://businessisnear.github.io/business-is-near/assets/business-is-near-narrated-demo.mp4) and [transcript](https://businessisnear.github.io/business-is-near/assets/narration.txt) remain unchanged. They describe a historical local release, including synthetic Cloud fixtures and held interface frames; they do not verify later wallet or local-controller behavior. The older nested delivery download and historical source/evidence JSONs are withdrawn from this source package. The replacement is a single [reproducible source download](https://businessisnear.github.io/business-is-near/downloads/business-is-near-reproducible-source.zip), with no nested archives, credentials, runtime signing files or model weights.

The project account is **businessisnear** and the repository is **business-is-near**. New publication commits use **Business is NEAR Automation** and the project GitHub noreply identity as both author and committer. A local build is not deployment evidence; inspect the actual Pages build and commit before relying on it.

Original project materials remain **all rights reserved** under [`LICENSE`](LICENSE); public source access grants no project-wide license. Third-party materials retain their licenses and notices: [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md), [`source/THIRD-PARTY-NOTICES.md`](source/THIRD-PARTY-NOTICES.md) and the [Nightly addendum](docs/NIGHTLY-NOTICES-ADDENDUM.md). Local tests and agent reviews do not establish real hiring, universal platform parity, human usability validation or a commercial outcome.
