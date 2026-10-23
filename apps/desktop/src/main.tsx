import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@cosmos/i18n';
import { Foundation } from '@cosmos/ui';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <Foundation />
  </StrictMode>,
);
