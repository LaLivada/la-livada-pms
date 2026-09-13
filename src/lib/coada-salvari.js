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
 * complexa, fara IndexedDB: coada traieste in memorie, iar la inchiderea
 * filei cu salvari neurcate browserul intreaba (beforeunload).
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

  return {
    adauga(op) {
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
      anunta();
    },
    marime: () => ops.length,
    lista: () => ops.slice(),
    goleste() { ops.length = 0; anunta(); },
    asculta(f) { ascultatori.add(f); return () => ascultatori.delete(f); },
    inCurs: () => inCurs,

    /* Trimite loturile in ordine. La o eroare de retea se opreste si tine
       restul pentru data viitoare; la un verdict al bazei lotul e scos si
       raportat (`esuate`) — reincercat, ar pica la fel. O singura rulare o
       data: a doua chemare in timpul primei nu face nimic. */
    async ruleaza(executa) {
      const rezultat = { scrise: [], esuate: [], oprit: false };
      if (inCurs) return rezultat;
      inCurs = true;
      try {
        while (ops.length) {
          const lot = primulLot(ops);
          try {
            const data = await executa(lot);
            ops.splice(0, lot.length);
            anunta();
            rezultat.scrise.push({ lot, data });
          } catch (e) {
            if (esteEroareDeRetea(e)) { rezultat.oprit = true; break; }
            ops.splice(0, lot.length);
            anunta();
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
