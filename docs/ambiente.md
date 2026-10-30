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

## Atualização F1 (2026-10-24)

O estado atual substitui as limitações históricas do shell F0 acima:
editor, persistência Web, `cosmosd`, sidecar, IPC, SQLite/FTS5 e projetos manuais
estão implementados. Leia [fase-1.md](fase-1.md) para os limites restantes.

Antes de verificações Cargo que envolvam o Desktop, rode `pnpm daemon:build`.
O bootstrap cloud já inclui essa etapa e `xdotool` para testar o seletor GTK.
O smoke nativo aceita `--exercise-vault`, criando apenas um cofre de teste:

```bash
python3 scripts/smoke-desktop.py --exercise-vault \
  --evidence-dir /workspace/.cosmos-tools/evidence/f1
```

Esse modo deve executar com o mesmo `DISPLAY` e `XAUTHORITY` do Xvfb do driver.
Essas variáveis são seletores do servidor gráfico; não imprima o conteúdo do
arquivo de autorização. Use evidências sob `/workspace/.cosmos-tools`, montado
para escrita no wrapper; o `/tmp` do namespace pode não ser o mesmo do shell.
A janela precisa de um diálogo nativo real: não há caminho de teste que bypassa
consentimento no executável de produção. O smoke verificou renderização, IPC,
idioma, escolha de pasta, edição/salvamento e seis documentos de projeto.
Daemons de teste continuam ativos ao fechar a janela, como esperado; encerre
somente processos associados ao cofre temporário que o teste criou.

Localmente passaram `pnpm check`, builds Web/Desktop, seis E2E Chromium (também
contra o build de produção), Clippy, testes Rust e os dois pontos de interrupção
forçada do daemon. O download de Firefox/WebKit pelo Playwright recebeu HTTP 403
`Domain forbidden` para `cdn.playwright.dev` e
`playwright.download.prss.microsoft.com`; a matriz completa está na CI.
Nenhuma política de rede foi ampliada automaticamente.

## WebKitGTK direto para o smoke Linux (2026-10-29)

O smoke também aceita `--native-webkit` para uma instância já iniciada de
`WebKitWebDriver`, com `TAURI_WEBVIEW_AUTOMATION=true` e `TAURI_AUTOMATION=true`.
Nesse modo, as capabilities usam `webkitgtk:browserOptions` diretamente, com o
mesmo executável e argumentos que o `tauri-driver` encaminha no Linux. A opção
funciona tanto na abertura inicial quanto na reabertura usada para recuperar
rascunhos; a modalidade padrão via `tauri-driver` permanece disponível.

Exemplo dentro do mesmo Xvfb/namespace do wrapper cloud:

```bash
TAURI_WEBVIEW_AUTOMATION=true TAURI_AUTOMATION=true \
  /workspace/.cosmos-tools/sysroot/usr/bin/WebKitWebDriver \
  --port=4444 --host=127.0.0.1 &
python3 scripts/smoke-desktop.py --native-webkit --exercise-vault \
  --evidence-dir /workspace/.cosmos-tools/evidence/f1
```

Espere o endpoint `/status` antes do smoke e encerre esse driver ao terminar.
O modo direto foi acrescentado após desconexões intermitentes entre
`tauri-driver` 2.0.5 e o WebKit (`Connection reset by peer`), em etapas diferentes
do roteiro. A falha também ocorreu com sessão D-Bus, sem eventos de OOM.
Não há repetição automática de comandos potencialmente mutáveis: uma falha de
transporte encerra o teste. O mesmo aplicativo Tauri, diálogo de pasta e cofre
temporário continuam sendo exercitados.
