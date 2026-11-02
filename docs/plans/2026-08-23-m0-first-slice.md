# M0 Native Core Foundation Implementation Plan

> **For Codex:** Execute this plan task-by-task with fresh verification after each coherent change.

**Goal:** Establish the smallest buildable, testable native foundation for the shared portable core from the clean implementation restart.

**Architecture:** Create one CMake target for `src/core` and one dependency-free native test executable. The core exposes only a minimal identity contract so the build boundary can be verified before world, renderer, SDL3, ESP-IDF, or simulator code is introduced.

**Tech Stack:** C++20, CMake, CTest, AppleClang or another warning-clean host compiler.

---

## Slice boundary

This slice intentionally does not implement coordinates, blocks, world queries,
chunks, DDA, framebuffer rendering, SDL3, ESP-IDF, Wokwi, benchmarks, or game
play. It proves only that the repository can build and test one platform-
independent core source path.

## Exact files to create

- `CMakeLists.txt`
- `src/core/CMakeLists.txt`
- `src/core/include/mc/core.hpp`
- `src/core/version.cpp`
- `tests/CMakeLists.txt`
- `tests/unit/test_core_identity.cpp`

No existing implementation file is restored, and no file under `platform/`,
`src/core/world/`, `src/core/renderer/`, or `tests/` beyond the listed test is
part of this slice.

## Acceptance evidence

Run from the repository root:

```sh
cmake -S . -B build-native -DCMAKE_BUILD_TYPE=Release -DCUBESTONE_TESTS=ON -DCUBESTONE_DESKTOP=OFF
cmake --build build-native
ctest --test-dir build-native --output-on-failure
```

Acceptance requires:

1. configure succeeds;
2. the core library and identity test compile with the repository warning policy;
3. CTest reports the identity test passing;
4. a source scan finds no SDL, ESP-IDF, FreeRTOS, filesystem, socket, or
   platform-clock dependency under `src/core`;
5. `renderFrame()` and gameplay/world interfaces are absent rather than stubbed
   into this foundation slice;
6. the worktree diff contains exactly the six listed new files plus no generated
   build artifacts.

## Delegation assessment

The first slice stays with Codex. It establishes the architecture and build
boundary, so delegation would move an integration decision into the worker for
little expected savings. After this slice is accepted, a purely mechanical,
path-fenced test-data or focused unit-test task may be considered for local
worker delegation; world semantics, renderer boundaries, cache representation,
ESP32 integration, diagnosis, and acceptance remain Codex-owned.
