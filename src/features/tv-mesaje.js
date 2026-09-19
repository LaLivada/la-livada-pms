/* MESAJELE DE BUN VENIT DE PE TELEVIZOARE — partea legată de rezervări.
 *
 * Stă separat de ecranul „Televizoare" (features/televizoare.jsx) dintr-un
 * motiv practic: de aici importă check-in-ul, check-out-ul și fișa
 * rezervării, iar ecranul de configurare e încărcat lene (`lazy`). Într-un
 * singur fișier, ecranul ar fi intrat în pachetul principal la fiecare
 * pornire, pentru trei funcții.
 *
 * NIMIC DE AICI NU ARUNCĂ ȘI NIMIC NU BLOCHEAZĂ. Un mesaj pe un televizor e
 * ultimul lucru din pensiune care are voie să răstoarne o operațiune
 * hotelieră: oaspetele stă la recepție, iar dacă televizorul nu-l salută,
 * asta se rezolvă mai târziu, cu un buton.
 */
import { audit } from "../lib/audit.js";
import { toaster } from "../ui/primitive.jsx";
import { cheamaTv } from "../data/televizoare.js";
import { decideActiuneTv, taceLaCheckin } from "../lib/tv.js";

const numeCamerei = (core, roomId) =>
  (core?.rooms || []).find((r) => r.id === roomId)?.name || roomId;

/* Ce se spune recepției după un apel.
 *
 * CÂND SE TACE e o regulă pură, în lib/tv.js (`taceLaCheckin`), nu una scrisă
 * aici: o folosesc toate cele trei căi automate de mai jos, iar motivele ei —
 * camera n-are televizor, integrarea e oprită, funcția edge nu e publicată,
 * lipsesc secretele — sunt toate situații despre care omul de la ghișeu n-are
 * nimic de făcut. Ecranul „Televizoare" nu tace niciodată: acolo s-a apăsat un
 * buton, deci se așteaptă un răspuns.
 *
 * Eșecul care SE spune rămâne un avertisment, nu o eroare de operațiune:
 * cazarea s-a făcut oricum. */
function spune(r, camera, { verbTrimis, verbEsuat }) {
  if (taceLaCheckin(r)) return;
  if (r.ok) {
    toaster.show(
      `${verbTrimis} · ${camera}${r.simulat ? " (simulare — niciun televizor real)" : ""}`,
      { tone: "ok" });
    return;
  }
  toaster.show(`${verbEsuat} · ${camera}. ${r.error || ""}`.trim(), { tone: "danger" });
}

/* Mesajul de bun venit, după check-in.
 *
 * Se cheamă DUPĂ ce cazarea e salvată și nu se așteaptă rezultatul, exact ca
 * la codul de acces — vezi comentariul din doCheckIn. */
export async function bunVenitLaCheckin(res, core) {
  const camera = numeCamerei(core, res.roomId);
  const r = await cheamaTv("welcome", { reservationId: res.id });
  /* Jurnalul urmează aceeași regulă ca notificarea, și din același motiv: un
     rând „Mesaj TV eșuat" la fiecare check-in, cât timp funcția nu e publicată,
     ar îngropa în jurnal exact zilele în care s-a întâmplat ceva real. */
  if (r?.ok && r.trimise > 0) {
    await audit.push("Mesaj TV trimis", `${camera}`, { roomId: res.roomId, reservationId: res.id });
  } else if (r && !r.ok && !taceLaCheckin(r)) {
    await audit.push("Mesaj TV eșuat", `${camera} · ${r.error || ""}`.slice(0, 200),
      { roomId: res.roomId, reservationId: res.id });
  }
  spune(r, camera, {
    verbTrimis: "Mesaj de bun venit pe televizor",
    verbEsuat: "Mesajul de bun venit n-a ajuns pe televizor",
  });
  return r;
}

/* Ștergerea mesajului, la plecare.
 *
 * Cu `reservationId`, nu doar cu camera: funcția edge verifică dacă între
 * timp s-a cazat altcineva acolo și, dacă da, scrie mesajul LUI în loc să
 * golească ecranul. */
export async function stergeMesajLaCheckout(res, core) {
  const camera = numeCamerei(core, res.roomId);
  const r = await cheamaTv("clear", { reservationId: res.id });
  if (r && !r.ok && !taceLaCheckin(r)) {
    await audit.push("Ștergere mesaj TV eșuată", `${camera} · ${r.error || ""}`.slice(0, 200),
      { roomId: res.roomId, reservationId: res.id });
    toaster.show(
      `Mesajul de bun venit a rămas pe televizorul din ${camera}. Îl poți șterge din ecranul „Televizoare".`,
      { tone: "danger" });
  }
  return r;
}

/* Aduce televizorul la zi după ce o rezervare s-a modificat.
 *
 * CE E DIFERIT FAȚĂ DE `reconciliazaAcces`: acolo, un cod nesincronizat
 * înseamnă o ușă care se deschide când n-ar trebui. Aici, în cel mai rău caz,
 * pe un ecran scrie numele cuiva care a plecat — supărător, nu periculos. De
 * aceea nu există confirmări și nici blocaje: se corectează și se spune.
 *
 * Cazul „muta" e singurul cu două apeluri: se golește ecranul din camera
 * veche și se scrie în cea nouă. Ordinea contează — dacă golirea eșuează,
 * mesajul nou tot pleacă: un oaspete fără mesaj în camera lui e mai rău decât
 * un mesaj rămas într-o cameră goală, pe care o vede oricum camerista. */
export async function reconciliazaTv(inainte, dupa, core) {
  if (!inainte || !dupa) return;
  const actiune = decideActiuneTv(inainte, dupa);
  if (!actiune) return;

  const camera = numeCamerei(core, dupa.roomId);

  if (actiune === "clear") {
    const r = await cheamaTv("clear", { reservationId: dupa.id });
    if (r && !r.ok && !taceLaCheckin(r)) {
      toaster.show(`Mesajul de bun venit a rămas pe televizorul din ${camera}. ${r.error || ""}`.trim(),
        { tone: "danger" });
    }
    return;
  }

  if (actiune === "muta") {
    const veche = numeCamerei(core, inainte.roomId);
    const rSters = await cheamaTv("clear", { reservationId: dupa.id, roomId: inainte.roomId });
    if (rSters && !rSters.ok && !taceLaCheckin(rSters)) {
      toaster.show(`Mesajul vechi a rămas pe televizorul din ${veche}. ${rSters.error || ""}`.trim(),
        { tone: "danger" });
    }
  }

  const r = await cheamaTv("welcome", { reservationId: dupa.id });
  if (!taceLaCheckin(r) || (r?.ok && r.trimise > 0)) {
    await audit.push(r?.ok && r.trimise > 0 ? "Mesaj TV actualizat" : "Actualizare mesaj TV eșuată",
      `${camera}${inainte.roomId !== dupa.roomId ? " · cameră schimbată" : ""}`,
      { roomId: dupa.roomId, reservationId: dupa.id });
  }
  spune(r, camera, {
    verbTrimis: "Mesajul de pe televizor a fost actualizat",
    verbEsuat: "Mesajul de pe televizor n-a putut fi actualizat",
  });
}
