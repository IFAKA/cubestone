# Cubestone Project State

This file is persistent working memory for coding-agent recovery. It records verified implementation state only. Requirements live in `AGENTS.md` and `docs/`; this file does not override them.

## Current milestone

M0A: hot-path architecture/correctness validation without physical ESP32 performance claims.

## Current phase

Phase 8/9: Wokwi integration and final M0A audit.

## Status

IN PROGRESS. Native phases 0-6, ESP32-S3 Phase 7 integration, and the local
Phase 9 audit gates are verified. Wokwi configuration and generated firmware
inputs are valid, but the Wokwi smoke run is blocked by the missing external
WOKWI_CLI_TOKEN, so M0A is not accepted.

Documentation direction updated on 2026-08-23: README, architecture,
constraints, and M0 milestone docs now state that Mac is the current
development/playable target and ESP32-S3 is the later deployment target using
the same `src/core`.

Desktop development loop refactor verified on 2026-08-23: SDL display and
keyboard/camera input are isolated in `platform/desktop` adapters; the desktop
entry point only orchestrates input, the unchanged core renderer, and
presentation. `--frames N` provides a bounded smoke mode. No SDL or ESP-IDF
dependency entered `src/core`.

Desktop activation fix verified on 2026-08-23: the SDL display adapter now
explicitly opts into foreground launch and focus-click-through on macOS, then
sets the window focusable, shows it, and raises it. This addresses the window
opening behind other applications and the first focus click being ignored.

After user reproduction showed SDL activation alone was insufficient, a
macOS-only Cocoa adapter was added. It sets the application activation policy
to regular, activates the current process, obtains SDL3's native Cocoa window
through `SDL_PROP_WINDOW_COCOA_WINDOW_POINTER`, and calls
`makeKeyAndOrderFront`. The portable core and ESP32 build boundary remain
unchanged.

The desktop target now produces the CMake-generated `Cubestone.app`. It uses
SDL's always-on-top window flag plus an explicit focus/raise request, while the
Cocoa activation adapter makes the native SDL window key and the process a
regular foreground application. The bundle is ad-hoc signed after resources
are copied.

## Completed

Development orchestration (verified, does not advance an M0 phase):
- Repository-scoped Codex skill `.agents/skills/local-implementation-worker/SKILL.md`
  defines bounded Pi/Ornith delegation and independent Codex acceptance.
- `tools/local-worker.mjs` validates a JSON task contract, preflights the local
  MLX endpoint/model, invokes Pi with isolated ephemeral configuration, applies
  timeout/output/repetition guards, records full logs, snapshots changed paths,
  reports scope violations, and always leaves acceptance pending Codex review.
- End-to-end probe verified Codex -> runner -> Pi 0.84.2 -> local Ornith model ->
  one path-fenced repository write + worker check -> structured result ->
  independent byte/diff/check review. The disposable probe was removed after
  acceptance. Worker run: exit 0, 12.604 s wall time, 3,917 reported tokens,
  223 parsed events, zero parse errors, zero stderr bytes, zero scope violations.

Phase 0 (native portion verified):
- Native CMake project configured and builds (`CMakeLists.txt`, `src/core`,
  `tests`, `platform/desktop` guarded by existence).
- Shared portable core library `cubestone_core` builds for native. Sources are
  platform-independent (no SDL/ESP-IDF/FreeRTOS/POSIX includes): `core.hpp`,
  `coords.hpp`, `block.hpp`, `metrics.hpp`; TUs `version.cpp`, `metrics.cpp`.
- `src/core` dependency boundary honored (architecture.md 2/3, constraints.md 3).
- Minimal native test harness (`tests/include/test/test_framework.hpp`, zero
  external deps) + `test_coords` registered with CTest.
- ESP-IDF firmware skeleton under `platform/esp32` consuming the SAME core
  sources via component `mc_core` (no fork/copy): `CMakeLists.txt`,
  `sdkconfig.defaults`, `main/main.cpp`, `components/mc_core/CMakeLists.txt`.
- `CMakePresets.json`, `README.md`, `.github/workflows/ci.yml` added.
- Spec files relocated root -> `docs/` (`docs/milestones/M0.md`,
  `docs/architecture.md`, `docs/benchmark-contract.md`, `docs/constraints.md`).

