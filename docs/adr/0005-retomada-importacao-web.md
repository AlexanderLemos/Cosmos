# ADR 0005 — Retomada conservadora da importação Web

Estado: incremento de F1 em 2026-10-26; rollback completo permanece pendente.
Referências: plano mestre §§9.1, 12.6 e 25; [limites e validação](../fase-1.md).

Uma importação interrompida pode ter concluído alguns arquivos. Antes, selecionar
a origem novamente falhava no primeiro destino existente. A Web passa a oferecer
uma retomada explícita para pasta e ZIP: manter destinos somente quando os bytes
coincidem e criar apenas os ausentes. Sem essa opção, a política permanece recusar
destinos existentes. Não usamos tamanho, data ou apenas o nome como prova de
igualdade, nem inferimos que arquivos existentes pertencem à importação anterior.

Os caminhos, limites, fontes e destinos de toda a seleção são verificados antes
de começar a gravar. Os bytes dos arquivos ausentes ficam em memória durante a
operação, evitando falha de leitura tardia da origem. Pasta e ZIP têm limite de
256 MiB descomprimidos e 10 mil arquivos; o ZIP também limita entradas de diretório.
Esse limite não representa o consumo total de memória, que inclui cópias e buffers
da descompressão. Nenhum conteúdo Markdown ou anexo é reserializado.

O lock Web existente cobre planejamento e escrita entre abas do COSMOS. Cada
novo destino é conferido novamente antes de ser criado. Isso não torna a operação
uma transação de múltiplos arquivos, nem resolve a corrida com um editor externo
em pasta real: File System Access não oferece uma criação exclusiva com revisão.
Uma falha posterior ao planejamento preserva os arquivos já concluídos e pode
deixar um destino vazio ou parcial. Esses arquivos só são aceitos na retomada se
coincidirem exatamente com a origem; não são apagados ou substituídos.

Projetos já protegidos continuam somente leitura na Web. Comparar e manter um
arquivo idêntico não é uma escrita; acrescentar arquivos nesse projeto continua
proibido, inclusive se uma tentativa anterior já importou seu manifesto. Uma
recuperação mais ampla requer registro persistente e regras de propriedade, além
de testes de falha e alterações externas; não foi simulada com exclusão automática.

A interface informa os totais sem ocultá-los por existir um rascunho aberto e
mantém a edição/histórico. A retomada não grava uma preferência permanente e exige
nova seleção da origem após recarregar. Os contratos Rust/IPC, banco e fluxo de
adoção de pasta no Desktop não mudam.
