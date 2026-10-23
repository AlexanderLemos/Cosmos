#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Cosmos
python3 scripts/cloud/prepare.py
. /workspace/.cosmos-tools/env.sh
test "$(node --version)" = "v24.19.0"
test "$(pnpm --version)" = "11.25.0"
pkg-config --modversion gtk+-3.0 webkit2gtk-4.1
pnpm install --frozen-lockfile
cargo fetch --locked
cargo install tauri-driver --locked --version 2.0.5
pnpm check
pnpm build
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
pnpm --filter desktop tauri build --debug --no-bundle
pnpm test:e2e
