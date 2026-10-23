import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
export const resources = {
  'pt-BR': {
    translation: {
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
