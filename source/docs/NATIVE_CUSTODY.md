# Native account/address custody

NEAR account identity is the native equivalent of an owned domain for this
workflow. Account-derived content addresses keep the same name when its
controlling keys change. This is separate from registrar DNS and from selected
source/data export.

`executor/account_handoff.mjs` prepares an unsigned, narrow native-page custody
handoff. It performs no key generation, private-key read, network call or send.
Its caller must obtain an exact FINAL account/code/genesis snapshot, disable
the current page, resolve known pending requests and retire every scoped or extra
key first. Exactly one full-access key must remain. The recipient supplies a
distinct public key and an Ed25519 proof that accepts this exact account, code,
genesis, old key, new key and approval block. Missing/wrong proof is rejected.

The original owner must separately review and sign one atomic transaction:
add the accepted replacement full-access key, then delete the original key.
The account address, deployed code and historical content are retained. Verify
the replacement is the sole full-access key, the old key cannot act, and the
recipient can operate the existing content after restart. Inspect the original
transaction if a wallet outcome is unresolved; this helper provides no retry.
Obtain a fresh snapshot immediately before dispatch; preparation is not a
long-lived grant or a signing service.

`executor/account_handoff_client.mjs` is the reusable owner-run client. It accepts
one bounded JSON request on standard input and supports `snapshot`, `challenge`,
`prepare`, `execute` and `reconcile`. `configuration` contains the exact network
(`sandbox` or `testnet`), `chain_id`, plain allowlisted `rpc_url`, `genesis_hash`,
`account_id`, `expected_code_hash` and `known_unresolved_requests: 0`. Sandbox RPC
must be loopback; public testnet supports the reviewed FastNEAR or official RPC.
Use a protected local configuration file, for example:

```sh
node executor/account_handoff_client.mjs < protected-snapshot-request.json
```

The recipient signs the exact `challenge` with their existing key and supplies
only its public key and base64 signature. `prepare` takes that public `snapshot`
and `approval` (`replacement_public_key`, `recipient_signature`, and the exact
acknowledgement above). Save and review its returned `review` object. `execute`
takes the configuration and review, an absolute `key_file` path and a new
absolute `journal_directory` path. The existing owner key file must be owned by
the current user, private, regular, and identify the same `account_id`; its
`secret_key` or `private_key` is read only for this explicit execution. Never
paste a private key into a request or shell command. Install the executor Node
dependencies from its lockfile before using the client.

Execution checks the current FINAL code, sole key, disabled page and committed
history against the recipient-approved snapshot (at most 600 blocks old). It
then creates a private journal exclusively, fsyncs the exact signed transaction
and its hash, and submits once. An existing journal directory refuses execution.
If the response is lost, `reconcile` accepts only configuration and that journal
directory: it verifies the saved signature and exact atomic actions and reads
the original hash. It reads no private key and never submits. A successful
FINAL report requires the same address/code/history and sole recipient key;
actual execution fees are recorded separately. An unresolved or failed request
is never assigned fabricated zero fees or silently retried. Keep the protected
journal and recipient recovery material until the exit has been verified.

The helper does not transfer a private workspace, wallet secret, hosted worker,
provider credential or off-chain service. Separately authorize/provision those
resources for the recipient. Source ZIP export does not itself transfer custody.
The local acceptance harness is `integration/account_handoff_e2e.mjs`; it uses
two separately held seeded local keys and actual sandbox transactions, not a
public wallet or a public-chain transfer. A passing source-bound report is
required before claiming that local workflow accepted.
