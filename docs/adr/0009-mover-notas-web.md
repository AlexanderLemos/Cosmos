# ADR 0009 — Mover notas no cofre do navegador

Estado: implementado como incremento de F1; lixeira, restauração e organização de
pastas reais na Web continuam pendentes.

## Decisão

A Web expõe **Mover nota** para renomear ou mudar o caminho de uma nota Markdown
salva no OPFS. Reutiliza a interface do Desktop, com revisão esperada obrigatória.
Rascunhos não salvos impedem a operação; projetos permanecem protegidos. O destino
não pode existir, inclusive como diretório ou variante de maiúsculas/minúsculas;
colisões nos diretórios ancestrais também são recusadas. `.cosmos`, `.git` e
`.obsidian` são reservados, independentemente de capitalização.

Todas as etapas usam o mesmo Web Lock das escritas e importações. Antes de alterar
os caminhos visíveis, o adaptador valida a origem/revisão, o destino e as proteções.
Depois grava em `.cosmos/moves/<UUID>/`:
- `operation.json`: intenção com formato 1, origem, destino, revisão SHA-256 e
  nome relativo da cópia (`note.md`). Não declara que a operação terminou.
- `note.md`: bytes da nota antes da movimentação, conferidos pela revisão.

Somente após verificar essa cópia, grava e confere o destino, verifica novamente
as proteções e a revisão da origem e remove a origem. O conteúdo UTF-8 válido,
BOM e terminações de linha são preservados; não há serialização de AST. A leitura
continua limitada a 8 MiB. A lista/busca usa o novo caminho; os arquivos de
recuperação não entram na lista de notas, backlinks ou índice.

As cópias permanecem inclusive após sucesso e acompanham **Exportar cofre (.zip)**.
Falhas após confirmar a cópia mostram seu caminho e orientam conferir os arquivos.
Não há rollback, retomada, remoção de duplicatas ou limpeza automáticos. Uma queda
pode deixar apenas a intenção, uma cópia incompleta antes da verificação, ou ambos
os caminhos. A ausência da origem não é prova de conclusão. A recuperação é manual
pelo ZIP; uma UI de inspeção/restauração dessas cópias fica pendente.

## Limites

Não é uma transação atômica entre arquivos. A confirmação usa `createWritable.close`
e releitura; não promete resistência a falha física, limpeza do perfil ou quota.
As cópias consomem armazenamento e contam no limite atual de exportação de 256 MiB.
Abas que usam o adaptador atual participam do bloqueio; versões antigas ou código
que escreve diretamente no OPFS não recebem garantias de coordenação.

Pastas reais via File System Access não expõem a ação; o backend também a recusa.
Um editor nativo não participa de Web Locks e pode alterar um arquivo entre a
última conferência e a remoção. Essa limitação exige outro fluxo antes de expor a
movimentação de pastas reais. Escritas/importações existentes mantêm seus limites
já documentados. O método interno legado `remove` continua sem interface Web e
precisa de revisão/recuperação antes de suportar lixeira e restauração.

Links escritos em outras notas não são reescritos. Links relativos dentro da nota
movida podem exigir ajuste, inclusive imagens e PDFs. Outras abas não mudam sua
nota aberta automaticamente: uma tentativa de salvar a revisão anterior falha e
o texto continua disponível como rascunho ou **Salvar cópia como…**. Não há
reassociação automática de rascunhos, que permanecem ligados ao caminho original.
