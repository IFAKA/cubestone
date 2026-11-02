# Benchmark and Validation Contract

## 1. Purpose

Benchmarks exist to answer architectural questions with reproducible evidence. They are not demo FPS counters and are not license to claim physical ESP32 performance from non-physical platforms.

M0 has two distinct exits:

- **M0A**: architecture/correctness/integration validation without physical hardware
- **M0B**: physical ESP32-S3 performance validation

## 2. Evidence classes

Every result must identify one platform class:

- `desktop-native`
- `ci-host`
- `wokwi`
- `esp32-physical`

Only `esp32-physical` may accept/reject physical FPS, PSRAM bandwidth/contention, DMA throughput, or thermal/stability targets.

Wokwi may provide firmware correctness evidence but not physical timing evidence.

## 3. Build identity

Every benchmark result records enough metadata to reproduce/comprehend the run:

```json
{
  "schemaVersion": 1,
  "platformClass": "desktop-native",
  "workload": "S1_SURFACE",
  "gitCommit": "...",
  "buildType": "Release",
  "compiler": "...",
  "compilerVersion": "...",
  "idfVersion": null,
  "target": "arm64-macos",
  "seed": 1,
  "frames": 1000,
  "resolution": [240, 135],
  "maxRayDistance": 0,
  "singleOrMultiCore": "single",
  "metrics": {}
}
```

Unavailable fields are null, not guessed.

## 4. Fixed renderer workloads

Workload definitions live in code/data under version control and may not depend on wall-clock randomness.

### S0_FLAT

Purpose: expose baseline ray traversal/world-query cost.

Properties:

- deterministic flat terrain
- fixed seed
- camera above surface
- fixed pose/FOV
- many relatively long unobstructed rays

### S1_SURFACE

Purpose: representative generated exposed terrain.

Properties:

- deterministic hills/terrain variation
- camera close to surface
- mixture of short/medium/long rays

### S2_CAVE

Purpose: high nearby voxel density and short rays.

Properties:

- deterministic underground/cave-like geometry
- camera enclosed by nearby surfaces
- exercises all ray directions and frequent hits

### S3_CACHE_STRESS

Purpose: make cache turnover reproducible.

Properties:

- deterministic generated world
- camera follows a fixed pre-recorded trajectory across chunk boundaries
- enough travel to create repeatable cache misses/evictions for the configured cache capacity

Exact seeds, coordinates, orientations, FOV, max ray distance, frame count, and trajectory become constants when implementation begins. Once benchmark baselines exist, changing them requires a benchmark-contract change, not an incidental code edit.

## 5. Required correctness workloads

### World oracle

For a fixed seed, compare `CachedWorld::blockAt()` against `ProceduralWorld::blockAt()` over:

- deterministic boundary-coordinate matrix
- deterministic pseudo-random coordinates using a fixed PRNG seed
- coordinates crossing positive and negative chunk boundaries
- all M0 block IDs/terrain cases

Any mismatch fails M0A.

### Mandatory coordinate set

At minimum, independently exercise X and Z around:

```text
-17, -16, -15, -1, 0, 1, 15, 16, 17
```

and relevant vertical boundaries.

### DDA edge set

At minimum:

- +X/-X, +Y/-Y, +Z/-Z rays
- diagonal rays
- ray origin on voxel face
- ray origin on edge/corner
- origin inside solid voxel
- negative world coordinates
- zero or near-zero direction components
- equal-boundary/tie cases
- maximum-distance miss
- vertical boundary behavior

## 6. Golden output

At least one fixed scene/camera produces a deterministic 240x135 RGB565 framebuffer hash/checksum.

Goldens exist to detect semantic/render traversal regressions, not to enforce pixel identity across intentional renderer changes forever.

Golden updates require:

1. explanation of intended semantic change
2. relevant correctness tests passing
3. review of resulting image/hash change

Do not auto-approve a new golden because the old one failed.

## 7. Required aggregate counters

Renderer/workload output must expose, where applicable:

```text
raysCast
raysHit
raysMissed
ddaSteps
worldQueries
cacheHits
cacheMisses
cacheEvictions
chunksResident
chunkPayloadBytes
chunkAllocatedBytes
```

Useful derived values may include:

```text
stepsPerRay
queriesPerRay
cacheHitRate
bytesPerResidentChunk
```

Derived values must come from raw counters, not independently estimated values.

## 8. Timing metrics

For frame workloads record distribution, not only average:

```text
p50
p95
p99
max
```

Also record sample count and warmup policy.

### Desktop

Use a monotonic high-resolution clock. Run a warmup before measured frames. Avoid VSync/frame presentation blocking in the CPU renderer benchmark; presentation can have a separate benchmark.

### ESP32 physical

Use timing based on measurement duration:

- `esp_timer_get_time()` for frame/subsystem-scale wall-clock timing
- lower-overhead per-core cycle counting for very short microbenchmarks when the executing task is pinned to one core

Do not call timing APIs inside every DDA step or block query in the baseline benchmark because instrumentation would materially alter the hot path.

## 9. Memory metrics

On physical ESP32, record capability-relevant values before initialization, after initialization, and after workload completion, including where APIs permit:

```text
internalFree
internalMinimumFree
internalLargestFreeBlock
psramFree
psramMinimumFree
psramLargestFreeBlock
```

