# Explicit NEAR AI media authorization

The standard business worker supports a separately approved Cloud vision or
short-audio task. A local media approval grants no upload permission. The Cloud
scope must contain these exact media fields:

```json
{"asset_id":"<exact SHA-256>","import_id":"<private import ID>","task":"caption_visible_text_v1","backend":"near_ai_cloud","upload_consent":"EXACT_ASSET_TO_NEAR_AI"}
```

Audio uses `transcribe_short_audio_v1`. The sole supplied source commits the
same asset hash. The scope is encrypted and approved through the existing
owner-only `company_submit_operation` flow. A model response is inert data;
it grants no publication, payment, navigation, or execution authority.

## Setup and execution

Configure the protected standard worker and NEAR AI key as described in
[HEADLESS.md](HEADLESS.md). Set the ordinary owner AI policy first, then approve
`ai_set_media_policy` with explicit `vision_enabled`, `audio_enabled`, and an
integer-string `audio_reserve_nanos` allowance. The operator's receiver-scoped
function-call key needs `ai_reserve_media_call` and `ai_complete_media_call`
in addition to the ordinary task methods. An old key receives no new authority
automatically. The operator cannot change the owner policy.

Import the asset into the private owner library and review the separate upload
consent before approving a task. Owner and operator libraries are separate.
Use the task-bound private media transfer capsule and `executor.media_transfer`
to stage its exact bytes/import receipt into the reviewed worker. Stop the
worker while importing so its existing RPC journal lease remains exclusive.
An unstaged Cloud task reports `needs_owner_review` before a provider call or
AI reservation. Missing, corrupt, mismatched, or unrelated inputs are never
replaced with an invented model answer.

The worker uses `app.cloud_media_client.CloudMediaClient` through its ordinary
media dispatch. The isolated `executor.cloud_media_transport` child receives
only the approved media envelope and API key over stdin. It receives no wallet,
operator, record-recovery, or vault key. Its fixed destination is
`https://cloud-api.near.ai:443`, with no redirect or environment proxy handling.

## Wire contracts and accounting

Vision sends typed `text` and `image_url` parts to `/v1/chat/completions`, with
the original PNG/JPEG bytes in a data URL, the fixed
`Qwen/Qwen3-VL-30B-A3B-Instruct` model and a bounded JSON observation schema.
The decoder accepts one image, at most 256 KiB and 512 by 512 pixels. Pillow
verifies and decodes the container; a filename or MIME claim alone is insufficient.

Audio sends canonical mono 16 kHz, 16-bit PCM WAV, 0.1 to 6 seconds, as an actual
multipart file to `/v1/audio/transcriptions`. It selects
`openai/whisper-large-v3` and `response_format=verbose_json`. The reply requires
bounded `text`; duration and segmentation metadata are optional. A Whisper
reply is not a Chat Completion, and missing duration is not fabricated token
usage or a verified zero-cost call.

Media and text share the company's existing per-job, daily, lifetime, count
and monetary reservation counters. Policy changes retain spent/reserved history.
Vision reserves 16,384 input units at 150 nano-USD plus the approved output
limit (at most 512) at 550 nano-USD; 512 output units reserve 2,739,200 nano-USD.
The text path retains its existing 4,608-token input ceiling. Audio reserves
the entire separately selected owner allowance, within the unchanged per-call
cap. Returned duration supports an estimate in rounded-up seconds; the
2026-11-12 gateway/catalogue snapshot implies 10 nano-USD per billed second.
That unusually small source-derived rate is an estimate, not an invoice or
provider-side spending guarantee. The full audio reservation remains charged
against authorization limits when duration or actual billing is unknown.

Public chain records contain blinded input commitments, policy versions,
reservations and encrypted output commitments. Full provider bytes and the
derived result stay in the bounded encrypted private ledger. The receipt uses
`near_ai_cloud_unattested`, `provider_billing_verified=false`,
`verified_attestation=false`, and `actual_provider_charge_nanos=null`.

## Recovery and limits

An intent is saved before reservation and before the one provider dispatch.
Timeouts, non-200 responses, malformed results and lost acknowledgements remain
unknown. The same intent is never automatically submitted for inference again.
If inference completed and encrypted bytes were staged before a completion ACK
was lost, `CloudMediaClient.reconcile_staged(original_call_id)` only reads the
original on-chain output commitment. It sends neither inference nor completion.
Missing provisioned ledger identity markers fail closed; restoring a ledger
must preserve its original identity and unresolved reservations.

Real pinned Gemma can stand in for the hosted models in local tests. The TLS
probe maps only the exact outgoing vision schema; audio uses a transcription
instruction without a hidden output schema or rewritten model text. Separate
actual sandbox tests exercise owner policies, restricted signing, shared caps,
encrypted attestation and archival. Neither proves live Cloud availability,
Whisper/Qwen quality, provider billing, or TEE attestation. No Cloud account is
configured for this project yet.

Primary API references: [specialized endpoints](https://docs.near.ai/cloud/guides/specialized-endpoints),
[NEAR AI inference gateway](https://github.com/nearai/cloud-api),
[Qwen vision model](https://near.ai/models/Qwen/Qwen3-VL-30B-A3B-Instruct).
The retained API-contract design snapshots identify the exact reviewed source
commit and distinguish published examples from optional response fields.
