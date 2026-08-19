// Furnizor simulat de yale.
//
// Există ca să poată fi verificat TOT lanțul — check-in, generare, afișare,
// schimbare de cameră, revocare — fără o yală reală. Momentan e singurul
// mod în care integrarea poate fi probată: contul TTLock nu administrează
// yalele pensiunii (errcode 20002), iar până se rezolvă acolo, restul
// codului ar rămâne altfel complet netestat.
//
// PERICOLUL EVIDENT: un cod simulat NU deschide nicio ușă. Dacă ar ajunge
// la un oaspete, acesta ar rămâne în fața camerei cu un cod care arată
// perfect valid. De aceea:
//   · codurile se salvează cu provider='simulare', nu 'ttlock';
//   · interfața le arată cu avertisment vizibil;
//   · trimiterea pe email si WhatsApp e blocată pentru ele.
//
// Simularea se activează DELIBERAT, dintr-o setare, niciodată ca rezervă
// automată când TTLock nu răspunde: o cădere de rețea nu are voie să se
// transforme tăcut în coduri false.

import { genereazaCodPin } from "../../../../src/lib/acces.js";

export interface Yala { lockId: string; lockName: string; lockAlias?: string }
export interface CodNou { code: string; externalId: string }

export const configurat = () => true;

/* Yale de probă, numite ca și camerele reale, ca asocierea să poată fi
   încercată exact cum se va face pe bune. */
export function listeazaYale(): Promise<Yala[]> {
  return Promise.resolve(
    Array.from({ length: 16 }, (_, i) => {
      const nr = 1001 + i;
      return { lockId: `sim-${nr}`, lockName: `SIMULARE ${nr}`, lockAlias: `SIMULARE ${nr}` };
    }));
}

export function creeazaCod(
  _lockId: string, _de: Date, _pana: Date, _nume: string, cod: string,
): Promise<CodNou> {
  /* Identificator recognoscibil: dacă apare vreodată într-un tabel unde
     ar trebui să fie un keyboardPwdId real, se vede imediat. */
  return Promise.resolve({
    code: cod || genereazaCodPin(4),
    externalId: `sim-${crypto.randomUUID().slice(0, 8)}`,
  });
}

export function stergeCod(_lockId: string, externalId: string): Promise<void> {
  if (!externalId.startsWith("sim-")) {
    /* Refuzăm să „ștergem" un cod real prin simulare: ar raporta succes
       fără să atingă yala, adică exact minciuna pe care integrarea asta o
       evită peste tot. */
    return Promise.reject(new Error(
      "Cod real trimis către furnizorul simulat. Verifică setarea accessProvider."));
  }
  return Promise.resolve();
}
