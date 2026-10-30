# ADR 0008 — Edição visual inicial no CodeMirror

Estado: incremento parcial de live preview da F1 em 2026-10-27; a fase permanece aberta.
Referências: plano mestre §§10.2 e 25; [progresso e limites](../fase-1.md).

O modo **Edição visual** aplica decorações ao CodeMirror já usado pelo editor,
compartilhado entre Web/Desktop. A troca de modo reconfigura um `Compartment`;
não recria o editor, não substitui seu documento e não altera o histórico de
desfazer. Edição visual, edição Markdown, leitura e visão dividida continuam
usando o mesmo texto bruto e a mesma proteção de rascunhos/revisões.

Este primeiro incremento reconhece títulos ATX (`#` a `######`), negrito,
itálico e código em linha, usando a árvore sintática incremental do CodeMirror.
Os marcadores são ocultados somente fora das linhas abrangidas por qualquer
seleção ou cursor. Entrar na linha revela a sintaxe antes da edição. Selecionar
tudo revela todos os marcadores. Os títulos recebem tamanho e peso; spans recebem
estilos sem virar HTML do usuário. Não há execução de links ou leitura de anexos.

As decorações percorrem a região visível e preservam posições do documento.
Não substituem quebras de linha nem geram widgets de bloco. Frontmatter YAML
inicial, blocos de código/HTML e construções inline que atravessam linhas não
recebem estas transformações. Um frontmatter sem fechamento permanece literal.
As linhas selecionadas mantêm a formatação tipográfica, mas exibem os marcadores.
Durante composição de texto, as decorações são suspensas de forma conservadora.

A interface e o plugin limitam a transformação a 262.144 unidades de texto
UTF-16; acima disso, a nota continua editável como Markdown e há um aviso.
Isso não constitui um benchmark de cofres grandes nem de todos os métodos de
entrada. A preferência é transitória na sessão, como os outros modos atuais.

Este incremento não oferece tabelas, tarefas, títulos Setext, tachado, callouts,
wikilinks, transclusões ou anexos renderizados dentro do editor. A leitura separada
mantém os recursos já implementados. Não é equivalência completa ao live preview
do Obsidian. Não há mudança no daemon, IPC, schemas, banco ou dependências.

## Evolução — tarefas e tachado, 2026-10-29

O parser do editor habilita as extensões `TaskList` e `Strikethrough` de
`@lezer/markdown` 1.8.1 (MIT), que já era dependência transitiva do CodeMirror e
agora é declarada diretamente. Não habilitamos outras extensões GFM neste passo.
Os nomes dos nós sintáticos determinam as transformações; não se procuram
marcadores de tarefa por regex em todo o documento.

Um `TaskMarker` fora das linhas selecionadas vira um widget inline de checkbox
HTML nativo. O texto da primeira linha e o prefixo traduzido Tarefa/Task formam
seu nome acessível. O widget preserva foco durante atualizações, permite Tab/Espaço
e encaminha atalhos de salvar/desfazer/refazer ao editor. O estado readonly é
refletido na caixa e conferido novamente no evento, junto com o marcador atual.
A transação substitui apenas o caractere central por `x` ou espaço e isola o
histórico de desfazer. Seleção e outros bytes são preservados. Nenhuma gravação
no cofre acontece até o salvamento explícito; rascunhos e revisão seguem o fluxo
existente. A evolução não muda daemon, IPC, schemas ou armazenamento.

Tarefas numeradas, aninhadas e em citações usam a mesma regra. Estados
personalizados ficam literais. A linha em edição revela o Markdown, sem widget.
Frontmatter e blocos de código/HTML mantêm as exclusões anteriores. Tachado
`~~texto~~` usa decorações como negrito/itálico, limitado a uma linha e com
marcadores visíveis na seleção. Tabelas, títulos Setext, links, callouts,
transclusões e anexos no editor permanecem fora deste incremento.

## Evolução — tabelas na edição visual, 2026-10-29

