# Encrypted customer support on NEAR

The business operations worker has a NEAR-native inbox. An owner authorizes a named customer and an immutable support policy. That customer signs an encrypted message to the company contract; the restricted worker answers using the approved policy and stores the encrypted reply in the original task. The customer reads it with their own message recovery file. This provides actual on-chain ciphertext delivery without an email or social provider. It is not email ingestion, a public helpdesk UI, general conversation reasoning or complete public support operations.

## Owner grant

Use a separately initialized `business-operations-v1` company/profile. Prepare a normal `support_draft` policy scope with one to three source entries, none named `customer_message`. Its `brief`, `context`, facts and `use_ai` consent govern replies. Leave enough room within the 2,700-byte combined scope limit for a customer message of up to 600 characters. All policy facts sent to the model should be suitable for the authorized customer. The worker appends the customer's text as untrusted source data; customers cannot change the operation, policy context or inference consent.

```sh
python -m executor.operations_cli prepare-inbox --policy /private/support-policy.json --manifest /private/worker-manifest.json --id support_alice --customer-id alice.near --profile-version 1 --expires 1797000000 --max-messages 20 --daily-limit 2 --output-dir /absolute/private/prepared-inbox
```

Choose a real future expiry on your chain. Review `owner-call.json`, then sign its exact `company_create_inbox` call using the owner wallet. The preparation command sends no transaction. Its separate policy recovery file belongs to the owner. Configure the matching profile and pre-fund permanent task slots separately. Each new customer message consumes one permanent slot; an inbox grant does not create new storage capacity or transfer cash. Up to 16 grants, 1,000 lifetime messages per grant and 24 messages per chain UTC day are supported. Existing AI/day/lifetime and gas limits also apply.

Policy, customer, profile and limits cannot be silently rewritten. A new policy needs a new grant ID. The owner may pause/resume through `company_set_inbox_enabled` or cancel queued/active work through `company_cancel_operation`. Cancellation also pauses the inbox. Pause/expiry prevent new work and inference; they do not undo a previously completed request. Global freeze also applies. Account IDs, timing, ciphertext, hashes and message counts are public on a public chain.

## Customer message and reply recovery

The customer uses the exact pinned business worker public manifest:

```sh
python -m executor.operations_cli prepare-message --message-file /private/question.txt --manifest /private/worker-manifest.json --inbox-id support_alice --task-id alice_question_1 --output-dir /absolute/private/prepared-question
```

Review and sign the `company_customer_message` call in `owner-call.json` using the **named customer's** wallet. The filename is shared with the other preparation commands; it does not imply that the owner signs a customer message. Keep the separate `recovery.json` private. It contains the random key for this message and reply, sealed separately to the worker in the public call. It does not contain a wallet key. The contract rejects different customers, operator admission, changed ID content, expired/paused grants and exceeded message limits. An exact duplicate returns the original task without another message or reply.

Read `company_inbox_messages(id, from_index, limit)` or `company_task(id)` from the contract. After the task is attested or archived, save its JSON **including the public `id` field** and export:

```sh
python -m executor.operations_cli export --task /private/task.json --recovery /private/prepared-question/recovery.json --output-dir /absolute/private/reply
```

The export checks ciphertext commitments and original customer/inbox identity, decrypts locally and writes plaintext `artifact.json`. No transaction is sent by export. The worker's reply is an authorized model/extract response, not independent proof that every sentence is correct. No third-party email, money transfer or public website publication happens through this interface. Without AI consent, the response is explicitly labeled source extraction.

Malformed message/policy ciphertext is quarantined locally with the public scope hash and `needs_owner_review`; no inference or success reply is created. Other queued work can proceed. The owner can inspect and cancel the immutable bad task, then provision a corrected grant/message. Quarantine survives worker restart and does not silently consume another model request. Invalid messages still consume their admitted task slot and message quota.

## Worker and validation

The standard business worker processes messages without `--autonomous` (that flag starts recurring mandates). For local development, add the sandbox-only `--local-model` flag described in [AUTONOMOUS_OPERATIONS.md](AUTONOMOUS_OPERATIONS.md). Cloud inference remains optional and needs a separately configured account. The worker never receives owner/customer signing keys.

The integration command is:

```sh
PROOF_WORK_PYTHON=/absolute/path/to/python PROOF_WORK_LOCAL_MODEL=1 node integration/inbox_e2e.mjs
```

It creates seeded customer accounts on an isolated real NEAR sandbox, delivers one real local-Gemma reply, recovers it using the customer's own key, checks restricted signing, owner/customer permissions, restart, duplicate suppression, daily/lifetime quotas, pause/freeze, expiry/cancellation and zero business revenue/spend. Without the local flag, inference is synthetic. The chain and ephemeral keys are removed afterward. Evidence records exact source/WASM hashes and finalized receipt identities. This does not validate public deployment, hosted availability, email reach or a complete public business workflow.
