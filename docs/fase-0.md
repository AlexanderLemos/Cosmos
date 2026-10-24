# F0 — Fundação e critérios de saída

Este documento acompanha a primeira etapa do [plano v2.2](plan/COSMOS_Plano_Mestre_v2.2_Consolidado.md).
Não substitui nem reduz o escopo das fases F1–F6.

## Implementação inicial

- Workspace pnpm + Turbo + Cargo, ferramentas fixadas e lockfiles.
- Shell Web React 19/Vite e shell Desktop Tauri 2 compartilhando UI.
- Tokens Espectrais, temas Nyx/Hēmérā, pt-BR/en e reduced motion.
- `cosmos-core`: contratos iniciais e inspeção Markdown sem escrita.
- JSON Schemas gerados do Rust; tipos TS gerados; checagem de divergência sem alterar fontes.
- Contrato `VaultFS`; implementação inicial de persistência agora acompanhada em [F1](fase-1.md).
- Fixtures Markdown compartilhadas TS/Rust, testes de contratos, smoke Web e axe.
- CI da fundação validada em Linux, Windows e macOS (run `40086813630`).
- Licença MIT e registro de assets incorporados.

## Ainda necessário para concluir F0 (§25)

| Entrega                  | Estado e evidência necessária                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contratos completos      | Completar eventos restantes, resumo de sessão, MCP, HTTP, documentos e validações de domínio                                                                 |
| S1 — Sidecar e autostart | `cosmosd` v0 e sidecar implementados em F1; CLI, autostart e instalação real nos três SOs pendentes                                                          |
| S2 — Hooks reais         | CLI Codex 0.163.0 encontrado; Claude e Hermes ausentes. Capturar payloads oficiais em sessões de teste autorizadas; não inferir suporte pelos nomes do plano |
| S3 — SQLite-WASM         | SAH Pool + FTS5 implementados em F1, teste Chromium local e três engines na CI; revisar evidência remota                                                     |
| S4 — Escrita atômica     | Testar arquivo bloqueado, retry e recuperação em Windows real                                                                                                |
| S5 — MCP stdio → IPC     | Implementar spike com `rmcp`; validar handshake e erro de versão                                                                                             |
| Prototipação             | Figma/protótipos e aprovação visual do usuário ainda pendentes                                                                                               |
| Curadoria                | Moodboard, cerca de 40 candidatos, licença individual, otimização e créditos antes de telas finais                                                           |
| Licenças                 | Inventário completo das dependências transitivas e revisão da licença GSAP ainda pendentes                                                                   |
| Builds multiplataforma   | Matriz da fundação passou nos três SOs; builds de F1 acompanhados no novo workflow                                                                           |
| Testes D1–D6             | Os testes iniciais verificam contratos apenas. Testes comportamentais dependem da implementação F1/F2                                                        |

Os relatórios locais e limitações do ambiente ficam em [ambiente.md](ambiente.md).
Nenhum item não executado deve ser marcado como validado.