Native M0 slices verified:
- Phase 1 procedural oracle and the raw Phase 2 bounded cached-world baseline
  pass their unit suites, including negative/large coordinates, cache
  equivalence, eviction, and exact raw byte accounting. A standalone fixed
  3-bit packed candidate also passes exhaustive bit-position round trips and
  reports 6,144 payload bytes; CachedWorld still uses the raw baseline.
- Phase 3 DDA passes all 82 focused checks, including axis, diagonal, negative,
  boundary, tie, vertical, water, and max-distance cases.
- Phase 4 renderer writes caller-owned 240x135 RGB565 storage, emits
  ray/step/query counters, and passes a fixed golden hash plus
  procedural-vs-cached framebuffer equivalence. The renderer unit now includes
  a global allocation hook proving zero allocations during the measured render
  call after initialization.
- Phase 5 SDL3 desktop harness builds against SDL3 3.4.12 and passes a dummy
  video startup/exit smoke run; logical rendering remains 240x135.
- Phase 6 native benchmark emits fixed S0-S3 JSON-lines records with timing and
  aggregate counters; `tools/verify-results.py` validates the complete stream.
- Benchmark records include schema version, workload identity, HEAD commit,
  compiler/build identity, fixed resolution/seed/frame count, timing
  distribution, and raw render/cache counters.

### Exit evidence actually run (this machine)
- `cmake -S . -B build-native -DCMAKE_BUILD_TYPE=Release -DCUBESTONE_TESTS=ON
  -DCUBESTONE_DESKTOP=OFF` -> configure OK (AppleClang 17.0.0).
- `cmake --build build-native` -> builds `cubestone_core` + `test_coords`,
  zero warnings/errors.
- `ctest --test-dir build-native --output-on-failure` -> `coords_unit` passed
  100% (core_identity, floor_division, chunk_mapping).
- Fresh `build-final` native+desktop configure/build and CTest passed 5/5
  executables, including the zero-render-allocation test.
- `build-final/tests/cubestone_bench` emitted all fixed S0-S3 JSON-lines
  records; `python3 tools/verify-results.py` returned `valid: true`.
- SDL dummy-video startup/exit passed. `sim/wokwi/diagram.json` parsed as
  valid JSON and `sim/wokwi/wokwi.toml` now points at ESP-IDF generated
  firmware inputs.

## Verified evidence

- Native core+tests compile with -Wall -Wextra -Wpedantic, no diagnostics.
- Coordinate floor/chunk-mapping tests pass for mandated edge set
  (-17,-16,-15,-1,0,1,15,16,17). Passing test id: `coords_unit`.

## Unverified hypotheses relevant to M0

Same as before; none measured yet.

## Blockers

- ESP-IDF v6.0.2 is installed at `/private/tmp/cubestone-esp-idf-6.0.2`, with
  Python 3.13 at `/private/tmp/idf6.0_py3.13_env` and the existing Xtensa
  toolchain. The repaired `idf.py set-target esp32s3 && idf.py build` and
  subsequent incremental `idf.py build` both pass. The platform entry point
  uses C linkage for `app_main`, as required by ESP-IDF startup.
- Wokwi CLI v0.26.1 is installed at `/Users/faka/bin/wokwi-cli`. The smoke run
  against `sim/wokwi` was attempted and stopped before simulation because the
  required `WOKWI_CLI_TOKEN` environment variable is unset. `diagram.json`,
  `wokwi.toml`, the generated ELF, and `flasher_args.json` validate and resolve
  correctly. No Wokwi boot claim is made.
- Before the current DDA repair, full native verification failed in the
  uncommitted DDA work (62/82 checks). The root causes were traced to hit-time
  accounting, negative-Y early termination, and inconsistent boundary/step
  semantics. After the direct repair, `dda_unit` passes 82/82 and the duplicate
  test registration warning is removed. The negative-coordinate test input was
  corrected from `-5.5` to `-4.5` because mathematical floor maps the former to
  voxel `-6`, contradicting its expected `-5` coordinate.
