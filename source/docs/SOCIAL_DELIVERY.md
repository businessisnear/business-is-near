# Bounded social delivery adapters

The six adapters are isolated foundations with real fixed-host HTTPS code and
explicit NEAR authorization. They are **disabled by default**, are not wired into
company drafting, runtime, UI, or campaigns, and were tested only with independent
synthetic providers and local NEAR. No provider HTTP/OAuth request, real account,
post, upload, advertising spend, or public deployment was performed.

A confirmed receipt is an **operator attestation about a specific provider
pipeline**. It is not a TEE proof, proof that a provider reports honestly, proof
of media bytes after provider transcoding, audience reach, engagement, revenue,
or a complete public business workflow. A local media hash binds the bytes the worker submits;
it cannot cryptographically prove what an external provider ultimately displays.

## Supported bounded routes

| Provider | Fixed supported path | Confirmation and ambiguity |
|---|---|---|
| X | One original text-only Post through `api.x.com`, OAuth user context, `POST /2/tweets`. Account uses `GET /2/users/me`; known Post lookup requests `author_id,text`. | Exact known Post ID, original author and text are required. Link canonicalization is not implemented; provider URL rewriting can retain uncertainty. A lost create ID stays unknown/manual review; no guessed timeline or text search. Protected-account visibility is not called public reach. |
| Facebook Pages | One Page text post through `graph.facebook.com/v26.0/{page-id}/feed`. Exact Page token identity is checked with `/me`; Graph writes use URL-encoded forms. | Exact known ID, `from.id`, message and `is_published=true`. A lost create ID stays unknown. Personal profiles, Groups, media and scheduled posts are unsupported. |
| Instagram | One JPEG container through Graph v26 `/media`, one readiness read, one `/media_publish`, then exact known media lookup. | `FINISHED` means container readiness, not publication. Known published media must match owner/caption/alt text/IMAGE, and readiness must name the exact staged container. Lost publish ID stays unknown; `PUBLISHED` or a similar caption does not substitute for an exact post. **Live activation is blocked** until immutable media hosting and permission provisioning exist. |
| TikTok | One local H.264 MP4 through Direct Post `FILE_UPLOAD`: creator/account checks, `/v2/post/publish/video/init/`, one PUT to the exact provider-issued upload URL, bounded status read. | Only `PUBLISH_COMPLETE` for the known publish ID establishes completion; public requests additionally need one public Post ID. Processing and `SEND_TO_USER_INBOX` are not publication. Unknown upload can be reconciled by the known publish ID. **Live activation is blocked** pending creator consent/privacy UX and audit prerequisites. |
| YouTube | One bounded H.264 MP4 through a resumable session on `www.googleapis.com`, one upload PUT, bounded session-status and exact video reads. | Upload acceptance differs from processed video and requested visibility. Exact channel/title/description/category/kids/privacy plus processed/succeeded are required. Unknown upload can use its known session; 308 incomplete stays unknown and is never resumed automatically. No video is classified as Shorts. |
| Pinterest | One JPEG/PNG `image_base64` Pin through `api.pinterest.com/v5/pins`, on the exact owner-approved public board. Account and board ownership are read first. | Exact known Pin ID, board, title/description/alt text and image media type. Remote derivative image bytes are not claimed to reproduce the input hash. Lost create ID stays unknown. |

The text routes use conservative UTF-8 byte limits: X 280, Facebook 2,000.
Image input is one JPEG (Instagram) or JPEG/PNG (Pinterest), 320..512 pixels per
side and at most 256 KiB. Video input is one MP4 of at most 8 MiB and 60 seconds,
H.264 with optional AAC, 23..60 FPS and 360..4096 pixels per side. These are
intentional implemented subsets, not assertions about every provider's maximum.
Local source bytes are checked against the owner-approved SHA-256 and byte count
before transport. Image validation reuses the installed bounded macOS ImageIO
validator; MP4 structure and installed ffprobe decoding are checked. Executables,
paths, arguments, commands, and decoder options are never selected by an intent
or model. Missing installed validators fail closed; nothing is installed.

Unsupported routes include X media/replies/quotes/edits/DMs; Facebook profile,
Group, photo/video/Reels/Stories/scheduling; Instagram video/Reels/Stories/carousel,
shopping/collaborator/paid tags; TikTok photo, URL-pull, inbox draft upload,
chunked/resumed uploads, duet/stitch/comment activation; YouTube chunk retries,
playlists, thumbnails, edits, live streams and Shorts classification; Pinterest
video, carousel, saved/re-pinned content, ad accounts and ads. No provider adapter
has delete, comment, reply, direct-message, fund-transfer, shell, policy execution,
or dependency-install actions.

## Immutable NEAR authority

