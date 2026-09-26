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
import { decideActiuneTv } from "../lib/tv.js";

const numeCamerei = (core, roomId) =>
  (core?.rooms || []).find((r) => r.id === roomId)?.name || roomId;

/* Un televizor rămas în urmă vine mereu DUPĂ o operațiune salvată. Textul
 * spune întâi ce s-a salvat, apoi ce a rămas nefăcut, și e galben, nu roșu.
 * Pe 25-26 septembrie 2026, un toast roșu după fiecare check-in („Mesajul de
 * bun venit n-a ajuns pe televizor · 1003. … Verifică conexiunea") l-a făcut
 * pe recepționer să creadă că rezervările nu se salvaseră — erau toate în
 * bază; lipsea doar funcția edge a televizoarelor. */
const avertizeaza = (text, motiv) => toaster.show(`${text} ${motiv || ""}`.trim(), { tone: "warn" });

/* Ce se spune recepției după un apel.
 *
 * Trei tăceri deliberate, ca ecranul să nu latre degeaba:
 *   · `fara`    — camera n-are televizor mapat. Majoritatea camerelor vor fi
 *                 așa la început, iar un avertisment la fiecare check-in ar
 *                 învăța pe toată lumea să ignore avertismentele.
 *   · `inactiv` — integrarea e oprită din setări, adică cineva a hotărât
 *                 exact asta.
 *   · `trimise: 0` fără eroare — n-avea ce trimite.
 *
 * Eșecul se spune întotdeauna, dar ca avertisment, nu ca eroare de
 * operațiune: cazarea s-a făcut oricum. */
function spune(r, { trimis, esuat }) {
  if (!r || r.inactiv || r.fara) return;
  if (r.ok && r.trimise > 0) {
    toaster.show(`${trimis}${r.simulat ? " (simulare — niciun televizor real)" : ""}`, { tone: "ok" });
    return;
  }
  if (!r.ok) avertizeaza(esuat, r.error);
}

/* Mesajul de bun venit, după check-in.
 *
 * Se cheamă DUPĂ ce cazarea e salvată și nu se așteaptă rezultatul, exact ca
 * la codul de acces — vezi comentariul din doCheckIn. */
export async function bunVenitLaCheckin(res, core) {
  const camera = numeCamerei(core, res.roomId);
  const r = await cheamaTv("welcome", { reservationId: res.id });
  if (r?.ok && r.trimise > 0) {
    await audit.push("Mesaj TV trimis", `${camera}`, { roomId: res.roomId, reservationId: res.id });
  } else if (r && !r.ok) {
    await audit.push("Mesaj TV eșuat", `${camera} · ${r.error || ""}`.slice(0, 200),
      { roomId: res.roomId, reservationId: res.id });
  }
  spune(r, {
    trimis: `Mesaj de bun venit pe televizor · ${camera}`,
    esuat: `Check-in-ul e salvat. Doar mesajul de bun venit n-a ajuns pe televizorul din ${camera}.`,
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
  if (r && !r.ok) {
    await audit.push("Ștergere mesaj TV eșuată", `${camera} · ${r.error || ""}`.slice(0, 200),
      { roomId: res.roomId, reservationId: res.id });
    avertizeaza(`Check-out-ul e salvat. Doar mesajul de bun venit a rămas pe televizorul din ${camera} — îl poți șterge din ecranul „Televizoare".`);
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
    if (r && !r.ok) {
      avertizeaza(`Rezervarea e salvată. Doar mesajul de bun venit a rămas pe televizorul din ${camera}.`, r.error);
    }
    return;
  }

  if (actiune === "muta") {
    const veche = numeCamerei(core, inainte.roomId);
    const rSters = await cheamaTv("clear", { reservationId: dupa.id, roomId: inainte.roomId });
    if (rSters && !rSters.ok) {
      avertizeaza(`Rezervarea e salvată. Doar mesajul vechi a rămas pe televizorul din ${veche}.`, rSters.error);
    }
  }

  const r = await cheamaTv("welcome", { reservationId: dupa.id });
  await audit.push(r?.ok && r.trimise > 0 ? "Mesaj TV actualizat" : "Actualizare mesaj TV eșuată",
    `${camera}${inainte.roomId !== dupa.roomId ? " · cameră schimbată" : ""}`,
    { roomId: dupa.roomId, reservationId: dupa.id });
  spune(r, {
    trimis: `Mesajul de pe televizor a fost actualizat · ${camera}`,
    esuat: `Rezervarea e salvată. Doar mesajul de pe televizorul din ${camera} n-a putut fi actualizat.`,
  });
}
