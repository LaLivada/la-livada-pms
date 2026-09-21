/* REZERVARI / NIGHT AUDIT — poarta de la deschiderea zilei: plecarile si
 * sosirile restante, de rezolvat inainte de orice altceva.
 *
 * Desprins din features/rezervari.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { useState } from "react";
import { Pencil, LogIn, LogOut, ArrowRight, XCircle, AlertTriangle, UserCheck } from "lucide-react";
import { audit } from "../../lib/audit.js";
import { occupantName } from "../../lib/nume.js";
import { zileIntarziere, zileIntarziereSosire } from "../../lib/tranzitii.js";
import { fmtDate } from "../../lib/format.js";
import { STATUS_LABEL } from "../../lib/constante.js";
import { toaster } from "../../ui/primitive.jsx";
import { ReservationModal } from "./fisa-rezervare.jsx";
import { doCheckIn, doCheckOut } from "./checkin-checkout.jsx";

export function NightAuditGate({ restante, sosiri, core, updateCore, groups, updateGroups, blocks, updateBlocks, reservations, updateReservations, stergeRezervari, stergeGrupuri, adaugaOaspetiInCache, salveazaOaspete, housekeeping, updateHousekeeping, onLogout }) {
  const [busyId, setBusyId] = useState(null);
  const [modal, setModal] = useState(null); // { reservation } — deschis din Editează, mai jos

  /* Lacatul e UNUL SINGUR pe tot ecranul, deci si butoanele trebuie sa arate
     asta. Pana pe 22 septembrie 2026, garda `if (busyId) return` inghitea
     clicul pe ORICE alt rand cat timp unul era in lucru, dar `disabled` era
     pus doar pe randul ocupat: celelalte butoane aratau vii si nu faceau
     nimic. Nu e o fereastra teoretica — un check-out asteapta pe rand
     salvarea, camera, jurnalul, revocarea codului de pe yala si stergerea
     mesajului de pe televizor, adica 3-5 secunde in care receptia apasa
     linistita pe urmatoarea camera. Exact asa au ramas patru camere
     nerezolvate din poarta in noaptea de 21 spre 22 septembrie (jurnal:
     doua „Check-out", apoi patru „Rezervare modificata" facute de mana).
     Serializarea ramane — doua salvari deodata ar porni amandoua de la
     acelasi instantaneu al listei si s-ar suprascrie. */
  const ocupat = busyId !== null;

  const marcheazaNoShow = async (r) => {
    const camera = core.rooms.find((x) => x.id === r.roomId);
    await updateReservations(reservations.map((x) => (x.id === r.id ? { ...x, status: "noshow" } : x)));
    await audit.push("No-show", `${camera?.name || r.roomId} · ${occupantName(r, core, groups) || "Fără nume"}`, { roomId: r.roomId, reservationId: r.id });
  };

  const anuleaza = async (r) => {
    const camera = core.rooms.find((x) => x.id === r.roomId);
    await updateReservations(reservations.map((x) => (x.id === r.id ? { ...x, status: "cancelled" } : x)));
    await audit.push("Rezervare anulată",
      `${camera?.name || r.roomId} · ${occupantName(r, core, groups) || "Fără nume"} · ${fmtDate(r.checkin)}`, { roomId: r.roomId, reservationId: r.id });
  };

  return (
    <div className="login-wrap">
      <div className="boot boot-error naudit-boot">
        <div className="naudit-header">
          <AlertTriangle size={24} className="no-shrink" />
          <div>
            <strong>Închide ziua</strong>
            <p>
              {restante.length > 0 && (restante.length === 1
                ? "O cameră a rămas ocupată după data plecării."
                : `${restante.length} camere au rămas ocupate după data plecării.`)}
              {restante.length > 0 && sosiri.length > 0 && " "}
              {sosiri.length > 0 && (sosiri.length === 1
                ? "O rezervare nu a fost rezolvată până la sosire."
                : `${sosiri.length} rezervări nu au fost rezolvate până la sosire.`)}
              {" "}Rezolvă-le ca să poți folosi mai departe aplicația.
            </p>
          </div>
        </div>

        {restante.length > 0 && (
          <div className="panel mt-4">
            {restante.map((r) => {
              const camera = core.rooms.find((x) => x.id === r.roomId);
              const zile = zileIntarziere(r);
              return (
                <div className="list-row naudit-row-col" key={r.id}>
                  <div className="min-w-0">
                    <div className="primary">
                      <span className="mono">{camera?.name || r.roomId}</span>
                      {" · "}{occupantName(r, core, groups) || "Fără nume"}
                    </div>
                    <div className="secondary">
                      Plecare {fmtDate(r.checkout)} · {zile === 1 ? "o zi" : `${zile} zile`} întârziere
                    </div>
                  </div>
                  {/* Editează, nu doar Check-out: o restantă poate fi si o
                      factura uitata (se rezolva din formular, nu de aici) sau
                      un sejur prelungit — daca plecarea se muta in viitor,
                      rezervarea iese singura din lista asta la urmatorul tick. */}
                  <div className="quick-actions acces-actions">
                    <button className="btn btn-ghost" disabled={ocupat}
                      onClick={() => setModal({ reservation: r })}>
                      <Pencil size={14} /> Editează
                    </button>
                    <button className="btn btn-primary"
                      disabled={ocupat}
                      onClick={async () => {
                        if (busyId) return;
                        setBusyId(r.id);
                        try {
                          await doCheckOut(r, reservations, updateReservations, core, housekeeping, updateHousekeeping);
                        } finally { setBusyId(null); }
                      }}>
                      {busyId === r.id ? "…" : <><ArrowRight size={14} /> Check-out</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sosiri.length > 0 && (
          <div className={"panel " + (restante.length > 0 ? "mt-10" : "mt-4")}>
            {sosiri.map((r) => {
              const camera = core.rooms.find((x) => x.id === r.roomId);
              const zile = zileIntarziereSosire(r);
              return (
                <div className="list-row naudit-row-col" key={r.id}>
                  <div className="min-w-0">
                    <div className="primary">
                      <span className="mono">{camera?.name || r.roomId}</span>
                      {" · "}{occupantName(r, core, groups) || "Fără nume"}
                      {" · "}<span className="secondary">{STATUS_LABEL[r.status]}</span>
                    </div>
                    <div className="secondary">
                      Sosire {fmtDate(r.checkin)} · {zile === 1 ? "o zi" : `${zile} zile`} întârziere
                    </div>
                  </div>
                  {/* Rand fix de 3 — aceeasi clasa ca la actiunile de acces,
                      ca sa nu se rupa pe doua randuri pe mobil. */}
                  <div className="quick-actions acces-actions">
                    <button className="btn btn-ghost"
                      disabled={ocupat}
                      onClick={async () => {
                        if (busyId) return;
                        setBusyId(r.id);
                        try {
                          const out = await doCheckIn(r, reservations, updateReservations, core, { forta: true });
                          if (out && out.error) toaster.show(out.error, { tone: "danger" });
                        } finally { setBusyId(null); }
                      }}>
                      {busyId === r.id ? "…" : <><LogIn size={14} /> Check-in</>}
                    </button>
                    <button className="btn btn-ghost"
                      disabled={ocupat}
                      onClick={async () => {
                        if (busyId) return;
                        setBusyId(r.id);
                        try { await marcheazaNoShow(r); } finally { setBusyId(null); }
                      }}>
                      {busyId === r.id ? "…" : <><UserCheck size={14} /> No-show</>}
                    </button>
                    <button className="btn btn-danger"
                      disabled={ocupat}
                      onClick={async () => {
                        if (busyId) return;
                        setBusyId(r.id);
                        try { await anuleaza(r); } finally { setBusyId(null); }
                      }}>
                      {busyId === r.id ? "…" : <><XCircle size={14} /> Anulează</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button className="btn btn-ghost w-full mt-4" onClick={onLogout}>
          <LogOut size={15} /> Delogare
        </button>
      </div>

      {modal && (
        <ReservationModal
          data={modal}
          core={core}
          updateCore={updateCore}
          reservations={reservations}
          updateReservations={updateReservations}
          groups={groups}
          updateGroups={updateGroups}
          blocks={blocks}
          updateBlocks={updateBlocks}
          stergeRezervari={stergeRezervari}
          stergeGrupuri={stergeGrupuri}
          adaugaOaspetiInCache={adaugaOaspetiInCache}
          salveazaOaspete={salveazaOaspete}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
