# NEAR-native addressed mail

This optional contract and console implement encrypted wallet-to-wallet first
contact and replies. They replace an email platform for the selected native
target. They do not send SMTP email or imply a person read a message.

Build with `node scripts/build_native_mail.mjs`, deploy the reviewed WASM to a
separate NEAR account, and call `init` as the intended freeze administrator.
The deployment key can upgrade the contract; retain that trust boundary. On
Apple Silicon use the documented `scripts/setup_near_sdk_arm.py` workaround.
The static console entry is `native-mail.html`. Enter the contract and an
independently reviewed code hash, connect the testnet wallet, and verify FINAL
identity before preparing a transaction. No public deployment of this component
is claimed by these instructions.

Each wallet generates an RSA-4096 identity in browser WebCrypto and downloads
its private JWK. Only the public PEM/hash is registered. Save the private file
and retain old identities after rotation; the application has no recovery copy.
An identity import is validated against its wallet, public key and fingerprint.
New-message acceptance starts unchecked and must be deliberately enabled. The
recipient controls a 1–32 daily quota, opt-out and up to 32 suppressed senders.
Both parties must register; lead discovery grants no message authority.

The sender separately approves an exact recipient/body/reply link. The browser
encrypts at most 3000 UTF-8 bytes using a fresh AES-GCM record key and seals that
key to the recipient with RSA-OAEP/SHA-256. It downloads a separate sent-message
recovery for the sender. Plaintext/private keys are kept only in the tab and
download, never localStorage or an application server. Refreshing/changing
wallets clears loaded private material. Routing metadata, ciphertext, timestamps
and reply links are public permanently. Encryption is not metadata privacy or
erasure. Wallets and the served frontend remain trusted.

The on-chain content commitment binds sender, recipient, ID, exact envelope,
sealed key, recipient key hash and original reply link. Replies must reverse
the original addressed participants. Native storage confirmation and an explicit
recipient acknowledgement have different labels; neither proves human reading.
A pending wallet request stops new actions and survives reload. Only inspection
of the exact original FINAL transaction clears it; no automatic retry occurs.
An exact duplicate ID/content can return its old receipt with zero new storage.

Registration reserves 8192 bytes, and a new message reserves 16384 bytes at the
observed protocol price. These are retained, nonrefundable storage contributions,
not revenue. Gas is separate. Limits: 64 profiles, 256 total messages, and 64
sent/received messages per wallet. Freeze stops new registration/sends; recipient
opt-out/suppression and historical reads remain available. No model, provider,
recurring billing or arbitrary transfer authority exists in this contract.

Verification: `node --test web-chain/tests/native-mail-actions.test.mjs` exercises
real WebCrypto. `node integration/native_mail_e2e.mjs` exercises the compiled
contract, real Chrome, seeded local wallet roles, ciphertext retrieval/decryption,
reply linkage, recipient controls and exact original-transaction reconciliation.
Acceptance reports distinguish actual isolated sandbox behavior from public
chain/browser-wallet delivery. Do not describe an incomplete or failed run as
accepted; source-bound final receipts are required.