`contract/onchain/social_outbox.ts` creates one immutable provider/account
namespace per deployment. Immutable fields include owner, operator account and
exact ed25519 key, source bundle, worker code, worker RSA key, credential profile,
account commitment, contract code hash, and finite UTC-day/lifetime request caps.
The actual access key must have exactly the receiver-scoped `claim`,
`reserve_request`, and `record_receipt` methods and a finite allowance. The worker
reuses the existing finalized NEAR bridge read-only, with zero-deposit signing,
exact receiver/key/code checks, complete FINAL receipt/fee validation and durable
unknown-transaction retention. No Gmail source or behavior was changed.

The owner separately approves each exact encrypted `near-social-v1` intent,
sealed record key, expiry within seven days, provider/profile/account/destination,
content and media commitments, per-intent request cap and exact nonrefundable
storage quote. Plaintext fields are exactly:

```text
schema, provider, intent_id, account_profile, account_id, destination, content, media
```

`content` is a provider-specific exact schema, not an arbitrary API body. Explicit
privacy, kids/category settings and TikTok disabled-interaction choices cannot be
silently added by a model. Media is `null` for text or exactly `sha256`, `mime_type`
and `bytes`. Local file paths, credentials, HTTP methods, arbitrary headers, code,
commands and generic URLs are rejected. The sole remote-media value is the exact
owner-approved Instagram URL naming the content hash, matched to an owner
credential-registry origin. The worker never fetches that URL; Instagram's fetch
cannot be bound to local bytes without provisioned immutable hosting, so the live
factory remains blocked for that provider.

Only hashes and ciphertext, not plaintext account IDs/content or access tokens,
need appear in approvals. Hashes are not secrecy against guessing known account
IDs or small content. Provider Post/stage IDs, status and typed operator receipts
are public. Source bundle/key IDs derive from actual local bytes and RSA public
key. The contract code hash is checked against actual FINAL NEAR account state.

Storage is a fixed 32,768-byte reservation at current NEAR storage byte cost.
Exact quote and deposit are required atomically; duplicates, malformed scope,
wrong provider/account, wrong pins or under/overpayment are denied. It is
nonrefundable, not withdrawable, and separate from deployment storage backing.
Business cash, revenue and paid balances are zero; there is no transfer method.
Provider API reservations are not a fabricated provider invoice or USD charge.

Owner freeze/live flags do not reset counters. No owner/operator/provider/account,
cap, source or profile setter exists. One stage ID may be reserved only once per
intent; a duplicate returns `network_authorized=false`. All reads count too,
including TikTok's POST-shaped status read and YouTube's empty PUT status query.
Reservations are consumed even when transport never occurs. Daily counters reset
only at the actual UTC chain day; lifetime counters never reset through config.

## Durable at-most-once writes

Before every provider request the worker persists and fsyncs an AES-GCM-encrypted
private journal containing the exact approved intent, request hash, stage and
known identifiers. It obtains a fresh FINAL NEAR reservation, writes/fsyncs
`inflight`, checks the local owner publication policy again, and only then invokes
transport. Lease files prevent concurrent workers for the same intent and bridge
journal. Credential material is never stored in these journals; only a private
credential-binding digest is retained to prevent account changes during recovery.
Changing credentials while an intent is unresolved requires manual review.

Every staged write is at most once: create container/session, upload, and publish
are individually bounded. There is no automatic write retry after timeout,
restart, missing private cache, unknown NEAR outcome, malformed 200 object,
foreign metadata or mismatched IDs. Fresh and cached responses both reapply HTTP
status checks after interruption, so a matching-looking cached 404 cannot become
confirmation. Already-completed work returns its durable
receipt with no provider request. The contract also denies new write stages after
an unknown receipt. A provider read returning 404 does not falsely turn an
ambiguous publication into a known failed create.

Reconciliation uses only fixed paths and previously known exact identifiers:
known X/Facebook/Instagram/Pinterest Post GET; TikTok status for the original
publish ID; YouTube's known resumable session status and then known video GET.
Read attempts are finite too: one initial verification and one bounded reconcile
stage. A transient read can therefore remain unknown/manual review. Expired or
frozen authority does not acquire new provider requests. No text search, nearby
timestamp, timeline entry, readiness state, upload acceptance, or empty HTTP 200
container is promoted into a confirmed publication.

## Dormant HTTPS and credentials

Default worker execution raises a disabled error before chain/provider work.
`SocialRecordingTransport` is explicitly synthetic and cannot satisfy the live
factory. The actual dormant HTTPS transport fixes TLS hosts and exact allowed
method/path/body/header shapes. It bounds body and response sizes and timeouts,
does not use proxies, follow redirects, refresh OAuth, or retry. TikTok upload
uses only the official returned `open-upload.tiktokapis.com/video/` URL with its
provider-issued upload query; its OAuth bearer token is not forwarded there.
YouTube session URLs are confined to the exact Google upload path and allowed
session query fields. Provider-created session URLs remain encrypted locally.

