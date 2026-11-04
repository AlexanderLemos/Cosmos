# ADR 0004 · Kátoptron depois do MVP

- **Status:** aceita
- **Data:** 2026-11-04
- **Seções do plano afetadas:** §18, §25

## Contexto

O vault em `Documentos/COSMOS/` já é Markdown legível sem o COSMOS. O espelho em
`Downloads/COSMOS Projects/` exige um crate próprio, detecção de conflitos e fluxo de
resolução (D5, R12, R14).

## Decisão

- O Kátoptron sai da F1 e entra na **F2**, sem nenhuma alteração em suas regras (R12, R14, D5).
- Na F1, `cosmos open <projeto>` abre a pasta do projeto no vault.
- O schema SQLite já nasce com as tabelas `mirror_*` (§12.4), com `mirror_enabled = 0`.

## Consequências

O MVP fica menor. Se surgir uma necessidade concreta de cópia em Downloads (por exemplo,
outro programa que lê dali), a prioridade é revista.
