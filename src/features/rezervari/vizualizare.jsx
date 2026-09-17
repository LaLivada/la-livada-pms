/* REZERVARI / VEZI REZERVAREA — fereastra de citire a unei rezervari: client,
 * ocupant, statut, acces, fisa de cazare, folio.
 *
 * Desprins din features/rezervari.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { useState } from "react";
import { Pencil, UsersRound, Printer } from "lucide-react";
import { audit } from "../../lib/audit.js";
import { guestFullName, occupantName } from "../../lib/nume.js";
import { nightsBetween, esteProtocol } from "../../lib/availability.js";
import { reservationTotal } from "../../lib/pricing.js";
import { fmtMoney, fmtDate, fmtDateTime, initials } from "../../lib/format.js";
import { STATUS_LABEL, STATUS_GLYPH, STATUS_CLASS, sourceLabel } from "../../lib/constante.js";
import { Dialog, useModalLock } from "../../ui/primitive.jsx";
import { SectiuneAcces } from "../acces.jsx";
import { SectiuneFisa } from "../fise.jsx";
import { FolioPanel, BillingCustomerModal, billingCustomerLabel } from "../facturare.jsx";
import { ContactQuickActions } from "../clienti.jsx";
import { ArrivalForm } from "../documente.jsx";
import { GroupEditor, GroupPrint } from "../grupuri.jsx";
import { EtichetaNou } from "./eticheta-nou.jsx";

/* Stepper +/- pentru adulti/copii — evita inputurile numerice native (care
   fac zoom pe iOS la focus si permit tastarea unei valori peste capacitate)
   si aplica limita direct in logica de crestere/scadere. */