- The delegated DDA repair attempt was not accepted: Pi ran 186.380 s, emitted
  2 MiB / 7,119 JSON events, hit the output guard, and changed no files. Its
  structured result had no final usage record, but the raw log contained four
  completed API-turn records totaling 59,158 reported token units before
  termination (5,498 output, 16,040 input, 37,620 cache-read). Codex
  independently implemented and verified the fix.

## Decisions already frozen for M0A

Same as before; no changes.

## Measurements

Delegation evidence (2026-08-23):
- Disposable probe: worker exit 0, 12.604 s, 3,917 reported tokens, one
  allowed file, independently verified and removed. This validated transport,
  not production work savings.
- DDA repair delegation: worker exit was guarded after 186.380 s and 2 MiB /
  7,119 events, with zero changed files. The result JSON reported zero because
  no terminal completion survived the guard; raw JSONL usage before termination
  was 59,158 token units (5,498 output, 16,040 input, 37,620 cache-read), a
  lower bound rather than a final total. Codex then diagnosed and implemented
  the fix directly. For this production blocker, delegation increased total
  elapsed work and did not reduce Codex effort.
- Audit limitation: no Codex per-turn input/output/cache token telemetry or
  comparable non-delegated baseline is exposed by the available tools. Net
  Codex-token savings therefore cannot be computed or claimed.
- Delegation policy hardening (audit follow-up): Codex remains the default;
  delegated tasks now require an explicit low-risk class, reject diagnosis,
  reject more than six context files, and cap defaults at 120 seconds, 512 KiB
  output, and six tool calls. The runner retains the latest non-zero usage and
  reports completed-turn count and a lower-bound aggregate, including on abort.
- Policy validation: the historical DDA task was rejected before Pi startup
  (missing delegation class; when normalized as `fixed_semantics`, its
  300-second timeout, then 2 MiB output, then seven-file context each failed
  the new preflight limits). A bounded probe hit the tool-call guard at 6.705 s
  and preserved non-zero usage telemetry; its disposable file was removed.
- Conclusion: delegation policy remains enabled for small bounded tasks, but
  this larger DDA task was a negative-value delegation and should have stayed
  with Codex after root-cause evidence was available.

## Last known tests/builds

- `build-native` (Release, AppleClang 17): configure OK; `cubestone_core` +
  `test_coords` build clean; `coords_unit` ctest passed (3/3 checks).
- Local-worker runner syntax check passed; repository Codex skill validation
  passed; live Pi/Ornith path-fenced probe and independent exact-content checks
  passed on 2026-08-23.
- Fresh native configure/build and CTest passed 5/5 test executables on
  2026-08-23: coords, procedural oracle, cached oracle, DDA (82/82 checks),
  and renderer (7/7 checks including zero render allocations).
- Desktop preset configure/build passed and the dummy-video harness smoke run
  exited cleanly. Benchmark build plus S0-S3 schema validation passed.
- ESP-IDF 6.0.2 `idf.py build` passed for target esp32s3 after the `app_main`
  C-linkage repair; generated ELF/bin inputs are present and fit the configured
  16 MB flash layout.
- Wokwi smoke run remains unverified solely because `WOKWI_CLI_TOKEN` is not
  available in this environment.
- Final native audit on 2026-08-23: native+desktop configure/build, CTest 5/5,
  benchmark build + schema validation, Wokwi JSON validation, and dummy-video
  desktop startup/exit all passed.
- Final local M0A audit on 2026-08-23: native and desktop preset configure/build,
  both CTest suites 5/5, fixed S0-S3 benchmark output plus schema validation,
  bounded dummy-video desktop launch, ESP32-S3 incremental firmware build, and
  Wokwi config/firmware-path validation passed. Wokwi API execution was blocked
  before simulation by the missing token.
- Desktop loop refactor verification on 2026-08-23: `build-desktop` rebuilt the
  core, tests, benchmark, and SDL executable; CTest passed 5/5; dummy SDL
  launch with `--frames 2` exited 0; `git diff --check` passed; source scan
  found no SDL/ESP-IDF/FreeRTOS dependency in `src/core`.
- Desktop activation verification on 2026-08-23: rebuilt `cubestone_desktop`,
  ran the two-frame SDL dummy-video smoke successfully, reran desktop CTest
  with 5/5 passing, and passed `git diff --check`.
