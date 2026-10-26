# Dependências incorporadas em F1

As licenças abaixo pertencem às bibliotecas, não são substituídas pela MIT do
COSMOS. Versões exatas e dependências transitivas estão nos dois lockfiles.
Isto registra as escolhas novas; o inventário transitivo completo de F0 continua
pendente. Nenhum asset visual de terceiros foi incluído nesta entrega.

| Componente                     | Uso                                                    | Licença declarada / origem                                                                                                  |
| ------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| CodeMirror 6 (`@codemirror/*`) | Editor Markdown                                        | MIT — https://github.com/codemirror                                                                                         |
| `react-markdown` 10.1.0        | Leitura Markdown em elementos React, sem executar HTML | MIT — https://github.com/remarkjs/react-markdown                                                                            |
| `fflate`                       | Exportação ZIP                                         | MIT — https://github.com/101arrowz/fflate                                                                                   |
| `@sqlite.org/sqlite-wasm`      | Wrapper ES e WASM oficial                              | Apache-2.0 do pacote; núcleo SQLite em domínio público — https://github.com/sqlite/sqlite-wasm                              |
| `rusqlite` / SQLite bundled    | Banco nativo e FTS5                                    | MIT do binding; núcleo SQLite em domínio público — https://github.com/rusqlite/rusqlite                                     |
| `blake3`                       | Revisões e identificação do cofre                      | CC0-1.0 ou Apache-2.0 ou Apache-2.0 WITH LLVM-exception — https://github.com/BLAKE3-team/BLAKE3                             |
| `fs4`                          | Lock exclusivo                                         | MIT ou Apache-2.0 — https://github.com/al8n/fs4-rs                                                                          |
| `tempfile`                     | Escrita atômica                                        | MIT ou Apache-2.0 — https://github.com/Stebalien/tempfile                                                                   |
| `interprocess`                 | Socket Unix / named pipe                               | MIT ou Apache-2.0 — https://github.com/kotauskas/interprocess                                                               |
| `tauri-plugin-dialog`, `rfd`   | Consentimento por seletor de pasta                     | MIT ou Apache-2.0 (plugin), MIT (rfd) — https://github.com/tauri-apps/plugins-workspace / https://github.com/PolyMeilex/rfd |
| `ulid`, `time`                 | Identificação e data de projeto                        | MIT (`ulid`), MIT ou Apache-2.0 (`time`) — https://github.com/dylanhart/ulid-rs / https://github.com/time-rs/time           |
| `notify`                       | Observação nativa do cofre, sem seguir symlinks        | CC0-1.0 — https://github.com/notify-rs/notify                                                                               |
| `base64` 0.23.1                | Transporte de imagens locais no IPC                    | MIT ou Apache-2.0 — https://github.com/marshallpierce/rust-base64                                                           |
