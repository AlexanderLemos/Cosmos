# F1 — Núcleo utilizável

Primeira entrega funcional de F1 (§25 do [plano](plan/COSMOS_Plano_Mestre_v2.2_Consolidado.md)).
A fase completa ainda tem os itens de fechamento abaixo. As pendências de F0 não
foram aprovadas implicitamente pelo avanço da implementação.

## Fluxos implementados

- **Web:** escolher o cofre OPFS ou uma pasta real em navegadores com File System
  Access. Criar notas e pastas pelo caminho, editar com CodeMirror 6, salvar,
  reabrir, buscar e exportar ZIP. Importar uma pasta ou ZIP do Obsidian sem modificar a
  origem nem sobrescrever arquivos existentes. Anexos, `.canvas`, frontmatter,
  BOM e terminações de linha são preservados. Notas têm limite de 8 MiB; exportação
  ZIP, 256 MiB descomprimidos; importação ZIP, até 10 mil entradas.
  Seletores de pasta podem omitir arquivos ocultos (WebKit); use ZIP para preservar `.obsidian`. A interface informa falhas, inclusive quota.
- **Desktop:** escolher uma pasta em diálogo nativo; iniciar/reutilizar `cosmosd`;
  listar, editar e salvar notas; buscar; criar projetos manualmente. O backend da
  janela não grava Markdown ou SQLite. O daemon continua ativo após fechar a janela.
- **Editor:** Markdown/GFM, histórico, busca interna, Ctrl/Cmd+S, proteção de rascunhos
  ao trocar de nota/cofre, download da versão em edição e aviso de conflito com
  recarga explícita. Alterar idioma ou tema preserva a edição. Texto não é
  serializado de volta de uma AST. Links de notas e backlinks ignoram código e
  frontmatter; alvos ambíguos não são escolhidos automaticamente.
- **Organização:** caminhos `Universos/<universo>/<galáxia>/nota.md`; criação de
  pastas sob demanda. A navegação inicial é uma lista de caminhos, não o Firmamento.
- **Projetos Desktop:** seis documentos (`context`, `requirements`, `architecture`,
  `decisions`, `progress`, `tasks`) com marcadores gerenciados e área livre,
  `project.cosmos.json` versionado com ULID, sem caminhos absolutos. Sem captura de
  agentes, manifesto no repositório ou Mirror. Na Web, uma pasta que contém esse
  marcador (incluindo descendentes) é somente leitura para edição de notas.
- **Busca:** SQLite nativo e SQLite-WASM oficial no worker Web com VFS OPFS SAH Pool.
  Compartilham os arquivos SQL, FTS5 `unicode61 remove_diacritics 2`, consulta de
  frase literal e BM25. O índice é reconstruído dos arquivos a cada busca nesta
  versão. Web Locks serializam o VFS entre abas; o worker libera os handles.

## Escrita e recuperação

`cosmos-storage` mantém SQLite **fora do cofre**, em dados locais da aplicação.
O lock de arquivo dura toda a vida do processo; só depois dele o daemon assume o
socket. Cada operação entra no journal SQLite (WAL, `synchronous=FULL`), é aplicada
com revisão BLAKE3, arquivo temporário no mesmo diretório, `fsync`, substituição
atômica e `fsync` do diretório em Unix. Bloqueios de acesso têm backoff limitado.
O journal de escritas humanas é distinto do contrato completo de eventos de agentes.

No reinício, pendências são reaplicadas. Se o arquivo já tem o conteúdo esperado,
a operação apenas é confirmada. Se uma edição externa mudou a revisão, o conteúdo
humano permanece e a intenção é retida como `conflict`. Não existe sobrescrita
forçada na interface. Em uma falha durante criação de projeto, documentos já
projetados podem ficar visíveis até a recuperação terminar.

A Web usa `createWritable`/`close`, revisão SHA-256 opaca e Web Locks entre abas.
Alterações externas são detectadas pela revisão ao salvar. APIs de arquivos não
oferecem compare-and-swap contra outros programas: ainda existe uma janela entre
a última checagem e a substituição. Não prometemos exclusão mútua com Obsidian ou
com software de sincronização. Evite editar o mesmo arquivo em dois programas.

IPC: JSON-RPC 2.0, versão 1, sobre socket Unix 0600 ou named pipe com ACL do
proprietário; frames com tamanho `u32` little-endian, limite de 50 MiB e timeout.
O endpoint é por cofre, nos dados internos; existe uma fila serial global por
cofre (mais conservadora que os atores por projeto previstos). Não há HTTP,
autostart, MCP, shell ou permissões genéricas de arquivos no frontend.

## Verificação reproduzível

```bash
pnpm install --frozen-lockfile
pnpm daemon:build                    # prepara o sidecar antes dos builds Cargo/Tauri
pnpm check
pnpm build
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo test -p cosmos-daemon --features fault-injection --locked
pnpm test:e2e                        # Chromium
COSMOS_ALL_BROWSERS=1 pnpm test:e2e   # após instalar Firefox/WebKit também
pnpm --filter desktop tauri build --debug --no-bundle
```

Os testes de processo matam o daemon depois da confirmação do journal e depois da
substituição do arquivo, antes da confirmação final. Reabrem o cofre e verificam o
texto exato. Também verificam dois clientes concorrentes, versão incompatível,
segundo daemon, traversal, symlinks, schema futuro e mudanças externas.
`fault-injection` não faz parte do sidecar preparado para o app.

Playwright verifica persistência após recarregar, conflito entre abas, busca real,
links/backlinks, acessibilidade nos dois temas e round-trip de pasta Obsidian
incluindo anexos e terminações mistas. A CI executa os testes Rust nos três SOs e
os três engines Web no Linux. A instalação local de Firefox/WebKit foi bloqueada
pela política de rede; a execução local cobre Chromium e o WebView GTK nativo.

## Fechamento ainda necessário

- Preview/live preview completo, embeds, navegação de headings/block IDs e
  inventário maior de fixtures Obsidian. O editor atual opera em texto Markdown.
- Adaptador Tauri do contrato `VaultFS` completo (mover, lixeira, watch). A UI usa
  o subconjunto de leitura/escrita/busca; não expõe remoção no Desktop.
- Watcher `notify`, indexação incremental, atores independentes por projeto,
  supervisão automática/reconexão após queda e um endpoint por usuário.
- UI para revisar intenções retidas no journal e restauração de rascunhos após
  queda do navegador; atualmente há salvamento explícito e download de rascunho.
- Recuperação/rollback de importação interrompida e
  exportação incremental de cofres maiores; exportação ZIP e importação de pasta/ZIP
  já funcionam. Uma importação interrompida pode deixar arquivos novos parciais,
  mas nunca apaga ou sobrescreve a origem nem arquivos previamente existentes.
- Separação do projetor de memória em `cosmos-memory`, contratos completos de
  memória, migrações versionadas com backup e exportação do histórico bruto.
- Ensaios manuais com cofres reais, bloqueio por antivírus no Windows, instalação
  e ACL entre usuários em sistemas reais. Builds/CI não substituem esses ensaios.
- Direção visual aprovada, fontes/curadoria, inventário transitivo de licenças e
  demais gates de F0. Integrações reais com agentes e Mirror pertencem a F2.
