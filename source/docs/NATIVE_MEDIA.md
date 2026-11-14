# Bounded native media workflows

The authorized local NEAR AI mock is pinned Gemma
`gemma4:e2b-it-q4_K_M`, digest
`b37049369adfe3d2b653af0ab301a062ca5cbe96ace6aa0d3f2559ee9b563fc2`.
There is no configured NEAR AI Cloud tenant or Cloud execution claim.

The private company library accepts canonical short PCM WAV alongside its
existing plain PNG workflow in local rehearsal. WAV input is mono, 16 kHz,
16-bit signed PCM, 0.1–6 seconds, with an exact canonical header and no extra
metadata chunks. Import/playback does not request inference. A separate owner
approval commits the asset/import hash and `transcribe_short_audio_v1` scope to
the company contract. The standard restricted worker uses the existing durable
policy, call count, reservation, encrypted cache and actual reported usage.
Words in audio are untrusted source data and grant no actions or tools.

The installed Ollama model reports audio capability. Its media-aware chat path
accepts WAV bytes through the historical `images` field, detects the media type,
and returns measured input/output usage. This implementation does not use an
ignored `audios` field or invent missing usage from a transcription response.
See the primary [Ollama media routing source](https://github.com/ollama/ollama/blob/main/server/routes.go)
and [API types](https://github.com/ollama/ollama/blob/main/api/types.go). Model
capability and exact digest are checked again before a single bounded request.
The transcript and uncertainty remain explicitly unverified. Local computation
cost remains unknown; NEAR policy reservations are not a compute invoice.

`integration/audio_operations_e2e.mjs` exercises one real local request under
actual sandbox owner consent. The first attempt completed the request but
stopped at a missing audio claim-scope branch. Its counter, successful output,
usage and failed report remain retained. The corrected source then reused that
exact authorized encrypted cache, completed attestation/archive and idle checks
with zero additional inference. A fresh final-candidate run is still required
before describing the entire changed source as accepted.

`executor/native_media_render.mjs` separately renders fixed-template graphics,
speech and a short narrated H264/AAC clip from an exact owner-selected exported
draft. It performs no inference, wallet action, upload or publication. A source
hash and explicit approval are required, and an existing output directory stops
execution. It retains a private intent before running trusted fixed tools.
Input text is literal data, never HTML, a URL, command or filesystem destination.

The rendering profile uses a 256×144 Canvas banner, a local macOS Samantha voice
reading at most 60 characters, and a 160×90 clip lasting 2.5 seconds. PNG/MP4
outputs must fit the native feed's 16 KiB asset bound. This is template rendering,
not a diffusion model, photorealistic generation, voice clone or hosted speech
service. Speech/rendering is deterministic local tooling; it is not reported as
a new Gemma request. The source's generation metadata is labeled owner-supplied.
Outputs remain private until a separate exact native-feed publication approval.

The renderer currently requires macOS, installed Chrome, the pinned Playwright
toolchain under `web-chain`, and `/opt/homebrew/bin/ffmpeg`. Install the included
browser toolchain with `npm ci --prefix web-chain` when restoring a selected
source export. No dependency installation happens during rendering. Supply the
following JSON to its stdin; private file paths are local selections:

```json
{
  "source_file": "/absolute/private/export/artifact.json",
  "expected_source_sha256": "<exact 64 lowercase hex SHA-256>",
  "output_dir": "/absolute/private/new-render-directory",
  "formats": ["png", "wav", "mp4"],
  "owner_approved": true
}
```

Use `node integration/native_media_render_e2e.mjs` for actual generation,
container validation, content-addressed library imports, complete decoding and
independent Chrome playback. Only a successful source-bound report establishes
acceptance. It does not establish public availability or commercial outcomes.

`executor/video_frames.mjs` samples two exact frames from an explicitly approved
short H264 MP4 (up to six seconds, 512 pixels per edge, 180 frames and256KiB).
It disables external media references/network protocols, records original video
hash and selected timestamps, and creates a fixed PNG contact sheet. The owner
separately approves image observations of that exact sheet through the existing
Gemma/NEAR pipeline. This supports bounded sampled-frame observations; it does
not analyze the soundtrack or establish temporal/motion understanding. The full
source video and extraction receipt remain separately hash-bound evidence.
