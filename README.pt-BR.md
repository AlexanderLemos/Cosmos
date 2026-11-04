# COSMOS

> *Toda ideia nasce no Caos. O Cosmos é a ordem que você dá a ela.*
>
> **COSMOS Memory:** um projeto, uma memória, qualquer modelo, qualquer sessão.

[English](README.md)

O COSMOS é um sistema de conhecimento local-first e Markdown-first, com dois pilares:

1. **COSMOS Memory:** memória persistente de projetos, independente de fornecedor,
   compartilhada entre agentes (Claude Code, OpenAI Codex, Hermes Agent e qualquer cliente
   MCP). Um serviço local, o `cosmosd`, registra o que aconteceu em cada sessão e entrega
   ao próximo agente um contexto compacto e com orçamento de tokens (o *Fio de Ariadne*).
2. **COSMOS Desktop:** app de PKM (Tauri 2 + React) compatível com Markdown puro e cofres
   do Obsidian.

Tudo fica em Markdown legível em `Documentos/COSMOS/`. Nenhuma conta ou serviço de rede
é necessário.

## Estado

**Fase 0: fundação.** Ainda não há nada utilizável. O primeiro marco é *memória primeiro*
(ver [ADR 0001](docs/adr/0001-memory-first.md)):

> Abro o Claude Code num repositório, trabalho e fecho. No dia seguinte abro de novo e ele
> já sabe onde parou, sem eu colar nada.

O plano completo está em [docs/plano-mestre.md](docs/plano-mestre.md).

## Desenvolvimento

Requisitos: Rust (stable, 1.85+), Node.js 22+, pnpm 10+. No Linux, o app Desktop também
precisa do WebKitGTK 4.1 (ver [pré-requisitos do Tauri](https://v2.tauri.app/start/prerequisites/)).

```bash
cargo test --workspace --exclude cosmos-desktop   # núcleo Rust, sem a interface
pnpm install && pnpm -r typecheck                 # pacotes TypeScript
cargo run -p cosmos-cli -- schema export contracts # regenerar os JSON Schemas
```

## Licença

[MIT](LICENSE). Assets e dependências de terceiros mantêm suas próprias licenças.
