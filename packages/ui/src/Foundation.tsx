import { i18n } from '@cosmos/i18n';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Foundation.module.css';
import './tokens.css';

/** F0 functional build shell, not the final UI or a working vault. */
export function Foundation() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<'nyx' | 'hemera'>('nyx');
  return (
    <div className={styles.root} data-theme={theme}>
      <header className={styles.header}>
        <span className={styles.wordmark}>COSMOS</span>
        <div className={styles.controls}>
          <label>
            {t('language')}
            <select
              value={i18n.language}
              onChange={(event) => {
                const language = event.target.value;
                document.documentElement.lang = language;
                void i18n.changeLanguage(language);
              }}
            >
              <option value="pt-BR">Português</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            {t('theme')}
            <select
              value={theme}
              onChange={(event) =>
                setTheme(event.target.value as 'nyx' | 'hemera')
              }
            >
              <option value="nyx">{t('dark')}</option>
              <option value="hemera">{t('light')}</option>
            </select>
          </label>
        </div>
      </header>
      <main className={styles.main}>
        <p className={styles.eyebrow}>{t('status')}</p>
        <h1>
          {t('tagline')}
          <br />
          <span>{t('subtitle')}</span>
        </h1>
        <p className={styles.description}>{t('description')}</p>
        <div className={styles.pillars}>
          <section>
            <span aria-hidden="true">Ⅰ</span>
            <h2>{t('knowledge')}</h2>
            <p>{t('knowledgeText')}</p>
          </section>
          <section>
            <span aria-hidden="true">Ⅱ</span>
            <h2>{t('memory')}</h2>
            <p>{t('memoryText')}</p>
          </section>
        </div>
      </main>
      <footer className={styles.footer}>{t('footer')}</footer>
    </div>
  );
}