- Cocoa activation verification on 2026-08-23: AppleClang compiled the
  Objective-C++ activation adapter and linked the desktop executable; the
  two-frame dummy-video smoke, desktop CTest 5/5, and `git diff --check` all
  passed.
- Foreground-window correction verification on 2026-08-23: rebuilt the direct
  `Cubestone` executable with SDL always-on-top/focus behavior; dummy-video
  two-frame smoke passed, desktop CTest passed 5/5, and `git diff --check`
  passed.
- Native Cocoa key-window correction on 2026-08-23: rebuilt the direct
  `Cubestone` executable with SDL's native Cocoa window pointer passed to the
  activation adapter. Dummy-video smoke and desktop CTest remain passing.
  A real GUI launch from this execution environment emitted macOS
  LaunchServices/HiServices connection errors and exited before interactive
  verification; no interactive success claim is made here.
- CMake bundle correction on 2026-08-23: the desktop target now produces
  `Cubestone.app` with a standard Info.plist, Resources entry, and automatic
  ad-hoc signing after bundle assembly. The clean bundle and the documented
  `build-desktop` bundle both pass `codesign --verify --deep --strict`; bundled
  SDL dummy smoke exits 0, and the clean build's CTest suite passes 5/5.
  LaunchServices still returns `kLSNoExecutableErr` in this execution
  environment despite the bundle passing codesign validation, so real GUI
  click/focus remains unverified here.

## Files changed by implementation

New: `CMakeLists.txt`, `CMakePresets.json`, `README.md`,
`.github/workflows/ci.yml`, `src/core/CMakeLists.txt`,
`src/core/include/mc/{core,coords,block,metrics}.hpp`,
`src/core/{version,metrics}.cpp`,
`tests/CMakeLists.txt`, `tests/include/test/test_framework.hpp`,
`tests/unit/test_coords.cpp`,
`platform/esp32/{CMakeLists.txt,sdkconfig.defaults}`,
`platform/esp32/main/main.cpp`,
`platform/esp32/components/mc_core/CMakeLists.txt`,
`platform/esp32/main/CMakeLists.txt`, `platform/esp32/partitions.csv`, and
`sim/wokwi/{diagram.json,wokwi.toml}`.
Moved: `M0.md`, `architecture.md`, `benchmark-contract.md`, `constraints.md`
(root -> `docs/`).

Development tooling added: `tools/local-worker.mjs`,
`.agents/skills/local-implementation-worker/SKILL.md`,
`docs/local-worker.md`,
`docs/plans/2026-08-23-local-worker-orchestration.md`.

Desktop development loop: `platform/desktop/sdl_display.hpp`,
`platform/desktop/sdl_display.cpp`, `platform/desktop/sdl_input.hpp`, and
`platform/desktop/sdl_input.cpp`; `platform/desktop/main.cpp` now contains only
the SDL application orchestration and bounded `--frames` parsing. Plan:
`docs/plans/2026-08-23-mac-development-loop.md`.
The SDL activation behavior is implemented in
`platform/desktop/sdl_display.cpp`.
Native foreground activation is implemented in
`platform/desktop/mac_activation.mm` and is compiled only for the desktop
Apple target.

## Next exact operation

Provide `WOKWI_CLI_TOKEN`, rerun `/Users/faka/bin/wokwi-cli sim/wokwi` against
the existing generated firmware, and do not claim M0A completion until the
firmware boot and deterministic smoke diagnostics are observed.

Checkpoint update template:

Replace/update the sections above after each coherent phase. Record:

- current phase and status
- exact completed behavior
- commands/tests actually run and their results
- benchmark measurements with platform/workload/build identity
- failures/blockers
- architecture-relevant discoveries
- files materially changed
- next exact operation

Never mark a phase complete because code was written. Mark it complete only when
its specified exit evidence has actually passed.

## Checkpoint update template

Replace/update the sections above after each coherent phase. Record:

- current phase and status
- exact completed behavior
- commands/tests actually run and their results
- benchmark measurements with platform/workload/build identity
- failures/blockers
- architecture-relevant discoveries
- files materially changed
- next exact operation

Never mark a phase complete because code was written. Mark it complete only when its specified exit evidence has actually passed.
