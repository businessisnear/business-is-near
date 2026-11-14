# Bounded private image understanding

`executor/media_analysis.py` supports one explicitly selected, private,
content-addressed PNG/JPEG of at most 256 KiB and 512 pixels per side. Separate
container, MIME and dimension checks precede decoding with the installed macOS
`/usr/bin/sips` ImageIO decoder. No package or model download occurs. The original
approved bytes are sent; the decoder cannot choose another asset or URL.

The only task is `caption_visible_text_v1`: a short caption, visible text and
explicit uncertainty, each tied to the exact source SHA-256. Output is untrusted
observational data. It cannot supply commands, tools, paths, new schemas,
authorization or publication. This is bounded image understanding, not full
multimodal support, image generation, audio/video analysis or a complete public business workflow.

## Existing authorization remains in front

The component requires a factory that constructs the existing `NearAIClient`
with the supplied transport. The factory retains the existing private ledger,
encryption callbacks, private identity and `OnchainAI` (or the operation-specific
subclass). `analyze()` calls that client's ordinary `complete()` method. Policy,
job, count and monetary reservation checks, signed chain reservation and cache
commitment checks still precede the transport. The component journal is a local
record and cannot confer NEAR authorization.

```python
from app.near_ai_client import NearAIClient
from executor.media_analysis import MediaAnalysis, TASK
from executor.media import MediaLibrary

# Reuse the application's existing persistent vault, ledger, blinded identity,
# and authority. Do not configure a new count allowance to evade existing caps.
def bounded_client_factory(image_transport):
    return NearAIClient(existing_ledger, existing_protect, existing_unprotect,
                        transport=image_transport,
                        key_provider=lambda: 'local-only-no-api-key',
                        authority=existing_authority,
                        identity_key=existing_private_identity)

analysis = MediaAnalysis(private_analysis_directory, MediaLibrary(private_media_directory),
                         bounded_client_factory)
result = analysis.analyze('stable-public-analysis-id', {
    'operation_id': approved_operation_id,
    'scope_hash': approved_scope_sha256,
    'asset_id': approved_asset_sha256,
    'import_id': existing_import_receipt_id,
    'task': TASK,
}, approved_public_job_id)
```

The application adapter in `executor/image_operations.py` accepts the optional
exact `media: {asset_id, import_id, task}` reference on an explicitly approved
`research_summary` scope with `use_ai: true`. Its single source must be
`image_source` with text `Approved image SHA-256: <asset_id>`. The worker opens
the owner-approved encrypted scope, reads only its fixed private `media`
library, and uses the existing local client's ledger/authority. It builds the
private artifact directly from typed observations, without a second summary
inference. A cloud client cannot execute this branch. The contract and cloud
transport stay unchanged. A standalone component demo does not prove this
on-chain integration.

For an existing `executor.local_model.LocalModelClient`,
`factory_from_local_client(base_client)` supplies this factory while preserving
the exact same inner ledger path, encryption callbacks, key provider, authority
and blinded identity. It rejects a cloud client and does not configure policy.
`compact_receipt(result)` returns at most 3500 canonical JSON bytes, including
the full typed observation, exact source provenance, hashes and actual usage,
for the operation's existing encrypted evidence envelope.

## Local inference and accounting

The fixed REST transport connects only to numeric loopback `127.0.0.1:11434`.
It confirms the installed model tag and digest, checks `/api/show` for vision,
then performs exactly one non-streaming `/api/chat` request. There is no remote
fallback, tool list, redirect, proxy, download or automatic retry. The child
process has a 70 second overall bound; each response has a byte limit.

Execution is pinned to `gemma4:e2b-it-q4_K_M` and SHA-256
`b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2`.
The JSON schema is fixed by trusted code and checked independently after
inference. Tools and hidden reasoning are disabled and rejected in responses.

For this local substitute only, the exact trusted messages contain a source,
scope, model and prompt identity plus inert reservation padding to fill the
existing client's 4096 UTF-8 byte prompt limit. The existing client therefore
reserves 4352 input tokens. Those exact messages, including the padding, reach
Ollama alongside one base64 image. Ollama `num_ctx=4096` and `num_predict<=512`
are fixed. Actual `prompt_eval_count` and `eval_count` must independently fit
the local context and approved output limits, and pass the existing client's
usage checks. There is no estimate of a new image-token price.

The NEAR catalog alias/rate in the existing ledger is an authorization
reservation estimate only. The receipt explicitly records `local_ollama`, the
actual pinned model, actual token counts, source/import provenance and prompt
hash, zero cloud-provider charge, unknown local compute cost, and no verified
TEE attestation. It does not represent execution on NEAR AI Cloud. Cloud image
execution remains unsupported and unchanged.

## Durable no-repeat behavior

A private, fsynced intent precedes the bounded client and all inference. Its
identity binds exact scope, asset, import provenance, fixed task, model/digest and
prompt hash. A stable analysis label cannot be rebound. Timeout, crash, invalid
output, overusage or uncertain completion leaves the intent unknown. An unknown
intent cannot automatically retry, including after restart. A missing journal
or its separate private identity marker fails closed. Whole-volume rollback or
loss remains outside this local journal's guarantees.

Successful reuse requires the same identity and job, a completed private receipt
and the existing client's successful encrypted-cache/authority check. A missing
cache cannot trigger another model request. Changed bytes, prompt, model, scope,
task or execution mode cannot replay a saved result under the old identity.

