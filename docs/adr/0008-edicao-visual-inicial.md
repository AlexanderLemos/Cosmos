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
