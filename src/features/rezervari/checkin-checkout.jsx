/* REZERVARI / CHECK-IN si CHECK-OUT — actiunile efective (scriu rezervarea,
 * camera si jurnalul); regulile de cand se poate stau in lib/tranzitii.js.
 *
 * Desprins din features/rezervari.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { audit } from "../../lib/audit.js";
import { guestFullName } from "../../lib/nume.js";
import { rangesOverlap, esteProtocol } from "../../lib/availability.js";
import { canCheckIn, canCheckOut } from "../../lib/tranzitii.js";
import { toaster } from "../../ui/primitive.jsx";
import { cheamaAcces } from "../acces.jsx";

/* `forta` ocoleste doar fereastra de zile dinaintea sosirii (canCheckIn) —
   folosita de night audit, unde operatorul rezolva manual o sosire deja
   restanta (canCheckIn refuza orice zi trecuta, vezi lib/tranzitii.js).
   Garda de camera ocupata ramane oricum, mai jos: aceea nu e o regula de
   fereastra, ci o imposibilitate reala. */
export async function doCheckIn(res, reservations, updateReservations, core, { forta = false } = {}) {
  if (!forta && !canCheckIn(res)) return false;

  /* Altcineva poate fi încă în cameră — refuzăm, în loc să punem tăcut doi
     oaspeți în ea.
     Suprapunerea se testează cu `rangesOverlap`, nu pe jumătate. Aici a stat
     un bug: garda compara doar `blocker.checkout > res.checkin`, ceea ce
     mergea cât timp check-in-ul se putea face doar în ziua sosirii — atunci
     o rezervare „checkedin" era mereu una în curs. De când cazarea e permisă
     cu 14 zile înainte, o rezervare complet VIITOARE poate fi deja
     „checkedin", iar jumătatea lipsă o transforma în blocaj pentru orice
     sosire dinaintea ei: o cazare pe 20-25 bloca o cazare pe 10-12, în
     aceeași cameră, deși nu se ating. */
  const blocker = reservations.find((r) =>
    r.id !== res.id && r.roomId === res.roomId && r.status === "checkedin" &&
    rangesOverlap(r.checkin, r.checkout, res.checkin, res.checkout));
  if (blocker) {
    const who = guestFullName(core.guests.find((g) => g.id === blocker.guestId)) || "alt oaspete";
    const room = core.rooms.find((x) => x.id === res.roomId);
    await audit.push("Check-in blocat",
      `${room?.name || res.roomId} · încă ocupată de ${who}`, { roomId: res.roomId, reservationId: res.id });
    return { error: `Camera ${room?.name || ""} este încă ocupată de ${who}. Fă întâi check-out.` };
  }

  /* Marcajul de protocol ramane dupa cazare: in baza il tine triggerul, aici
     il pastram pe obiectul din memorie (Azi si rapoartele intreaba
     esteProtocol, nu starea). */
  const next = reservations.map((r) => (r.id === res.id ? { ...r, status: "checkedin", protocol: esteProtocol(r) } : r));
  await updateReservations(next);
  const room = core.rooms.find((x) => x.id === res.roomId);
  await audit.push("Check-in", `${room?.name || res.roomId} · ${guestFullName(core.guests.find((g) => g.id === res.guestId))}`, { roomId: res.roomId, reservationId: res.id });
  toaster.show(`Check-in făcut · ${room?.name || ""}`, { tone: "ok" });

  /* Codul de acces se cere DUPĂ ce check-in-ul e salvat, și nu are voie
     să-l răstoarne.
     Un oaspete stă la recepție: dacă yala nu răspunde, operațiunea
     hotelieră trebuie să meargă mai departe, iar codul se poate genera
     din rezervare, cu butonul de acolo. De aceea nu se face `await` pe
     rezultat înainte de a raporta succesul, iar eșecul e doar un
     avertisment — nu o eroare care anulează sosirea.
     `cheamaAcces` nu aruncă niciodată, dar păstrăm și catch-ul: o
     promisiune respinsă aici ar lăsa check-in-ul raportat ca eșuat. */
  if (room?.accessLockId) {
    cheamaAcces("issue", { reservationId: res.id })
      .then((r) => {
        if (r?.ok) {
          toaster.show(`Cod de acces generat · ${room.name || ""}`, { tone: "ok" });
        } else {
          toaster.show(
            `Check-in făcut, dar codul de acces nu a putut fi generat. Îl poți genera din rezervare.`,
            { tone: "danger" });
        }
      })
      .catch(() => { /* check-in-ul e deja făcut; nu-l stricăm */ });
  }

  return true;
}

export async function doCheckOut(res, reservations, updateReservations, core, housekeeping, updateHousekeeping) {
  if (!canCheckOut(res)) return false;
  const next = reservations.map((r) => (r.id === res.id ? { ...r, status: "checkedout" } : r));
  await updateReservations(next);
  await updateHousekeeping(res.roomId, "dirty");
  const room = core.rooms.find((x) => x.id === res.roomId);
  await audit.push("Check-out", `${room?.name || res.roomId} · camera trecută pe „murdară”`, { roomId: res.roomId, reservationId: res.id });
  toaster.show(`Check-out făcut · ${room?.name || ""} trecută pe „murdară”`, { tone: "ok" });

  /* Codul se șterge ACUM, nu lăsat să expire singur la ora calculată la
     emitere: camera trece la următorul oaspete, iar un cod încă valid ar
     deschide ușa oricui îl mai are, indiferent cine stă acum acolo.
     Aceeași plasă ca la ștergerea rezervării (removeInner, mai sus): nu
     blocăm check-out-ul dacă revocarea eșuează — operațiunea hotelieră
     contează mai mult — dar avertizăm explicit, ca recepția să știe că
     mai are de verificat manual în TTHOTEL. */
  if (room?.accessLockId) {
    try {
      const rev = await cheamaAcces("revoke", { reservationId: res.id });
      if (rev && rev.ok === false && rev.reason !== "neconfigurat") {
        toaster.show(
          "Check-out făcut, dar codul de acces nu a putut fi șters de pe yală. Verifică în TTHOTEL.",
          { tone: "danger" });
      }
    } catch (e) { console.error("Revocare acces la check-out", e); }
  }

  return true;
}
