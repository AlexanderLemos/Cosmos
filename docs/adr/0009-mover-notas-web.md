# ADR 0009 — Mover notas no cofre do navegador

Estado: implementado como incremento de F1, com inspeção e restauração das cópias
no OPFS. A lixeira e sua restauração no OPFS estão descritas na
[ADR 0010](0010-lixeira-web.md). Limpeza de cópias e organização de pastas reais
na Web continuam pendentes.

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
pelo ZIP ou pela interface descrita abaixo.

## Inspeção e restauração das cópias

**Cópias de movimentação** lista registros sob demanda, em páginas de 50 entradas.
A listagem lê somente metadados, limitados a 64 KiB por registro; não carrega o
conteúdo das notas. **Carregar mais cópias** continua a ordem de IDs, e **Revisar
movimentações** reinicia a listagem. Registros novos anteriores ao cursor aparecem
na próxima revisão. IDs fora do formato UUID v4, JSON inválido/incompleto, caminhos
não portáveis/reservados, extensões diferentes de `.md`, revisão inválida e cópia
com nome diferente de `note.md` não autorizam leitura dos caminhos registrados.
Entradas inválidas ou ilegíveis aparecem com aviso sem impedir as demais.

**Conferir movimentação** exige a revisão SHA-256 dos bytes do registro exibido.
Sob o mesmo Web Lock, compara origem, destino e cópia com a revisão registrada,
sem alterar arquivos. Informa igual, diferente, ausente, tipo incompatível,
ilegível ou acima de 8 MiB, além do horário da conferência. Esses estados não
provam conclusão/posse de uma movimentação e não são monitorados em tempo real.
Metadados importados não recebem confiança adicional por terem hash válido.

Uma cópia com hash correspondente habilita **Restaurar cópia**. O usuário escolhe
um caminho `.md` livre; pode ser o original se estiver ausente. A restauração
revalida o registro e a cópia, exige UTF-8 válido, recusa destinos existentes
(incluindo variantes de caixa e colisões nos ancestrais), pastas reservadas e
projetos. Cria a nota sob o mesmo lock e confere os bytes gravados. Não modifica
origem, destino anterior, cópia ou registro. A nota aberta, seu histórico e seu
rascunho permanecem na interface; a lista e a busca passam a incluir a nova nota.

Uma mudança do registro ou da cópia após a inspeção impede a restauração. Abas
concorrentes não substituem a primeira nota restaurada. Falha durante a criação
pode deixar um destino vazio/parcial, informado como restauração não confirmada;
a cópia continua disponível. Não há substituição automática desse destino numa
nova tentativa: confira-o e escolha outro caminho livre. A UI não remove
registros ou cópias. Pastas reais não expõem essas capacidades.

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
já documentados. O método legado `remove` foi substituído por lixeira com revisão
e cópia verificada no OPFS, conforme ADR 0010; os arquivos legados permanecem
exportáveis e não são migrados automaticamente.

Links escritos em outras notas não são reescritos. Links relativos dentro da nota
movida podem exigir ajuste, inclusive imagens e PDFs. Outras abas não mudam sua
nota aberta automaticamente: uma tentativa de salvar a revisão anterior falha e
o texto continua disponível como rascunho ou **Salvar cópia como…**. Não há
reassociação automática de rascunhos, que permanecem ligados ao caminho original.
