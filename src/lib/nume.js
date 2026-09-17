// @ts-check
/* Cum se numeste un oaspete, pe ecran.
 *
 * Doua reguli care par banale dar nu sunt: numele afisat al unei rezervari
 * NU e mereu numele clientului. La o rezervare de grup, camera poate avea
 * propriul ocupant, iar clientul ramane doar platitorul. occupantName
 * rezolva exact ordinea asta de preferinte.
 */


export function occupantName(res, core, groups) {
  if (res?.occupantName?.trim()) return res.occupantName.trim();
  if (res?.groupId) {
    const group = groups?.find((g) => g.id === res.groupId);
    if (group?.name?.trim()) return group.name.trim();
  }
  return guestFullName(core.guests.find((g) => g.id === res?.guestId)) || "";
}

/* Numele care merge pe factură ca DELEGAT: cine stă efectiv în cameră.

   La o cameră dintr-un grup asta e ocupantul — fiecare cameră are altul, iar
   clientul care a făcut rezervarea poate fi o firmă care nici nu doarme
   acolo. La o rezervare obișnuită e numele pe care s-a făcut rezervarea.

   Deliberat NU cade pe numele grupului, așa cum face `occupantName`:
   „Excursie Cluj" e o etichetă de grup, nu cineva care poate semna de
   primire pe un document fiscal. Când nu se știe nimeni, întoarce gol și
   recepția scrie de mână — câmpul rămâne editabil pe draft. */
export function numeDelegat(res, core) {
  const ocupant = res?.occupantName?.trim();
  if (ocupant) return ocupant;
  return guestFullName(core?.guests?.find((g) => g.id === res?.guestId)) || "";
}

export function guestFullName(g) {
  if (!g) return "";
  const composed = [g.lastName, g.firstName].filter(Boolean).join(" ").trim();
  return composed || g.name || "";
}
