# ADR 0006 — Progresso persistente das importações Web

Estado: incremento de F1 em 2026-10-26; rollback e reparo de arquivos parciais pendentes.
Referências: plano mestre §§12.6 e 25; [retomada conservadora](0005-retomada-importacao-web.md)
e [limites de F1](../fase-1.md).

A retomada por comparação de bytes não mostrava o progresso após fechar uma aba
ou interromper uma escrita. Introduzimos um registro local fora do cofre, em
IndexedDB (`cosmos-imports`, versão 1), separado do journal nativo e dos rascunhos.
Pastas reais reutilizam a identidade por `FileSystemHandle.isSameEntry`; o cofre
OPFS usa sua identidade fixa. Um nome de pasta não identifica seu histórico.

Após validar e ler toda a seleção, a importação confirma o registro inicial antes
de modificar o cofre. Transações IndexedDB solicitam durabilidade `strict` e só
retornam após `oncomplete`. A marca `writing` precede cada tentativa; `written`
só é registrada depois de fechar o escritor e confirmar a transação de progresso.
Os estados `pending` e `kept` distinguem arquivos ainda não tentados dos existentes
que já coincidiram byte a byte com a origem. Uma escrita com confirmação perdida
permanece incerta, mesmo que seus bytes já estejam completos no destino.

As entradas por arquivo ficam em uma store separada, indexada pela operação.
Cada avanço atualiza uma entrada e o cabeçalho na mesma transação, sem reescrever
um manifesto de até 10 mil arquivos a cada escrita. Até 20 registros pendentes
por cofre limitam o acúmulo. Falha inicial no registro bloqueia a importação antes
de escrever; falha posterior para a sequência sem apagar o progresso anterior.
Os limites de armazenamento e durabilidade do navegador continuam aplicáveis.

A identidade da seleção é SHA-256 sobre a lista ordenada de caminhos, tamanhos e
hashes dos bytes originais. Não inclui ordem do ZIP, nome do arquivo ZIP ou estado
de progresso. Somente após verificar/importar toda a mesma seleção são removidos,
em uma transação, seus registros anteriores e o atual. Outra seleção não limpa
essas evidências. Isso não cria uma transação atômica sobre o cofre, nem elimina
as corridas com editores externos descritas na ADR 0005.

A UI permite listar, baixar relatório JSON e esquecer registros com confirmação.
Ler/esquecer exige escopo e versão atuais. Todas essas operações usam o mesmo
Web Lock das importações; uma aba não descarta o registro de outra ainda escrevendo.
Esquecer remove apenas cabeçalho e entradas locais, nunca arquivos do cofre.
Relatórios incluem caminhos relativos, datas, tamanhos, hashes e estados, sem
conteúdo das notas ou anexos. Não são incorporados ao ZIP do cofre nem enviados
para serviços externos. Limpar o perfil do navegador perde esses registros.

Um registro é evidência de progresso, não autorização para apagar ou substituir
arquivos. Não deduzimos propriedade a partir de nome, tamanho, hash ou marca
`written`. Recuperação automática/rollback exigirão decisões próprias sobre
propriedade, revisões e conflitos. A retomada permanece condicionada à seleção
explícita da origem e aos limites dos projetos protegidos. Não há mudanças nos
contratos Rust/IPC, no banco nativo ou na adoção de pastas pelo Desktop.

## Conferência do estado atual — 2026-10-27

O painel passa a oferecer uma conferência somente leitura dos caminhos de um
registro. O estado da tentativa (`pending`, `kept`, `writing`, `written`) é mantido
separado da observação atual (`matching`, `different`, `missing`, `incompatible`,
`unreadable`). Comparamos tamanho e SHA-256 com a origem registrada; não precisamos
reabrir a origem nem interpretar o conteúdo dos arquivos. Uma diferença não é
classificada automaticamente como corrupção, pois pode ser uma edição do usuário.

Antes de acessar arquivos, validamos caminhos portáveis, unicidade, tamanhos,
estados/contadores e a identidade da seleção, além do escopo e versão já exigidos
pelo journal. Essa validação recusa metadados inconsistentes em vez de usá-los
para orientar acesso a arquivos. Arquivos com tamanho diferente são classificados
sem ler seus bytes; os limites da seleção original permanecem aplicáveis.

A operação usa o mesmo Web Lock das importações e não escreve no cofre ou journal.
A conferência tem horários de início e conclusão e pode ficar desatualizada; não
prometemos uma visão atômica diante de editores externos. O resultado é transitório
na UI, com filtros e paginação de 50 linhas. O relatório JSON de conferência,
formato 1, inclui a seleção registrada e a observação de todos os caminhos, sem
conteúdo de notas/anexos. A paginação não limita o relatório baixado.

Conferir novamente exige a versão atual do registro. Uma conferência antiga não
é convertida em autorização para modificar arquivos, e um arquivo atualmente
idêntico não ganha automaticamente uma confirmação retroativa no journal.
Continuam pendentes propriedade, rollback e reparo de arquivos parciais.
Não há migração do IndexedDB nem alteração dos contratos Rust/IPC.
