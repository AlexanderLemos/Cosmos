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
  ZIP, 256 MiB descomprimidos; importação ZIP, até 10 mil entradas; pasta, até
  10 mil arquivos e 256 MiB. **Retomar importação** mantém arquivos com bytes
  idênticos e acrescenta apenas os ausentes, mediante nova seleção da origem.
  Importações gravam progresso local antes de escrever; **Importações pendentes**
  permite revisar tentativas interrompidas e baixar relatórios sem conteúdo das notas.
  **Conferir arquivos** compara os arquivos salvos com a origem registrada, sem
  alterar o cofre ou o progresso da importação.
  Seletores de pasta podem omitir arquivos ocultos (WebKit); use ZIP para preservar `.obsidian`. A interface informa falhas, inclusive quota.
- **Desktop:** escolher uma pasta em diálogo nativo; iniciar/reutilizar `cosmosd`;
  listar, editar e salvar notas; buscar; criar projetos manualmente; mover notas,
  enviá-las à lixeira e restaurá-las para o caminho original ou outro destino.
  Lixeira e movimentação exigem a revisão atual e não sobrescrevem destinos.
  Salve o rascunho antes de organizar a nota. Notas dentro de projetos são protegidas
  contra mudança de caminho e exclusão; continuam editáveis no Desktop. O backend da
  janela não grava Markdown ou SQLite. O daemon continua ativo após fechar a janela.
- **Editor:** Markdown/GFM, histórico, busca interna, Ctrl/Cmd+S, proteção de rascunhos
  ao trocar de nota/cofre, download da versão em edição e aviso de conflito com
  recarga explícita. Alterar idioma ou tema preserva a edição. Texto não é
  serializado de volta de uma AST. Links de notas e backlinks ignoram código e
  frontmatter; alvos ambíguos não são escolhidos automaticamente.
- **Leitura:** modos Editar, Ler e Edição e leitura no Web e Desktop, com Markdown/GFM,
  tabelas, listas de tarefas, citações e blocos de código. A leitura acompanha o
  rascunho e as recargas externas aceitas. Alternar o modo mantém a instância do
  editor, seu histórico e o texto bruto. Wikilinks simples com aliases e links
  Markdown abrem notas do cofre; fragmentos navegam por títulos, inclusive em outra
  nota. Trocar de nota com rascunho exige confirmação; navegar dentro dela não
  descarta a edição. Um destino ausente/ambíguo fica desabilitado e uma seção não
  encontrada é informada. Referências Obsidian a blocos (`[[Nota#^id|alias]]` e
  `[texto](Nota.md#^id)`) focam o trecho na mesma nota ou em outra; identificadores
  ausentes/repetidos são informados. A visão dividida se empilha em janelas estreitas.
- **Callouts Obsidian:** blocos `> [!note]`, títulos personalizados, tipos/aliases
  padrão e recolhimento com `+`/`-`, inclusive aninhados. Links para títulos/blocos
  abrem os callouts ancestrais antes de focar o destino. Ver limites abaixo.
- **Imagens locais:** na leitura Web/Desktop, PNG, JPEG, GIF e WebP do cofre podem
  ser exibidos pelo botão **Mostrar imagem**, em sintaxe Markdown ou `![[imagem]]`.
  Dimensões Obsidian são aceitas nos embeds e no texto alternativo de imagens
  Markdown, inclusive por referência. Limite de 8 MiB por arquivo, com validação
  da extensão e assinatura; imagens remotas não são carregadas.
  Ver detalhes e limites abaixo.
- **Rascunhos locais:** cópias automáticas no perfil do navegador/WebView, com
  confirmação visível da proteção. Reabrir o cofre oferece recuperar, baixar ou
  excluir cada cópia. A recuperação não grava no cofre e mantém o rascunho original.
- **PDFs locais:** links Markdown e referências/embeds Obsidian oferecem **Abrir
  PDF** no Web/Desktop, com navegação por páginas, `#page=N` e texto extraído.
  Leitura sob demanda, até 16 MiB e 2.000 páginas; sem modificar notas ou anexos.
  PDFs com senha e recursos avançados ainda têm limitações descritas abaixo.
- **Organização:** caminhos `Universos/<universo>/<galáxia>/nota.md`; criação de
  pastas sob demanda. A navegação inicial é uma lista de caminhos, não o Firmamento.
- **Projetos Desktop:** seis documentos (`context`, `requirements`, `architecture`,
  `decisions`, `progress`, `tasks`) com marcadores gerenciados e área livre,
  `project.cosmos.json` versionado com ULID, sem caminhos absolutos. Sem captura de
  agentes, manifesto no repositório ou Mirror. Na Web, uma pasta que contém esse
  marcador (incluindo descendentes) é somente leitura para edição de notas.
- **Busca:** SQLite nativo e SQLite-WASM oficial no worker Web com VFS OPFS SAH Pool.
  Compartilham os arquivos SQL, FTS5 `unicode61 remove_diacritics 2`, consulta de
  frase literal e BM25, com desempate por caminho. A reconciliação por revisão
  atualiza somente documentos novos/alterados e remove os que saíram do cofre.
  Web Locks serializam o VFS entre abas; o worker libera os handles.

## Recuperação de rascunhos

Cada sessão de edição recebe um ID independente. O texto em edição, a versão
original e sua revisão são guardados no IndexedDB `cosmos-drafts` do perfil,
separadamente dos arquivos do cofre e do SQLite de índice/journal. Cabeçalhos
menores permitem listar rascunhos sem carregar todos os textos. Gravação e
remoção de texto/cabeçalho usam uma transação com durabilidade `strict` solicitada.
Não há envio a serviços externos nem mudança automática do Markdown.

