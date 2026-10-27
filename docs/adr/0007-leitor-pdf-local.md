# ADR 0007 — Leitor local de PDF sob demanda

Estado: incremento de F1 em 2026-10-27; a fase permanece aberta.
Referências: plano mestre §§9.1, 12.6 e 25; [progresso e limites](../fase-1.md).

Links Markdown para PDFs locais e referências Obsidian (`[[manual.pdf]]` e
`![[manual.pdf]]`, com aliases) oferecem abertura em um diálogo modal compartilhado
entre Web e Desktop. `#page=N` abre uma página específica; uma página inexistente
gera aviso. Embeds viram uma ação de abertura, não carregamento automático.
Links Markdown são relativos à nota; referências Obsidian tentam caminho local,
raiz do cofre e nome único. Ambiguidades não escolhem um arquivo arbitrariamente.
PDFs não geram backlinks para notas com nomes parecidos.

O daemon ganha `list_pdfs`/`read_pdf` e resposta `pdf`, com schemas gerados pelo
Rust. A API do cofre passa a 3, mantendo protocolo JSON-RPC 1 e banco v3. Um daemon
anterior é recusado no handshake e deve ser encerrado antes de abrir a nova versão;
não há encerramento automático nem migração de dados. O frontend continua sem
acesso nativo genérico a arquivos, shell ou caminhos absolutos.

A leitura exige caminho portátil, extensão `.pdf`, cabeçalho `%PDF-1.x`/`%PDF-2.x`
e no máximo 16 MiB. Exclui `.git`, `.obsidian` e nomes iniciados por `.cosmos`;
o Desktop recusa symlinks e limita também o fluxo efetivamente lido. Assinatura
não prova que o documento seja válido: o parser ainda precisa aceitá-lo.

Usamos PDF.js 6.4.299 (Apache-2.0), distribuído localmente, com importação dinâmica
do parser e worker próprio. A licença acompanha ambos os builds em
`licenses/pdfjs-LICENSE.txt`. Recebe bytes em memória, sem URL do documento nem
CDN. O worker é encerrado ao fechar; leituras nativas já iniciadas podem terminar,
mas seus resultados tardios são descartados. A CSP nativa permite worker próprio
e fontes `blob:` geradas pelo leitor, sem liberar conexões externas.

Renderizamos uma página por vez em canvas, com largura até 1.200 e altura até
1.600 pixels e máximo de 2.000 páginas por documento. A imagem se ajusta ao painel.
Texto extraído tem uma alternativa selecionável, limitada a 250 mil caracteres
por página; sua ordem depende do PDF. Não há OCR, camada de seleção sobre a página,
zoom, impressão, edição, anotações interativas ou execução de JavaScript do PDF.
Formulários XFA e documentos com senha não são suportados. Wasm e downloads de
fontes/CMaps estão desativados/não configurados: PDFs que exigem esses recursos,
incluindo certos encodings e imagens JPEG 2000, podem falhar ou renderizar de forma
incompleta. Não prometemos equivalência a um leitor PDF completo. Os limites de
bytes/canvas não são um teto de memória ou CPU para todo documento comprimido.

O diálogo conserva a nota e o rascunho. Fechar por botão ou Escape devolve o foco
ao link; não há escrita no cofre, journal ou índice. Uma visualização é um snapshot:
fechar e reabrir relê o arquivo. Falhas informam ausência/ambiguidade, tamanho,
página inválida, senha ou erro de leitura/renderização. Não abrimos aplicativos
externos nem copiamos o PDF para pastas temporárias persistentes.
