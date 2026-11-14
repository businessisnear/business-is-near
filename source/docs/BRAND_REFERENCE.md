# Owner-approved reference and brand acceptance

The existing static-web repair runner can compare a committed candidate against
an immutable owner-approved PNG region and measurable brand CSS properties.
These are local browser measurements, not a design-taste score, semantic brand
assessment, production correctness guarantee or publication authority.

Add checks to the owner's existing read-only `acceptance.json`:

```json
{"kind":"brand_style","selector":"#swatch","property":"background-color","equals":"rgb(0, 51, 85)"}
```

```json
{"kind":"reference_png","reference":"reference.png","reference_sha256":"<exact SHA-256>","clip":{"x":0,"y":0,"width":32,"height":32},"channel_tolerance":0,"max_changed_pixels":0}
```

The reference must be an explicitly listed **read-only** PNG, excluded from the
candidate's public file list. Its byte hash and decoded dimensions must match
the acceptance check. It is verified and decoded with the bounded image decoder
before browser launch. Region dimensions are1–512 pixels, contained in every
approved viewport. Per-channel tolerance is0–64 and the permitted changed-pixel
count is at most ten percent of that region. No comparison code, command,
network URL or arbitrary filesystem path is accepted from a check or model.

Brand properties are limited to color, background-color, font-family, font-size,
font-weight, border-radius, line-height, text-align and display. Chrome DevTools
reads the computed styles directly; a candidate cannot substitute a JavaScript
`getComputedStyle` function to manufacture the result. The reference comparison
captures actual candidate pixels, then decodes both fixed PNG byte strings in
a separate clean browser context. Candidate scripts do not run in that context.
The result records changed pixels and channel deltas plus exact reference and
candidate-region hashes in the detailed private browser evidence.

The owner still pins repository, original commit, editable files, read-only
files, public files and acceptance hash. Only separately approved HTML/CSS/JS
source can change. A model cannot edit the reference, acceptance, auth or
configuration, install tools, add files, choose a command or publish. The owner
should describe the desired measurable brand values in the approved brief;
the reference itself is not uploaded through this local comparison path.

The same immutable browser acceptance runs before and after a proposed repair.
A failed check prevents a commit. The existing Git compare-and-swap, encrypted
task evidence, restricted operator, provider budget and unknown-outcome rules
remain in force. Failed runs retain their original private fixture and intents.
Successful reruns reuse the original committed encrypted result rather than
requesting another model answer.

Native monitor findings include `approved_brand_style_changed` and
`approved_visual_reference_changed`. A monitor observation grants no repair
authority; the existing separate owner review prepares the ordinary
`engineering_patch` task. Read-only source/export and customer refund rights
are unaffected.

Focused validation is `python -B -m unittest executor.test_brand_reference`.
The optional isolated-Chrome fixture can be explicitly run with
`PROOF_BRAND_BROWSER=1`. Actual owner-authorized local NEAR + pinned Gemma +
before/after Chrome acceptance uses:

```sh
PROOF_BRAND_REFERENCE=1 node integration/web_engineering_e2e.mjs
```

Only a completed source-pinned report under `.artifacts/brand-reference-e2e/`
establishes that actual stage. The ordinary layout/interaction fixture remains
the default when the explicit reference flag is absent.