As gravações são serializadas, mantendo apenas o snapshot pendente mais recente
de cada editor. A interface só informa **rascunho protegido** quando a transação
do texto e da revisão atualmente exibidos terminou. Uma falha guarda o snapshot
em memória para tentativa explícita, mostra aviso e mantém salvar/baixar a edição
disponíveis. Uma queda antes dessa confirmação pode perder as últimas alterações;
o aviso ao sair com edição não salva permanece. Limpeza do perfil/dados do site,
quota, navegação privada e falhas de armazenamento também afetam essas cópias.
Rascunhos não substituem exportação/backup do cofre.

Salvar no cofre limpa somente a cópia da sessão salva, depois da confirmação da
escrita. Sair de uma nota mantém os rascunhos já protegidos. Recuperar cria uma nova
cópia de edição e **preserva o rascunho original**, que pode pertencer a outra aba
ainda aberta. A exclusão do original exige confirmação e confere sua versão na
mesma transação; uma lista desatualizada não pode apagar uma edição mais recente.
Não há expiração ou limpeza automática das cópias originais.

Se o arquivo do cofre mudou, a recuperação mantém a revisão anterior e bloqueia
salvar sobre a versão externa. O texto continua disponível para leitura/download e
para **Salvar cópia como…** em outro caminho. Recarregar o arquivo requer a
confirmação normal de saída da edição. Se o arquivo
não existe ou está ilegível, a cópia recuperada fica disponível em modo somente
leitura. A proteção atual de memória de projetos na Web continua sendo respeitada.

**Salvar cópia como…** usa a escrita com revisão esperada vazia, que exige um
destino inexistente, inclusive quando o arquivo existente está vazio. A operação
passa pelas mesmas validações de caminho, limite de tamanho e acesso da escrita
normal; diretórios de memória na Web continuam protegidos. O caminho deve ser
relativo ao cofre, terminar em `.md` e diferir da nota original. Abas concorrentes
são serializadas pela camada de armazenamento. Isso não adiciona uma transação
com editores externos ou com provedores de sincronização.

A confirmação informa o caminho criado e mantém a nota original aberta, com o
mesmo texto, histórico de desfazer e rascunhos locais. Copiar não marca o original
como salvo nem remove suas cópias de recuperação. O recibo aparece somente depois
da confirmação de escrita; uma falha posterior ao atualizar a lista não desfaz a
cópia já criada. Mesclagem de versões continua pendente.

O cofre OPFS tem uma identidade fixa dentro da origem. Pastas escolhidas na Web
são identificadas por `FileSystemHandle.isSameEntry`, com handles no registro
IndexedDB; nomes de exibição nunca identificam um cofre. Isso depende de suporte
do navegador à persistência desses handles: falha gera aviso, sem associar por nome.
O Desktop usa o ID opaco do diretório canônico já selecionado, obtido pelo comando
restrito `vault_identity`. Nenhum caminho absoluto é entregue ao frontend.
Mover o cofre nativo para outro caminho muda essa identidade; reassociação e
exportação global de rascunhos ainda pendem. Cada versão de texto em um rascunho
tem limite de 8.388.608 unidades UTF-16; notas mantêm o limite geral de 8 MiB ao salvar.

## Busca incremental por revisão

O índice guarda caminho, revisão do conteúdo e texto. Triggers atualizam o FTS5
na mesma transação em que um documento muda. Uma consulta com o cofre inalterado
não reinsere documentos nem retokeniza o FTS; repetir a consulta, mudar o termo
ou reabrir o aplicativo reutiliza as entradas persistidas. O primeiro uso constrói
o índice a partir dos arquivos. Renomear, mover para a lixeira, restaurar e remover
notas passam a ser refletidos na próxima busca; o monitor Desktop também atualiza
a busca ativa quando observa alterações.

Cada busca não vazia ainda lista e lê os Markdown para conferir suas revisões
(BLAKE3 no Desktop, SHA-256 na Web). Assim, uma edição externa é detectada mesmo
com o mesmo tamanho/mtime ou antes da entrega de um evento nativo. A redução é do
trabalho no índice; **a leitura dos arquivos ainda não é incremental**. O Desktop
processa uma nota por vez na transação; a Web ainda prepara o snapshot completo
em memória e o envia ao worker. Leituras de backlinks também continuam completas.
Otimizar essas leituras, limitar trabalho em cofres grandes e medir latência são
pendências explícitas.

Uma falha de leitura, decodificação ou SQL impede publicar resultados parciais.
No Desktop, a transação desfaz atualizações já feitas; na Web, todas as leituras
precedem o worker e a reconciliação SQL é transacional. Notas originais e journals
não são modificados pela indexação. A lista temporária de caminhos vistos serve
para remover entradas antigas somente depois de uma varredura completa.

O cache Web fica em `/cosmos-search-index-v1` no OPFS da origem, separado do cofre.
Abas antigas usam outro diretório e não podem alterar o novo formato. Cada pedido
reconcilia todos os caminhos/revisões do cofre selecionado **antes** de consultar;
trocar de pasta não retorna notas deixadas no cache por outra pasta. Web Locks
continuam serializando o acesso entre abas. O cache anterior não é apagado
automaticamente; limpeza seletiva/diagnóstico do índice ainda não tem interface.

## Retomada de importação na Web — 2026-10-26

A opção **Retomar importação**, desativada ao abrir cada cofre, vale para ZIP e
pasta. Selecione novamente a origem: arquivos existentes são comparados byte a
byte e mantidos somente quando idênticos; arquivos ausentes são acrescentados.
O resultado informa quantos foram adicionados e quantos foram mantidos, inclusive
com um rascunho aberto. A edição e seu histórico não são alterados pela retomada.
A importação normal continua recusando destinos existentes, mesmo idênticos.

A seleção inteira passa por validação antes das gravações: caminhos, duplicatas,
colisões entre arquivo/diretório, limites, leitura da origem e comparação dos
destinos. Diferenças encontradas nessa etapa impedem novas gravações e identificam
o caminho conflitante. BOM, quebras de linha, anexos, `.canvas` e `.obsidian`
continuam sendo bytes originais, sem reserialização. Uma falha de leitura da
origem também ocorre antes de criar destinos.

