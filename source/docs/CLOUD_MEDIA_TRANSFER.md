# Exact approved media transfer

The authenticated owner's private library and the operator's worker store are
separate. Importing an asset into the owner library, recording an association,
or approving a task does not copy it into the worker.

In the business settings, the owner can approve separate NEAR AI vision and
short-audio permissions within the existing shared AI budget. In the library,
each asset has a separate unchecked consent control naming its exact SHA-256.
Reviewing that upload prepares an encrypted task; the owner must save its
recovery and approve the task separately. Provider responses remain unverified.

After that task is FINAL, select its exact import and matching task recovery in
**Stage the exact approved media for your worker**. The browser opens the recovery
locally, validates the decrypted media reference against the selected task and
asset, and downloads `selected-media-TASK.json`. It contains the selected image
or canonical short WAV, full owner-reported import provenance/cost, the exact
asset/import/task/scope identities, and upload consent. It contains no recovery
key, wallet key, provider key or worker configuration.

The capsule's source receipt hash checks the included owner-reported provenance;
it does not independently verify that provenance or a provider invoice. The task
scope authorizes the exact bytes and import identifier. The worker independently
decrypts that actual approved scope before accepting the capsule.

The operator stops the existing worker so the import command can acquire its
original RPC journal lease, protects the downloaded file, and imports it:

```sh
chmod 600 /private/selected-media-TASK.json
python -m executor.media_transfer import \
  --config /protected/worker-config.json \
  --capsule /private/selected-media-TASK.json
```

The command uses the configured pinned company/gateway and existing WorkerVault.
It reads the current owner, task and exact worker encryption profile, opens the
real sealed scope, checks the approved asset bytes and import reference, and
copies only the selected media into the fixed worker media library. It grants
no model, transaction, account or provider authority. The successful receipt
reports `model_calls: 0`, `transactions: 0` and `provider_uploads: 0`.

Resume the same worker with the same protected configuration. The worker validates
the staged input again before inference. Missing assets defer Cloud media work;
they do not imply access to the owner's separate library. A pending original
transaction must be reconciled through the existing workflow. Keep its original
journal and operator identity.

The fixed Cloud vision model is `Qwen/Qwen3-VL-30B-A3B-Instruct`; short audio uses
`openai/whisper-large-v3`. Vision input is bounded to the reviewed image limits and
16,384 tokens; audio is canonical mono 16 kHz/16-bit WAV of at most six seconds.
Receipts distinguish a retained owner reservation, a provider usage estimate,
and an actual provider charge. The actual provider charge remains unknown and
provider billing/TEE verification remain false. If audio duration is absent,
the provider estimate remains unknown and the full reservation stays retained.

The local Gemma media profile still uses its original three-field scope and
local provenance. Selecting the Cloud profile requires the additional exact
backend and upload-consent fields; a model response cannot select that profile.
