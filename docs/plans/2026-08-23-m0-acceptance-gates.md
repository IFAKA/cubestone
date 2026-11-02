# M0 Acceptance Gates Implementation Plan

> **For Codex:** Execute this plan task-by-task with fresh verification after each coherent change.

**Goal:** Finish the repository-testable M0A acceptance gates and record any genuinely unavailable ESP-IDF/Wokwi evidence without weakening the contract.

**Architecture:** Keep `src/core` portable and use the same implementation sources from native and ESP-IDF builds. Add only platform diagnostics, integration configuration, and verification needed by the M0A contract.

**Tech Stack:** C++20, CMake, ESP-IDF 6.0.x, SDL3, Wokwi configuration, native CTest/benchmark tooling.

---

### Task 1: Verify available embedded tooling

Inspect the installed ESP-IDF export and Wokwi CLI availability. Run the exact ESP32-S3 configure/build commands if the toolchain is usable. Preserve failures as evidence.

### Task 2: Close repository-side ESP32/Wokwi integration gaps

Inspect the firmware component source list, N16R8 defaults, memory diagnostics, flash partitioning, and simulator configuration. Implement only missing contract-required pieces.

### Task 3: Independently verify all native and repository-side gates

Run clean native configure/build/CTest, desktop build/smoke, benchmark/schema validation, ESP-IDF build if available, and Wokwi integration if the required CLI and generated firmware inputs exist.

### Task 4: Update persistent state

Record only verified results, exact blockers, and the next operation in `STATE.md`; do not mark M0A accepted unless every non-physical criterion passes.