Documentos e anexos são gravados antes de qualquer `project.cosmos.json`.
Manifestos são finalizados dos diretórios mais internos para os mais externos,
independentemente da ordem no ZIP ou na pasta selecionada. Isso evita que o
próprio importador proteja um projeto enquanto ainda faltam documentos ou
manifestos internos. Até essa finalização, arquivos de uma importação parcial
podem aparecer como notas comuns; a retomada recusa qualquer diferença de bytes.

Web Locks serializam importações entre abas do COSMOS; cada destino ausente e a
proteção do projeto são conferidos novamente antes de cada escrita. Em pasta real, um editor externo ainda
pode alterar o diretório entre a última checagem e a criação: File System Access
não oferece criação exclusiva com comparação de revisão. Falhas de quota,
permissão, fechamento da aba ou conflitos posteriores à validação podem deixar
uma importação parcial. Use **Atualizar lista** para conferir os arquivos após
uma falha, ou reabra o cofre.

A retomada não é rollback. O registro local descrito abaixo é evidência de
progresso, não prova de propriedade de arquivos. Não apaga, substitui ou presume
propriedade de um arquivo divergente, vazio ou parcial. Se
os bytes divergirem da origem, é necessária conferência manual. Em projetos já
protegidos por `project.cosmos.json`, arquivos idênticos podem ser mantidos, mas
não se acrescentam arquivos. Projetos parciais deixados por versões anteriores ou
manifestos vazios/parciais após falha de escrita ainda podem exigir conferência
manual. O tratamento desses casos e o rollback com registro de propriedade
permanecem pendentes. Não há mudança no
Desktop, que já adota a pasta original em vez de oferecer cópia por importação.
Ver [ADR 0005](adr/0005-retomada-importacao-web.md).

## Registros locais de importação — 2026-10-26

Na Web, **Importações pendentes** mostra tentativas sem conclusão registrada,
com quantidades de arquivos confirmados, idênticos mantidos e sem confirmação.
Quando houver, mostra o último caminho cuja tentativa não foi confirmada. A
lista é atualizada após operações na própria aba; **Atualizar importações**
consulta alterações feitas em outras abas. A consulta aguarda o lock do cofre,
para não apresentar uma operação ainda ativa em outra aba como interrompida.

**Baixar relatório da importação** exporta JSON com versão, datas, caminhos
relativos, tamanhos, hashes SHA-256 e estados por arquivo. Não contém texto das
notas nem bytes de anexos. **Esquecer registro** pede confirmação e remove somente
o relatório local, preservando todos os arquivos. A lista aceita até 20 registros
pendentes por cofre; ao atingir o limite, revise/baixe relatórios e esqueça os que
não precisa manter. O limite de 10 mil entradas por tentativa continua valendo.

O registro inicial é confirmado em IndexedDB antes da primeira gravação no cofre.
Cada arquivo recebe uma marca anterior à tentativa e outra somente depois de
`createWritable().close()` e da transação de confirmação do registro. Uma escrita
que terminou sem confirmação persistida permanece incerta: o arquivo pode estar
completo, parcial ou ausente. Fechar a aba não transforma essa incerteza em sucesso.
A falha inicial do registro impede novas gravações; uma falha posterior interrompe
a operação e mantém o progresso já confirmado. Criação e salvamento manual de
notas continuam disponíveis se IndexedDB falhar, com o aviso existente de
rascunhos indisponíveis.

A retomada continua exigindo selecionar a origem novamente e comparar os bytes.
Somente a conclusão de uma seleção com os mesmos caminhos, tamanhos e hashes
(independentemente da ordem dos arquivos) limpa seus registros anteriores. Uma
origem diferente não os apaga. Ler ou esquecer um registro exige sua versão atual;
relatórios concluídos/removidos em outra aba não são tratados como atuais.

Os registros ficam em `cosmos-imports`, no perfil local do navegador, fora do
cofre e do ZIP exportado. Pastas reais usam identidade por handle, compartilhada
com o registro de identidade dos rascunhos; nomes iguais não compartilham histórico.
Limpar os dados do site perde esses registros. Não há cópia do conteúdo da origem
para recuperação sem nova seleção, migração do journal nativo ou nova permissão
no Desktop. Registros anteriores a esta entrega não são reconstruídos. Rollback,
propriedade de arquivos e recuperação de arquivos parciais permanecem pendentes.
Ver [ADR 0006](adr/0006-registro-importacoes-web.md).

### Conferência dos arquivos registrados — 2026-10-27

Em **Importações pendentes**, **Conferir arquivos** consulta o estado atual de
cada caminho da tentativa selecionada, sem precisar selecionar a origem novamente.
A comparação usa tamanhos e hashes SHA-256 registrados na importação; considera
os arquivos salvos no cofre, preservando rascunhos abertos. Os resultados são:

| Resultado            | Significado                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Idêntico à origem    | Tamanho e hash coincidem com a origem registrada.                                         |
| Diferente da origem  | Tamanho ou hash divergem; pode ser uma edição legítima ou um arquivo incompleto.          |
| Ausente              | O arquivo ou um diretório ancestral não foi encontrado.                                   |
| Caminho incompatível | Há um diretório no lugar de um arquivo, ou um arquivo no lugar de um diretório ancestral. |
| Não foi possível ler | A leitura ou verificação não pôde ser concluída, por exemplo por falta de permissão.      |

A tabela mostra separadamente o estado registrado e o observado. Um arquivo
**Sem confirmação** pode estar completo, e um arquivo **Confirmado** pode ter
sido alterado ou removido. A conferência não reescreve esses estados nem autoriza
reparos ou remoções. A interface oferece filtros e páginas de até 50 linhas.
**Baixar conferência** exporta todos os resultados, incluindo tamanhos e hashes
observados quando disponíveis, independentemente do filtro ou página visível.
Não inclui conteúdo das notas ou anexos.

