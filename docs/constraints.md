# Constraints

## 1. Target and objective

### Product direction

- Mac desktop is the current development and playable target.
- ESP32-S3 N16R8 is the later embedded deployment target.
- The desktop harness may provide presentation and input, but must not create
  a separate game core or alter deterministic core behavior.
- The ESP32-S3 build must consume the same `src/core` implementation used by
  the Mac target.

### HARD: target class

- SoC: ESP32-S3
- CPU: two Xtensa LX7 cores, target configuration 240 MHz
- module target: N16R8 class
- flash: 16 MB
- PSRAM: 8 MB Octal
- no GPU
- internal render resolution: 240x135
- framebuffer format for M0: RGB565

### Long-term product targets

These are physical-hardware acceptance targets, not simulator claims:

- >=30 FPS P95
- 20 TPS logical game simulation
- effectively infinite deterministic world
- responsive player-local interactions
- no crashes under supported workloads
- retain elastic memory headroom rather than permanently filling all available memory

The optimization objective is observable Minecraft feature fidelity per constrained hardware resource, not maximum benchmark FPS in isolation.

## 2. Software baseline

### HARD

- language: constrained C++20
- embedded framework: ESP-IDF stable release, pinned by project tooling
- initial reference line: ESP-IDF v6.0.2 or a later explicitly reviewed 6.0.x bugfix release
- desktop harness: SDL3
- build system: CMake for portable/desktop targets; ESP-IDF's CMake component system for firmware
- generated `sdkconfig` is not authoritative configuration
- version-controlled ESP configuration lives in `sdkconfig.defaults` and target-specific defaults if needed

Do not track ESP-IDF `master`/`latest` implicitly. Upgrades require an explicit change with build/test evidence.

## 3. Core/platform separation

### HARD

`src/core` may not depend on:

- ESP-IDF headers/APIs
- FreeRTOS
- SDL
- POSIX/Windows/macOS platform APIs
- filesystem/network APIs
- hardware clocks/timers
- display drivers
- simulator APIs

Core receives data/services through narrow explicit interfaces or caller-owned values.

Desktop and embedded builds compile the same core implementation sources.

## 4. Memory model

ESP32-S3 has capability-aware heaps. Platform code must not assume ordinary `malloc()` implies a particular physical memory class.

### Conceptual classes

- `Hot`: latency-sensitive internal data where internal placement is materially beneficial
- `Dma`: buffers/descriptors satisfying the specific peripheral/DMA engine requirements
- `Cold`: large data suitable for PSRAM

### HARD

- memory placement is explicit for large/hot embedded allocations
- no dynamic allocation in `renderFrame()` after initialization
- no dynamic allocation per ray or per DDA step
- no per-`blockAt()` allocation
- allocation failures are checked
- benchmark/resource reports distinguish internal memory and PSRAM
- track free memory, minimum free memory where supported, and largest allocatable block/capability-relevant fragmentation metrics

### Important ESP32-S3 DMA nuance

Do not encode the obsolete blanket rule “DMA buffers cannot use PSRAM.” ESP-IDF 6.0.2 documents that generic `MALLOC_CAP_DMA` excludes PSRAM, but ESP32-S3 EDMA can access PSRAM using appropriate capability flags/alignment, with restrictions. DMA descriptors still cannot live in PSRAM, and PSRAM DMA bandwidth can contend with CPU accesses.

Therefore each display strategy must be validated against the actual display peripheral/driver and physical board. M0 may use internal staging buffers, but must not make that an irreversible engine assumption.

## 5. Initial resource hypotheses

These are `HYPOTHESIS`, not pass/fail facts:

- steady-state PSRAM target <=6.5-7.0 MB
- elastic PSRAM/burst headroom approximately 1.0-1.5 MB
- logical chunk candidate: 16x16x64
- compressed generated-terrain average target <=8 KB/chunk
- approximately 25 fully active chunks as an initial later simulation hypothesis
- hot entity target <=64 B/entity, later milestone
- approximately 32 fully active entities, later milestone
- approximately 4096 scheduled-event capacity, later milestone

M0 must measure chunk representation size instead of coding to the <=8 KB assumption.

A raw 16x16x64 `uint8_t` voxel array is exactly 16,384 bytes before metadata. This is a baseline, not the intended final representation.

## 6. World/persistence constraints

### HARD design rules

1. Deterministically regenerable untouched terrain must require no persistent per-block storage.
2. Renderer asks for block occupancy/material through a world-query boundary, not by directly traversing chunk internals.
3. Cache representation is an optimization and must not change world semantics.
4. M0 procedural world is the correctness oracle for cached world queries.
5. Coordinates must correctly handle negative values and chunk boundaries.

Persistence and microSD are explicitly outside M0.

## 7. Rendering constraints

### M0 HARD

- genuine 3D voxel grid traversal
- no heightmap/slab-only renderer
- exactly 240x135 logical framebuffer
- RGB565
- one ray per logical pixel for the baseline implementation unless a benchmark experiment explicitly changes it
- configurable finite maximum ray distance
- deterministic benchmark cameras
- opaque block hit/miss only
- flat material colors are sufficient
- no texture sampling, propagated lighting, transparency, fog, entities, sky, or post-processing required

The renderer must not depend on chunk representation.

## 8. Timing and performance evidence

### HARD

- Mac timing is desktop performance evidence only
- CI timing is CI-host performance evidence only
- Wokwi timing is not physical ESP32 performance evidence
- only physical target hardware may accept/reject the >=30 FPS P95 target
- benchmark build mode/compiler configuration must be recorded
- benchmark comparisons use identical workloads/configuration

For ESP32 microbenchmarks, use a measurement mechanism appropriate to duration. ESP-IDF documents `cpu_hal_get_cycle_count()` as lower-overhead for very short measurements when execution is pinned to one core, while `esp_timer_get_time()` provides microsecond wall-clock timestamps with moderate call overhead.

## 9. Concurrency constraints

M0 does not need a sophisticated job system.

### HARD

- core logic must not require FreeRTOS
- desktop core correctness must be runnable single-threaded
- platform may later schedule core work across both ESP32 cores
- benchmark results must identify whether a workload is single-core or multi-core
- cycle-counter microbenchmarks must remain on one core because the counter is per-core

Do not prematurely parallelize world queries or DDA before obtaining a correct single-thread baseline.

## 10. Wokwi constraints

Use Wokwi to validate actual ESP32 firmware integration:

- ESP32-S3 target boots
- 16 MB flash configuration
- 8 MB Octal PSRAM configuration
- PSRAM initialization/allocation paths
- assertions/error paths
- FreeRTOS/platform integration when introduced
- watchdog/integration behavior

Do not use Wokwi to claim:

- target FPS
- physical memory bandwidth
- PSRAM contention behavior
- display DMA throughput
- thermal/stability behavior

## 11. Failure policy

If a hard constraint cannot be satisfied:

- fail loudly
- capture the failing condition and evidence
- do not silently lower resolution, ray distance, test coverage, or correctness criteria
- do not convert a hard constraint into a hypothesis without an explicit architecture decision

## Evidence references

- ESP-IDF v6.0.2 ESP32-S3 Programming Guide: https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/
- ESP-IDF heap capabilities: https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/system/mem_alloc.html
- ESP-IDF external RAM restrictions: https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-guides/external-ram.html
- ESP-IDF speed measurement guidance: https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-guides/performance/speed.html
- SDL3 CMake guidance: https://wiki.libsdl.org/SDL3/README-cmake
- Wokwi ESP32 configuration: https://docs.wokwi.com/guides/esp32
- Wokwi project configuration: https://docs.wokwi.com/vscode/project-config
