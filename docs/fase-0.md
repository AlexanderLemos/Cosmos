# F0 — Fundação e critérios de saída

Este documento acompanha a primeira etapa do [plano v2.2](plan/COSMOS_Plano_Mestre_v2.2_Consolidado.md).
Não substitui nem reduz o escopo das fases F1–F6.

## Implementação inicial

- Workspace pnpm + Turbo + Cargo, ferramentas fixadas e lockfiles.
- Shell Web React 19/Vite e shell Desktop Tauri 2 compartilhando UI.
- Tokens Espectrais, temas Nyx/Hēmérā, pt-BR/en e reduced motion.
- `cosmos-core`: contratos iniciais e inspeção Markdown sem escrita.
- JSON Schemas gerados do Rust; tipos TS gerados; checagem de divergência sem alterar fontes.
- Contrato `VaultFS`, ainda sem adaptadores de persistência.
- Fixtures Markdown compartilhadas TS/Rust, testes de contratos, smoke Web e axe.
- CI configurado para Linux, Windows e macOS; execução remota ainda não realizada.
- Licença MIT e registro de assets incorporados.

## Ainda necessário para concluir F0 (§25)

| Entrega                  | Estado e evidência necessária                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contratos completos      | Completar eventos restantes, resumo de sessão, MCP, HTTP, documentos e validações de domínio                                                                 |
| S1 — Sidecar e autostart | Implementar `cosmosd`/CLI e validar Linux, Windows e macOS; nada instalado no login                                                                          |
| S2 — Hooks reais         | CLI Codex 0.163.0 encontrado; Claude e Hermes ausentes. Capturar payloads oficiais em sessões de teste autorizadas; não inferir suporte pelos nomes do plano |
| S3 — SQLite-WASM         | Testar FTS5 e OPFS em Chromium/Firefox/WebKit e escolher VFS por evidência                                                                                   |
| S4 — Escrita atômica     | Testar arquivo bloqueado, retry e recuperação em Windows real                                                                                                |
| S5 — MCP stdio → IPC     | Implementar spike com `rmcp`; validar handshake e erro de versão                                                                                             |
| Prototipação             | Figma/protótipos e aprovação visual do usuário ainda pendentes                                                                                               |
| Curadoria                | Moodboard, cerca de 40 candidatos, licença individual, otimização e créditos antes de telas finais                                                           |
| Licenças                 | Inventário completo das dependências transitivas e revisão da licença GSAP ainda pendentes                                                                   |
| Builds multiplataforma   | Executar a matriz CI e revisar os artefatos; configuração de workflow não comprova execução                                                                  |
| Testes D1–D6             | Os testes iniciais verificam contratos apenas. Testes comportamentais dependem da implementação F1/F2                                                        |

Os relatórios locais e limitações do ambiente ficam em [ambiente.md](ambiente.md).
Nenhum item não executado deve ser marcado como validado.
