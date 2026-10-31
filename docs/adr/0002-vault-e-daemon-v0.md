# ADR 0002 — Cofre editável e daemon v0

Estado: implementado como entrega inicial de F1, com limites em `docs/fase-1.md`.

A janela Tauri envia apenas comandos tipados ao daemon. O usuário escolhe o cofre
em diálogo nativo, antes de qualquer escrita. O daemon é um binário `externalBin`
preparado por `pnpm daemon:build`; não há plugin shell no frontend. Não instalamos
autostart nem ligamos HTTP. Um processo por cofre e fila serial global reduzem a
complexidade inicial; endpoint por usuário e atores independentes ficam para a
evolução do daemon, mantendo a mesma regra de escritor único.

Contratos `VaultCommand`/`VaultReply` vêm do Rust e geram JSON Schema/TypeScript.
Os caminhos relativos usam gramática portátil e recusam traversal, symlinks,
nomes de dispositivos Windows e streams alternativos. O armazenamento exige
revisão conhecida, inclusive string vazia para criação. O lock do SO precisa
retornar `true`; `Ok(false)` não concede posse do cofre.

O journal precede o arquivo e usa durabilidade FULL; a confirmação posterior à
substituição é idempotente. Uma alteração externa conflitante é preservada e a
intenção fica registrada. Isso não oferece compare-and-swap contra outro editor
nativo nem transação atômica de múltiplos arquivos. Não escondemos esses limites.

Na Web, OPFS e File System Access usam um adaptador comum; Web Locks coordenam
abas e `createWritable` confirma a escrita em `close`. Memória gerenciada fica
somente leitura. O índice SQLite-WASM usa SAH Pool em worker e libera handles no
fim da consulta. Mover notas no OPFS agora exige revisão, destino livre e cópia
verificada antes de remover a origem, conforme [ADR 0009](0009-mover-notas-web.md).
Lixeira e restauração no OPFS seguem a [ADR 0010](0010-lixeira-web.md); organização
em pastas reais na Web continua pendente. Os arquivos SQL são compartilhados com `rusqlite`. O índice é
reconstruível; notas e anexos são a fonte portátil e permanecem fora do VFS SQL.
A reconciliação incremental mantém uma tabela de documentos com revisão e FTS5
de conteúdo externo, atualizado por triggers na mesma transação. Os dois backends
compartilham também o SQL de atualização, remoção e desempate por caminho. A
revisão vem dos bytes atuais; não se confia apenas em tamanho, mtime ou eventos.
Na Web, cada consulta reconcilia o snapshot completo do cofre selecionado antes de
ler o cache compartilhado, e o diretório do VFS tem versão para isolar abas com
código anterior. Isso evita resultados de outro cofre sem guardar caminhos reais
da máquina no índice Web. A otimização da leitura por eventos fica para outro incremento.

O editor CodeMirror aplica alterações ao texto original, preservando bytes que
não foram editados, inclusive BOM e quebras de linha mistas. O parser serve à
navegação, sem reformatar o documento na gravação. A interface salva explicitamente,
mostra conflitos e permite baixar rascunho antes de recarregar.
Referências Obsidian a blocos são transformadas somente na árvore de exibição TS,
compartilhada por Web/Desktop; não são gravadas como HTML nem removidas do texto
original. IDs de blocos e títulos usam prefixos distintos. IDs ambíguos não
escolhem um destino automaticamente. Isso não amplia o contrato de arquivos/IPC.
Rascunhos de edição usam IndexedDB no perfil do frontend, como estado local da
interface; não são gravações de notas nem parte do journal do daemon. São isolados
por identidade do cofre e sessão, com atualização transacional e recuperação
explícita para uma nova cópia. O comando nativo `vault_identity` apenas retorna o
ID opaco do cofre já escolhido; não amplia acesso a arquivos. O salvamento final
continua passando pelo daemon com revisão esperada.

Em Unix, o socket é criado dentro de um diretório 0700 e recebe 0600 antes de
aceitar requisições. Isso funciona no macOS, que não suporta o `fchmod` no socket
ainda não vinculado usado por `ListenerOptionsExt::mode`. O diretório privado
protege o intervalo de criação sem alterar o umask global do processo.
