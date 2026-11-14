# Standalone private delivery outbox

`web-chain/outbox.html` is a separate English owner screen for the existing Gmail and six social outbox contracts. It prepares typed encrypted delivery intents, requires a private recovery download and explicit content review, and then requests a separate scoped wallet approval. It does not publish a draft automatically, enable live provider transport, load OAuth credentials, run a model, or prove a real provider delivery.

The component is an unaudited candidate. Actual live wallet extensions, OAuth/accounts, provider submissions and public deployments have not been exercised by its local recording-provider tests. Gmail sent-copy evidence does not prove inbox delivery, reading, revenue or bounce handling. Social records are operator assertions about provider processing/publication, not independent provider truth or TEE evidence. The operator can open approved encrypted records with its worker private key; public source/key pins do not make that operator a TEE.

## Entry point and configuration

The production Vite inputs include `outbox.html`; no existing company ABI, delivery contract, runtime or cipher change is needed. The page uses the installed normal Wallet Selector/MyNearWallet interface. It scopes sign-in methods to `approve`, `cancel`, `set_freeze`; positive-deposit approvals still need the wallet's transaction authorization. The exact owner, receiver, method, typed arguments, gas and deposit are checked. A wallet's returned hash is not trusted by itself: the screen reads the actual FINAL transaction, compares its sole FunctionCall and argument hash with the original review, and validates its complete receipt outcomes.

Load an owner configuration JSON with exactly these fields:

- `version: 1`, `network: "testnet"` or `"mainnet"`, matching `chain_id`, existing `contract_id`, and independently reviewed `expected_code_hash`.
- `profile`: exactly `provider`, private registry `alias`, approved sender/account `account`, and `media_origin` (`null` except the registered HTTPS Instagram origin).
- `manifest`: exactly `worker_public_key`, `worker_key_id`, `source_hash`, `worker_hash`, and `source_files` from the existing adapter's offline `execution_manifest(vault)` API. Use the already registered worker vault, not newly generated replacement keys.

The file contains no OAuth access/refresh token, client secret, worker private key, master key, arbitrary RPC URL, HTTP method, executable or filesystem path. Extra fields are rejected. It stays volatile in the tab. The profile alias/account must reproduce the immutable on-chain profile hash; social provider/account hashes must also match the deployment. Manifest source hashes are recomputed in the adapter's fixed source-file order, and the RSA public-key fingerprint must match.

For production networks, only the fixed official NEAR mainnet/testnet RPC is used. Code, owner, immutable provider/account/profile/source/worker/key pins, quote, capacity, time and protocol storage price are read at the same FINAL block. Owner approval requires an unfrozen, live-disabled outbox. The page does not offer `set_live_enabled`, credential setup, arbitrary signing, provider requests or spending routes.

Wallet redirects can clear volatile configuration/forms. Save the private recovery file before approval. After returning, reload the same owner configuration and inspect the original ID or exact wallet transaction hash. Never infer a failed write from a lost response.

## Implemented routes

| Provider | Implemented typed form | Explicit boundaries |
| --- | --- | --- |
| Gmail | One plain ASCII mailbox recipient; plaintext subject/body | Subject at most 240 UTF-8 bytes; body at most 3000 bytes. No display names, CC/BCC, HTML, attachments, replies or header newlines. |
| X | One text-only post on the approved numeric account | At most 280 UTF-8 bytes. No media, replies, DMs or ads. |
| Facebook Pages | One text-only Page post | At most 2000 UTF-8 bytes. No images/video, comments, messages, Stories/Reels or ads. |
| Instagram | One JPEG, exact caption/alt text and hash-named URL under the registered origin | Image at most 256 KiB and 320–512 pixels per side. No carousel/video/Reels. Live hosting/consent/audit prerequisites remain blocked by the adapter. |
| Pinterest | One JPEG/PNG Pin to the exact approved numeric board | Image at most 256 KiB and 320–512 pixels per side. No video, link expansion or ads. |
| TikTok | One H.264 MP4, explicit creator/privacy and disabled duet/stitch/comments | At most 8 MiB, 60 seconds, 23–60 FPS, 360–4096 pixels per side; optional AAC audio. Live consent/audit prerequisites remain blocked by the adapter. |
| YouTube | One H.264 MP4 with explicit privacy/category/made-for-kids choice | Same video bounds; optional AAC. Upload completion differs from processed private/public/unlisted publication. No Shorts classification, comments, playlists or channel management. Current provider upload restrictions/audit/quota still apply. |

The browser computes the selected file's SHA-256, byte length and MIME commitment. Filenames, paths, aliases and bytes are not uploaded by this component or persisted in browser storage. The owner must already have registered the exact content-addressed bytes in the private worker media store. The worker independently validates the actual bytes and native image/video constraints before transport. Selection alone is not proof of decoding/codec validity. This component neither generates media nor installs dependencies or hosts Instagram files.

