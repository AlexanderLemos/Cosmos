# Créditos de assets

Ainda não foram incorporadas imagens, fontes, áudio, HDRIs ou dados astronômicos de terceiros.
O shell F0 usa fontes do sistema e CSS próprio (MIT). A curadoria obrigatória do §24
continua pendente e deve preceder qualquer tela final.

Cada asset incorporado deverá registrar: arquivo, fonte, autor, licença, link original,
uso e alterações. Aceitar CC0, domínio público, CC BY, OFL ou MIT conforme §24.
HYG/CC BY-SA é uma exceção específica prevista em §§3/22: revisar as obrigações
de compartilhamento de dados derivados antes de incorporar; não tratá-lo como CC0.

A licença MIT do COSMOS não relicencia dependências nem assets de terceiros.

O leitor usa [PDF.js 6.4.299](https://github.com/mozilla/pdf.js), da Mozilla
Foundation e contribuidores, sob Apache-2.0. Parser e worker são distribuídos
localmente sem alterações no código da biblioteca; a licença acompanha os builds
Web/Desktop em `licenses/pdfjs-LICENSE.txt` (fonte em `assets/public/licenses`).
Não incluímos os pacotes de fontes, CMaps ou codecs Wasm opcionais.
A fixture `tests/fixtures/pdfs/two-pages.pdf` é sintética, criada para o COSMOS
com Python padrão: duas páginas de texto, referência à fonte padrão Helvetica
(sem incorporar fonte) e uma ação JavaScript inerte para verificar que o leitor
não a executa. Sua licença é MIT, como o código do repositório.

| Arquivo                                                     | Autor / fonte                                   | Licença                      | Uso                                                                                                                       |
| ----------------------------------------------------------- | ----------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `img/cosmos-foundation.svg` e PNG/ICO/ICNS derivados        | COSMOS contributors, geometria original         | MIT (LICENSE do repositório) | Ícone provisório exigido pelo build Tauri; não é a identidade visual final                                                |
| `tests/fixtures/images/pixels.png` (na raiz do repositório) | COSMOS contributors, fixture sintética original | MIT (LICENSE do repositório) | PNG RGB de 2×1 pixels (verde/azul), gerado com `struct`/`zlib` da biblioteca padrão Python para testes; sem asset externo |
