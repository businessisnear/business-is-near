# Public business snapshot analytics

`web-chain/src/business-analytics.js` computes an exact read-only report from the
reviewed company and appointment contracts at one FINAL block. It uses no model,
wallet signature, private recovery key or provider credential. Its report is an
RPC observation with code pins, not an independently verified state proof.

The capture checks both contract code hashes and their owner identities, reads
all appointment bookings (the contract bounds this to 256), and reads company
history up to 1,000 records. Every page and task is fetched at the same block hash.
Duplicate IDs, nonadvancing pagination, inconsistent record counts or money,
changed code pins and other-owner data cause rejection. Longer company history
is explicitly partial; an observed subset is never displayed as a lifetime total.
Task ciphertext is discarded before the report is retained.

For the appointment app, integer arithmetic reconciles every service deposit to
current escrow, settled earned revenue or completed refunds. Retained storage is
separate. Earned balance plus completed withdrawals must equal total earned
revenue; a pending withdrawal remains inside the earned balance until its actual
callback completes. Pending and failed refunds remain in escrow. Amounts are
yoctoNEAR strings throughout, without floating-point conversion or exchange rates.

Reservation outcomes are current states. They are not a visitor-to-sale funnel,
historical confirmation counts, a count of distinct people, experimental causal
effects or evidence of real customer activity. In a sandbox they describe seeded
accounts and test tokens. The company and appointment ledgers remain distinct.
The report does not add their balances or claim net profit. Total network fees,
provider invoices, local compute costs and net profit are unknown unless a future
separate evidenced source supplies them. AI reservation counts and authorization
nanodollars are displayed as reservations, never as provider invoices.

`analyticsSource(report)` verifies the report's content hash and prepares a small
literal source containing its snapshot hash, block height, observed reservation
outcomes and exact earned/storage values, with unknown profit and unproven
causation. Supplying this source to a future owner-reviewed operation does not
approve that operation, establish an experiment, or authorize inference or tools.

`node --test web-chain/tests/business-analytics.test.mjs` checks exact arithmetic,
money conservation, incomplete/foreign data rejection, actual ID-less task-view
shape, fixed-block pagination and source tampering using synthetic records.
Those tests are not business revenue evidence. The next main browser acceptance
must independently exercise capture against actual sandbox bookings/refunds
before this component is described as chain-accepted.

The main overview now has an explicit public snapshot action, a JSON report
 download and a bounded source download. It labels task-history completeness,
 exact deposit/escrow/earned/refund/storage amounts, authorization reservations,
 unknown costs and unproven causal effects. Account/company/code-pin/locale epochs
 clear the displayed snapshot; an obsolete in-flight response cannot restore it.

`node integration/studio_analytics_component.mjs` passed in actual Chrome with
 explicitly mocked public RPC records: exact refund/storage and download/hash,
 Spanish labels, 390-pixel layout, delayed-response epoch/account clearing and
 changed-code-pin refusal. It performs zero inference/signatures/external calls.
 Actual-chain acceptance is separately asserted after the booking/refund flow in
 `integration/studio_browser_e2e.mjs`; a component pass alone does not establish it.
