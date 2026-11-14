# Local native app monitoring

`executor/native_monitor.py` observes a dedicated owner-pinned static Git candidate using the existing isolated Chrome acceptance runner. It does not inspect arbitrary URLs, run model-selected commands, change source, submit a task, call a model, or grant repair authority. It is local committed-candidate monitoring; public uptime and production correctness are unproven.

The owner registry must be canonical and private. Its exact existing static-web policy fixes the repository, allowed files, immutable acceptance bytes and original ancestor revision. Each clean committed observation snapshots actual bytes, runs the existing browser/OS boundary checks, then verifies the commit and working tree stayed unchanged. Reports contain public-style commitments and closed findings; source, selectors, app text, raw exception messages and filesystem paths are omitted. Unknown observation errors remain unknown rather than becoming healthy or a confirmed defect.

A protected journal reserves an immutable intent before every observation and enforces a lifetime limit of64. Its history links each report hash to the previous one. A pending crash reservation, changed scope, malformed history, symlink, hardlink or foreign owner halts. The optional finite watch runs1–8 observations spaced60–300seconds and stops on its first alert or unknown. It never repairs automatically. Browser evidence remains separately private.

```sh
python -B -m executor.native_monitor \
  --registry /absolute/private/worker/repositories.json \
  --repository-id owner-approved-id \
  --policy-sha256 EXACT_OWNER_POLICY_SHA256 \
  --journal-directory /absolute/private/monitor \
  --monitor-id static_health --runs 1
```

The standalone owner page is `web-chain/native-monitor.html`. It imports a bounded report or complete linked history, verifies the company code/owner/current worker profile at one FINAL block, and prepares a **separate** encrypted existing `engineering_patch` operation. That operation binds the alert, source/acceptance commitments, revision and exact repository policy. The owner must explicitly approve existing inference/repair consent, download the private recovery file, review the ciphertext commitment and sign one zero-deposit company task. The existing model policy, isolated before/after acceptance, bounded edits and Git compare-and-swap remain the execution boundary. A report itself never authorizes repair.

Recovery keys remain volatile in the page and its explicit private download; they never enter browser storage or public metadata. Wallet awaits retain the original account/epoch/generation/review and exact action. Cancel/Escape before the durable dispatch boundary creates no pending request. Once dispatch starts, uncertainty retains the original encrypted intent; only original-hash FINAL reconciliation is offered. The archived result is decrypted only with its matching recovery and checked against the original alert, owner and worker profile. A later healthy observation must identify the actual committed repair revision and unchanged acceptance before the UI presents that match.

Validation entry points:

- `python -B -m unittest executor.test_native_monitor` checks the actual private policy/Git/journal boundaries with synthetic browser-result data; no Chrome/model/network is used there.
- `node --test web-chain/tests/native-monitor-actions.test.mjs` checks report/history commitments, actual AES-GCM/RSA preparation and wallet cancellation/ABA/mutation boundaries.
- `node integration/native_growth_e2e.mjs --prepare-only` builds both standalone pages and pins consumed sources without starting a chain, reading account keys or requesting a model.
- `PROOF_NATIVE_GROWTH_LOCAL_MODEL=1 node integration/native_growth_e2e.mjs` is the explicitly scheduled actual local NEAR/Chrome acceptance. Its design runs all experiment/owner-approval checks before the sole local Gemma repair boundary, then independently re-observes and recovers the healthy committed result. A source/build preflight or unit pass is not actual acceptance. Inspect the retained report and teardown status before claiming it passed.

No public monitor deployment, hosted polling service, alert email, remote bug tracker or production repair is supplied by this component. Failed/unknown acceptance fixtures and private journals are retained; a model-bearing failure must be reviewed rather than automatically rerun.

The browser recovery consumer distinguishes strict `static_web_browser` receipts from numeric process-test receipts. Browser receipts retain screenshot/viewport, immutable acceptance/runner/detail/source commitments and all nine actual isolation denial probes; they do not invent shell exit codes. The existing numeric repair receipt checks remain separate. A historical producer/consumer mismatch and its failed read-only continuation are preserved; focused offline recovery of the original authenticated ciphertext validates the format fix, and the later actual read-only browser recovery is recorded separately by receipt `902aaaf801d28a6dc696a457419f0ad3f8b857c240066895b23e81c0b1589b93`. It proves correct/wrong/correct recovery and healthy-commit linkage with zero new calls or writes; it does not rewrite either earlier failed report.
