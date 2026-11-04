# ADR 0001 · Memória primeiro

- **Status:** aceita
- **Data:** 2026-11-04
- **Seções do plano afetadas:** §25 (roadmap), §11.2 (Web)

## Contexto

O roadmap da v2.2 constrói, já na F1, o editor, a importação do Obsidian, o `VaultFS` para
três plataformas e o `cosmosd`. O diferencial do COSMOS é o Pilar 2 (COSMOS Memory), que
funciona sem editor: a memória é Markdown e pode ser lida por qualquer programa.

## Decisão

O roadmap passa a ser:

| Fase | Entrega | Critério de pronto |
|---|---|---|
| **F0** | Monorepo, CI, ADRs, contratos v1, esqueletos (`cosmosd`, `cosmos`, Desktop), scripts dos spikes | Workspace compila e testa nos 3 SOs; contratos exportados |
| **F1 · Memory MVP** | `cosmosd` (lock, IPC, ator por projeto, SQLite WAL, escrita atômica), resolvedor de projeto, documentos de memória, Fio de Ariadne, `cosmos hook` + `cosmos mcp`, integração **Claude Code** | *"Abro o Claude Code num repositório, trabalho e fecho. No dia seguinte ele já sabe onde parou, sem eu colar nada."* |
| **F2 · Mais Argonautas** | Codex, depois Hermes; consolidador completo, evidências, redator de segredos, perfis e escopos; Kátoptron (ADR 0004) | Fluxo Claude → Codex → Hermes → Claude (§26.1–26.11) |
| **F3 · Desktop v0** | Bandeja, lista de Sistemas Estelares, página do projeto, Argonautas, configurações; tokens Espectrais | Instalar e usar no Windows; status do Daímōn visível |
| **F4 · Desktop v1 (PKM)** | Editor CodeMirror, Universos, wikilinks, Telescópio, Oráculo, importação Obsidian | Round-trip de cofre Obsidian sem perda |
| **F5 · Identidade + Web** | Firmamento, Big Bang, Atlas, Anámnēsis…; COSMOS Web; landing | Critérios originais da F3–F5 da v2.2 |
| **F6 · Expansão** | Igual à v2.2 | — |

## Consequências

- O valor central chega cedo e o uso real orienta a interface.
- O Desktop v0 nasce como cliente IPC de um daemon já testado: nada é refeito.
- A Web deixa de competir por esforço com o núcleo; o schema SQLite e as consultas FTS5
  continuam desenhados para serem reaproveitados por ela.
- Nenhuma funcionalidade foi removida (R6): só a ordem mudou.

## Alternativas consideradas

- **Manter a ordem da v2.2:** muito trabalho antes do primeiro uso real.
- **PKM primeiro:** o editor já existe em muitos produtos; não é o diferencial.
