# Native work review source generations

Use the [current company workflow guide](local-app-v5/README.md) for the repaired
goal → advisory draft → owner approval → native review-role procurement → encrypted
delivery → settlement → company-result journey.

The financial V4 contract and WASM remain unchanged. The earlier 40-row
`MODULE-SOURCE-MANIFEST.json`, inner `verify-source.mjs` and financial-package
83-test script describe historical controller bytes/expectations. They are
retained as lineage and must not be presented as current repaired verification.
The current source inventory is `source/OWNER-TOOLS-SOURCE.json`, verified with
`node source/scripts/verify_owner_tools_source.mjs` from the repository root.

The current V5 package test profile is 30 repair + 28 company/duration + 25 base
guard checks (83 total, a different suite); its seven proxy checks are separate.
The guide gives install/build/run instructions and limits. Shared SDK/crypto/
financial source and pinned WASM have their own hashes; past native proofs are
not relabelled acceptance of changed controller code.

## Rebuild the unchanged financial contract

From the repository root, install the existing contract lockfile and link the
validated local dependencies before rebuilding:

```sh
npm ci --prefix source/contract
node source/labs/procurement/candidate-v4-delivery/setup-local-dependencies.mjs
node source/labs/procurement/candidate-v4-delivery/financial-fork/typecheck.mjs
node source/labs/procurement/candidate-v4-delivery/financial-fork/build.mjs
```

Use Node 22. The locked sandbox package supports Linux x64 and macOS arm64.
Setup validates the installed lockfile versions and creates an ignored local
link; it does not start a sandbox. The sandbox helper refuses a missing installed
local binary. For Apple Silicon SDK prerequisites, see
[the owner tools guide](../../../OWNER-TOOLS.md). No dependency, compiler or model
binary is included in the source download.

The pinned compiled WASM is 595178 bytes, SHA-256
`bf13e856506ebfd3e2a532d79e9a3a657436ca299ae34e64654465b00633091d`.
The corresponding compiled JavaScript is 167656 bytes, SHA-256
`ae277c28cfb179d30308f0dc92ae0a3fb67fc5195de802c80cf3151ea1127ed7`.
Compare rebuilt outputs before explicitly running the local demo. The build
alone proves no native execution and authorizes no public funding. The current
V5 test commands are in its guide above; the old financial package test command
is a historical controller profile.

Original project materials remain [all rights reserved](../../../../LICENSE).
Preserve the [third-party notices](../../../THIRD-PARTY-NOTICES.md).
