import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../src/guest/App.jsx";
import { STILURI } from "../src/guest/styles.js";
import { pregatesteManifestul } from "../src/guest/instalare.js";

/* Stilurile intra dintr-un <style>, nu dintr-un fisier CSS: pagina se
   deschide pe date mobile, in fata usii, si un fisier separat ar fi inca un
   dus-intors inainte ca ceva sa se vada pe ecran. Sunt cateva kiloocteti. */
const stil = document.createElement("style");
stil.textContent = STILURI;
document.head.appendChild(stil);

/* Inainte de render, nu dintr-o componenta: Chrome verifica manifestul o
   data, la scurt timp dupa incarcare, si abia dupa aceea trimite
   `beforeinstallprompt`. Pus mai tarziu, ar ajunge dupa verificare. */
pregatesteManifestul();

createRoot(document.getElementById("oaspete")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
