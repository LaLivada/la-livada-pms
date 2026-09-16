/* REZERVARI / ACTIUNILE PE O REZERVARE — foaia care se deschide la apasarea
 * unei bare din calendar: vezi, editeaza, check-in / check-out, muta, anuleaza.
 *
 * Desprins din features/rezervari.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { useState } from "react";
import { Check, Pencil, LogIn, Eye, ArrowRight, MoveRight, XCircle, MessageSquare, UserCheck } from "lucide-react";
import { uid } from "../../lib/uid.js";
import { audit } from "../../lib/audit.js";
import { guestFullName, occupantName } from "../../lib/nume.js";
import { nightsBetween, isLive, esteProtocol } from "../../lib/availability.js";
import { reservationTotal } from "../../lib/pricing.js";
import { isSameDay, canCheckIn, canCheckOut, canCancel, canNoShow, ZILE_CHECKIN_DEVREME, STATUSURI_CAZABILE } from "../../lib/tranzitii.js";
import { fmtMoney, fmtDate, fmtDateTime } from "../../lib/format.js";
import { STATUS_LABEL, STATUS_GLYPH, STATUS_CLASS, sourceLabel } from "../../lib/constante.js";
import { Dialog, toaster, useModalLock } from "../../ui/primitive.jsx";
import { doCheckIn, doCheckOut } from "./checkin-checkout.jsx";

export function ReservationActions({ res: resSnapshot, core, groups, reservations, updateReservations, housekeeping, updateHousekeeping, onOpen, onEdit, onMove, onClose }) {
  useModalLock();
  /* The panel was opened with a snapshot; re-read the reservation from the
     live list each render so actions never apply on top of stale state if
     it changed in the background while the panel was open. */
  const res = reservations.find((r) => r.id === resSnapshot.id) || resSnapshot;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState("");
  /* Cat timp ruleaza o actiune care scrie (check-in/out, no-show,
     anulare, mesaj), butoanele din panou raman blocate — altfel un
     dublu-click trimitea doua scrieri pe aceeasi rezervare. */
  const [busy, setBusy] = useState(false);
  const ruleaza = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgText, setMsgText] = useState("");
  const messages = res.messages || [];
  const guest = core.guests.find((g) => g.id === res.guestId);
  const room = core.rooms.find((r) => r.id === res.roomId);
  const grup = res.groupId ? (groups || []).find((g) => g.id === res.groupId) : null;
  const now = new Date();

  const arrivesToday = isSameDay(res.checkin, now);
  const departsToday = isSameDay(res.checkout, now);
  const mayCheckIn = canCheckIn(res, now);
  const mayCheckOut = canCheckOut(res);

  /* Explicatia apare doar cand check-in-ul chiar NU e posibil: cu fereastra
     de ZILE_CHECKIN_DEVREME zile, o sosire apropiata e deja cazabila, deci
     n-are ce explica. */
  const checkInHint = !STATUSURI_CAZABILE.includes(res.status) || mayCheckIn
    ? null
    : new Date(res.checkin) > now
      ? `Check-in disponibil cu ${ZILE_CHECKIN_DEVREME} zile înainte de sosire (${fmtDate(res.checkin)})`
      : "Sosirea era într-o zi trecută — deschide rezervarea ca să corectezi data.";

  const addMessage = async () => {
    const text = msgText.trim();
    if (!text) return;
    const entry = { id: uid(), ts: new Date().toISOString(), author: audit.user?.name || "?", text };
    await updateReservations(reservations.map((r) =>
      (r.id === res.id ? { ...r, messages: [...(r.messages || []), entry] } : r)));
    await audit.push("Mesaj adăugat la rezervare",
      `${guestFullName(guest) || "Fără nume"} · ${room?.name}: ${text.slice(0, 60)}`, { roomId: res.roomId, reservationId: res.id });
    setMsgText(""); setMsgOpen(false);
    onClose();
  };

  const cancel = async () => {
    await updateReservations(reservations.map((r) => (r.id === res.id ? { ...r, status: "cancelled" } : r)));
    await audit.push("Rezervare anulată",
      `${guestFullName(guest) || "Fără nume"} · ${room?.name} · ${fmtDate(res.checkin)}`, { roomId: res.roomId, reservationId: res.id });
    const before = reservations;
    toaster.show(`Rezervarea ${guestFullName(guest) || ""} a fost anulată`, {
      tone: "danger",
      onUndo: async () => {
        await updateReservations(before);
        await audit.push("Anulare revocată", `${guestFullName(guest) || ""} · ${room?.name}`, { roomId: res.roomId, reservationId: res.id });
      },
    });
    onClose();
  };

  return (
    <Dialog onClose={onClose} className="action-modal" title={undefined}>
        <div className="action-head">
          <div className="min-w-0">
            <div className="action-guest">{occupantName(res, core, groups) || "Fără nume"}</div>
            {guestFullName(guest) && guestFullName(guest) !== occupantName(res, core, groups) && (
              <div className="action-meta">Rezervat de {guestFullName(guest)}</div>
            )}
            {/* Din ce grup face parte camera. Sarit cand numele grupului e
                deja titlul de sus: `occupantName` cade pe numele grupului
                cand camera n-are ocupant scris, iar atunci randul asta ar
                repeta exact acelasi text cu doua cuvinte in fata. */}
            {grup && grup.name !== occupantName(res, core, groups) && (
              <div className="action-meta">Din grupul {grup.name}</div>
            )}
            <div className="action-meta">
              <span className="mono">{room?.name}</span> · {fmtDate(res.checkin)} → {fmtDate(res.checkout)}
              {" · "}{nightsBetween(res.checkin, res.checkout)} nopți
            </div>
            <div className="action-meta">
              {res.adults ?? 2} adulți{res.children ? ` + ${res.children} copii` : ""} · {sourceLabel(res.source)} · {fmtMoney(reservationTotal(res, core))}{esteProtocol(res) && res.status !== "protocol" ? " · Protocol" : ""}
            </div>
            {res.tags?.length > 0 && (
              <div className="tag-row">
                {res.tags.map((t) => <span className="tag-mini" key={t}>{t}</span>)}
              </div>
            )}
          </div>
          <span className={"role-tag " + STATUS_CLASS[res.status]}>
            <span aria-hidden="true">{STATUS_GLYPH[res.status]}</span> {STATUS_LABEL[res.status]}
          </span>
        </div>

        <div className="action-list">
          <button className="action-item" onClick={onOpen}>
            <span className="ai-ico"><Eye size={17} /></span>
            <span className="ai-body"><span className="ai-t">Vezi rezervarea</span>
              <span className="ai-d">Detalii, cod acces și facturare</span></span>
          </button>

          <button className="action-item" onClick={onEdit}>
            <span className="ai-ico"><Pencil size={17} /></span>
            <span className="ai-body"><span className="ai-t">Editează rezervarea</span>
              <span className="ai-d">Cameră, date, client, preț, status</span></span>
          </button>

          {mayCheckOut ? (
            <button className="action-item" disabled={busy} onClick={() => ruleaza(async () => {
              await doCheckOut(res, reservations, updateReservations, core, housekeeping, updateHousekeeping);
              onClose();
            })}>
              <span className="ai-ico"><ArrowRight size={17} /></span>
              <span className="ai-body"><span className="ai-t">Check-out</span>
                <span className="ai-d">{departsToday ? "Pleacă astăzi" : "Camera trece pe „murdară”"}</span></span>
            </button>
          ) : (
            <button className="action-item" disabled={!mayCheckIn || busy} onClick={() => ruleaza(async () => {
              const out = await doCheckIn(res, reservations, updateReservations, core);
              if (out && out.error) { setActionError(out.error); return; }
              onClose();
            })}>
              <span className="ai-ico"><LogIn size={17} /></span>
              <span className="ai-body"><span className="ai-t">Check-in</span>
                <span className="ai-d">{checkInHint
                  || (res.status === "checkedout" ? "Sejur încheiat"
                    : arrivesToday ? "Sosire astăzi" : `Sosire ${fmtDate(res.checkin)}`)}</span></span>
            </button>
          )}

          {msgOpen ? (
            <div className="msg-compose">
              <textarea rows={3} autoFocus maxLength={2000} value={msgText} placeholder="ex. Sosesc după ora 22 · cerere pat suplimentar"
                onChange={(e) => setMsgText(e.target.value)} />
              <div className="actiuni-msg-actions">
                <button className="btn btn-ghost btn-mic"
                  onClick={() => { setMsgOpen(false); setMsgText(""); }}>Renunță</button>
                <button className="btn btn-primary btn-lat actiuni-btn-salveaza"
                  onClick={() => ruleaza(addMessage)} disabled={!msgText.trim() || busy}>
                  <Check size={14} /> Salvează
                </button>
              </div>
            </div>
          ) : (
            <button className="action-item" onClick={() => setMsgOpen(true)}>
              <span className="ai-ico"><MessageSquare size={17} /></span>
              <span className="ai-body"><span className="ai-t">Adaugă mesaj</span>
                <span className="ai-d">{messages.length ? `${messages.length} mesaje pe rezervare` : "Notă vizibilă pentru echipă"}</span></span>
            </button>
          )}

          {messages.length > 0 && !msgOpen && (
            <div className="msg-list">
              {messages.slice(-3).reverse().map((m) => (
                <div className="msg-item" key={m.id}>
                  <div className="msg-text">{m.text}</div>
                  <div className="msg-meta">{m.author} · {fmtDateTime(m.ts)}</div>
                </div>
              ))}
            </div>
          )}

          {canNoShow(res, now) && (
            <button className="action-item" disabled={busy} onClick={() => ruleaza(async () => {
              await updateReservations(reservations.map((r) => (r.id === res.id ? { ...r, status: "noshow" } : r)));
              await audit.push("No-show",
                `${guestFullName(guest) || "Fără nume"} · ${room?.name} · ${fmtDate(res.checkin)}`, { roomId: res.roomId, reservationId: res.id });
              onClose();
            })}>
              <span className="ai-ico"><UserCheck size={17} /></span>
              <span className="ai-body"><span className="ai-t">Marchează no-show</span>
                <span className="ai-d">Nu s-a prezentat — camera se eliberează</span></span>
            </button>
          )}

          <button className="action-item" onClick={onMove} disabled={!isLive(res)}>
            <span className="ai-ico"><MoveRight size={17} /></span>
            <span className="ai-body"><span className="ai-t">Mută camera</span>
              <span className="ai-d">Alegi apoi camera și ziua de sosire</span></span>
          </button>

          {canCancel(res) && (
            confirmCancel ? (
              <div className="action-confirm">
                <span>Anulezi rezervarea?</span>
                <div className="actiuni-confirm-actions">
                  <button className="btn btn-ghost btn-mic" onClick={() => setConfirmCancel(false)} disabled={busy}>Nu</button>
                  <button className="btn btn-danger btn-mic" onClick={() => ruleaza(cancel)} disabled={busy}>Da, anulează</button>
                </div>
              </div>
            ) : (
              <button className="action-item danger" onClick={() => setConfirmCancel(true)}>
                <span className="ai-ico"><XCircle size={17} /></span>
                <span className="ai-body"><span className="ai-t">Anulează rezervarea</span>
                  <span className="ai-d">Rămâne în calendar, marcată ca anulată</span></span>
              </button>
            )
          )}
        </div>

        {actionError && <div className="drag-error mt-10" role="alert">{actionError}</div>}

        <button className="btn btn-ghost w-full mt-6" onClick={onClose}>Închide</button>
      </Dialog>
  );
}
