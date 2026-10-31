# ADR 0010 — Lixeira recuperável no cofre do navegador

Estado: implementado como incremento de F1 para OPFS. Lixeira em pastas reais,
exclusão definitiva e limpeza das cópias continuam pendentes.

## Decisão

**Enviar à lixeira** usa a confirmação já existente na interface. Exige nota salva,
revisão conhecida e permissão para organizar a origem; projetos são protegidos.
O método `VaultFS.remove(path, expectedRev)` substitui a implementação Web legada
sem revisão. Ele recusa pastas reais, caminhos reservados (independentemente de
caixa), extensões diferentes de `.md` e notas maiores que 8 MiB.

Sob o mesmo Web Lock de escrita, importação e movimentação, valida a origem e
sua revisão e grava em `.cosmos/trash/web-v1/<UUID>/`:
- `operation.json`: formato 1, `from`, revisão SHA-256 e `backup: "note.md"`.
- `note.md`: bytes originais, conferidos pela revisão antes de remover a origem.

Antes da remoção, verifica novamente a proteção e a revisão da origem. Uma falha
após verificar a cópia informa seu caminho; a nota aberta permanece disponível.
Uma falha anterior não remove a origem, mas pode deixar metadados ou cópia parcial.
Nenhum desses registros declara sucesso, posse exclusiva dos arquivos ou que a
origem está ausente. Não há retomada, rollback ou limpeza automáticos.

## Conferência e restauração

O painel **Lixeira** reutiliza a validação, paginação e restauração das cópias de
movimentação ([ADR 0009](0009-mover-notas-web.md)). A listagem é explícita, em
páginas de 50 registros, lendo metadados de até 64 KiB. Uma tentativa local de
envio à lixeira invalida a listagem anterior; **Revisar lixeira** lê o estado atual.
JSON inválido/incompleto, IDs fora de UUID v4, caminhos inseguros, revisão inválida
ou cópia redirecionada aparecem como indisponíveis e não autorizam acesso aos
caminhos registrados. Registros de movimentação não são aceitos como registros
de lixeira. A listagem não lê o conteúdo das cópias.

**Conferir item da lixeira** exige a revisão do registro exibido e compara origem
e cópia com o hash registrado, sem escrever. Informa estado e horário da leitura.
A origem pode continuar presente após uma interrupção; a UI não a considera
removida somente porque há uma cópia. Os estados não são monitorados em tempo real.

**Restaurar cópia** confere novamente metadados e bytes, exige UTF-8 válido e cria
uma nota somente em caminho livre. Recusa colisões de nomes/ancestrais, inclusive
variantes de caixa, pastas reservadas e projetos. Confere os bytes escritos antes
de informar sucesso. Mantém a nota aberta, seu histórico e rascunho; a lista e a
busca passam a incluir a nota restaurada. Em concorrência entre abas, uma segunda
restauração para o mesmo destino falha sem substituir a primeira.

A cópia e seu registro **permanecem na lixeira após restaurar**, conforme aviso na
interface. Podem ser usados novamente em outro caminho livre. Isso difere da
restauração nativa e evita tornar o único backup dependente de uma escrita recente.
Excluir definitivamente e gerenciar espaço exigem um fluxo separado, ainda pendente.
Uma falha ao restaurar pode deixar destino vazio/parcial; ele não será substituído
por outra tentativa. A cópia continua disponível para conferência e outro destino.

## Compatibilidade e limites

O namespace `trash/web-v1` separa estes registros dos registros nativos e dos
arquivos da implementação Web antiga (`trash/<UUID>/<caminho>`). Não há migração
ou exclusão desses arquivos antigos: permanecem na exportação ZIP para recuperação
manual. O painel lista somente o novo namespace. Notas, arquivos de recuperação e
registros preservam seus bytes durante inspeção; não há serialização de Markdown.

A lixeira fica fora da navegação de notas, backlinks e índice, mas acompanha o ZIP
exportado e conta nos limites de espaço/exportação. Não há transação atômica entre
arquivos nem garantia contra limpeza do perfil, falha física ou gravações diretas
que não participem do lock. As limitações de durabilidade, versões antigas e
editores externos da ADR 0009 continuam aplicáveis. File System Access não expõe
lixeira/restauração; o backend também recusa essas operações em pastas reais.
