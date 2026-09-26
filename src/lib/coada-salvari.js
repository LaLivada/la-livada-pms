// @ts-check
/* Coada de salvari (faza 3, C8): ce se intampla cu o scriere cand reteaua
 * e cazuta.
 *
 * Pana pe 14 septembrie 2026 o salvare fara internet dadea „Conexiunea a
 * esuat" si reincarca datele — care nici ele nu veneau, deci aplicatia
 * ramanea pe ecranul de eroare. Acum scrierea care pica DE RETEA (nu de
 * verdict — drepturi, suprapunere, conflict — alea raman erori) intra
 * aici si se trimite cand revine conexiunea; starea locala e deja
 * actualizata optimist, ca la orice salvare, iar antetul arata cate
 * salvari asteapta (features/retea.jsx). Fara scriere optimista
 * complexa, fara IndexedDB: coada traieste in memorie si, din 26
 * septembrie 2026, si in localStorage, pe utilizator (data/coada.js), ca sa
 * supravietuiasca unei file inchise sau unei aplicatii oprite de telefon.
 * La inchiderea filei cu salvari neurcate browserul tot intreaba
 * (beforeunload): pastrate, ele pleaca abia la urmatoarea deschidere pe
 * acelasi dispozitiv, iar colegii nu le vad pana atunci.
 *
 * Operatiile sunt pe RAND: upsert (tabel, rand), delete (tabel, id),
 * insert (tabel, rand). O a doua salvare a aceluiasi rand o inlocuieste pe
 * prima (ramane ultima forma, pe pozitia primei); o stergere scoate
 * upsert-urile randului. La trimitere, operatiile consecutive de acelasi
 * fel pe acelasi tabel pleaca intr-o singura cerere — o salvare de grup
 * ramane o singura instructiune, ca in syncTable.
 *
 * Totul e pur si testabil; cererile efective si evenimentele browserului
 * sunt in data/coada.js.
 */

export const INTERVAL_REINCERCARE_MS = 20_000;

const RETEA_RE = /failed to fetch|networkerror|network request failed|network error|load failed|timeout|err_internet|err_network|aborted|econnrefused|fetch failed/i;

/* Eroare de transport (retea cazuta, timeout), nu un verdict al bazei. Un
   raspuns PostgREST/Postgres are `code` — ala nu se reincearca niciodata.
   Cand browserul stie ca e offline, orice esec e de retea. */
export function esteEroareDeRetea(e, online = true) {
  if (!online) return true;
  if (!e) return false;
  if (e.retea === true) return true;
  if (e.code) return false;
  return RETEA_RE.test(String(e.message || e.name || e));
}

const idDe = (op) => (op.tip === "delete" ? op.id : op.rand?.[op.cheie || "id"]);
const aceeasiCheie = (a, b) => a.tabel === b.tabel && idDe(a) !== undefined && idDe(a) === idDe(b);

