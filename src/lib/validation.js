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

/* Verifica un numar de telefon local, asa cum e tastat DUPA prefixul de
   tara (PhoneDialPicker separa cele doua). Gol e valid — telefonul poate
   fi optional, dupa formular; obligativitatea se verifica separat.

   `dial` e optional: cand vine (formularele cu selector de prefix),
   activeaza si verificarea celei mai frecvente greseli gasite in
   productie — un "0" tastat dupa ce prefixul a fost deja ales
   ("+40 0722 111 222" in loc de "+40 722 111 222", numar care nu suna
   niciodata). Fara `dial` (formulare cu telefon liber, fara prefix
   separat), acel 0 e un numar local romanesc normal, nu o greseala. */
export function validatePhone(local, dial = "") {
  const l = String(local || "").trim();
  if (!l) return { ok: true, warn: false };
  const cifre = l.replace(/[\s().-]/g, "");
  if (!/^\d+$/.test(cifre)) {
    return { ok: false, warn: false, message: "Numărul de telefon poate conține doar cifre (și spații)." };
  }
  if (dial && cifre.startsWith("0")) {
    return {
      ok: false, warn: false,
      message: `Nu pune 0 la începutul numărului — prefixul ${dial} îl înlocuiește deja. Scrie doar restul cifrelor (ex: 722 111 222, nu 0722 111 222).`,
    };
  }
  if (cifre.length < 6 || cifre.length > 14) {
    return { ok: false, warn: false, message: "Numărul de telefon are o lungime neobișnuită — verifică-l." };
  }
  return { ok: true, warn: false };
}

/* Format de email simplu (nume@domeniu.ceva) — nu regula RFC 5322
   completa (accepta si adrese tehnic valide dar absurde), suficient cat
   sa prinda greselile reale de tastare: fara @, fara domeniu, spatii. */
export function validateEmail(raw) {
  const s = String(raw || "").trim();
  if (!s) return { ok: true, warn: false };
  if (/\s/.test(s) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    return { ok: false, warn: false, message: "Adresa de email nu are un format valid (ex: nume@exemplu.ro)." };
  }
  return { ok: true, warn: false };
}
