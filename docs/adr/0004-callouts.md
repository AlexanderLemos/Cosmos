# ADR 0004 — Callouts Obsidian na leitura

Estado: incremento de F1 em 2026-10-26; a fase permanece aberta.
Referências: plano mestre §§9.1, 10.2 e 25; [limites e validação](../fase-1.md).

Callouts são uma transformação da árvore de exibição compartilhada por Web e
Desktop, após a identificação de blocos e antes dos wikilinks. Essa ordem preserva
os destinos existentes e os offsets necessários para distinguir escapes. O
Markdown original continua sendo a fonte; recolher ou expandir nunca reserializa
nem grava uma nota. Não há mudança nos contratos de arquivos, IPC ou no banco.

Usamos `details`/`summary` nativos para callouts recolhíveis e um contêiner com
papel de nota para os estáticos. `+` e `-` determinam apenas a abertura inicial.
O estado é transitório por nota. Navegar para um título/bloco interno abre todos
os ancestrais necessários antes de focar e rolar até o destino, inclusive em outra
nota. Temas e idiomas não remontam os controles nem descartam a edição.

Os títulos personalizados são texto simples neste incremento, sem controles
interativos aninhados em `summary`. Rótulos de links e imagens são preservados,
HTML é omitido e wikilinks de título ficam literais. Títulos ausentes usam rótulos
traduzidos; tipos desconhecidos recebem o tipo genérico de nota. CSS, ícones ou
comportamentos vindos de plugins Obsidian não são interpretados. O corpo segue as
mesmas restrições de links/HTML/imagens da leitura existente.

A sintaxe é reconhecida somente no início do primeiro parágrafo de uma citação,
com conferência do marcador na fonte bruta. Casos ambíguos de cabeçalho multilinha
permanecem citações comuns. A conformidade TS/Rust cobre a inspeção do Markdown;
o comportamento de exibição é coberto por testes do parser, Playwright e smoke do
WebView nativo, incluindo teclado, foco, rascunhos e round-trip de bytes.
