# Public notes as separately approved operation inputs

`executor/knowledge_input.py` reads an adopted public note for an ordinary,
separately owner-approved business artifact operation. Registry publication and
adoption do not submit a company operation, establish company ownership, grant a
tool or payment permission, or verify a publisher's factual or licensing claims.

The operation's encrypted scope includes this optional extension:

```json
{
  "knowledge": {
    "reference": {"profile": "near-public-playbook-reference-v1", "...": "the complete exact adopted reference"}
  },
  "sources": [{"id": "adopted_note", "text": "the exact whole public note"}]
}
```

The illustrative `...` field is not accepted by the validator. Copy the complete
typed reference returned by the approved registry's `operation_reference` view.
There is exactly one supplied text source, named `adopted_note`. Its exact UTF-8
SHA-256 must match the reference and its complete text must match the current
eligible publication. Notes longer than 600 characters are refused; excerpts,
extra sources and source URL retrieval are outside this first version.

This extension is for ordinary artifact operations. Strategy plans, mandates,
inbox replies, owner conversation controls, approved conversation decisions,
media and engineering operations cannot combine with it. A typed optional
`locale` may be `en` or `es`; it selects generated language and never translates
or changes the signed public source. The original encrypted scope commitment
binds that selection.

The worker directory must be private and owner-controlled. Its fixed
`knowledge-registry.json` must be an owner-owned regular file with mode `0600`,
without symbolic or hard links, containing only:

```json
{
  "registry_id": "the-fixed-approved-registry.testnet",
  "expected_code_hash": "the-exact-base58-deployed-code-hash"
}
```

The policy holds no wallet or provider secrets. It cannot select an endpoint or
chain. Those values come from the existing trusted worker gateway configuration:
the exact official `https://rpc.testnet.near.org` endpoint for testnet, or explicit
sandbox mode with a numeric `127.0.0.1` HTTP endpoint and a fixed sandbox chain ID.
The scope, model, public note and descriptive `source_uri` cannot choose a file,
network, method or receiver.

Each resolution reads the actual FINAL block, checks the network identity, and
pins the registry account code and all contract views to that same block hash
and height. Only `state`, `eligible_publication` and `operation_reference` are
allowed registry views. Direct bounded HTTP requests use neither proxy
environment variables nor authentication/cookie state, follow no redirects, and
reject oversized, compressed, malformed, incomplete or failed responses. Source
URIs are attribution data and are never fetched by this reader.

The current company snapshot's actual owner must equal the reference consumer.
The runtime must separately verify that the company owner approved this exact
operation. Eligible publication content, provenance, license, source URI and
hashes are recomputed rather than trusted from the scope.

Resolution is required before generation or inference and again immediately
before attesting either a new result or a cached result. A structured pinned
revocation or publisher/consumer opt-out defers that task for owner review while
unrelated approved work may continue. A missing fixed registry policy also
defers the task before model use. Malformed or unsafe policies, unknown RPC
results, network/code changes, substituted identities, unexplained failures and
hash changes halt the worker for inspection.

The encrypted artifact's `knowledge_receipt` is at most 1,200 bytes. It binds the
original scope commitment, complete exact reference, complete source list,
publication hash, fixed registry and code hash, initial FINAL block, license,
publisher attribution and source URI. Its authority, training and private-read
markers are false. Claim review continues to recompute source text hashes and
label copy unverified. A read receipt does not establish that a publisher's
assertions are true or that any business action occurred.

The initial receipt records the generation input boundary. Fresh revalidation
compares every stable binding and the chain identity while allowing a newer
FINAL block. It never rewrites an already cached ciphertext or evidence hash.
Late revocation preserves encrypted work for review; only the existing
chain-confirmed owner cancellation/archive path may clear that cache. Offline
receipt validation checks encrypted evidence consistency and cannot establish
current consent.

The registry read and company attestation are separate transactions. These
read-time checks do not give an atomic cross-contract revocation guarantee:
consent may change after the final read. Public chain plaintext and knowledge
already read cannot be erased or unlearned. No training, private-company source
read, external message, payment or tool authority follows from this input.

Run the focused reader checks with:

```sh
python3 -m unittest executor.test_knowledge_input executor.test_knowledge -v
```

The separate `integration/knowledge_consumption_e2e.mjs` fixture is intended for
the integrated runtime. It deploys fresh registry and company contracts to its
own isolated sandbox with seeded accounts and test tokens; it uses no model,
public deployment, real funds or external messaging. Successful evidence is
exported only after assertions, sandbox shutdown and temporary fixture removal.
Browser input selection is a separate integration surface.
