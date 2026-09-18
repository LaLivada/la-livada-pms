// Furnizor simulat de televizoare.
//
// Există din același motiv ca simularea de la yale: până când contul Samsung
// LYNK Cloud e provizionat și contractul lui Open API e cunoscut (vezi capul
// lui lynk.ts), tot restul lanțului — check-in, compunerea mesajului,
// maparea pe camere, ștergerea la plecare, jurnalul — ar rămâne netestat.
//
// CE E DIFERIT FAȚĂ DE SIMULAREA DE LA YALE, și de ce e mai puțin periculos:
// un cod de ușă simulat ajunge la oaspete și nu deschide nimic. Un mesaj de
// bun venit simulat nu ajunge nicăieri — nu se vede pe niciun ecran. Riscul
// nu e paguba, e iluzia: recepția ar putea crede că televizoarele salută
// oaspeții. De aceea:
//   · televizoarele se salvează cu provider='simulare', nu 'lynk';
//   · ecranul le arată cu avertisment vizibil, iar jurnalul la fel.
//
// Simularea se activează DELIBERAT, din setarea `provider` (`pms:tv:v1`),
// niciodată ca rezervă automată când LYNK nu răspunde.

import type { Stare, Televizor } from "./lynk.ts";

export const configurat = () => true;
export const ceLipseste = () => "";

/* Televizoare de probă, numite ca și camerele reale, ca maparea să poată fi
   încercată exact cum se va face pe bune. Numerele sunt cele din pensiune
   (1001-1014 tiny, 1101-1102 lofturi). */
const CAMERE = [
  ...Array.from({ length: 14 }, (_, i) => String(1001 + i)),
  "1101", "1102",
];

export function listeazaTelevizoare(): Promise<Televizor[]> {
  return Promise.resolve(CAMERE.map((nr) => ({
    deviceId: `sim-tv-${nr}`,
    name: `SIMULARE TV ${nr}`,
    model: "SIMULARE",
    roomHint: nr,
    online: true,
  })));
}

/* Ce „scrie pe ecran", cât trăiește instanța. Ajunge ca să se poată proba un
   ciclu întreg (trimite, citește, șterge) fără niciun televizor real; se
   pierde la fiecare pornire la rece, ca tokenul din lynk.ts. Sursa de adevăr
   rămâne oricum `tv_devices.last_message` din baza de date. */
const ecrane = new Map<string, { text: string; limba: string; la: string }>();

export function trimiteMesaj(deviceId: string, text: string, limba: string): Promise<void> {
  if (!deviceId.startsWith("sim-")) {
    /* Refuzăm să „trimitem" către un televizor real prin simulare: ar raporta
       succes fără să atingă aparatul, adică exact minciuna pe care integrarea
       asta o evită peste tot. */
    return Promise.reject(new Error(
      "Televizor real trimis către furnizorul simulat. Verifică setarea `provider` din Televizoare."));
  }
  ecrane.set(deviceId, { text, limba, la: new Date().toISOString() });
  return Promise.resolve();
}

export function stergeMesaj(deviceId: string): Promise<void> {
  ecrane.delete(deviceId);
  return Promise.resolve();
}

export function citesteStare(deviceId: string): Promise<Stare> {
  return Promise.resolve({
    online: true,
    status: { simulare: true, mesaj: ecrane.get(deviceId)?.text || null },
  });
}
