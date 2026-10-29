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