O resultado é uma leitura durante um intervalo, com início e conclusão registrados;
não é um snapshot atômico de todos os arquivos. Pode ficar desatualizado após uma
edição. **Conferir arquivos** deve ser acionado novamente para obter outra leitura.
A conferência fica apenas em memória na interface e no relatório baixado, sem
alterar o journal. A versão do registro e a identidade do cofre são verificadas
antes da leitura; registros concluídos em outra aba são recusados como obsoletos.

Os caminhos, tamanhos, estados, contadores e a identidade da seleção persistida
são validados antes de usar qualquer caminho do registro para acessar arquivos.
Dados inconsistentes são recusados. A leitura é serializada com operações do
COSMOS pelo Web Lock; editores externos em pasta real continuam fora desse lock.
Arquivos cujo tamanho já diverge não precisam ter seus bytes lidos para detectar
a diferença. Permanecem os limites de 10 mil arquivos e 256 MiB da seleção original.

## Limites da leitura Markdown

A árvore de renderização nunca é gravada sobre o Markdown. Frontmatter YAML fica
preservado no editor e não aparece na leitura; tags/blocos HTML e comentários são
omitidos, sem execução. Imagens locais compatíveis têm visualização sob demanda;
embeds de PDFs locais oferecem abertura no leitor; embeds de notas e outros
formatos permanecem literais. Não há carregamento
automático de recursos locais ou remotos. Links ativos têm
alvos restritos a notas listadas, PDFs locais ou HTTP/HTTPS/mailto explícitos. Na Web, links
externos abrem uma aba sem acesso à janela de origem; no Desktop, o endereço é
exibido como texto até existir abertura pelo navegador com permissão específica.

Títulos recebem IDs com prefixo, normalização Unicode e sufixos para duplicatas.
Isso cobre navegação básica, sem prometer equivalência a todos os identificadores
do Obsidian. Wikilinks com formatação Markdown dentro do nome/alias,
transclusões, personalização avançada de callouts, matemática, diagramas e plugins
ainda não têm suporte completo. A pré-visualização é limitada a 262.144 unidades de texto UTF-16;
notas maiores continuam editáveis dentro do limite geral de 8 MiB. Não é ainda o
live preview dentro do próprio CodeMirror nem uma garantia de performance para
cofres grandes.

### Callouts Obsidian — 2026-10-26

A leitura Web/Desktop reconhece `[!tipo]` no início de uma citação: `note`,
`abstract`, `info`, `todo`, `tip`, `success`, `question`, `warning`, `failure`,
`danger`, `bug`, `example` e `quote`, sem distinção de maiúsculas. Os aliases
padrão (`summary`, `tldr`, `hint`, `important`, `check`, `done`, `help`, `faq`,
`caution`, `attention`, `fail`, `missing`, `error`, `cite`) também são aceitos.
Tipos desconhecidos usam a apresentação de nota; todos usam os tokens do tema.

O texto após o marcador é o título. Sem título, há um rótulo traduzido pt/en.
Nesta entrega, títulos são texto simples: rótulos de links e texto alternativo de
imagens permanecem visíveis, HTML é omitido e wikilinks ficam literais. Não há
links ou imagens interativos dentro do controle de recolhimento. O corpo mantém
Markdown/GFM, links, imagens sob demanda, títulos e referências a blocos.

`[!tipo]+` começa aberto; `[!tipo]-` começa fechado; sem sufixo, o bloco fica
sempre visível. Callouts podem conter outros callouts. O recolhimento usa
`details`/`summary` nativos com teclado e não grava preferências nem altera o
texto. Tema/idioma preservam a abertura atual; trocar de nota reinicia o estado
conforme a fonte. A navegação por fragmento abre todos os ancestrais necessários.

Código, YAML e marcadores escapados ou codificados como entidades não viram
callouts. Cabeçalhos com código inline atravessando linhas ou entidades de quebra
de linha ambíguas permanecem citações comuns. CSS, ícones e metadados de plugins
Obsidian não são importados. Essa compatibilidade de leitura não encerra a F1.
A decisão está registrada na [ADR 0004](adr/0004-callouts.md).

### Referências Obsidian a blocos — 2026-10-26

Na leitura Web/Desktop, `Texto do parágrafo. ^meu-bloco` cria um destino para
`[[#^meu-bloco]]`, `[[Outra#^meu-bloco|alias]]` ou links Markdown com o mesmo
fragmento, inclusive `%5Emeu-bloco`. O marcador exige espaço ou quebra de linha
antes do circunflexo; `**texto**^id` permanece literal. O identificador aceita letras ASCII, números
e hífens e diferencia maiúsculas de minúsculas. Um marcador isolado após linha
em branco pode identificar o parágrafo, lista, citação ou tabela anterior.
Marcadores no fim do texto de um item de lista identificam o item inteiro,
inclusive em listas compactas sem um elemento de parágrafo na leitura.

Os marcadores reconhecidos são ocultos **apenas na leitura**. O Markdown bruto,
frontmatter, BOM, quebras de linha, histórico de desfazer e rascunhos permanecem
intactos. Navegar foca o bloco e rola até ele, com a mesma confirmação de saída
usada pelos links para títulos quando há edição não salva em outra nota.

IDs repetidos ou vários IDs atribuídos ao mesmo bloco não produzem uma âncora;
seus marcadores permanecem visíveis. Clicar informa que o bloco está ausente ou
repetido, sem escolher arbitrariamente um trecho. Código, HTML, YAML, escapes e
entidades não geram identificadores. Marcadores em títulos, código, sem um bloco
anterior ou com sintaxe inválida continuam literais. Este incremento não inclui
autocompletar/criação de IDs nem transclusão de blocos (`![[Nota#^id]]`).

