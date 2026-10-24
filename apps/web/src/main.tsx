import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@cosmos/i18n';
import { Workspace } from '@cosmos/ui';

import { platform } from './vault';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <Workspace platform={platform} />
  </StrictMode>,
);