## Evidence and checks

```sh
.artifacts/venv/bin/python -m unittest executor.test_media_analysis -v
.artifacts/venv/bin/python scripts/demo_media_analysis.py \
  --screenshot integration/fixtures/vision-input.png \
  --browser
```

The default driver uses deterministic synthetic inference and a real browser
screenshot, with a hash-recorded explicit derivative resized to at most 512
pixels before approval. Its private escaped preview is checked in real Chrome
at desktop/mobile sizes. No external preview requests are allowed. Add
`--real-local` only for an explicitly authorized real local request; the driver
has a one-call policy and immediately verifies cached reuse. Each fresh run is
a new explicitly requested component demonstration, not an automatic retry.
The driver has no chain authority and labels that limitation in every report.
Production integration must retain the application's persistent vault; the
component driver's encryption key is process-private.

Official primary documentation: [Ollama vision input](https://docs.ollama.com/capabilities/vision)
describes REST base64 images; [Ollama chat API](https://docs.ollama.com/api/chat)
documents schema output, thinking and actual prompt/evaluation usage fields.

## Recorded local evidence, 2026-11-10

The synthetic component report at
`.artifacts/media-analysis-demos/20261110T123031Z-1948e4d3/report.json`
records successful exact reuse and real Chrome desktop/mobile checks. The
inference in that report is explicitly synthetic.

An initial real-component attempt at
`.artifacts/media-analysis-demos/20261110T123146Z-07ec427b/report.json`
remains unknown, including its original conservative client reservation. Its
transport rejected the prompt before HTTP because canonical IPC serialization
reordered nested message keys and changed the exact prompt hash. A read-only
reproduction confirmed that failure; the local server log had no corresponding
HTTP request. That journal and reservation were retained. IPC now preserves
message insertion order, with a regression checking the child JSON boundary and
rejecting altered ordering before an HTTP connection is created.

A separately authorized, explicitly identified fresh attempt at
`.artifacts/media-analysis-demos/20261110T123613Z-2310a0f5/report.json`
succeeded with real pinned Gemma image understanding: **873 prompt tokens and
227 completion tokens**, total 1100; zero cloud charge; unknown local compute
cost. The source is a 236 by 512 pixel, 43,236-byte browser screenshot derivative
with SHA-256
`595eac3bbcfb21ff2152dd90678e6eb7cc2ba23f75175ce38e5246e1628cf232`.
Its caption/visible text identify the consultation screen and it states context
uncertainty. Exactly one client call completed, cached reuse succeeded, and all
18 real Chrome desktop/mobile preview checks passed. The compact receipt is
2447 canonical JSON bytes. The fresh report links the preserved earlier report
by hash. Neither component report claims NEAR authorization; the application's
separate owner-authorized operation acceptance is required for that claim.

The integrated acceptance is reproducible with:

```sh
node integration/image_operations_e2e.mjs
```

It uses the packaged `integration/fixtures/vision-input.png`, verifies the exact
SHA-256 above, and creates a fresh local NEAR company. This is a real local
inference test: run it only when one new local call is intended. The fixed
worker media directory, encrypted owner-approved `research_summary` scope,
standard `BusinessExecutor(local_model=True)`, original client ledger and
`OperationAIAuthority` all participate. A durable harness counter permits at
most one call to the unchanged real isolated vision transport.

`.artifacts/image-operations-e2e/20261110T124758175Z-6a2c785b/report.json`
and `.artifacts/image-operations-e2e.json` record the successful integrated run:

- Exactly one real Gemma call, with **869 prompt tokens and 211 completion
  tokens**, total 1080, under a one-call-per-job and one-call-per-day chain policy.
- The actual seven-method operator key was checked at finality; operator and
  stranger owner-only submissions, stranger AI use, queued AI use and invented
  jobs were rejected before inference.
- The existing chain reservation bound is 4352 input and 512 output tokens,
  with 934400 authorization nanos reserved. It is not a local compute invoice;
  cloud charge remains zero and local compute cost unknown.
- A controlled interruption occurred before any attestation broadcast, after
  successful inference and durable encrypted evidence. Exact authorized model
  cache reuse passed; a fresh standard worker attested the same ciphertext,
  archived it, and idled without a second inference.
- Offline recovery exactly matched the encrypted artifact; a wrong key was
  denied. The 3279-byte payload includes caption, visible text, uncertainty,
  exact source identity, model identity and actual usage. The chain output
  commitment matches the existing encrypted model cache.
- All 14 integration checks passed, with six successful FINAL controller and
  five successful FINAL worker transaction traces plus five expected failed
  guard traces. Business cash, escrow, committed funds, revenue and paid funds
  are zero. Fixture storage funding and actual transaction fees are reported
  separately.

The harness freezes all consumed runtime/helper sources and the packaged test
input by hash, then checks them again before reporting success. Its temporary
signing keys, recovery key and private chain are removed after stopping. Only
sanitized evidence and the explicit public screenshot fixture remain. An
earlier fixture initialization attempt stopped before inference with counter
zero while querying a just-granted key at finality; its retained failure report
is separate from the successful run. This integrated evidence proves bounded
owner-authorized local image understanding, not NEAR AI Cloud execution,
verified TEE inference, public deployment or a complete public multimodal workflow.
