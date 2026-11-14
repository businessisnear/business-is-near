# Static site and source publication

Target repository: `businessisnear/business-is-near`; GitHub Pages source: `main /docs`. Pages serves only static files. It does not run the AI model, worker, local browser server or NEAR contracts. The current landing page offers existing-record inspection and a separate technical local workflow. New testnet company creation/setup are paused and the general worker is stopped.

## Project identity

Use both author and committer `Business is NEAR Automation <356015766+businessisnear@users.noreply.github.com>` and authenticate as `businessisnear`. Use repository-local Git settings. Keep credentials outside the repository and omit personal co-author trailers. Docker does not determine commit identity.

## Build and stage static assets

```sh
npm ci --prefix source/web-chain
node source/web-chain/build-public-testnet.mjs
```

Review the default `source/web-chain/dist-public-testnet/` output. Do not build directly into `docs/app/`, because the builder clears its selected output. It produces five HTML pages, three approved static example inputs and hashed assets. It excludes local fixture/configuration directories. Read `source/web-chain/PUBLIC-TESTNET.md` for provider, wallet and pilot boundaries.

Overlay the eight fixed public files and the reviewed hashed assets into `docs/app/`. For any asset filename already present, require byte identity before copying; a changed asset needs a new content hash filename. Normal releases retain older hashed assets. This source-cleanup candidate separately retires five explicitly reviewed unreferenced legacy business bundles; their exact preimages and the original tree/history are preserved privately. Do not generalize that exception into bulk deletion.

The original nested source delivery and two historical evidence JSONs are also withdrawn in this candidate, with exact private baseline preservation. The new `business-is-near-reproducible-source.zip`, its explicit per-file manifest and `docs/evidence/current-source-verification.json` describe current bytes and checks. They are new artifacts, not edited historical receipts. The historical MP4, transcript and images retain their original bytes. Upstream license notices remain intact.

## Verify the exact candidate

```sh
node source/scripts/verify_owner_tools_source.mjs
node source/labs/procurement/candidate-v4-delivery/verify-source.mjs
node --test source/web-chain/tests/founder-next-actions.test.mjs
node --test source/web-chain/tests/founder-service-policy.test.mjs
node --test source/web-chain/tests/public-tool-links.test.mjs
```

The module README documents its 83 offline checks, pinned contract build and optional explicit local sandbox/browser run. Those checks do not authorize a transaction, activate a worker, prove Nightly authentication or establish a full browser cycle for the repaired local controller. The broader historical catalogue audit requires missing historical reports and is not a current-source pass.

Refresh source and publication manifests only after source, assets, documents, notices and the source ZIP are final. The publication manifest binds every intended payload file except itself; exclude `.git`, private artifacts, dependencies, generated build directories, signing material and runtime reports. Source ZIPs use an explicit file allowlist and contain no nested archives or restored authority.

Before a public update, review the concrete current-tree diff and the separate public history transition. Preparing this candidate does not authorize a history rewrite or establish publication. Use the existing project account/repository and publish only the reviewed commit after that decision. Verify the actual Pages build commit, then inspect the landing page, old video, wallet-free example, workspace, public reader, mobile layout, local links and download hashes. A configured Pages target or successful local build is not evidence of a deployed update.

The public address is `https://businessisnear.github.io/business-is-near/`. The narrated video has a text transcript; synchronized captions are not included.

## Operational limits

The public testnet client pauses creation/setup and allows only a narrowly bounded remaining revision for the original company if exact service admission passes. A shared heartbeat is not general fleet availability. Older cached clients and direct contract calls remain outside the frontend gate. Existing company records, encrypted recovery and published websites can be read independently of inference. The configured finite lease expires 2026-11-15 at 15:02:04 UTC; this is not continuous hosting.

Local Gemma implements the authorized NEAR AI API-contract mock. Cloud billing, hosted TEE execution, public-wallet onboarding, commercial human hiring and mainnet production are unverified. Use test tokens for the pilot. Publishing static files does not fund accounts, deploy a contract, start a hosted worker or sign a transaction. Preserve original-project rights and all applicable third-party notices.
