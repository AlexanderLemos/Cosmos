# COSMOS

> *Every idea is born in Chaos. Cosmos is the order you give it.*
>
> **COSMOS Memory:** one project, one memory, any model, any session.

[Português](README.pt-BR.md)

COSMOS is a local-first, Markdown-first knowledge system with two pillars:

1. **COSMOS Memory**: a persistent, vendor-neutral project memory shared by coding agents
   (Claude Code, OpenAI Codex, Hermes Agent and any MCP client). A local daemon, `cosmosd`,
   records what happened in each session and hands the next agent a compact,
   token-budgeted context (the *Thread of Ariadne*).
2. **COSMOS Desktop**: a PKM app (Tauri 2 + React) compatible with plain Markdown and
   Obsidian vaults.

Everything is stored as readable Markdown in `Documents/COSMOS/`. No account and no
network service are required.

## Status

**Phase 0: foundation.** Nothing is usable yet. The first milestone is *memory first*
(see [ADR 0001](docs/adr/0001-memory-first.md)):

> Open Claude Code in any repository, work, close it. Tomorrow, open it again and it
> already knows where you stopped, without pasting anything.

## Repository layout

| Path | Contents |
|---|---|
| `crates/` | Rust libraries: domain, storage, memory rules, IPC, CLI |
| `services/cosmosd/` | The local daemon |
| `apps/desktop/` | Tauri 2 desktop app |
| `packages/` | TypeScript packages (generated schemas, UI) |
| `contracts/` | Versioned JSON Schemas generated from Rust |
| `integrations/` | Skills, hooks and configs for each agent harness |
| `docs/` | Master plan, ADRs, specs |
| `scripts/spikes/` | Phase 0 experiments (hook payload capture, etc.) |

## Development

Requirements: Rust (stable, 1.85+), Node.js 22+, pnpm 10+. On Linux the desktop app
also needs WebKitGTK 4.1 (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).

```bash
cargo test --workspace --exclude cosmos-desktop   # Rust core, without the GUI
pnpm install && pnpm -r typecheck                 # TypeScript packages
cargo run -p cosmos-cli -- schema export contracts # regenerate JSON Schemas
```

## Principles

Local-first · Markdown-first · model-agnostic · project-centric · token-efficient ·
secure by design · **no telemetry**.

## License

[MIT](LICENSE). Third-party assets and dependencies keep their own licenses
(see `assets/CREDITS.md` once assets are added).
