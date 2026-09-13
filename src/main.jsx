import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
/* ORDINEA CELOR DOUA IMPORTURI DE CSS CONTEAZA — nu le inversa.
   Ambele definesc :root cu variabile care se suprapun (--bg, --border,
   --text, --accent, --shadow), iar cele din pms.css trebuie sa castige:
   index.css a ramas din sablonul de pornire Vite si are alte valori
   (accentul lui e mov, #aa3bff). Pana pe 21 august 2026 stilurile erau
   injectate cu <style> din interiorul arborelui React, deci veneau
   automat dupa; acum ordinea e data explicit, aici. */
import './index.css'
import './styles/pms.css'
import App from './App.jsx'
import { instaleazaCapturaErori, creeazaColector } from './lib/erori-productie.js'
import { scrieInJurnalTacut } from './lib/audit.js'

/* Erorile neprinse (script, promisiune fara catch) ajung in jurnalul din
   activity_log — faza 2, D7. Instalat INAINTE de prima randare, ca sa prinda
   si un esec de pornire; scrierea reuseste doar dupa autentificare (RLS), dar
   dedupe-ul si plafonul sunt in colector, nu in baza. */
instaleazaCapturaErori(window, creeazaColector({ scrie: scrieInJurnalTacut }))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
