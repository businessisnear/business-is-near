# NEAR-native company feed

`contract/onchain/native_feed.ts` stores permanent public text, company updates,
images, image-board items, short video and owned-channel video. PNG and MP4 bytes
live in contract state, with exact SHA-256 identities. `web-chain/native-feed.html`
is the owner wallet console. A native `web4_get` reader returns exact inline
content and same-origin assets without an external social account or media API.

This is a bounded native publishing implementation. It does not claim external
platform reach, followers, impressions, sales, automatic moderation, private
publication, arbitrary video codecs or an independently hosted worker. Public
chain/gateway observations and local acceptance are separate. Local rehearsals
use seeded Node-held keys and test tokens; one fixture token controls both demo
roles and is not real tenant authentication.

## Content, identity and custody

The immutable feed state records an owner, company account and company code pin.
Only that owner's actual NEAR predecessor can store assets, publish or pause.
Initialization is a contract-account self-call with explicit permanent-public
approval. The company binding is an initialization assertion, not a cross-contract
on-chain ownership attestation. The console and verified test reader read both
accounts/code and `company_state.owner` at one FINAL block and require them to
match the feed. A bare public Web4 body explicitly asks readers to verify those
identities independently.

A full-access deployment key can replace WASM, transfer account funds or delete
an account outside this ABI. Code pins and deployment-key custody remain trust
boundaries. Web4 gateways also introduce RPC, DNS/TLS, cache and availability
operators. Account-derived `.testnet.page`/`.near.page` addresses are native gateway
names, not custom registrar ownership or an SLA. The gateway's documented deeper
subaccount limitation still applies.

Each post has a unique immutable ID and one typed format/channel:

| Kind | Channel | Asset |
| --- | --- | --- |
| `short_text` | `updates` | None |
| `company_page` | `company` | None |
| `image` | `photos` | Exact stored PNG |
| `board_item` | `boards` | Exact stored PNG and selected board ID |
| `short_video` | `shorts` | Exact stored MP4 |
| `channel_video` | `videos` | Exact stored MP4 |

Content SHA-256 binds compact UTF-8 JSON of this ordered array:

```text
["near-native-company-feed-v1",feed_id,company_id,company_code_hash,owner,
 post_id,kind,channel_id,board_id,text,alt,asset_sha256,asset_mime,asset_bytes]
```

No asset uses null SHA/MIME and zero bytes. A board ID exists only on a board
item. `created_at` is separate chain metadata. A changed post uses a new ID;
there is no edit/delete/owner-transfer method. Publication also compares the exact
previous feed head, so another publication invalidates a stale review.

## Supported media and public consent

The lifetime bounds are16posts,8assets and4boards. Text is one paragraph up to280
UTF-8 bytes; accessible media descriptions fit128. Assets are at most16KiB and512
pixels per side. PNGs are plain, noninterlaced RGB/RGBA8 with bounded chunks and
valid CRCs. MP4 is one silent self-contained AVC track, at most10seconds; opaque
optional metadata, external data references, encryption, fragmented streaming and
other codecs are unsupported. The browser checks actual image/video decoding.
The on-chain parser validates bounded containers/metadata and hashes; it is not a
general codec-decoder proof for every possible bitstream. Accepted video fixtures
must actually play and expose decoded moving frames in independent Chrome tests.

All raw bytes, text, descriptions and transaction history become public.
Recognizable credential strings are screened in text, but opaque media cannot
be universally classified as secret-free. The owner must review the complete
asset and separately approve nonsecret public content, publication rights and
permanent history. No file bytes or draft text go into the browser's durable
pending metadata. Account/company epochs discard ephemeral forms, reviews and
object URLs.

## Storage, fees and stop behavior

`asset_quote` reserves32768bytes for a new asset; `post_quote` reserves4096bytes
for a new post. The wallet attaches exactly that fixed reservation multiplied by
the live chain byte cost. These are retained, nonrefundable and nonwithdrawable
through this ABI, separate from gas and from any unknown generation/provider
cost. Business money and model calls remain zero; the feed sends no payments.

Asset storage and each publication have separate owner wallet approvals. The same
exact asset can be reused by multiple separately approved posts without storing
it again. `list_assets` preserves discovery of stored-but-unpublished assets after
reload. Every write rechecks company/feed identity, the current quote and exact
content/head before dispatch. Durable UUID/hash-only pending metadata precedes
wallet dispatch. Unknown results stop new writes; reconciliation accepts only the
original transaction hash and complete FINAL graph, never a second publication.

Pausing refuses new assets/posts and hides current/channel/board indexes.
Permanent `/post/ID` and `/asset/SHA` links and historical transactions remain
public. Pause is not erasure and does not automatically stop a separate promotion
campaign, company worker or another contract.

## Reader routes and containment

`web4_get` supports `/`, `/channel/NAME`, `/board/ID`, `/post/ID` and `/asset/SHA`.
It returns only inline base64 `body`, `status`, `contentType` and `cacheControl`;
there are no remote body URLs or preload requests. The reader generates trusted
HTML from escaped literal fields. Its meta CSP disables scripts, forms, frames,
objects and connections; only same-origin PNG/MP4 resources are allowed. It
supplies no arbitrary owner HTML or JavaScript. Gateway custom security headers
are not assumed. Permanent asset routes are immutable-cache hints, not a
cryptographic gateway attestation.

## Local verification

```sh
node scripts/build_native_feed.mjs
node scripts/build_native_feed_media.mjs
node --test web-chain/tests/native-feed-actions.test.mjs
node integration/native_feed_e2e.mjs
node integration/native_feed_browser_e2e.mjs
```

The generated browser container parser carries the exact source hash of its
on-chain counterpart. The backend acceptance uses actual WASM/NEAR transactions,
max16KiB MP4 and near-maximum PNG, six distinct format records, exact asset reuse,
owner/consent/hash/storage/CAS refusals, a real node restart, retained-storage
accounting and pause/history semantics. The browser acceptance separately tests
the production bundle, explicit owner approvals, reload/recovery, private draft
invalidation, independent header-free Web4 rendering/playback, mobile layout,
closed Origin/CSRF/static-file routes, source pins and owned teardown. Failed
attempts remain rejected and retain their stopped private fixture for review.
Initial seeded account-creation fees are outside the recorded deployment/action
FINAL-fee subset. No model, public deployment or external provider is invoked by
these local tests.