A extensão `Table` do parser Lezer já instalado reconhece tabelas GFM. A
apresentação usa `StateField` com decorações de substituição em bloco, pois
widgets que substituem quebras de linha precisam ser fornecidos diretamente ao
CodeMirror antes do cálculo da região visível. O plugin inline ignora os nós
Table; o campo específico decide entre fonte literal e widget. Frontmatter,
seleção e limite de tamanho usam funções compartilhadas com a apresentação inline.

Somente tabelas no nível principal são substituídas. Qualquer seleção que toque
suas linhas revela a tabela inteira; o botão de fonte ou um clique em célula
posiciona o cursor no Markdown original. A ação confere o trecho atual antes de
navegar, não altera o documento nem libera edição em notas protegidas. A mudança
de seleção remove o widget e devolve foco ao editor. Salvar e desfazer continuam
usando o editor existente. Não há serialização reversa ou editor de planilha.

A apresentação cria elementos DOM conhecidos com `textContent`/nós de texto,
sem interpretar HTML da nota. Tabelas têm caption com ação traduzida, cabeçalhos
com escopo de coluna, alinhamento, células vazias e formatação inline limitada a
negrito, itálico, código e tachado. Pipes escapados são conteúdo; delimitadores
vêm dos nós sintáticos. Links, imagens, wikilinks, entidades e HTML ficam literais.
Não há carregamento de recursos por uma célula. Cabeçalhos vazios recebem o
número da coluna como nome acessível. Formatação recursiva limita-se a 16 níveis.

Os limites iniciais são 200 linhas incluindo cabeçalho, 32 colunas e 2.000 células
apresentadas por nota, além das 262.144 unidades UTF-16 existentes. Tabelas acima
desses limites e tabelas em listas/citações permanecem na fonte. O campo acompanha
mudanças no documento, seleção e árvore sintática, inclusive a análise assíncrona
do CodeMirror; a criação de DOM continua sob a virtualização do editor. Estes
limites não substituem benchmarks de cofres grandes. Nenhum contrato de daemon,
IPC, armazenamento, esquema ou dependência foi alterado neste incremento.

## Evolução — callouts simples, 2026-10-29

Tipos, aliases e reconhecimento do marcador vêm de um módulo puro em
`@cosmos/core/callout-marker`, compartilhado com a transformação de leitura.
O editor passa a depender do pacote interno core; nenhuma biblioteca externa
foi adicionada. A gramática de leitura e seus títulos não foram modificados.

No CodeMirror, citações simples no nível principal usam decorações de linha
para título/corpo e um widget inline no marcador, com botão de tipo traduzido
para revelar a fonte. As marcas `>` ficam ocultas fora da seleção; o corpo
continua no documento editável e recebe a formatação inline/tarefas existente.
Qualquer seleção no bloco suspende suas decorações, revelando toda a fonte.
O botão verifica o marcador antes de posicionar a seleção, devolve foco ao editor
e não altera o documento. O caminho de salvar/desfazer/rascunhos é o já existente.

A transformação é limitada a 200 linhas com citações explícitas, dentro do limite
geral de edição visual. Callouts aninhados ou dentro de listas, tabelas, blocos
de código/HTML, continuação implícita e cabeçalhos inline ambíguos ficam literais.
Referências de link que definem o marcador também impedem a transformação. O
levantamento dessas referências acontece no máximo uma vez por atualização das
decorações, e ignora o frontmatter. Isso não promete equivalência completa aos
parsers de leitura e edição. Fronteiras mais complexas ficam para outro incremento.

O corpo permanece aberto; `+`/`-` não são reescritos e ainda controlam o estado
inicial no modo Ler. Recolhimento no editor, blocos aninhados e renderização de
links/anexos continuam pendentes. Temas e rótulos são reconfigurados sem recriar
o editor. O botão funciona em notas protegidas apenas para navegar na fonte.
Não há alteração de daemon, IPC, schemas ou armazenamento.

## Evolução — títulos Setext, 2026-10-29

Nós `SetextHeading1`/`SetextHeading2` recebem o mesmo estilo de nível dos títulos
ATX, incluindo títulos multilinha e em listas/citações. Somente as linhas de
texto na região visível recebem decorações, para não criar uma decoração por
linha de um título maior que a tela. O `HeaderMark` é ocultado fora da seleção,
sem substituir sua quebra de linha; a linha do sublinhado mantém o espaçamento.

