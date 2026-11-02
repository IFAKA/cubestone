# Architecture

## 1. Product and architectural direction

Mac is the primary development and playable target during current work. The
game is developed through the SDL3 desktop harness, while the game rules,
world representation, camera math, traversal, and renderer remain in the
portable core. The ESP32-S3 target is a later deployment target that must
consume those same core sources rather than create a second game implementation.

## 2. Architectural hypothesis

M0 tests this proposition, not the entire future game:

> A deterministic world query with an optional compressed/regenerable cache can feed a genuine voxel DDA renderer cheaply enough to justify building higher-level Minecraft-like systems on this architecture.

The architecture must let us replace world storage/compression, renderer optimizations, and platform presentation independently.

## 3. Dependency rule

Dependencies point inward toward the portable core.

```text
                    +----------------------+
                    |       src/core       |
                    | world + DDA + metrics|
                    +----------+-----------+
                               ^
                    platform-owned adapters
                     /                     \
                    /                       \
          +--------+---------+       +------+---------+
          | platform/desktop |       | platform/esp32 |
          |      SDL3        |       |    ESP-IDF     |
          +------------------+       +----------------+
```

`src/core` never imports platform code.

## 4. Repository shape

```text
/
├── AGENTS.md
├── README.md
├── CMakeLists.txt
├── CMakePresets.json
├── docs/
│   ├── constraints.md
│   ├── architecture.md
│   ├── benchmark-contract.md
│   └── decisions/
├── src/
│   └── core/
│       ├── CMakeLists.txt
│       ├── include/mc/
│       │   ├── block.hpp
│       │   ├── coords.hpp
│       │   ├── world.hpp
│       │   ├── chunk.hpp
│       │   ├── camera.hpp
│       │   ├── framebuffer.hpp
│       │   ├── renderer.hpp
│       │   ├── metrics.hpp
│       │   └── memory.hpp
│       ├── world/
│       │   ├── procedural_world.cpp
│       │   └── cached_world.cpp
│       ├── renderer/
│       │   └── dda.cpp
│       └── metrics/
├── platform/
│   ├── desktop/
│   │   ├── CMakeLists.txt
│   │   ├── main.cpp
│   │   ├── sdl_display.cpp
│   │   └── sdl_input.cpp
│   └── esp32/
│       ├── CMakeLists.txt
│       ├── sdkconfig.defaults
│       ├── sdkconfig.defaults.esp32s3
│       ├── partitions.csv
│       ├── main/
│       │   └── main.cpp
│       └── components/
│           └── mc_core/
│               └── CMakeLists.txt
├── tests/
│   ├── CMakeLists.txt
│   ├── unit/
│   ├── golden/
│   └── benchmark/
├── sim/
│   └── wokwi/
│       ├── diagram.json
│       └── wokwi.toml
├── tools/
│   ├── run-bench.py
│   └── verify-results.py
└── .github/workflows/ci.yml
```

Exact file splitting may change if it preserves these boundaries. Do not create future-game subsystem directories during M0.

## 5. Core domain types

Use explicit-width types and stable value semantics.

Conceptual types:

```cpp
using BlockId = uint8_t; // M0 baseline only; widen later if evidence requires it.

struct BlockPos { int32_t x, y, z; };
struct Camera { /* position + orientation + projection parameters */ };

struct FramebufferView {
    uint16_t* pixels;
    uint16_t width;
    uint16_t height;
    uint16_t stridePixels;
};
```

Do not freeze `BlockId` width as a long-term Minecraft-fidelity decision. M0 only needs enough material IDs for deterministic terrain and renderer validation.

## 6. World-query boundary

The renderer's semantic dependency is a block query:

```text
BlockId blockAt(x, y, z)
```

Required implementations:

### `ProceduralWorld`

- deterministic from seed + coordinates
- conceptually unbounded in X/Z
- explicit finite M0 vertical rule if needed
- no chunk cache required for correctness
- serves as semantic oracle

### `CachedWorld`

- exposes identical query semantics
- stores/regenerates candidate 16x16x64 chunks
- may use compressed subblocks
- must be testable against `ProceduralWorld`

The public renderer interface must not expose:

- chunk pointers
- palettes
- cache slots
- PSRAM pointers
- storage formats

### Dispatch rule

Do not require runtime virtual dispatch in the DDA hot loop. The architecture may express the semantic interface through templates, concrete specialization, or another zero/low-overhead mechanism. If function-pointer/virtual dispatch is tested, benchmark it before making it the baseline.

## 7. Coordinate system

Define exactly once:

- voxel coordinate convention
- world vertical bounds used by M0, if finite
- camera units
- floor conversion from floating/fixed position to voxel coordinate
- chunk coordinate mapping
- local coordinate mapping

Negative-coordinate behavior must use mathematical floor semantics, not truncation-toward-zero assumptions.

Mandatory boundary tests include values around every chunk edge, especially:

```text
-17 -16 -15 -1 0 1 15 16 17
```

## 8. Candidate chunk representation

M0 must include a raw baseline and at least one compressed candidate.

### Raw baseline

```text
16 * 16 * 64 = 16,384 voxels
uint8_t BlockId => 16,384 bytes payload
```

### Candidate compressed representation

Partition chunk space into 4x4x4 logical subblocks. Each subblock may choose one representation such as:

- uniform: one block ID
- palette/bit-packed indices
- raw fallback

The precise bit packing is implementation work, but these invariants are required:

1. decode is exact
2. cached queries equal the procedural oracle
3. representation reports exact allocated/payload bytes
4. transitions between representations are deterministic
5. no renderer knowledge of representation

The <=8 KB/chunk average is not a correctness criterion.

## 9. DDA renderer

Baseline M0 renderer performs genuine 3D voxel traversal for every logical pixel.

Pipeline:

```text
Camera
  -> construct ray
  -> initialize voxel + tMax/tDelta/step per axis
  -> iterate voxel boundaries
  -> blockAt(voxel)
  -> first opaque hit or max distance
  -> flat material color
  -> RGB565 output
```

Required edge behavior:

- axis-aligned rays
- negative directions
- origins exactly on voxel boundaries
- origin inside a solid voxel
- near-zero direction components without divide-by-zero/NaN corruption
- deterministic tie handling when multiple voxel boundaries are crossed at equal parametric distance
- maximum-distance termination
- vertical out-of-world behavior

M0 correctness is more important than sophisticated projection or shading.

## 9. Framebuffer/presentation boundary

Core owns no SDL texture/window and no ESP display object.

Core receives a caller-provided `FramebufferView` and writes RGB565 pixels.

Desktop adapter:

```text
keyboard/mouse -> normalized input/camera update
core framebuffer -> SDL3 texture/presentation -> scaled window
```

Logical rendering remains 240x135 regardless of window size.

ESP32 adapter initially needs to prove build/integration and framebuffer-transfer architecture. Actual physical display driver choice is outside the core.

Do not hardwire “two complete internal DMA framebuffers.” The platform layer should permit later experiments with:

- internal full buffers
- PSRAM framebuffer + internal staging
- line/strip DMA buffers
- ESP32-S3 EDMA-accessible PSRAM when supported by chosen peripheral/driver
- overlap of rendering and transfer

## 10. Memory abstraction

Core may define allocation intent but cannot call ESP heap APIs.

Conceptual interface:

```cpp
enum class MemoryClass { Hot, Dma, Cold };
```

Platform allocator/accounting maps intent to actual storage.

Desktop implementation may use normal aligned allocation while tracking requested class and bytes.

ESP32 implementation uses capability-aware allocation appropriate to the actual requirement, for example internal memory for hot data and `MALLOC_CAP_SPIRAM` for cold PSRAM data. DMA allocation rules are peripheral-specific and must follow ESP-IDF/driver requirements.

M0 renderer should preferably operate on preallocated caller-owned storage so allocator abstraction is not touched during frame rendering.

## 11. Metrics architecture

Instrumentation is data, not logging sprinkled through hot loops.

Per workload/frame aggregate counters may include:

```text
raysCast
ddaSteps
worldQueries
cacheHits
cacheMisses
chunksResident
chunkPayloadBytes
chunkAllocatedBytes
```

Timing is measured around meaningful regions, not each voxel query.

Platform-specific sampler adds:

```text
internalFree
internalMinFree
internalLargestFreeBlock
psramFree
psramMinFree
psramLargestFreeBlock
```

Fields unsupported on a platform must be null/unavailable, not fabricated zeroes.

## 12. Desktop role

Desktop is the main correctness/development environment.

It provides:

- playable camera
- deterministic test runner
- sanitizers where supported
- fast unit/golden tests
- fixed-workload benchmarking
- artificial allocation accounting/budgets

Desktop cannot validate physical ESP timing or memory contention.

## 13. ESP-IDF role

ESP firmware is a platform consumer of the same core.

Requirements:

- `idf.py set-target esp32s3`
- core integrated as an ESP-IDF component using the normal component build mechanism
- explicit N16R8-class configuration defaults
- firmware build succeeds
- startup reports relevant memory capabilities/configuration
- benchmark/test mode can emit machine-readable results over serial when executed on a physical board later

## 14. Wokwi role

Wokwi project uses ESP32-S3 with:

```text
flashSize: 16 MB
psramSize: 8 MB
psramType: octal
```

For ESP-IDF, `wokwi.toml` should reference the generated `build/flasher_args.json` and ELF according to Wokwi's documented ESP-IDF integration.

Simulation is an integration/correctness target, never a physical performance oracle.

## 15. Testing architecture

### Native unit tests

Must cover:

- coordinate/chunk mapping
- deterministic generation
- cache/procedural equivalence
- compression encode/decode/transitions
- DDA edge cases
- framebuffer bounds

### Golden tests

Given fixed:

- code version
- seed
- scene definition
- camera
- resolution/FOV/max distance

produce deterministic block-query samples and framebuffer hash/checksum.

A golden change requires an explicit explanation. Never casually regenerate goldens after a failure.

### ESP target tests

ESP-IDF's Unity test framework may be used for hardware/platform-specific cases. Most algorithm correctness stays in native tests because iteration is cheaper.

## 16. Future-proofing without premature systems

The world query boundary is deliberately compatible with future layers:

```text
procedural base
    + persistent modifications
    + active simulation state
    -> observed blockAt()
```

Do not implement those layers in M0.

Similarly, renderer output is deliberately independent of later textures, lighting, entities, or display transfer strategy.

## Evidence references

- ESP-IDF build system/components: https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-guides/build-system.html
- ESP-IDF heap capabilities: https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/system/mem_alloc.html
- ESP-IDF external RAM: https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/api-guides/external-ram.html
- SDL3 CMake: https://wiki.libsdl.org/SDL3/README-cmake
- Wokwi ESP32: https://docs.wokwi.com/guides/esp32
- Wokwi project config: https://docs.wokwi.com/vscode/project-config