Also record engine-owned accounting:

```text
framebufferBytes
chunkPayloadBytes
chunkAllocatedBytes
cacheMetadataBytes
benchmarkScratchBytes
```

Memory values must distinguish allocator-reported free memory from engine-owned accounting.

## 10. Allocation invariant

After renderer initialization, `renderFrame()` must perform zero dynamic allocations.

This is tested directly on desktop using an allocation counter/hook suitable for the test harness. The test fails if any allocation occurs in the measured render call.

If platform/standard-library implementation prevents a reliable global hook, structure renderer dependencies so all renderer-owned storage is visibly preallocated and add an explicit test allocator around renderer-owned allocation paths. Do not claim global zero-allocation coverage that the test cannot observe.

## 11. Chunk representation experiment

For each candidate representation report:

- exact raw voxel count
- exact payload bytes
- exact metadata/allocation bytes
- encode/build cost
- query workload cost
- cache behavior under S3
- compression ratio relative to raw `uint8_t` baseline

Use multiple deterministic generated terrain samples. Do not publish a single favorable chunk as “average chunk size.”

The initial <=8 KB/chunk target remains a hypothesis until representative samples support it.

## 12. Performance comparison rules

A before/after optimization claim is valid only if:

- same platform class
- same hardware/host when physical timing matters
- same workload definition
- same resolution/FOV/ray distance
- same compiler/build class
- correctness tests and goldens still pass, unless the optimization intentionally changes rendering semantics and that change is documented
- sufficient samples are collected to compare distributions

Do not compare Debug to Release, Mac to Wokwi, or different ray distances and call the difference an optimization.

## 13. CI gates for M0A

### Core/native

- configure succeeds
- C++ warnings policy passes
- unit tests pass
- deterministic generation tests pass
- cached-vs-procedural oracle passes
- DDA edge tests pass
- golden framebuffer test passes
- zero-render-allocation invariant passes
- benchmark executable builds
- benchmark result validates against schema

### Desktop

- SDL3 harness builds
- can construct a 240x135 RGB565 frame
- camera/input adapter is platform-only

### ESP32-S3

- target is `esp32s3`
- firmware config reflects intended N16R8 class
- firmware builds with pinned ESP-IDF release
- application fits configured 16 MB flash layout
- core code compiles as ESP-IDF component without importing SDL/desktop dependencies

### Wokwi

M0A integration run must demonstrate:

- firmware boot
- ESP32-S3 target
- configured 8 MB Octal PSRAM visible/usable as expected
- deterministic smoke test completes
- no immediate assertion/watchdog/allocation failure

Wokwi timing is ignored for physical performance acceptance.

## 14. M0A exit criteria

M0A passes only when all are true:

1. same portable core source builds native and ESP32
2. deterministic infinite-coordinate procedural `blockAt()` exists
3. candidate cached world returns identical blocks for oracle test set
4. raw baseline and compressed chunk candidate report exact memory use
5. genuine 3D DDA renders fixed scenes
6. logical framebuffer is exactly 240x135 RGB565
7. desktop SDL3 harness permits movement/look without game logic entering SDL layer
8. render call performs zero renderer-owned dynamic allocations after initialization
9. fixed DDA/world/chunk correctness tests pass
10. golden framebuffer is deterministic
11. machine-readable benchmark records are emitted/validated
12. ESP32-S3 firmware builds with pinned ESP-IDF and intended memory configuration
13. Wokwi boots the firmware and passes integration smoke checks
14. documentation contains no claim that physical >=30 FPS has been achieved

## 15. M0B exit criteria

M0B requires physical ESP32-S3 N16R8-class hardware and actual display path or representative transfer workload.

Measure at minimum:

- frame P50/P95/P99/max
- DDA/world-query counters
- block-query/cache microbenchmarks
- PSRAM/internal memory metrics
- cache behavior
- display transfer cost
- render/transfer overlap if implemented
- memory headroom/fragmentation
- sustained stability

The current target is:

```text
240x135 baseline workload: >=30 FPS at P95 frame time
```

Equivalent P95 frame-time ceiling:

```text
33.333... ms
```

This target is not declared passed until measured on physical hardware.

## 16. Stop/decision conditions

Stop autonomous implementation and report evidence instead of silently redesigning when:

- procedural/cached semantics cannot be made identical without changing the contract
- candidate compressed representation exceeds memory assumptions in representative workloads
- core/platform separation appears to require platform APIs in hot core logic
- ESP-IDF 6.0.x API/hardware behavior contradicts this contract
- Wokwi cannot model a required integration property
- an optimization changes semantics to obtain a benchmark win
- a hard M0A criterion appears impossible without introducing a forbidden M0 feature

A failed hypothesis is a valid result. Hiding it is not.

## Evidence references

- ESP-IDF timing guidance: https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-guides/performance/speed.html
- ESP Timer: https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-reference/system/esp_timer.html
- ESP-IDF heap capabilities: https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/system/mem_alloc.html
- ESP-IDF unit testing: https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-guides/unit-tests.html
- Wokwi ESP32 support/config: https://docs.wokwi.com/guides/esp32
- Wokwi project configuration: https://docs.wokwi.com/vscode/project-config