Selecionar qualquer linha do nó, inclusive o sublinhado, revela a fonte inteira
do título e suspende a ocultação de marcadores inline nele. A mudança de `===`
para `---` usa a edição normal e pode ser desfeita; não existe conversão ou
serialização da fonte. Separadores horizontais têm outro nó sintático; YAML e
blocos de código continuam nas exclusões existentes. Não foram adicionadas
bibliotecas, widgets, contratos ou mudanças na persistência.

## Evolução — links locais na edição visual, 2026-10-29

Nós `Link` na região visível oferecem navegação para notas com destino inline e
wikilinks simples, fora das linhas selecionadas e do frontmatter. A inspeção
Markdown existente decodifica o destino e extrai o texto do rótulo de cada link
inline; não serializa a nota. Wikilinks são reconhecidos pela fonte ao redor do nó
Lezer, com exclusão de escapes, embeds, referências definidas, formatação interna
e destinos adjacentes ambíguos. Links por referência continuam literais.

Um widget inline contém dois botões nativos: abrir o destino e revelar sua fonte.
O DOM usa texto, sem HTML da nota. O botão de fonte confere o trecho atual e muda
apenas seleção/foco. A linha em edição volta ao Markdown, usando o mesmo histórico
e rascunho. Atualizações reaproveitam o DOM do widget, incluindo foco, e atalhos
de salvar/desfazer continuam chegando ao editor. Rótulos são traduzidos e notas
protegidas permitem navegar sem liberar edição.

A resolução usa `previewLink`, compartilhado com a leitura, e é refeita ao ativar
o controle. Destinos ausentes ou ambíguos ficam desabilitados; operações em curso
impedem navegação. O Workspace compartilha o mesmo fluxo de confirmação de
rascunho e carregamento entre leitura e editor visual. Destinos sem fragmento
mantêm o modo visual; títulos/blocos abrem a visão dividida e reutilizam foco,
abertura de callouts ancestrais e avisos de destino ausente do painel de leitura.
Na mesma nota, a instância do editor, seu histórico e o rascunho são preservados.

Links externos/protocolos, anexos, tabelas e cabeçalhos de callouts mantêm a fonte.
Não são carregados recursos por estes widgets. O limite geral de 262.144 unidades
UTF-16, suspensão durante composição e exclusões de código/HTML permanecem.
Não há dependências externas novas nem alterações de daemon, IPC ou persistência.

## Evolução — PDFs sob demanda no editor, 2026-10-30

Links Markdown com destino inline e referências Obsidian simples para PDFs
locais usam `pdfTarget`, compartilhado com a leitura, incluindo `#page=N`.
Embeds `![[arquivo.pdf|alias]]` usam o nó Image/Link do Lezer e conferem a fonte;
viram um botão **Abrir PDF**, sem carregar o documento antes da ativação.
O botão de fonte revela a sintaxe inteira, incluindo `!`. Imagens Markdown,
links por referência, tabelas, cabeçalhos de callout, código, YAML, escapes e
destinos remotos continuam nas exclusões existentes. Outros embeds não viram
links de notas por esta extensão.

O widget informa a ação PDF e verifica a disponibilidade do leitor no cofre.
Ausência/ambiguidade do arquivo e problemas de página são informados pelo leitor
após a abertura, com a resolução de anexos já existente. O Workspace revalida o
destino e abre o mesmo `PdfDialog` da leitura, fora do DOM gerenciado pelo
CodeMirror. A nota, o rascunho, o histórico e o modo visual são preservados,
inclusive em notas protegidas. Fechar por botão ou Escape restaura o foco no
botão original, se ainda existir, ou no editor ainda montado.

A visualização é vinculada ao cofre, caminho e geração da nota. Trocar esses
valores ou sair do modo visual desmonta o leitor, encerrando o worker e
descartando resultados tardios conforme a ADR 0007. Não há novos formatos,
dependências, permissões, contratos IPC ou gravações no cofre.
