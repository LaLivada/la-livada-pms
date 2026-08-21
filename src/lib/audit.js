/* Jurnalul de activitate — cine ce a modificat si cand.
 *
 * Obiect la nivel de modul, nu context React: orice componenta trebuie sa
 * poata consemna o actiune fara sa i se pasagereze un callback prin zece
 * nivele de props.
 *
 * Plafonat la 400 de intrari. Pentru operatiunile pe yale exista un jurnal
 * separat, in tabel propriu (access_audit) — acolo intrebarea "cine a deschis
 * usa aia" nu are voie sa se piarda dupa 400 de randuri.
 */

import { uid } from "./uid.js";
import { K, saveShared } from "../data/stare-partajata.js";
import { toaster } from "../ui/primitive.jsx";

export const audit = {
  user: null,
  entries: [],
  setEntries: null,
  async push(action, detail) {
    const entry = {
      id: uid(), ts: new Date().toISOString(),
      userName: audit.user?.name || "?", userRole: audit.user?.role || "?",
      action, detail,
    };
    const next = [entry, ...audit.entries].slice(0, 400);
    audit.entries = next;
    if (audit.setEntries) audit.setEntries(next);
    /* Jurnalul e secundar fata de actiunea in sine: daca scrierea lui
       esueaza, actiunea utilizatorului (rezervarea, plata) e deja
       salvata si nu are rost sa fie anulata. Anuntam discret si mergem
       mai departe — spre deosebire de saveShared, unde acum eroarea
       chiar trebuie sa opreasca fluxul. */
    try {
      await saveShared(K.log, next);
    } catch (e) {
      console.error("Jurnalul nu a putut fi salvat", e);
      toaster.show("Acțiunea a fost salvată, dar nu a putut fi trecută în jurnal.", { tone: "danger" });
    }
  },
};

/* Permisiuni granulare de facturare pentru userul curent — module-level
   ca audit, populat o singura data la login (vezi PMSApp). Adminii au
   automat tot (oglindeste has_billing_permission() din RLS — vezi
   schema.sql — asta e doar pentru UI, RLS impune regula reala). */
