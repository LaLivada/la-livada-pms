import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../src/guest/App.jsx";
import { STILURI } from "../src/guest/styles.js";

/* Stilurile intra dintr-un <style>, nu dintr-un fisier CSS: pagina se
   deschide pe date mobile, in fata usii, si un fisier separat ar fi inca un
   dus-intors inainte ca ceva sa se vada pe ecran. Sunt cateva kiloocteti. */
const stil = document.createElement("style");
stil.textContent = STILURI;
document.head.appendChild(stil);

createRoot(document.getElementById("oaspete")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