Uma fixture Obsidian adicional participa da inspeção compartilhada TS/Rust de
títulos e links; a transformação de âncoras pertence somente ao parser de exibição
TS compartilhado por Web/Desktop. O contrato IPC e o armazenamento não mudaram.
Anexos continuam preservados na importação/exportação. O incremento de imagens
locais abaixo adiciona a primeira leitura binária restrita ao cofre.

### Imagens locais sob demanda — 2026-10-26

`![descrição](imagens/foto.png)` e `![[foto.png]]` oferecem **Mostrar imagem** nos
modos Ler e Edição e leitura. São aceitos PNG, JPEG (`.jpg`/`.jpeg`), GIF e WebP,
até 8 MiB por arquivo. Extensão e assinatura dos bytes devem corresponder; o
decoder do navegador/WebView confirma se a imagem pode ser exibida. Arquivos
ausentes, ambíguos, grandes, inválidos ou ilegíveis geram aviso e permitem nova
tentativa, sem perder a nota ou seu rascunho. SVG, PDF, áudio/vídeo, imagens remotas,
URLs `file:`, `data:` e `blob:` escritas na nota não são carregados.

Links Markdown de imagem são relativos à pasta da nota, incluindo `../` somente
quando o resultado permanece dentro do cofre. Wikilinks tentam o caminho local,
o caminho na raiz do cofre e, para nomes sem pasta, um único nome de arquivo.
Comparações usam NFC e ignoram caixa; colisões não escolhem um arquivo
arbitrariamente. Pastas `.git`, `.obsidian` e nomes iniciados por `.cosmos` são
excluídos. O Desktop recusa symlinks e aplica a gramática portátil do armazenamento.
Embeds de imagens não aparecem como conexões a notas; embeds de notas continuam
contando para backlinks, mas ainda não são renderizados como transclusões.

Cada clique consulta novamente os caminhos disponíveis e lê somente a imagem
solicitada. Não há varredura de bytes nem carregamento de imagens ao abrir uma
nota. A visualização é um snapshot: **Ocultar imagem** e **Mostrar imagem** relê
uma alteração externa. As URLs `blob:` são criadas internamente a partir dos bytes
validados e revogadas ao ocultar, trocar de nota/cofre, sair da leitura ou desmontar
o componente. Cancelar descarta resultados tardios; não interrompe uma leitura
que o sistema operacional já iniciou. Tema/idioma preservam imagens já abertas.

No Desktop, `list_images`/`read_image` passam exclusivamente pelo daemon; a janela
não ganha acesso genérico a arquivos nem usa protocolo de assets para caminhos
reais. O retorno binário usa base64 dentro do frame IPC já limitado a 50 MiB.
A CSP autoriza `blob:` apenas para imagens. A API do cofre passa à versão 2 no
handshake, com JSON-RPC/protocolo 1 e banco v3 mantidos. **Encerre o daemon antigo
antes de abrir esta versão:** o cliente recusa um daemon sem a API nova; não o
encerra automaticamente. Não há migração de banco nesta entrega.

Embeds Obsidian também aceitam `![[foto.png|300]]` (largura, preservando proporção)
e `![[foto.png|300x200]]` (caixa de largura/altura com a imagem contida, sem distorção).
São pixels CSS inteiros de 1 a 4096, sem unidades, espaços ou expressões CSS.
Tamanhos inválidos, aliases não numéricos e múltiplos sufixos são ignorados;
a imagem mantém o tamanho natural sujeito aos limites do painel. A largura nunca
ultrapassa o painel e a altura fica limitada a 70% da janela. O dimensionamento
não muda os bytes nem amplia o limite de leitura/decodificação.

Desde 2026-10-27, imagens Markdown aceitam os mesmos tamanhos no fim do texto
alternativo: `![Órbita|300](foto.png)` e `![Órbita|300x200](foto.png)`, inclusive
por referência (`![Órbita|300][foto]` com uma definição `[foto]: foto.png`).
A descrição acessível é `Órbita`; se vazia (`![|300](foto.png)`), usa-se o caminho.
Somente o último sufixo válido do texto alternativo decodificado define dimensões;
valores inválidos permanecem no rótulo. Em tabelas, escape a barra como `\|`.
Destinos, definições de referência, BOM e quebras de linha permanecem intactos.
O carregamento continua sob demanda; dimensões não habilitam outros formatos nem
imagens remotas. Detalhes na [ADR 0003](adr/0003-imagens-locais.md).

Formatação dentro de nomes, transclusões, carregamento em lote e atualização
automática de imagens abertas ficam pendentes.
Uma imagem dentro de um link vira seu texto alternativo na leitura para evitar
controles interativos aninhados. O limite é de bytes por arquivo, não de pixels
decodificados ou memória total das imagens que o usuário abrir. Listar caminhos
ainda percorre o cofre a cada solicitação; cache e ensaios de cofres grandes pendem.

## PDFs locais — 2026-10-27

`[Manual](assets/manual.pdf)`, `[[manual.pdf|Manual]]` e `![[manual.pdf]]`
oferecem **Abrir PDF**. O leitor funciona offline dentro do Web/Desktop, com
botões de página anterior/próxima, fechamento por Escape/botão e texto extraído
selecionável. `#page=2` abre diretamente a segunda página. Ausência, ambiguidade,
arquivo inválido, tamanho excessivo e página inexistente são informados.
A nota, seu histórico de edição e os rascunhos permanecem disponíveis ao fechar.

O arquivo é lido somente ao clicar; fechar/reabrir consulta os bytes atuais.
Limites: 16 MiB, 2.000 páginas, uma página renderizada por vez até 1.200×1.600
pixels e 250 mil caracteres de texto extraído por página. PDFs com senha, OCR,
zoom, impressão, formulários e anotações interativas ainda não são suportados.
Certos encodings/fontes e imagens JPEG 2000 podem não renderizar completamente;
o leitor inicial não inclui todos os recursos do PDF.js. Não executa scripts
do PDF nem busca o documento em serviços externos. A leitura passa pelo daemon
no Desktop e não altera Markdown, anexos ou journal.

