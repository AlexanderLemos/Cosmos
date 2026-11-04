# Integrations (Argonautas)

One folder per agent harness, installed by `cosmos integrate <harness>` (F1+). Every
installer shows a diff of the harness config, makes a backup and can be reverted
(plan §17.2, §20.5).

| Folder | Harness | Phase |
|---|---|---|
| `skill-universal/` | Base `SKILL.md` shared by all harnesses | F1 |
| `claude-code/` | Claude Code: skill, hooks, plugin | F1 |
| `codex/` | OpenAI Codex: skill, hooks | F2 |
| `hermes/` | Hermes Agent (Nous Research): skill, hooks, plugin | F2 |
| `generic-mcp/` | Any MCP client (assisted integration) | F2 |

Adapters are written from real hook payloads captured in spike S2
(`scripts/spikes/README.md`), never from assumptions.
