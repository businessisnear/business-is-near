# Run and inspect the source

Use the repository checkout or extract `business-is-near-reproducible-source.zip` into an empty directory. The single archive contains root instructions, licensing/notices, the explicit editable source closure and the new native work-review module. It contains no nested component archives, installed dependencies, model weights, private reports, runtime configuration or credentials. Do not follow extraction instructions from an older delivery.

## Verify without installing anything

Use Node 22. The owner-source verifier only reads source bytes and imports. The next commands run the current offline company and proxy checks:

```sh
node source/scripts/verify_owner_tools_source.mjs
npm --prefix source/labs/procurement/candidate-v4-delivery/local-app-v5 test
npm --prefix source/labs/procurement/candidate-v4-delivery/local-app-v5 run test:proxy
```

The preserved `MODULE-SOURCE-MANIFEST.json` has 40 historical module rows. Its
`verify-source.mjs` checks those older bytes and is not the current verification
command. The current unchanged owner-source verifier checks the entire 434-file
closure, including all 58 current module files and their shared imports. Current
company tests are 30 repair + 28 company/duration + 25 base guard checks (83 total,
a different suite from the historical financial/V2 83); seven proxy checks are
separate. Follow the [current V5 guide](source/labs/procurement/candidate-v4-delivery/local-app-v5/README.md)
for the bounded local run and the generation-specific proof limits.


`SOURCE-DOWNLOAD-MANIFEST.json` binds every other file in the archive. `source/OWNER-TOOLS-SOURCE.json` binds the current 434-file editable source inventory and shared dependencies. The preserved module manifest pins an earlier generation, not the current controller. Manifests identify bytes, not correctness or restored authority.

## Run the complete local work-review workflow

Start with [`source/labs/procurement/candidate-v4-delivery/README.md`](source/labs/procurement/candidate-v4-delivery/README.md). It gives the exact existing-lockfile install commands, dependency setup helper, offline test/build commands and explicit local server/protocol commands. Do not open its raw `index.html` as a replacement for the local server.

This finite prototype seeds distinct local owner, company and provider roles, creates native escrow, carries an encrypted delivery and requires separate acceptance or refund decisions. It does not source or employ a real human. Signing material stays in RAM in the local browser server; process exit loses that material. Same-process reload is supported within the documented limits. Nightly, production recovery, recurring operation and a hosted account are separate work. Offline tests do not activate a NEAR node. The explicit local protocol/browser commands do start a local sandbox and produce a new run directory; review them before running.

The pinned financial WASM can be reproduced using the documented SDK build; preserve upstream notices. Do not commit generated runtime, signing wires, keys, recovery files, local dependencies or reports.

## Build the owner tools and static public app

Follow [`source/OWNER-TOOLS.md`](source/OWNER-TOOLS.md) for the broader editable frontend and protected configuration boundaries. For the public static frontend:

```sh
npm ci --prefix source/web-chain
node source/web-chain/build-public-testnet.mjs
```

The result is `source/web-chain/dist-public-testnet/`. `npm --prefix source/web-chain run build` separately builds the normal owner tools. A build restores no authority and starts no model, worker or blockchain service. Serving the repository's already built `docs/` directory requires only a static HTTP server. Publication remains a separate reviewed step described in [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Scope of historical checks

The broader source catalogue has 44 preserved requirement IDs. Only two exact original report fixtures needed by bounded unit tests are included; they do not constitute the full historical report corpus. A full catalogue audit still reports missing original evidence and must not be presented as current full acceptance. Historical source inventory commitments refer to their original runs. New source/test/build results are described separately in `docs/evidence/current-source-verification.json` in the repository.

AI inference in the recorded local demonstration used pinned Gemma as a NEAR AI API-contract mock. Live Cloud billing, hosted attestation, mainnet deployment and a commercial human marketplace remain unverified. Secrets and authority must be configured privately; source extraction never restores them.