**Atualização Desktop:** a API do cofre passa a 3; encerre o daemon antigo antes
de abrir esta versão. Protocolo 1 e banco v3 permanecem, sem migração.
Decisões, licença e limites estão na [ADR 0007](adr/0007-leitor-pdf-local.md).

## Alterações externas no Desktop

O daemon usa `notify` para observar recursivamente o cofre. O acompanhamento não
segue symlinks e ignora eventos de leitura, `.git`, `.obsidian`, `.cosmos` e arquivos
temporários internos. Cada mudança relevante invalida um token, composto por uma
identidade da instância e um contador. Não há fila ilimitada nem conteúdo de notas
nos eventos. Avisos de rescan também invalidam o token.

A janela consulta esse token via IPC a cada 1,5 s enquanto está visível. Quando ele
muda, atualiza a lista, a busca ativa, backlinks e a lixeira aberta. Também confere
novamente o cofre ao recuperar foco/visibilidade. O filtro da busca é preservado.
Notas abertas **sem edição local** são recarregadas; com rascunho, a revisão e o
texto local são preservados e há um aviso antes de qualquer tentativa de salvar.
Uma remoção externa ou conteúdo ilegível mantém o texto aberto disponível para
download. Recarregar um rascunho exige a confirmação de descarte já usada pela UI.
Respostas iniciadas antes de salvar, mudar de nota ou fechar o cofre são descartadas.

Falha de observação/IPC aparece na interface, com atualização manual disponível.
Uma falha do backend de observação exige reiniciar o daemon para restabelecer sua
cobertura; receber outro evento não é tratado como prova de recuperação completa.
Não há supervisão ou reinicialização automática do processo nesta entrega.
A observação notifica mudanças; a busca reconcilia o índice por revisão. A atualização
ainda relê notas para backlinks e para conferir revisões. Cofres grandes e diretórios
sincronizados/em rede ainda exigem os ensaios de performance e compatibilidade.
A Web continua com atualização manual e checagem de revisão ao salvar; este
acompanhamento automático está disponível somente no Desktop.

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

A organização de notas no Desktop tem um journal próprio: registra a intenção,
publica uma cópia durável **sem substituir o destino**, confirma a cópia no banco,
confere novamente as revisões e só então remove a origem. A recuperação repete
as etapas confirmadas. Se o processo cair entre a publicação da cópia e sua
confirmação no banco, preserva os dois arquivos e marca conflito, sem presumir que
um arquivo já existente pode ser substituído. Intenções em conflito permanecem
no banco; a tela para revisá-las ainda está pendente. Falhas de acesso durante a
remoção têm retry limitado; se persistirem, novas mutações ficam bloqueadas até
reiniciar o daemon e recuperar a intenção. Leituras continuam disponíveis.

A lixeira básica usa `.cosmos/trash/<id>/<caminho-original>` no cofre; não é a
lixeira do sistema operacional e não esvazia automaticamente. A lista e as
revisões são reconstruídas dos registros do journal e dos arquivos existentes.
Restaurar preserva bytes e exige um destino livre. Não implementa ainda a
experiência completa do Buraco Negro de F4. Mover uma nota **não reescreve links**
em outras notas; busca e backlinks passam a refletir os caminhos atuais.

O banco local está na versão 3. Ao abrir um banco v1 ou v2, cria primeiro uma cópia
SQLite consistente `cosmos-before-v3-<id>.db` nos dados internos da aplicação,
incluindo o WAL, e migra a estrutura em uma transação. A migração substitui somente
as tabelas reconstruíveis de busca; as intenções de escrita e movimentação
continuam preservadas e recuperáveis. O índice novo é preenchido na primeira busca.
A cópia é do banco, não um backup completo do cofre. Binários antigos recusam v3;
o handshake verifica a versão de banco.
Após atualizar uma instalação em uso, encerre o daemon antigo antes de iniciar
o novo. Supervisão/atualização automática e rollback coordenado continuam pendentes.

A Web usa `createWritable`/`close`, revisão SHA-256 opaca e Web Locks entre abas.
Alterações externas são detectadas pela revisão ao salvar. APIs de arquivos não
oferecem compare-and-swap contra outros programas: ainda existe uma janela entre
a última checagem e a substituição ou remoção de um arquivo. Não prometemos exclusão mútua com Obsidian ou
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
segundo daemon, traversal, symlinks, schema futuro e mudanças externas. A movimentação
é interrompida em quatro pontos (journal, publicação, confirmação da cópia e remoção).
Os testes também cobrem restauração, destinos ocupados, alterações externas nas duas
pontas, proteção de projetos e migrações v1/v2→v3 com backup. Os testes de índice
verificam zero atualizações em notas inalteradas, uma alteração entre 32 notas,
edição externa com mesmo tamanho/mtime, reinício, remoção, lixeira/restauração,
rollback de leitura inválida e processo morto antes de confirmar o índice.
O smoke Desktop completo
verifica os botões de mover, lixeira e restauração através do daemon real. Também
altera arquivos diretamente no disco, verificando recarga automática, rascunho
preservado, busca/backlinks atualizados, conteúdo ilegível e remoção externa.
Os testes de processo verificam eventos nativos de criação, edição, substituição
atômica, renomeação, remoção, subpastas e marcador de projeto nos três SOs.
`fault-injection` não faz parte do sidecar preparado para o app.

