# Ambiente de desenvolvimento — 23/10/2026

Instância validada: Debian 13, x86_64. Checkout: `/workspace/Cosmos`.
Node 24.19.0, pnpm 11.25.0, Rust 1.99.1 (rustfmt/clippy), GTK 3.24.49,
WebKitGTK 2.54.0, tauri-driver 2.0.5. Cargo limita a compilação a três jobs.

## Evidência executada

| Verificação                       | Resultado                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `bash scripts/cloud/install.sh`   | Passou, incluindo reinstalação com lockfiles congelados e reuso das bibliotecas                                   |
| Lint e TypeScript                 | Passaram nos sete pacotes/apps                                                                                    |
| Vitest                            | 4 testes passaram: 2 de conformidade Markdown e 2 dos schemas gerados                                             |
| `cargo test --workspace --locked` | 5 testes unitários e 1 teste de conformidade (2 fixtures) passaram; shell Desktop e doctests têm zero testes Rust |
| `cargo fmt` e Clippy              | Passaram; Clippy com `-D warnings`                                                                                |
| `pnpm schemas:check`              | JSON Schema/TypeScript coincidem com o Rust; comparação realizada em diretório temporário                         |
| Build Vite                        | Shells Web/Desktop compilaram                                                                                     |
| Tauri Linux                       | Executável debug compilou, sem empacotar instaladores                                                             |
| Playwright Chromium               | 3 testes passaram: render/idioma/tema e axe nos dois temas                                                        |
| Tauri + WebKitWebDriver           | Janela real renderizou; comando Rust `runtime_info` respondeu protocolo 1; troca para inglês funcionou            |

A captura do Desktop e o resultado JSON estão em `/workspace/.cosmos-tools/evidence/`.
Esses testes validam a **fundação**, não funcionalidades futuras de editor/memória.

## Reutilização no cloud

```bash
cd /workspace/Cosmos
source /workspace/.cosmos-tools/env.sh
pnpm dev
```

O servidor Web é um processo de desenvolvimento; ele não sobrevive automaticamente
à restauração de uma tarefa. Os caches, dependências, sysroot e binários podem ser
retidos no snapshot, mas a ativação e os processos devem ser refeitos.

O WebKit Debian contém caminhos absolutos dos subprocessos em `/usr/lib`.
Para executá-lo neste container sem modificar o sistema, usamos um namespace
temporário com overlay em memória, Xvfb e as bibliotecas verificadas do workspace:

```bash
# Terminal 1
cd /workspace/Cosmos
bash scripts/cloud/run-desktop.sh tauri-driver \
  --native-driver /workspace/.cosmos-tools/sysroot/usr/bin/WebKitWebDriver \
  --port 4444 --native-port 4445

# Terminal 2
cd /workspace/Cosmos
python3 scripts/smoke-desktop.py --evidence-dir /workspace/.cosmos-tools/evidence
```

O wrapper requer execução com suporte a namespace de usuário: no sandbox do Codex,
foi necessário `exec_command` com `sandbox_permissions: require_escalated` para
**esse comando**. A revisão automática permitiu a operação. A montagem mantém o
checkout e o sistema somente leitura, com escrita restrita aos caches e `/tmp`.
O sandbox interno do WebKit, a validação TLS e os checksums foram preservados.
Encerre somente o driver/Xvfb que você iniciou após o teste.

## Limites e próximos passos

- Windows/macOS: workflow de CI criado, ainda não executado; instaladores não gerados.
- S1–S5, contratos completos, curadoria, protótipos e aprovação visual continuam
  pendentes conforme [fase-0.md](fase-0.md).
- Chromium foi validado; Firefox/WebKit de navegador e SQLite-WASM/OPFS ainda não.
- Claude Code e Hermes não estão instalados; não houve execução/captura de hooks.
- Nenhuma chave externa é necessária para a fundação.
- Código novo está no checkout local, ainda sem commit/push. Publicar a configuração
  do ambiente é uma ação distinta de publicar o código no GitHub.
- A execução em uma nova tarefa restaurada deve ser validada após a publicação do snapshot.
