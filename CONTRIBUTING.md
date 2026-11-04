# Contributing

Thanks for your interest in COSMOS. The project is in Phase 0; expect breaking changes.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) in English:

```
feat(memory): resolve project by git root commit
fix(storage): retry atomic rename when target is locked
docs(adr): record compact MCP surface
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `build`, `ci`, `chore`.
Scopes usually match a crate or package name without the `cosmos-` prefix.

## Before opening a pull request

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo run -p cosmos-cli -- schema export contracts   # if you changed a contract type
pnpm -r typecheck
```

## Architecture decisions

Significant decisions are recorded in [`docs/adr/`](docs/adr/) using
[the template](docs/adr/0000-template.md). The master plan is
[`docs/plano-mestre.md`](docs/plano-mestre.md) (Portuguese).

## Rules that are never relaxed

- No telemetry.
- Never write into a user's code repository unless the user opted in (R8).
- Never silently overwrite a file edited outside COSMOS (R12).
- Secrets never reach Markdown, logs or the mirror.
