# ADR 0003 — Imagens locais sob demanda

Estado: implementado como incremento de F1 em 2026-10-26; a fase permanece aberta.
Referências: plano mestre §§9.1, 10.2, 12.6 e 25; [limites de F1](../fase-1.md).

A leitura compartilha entre Web/Desktop o reconhecimento de imagens Markdown e
embeds Obsidian raster. O usuário solicita cada imagem explicitamente. Imagens
remotas, SVG e transclusões de notas não são habilitados por esse incremento.
O texto original nunca é reserializado; a transformação ocorre somente na árvore
de exibição. Imagens dentro de links usam seu texto alternativo como rótulo.
Dimensões em embeds Obsidian são interpretadas como números inteiros entre 1 e
4096 pixels CSS; valores inválidos são ignorados. Largura isolada preserva a
proporção, e largura/altura formam uma caixa com `object-fit: contain`, limitada
pelo painel/janela. Não se aceita CSS arbitrário nem se altera o arquivo da imagem.

O daemon recebe os comandos tipados `list_images` e `read_image`; seus schemas e
tipos TS são gerados a partir do Rust. A API de cofre versão 2 é conferida pelo
handshake para recusar daemons antigos antes de usar os comandos novos. O protocolo
JSON-RPC permanece 1 e o banco permanece v3, sem migração. Atualização automática
do daemon não faz parte desta decisão.

A leitura é restrita ao cofre selecionado, com caminhos portáveis, exclusão de
metadados internos e rejeição de symlinks no Desktop. PNG/JPEG/GIF/WebP exigem
extensão e assinatura compatíveis e têm limite de 8 MiB. No Rust, o limite também
é aplicado ao fluxo lido, sem depender somente do tamanho anterior do arquivo.
O retorno usa base64 para caber confortavelmente no limite existente do frame.
Os adaptadores Web aplicam as mesmas regras de tamanho/formato aos handles do cofre.
O limite não é um orçamento de pixels decodificados nem de memória total.

A UI cria URLs de objetos somente com bytes validados, sem entregar caminhos
absolutos ao WebView. A CSP Desktop permite `blob:` em `img-src`, sem liberar
conexões externas. As URLs são revogadas ao ocultar/desmontar; respostas de uma
solicitação cancelada são ignoradas. Nenhuma leitura entra no journal de escrita,
altera uma nota ou copia anexos para os dados internos persistentes do aplicativo.

Sem cache persistente ou monitor próprio de anexos nesta entrega: cada solicitação
refaz a listagem e leitura, e uma imagem aberta permanece como snapshot até ser
ocultada/reaberta. A arquitetura mantém o daemon como único acesso nativo ao cofre;
PDF, outros formatos e carregamento em lote terão limites e decisões próprios.

## Dimensões em imagens Markdown — 2026-10-27

A leitura também aceita `![Descrição|300](imagem.png)` e
`![Descrição|300x200](imagem.png)`, inclusive imagens por referência
(`![Descrição|300][foto]`). O último sufixo do texto alternativo decodificado
é interpretado somente quando satisfaz os mesmos limites dos embeds Obsidian.
Sufixos inválidos permanecem na descrição; barras anteriores continuam como
texto. Em tabelas GFM, a barra deve ser escapada (`\|`) conforme a sintaxe da tabela.

A descrição anterior ao sufixo continua como nome acessível da imagem e do botão;
quando vazia, usa-se o caminho da imagem. Imagens dentro de links continuam como
rótulos de texto, sem controles nem interpretação de dimensões. O destino e as
definições de referência não são alterados. A transformação ocorre apenas na
árvore de leitura compartilhada entre Web e Desktop, mantendo carregamento sob
demanda e as restrições de formato/origem existentes. Não há alteração no IPC,
no armazenamento ou nos bytes do Markdown/anexo.

## Imagens na edição visual — 2026-10-30

O editor passa a oferecer os mesmos formatos e dimensões em imagens Markdown
com destino inline e embeds Obsidian simples. Leitura e edição visual compartilham
`readLocalImage`, que resolve o caminho, lê pelo adaptador do cofre e valida
extensão/assinatura/tamanho antes de produzir um Blob. Um predicado de validade
evita iniciar a leitura após cancelamento da listagem e descarta resultados tardios.

O editor usa widgets DOM do CodeMirror, sem montar outra árvore React. URLs de
objeto são revogadas ao ocultar ou remover o widget. Remover por seleção da fonte,
troca de nota/modo ou virtualização também cancela a solicitação. Não há cache
de imagens entre widgets: ao voltar a uma região removida da tela, pode ser
necessário solicitar a imagem novamente. Preferências de tema/idioma e mudanças
de posição mantêm a imagem enquanto seu widget for reaproveitado e o destino e
carregador permanecerem os mesmos. Ver exclusões na ADR 0008.
