# Native opt-in recipient directory

The native mail contract has a separate, optional directory for registered recipients. Each wallet publishes its own display name and one to four public tags. Search reads only these self-published listings, with a maximum of 64 listings and eight results per page. It does not enumerate NEAR wallets, verify a business identity, enrich contacts, or contact anyone.

The directory uses separate storage prefixes. Existing profile, message and `state()` response shapes remain unchanged. The first listing reserves 2,048 storage bytes at the current protocol byte price; updates attach zero additional storage. Storage is retained and nonrefundable. Gas is separate. Display names, tags, key epochs and historical values are public permanently.

Publish through the native mail page after registering a public encryption identity and enabling new messages. The review binds the exact name/tags, current RSA key hash and profile version, current listing revision and exact storage quote. A wallet cannot supply another account as the listing owner. A key registration invalidates an older listing until the account explicitly republishes it under the current profile epoch.

Search requires an explicit display-name term or tags. Returned pages use one exact FINAL block, code pin and genesis identity. Results exclude the requester, withdrawn listings, stale key/profile epochs, message opt-outs and recipients suppressing that requester. The displayed business name is an unverified self-description.

Selecting a result only fills the recipient field. It does not send or grant sending authority. The client checks the selected listing and current recipient profile again before encrypting and before wallet approval. Native mail still requires its existing separate exact approval, current recipient opt-in/key, suppression and quota checks. Directory visibility is checked at observed FINAL snapshots; it is not an extra atomic predicate in the unchanged `send` ABI.

**Withdraw listing** hides discovery while retaining public history. It does **not** revoke message acceptance. **Stop new messages** changes the native mail profile and is enforced atomically by `send`. An active listing can become visible again when message acceptance is re-enabled; an explicitly withdrawn listing stays hidden until republished. Withdrawal remains available while mail is frozen.

The additive ABI is:

- `directory_state()` returns directory limits and retained storage, without changing `state()`.
- `directory_listing({account_id})` returns the stored commitment and current eligibility.
- `directory_quote({account_id})` returns the exact first-only storage reservation.
- `publish_listing({display_name,tags,profile_key_id,profile_version,expected_revision,approved_storage,directory_ack})` is self-signed and uses `PUBLIC_OPT_IN_DIRECTORY_PERMANENT` consent.
- `withdraw_listing({expected_revision})` is self-signed and zero-deposit.
- `search_listings({requester_id,term,tags,from_index,limit})` is a public bounded view. The client supplies its actual connected account as requester; no view call authenticates that supplied requester.

Listings bind SHA-256 of the exact profile/contract/account/name/tags/key epoch/revision/visibility/timestamps array. Names retain original Unicode; tags are sorted unique lowercase slugs. Query terms are explicit trimmed lowercase text. No model, provider credential, URL fetching or messaging occurs during a directory query.

Offline checks execute the actual TypeScript directory against an isolated host and validate the JavaScript proof boundary:

```sh
node --test integration/native_mail_directory_contract.test.mjs \
  web-chain/tests/native-mail-directory.test.mjs \
  web-chain/tests/native-mail-actions.test.mjs
```

`integration/native_mail_e2e.mjs` retains the existing mailbox security cases and adds actual self-listings, filtering, RSA rotation, stale-selection refusal, withdrawal/opt-out and separate encrypted delivery to a discovered recipient. It uses isolated local NEAR, seeded roles and test tokens, with zero models or external providers. The source-bound directory acceptance passed 17 groups with all 10 original mailbox security groups retained: 23 unchanged source identities, 16 browser approvals within a cap of 24, and 33 independently revalidated known FINAL outcomes (24 successful, 9 expected negative calls). It made zero model or external-provider requests. Owned browser/server/chain processes stopped and the private fixture was removed. The exact report is `.artifacts/native-mail/20261111T010300186Z-91266763/report.json` (SHA-256 `6ebb048a5271378f9801eb81bbfd1a14c7303029788d77d3afc575420bd18429`). The separate offline raw-outcome/source/listing-hash/video audit is `.artifacts/final-audit/native-mail-directory-actual-raw-audit.json` (SHA-256 `4ac92ed6bd7ffb3d81267b8c6f413c624d2f56dd9324b79531647f2222d79734`). The completed 139.64-second browser recording is synthetic fixture footage, with its exact bytes/hash in both receipts.

These tests establish the bounded local native workflow. They do not establish public deployment, real browser-wallet authentication, human readership or commercial outreach results. The 64-entry directory and eight-result pagination bounds are also exercised offline; the actual chain/browser fixture uses three self-listings.