export function creeazaCoada() {
  const ops = [];
  const ascultatori = new Set();
  let inCurs = false;
  const anunta = () => { for (const f of ascultatori) f(); };

  const pune = (op) => {
    if (op.tip === "upsert") {
      const existent = ops.find((o) => o.tip === "upsert" && aceeasiCheie(o, op));
      if (existent) existent.rand = op.rand;
      else ops.push(op);
    } else if (op.tip === "delete") {
      for (let i = ops.length - 1; i >= 0; i--) {
        if (ops[i].tip === "upsert" && aceeasiCheie(ops[i], op)) ops.splice(i, 1);
      }
      if (!ops.some((o) => o.tip === "delete" && aceeasiCheie(o, op))) ops.push(op);
    } else {
      ops.push(op);
    }
  };

  return {
    adauga(op) {
      pune(op);
      anunta();
    },

    /* Operatiile ramase de data trecuta (data/coada.js le tine in
       localStorage). Sunt mai VECHI decat orice e deja in memorie, deci trec
       in fata, iar ce e in memorie se reaplica peste ele cu aceleasi reguli:
       o salvare noua a aceluiasi rand ramane ultima forma, o stergere noua
       scoate upsert-ul vechi. Intoarce cate operatii au venit de data
       trecuta; ascultatorii afla o singura data. */
    restaureaza(vechi) {
      if (!vechi.length) return 0;
      const actuale = ops.splice(0);
      for (const op of vechi) pune(op);
      const venite = ops.length;
      for (const op of actuale) pune(op);
      anunta();
      return venite;
    },
    marime: () => ops.length,
    lista: () => ops.slice(),
    goleste() { ops.length = 0; anunta(); },
    asculta(f) { ascultatori.add(f); return () => ascultatori.delete(f); },
    inCurs: () => inCurs,

    /* Trimite loturile in ordine. La o eroare de retea se opreste si tine
       restul pentru data viitoare; la un verdict al bazei lotul e scos si
       raportat (`esuate`) — reincercat, ar pica la fel. O singura rulare o
       data: a doua chemare in timpul primei nu face nimic.

       Lotul terminat se scoate dupa IDENTITATE, nu ca „primele N": cat e in
       zbor, `restaureaza` poate pune operatii in fata lui, iar „primele N"
       ar fi scos atunci exact operatiile restaurate, netrimise. */
    async ruleaza(executa) {
      const rezultat = { scrise: [], esuate: [], oprit: false };
      if (inCurs) return rezultat;
      inCurs = true;
      const scoate = (lot) => {
        for (const op of lot) {
          const i = ops.indexOf(op);
          if (i !== -1) ops.splice(i, 1);
        }
        anunta();
      };
      try {
        while (ops.length) {
          const lot = primulLot(ops);
          try {
            const data = await executa(lot);
            scoate(lot);
            rezultat.scrise.push({ lot, data });
          } catch (e) {
            if (esteEroareDeRetea(e)) { rezultat.oprit = true; break; }
            scoate(lot);
            rezultat.esuate.push({ lot, eroare: e });
          }
        }
      } finally {
        inCurs = false;
      }
      return rezultat;
    },
  };
}

/* Forma in care coada sta in localStorage. `v` e versiunea formatului: o
   coada scrisa de o versiune viitoare (sau trecuta) a aplicatiei nu se
   ghiceste, se lasa deoparte. */
const VERSIUNE = 1;
const TIPURI = ["upsert", "delete", "insert"];

export const textDinOps = (ops) => JSON.stringify({ v: VERSIUNE, ops });

const esteOperatie = (o) =>
  Boolean(o) && TIPURI.includes(o.tip) && typeof o.tabel === "string" && o.tabel !== "" &&
  (o.tip === "delete" ? o.id !== undefined && o.id !== null : Boolean(o.rand) && typeof o.rand === "object");

/* Inapoi din localStorage. Acolo poate fi orice — JSON taiat de o scriere
   intrerupta, alt format, o operatie fara tabel —, iar nimic din astea n-are
   voie sa opreasca pornirea aplicatiei: ce nu arata a operatie ramane pe
   dinafara. */
export function opsDinText(text) {
  let brut;
  try { brut = JSON.parse(text || "null"); } catch { return []; }
  if (!brut || brut.v !== VERSIUNE || !Array.isArray(brut.ops)) return [];
  return brut.ops.filter(esteOperatie);
}

/* Operatiile consecutive de acelasi fel, pe acelasi tabel si cu aceeasi
   cheie de conflict, ca sa plece intr-o singura cerere. */
export function primulLot(ops) {
  if (!ops.length) return [];
  const [prima] = ops;
  const lot = [prima];
  for (let i = 1; i < ops.length; i++) {
    const o = ops[i];
    if (o.tip !== prima.tip || o.tabel !== prima.tabel || (o.onConflict || "id") !== (prima.onConflict || "id")) break;
    lot.push(o);
  }
  return lot;
}
