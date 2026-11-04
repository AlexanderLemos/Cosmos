# ADR 0002 · Idiomas e convenções

- **Status:** aceita
- **Data:** 2026-11-04
- **Seções do plano afetadas:** §5 (decisão 4), §6

## Decisão

| Item | Idioma |
|---|---|
| Código, identificadores, comentários, nomes de crates/pacotes | Inglês |
| Mensagens de commit | Inglês, padrão [Conventional Commits](https://www.conventionalcommits.org/) |
| Documentação (`docs/`) | pt-BR (o `README.md` também tem versão em inglês) |
| Interface | pt-BR + en desde o início (i18n) |
| Nomes gregos do glossário (§7.2) | Mantidos; em identificadores, usar a forma ASCII (`ariadne`, `katoptron`, `nomoi`) |

**Versionamento:** SemVer. O app Desktop, o `cosmosd`/`cosmos` e o protocolo IPC têm versões
próprias; o handshake IPC informa `protocol_version` (§13.6).

**Telemetria:** nenhuma. O COSMOS não envia dados para fora da máquina.

## Consequências

Facilita contribuições externas (projeto open-source MIT) sem perder a documentação no
idioma do autor.
