import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const rootElement = document.getElementById('root')
if (rootElement?.querySelector('[data-seo-fallback=\"true\"]')) {
  rootElement.innerHTML = ''
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