Playwright verifica persistência após recarregar, conflito entre abas, busca real,
links/backlinks, acessibilidade nos dois temas e round-trip de ZIP Obsidian
incluindo anexos e terminações mistas. Os testes de leitura verificam navegação
por títulos, rascunho/undo ao alternar modos e preferências, bytes inalterados na
exportação e notas com scripts, HTML e imagens remotas sem execução/requisições.
O smoke nativo também verifica os modos de leitura e a atualização da leitura após
alteração no disco. Os testes Web verificam contadores de documentos realmente
alterados no SQLite-WASM, persistência do índice, remoções, falhas de leitura e
troca entre cofres sem resultados misturados. Os testes de rascunho cobrem a fila
de gravação, retry, recarga, bytes originais, abas independentes, conflito externo,
exclusão com versão, fonte removida, pastas com nomes iguais e armazenamento
indisponível. Os testes de cópia verificam bytes originais, cancelamento, destino
ocupado/vazio, caminho inválido, memória protegida, duas abas concorrentes e fonte
removida. O smoke nativo também verifica cópia de rascunho em conflito sem alterar
a versão externa ou substituir um destino existente. Ele mata e reabre somente o processo criado pelo teste,
recuperando um rascunho confirmado sem gravar no cofre até o salvamento explícito.
A CI executa os testes Rust nos três SOs e
os três engines Web no Linux. A instalação local de Firefox/WebKit foi bloqueada
pela política de rede; a execução local cobre Chromium e o WebView GTK nativo.

Validação do incremento de referências a blocos (2026-10-26): `pnpm check`
(27 testes unitários, tipos, lint e schemas), builds Web/Desktop, Rust fmt/Clippy,
testes do workspace e de fault injection passaram. A fixture compartilhada agora
cobre três documentos. Passaram 19 E2E Chromium contra o build de produção,
incluindo foco de blocos locais/entre notas, IDs repetidos/ausentes, acessibilidade
nos dois temas, rascunho/undo e exportação com bytes exatos. O smoke Tauri Linux
também passou com foco de blocos no WebView real e verificação dos arquivos no disco.
A CI desse incremento passou nos três sistemas, incluindo 57 testes Web
(Chromium, Firefox e WebKit) em `34bc5ce`.

Validação do incremento de imagens locais (2026-10-26): passaram `pnpm check`
(32 testes unitários, tipos, lint e schemas), builds Web/Desktop, fmt/Clippy,
testes Rust do workspace e de fault injection. Passaram 21 E2E Chromium contra
o build de produção, incluindo PNG real, ausência de requisições remotas,
colisões de nomes, imagem grande/truncada/SVG renomeado, acessibilidade nos dois
temas, bytes exatos no ZIP, cancelamento e descarte de respostas após navegar.
O smoke Tauri Linux exibiu o PNG via IPC/CSP nativos em Markdown e wikilink e
conferiu os arquivos intactos no disco. Os testes de processo verificam o
transporte binário e a recusa de daemons sem a versão atual da API do cofre.
A CI de `dcbabb7` passou nos três sistemas, incluindo Chromium, Firefox e WebKit.

Validação das dimensões Obsidian (2026-10-26): `pnpm check` passou com 34 testes
unitários; builds Web/Desktop e 22 E2E Chromium também passaram. O teste de
dimensões verifica largura proporcional, caixa sem distorção, valores inválidos,
painel estreito, idioma/modo e ZIP com bytes originais. O smoke Tauri confirmou os
atributos `96x48` no WebView real. A CI verifica a matriz completa após publicação.

Validação dos callouts (2026-10-26): `pnpm check` passou com 40 testes unitários,
tipos, lint e schemas; builds Web/Desktop e `cargo test -p cosmos-core --locked`
passaram, incluindo a quarta fixture compartilhada TS/Rust. Passaram 23 E2E
Chromium contra o build de produção: teclado, recolhimento aninhado, foco por
título/bloco, idiomas, acessibilidade nos dois temas, rascunho/undo e bytes exatos
na exportação. O smoke Tauri Linux confirmou recolhimento, abertura dos ancestrais
por link e preservação dos arquivos no disco. A CI de `0c0d61f` passou nos três
sistemas, incluindo Chromium, Firefox e WebKit.

Validação da retomada de importação (2026-10-26): `pnpm check` passou com 43 testes
unitários, tipos, lint e schemas; builds Web/Desktop e Tauri debug passaram.
Passaram os 27 E2E Chromium da suíte e um novo cenário de destino criado durante
a validação da origem (28 cenários ao todo). Os testes cobrem interrupção entre
arquivos, recarga, repetição sem novas gravações, rascunho/undo, bytes exatos,
conflitos antes de gravar, projetos protegidos, duas abas concorrentes, pasta de
origem preservada e acessibilidade nos dois temas. A CI de `6bddc6e` passou nos
três sistemas, incluindo Chromium, Firefox e WebKit. Não houve alteração em Rust
ou nos schemas.

Validação da finalização de projetos importados (2026-10-26): `pnpm check`
(43 testes unitários, tipos, lint e schemas) e builds Web/Desktop passaram.
Passaram 31 E2E Chromium contra o build de produção, incluindo interrupção antes
de copiar todos os documentos, retomada após publicar somente o manifesto interno,
ordem de finalização e proteção habilitada durante a validação da origem.
Os testes conferem bytes exatos e o estado somente leitura após concluir os
projetos. A CI de `5d9d9a0` passou nos três sistemas, incluindo 93 testes Web
em Chromium, Firefox e WebKit.

Validação dos registros locais de importação (2026-10-26): `pnpm check` passou
com 43 testes unitários, tipos, lint e schemas; builds Web/Desktop e Tauri debug
passaram. Os 39 cenários E2E Chromium foram verificados, incluindo fechamento da
aba durante uma tentativa, relatório sem conteúdo, isolamento de pastas com o
mesmo nome, falha antes de registrar, falha após escrever mas antes de confirmar,
retomada da mesma seleção, versão obsoleta entre abas, limite de registros,
acessibilidade nos dois temas e descarte de metadados sem apagar arquivos.
O smoke Tauri Linux mantém os fluxos nativos existentes aprovados. A CI de
`07c4029` passou nos três sistemas, incluindo 117 testes Web. Não houve mudança
nos contratos Rust/IPC.