export function ReservationViewModal({ reservation, core, updateCore, groups, updateGroups, reservations, updateReservations, stergeRezervari, stergeGrupuri, blocks, onClose, onEdit, noutati }) {
  useModalLock();
  const guest = core.guests.find((g) => g.id === reservation.guestId) || null;
  const room = core.rooms.find((r) => r.id === reservation.roomId);
  const editingGroup = reservation.groupId ? groups.find((g) => g.id === reservation.groupId) : null;

  const [billingCustomerId, setBillingCustomerId] = useState(reservation.billingCustomerId || "");
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [showArrival, setShowArrival] = useState(false);
  // "edit" deschide grupul, "print" lista de cazare — acelasi tipar ca in GroupsView.
  const [groupModal, setGroupModal] = useState(null);

  /* În „Vezi rezervarea" nu există buton de salvare: ce apeși aici se scrie
     pe loc, ca statutul sau mesajele. Clientul de facturare făcea excepție
     fără s-o spună — îl alegeai, fereastra de confirmare se închidea, și
     alegerea se pierdea la închiderea rezervării, fiindcă trăia doar în
     starea locală a ferestrei. Formularul de editare își are butonul lui de
     salvare și rămâne cum era. */
  const schimbaClientFacturare = async (id, clientNou = null) => {
    setBillingCustomerId(id);
    if ((reservation.billingCustomerId || "") === (id || "")) return;
    await updateReservations(reservations.map((r) =>
      (r.id === reservation.id ? { ...r, billingCustomerId: id || null } : r)));
    /* Clientul proaspăt creat nu e încă în `core`-ul din închiderea asta,
       de-aia vine ca argument. */
    const client = clientNou || (core.billingCustomers || []).find((c) => c.id === id);
    await audit.push("Client de facturare schimbat",
      `${guestFullName(guest) || "Fără nume"} · ${room?.name} → ${billingCustomerLabel(client) || "oaspetele rezervării"}`,
      { roomId: reservation.roomId, reservationId: reservation.id });
  };

  const saveNewBillingCustomer = async (customer) => {
    if ((core.billingCustomers || []).some((c) => c.id === customer.id)) { await schimbaClientFacturare(customer.id, customer); setBillingModalOpen(false); return; }
    await updateCore({ ...core, billingCustomers: [...(core.billingCustomers || []), customer] });
    await audit.push("Client de facturare adăugat", billingCustomerLabel(customer));
    await schimbaClientFacturare(customer.id, customer);
    setBillingModalOpen(false);
  };

  return (
    <Dialog onClose={onClose} title="Vezi rezervarea">
      {/* `flexDirection: row` explicit: .action-head trece pe coloană sub
          640px, iar aici vrem butonul chiar în dreapta rândurilor, și pe
          telefon. Rândurile din stânga stau strânse (margin-top mic). */}
      <div className="action-head vizual-head">
        <div className="min-w-0 grow">
          <div className="action-guest">{occupantName(reservation, core, groups) || "Fără nume"}</div>
          {guestFullName(guest) && guestFullName(guest) !== occupantName(reservation, core, groups) && (
            <div className="action-meta mt-1">Rezervat de {guestFullName(guest)}</div>
          )}
          <div className="action-meta mt-1">
            <span className="mono">{room?.name}</span> · {fmtDate(reservation.checkin)} → {fmtDate(reservation.checkout)}
            {" · "}{nightsBetween(reservation.checkin, reservation.checkout)} nopți
          </div>
          <div className="action-meta mt-1">
            {reservation.adults ?? 2} adulți{reservation.children ? ` + ${reservation.children} copii` : ""} · {sourceLabel(reservation.source)} · {fmtMoney(reservationTotal(reservation, core))}{esteProtocol(reservation) && reservation.status !== "protocol" ? " · Protocol" : ""}
          </div>
          {/* Starea, „noua" si etichetele pe acelasi rand (cerut pe 15
              septembrie 2026); se rup pe urmatorul doar daca nu incap. */}
          <div className="fisa-etichete">
            <span className={"role-tag " + STATUS_CLASS[reservation.status]}>
              <span aria-hidden="true">{STATUS_GLYPH[reservation.status]}</span> {STATUS_LABEL[reservation.status]}
            </span>
            <EtichetaNou res={reservation} noutati={noutati} mare />
            {reservation.tags?.map((t) => <span className="tag-mini" key={t}>{t}</span>)}
          </div>
        </div>
        <button className="btn btn-ghost btn-lat btn-mic no-shrink" onClick={() => setShowArrival(true)}>
          <Printer size={14} /> Fișa de sosire
        </button>
      </div>

      {editingGroup && (
        <button type="button" className="group-banner group-banner-link" onClick={() => setGroupModal("edit")}>
          <UsersRound size={15} />
          <span>Face parte din grupul <strong>{editingGroup.name}</strong></span>
        </button>
      )}

      {guest && (
        <div className="field">
          <label>Client</label>
          <div className="guest-chip">
            <div className="guest-chip-av">{initials(guestFullName(guest))}</div>
            <div className="guest-chip-body">
              <div className="gname">{guestFullName(guest)}</div>
              <div className="gmeta">{[guest.phone, guest.city].filter(Boolean).join(" · ") || "Fără date de contact"}</div>
            </div>
            <ContactQuickActions guest={guest} />
          </div>
        </div>
      )}

      {reservation.notes && (
        <div className="field">
          <label>Note</label>
          <div>{reservation.notes}</div>
        </div>
      )}

      {reservation.messages?.length > 0 && (
        <div className="field">
          <label>Mesaje ({reservation.messages.length})</label>
          <div className="msg-list mt-0">
            {[...reservation.messages].reverse().map((m) => (
              <div className="msg-item" key={m.id}>
                <div className="msg-text">{m.text}</div>
                <div className="msg-meta">{m.author} · {fmtDateTime(m.ts)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <SectiuneAcces res={reservation} core={core} />
      <SectiuneFisa res={reservation} core={core} />

      <FolioPanel reservation={reservation} core={core} updateCore={updateCore}
        billingCustomerId={billingCustomerId} setBillingCustomerId={schimbaClientFacturare}
        onNewBillingCustomer={() => setBillingModalOpen(true)} />

      <div className="modal-actions">
        <div className="grow" />
        <button className="btn btn-ghost" onClick={onClose}>Închide</button>
        <button className="btn btn-primary btn-lat" onClick={onEdit}>
          <Pencil size={14} /> Editează rezervarea
        </button>
      </div>

      {showArrival && (
        <div onClick={(e) => e.stopPropagation()}>
          <ArrivalForm res={reservation} core={core} groups={groups} onClose={() => setShowArrival(false)} />
        </div>
      )}

      {billingModalOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <BillingCustomerModal
            seedFromGuest={guest}
            existingCustomers={core.billingCustomers || []}
            onSave={saveNewBillingCustomer}
            onClose={() => setBillingModalOpen(false)}
          />
        </div>
      )}

      {groupModal === "edit" && editingGroup && (
        <div onClick={(e) => e.stopPropagation()}>
          <GroupEditor
            group={editingGroup}
            core={core}
            groups={groups}
            updateGroups={updateGroups}
            reservations={reservations}
            updateReservations={updateReservations}
            stergeRezervari={stergeRezervari}
            stergeGrupuri={stergeGrupuri}
            blocks={blocks}
            onClose={() => setGroupModal(null)}
            onPrint={() => setGroupModal("print")}
          />
        </div>
      )}

      {groupModal === "print" && editingGroup && (
        <div onClick={(e) => e.stopPropagation()}>
          <GroupPrint
            group={editingGroup}
            core={core}
            reservations={reservations}
            onClose={() => setGroupModal(null)}
          />
        </div>
      )}
    </Dialog>
  );
}
