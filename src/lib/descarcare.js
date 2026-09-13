/* Descarcarea unui fisier text din browser (CSV, XML): un link temporar
 * cu URL de blob, apasat si sters. Pana in faza 3 (C6) statea in
 * features/facturare.jsx (downloadTextFile) — mutata aici ca s-o poata
 * folosi si Rapoartele fara sa traga tot ecranul de facturare.
 *
 * `bom`: marcajul UTF-8 de la inceput, ca Excel sa citeasca diacriticele
 * dintr-un CSV; la XML nu e nevoie.
 */
export const BOM_UTF8 = "﻿";

export function descarcaText(text, numeFisier, mime = "text/plain;charset=utf-8", { bom = false } = {}) {
  const blob = new Blob([bom ? BOM_UTF8 + text : text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = numeFisier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
