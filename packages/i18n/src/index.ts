import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
export const resources = {
  'pt-BR': {
    translation: {
      openBrowser: 'Usar cofre no navegador',
      openVault: 'Escolher cofre',
      openFolder: 'Abrir pasta do computador',
      browserStorage:
        'Os arquivos ficam neste navegador. Exporte uma cópia regularmente: limpar os dados do site também remove o cofre local.',
      notes: 'Notas',
      yourVault: 'Seu universo',
      search: 'Buscar',
      emptyVault: 'Seu cofre está vazio. Crie a primeira nota.',
      noResults: 'Nenhuma nota encontrada.',
      create: 'Criar',
      note: 'Nota',
      project: 'Projeto',
      universe: 'Universo',
      projectName: 'Nome do projeto',
      notePath: 'Caminho da nota',
      createProject: 'Criar projeto',
      createNote: 'Criar nota',
      refresh: 'Atualizar lista',
      closeVault: 'Fechar cofre',
      importFolder: 'Importar pasta',
      importZip: 'Importar ZIP',
      folderImportHint:
        'O navegador pode omitir arquivos ocultos. Para preservar .obsidian, use ZIP.',
      imported: 'Importação concluída sem alterar os originais.',
      resumeImport: 'Retomar importação',
      pendingImports: 'Importações pendentes',
      inspectImport: 'Conferir arquivos',
      importRecordInvalid:
        'O registro contém dados inconsistentes. Baixe o relatório para revisão antes de tentar novamente.',
      importInspection: 'Conferência dos arquivos',
      importInspectionTime: 'Conferência concluída em {{time}}.',
      importInspectionHint:
        'Compara os arquivos salvos no cofre com a origem registrada na importação. Os arquivos podem mudar depois; confira novamente antes de recuperar. Diferenças também podem ser edições suas.',
      importInspectionFilter: 'Mostrar arquivos',
      importInspectionAll: 'Todos',
      importInspectionFiles: 'Arquivos conferidos',
      importInspectionPath: 'Caminho',
      importInspectionRecorded: 'Registro',
      importInspectionCurrent: 'Agora',
      importInspectionRange: 'Arquivos {{start}}–{{end}} de {{total}}',
      importInspectionPrevious: 'Página anterior',
      importInspectionNext: 'Próxima página',
      downloadImportInspection: 'Baixar conferência',
      importCurrent_matching: 'Idêntico à origem',
      importCurrent_different: 'Diferente da origem',
      importCurrent_missing: 'Ausente',
      importCurrent_incompatible: 'Caminho incompatível',
      importCurrent_unreadable: 'Não foi possível ler',
      importRecorded_pending: 'Não tentado',
      importRecorded_kept: 'Mantido por igualdade',
      importRecorded_writing: 'Sem confirmação',
      importRecorded_written: 'Confirmado',
      pendingImportsHint:
        'Confira o progresso registrado e selecione novamente a origem com Retomar importação. O relatório contém caminhos e verificações dos arquivos, sem o conteúdo das notas.',
      refreshImports: 'Atualizar importações',
      checkingImports: 'Consultando importações…',
      noPendingImports: 'Nenhuma importação pendente registrada.',
      importProgress:
        'Confirmados: {{imported}} · Idênticos mantidos: {{skipped}} · Sem confirmação: {{remaining}}',
      importUnconfirmedPath: 'Última tentativa sem confirmação: {{path}}',
      downloadImportReport: 'Baixar relatório da importação',
      forgetImportRecord: 'Esquecer registro',
      forgetImportPrompt:
        'Esquecer este registro de progresso? Os arquivos do cofre serão mantidos. Baixe o relatório antes se quiser guardar esses detalhes.',
      importRecordChanged:
        'O registro da importação mudou ou já foi concluído. Atualize a lista antes de tentar novamente.',
      importRecordLimit:
        'Há 20 registros pendentes neste cofre. Confira e baixe os relatórios antes de esquecer registros antigos para iniciar outra importação.',
      importHistoryUnavailable:
        'Não foi possível acessar ou atualizar os registros de importação. Confira as importações pendentes e o armazenamento do navegador antes de tentar novamente.',
      resumeImportHint:
        'Selecione novamente o ZIP ou a pasta de origem. Arquivos idênticos serão mantidos; diferenças impedem a retomada.',
      importResumed:
        'Importação retomada: {{imported}} arquivo(s) adicionado(s), {{skipped}} idêntico(s) mantido(s).',
      importConflict:
        'A retomada encontrou um arquivo diferente ou um caminho incompatível: {{path}}. O destino foi preservado. Confira a origem e o cofre antes de tentar novamente.',
      importLimit:
        'Importe até 10 mil arquivos e 256 MiB por vez (tamanho descomprimido).',
      exportVault: 'Exportar cofre (.zip)',
      editor: 'Editor Markdown',
      viewMode: 'Modo de visualização',
      view_edit: 'Editar',
      view_live: 'Edição visual',
      taskCheckbox: 'Tarefa',
      tableSource: 'Mostrar Markdown da tabela',
      livePreviewHint:
        'Títulos, formatação, tabelas e caixas de tarefas aparecem no editor. Marcar uma tarefa altera o rascunho; salve para gravar. Os marcadores ficam visíveis nas linhas em edição ou selecionadas.',
      livePreviewTooLarge:
        'A edição visual está limitada a 256 mil unidades de texto. Esta nota permanece disponível em Markdown.',
      view_read: 'Ler',
      view_split: 'Edição e leitura',
      markdownPreview: 'Leitura Markdown',
      callout_note: 'Nota',
      callout_abstract: 'Resumo',
      callout_info: 'Informação',
      callout_todo: 'A fazer',
      callout_tip: 'Dica',
      callout_success: 'Sucesso',
      callout_question: 'Pergunta',
      callout_warning: 'Aviso',
      callout_failure: 'Falha',
      callout_danger: 'Perigo',
      callout_bug: 'Erro',
      callout_example: 'Exemplo',
      callout_quote: 'Citação',
      previewTooLarge:
        'Esta nota é grande demais para a pré-visualização. Continue no modo Editar.',
      sectionNotFound:
        'A seção indicada pelo link não foi encontrada nesta nota.',
      blockNotFound:
        'O bloco indicado pelo link não foi encontrado ou seu identificador está repetido nesta nota.',
      openPdf: 'Abrir PDF',
      pdfReader: 'Leitor de PDF',
      closePdf: 'Fechar PDF',
      pdfPages: 'Páginas do PDF',
      pdfPrevious: 'Página anterior',
      pdfNext: 'Próxima página',
      pdfPage: 'Página {{page}} de {{total}}',
      pdfPageImage: 'Página {{page}} do PDF',
      pdfLoading: 'Carregando PDF…',
      pdfFailed:
        'Não foi possível exibir este PDF. O arquivo pode estar inválido ou usar recursos ainda não suportados.',
      pdfUnresolved: 'O PDF não foi encontrado ou o caminho é ambíguo.',
      pdfTooLarge: 'O PDF excede o limite de 16 MiB.',
      pdfPageLimit: 'O PDF excede o limite de 2.000 páginas.',
      pdfPageMissing: 'A página indicada não existe neste PDF.',
      pdfPassword: 'PDFs protegidos por senha ainda não são suportados.',
      pdfHint:
        'Visualização local, somente leitura. Feche e abra novamente para ver alterações no arquivo.',
      pdfText: 'Texto da página',
      pdfTextHint:
        'Texto extraído, limitado a 250 mil caracteres por página. A ordem de leitura depende do documento; não há OCR.',
      pdfNoText: 'Esta página não contém texto extraível.',
      image: 'Imagem',
      imageNotDisplayed: 'Imagem: {{name}} (formato ou endereço não suportado)',
      showImage: 'Mostrar imagem: {{name}}',
      hideImage: 'Ocultar imagem: {{name}}',
      cancelImage: 'Cancelar imagem: {{name}}',
      imageLoading: 'Carregando imagem do cofre…',
      imageTooLarge: 'A imagem excede o limite de 8 MiB.',
      imageUnresolved:
        'A imagem não foi encontrada ou seu nome é ambíguo no cofre.',
      imageFailed:
        'Não foi possível exibir a imagem. Confira o arquivo e tente novamente.',
      taskDone: 'Tarefa concluída',
      taskPending: 'Tarefa pendente',
      chooseNote: 'Um espaço para pensar',
      save: 'Salvar',
      saved: 'Salvo no cofre.',
      saveCopy: 'Salvar cópia como…',
      confirmCopy: 'Criar cópia',
      copyHint:
        'Escolha um novo caminho .md dentro do cofre. A cópia guarda o texto atual; a nota original e o rascunho permanecem como estão.',
      copySaved: 'Cópia salva em {{path}}. A nota em edição foi mantida.',
      copySamePath: 'Escolha um caminho diferente da nota original.',
      copyInvalidPath:
        'Use um caminho .md válido dentro do cofre, fora das pastas reservadas.',
      copyTooLarge:
        'O texto excede o limite de 8 MiB por nota. Baixe a edição para preservá-la.',
      downloadNote: 'Baixar nota',
      working: 'Processando…',
      unsaved: 'Alterações não salvas',
      memoryReadOnly:
        'A memória de projetos é somente leitura na Web. Use o Desktop para editar.',
      connections: 'Conexões',
      outgoingLinks: 'Links desta nota',
      backlinks: 'Referências a esta nota',
      unresolved: 'não resolvido',
      noLinks: 'Nenhuma conexão ainda.',
      startWriting: 'Escolha uma nota ou crie algo novo.',
      discardPrompt: 'Há alterações não salvas. Sair da nota mesmo assim?',
      localDrafts: 'Rascunhos locais',
      draftsHint:
        'Cópias neste dispositivo, separadas das notas. Recuperar mantém o rascunho original até você excluí-lo.',
      refreshDrafts: 'Atualizar rascunhos',
      recoverDraft: 'Recuperar rascunho',
      downloadDraft: 'Baixar rascunho',
      discardDraft: 'Excluir rascunho',
      discardDraftPrompt:
        'Excluir esta cópia local? A nota do cofre não será alterada.',
      draftProtected: 'Rascunho protegido neste dispositivo.',
      draftProtecting: 'Protegendo rascunho…',
      draftProtectionFailed:
        'Não foi possível proteger ou consultar os rascunhos locais. Baixe sua edição antes de sair.',
      retryDrafts: 'Tentar proteger novamente',
      draftChanged:
        'Este rascunho mudou em outra janela. Atualize a lista antes de continuar.',
      draftRecovered:
        'Rascunho recuperado. Revise o texto antes de salvar no cofre.',
      conflict:
        'O arquivo mudou desde que foi aberto. Sua edição foi preservada aqui. Salve ou baixe uma cópia antes de recarregar e comparar as versões.',
      external_changed:
        'Esta nota foi alterada fora do COSMOS. Seu rascunho foi preservado. Salve ou baixe uma cópia antes de recarregar e comparar.',
      external_missing:
        'Esta nota foi removida ou movida fora do COSMOS. O texto continua aqui para você salvar ou baixar uma cópia.',
      external_unreadable:
        'Não foi possível ler a versão atual desta nota. O texto aberto foi preservado.',
      monitorUnavailable:
        'A atualização automática está indisponível. Você ainda pode atualizar a lista e recarregar notas manualmente.',
      monitorUnreadable:
        'Algumas notas não puderam ser lidas. A atualização automática tentará novamente.',
      reloadNote: 'Recarregar do cofre',
      operationFailed: 'Não foi possível concluir.',
      moveNote: 'Mover nota',
      trashNote: 'Enviar à lixeira',
      trashTitle: 'Lixeira',
      emptyTrash: 'A lixeira está vazia.',
      destinationPath: 'Caminho de destino',
      restorePath: 'Restaurar para',
      restoreNote: 'Restaurar nota',
      confirmMove: 'Confirmar mudança',
      confirmTrash: 'Confirmar envio à lixeira',
      trashPrompt:
        'Enviar “{{path}}” à lixeira? Você poderá restaurar a nota depois.',
      moved: 'Nota movida.',
      trashed: 'Nota enviada à lixeira.',
      restored: 'Nota restaurada.',
      destinationExists:
        'Já existe um arquivo ou pasta nesse destino. Escolha outro caminho.',
      structureProtected:
        'Os documentos de um projeto podem ser editados, mas sua estrutura é protegida contra mudanças de caminho e exclusão.',
      saveBeforeOrganizing:
        'Salve suas alterações antes de mover a nota ou enviá-la à lixeira.',
      moveLinksHint:
        'Mover uma nota preserva seu conteúdo. Os links escritos em outras notas não são alterados automaticamente.',
      cancel: 'Cancelar',

      tagline: 'Toda ideia nasce no Caos.',
      subtitle: 'O Cosmos é a ordem que você dá a ela.',
      description:
        'Um lugar para suas notas, ideias e a memória dos seus projetos.',
      status: 'Em construção',
      language: 'Idioma',
      theme: 'Tema',
      dark: 'Nyx · Noite',
      light: 'Hēmérā · Dia',
      knowledge: 'Conhecimento',
      knowledgeText: 'Suas ideias conectadas, em Markdown.',
      memory: 'Memória de projetos',
      memoryText: 'Um projeto. Uma memória. Qualquer modelo. Qualquer sessão.',
      footer: 'Seu conhecimento, sob seu controle.',
    },
  },
  en: {
    translation: {
      openBrowser: 'Use browser vault',
      openVault: 'Choose vault',
      openFolder: 'Open computer folder',
      browserStorage:
        'Files stay in this browser. Export a copy regularly: clearing site data also removes the local vault.',
      notes: 'Notes',
      yourVault: 'Your universe',
      search: 'Search',
      emptyVault: 'Your vault is empty. Create your first note.',
      noResults: 'No notes found.',
      create: 'Create',
      note: 'Note',
      project: 'Project',
      universe: 'Universe',
      projectName: 'Project name',
      notePath: 'Note path',
      createProject: 'Create project',
      createNote: 'Create note',
      refresh: 'Refresh list',
      closeVault: 'Close vault',
      importFolder: 'Import folder',
      importZip: 'Import ZIP',
      folderImportHint:
        'Your browser may omit hidden files. Use ZIP to preserve .obsidian.',
      imported: 'Import complete without changing the originals.',
      resumeImport: 'Resume import',
      pendingImports: 'Pending imports',
      inspectImport: 'Check files',
      importRecordInvalid:
        'The record contains inconsistent data. Download the report for review before trying again.',
      importInspection: 'File check',
      importInspectionTime: 'Check completed at {{time}}.',
      importInspectionHint:
        'Compares saved vault files with the source recorded during import. Files may change afterward; check again before recovery. Differences may also be your edits.',
      importInspectionFilter: 'Show files',
      importInspectionAll: 'All',
      importInspectionFiles: 'Checked files',
      importInspectionPath: 'Path',
      importInspectionRecorded: 'Recorded',
      importInspectionCurrent: 'Now',
      importInspectionRange: 'Files {{start}}–{{end}} of {{total}}',
      importInspectionPrevious: 'Previous page',
      importInspectionNext: 'Next page',
      downloadImportInspection: 'Download file check',
      importCurrent_matching: 'Matches source',
      importCurrent_different: 'Differs from source',
      importCurrent_missing: 'Missing',
      importCurrent_incompatible: 'Incompatible path',
      importCurrent_unreadable: 'Could not read',
      importRecorded_pending: 'Not attempted',
      importRecorded_kept: 'Kept as identical',
      importRecorded_writing: 'Unconfirmed',
      importRecorded_written: 'Confirmed',
      pendingImportsHint:
        'Review the recorded progress and select the source again with Resume import. Reports contain paths and file checks, without note contents.',
      refreshImports: 'Refresh imports',
      checkingImports: 'Checking imports…',
      noPendingImports: 'No pending import recorded.',
      importProgress:
        'Confirmed: {{imported}} · Identical files kept: {{skipped}} · Unconfirmed: {{remaining}}',
      importUnconfirmedPath: 'Last unconfirmed attempt: {{path}}',
      downloadImportReport: 'Download import report',
      forgetImportRecord: 'Forget record',
      forgetImportPrompt:
        'Forget this progress record? Vault files will be kept. Download the report first if you want to retain these details.',
      importRecordChanged:
        'The import record changed or was already completed. Refresh the list before trying again.',
      importRecordLimit:
        'This vault has 20 pending records. Review and download reports before forgetting old records to start another import.',
      importHistoryUnavailable:
        'Import records could not be accessed or updated. Check pending imports and browser storage before trying again.',
      resumeImportHint:
        'Select the source ZIP or folder again. Identical files will be kept; differences prevent resuming.',
      importResumed:
        'Import resumed: {{imported}} file(s) added, {{skipped}} identical file(s) kept.',
      importConflict:
        'The retry found a different file or an incompatible path: {{path}}. The destination was preserved. Check the source and vault before trying again.',
      importLimit:
        'Import up to 10,000 files and 256 MiB at a time (uncompressed size).',
      exportVault: 'Export vault (.zip)',
      editor: 'Markdown editor',
      viewMode: 'View mode',
      view_edit: 'Edit',
      view_live: 'Visual editing',
      taskCheckbox: 'Task',
      tableSource: 'Show table Markdown',
      livePreviewHint:
        'Headings, formatting, tables and task checkboxes appear in the editor. Toggling a task changes the draft; save to write it. Markers remain visible on edited or selected lines.',
      livePreviewTooLarge:
        'Visual editing is limited to 256 thousand text units. This note remains available as Markdown.',
      view_read: 'Read',
      view_split: 'Edit and read',
      markdownPreview: 'Markdown preview',
      callout_note: 'Note',
      callout_abstract: 'Abstract',
      callout_info: 'Info',
      callout_todo: 'To do',
      callout_tip: 'Tip',
      callout_success: 'Success',
      callout_question: 'Question',
      callout_warning: 'Warning',
      callout_failure: 'Failure',
      callout_danger: 'Danger',
      callout_bug: 'Bug',
      callout_example: 'Example',
      callout_quote: 'Quote',
      previewTooLarge:
        'This note is too large to preview. Continue in Edit mode.',
      sectionNotFound: 'The linked section was not found in this note.',
      blockNotFound:
        'The linked block was not found or its identifier is repeated in this note.',
      openPdf: 'Open PDF',
      pdfReader: 'PDF reader',
      closePdf: 'Close PDF',
      pdfPages: 'PDF pages',
      pdfPrevious: 'Previous page',
      pdfNext: 'Next page',
      pdfPage: 'Page {{page}} of {{total}}',
      pdfPageImage: 'PDF page {{page}}',
      pdfLoading: 'Loading PDF…',
      pdfFailed:
        'This PDF could not be displayed. The file may be invalid or use unsupported features.',
      pdfUnresolved: 'The PDF was not found or its path is ambiguous.',
      pdfTooLarge: 'The PDF exceeds the 16 MiB limit.',
      pdfPageLimit: 'The PDF exceeds the 2,000-page limit.',
      pdfPageMissing: 'The requested page does not exist in this PDF.',
      pdfPassword: 'Password-protected PDFs are not supported yet.',
      pdfHint:
        'Local, read-only preview. Close and reopen to see file changes.',
      pdfText: 'Page text',
      pdfTextHint:
        'Extracted text, limited to 250,000 characters per page. Reading order depends on the document; OCR is unavailable.',
      pdfNoText: 'This page has no extractable text.',
      image: 'Image',
      imageNotDisplayed: 'Image: {{name}} (unsupported format or address)',
      showImage: 'Show image: {{name}}',
      hideImage: 'Hide image: {{name}}',
      cancelImage: 'Cancel image: {{name}}',
      imageLoading: 'Loading image from the vault…',
      imageTooLarge: 'The image exceeds the 8 MiB limit.',
      imageUnresolved:
        'The image was not found or its name is ambiguous in the vault.',
      imageFailed:
        'The image could not be displayed. Check the file and try again.',
      taskDone: 'Completed task',
      taskPending: 'Pending task',
      chooseNote: 'A space to think',
      save: 'Save',
      saved: 'Saved to vault.',
      saveCopy: 'Save copy as…',
      confirmCopy: 'Create copy',
      copyHint:
        'Choose a new .md path inside the vault. The copy saves the current text; the original note and local draft stay as they are.',
      copySaved: 'Copy saved to {{path}}. The source note remains open.',
      copySamePath: 'Choose a different path from the original note.',
      copyInvalidPath:
        'Use a valid .md path inside the vault, outside reserved folders.',
      copyTooLarge:
        'The text exceeds the 8 MiB note limit. Download your edit to preserve it.',
      downloadNote: 'Download note',
      working: 'Working…',
      unsaved: 'Unsaved changes',
      memoryReadOnly:
        'Project memory is read-only on the Web. Use Desktop to edit.',
      connections: 'Connections',
      outgoingLinks: 'Links in this note',
      backlinks: 'References to this note',
      unresolved: 'unresolved',
      noLinks: 'No connections yet.',
      startWriting: 'Choose a note or create something new.',
      discardPrompt: 'You have unsaved changes. Leave this note anyway?',
      localDrafts: 'Local drafts',
      draftsHint:
        'Copies on this device, separate from the notes. Recovery keeps the original draft until you delete it.',
      refreshDrafts: 'Refresh drafts',
      recoverDraft: 'Recover draft',
      downloadDraft: 'Download draft',
      discardDraft: 'Delete draft',
      discardDraftPrompt:
        'Delete this local copy? The vault note will not be changed.',
      draftProtected: 'Draft protected on this device.',
      draftProtecting: 'Protecting draft…',
      draftProtectionFailed:
        'Local drafts could not be protected or loaded. Download your edit before leaving.',
      retryDrafts: 'Retry draft protection',
      draftChanged:
        'This draft changed in another window. Refresh the list before continuing.',
      draftRecovered: 'Draft recovered. Review it before saving to the vault.',
      conflict:
        'The file changed since it was opened. Your edit is still here. Save or download a copy before reloading and comparing versions.',
      external_changed:
        'This note changed outside COSMOS. Your draft was preserved. Save or download a copy before reloading and comparing.',
      external_missing:
        'This note was removed or moved outside COSMOS. Its text is still here so you can save or download a copy.',
      external_unreadable:
        'The current version of this note could not be read. The open text was preserved.',
      monitorUnavailable:
        'Automatic updates are unavailable. You can still refresh the list and reload notes manually.',
      monitorUnreadable:
        'Some notes could not be read. Automatic updates will retry.',
      reloadNote: 'Reload from vault',
      operationFailed: 'Could not complete the operation.',
      moveNote: 'Move note',
      trashNote: 'Move to trash',
      trashTitle: 'Trash',
      emptyTrash: 'The trash is empty.',
      destinationPath: 'Destination path',
      restorePath: 'Restore to',
      restoreNote: 'Restore note',
      confirmMove: 'Confirm move',
      confirmTrash: 'Confirm move to trash',
      trashPrompt: 'Move “{{path}}” to the trash? You can restore it later.',
      moved: 'Note moved.',
      trashed: 'Note moved to trash.',
      restored: 'Note restored.',
      destinationExists:
        'A file or folder already exists at that destination. Choose another path.',
      structureProtected:
        'Project documents can be edited, but their structure is protected against moving and deletion.',
      saveBeforeOrganizing:
        'Save your changes before moving this note or sending it to the trash.',
      moveLinksHint:
        'Moving a note preserves its contents. Links written in other notes are not updated automatically.',
      cancel: 'Cancel',

      tagline: 'Every idea begins in Chaos.',
      subtitle: 'Cosmos is the order you give it.',
      description: 'A place for your notes, ideas, and project memory.',
      status: 'Under construction',
      language: 'Language',
      theme: 'Theme',
      dark: 'Nyx · Night',
      light: 'Hēmérā · Day',
      knowledge: 'Knowledge',
      knowledgeText: 'Your ideas connected, in Markdown.',
      memory: 'Project memory',
      memoryText: 'One project. One memory. Any model. Any session.',
      footer: 'Your knowledge, under your control.',
    },
  },
};
void i18n.use(initReactI18next).init({
  resources,
  lng: 'pt-BR',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export { i18n };