Validação da conferência de importações (2026-10-27): `pnpm check` passou com
43 testes unitários, tipos, lint e schemas; builds Web/Desktop e Tauri debug
passaram. Passaram 43 E2E Chromium contra o build de produção, incluindo estados
atuais diferentes do progresso registrado, preservação de rascunho e bytes,
reconferência explícita, filtro/paginação, idiomas, acessibilidade nos dois temas,
metadados inconsistentes sem acesso a arquivos e registros obsoletos entre abas.
O smoke Tauri Linux também passou. A CI de `6078bdd` passou nos três sistemas,
incluindo 129 testes Web; o banco local e os contratos Rust/IPC permanecem nas
mesmas versões.

Validação das dimensões em imagens Markdown (2026-10-27): `pnpm check` passou
com 44 testes unitários, tipos, lint e schemas; builds Web/Desktop e Tauri debug
passaram. Os três cenários Chromium de imagens passaram contra o build de
produção, incluindo dimensões diretas/por referência/em tabelas, descrições
acessíveis, valores inválidos, painel estreito, exportação com bytes idênticos,
carregamento sob demanda e cancelamento. O smoke Tauri Linux também passou com
as dimensões Markdown diretas e por referência, preservando os arquivos do cofre.
A CI de `1181857` passou em Windows/macOS e nos cenários de imagens dos três
navegadores, mas ficou com 128/129 testes Web nas duas tentativas: timeouts em
seleção de pasta no WebKit (retomada na primeira, importação na segunda).

Validação do leitor PDF (2026-10-27): `pnpm check` passou com 47 testes unitários,
tipos, lint e schemas; builds Web/Desktop, Tauri debug, Clippy e testes Rust do
workspace passaram. Passaram 45 E2E Chromium contra o build de produção,
incluindo páginas, texto, acessibilidade, foco, cancelamento, encerramento do
worker e bytes exatos no ZIP. O smoke Tauri Linux confirmou leitura pelo daemon,
worker sob a CSP nativa e navegação por página sem alterar o cofre.
Firefox/WebKit são verificados na CI; a instalação local do WebKit foi bloqueada
pela política de rede do ambiente. A seleção nativa de pasta/ZIP agora permanece
ativa até a operação terminar, sendo limpa no `finally` para permitir nova
seleção da mesma origem. Isso evita liberar a seleção antes das leituras
assíncronas; a relação com os timeouts anteriores precisa ser conferida na CI.
Evidências de futuras falhas Web passam a ser preservadas como artefatos por sete dias.

A CI de `9aeb7e3` confirmou PDFs em Firefox/WebKit e os dois cenários de pasta
no WebKit. Encontrou duas corridas no Chromium: o teste novo digitava antes de o
editor ficar editável, e a busca permitia digitar enquanto a atualização da lista
ainda podia limpar a consulta. O teste agora espera o editor e confirma o rascunho
antes de abrir o PDF; o campo de busca fica desabilitado durante operações, assim
como o botão. A validação desses ajustes acompanha o commit seguinte.

## Fechamento ainda necessário

- Live preview no CodeMirror, anexos além das imagens raster e PDFs sob demanda,
  recursos avançados do leitor PDF,
  transclusão/autocompletar de blocos, compatibilidade avançada de títulos/wikilinks, títulos formatados e
  personalização de callouts, e inventário maior de fixtures Obsidian. A leitura
  separada e a visão dividida já funcionam; não equivalem a todos os recursos do Obsidian.
- Concluir o adaptador Tauri do contrato `VaultFS`, especialmente `watch` e listagem
  de diretórios. A observação nativa já chega à UI por token IPC, mas ainda precisa
  ser unificada com a assinatura de callbacks `VaultFS.watch`. A UI Desktop já
  expõe mover, lixeira e restauração via IPC; a Web
  ainda não expõe esses fluxos e seus métodos internos precisam da mesma proteção
  de revisão/recuperação antes de serem disponibilizados. Atualização automática
  de links após mover notas e revisão de conflitos de movimentação também pendem.
- Leitura incremental por eventos com reconciliação de segurança, cache de backlinks
  e ensaios de performance em cofres grandes. A atualização incremental do FTS por
  revisão já funciona no Web e Desktop. Atores independentes por projeto,
  supervisão automática/reconexão após queda e um endpoint por usuário.
- UI para revisar intenções retidas no journal. A recuperação de rascunhos locais
  confirmados e salvar cópia como outra nota já funcionam; faltam merge, reassociação de
  cofres movidos e exportação global dessas cópias.
- Rollback de importação interrompida com regras de propriedade dos arquivos,
  tratamento de arquivos ou manifestos parciais e projetos incompletos herdados
  de versões anteriores. O registro local de progresso Web e a conferência do
  estado atual dos arquivos já estão disponíveis, mas não autorizam remoção ou
  substituição automática. Também falta exportação
  incremental de cofres maiores. A publicação dos manifestos por último já evita
  bloquear documentos ainda não copiados nas novas importações. A retomada explícita
  de pasta/ZIP já mantém arquivos idênticos e
  acrescenta ausentes; não remove nem substitui destinos divergentes. As limitações
  de concorrência com editores externos em pasta real estão descritas acima.
- Separação do projetor de memória em `cosmos-memory`, contratos completos de
  memória, migrações versionadas com backup e exportação do histórico bruto.
- Ensaios manuais com cofres reais, bloqueio por antivírus no Windows, instalação
  e ACL entre usuários em sistemas reais. Builds/CI não substituem esses ensaios.
- Direção visual aprovada, fontes/curadoria, inventário transitivo de licenças e
  demais gates de F0. Integrações reais com agentes e Mirror pertencem a F2.
