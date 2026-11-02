# Local Worker Orchestration Implementation Plan

**Goal:** Give Codex a repository-local, bounded way to delegate independently verifiable Cubestone implementation tasks to Pi/Ornith while retaining architecture and acceptance authority.

**Architecture:** A repository-scoped Codex skill makes delegation discoverable and governs task selection. A dependency-free Node runner validates a JSON task, preflights the configured model endpoint, invokes Pi in ephemeral JSON mode, applies execution guards, snapshots worktree changes, and returns evidence for independent Codex review.

**Tech stack:** Codex repository skills, Node.js standard library, Pi JSON event mode, existing CMake/CTest verification.

## Tasks

1. Add and syntax-check the bounded runner and its task/result contracts.
2. Add and validate the repository-scoped Codex delegation skill.
3. Run a disposable, path-fenced worker task through Pi against the live Ornith endpoint.
4. Independently inspect the resulting diff and rerun its verification in Codex.
5. Remove or retain the disposable probe based on review, then record only verified repository state.
