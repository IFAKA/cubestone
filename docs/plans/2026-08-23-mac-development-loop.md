# Mac Development Loop Implementation Plan

> **For Codex:** Execute this plan task-by-task with fresh verification after each coherent change.

**Goal:** Make the SDL3 desktop build a usable Mac development/play loop while keeping all game semantics in the platform-independent core shared with ESP32-S3.

**Architecture:** Keep world, camera math, DDA, framebuffer rendering, and metrics in `src/core`. Split the desktop-only SDL display and input adapters from the application loop, and add a bounded frame-count option for repeatable smoke tests. The ESP32 component continues consuming the same core sources and does not consume desktop files.

**Tech Stack:** C++20, CMake, SDL3, native CTest, ESP-IDF component build.

---

### Task 1: Split SDL display and input adapters

**Files:** `platform/desktop/sdl_display.*`, `platform/desktop/sdl_input.*`, `platform/desktop/main.cpp`, `platform/desktop/CMakeLists.txt`

Move SDL window/texture lifecycle into a display adapter and keyboard/camera movement into an input adapter. Keep the main loop responsible only for orchestration and calling the core renderer.

### Task 2: Add deterministic desktop smoke mode

**Files:** `platform/desktop/main.cpp`, `README.md`

Accept `--frames N`, render exactly N frames, and exit successfully. Document the normal play command, controls, logical resolution, and smoke command.

### Task 3: Verify both platform boundaries

Run the desktop configure/build, bounded SDL dummy-video smoke, native tests, and ESP32 component build when the installed toolchain is available. Inspect the final diff for SDL/ESP-IDF leakage into `src/core`.

### Task 4: Update persistent state

Record only verified Mac-loop results and any remaining Wokwi/physical-hardware limitations in `STATE.md`.
