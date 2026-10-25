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
      exportVault: 'Exportar cofre (.zip)',
      editor: 'Editor Markdown',
      chooseNote: 'Um espaço para pensar',
      save: 'Salvar',
      saved: 'Salvo no cofre.',
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
      discardPrompt: 'Há alterações não salvas. Descartar e continuar?',
      conflict:
        'O arquivo mudou desde que foi aberto. Sua edição foi preservada aqui. Baixe uma cópia antes de recarregar e comparar as versões.',
      external_changed:
        'Esta nota foi alterada fora do COSMOS. Seu rascunho foi preservado. Baixe uma cópia antes de recarregar e comparar.',
      external_missing:
        'Esta nota foi removida ou movida fora do COSMOS. O texto continua aqui para você baixar uma cópia.',
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
      exportVault: 'Export vault (.zip)',
      editor: 'Markdown editor',
      chooseNote: 'A space to think',
      save: 'Save',
      saved: 'Saved to vault.',
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
      discardPrompt: 'There are unsaved changes. Discard and continue?',
      conflict:
        'The file changed since it was opened. Your edit is still here. Download a copy before reloading and comparing versions.',
      external_changed:
        'This note changed outside COSMOS. Your draft was preserved. Download a copy before reloading and comparing.',
      external_missing:
        'This note was removed or moved outside COSMOS. Its text is still here so you can download a copy.',
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