See [DELIVERY.md](DELIVERY.md) and [SOCIAL_DELIVERY.md](SOCIAL_DELIVERY.md) for official provider references, dormant fixed-host transports, protected credential binding and remaining live-account gaps.

## Encryption, review and storage

The page uses the existing unmodified cipher module: random record key, PBKDF2-SHA256 (600000 iterations), AES-256-GCM and RSA-4096 OAEP-SHA256 worker sealing. Python/JavaScript canonical commitments agree, including Unicode. Recipient/content/media/profile values are committed publicly by hash, while the typed payload and profile alias are encrypted. The private recovery file binds network, chain, contract, provider, original ID, exact cipher and complete approval hash plus its record key.

The visible private review must match the exact encrypted payload and approval hash again immediately before signing. Any draft/config/account change discards it. Save the private recovery download securely; it is an intentional owner export containing a decryption key. It contains no OAuth credential or signing key.

Approval attaches only the exact separate nonrefundable storage contribution: 24576 bytes for Gmail or 32768 for social at the verified chain storage price. This is not business cash/revenue, a provider invoice or a sales claim. The owner also approves an expiry within seven chain days and a 2–8 request cap. Contract daily/lifetime counters remain irreversible; freeze/resume does not reset them.

Private recipients, body text, profile aliases, media files and record keys remain in volatile tab state or the explicit private download. Clearing/changing the owner workspace removes forms, private previews, keys and control dialogs. Browser storage accepts only strictly typed public IDs, cipher/approval hashes and transaction metadata, with finite 128-entry journals. It does not contain the private recovery key or plaintext body/media.

## Unknown outcomes and owner controls

Public pending metadata is saved before wallet lookup. The screen checks the same original epoch/config/account/selector/intent before lookup, after `wallet()`, after `getAccounts()` and immediately before its single dispatch. It clones/freezes the exact request. An A→B→A account change cannot resurrect an old review. Async file reads, private decryption, media hashing and FINAL snapshot validation also retain their original ticket and cannot repopulate a cleared/new-owner workspace. Recovery keys are cleared in `finally`; plaintext is committed to the DOM only after the ticket remains valid.

A lost reply preserves uncertainty. The screen inspects the exact original ID/hash; it never automatically resubmits. An immutable matching intent in FINAL state establishes owner approval, not delivery. An actual provider `unknown` remains inspect-only and prevents new approval in that outbox until the original status is resolved. Recovery displays that original intent read-only and does not turn it into another send draft. Missing create IDs can require indefinite manual review; no guessed search result is called confirmation.

Only the exact owner can cancel an original approved/claimed intent with no reserved provider write, or freeze/resume the selected outbox. There are no owner/payee/policy changes, withdrawals or live-enable actions. Controls have their own public pending journal and exact FINAL transaction checks. A control with no known transaction hash remains blocked for manual inspection; it is not guessed failed. A known original transaction hash can be entered to inspect that same action without resubmitting.

## Local acceptance

Run the focused validators:

```
node --test web-chain/tests/outbox-actions.test.mjs web-chain/tests/outbox-session.test.mjs
node integration/outbox_browser_fixture_smoke.mjs
node integration/outbox_browser_e2e.mjs
```

The test-only Node fixture owns seeded local sandbox keys in a private temporary directory. It deploys seven real immutable outboxes, validates browser ciphertext with the actual worker RSA/AES keys and Python typed validators, and signs only exact approved outbox actions. Provider execution uses only existing recording transports. It never calls a live transport or reads a real credential/account file. Its wallet and provider labeling comes from the fixed fixture constructor/evidence, not a user truth toggle.

The browser harness builds a private static production bundle, drives installed Chrome, records actual FINAL approvals/worker receipts/fees, and checks all seven routes, separate recovery/approval, no plaintext in browser storage/chain/RPC, loss/reload, unknown SEND reconciliation without another POST, owner cancellation/freeze, foreign-wallet guards and mobile layout. Deferred wallet lookup/getAccounts, private decryption/media callbacks and A→B→A review/control races must produce zero stale-context signer calls and no old-owner plaintext. Remote browser requests are blocked and must remain zero. Owned browser, workers, HTTP server, sandbox and private downloads are torn down.

Accepted evidence is written under `.artifacts/outbox-browser/<attempt>/report.json`; rejected attempts remain separate as `failed-attempt.json` with available partial raw FINAL scope. Fees describe only their recorded local seeded transactions, never provider USD spend or a reconciled live bill. Actual wallet/OAuth/provider/public deployment remains a separate unperformed acceptance step.
