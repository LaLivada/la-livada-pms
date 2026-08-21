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

export function guestFullName(g) {
  if (!g) return "";
  const composed = [g.lastName, g.firstName].filter(Boolean).join(" ").trim();
  return composed || g.name || "";
}
