# Cubestone

Standalone Minecraft-like voxel game developed and played on macOS first, with
the same portable game core designed to run on ESP32-S3 N16R8 later. The core
preserves the long-term targets of 240x135 RGB565 rendering, >=30 FPS P95 on
physical hardware (M0B), 20 TPS logic, and an effectively infinite
deterministic world.

This repository does **not** port Minecraft. It implements observable
Minecraft-like behavior using a Mac-playable desktop harness and a constrained
portable core that can later be embedded without rewriting the game logic.
The current milestone is **M0A**: architecture and correctness validation,
without physical-performance claims.

## Layout

```
src/core/       portable constrained C++20 game core (world + DDA + metrics)
platform/desktop/  SDL3 Mac development/play harness
platform/esp32/   later ESP-IDF target consuming the same core
tests/          native unit/golden/benchmark suites
docs/           authoritative specs (constraints, architecture, benchmark-contract, milestones)
sim/wokwi/      Wokwi integration target (Phase 8)
```

## Authority order

`docs/constraints.md` > `docs/architecture.md` > `docs/benchmark-contract.md` >
tests that encode those documents > task prompt > implementation convenience.
Read `AGENTS.md` before changing architecture or interfaces.

## Development loop

For each subtask: read spec/code -> implement smallest coherent change ->
`cmake` configure/build -> run native tests -> (if hot path changed) run
benchmark -> inspect -> proceed. See `AGENTS.md`.

## Native build & tests (Phase 0+)

```sh
cmake -S . -B build-native -DCMAKE_BUILD_TYPE=Release
cmake --build build-native
ctest --test-dir build-native --output-on-failure
```

Or via preset: `cmake --preset native && cmake --build --preset native`.

## Play on macOS

Build and launch the SDL3 desktop loop with the `desktop` preset:

```sh
cmake --preset desktop
cmake --build --preset desktop --target cubestone_desktop
open build-desktop/platform/desktop/Cubestone.app
```

The logical render surface remains 240x135 and is presented in a larger
integer-scaled window. Use `WASD` to move, the arrow keys to look, and `Esc` or
the window close button to exit. For a bounded dummy-video smoke run, use:

```sh
SDL_VIDEODRIVER=dummy ./build-desktop/platform/desktop/Cubestone --frames 2
```

The SDL window, presentation, and input adapters are desktop-only. The world,
camera math, DDA traversal, and RGB565 renderer remain in `src/core`, which is
compiled unchanged by the ESP-IDF target.

## ESP32-S3 compatibility target (later milestone)

Built with ESP-IDF against `platform/esp32`:

```sh
cd platform/esp32
idf.py set-target esp32s3
idf.py build
```

ESP-IDF toolchain is required for this path and is not part of native builds.

## Support

If this project is useful to you, you can support my work:

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/zfaka)
