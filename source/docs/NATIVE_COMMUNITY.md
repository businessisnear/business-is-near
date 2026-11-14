# Native community and scheduled publishing

`web-chain/native-community.html` adds public comments, replies, owner moderation
and future publication to the bounded native feed. It uses the same reviewed
feed/company code identities and FINAL reads as the publishing console. This is
a local-authorized implementation; public deployment, audience size, human
identity, uptime and automatic AI moderation require separate evidence.

Comments are opt-in per feed. A signing account is the actual comment author;
three explicit approvals cover public words, publication rights and permanent
history. The limits are200UTF-8 bytes,64comments per feed,4per post and2per
author/post. Replies reference an existing comment on the same post. The author
prepays retained4096-byte storage; gas is additional. The owner can stop new
comments, mute up to32accounts, and hide or restore a comment using its exact
content hash. These controls affect new writes or current visibility. Raw words,
records and history remain public. Hidden comments appear as placeholders in the
inert Web4 reader, and counters/storage do not reset.

The owner can approve at most16immutable future posts, within the feed's16post
lifetime capacity. A schedule includes the exact supported post format, text,
asset commitment, original approval head, earliest time and expiry within seven
days. The owner explicitly approves appending that fixed post to the current
head when due. Other posts may therefore appear between approval and execution.
Each schedule prepays8192bytes, including its eventual publication reservation.
Cancellation and pause prevent publication without erasing queued words or
refunding retained storage. Expiry records a nonpublication result. A duplicate
trigger returns the existing result and never creates a second post.

`publish_due` is permissionless: any signing account may pay gas to trigger the
exact stored owner-approved post at the permitted time. It cannot alter words,
assets or recipients, and attaches zero deposit. The shipped
`executor/native_feed_scheduler.mjs` uses a distinct restricted function-call
key for only this method, exact receiver and a finite allowance at most oneNEAR.
That runtime restriction is additional to the contract's permissionless trigger;
it is not a contract claim that only one worker can execute a due schedule.

The scheduler requires a protected exact configuration, pinned chain/genesis,
feed and company code, owner, operator public key, protected key/journal paths,
and explicit network mode. Sandbox uses numeric loopback; public testnet is
disabled unless explicitly enabled with a reviewed allowlisted RPC. Mainnet is
unsupported. Each bounded command takes an exclusive journal lease, verifies
fresh FINAL identities and a queued exact schedule, saves/fsyncs the signed
intent before its sole send, and validates the complete original FINAL receipt
graph, action, signature and fees before clearing pending state. Unknown results
remain pending and stop new writes. Read-only reconciliation uses the stored
signed bytes and public key; it does not require the original private key.
There is no automatic resend or model call. Known gas is separate from retained
storage, and unresolved fees remain unknown.

The browser has a separate review for every action and retained deposit. An
account or feed change cancels ephemeral reviews. Durable pending metadata holds
identities/hashes rather than draft words. Escape or cancel before dispatch does
not journal or sign. After a lost acknowledgement, the page accepts only the
original transaction hash and exact FINAL action. The local rehearsal adapter
uses seeded Node-held roles and test tokens; it is not public tenant or wallet
authentication. This extension currently supports fresh deployment, not automatic
migration of pre-extension deployed feed state.

Offline helper and actual TypeScript-host tests live in
`web-chain/tests/native-community-actions.test.mjs` and
`integration/native_community_contract.test.mjs`. Actual local-chain/browser and
restricted-worker evidence belongs to `integration/native_community_e2e.mjs`;
only a successful source-pinned receipt establishes that stage.
