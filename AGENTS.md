# AGENTS.md

## Mission

Build the maximum-fidelity standalone Minecraft-like implementation physically achievable on an ESP32-S3 N16R8 while preserving these long-term targets:

- ESP32-S3, dual-core Xtensa LX7, 240 MHz
- 16 MB flash, 8 MB Octal PSRAM
- 240x135 internal render resolution
- > =30 FPS P95 on physical target hardware
- 20 TPS logical simulation
- effectively infinite deterministic procedural world
- safe memory headroom, responsive input, no crashes

This repository does not port Minecraft's engine. It implements observable Minecraft-like behavior using representations and scheduling appropriate for embedded hardware.

## Authority order

When instructions conflict, obey in this order:

1. `docs/constraints.md`
2. `docs/architecture.md`
3. `docs/benchmark-contract.md`
4. tests that encode those documents
5. task prompt
6. implementation convenience

If a higher-authority document contradicts hardware documentation or itself, stop implementation of the affected part and report the contradiction. Do not silently reinterpret it.

## Current milestone: M0A

M0A exists to test one architectural hypothesis:

> A cheap enough deterministic `blockAt(x,y,z)` plus regenerable/compressed chunk caching can feed a genuine 3D voxel DDA renderer at 240x135 with an architecture that remains viable on ESP32-S3.

M0A is architecture/correctness validation without claims about real ESP32 performance.

Implement only what is required to validate:

1. deterministic infinite-coordinate block source
2. candidate chunk/cache representation
3. cached-vs-procedural correctness oracle
4. genuine 3D voxel DDA renderer
5. 240x135 RGB565 framebuffer
6. SDL3 desktop display/input harness
7. ESP-IDF ESP32-S3 build
8. Wokwi boot/integration configuration
9. resource/performance instrumentation
10. automated correctness, golden, and benchmark workloads

## Hard agent rules

- Do not expand scope.
- Do not add gameplay systems during M0A.
- Never invent, interpolate, or imply ESP32 performance from Mac, CI, or Wokwi timing.
- Keep `src/core` independent of SDL, ESP-IDF, FreeRTOS, Wokwi, OS filesystems, sockets, and platform clocks.
- No dynamic allocation inside `renderFrame()` or the per-ray/per-voxel hot loop.
- Correctness before optimization.
- Every optimization must preserve the fixed workload and show before/after measurements on the same platform/build configuration.
- Never weaken, delete, skip, or rewrite a failing correctness test solely to make an implementation pass.
- Treat numeric resource budgets marked `HYPOTHESIS` as experiments, not requirements.
- Treat values marked `HARD` as requirements.
- Compile and run relevant tests after small coherent changes.
- Inspect existing code before changing interfaces or architecture.
- Prefer the smallest implementation that can falsify the current hypothesis.
- Do not introduce an abstraction unless M0A requires at least two implementations or it isolates an explicit platform boundary.
- Avoid heap churn. Prefer fixed-capacity, caller-owned, arena, or startup-time allocation for hot systems.
- Do not optimize code that has not been measured as material to the current workload.
- Do not hide failures behind automatic quality degradation during M0A benchmarks. Benchmarks must be reproducible.

## Language contract

Portable core and platform C++ code use a constrained C++20 subset.

ESP32 builds must have exceptions and RTTI disabled.

Forbidden in `src/core` unless a later decision record explicitly allows it:

- exceptions
- RTTI / `dynamic_cast` / `typeid`
- iostreams
- `std::filesystem`
- `std::thread`
- `std::function` in hot paths
- `shared_ptr`
- uncontrolled `new`/`delete`
- hidden heap allocation in frame, ray, voxel-query, or cache-hit paths
- virtual dispatch in measured hot loops without evidence that its cost is negligible

Preferred tools:

- plain value types / POD-style layouts
- `constexpr`
- templates when they compile away runtime dispatch
- `std::array`
- `std::span`
- explicit integer widths
- explicit ownership
- explicit memory classes at the platform boundary

## M0A non-goals

Do not implement:

- mobs/entities
- inventory/items
- crafting
- textures
- light propagation
- sky/day-night
- weather
- fluids
- redstone
- structures/villages
- persistence/microSD
- sound
- multiplayer/networking
- UI/menu systems
- full biome system
- farming
- furnaces/brewing/enchanting
- adaptive performance controller

Simple benchmark terrain generation is allowed only because the renderer and cache require deterministic geometry.

## Required development loop

For each subtask:

1. inspect relevant specification and code
2. state internally what invariant is being changed/tested
3. implement the smallest coherent change
4. compile
5. run relevant correctness tests
6. run the relevant fixed benchmark if hot-path behavior changed
7. inspect failures/metrics
8. fix or revert
9. proceed only when invariants hold

Do not accumulate a large untested patch.

## Completion rule

M0A is complete only when every M0A criterion in `docs/benchmark-contract.md` passes. Physical-FPS acceptance belongs to M0B and cannot be marked complete without physical N16R8-class hardware.

## Persistent working-memory protocol

`docs/milestones/M0.md` is the executable contract for the current milestone. `STATE.md` is persistent working memory, not optional documentation.

At session start, after any context compaction/restart, and before resuming implementation:

1. read this file completely
2. read `docs/milestones/M0.md`
3. read `STATE.md`
4. read every authoritative specification named by the current phase in `STATE.md`
5. inspect the current git diff/status and relevant source before acting

Never reconstruct project requirements, completed work, benchmark results, or pending work from conversational memory when they can be recovered from the repository.

Update `STATE.md` after every coherent phase, before intentionally ending a session, and before/after any operation likely to lose context. Record only verified state. Never record an intended result as completed.

If `STATE.md`, tests, source, and authoritative specifications disagree, trust the authority order above, inspect evidence, correct `STATE.md`, and stop if the disagreement changes architecture or invalidates prior measurements.

Do not use `STATE.md` to create new requirements. Architectural decisions belong in authoritative docs/decision records.

## Tool-loop discipline

During implementation, act through tools rather than drafting implementation in the response.

- Never emit source code blocks for code that belongs in the repository.
- Never mentally implement an entire file before editing it.
- After deciding the next concrete change, immediately use the edit/write tool.
- Keep reasoning local to the next operation.
- Implement one coherent change, then compile/test it.
- If a change requires substantial code, write it directly to the file in bounded edits.
- Do not use the assistant response as a scratchpad for source code.
- Prefer: inspect -> edit -> test -> inspect.
- Update STATE.md after each completed M0 phase.
- A response approaching the output limit is a failure of task decomposition. Stop reasoning earlier and perform the next tool action.
