import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { I18nProvider } from './i18n'
import { DialogosProvider } from './ui'
import './styles.css'

// Se registra el service worker y, muy importante, se le pide que se actualice: quien ya tenía
// Cample instalada de antes lleva la versión vieja, la que no sabía nada de avisos. Sin este
// `update()` se quedaría con ella y los avisos llegarían en blanco.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker
      .register('/sw.js')
      .then((r) => r.update().catch(() => {}))
      .catch(() => {}),
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <DialogosProvider>
          <App />
        </DialogosProvider>
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>,
)
