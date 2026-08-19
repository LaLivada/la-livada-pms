/* Validări pure (fără React, fără rețea) — testabile direct.
 *
 * Deocamdată doar CUI-ul; e locul firesc pentru orice altă validare de
 * date fiscale/personale care apare mai târziu (CNP, IBAN, cod poștal).
 */

/* Verifica formatul si cifra de control a unui CUI/CIF romanesc.
   Algoritmul oficial: ultima cifra e cifra de control, calculata din
   primele cifre (aduse la 9 cifre prin completare cu 0 la stanga)
   ponderate cu cheia 7-5-3-2-1-7-5-3-2, mod 11 (10 -> 0). Doar avertizam
   la esec de control (nu blocam) — blocam doar formatul evident gresit
   (altceva decat cifre, sau lungime in afara 2-10). */
export function validateCUIFormat(raw) {
  const digits = String(raw || "").toUpperCase().replace(/^RO/, "").trim();
  if (!digits) return { ok: true, warn: false };
  if (!/^\d{2,10}$/.test(digits)) return { ok: false, warn: false, message: "CUI-ul trebuie să conțină doar cifre (2-10 cifre), opțional cu prefixul RO." };
  const key = "753217532";
  const base = digits.slice(0, -1).padStart(9, "0");
  const control = Number(digits.slice(-1));
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(base[i]) * Number(key[i]);
  let computed = (sum * 10) % 11;
  if (computed === 10) computed = 0;
  return { ok: true, warn: computed !== control, message: "Cifra de control nu se potrivește — verifică CUI-ul." };
}