Successful production construction requires an explicit owner live configuration,
a real production mainnet/testnet finalized NEAR authority, protected credential,
media and publication-policy stores, matching provider/account/source/code pins,
the on-chain owner live flag, and a fresh exact FINAL request permit. It has not
been activated. Instagram and TikTok factories additionally refuse activation
because their documented hosting/consent/audit prerequisites are absent.

Credential files must be absolute, nonsymlink, owner-owned regular files in
private owner-owned directories, with no group/world permissions and `O_NOFOLLOW`
opens. Aliases come only from the exact approved intent. The exact profile keys
are `provider`, `account_id`, `access_token`, `scopes`, `media_origin`; no token URL,
refresh command, arbitrary host or extra field is accepted. Tokens never enter
arguments, public exports or logs. Account identity is checked through the actual
provider account endpoint before any write. Registry scope sets are:

| Provider | Required configured scope set |
|---|---|
| X | `tweet.read`, `tweet.write`, `users.read` |
| Facebook Pages | `pages_manage_posts`, `pages_read_engagement`, `pages_show_list` |
| Instagram Facebook-login route | `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`, `pages_show_list` |
| TikTok | `user.info.basic`, `video.publish` |
| YouTube | full Google `youtube.upload` and `youtube.readonly` scope URLs |
| Pinterest | `user_accounts:read`, `boards:read`, `boards:write`, `pins:read`, `pins:write` |

These configured sets do not prove that a token actually bears them. OAuth
application setup, consent, permissions/app review, token acquisition/rotation,
account provisioning, provider account limits and all live behavior remain
unverified. Meta's HTML permission guides returned inaccessible/429 here; endpoint
fields/version were checked against Meta's official generated SDK v26.0, and
Instagram account-link/permission/readiness behavior against Meta's official
Postman collection. Actual Meta permission provisioning and continued version
support require live setup verification. No scope or account was probed with real credentials.

TikTok's official Direct Post requirements include current creator information,
explicit creator consent and creator-selected privacy/export UX; unaudited clients
are restricted to private viewing. Those prerequisites are not replaced by a
synthetic fixture or NEAR signature. YouTube upload/session acceptance is not
processing or visibility; audit/project restrictions can keep a requested public
upload private. Its current documented upload quota is separate from our request
counter and may reject work; no quota or billing bypass is implemented. No
provider account/app/audit was created.

## Tests and evidence

```sh
node scripts/build_social_outbox.mjs
.artifacts/venv/bin/python -m unittest executor.social_tests -v
node integration/social_e2e.mjs
```

Coordinate the SDK build's shared transient method/code headers. Only the isolated
`social_outbox.wasm` is built; no public deploy occurs. Tests use deterministic blue
PNG/JPEG and a real small four-second H.264 fixture, independent synthetic wire
expectations and response fixtures for each protocol, mocked HTTPS sockets, and
actual restricted-key signed local NEAR approvals/reservations/receipts.

Evidence: `.artifacts/social-unit-tests.log`, `.artifacts/social-outbox-build.log`
and `.artifacts/social-e2e.json`. The actual-chain artifact records consumed source
hashes, exact FINAL transaction/complete receipt fees, immutable provider/account
checks, write-timeout restart behavior, honest known-ID/session recovery, missing
ID uncertainty, finite caps, freeze/expiry/cancellation, exact storage, zero
business money and test-node teardown. Fees cover contract calls and denied
contract calls; account/key/deploy setup is excluded. No secrets or decrypted
private intents are exported. Synthetic publication responses are prominently
labeled and do not count as live provider proof.

Official primary behavior references (checked 2026-11-10):

- [X create Post and scopes](https://docs.x.com/x-api/posts/create-post), [authenticated user](https://docs.x.com/x-api/users/get-my-user), [known Post lookup](https://docs.x.com/x-api/posts/get-post-by-id).
- [Meta official SDK version](https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/apiconfig.py), [IG media/container and publish endpoints](https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/iguser.py), [IG media fields](https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/igmedia.py), [Page endpoints](https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/page.py), [Page Post fields](https://github.com/meta/facebook-python-business-sdk/blob/main/facebook_business/adobjects/pagepost.py), and [Meta’s official Instagram collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-3fe78620-2258-44b6-893f-42d76c7200d7). The [Instagram content-publishing guide](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing) and [Page guide](https://developers.facebook.com/docs/pages-api/posts/) could not be fetched; their current permission provisioning is not claimed verified.
- [TikTok Direct Post, consent and audit](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post), [media transfer and upload URL](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide), [creator capabilities](https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info), [status meanings](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status), [account identity scopes](https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info).
- [YouTube resumable session and empty status PUT](https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol), [videos.insert scopes/quota](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert), [video lookup and processing details](https://developers.google.com/youtube/data/reference/rest/v3/videos/list), [authenticated channel lookup](https://developers.google.com/youtube/data/reference/rest/v3/channels/list).
- [Pinterest official current v5 OpenAPI](https://github.com/pinterest/api-description/blob/main/v5/openapi.yaml), [official board/Pin guide](https://dev.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins/).
