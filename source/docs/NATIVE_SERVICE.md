# Native service desk

`contract/onchain/native_service.ts` is a fixed public negotiation and escrow
workflow. `web-chain/native-service.html` uses pinned FINAL state and separate
typed wallet reviews. It does not treat arbitrary record fields as a service
state machine.

The original direct buyer creates request and qualification commitments. Only
the immutable merchant qualifies the buyer and offers an exact price, private
terms commitment, acceptance deadline and completion deadline. The buyer may
counter the latest revision; the merchant may make a revised offer. Only the
original buyer accepts the latest offer hash and revision with its exact quoted
escrow. Older offers stay in the permanent history.

The merchant starts the accepted service and commits a delivery hash. These
actions do not earn credit. Only the original buyer's acknowledgement of that
exact delivery releases escrow to merchant credit. The buyer can cancel before
start. The merchant can refund an unsettled service. After its finite completion
deadline anyone can move unsettled escrow into original buyer credit. Settlement
and refund are mutually exclusive and happen once.

Withdrawals send the entire request credit only to its original buyer or the
immutable merchant. An immutable transfer ID reserves the liability before one
native transfer. Duplicate IDs inspect their original outcome. Unknown pending
outcomes block a fresh transfer. A private original callback records success or
restores known failed credit; a later new intent still checks actual backing.
Callbacks reserve 60 Tgas; dispatch requires at least 100 Tgas. No operator or
model receives withdrawal, refund, qualification or offer authority.

The lifetime limits are 64 requests, eight merchant offer revisions per request,
one NEAR per accepted price, 256 NEAR of funded escrow and sixteen transfer
intents per party per request, including known failures. The exact nonrefundable
64 KiB storage quote funds a fixed padded 12 KiB request plus conservatively
reserved room for all 32 padded transfer records, keys and index. A root-state
64 KiB cushion remains retained. Storage cannot be withdrawn. Every financial
mutation checks money conservation; dispatch also checks current backing.

`set_freeze({frozen:true})` is a direct merchant decision that stops new intake,
qualification, offers, counters and acceptance. It leaves original buyer
cancellation, existing delivery acknowledgement, merchant refunds, permissionless
timeouts and both original-account withdrawals available.

The principal views are `state`, `quote_request`, `request({request_id})`,
`list({from_index,limit})`, `quote_accept({request_id,expected_revision})` and
`transfer_status({transfer_id})`. The exact method argument schemas and browser
checks are in `web-chain/src/native-service-actions.js`. Build with
`node scripts/build_native_service.mjs`.
The dedicated source package rebuilds its browser with
`npm --prefix web-chain run build -- --config vite.service.config.js` after
installing the pinned web dependencies. The package supplies source, fixed WASM
and locks, with no account or runtime configuration.

Only commitments are sent for request details, qualification, private terms,
counters and delivery. Keep the private text separately or use the existing
encrypted native messages. A hash does not establish identity, disclose its
details, verify delivery quality or guarantee real-world service. Prices,
accounts, timing and commitments are permanent public metadata. Contract deploy
keys can upgrade code. No card chargeback or public commercial deployment is
claimed.

`contract/test/native_service.mjs` tests the real TypeScript logic under an
explicit synthetic host, including unknown/failed callbacks, sixteen-intent
failure exhaustion and worst-case storage. `integration/native_service_e2e.mjs`
exercises actual isolated local NEAR and production browser handlers, retaining
raw FINAL outcomes, exact native transfer receipts, source pins and video. These
are distinct evidence types; synthetic callback failures are not presented as
protocol failures on a public network.
