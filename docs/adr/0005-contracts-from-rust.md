# ADR 0005 · Contratos gerados a partir do Rust

- **Status:** aceita
- **Data:** 2026-11-04
- **Seções do plano afetadas:** §10.2, §22

## Decisão

- Os tipos de contrato (eventos, resumo de sessão, manifesto, mensagens IPC) são definidos
  **uma vez**, em Rust (`crates/cosmos-core`), com `serde` + `schemars`.
- `cosmos schema export contracts` grava os JSON Schemas versionados em `contracts/v1/`.
- `packages/schemas` gera os tipos TypeScript a partir desses arquivos
  (`json-schema-to-typescript`). Ninguém edita os tipos gerados à mão.
- O CI falha se `contracts/` estiver desatualizado em relação ao código Rust.

## Consequências

- Uma fonte única para Rust, TypeScript e para validar entradas externas (resumos de
  agentes, manifestos).
- Mudança incompatível em um contrato exige nova versão (`contracts/v2/`).

## Alternativas consideradas

- **`specta`/`ts-rs`:** geram TS direto, mas não produzem o JSON Schema de que precisamos para
  validar entradas de agentes. Podem ser usados no futuro para os comandos Tauri.
