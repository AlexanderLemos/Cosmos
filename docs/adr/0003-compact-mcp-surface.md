# ADR 0003 · Superfície MCP compacta

- **Status:** aceita
- **Data:** 2026-11-04
- **Seções do plano afetadas:** §17.4

## Contexto

A definição de cada ferramenta MCP é carregada no contexto do agente em **toda** sessão.
Doze ferramentas custam tokens fixos, o que vai contra o objetivo de economia (§16).

## Decisão

Seis ferramentas, com os mesmos contratos internos do `MemoryService`:

| Ferramenta | Substitui (v2.2) | Escopo |
|---|---|---|
| `cosmos_open_project` | `open_project`, `link_repository` | read (+write para criar/vincular) |
| `cosmos_get_context` | `get_context`, `project_status` | read |
| `cosmos_search` | `search`, `list_projects` (com `scope: "projects"`) | read |
| `cosmos_read` | `read` | read |
| `cosmos_record` | `checkpoint`, `update_project`, `claim_task`, `release_task` (campo `kind`) | write |
| `cosmos_close_session` | `close_session` | write |

As descrições das ferramentas devem ser curtas; detalhes de uso ficam na Skill, carregada sob
demanda.

## Consequências

- Menos tokens fixos por sessão; o benchmark §26.9 deve incluir o custo das definições MCP.
- `cosmos_record` precisa de validação por `kind` com mensagens de erro úteis ao agente.
- A API HTTP (§17.6) não muda: é uma porta diferente para o mesmo serviço.
