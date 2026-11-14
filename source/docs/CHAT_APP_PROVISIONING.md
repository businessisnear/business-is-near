# Typed chat to a reviewed record app

The GENERAL record-app page now offers an encrypted chat planning route. It
reuses the owner conversation protocol and existing fixed app provisioner.
The ordinary direct schema route remains available.

The owner first reviews the fixed local component manifest. Its accounts and
company/app code hashes come from the operator configuration. The owner then
describes the requested app and prepares an encrypted chat question containing
one exact typed GENERAL schema-request choice. This bounded question uses a
deterministic menu selection and makes no model call.

After the question is archived the owner recovers it with the saved private
recovery file. The browser validates the exact selected scope and prepares a new
approval or rejection with a distinct encrypted scope and recovery file. That
decision requires its own owner transaction. Approval links the archived parent
ID, evidence hash, proposal hash, conversation turn, worker key/profile and exact
company/app/template pins. Rejection records a fixed event and runs no inference.

The stock worker re-reads and decrypts the original archived parent before any
schema inference, including cached attestation. Only the exact separately
approved selected scope reaches the existing GENERAL schema adapter. Model
output is bounded typed field data; it supplies no code, account, wallet method,
deposit or deployment authority. The existing credential-name guards and one
optional client-encrypted field limit still apply.

The resulting schema remains an unverified proposal. App initialization requires
another exact owner review of the fixed code and recovered schema. Customer
create/update operations remain separately reviewed, namespaced and revision
checked. No chat proposal automatically initializes an app, deploys arbitrary
code or grants recurring authority.

Legacy conversations preserve their menu structure. The only new menu metadata
is `app_generation` on a supplied-source `research_summary` choice with
`use_ai:true` and profile `native-record-app-schema-proposal-v1`. Extra metadata,
other app profiles, unsupported operations and changes to the selected template
are rejected. The encrypted scope remains bounded to 2700 bytes under the
worker's ASCII JSON encoding.

The core integration is in `executor/conversation.py`, the narrow dispatch in
`executor/operations.py`, owner preparation/export in `executor/operations_cli.py`
and the corresponding browser conversation actions. The GENERAL console uses
the same saved-recovery and exact-action review controls as the direct route.
`integration/chat_app_provisioning_e2e.mjs` provides the actual local chain,
stock worker, single actual local Gemma inference, separate initialization and
customer record edit proof, with source pins, FINAL outcomes and browser video.

This is an explicitly enabled local operator workflow with seeded roles and
test tokens. It does not prove public wallet onboarding, hosted multi-tenant
operation, a live NEAR AI Cloud account or unbounded safe provisioning.
