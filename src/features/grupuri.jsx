/* GRUPURI — rezervari legate intre ele, cu un client platitor comun si
 * ocupanti proprii pe fiecare camera.
 *
 * GroupPrint (lista de cazare) sta aici, nu in documente/, fiindca e strans
 * legata de editorul de grup: aceleasi date, aceeasi fereastra parinte.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Plus, X, Check, Trash2, Pencil, Printer, UsersRound, ArrowRight, AlertTriangle, Search } from "lucide-react";
import { supabase } from "../supabase.js";
import { uid } from "../lib/uid.js";
import { mesajEroare } from "../lib/errors.js";
import { audit, isAdmin } from "../lib/audit.js";
import { guestFullName, occupantName } from "../lib/nume.js";
import { nightsBetween, isLive, startOfDay, rangesOverlap, validateStay } from "../lib/availability.js";
import { reservationTotal, liveReservationTotalOnline } from "../lib/pricing.js";
import { isSameDay } from "../lib/tranzitii.js";
import { fmtMoney, fmtDate, fmtDateFull, toDateInput, initials, withNewDate, FMT_DATE, FMT_DATE_FULL } from "../lib/format.js";
import { ROOM_TYPE, STATUS_LABEL, TARI } from "../lib/constante.js";
import { Dialog, toaster, useModalLock, PdfPreview, OccupantStepper, Paginare, usePaginare } from "../ui/primitive.jsx";
import { generatePdfBlob } from "../lib/pdf.js";
import { reconciliazaAcces } from "./acces.jsx";

export function GroupPrint({ group, core, reservations, onClose }) {
  const sheetRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [pdf, setPdf] = useState(null);
  const download = async () => {
    setDownloading(true);
    /* Fara `catch`, un esec de generare trecea complet neobservat: butonul
       clipea „Se generează…", revenea, si nu aparea niciun fisier si niciun
       mesaj. Mai bine o eroare vizibila decat o tacere. */
    try {
      const blob = await generatePdfBlob(sheetRef.current);
      setPdf({ blob, filename: `Cazare-grup-${group.id}.pdf` });
    }
    catch (e) { toaster.show(mesajEroare(e, "PDF-ul nu a putut fi generat"), { tone: "danger" }); }
    finally { setDownloading(false); }
  };
  const rows = reservations
    .filter((r) => r.groupId === group.id)
    .sort((a, b) => (core.rooms.find((x) => x.id === a.roomId)?.name || "")
      .localeCompare(core.rooms.find((x) => x.id === b.roomId)?.name || ""));

  const main = core.guests.find((g) => g.id === group.mainGuestId);
  const ci = rows.length ? new Date(Math.min(...rows.map((r) => new Date(r.checkin)))) : null;
  const co = rows.length ? new Date(Math.max(...rows.map((r) => new Date(r.checkout)))) : null;
  const totAd = rows.reduce((n, r) => n + (r.adults ?? 2), 0);
  const totCh = rows.reduce((n, r) => n + (r.children ?? 0), 0);
  const totVal = rows.reduce((v, r) => v + reservationTotal(r, core), 0);
  const nightsPerRoom = rows.map((r) => nightsBetween(r.checkin, r.checkout));
  const totNights = nightsPerRoom.reduce((a, b) => a + b, 0);
  const minN = nightsPerRoom.length ? Math.min(...nightsPerRoom) : 0;
  const maxN = nightsPerRoom.length ? Math.max(...nightsPerRoom) : 0;
  const nightsLabel = !nightsPerRoom.length ? "—" : minN === maxN ? String(minN) : `${minN}–${maxN}`;
  const sameIn = rows.every((r) => isSameDay(r.checkin, rows[0].checkin));
  const sameOut = rows.every((r) => isSameDay(r.checkout, rows[0].checkout));
  const d = (v) => FMT_DATE_FULL.format(new Date(v)).replace(/\./g, "-");
  const ds = (v) => FMT_DATE.format(new Date(v)).replace(/\.$/, "");

  return (
    <Dialog onClose={onClose} className="arrival-modal" overlayClassName="arrival-overlay" title={undefined}>
      <div className="modal-head no-print">
        <h3>Listă cazare grup</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={download} disabled={downloading}>
            <Printer size={15} /> {downloading ? "Se generează…" : "Vezi PDF"}
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Închide fereastra"><X size={16} /></button>
        </div>
      </div>

      {pdf && (
        <div onClick={(e) => e.stopPropagation()}>
          <PdfPreview blob={pdf.blob} filename={pdf.filename} onClose={() => setPdf(null)} />
        </div>
      )}

      <div className="arrival-sheet" ref={sheetRef}>
        <div className="fisa rooming-sheet">
          <div className="fisa-top">
            <img src="/logo.png" alt="La Livadă" className="fisa-logo-img" />
            <div className="rs-meta">
              <div className="rs-meta-label">Listă cazare</div>
              <div className="rs-meta-value">{group.name}</div>
              <div className="rs-meta-date">Emisă {d(new Date())}</div>
            </div>
          </div>

          <div className="rs-summary">
            <div className="rs-line">
              <div className="rs-cell rs-grow">
                <span className="rs-k">Client principal</span>
                <span className="rs-v">{guestFullName(main) || "—"}</span>
              </div>
              <div className="rs-cell">
                <span className="rs-k">Nopți</span>
                <span className="rs-v">{nightsLabel}</span>
              </div>
              <div className="rs-cell">
                <span className="rs-k">Camere</span>
                <span className="rs-v">{rows.length}</span>
              </div>
              <div className="rs-cell">
                <span className="rs-k">Persoane</span>
                <span className="rs-v">{totAd + totCh}</span>
              </div>
            </div>
            <div className="rs-line">
              <div className="rs-cell rs-grow">
                <span className="rs-k">Data sosirii</span>
                <span className="rs-v">{ci ? d(ci) : "—"}{sameIn ? "" : " (diferite)"}</span>
              </div>
              <div className="rs-cell rs-grow">
                <span className="rs-k">Data plecării</span>
                <span className="rs-v">{co ? d(co) : "—"}{sameOut ? "" : " (diferite)"}</span>
              </div>
            </div>
          </div>

          <div className="rooming-wrap">
          <table className="rooming">
            <thead>
              <tr>
                <th className="c-num">#</th>
                <th className="c-room">Cameră</th>
                <th className="c-occ">Ocupant</th>
                <th className="c-d">Perioadă</th>
                <th className="c-n">Nopți</th>
                <th className="c-n">Pers.</th>
                <th className="c-sign">Semnătură</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const room = core.rooms.find((x) => x.id === r.roomId);
                const ad = r.adults ?? 2, ch = r.children ?? 0;
                return (
                  <tr key={r.id}>
                    <td className="c-num">{i + 1}</td>
                    <td className="c-room">
                      <span className="rs-room-no">{room?.name}</span>
                      <span className="rs-room-type">{ROOM_TYPE[room?.type]?.label}</span>
                    </td>
                    <td className="c-occ">{occupantName(r, core, group ? [group] : null) || ""}</td>
                    <td className="c-d">
                      <span className="rs-d1">{ds(r.checkin)}</span>
                      <span className="rs-d2">{ds(r.checkout)}</span>
                    </td>
                    <td className="c-n">{nightsBetween(r.checkin, r.checkout)}</td>
                    <td className="c-n c-tot">
                      {ad + ch}
                      {ch > 0 && <span className="rs-brk">{ad}+{ch}</span>}
                    </td>
                    <td className="c-sign" />
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="c-num" />
                <td className="c-room">Total</td>
                <td className="c-occ">{rows.length} camere</td>
                <td className="c-d" />
                <td className="c-n">{totNights}</td>
                <td className="c-n c-tot">
                  {totAd + totCh}
                  {totCh > 0 && <span className="rs-brk">{totAd}+{totCh}</span>}
                </td>
                <td className="c-sign" />
              </tr>
            </tfoot>
          </table>
          </div>

          <div className="rs-value">Valoare totală sejur: <strong>{fmtMoney(totVal)}</strong></div>

          <div className="rs-notes">
            <div className="rs-notes-title">Observații</div>
            <div className="rs-notes-lines"><span /><span /><span /></div>
          </div>

          <div className="sheet-sign">
            <div>Reprezentant grup</div>
            <div>Recepție</div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   GROUP EDITOR
   Rooms can be added, swapped or dropped, and occupancy set per
   room — all reservations of the group stay in step.
----------------------------------------------------------------*/

export function GroupEditor({ group, core, groups, updateGroups, reservations, updateReservations, blocks, onClose, onPrint }) {
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  if (!group) return null;

  const rows = reservations
    .filter((r) => r.groupId === group.id)
    .sort((a, b) => (core.rooms.find((x) => x.id === a.roomId)?.name || "")
      .localeCompare(core.rooms.find((x) => x.id === b.roomId)?.name || ""));

  const span = rows.length
    ? {
        checkin: new Date(Math.min(...rows.map((r) => new Date(r.checkin)))).toISOString(),
        checkout: new Date(Math.max(...rows.map((r) => new Date(r.checkout)))).toISOString(),
      }
    : null;

  const groupRoomIds = new Set(rows.map((r) => r.roomId));

  /* Rooms taken by anything else live in this window (any reservation
     except exceptResId, plus maintenance blocks). Deliberately not
     special-cased by group: a room double-booked by two reservations
     of the *same* group is still a real conflict, so every other room
     is checked the same way regardless of which group it belongs to. */
  const busyIn = (fromISO, toISO, exceptResId) => {
    const set = new Set();
    const ci = new Date(fromISO), co = new Date(toISO);
    if (isNaN(ci.getTime()) || isNaN(co.getTime())) return set;
    for (const r of reservations) {
      if (!isLive(r) || r.id === exceptResId) continue;
      if (rangesOverlap(ci, co, r.checkin, r.checkout)) set.add(r.roomId);
    }
    for (const b of blocks || []) {
      if (rangesOverlap(ci, co, b.start, b.end)) set.add(b.roomId);
    }
    return set;
  };

  const busyRooms = span ? busyIn(span.checkin, span.checkout) : new Set();

  const freeRooms = core.rooms.filter((r) => !busyRooms.has(r.id) && !groupRoomIds.has(r.id));
  const totalGuests = rows.reduce((n, r) => n + (r.adults ?? 2) + (r.children ?? 0), 0);
  const namedRooms = rows.filter((r) =>
    r.occupantLastName?.trim() && r.occupantFirstName?.trim() && r.occupantPhone?.trim()).length;
  const nightsList = rows.map((r) => nightsBetween(r.checkin, r.checkout));
  const minN = nightsList.length ? Math.min(...nightsList) : 0;
  const maxN = nightsList.length ? Math.max(...nightsList) : 0;
  const totalValue = rows.reduce((v, r) => v + reservationTotal(r, core), 0);

  /* Recalculeaza bookedPrice doar cand se schimba ceva ce afecteaza pretul
     (data, ocupare, camera) si doar daca rezervarea nu are deja un pret
     manual — altfel un tarif modificat intre timp ar "sari" pe rezervari
     deja facute, fara sa fi fost editate cu adevarat. */
  const PRICE_AFFECTING = ["roomId", "checkin", "checkout", "adults", "children"];
  const patchRow = async (id, patch) => {
    const row = reservations.find((r) => r.id === id);
    let finalPatch = patch;
    if (row && row.priceOverride == null && PRICE_AFFECTING.some((f) => patch[f] !== undefined)) {
      finalPatch = { ...patch, bookedPrice: liveReservationTotalOnline({ ...row, ...patch }, core, reservations) };
    }
    await updateReservations(reservations.map((r) => (r.id === id ? { ...r, ...finalPatch } : r)));
    setError("");
    /* Editările din grup ocolesc fereastra rezervării, deci sincronizarea
       yalei trebuie chemată și de aici — altfel o cameră schimbată în grup
       ar lăsa codul vechi activ pe ușa veche. */
    if (row) {
      try { await reconciliazaAcces(row, { ...row, ...finalPatch }, core); }
      catch (e) { console.error("Sincronizare acces", e); }
    }
  };

  /* Keeps the free-text occupantName (used everywhere else for display)
     in sync whenever the structured last/first name fields change.
     Also seeds the two structured fields from any legacy combined
     occupantName the first time a room is edited, so an older/seeded
     row doesn't silently lose half its name on the first keystroke. */
  const patchOccupant = async (id, patch) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const [legacyLast, ...legacyRest] = (row.occupantName || "").trim().split(" ");
    const base = {
      occupantLastName: row.occupantLastName ?? legacyLast ?? "",
      occupantFirstName: row.occupantFirstName ?? legacyRest.join(" "),
      occupantPhone: row.occupantPhone ?? "",
    };
    const next = { ...base, ...patch };
    const combined = [next.occupantLastName, next.occupantFirstName]
      .filter((v) => v?.trim()).join(" ").trim();
    await patchRow(id, { ...base, ...patch, occupantName: combined });
  };

  /* Applies one period to every room, keeping each room's own time of day. */
  const shiftAll = async (newIn, newOut) => {
    const ci = newIn ? new Date(newIn) : new Date(span.checkin);
    const co = newOut ? new Date(newOut) : new Date(span.checkout);
    const err = validateStay(ci, co);
    if (err) { setError(err); return; }

    const clashes = rows.filter((r) =>
      busyIn(ci.toISOString(), co.toISOString(), r.id).has(r.roomId));
    if (clashes.length) {
      const names = clashes.map((r) => core.rooms.find((x) => x.id === r.roomId)?.name).join(", ");
      setError(`Ocupate în intervalul ales: ${names}`);
      return;
    }

    const ids = new Set(rows.map((r) => r.id));
    await updateReservations(reservations.map((r) => {
      if (!ids.has(r.id)) return r;
      const patched = { ...r, checkin: ci.toISOString(), checkout: co.toISOString() };
      return r.priceOverride == null ? { ...patched, bookedPrice: liveReservationTotalOnline(patched, core, reservations) } : patched;
    }));
    await audit.push("Perioadă grup schimbată",
      `${group.name}: ${fmtDate(ci)} → ${fmtDate(co)} · ${rows.length} camere`);

    /* Aceeași perioadă nouă pentru toate camerele: fiecare cod de acces
       trebuie adus la zi separat, fiindcă fiecare stă pe altă yală. */
    for (const r of rows) {
      const inainte = reservations.find((x) => x.id === r.id);
      if (!inainte) continue;
      try {
        await reconciliazaAcces(inainte,
          { ...inainte, checkin: ci.toISOString(), checkout: co.toISOString() }, core);
      } catch (e) { console.error("Sincronizare acces", e); }
    }
    toaster.show(`Perioada grupului mutată pe ${fmtDate(ci)} → ${fmtDate(co)}`, { tone: "ok" });
    setError("");
  };

  /* Each room may run on its own dates — validate that room alone. */
  const changeDates = async (id, newIn, newOut) => {
    const row = rows.find((r) => r.id === id);
    const ci = newIn ? new Date(newIn) : new Date(row.checkin);
    const co = newOut ? new Date(newOut) : new Date(row.checkout);
    const err = validateStay(ci, co);
    if (err) { setError(err); return; }
    if (busyIn(ci.toISOString(), co.toISOString(), id).has(row.roomId)) {
      setError(`Camera ${core.rooms.find((x) => x.id === row.roomId)?.name} este ocupată în intervalul ales.`);
      return;
    }
    await patchRow(id, { checkin: ci.toISOString(), checkout: co.toISOString() });
    await audit.push("Interval schimbat în grup",
      `${group.name} · ${core.rooms.find((x) => x.id === row.roomId)?.name}: ${fmtDate(ci)} → ${fmtDate(co)}`);
  };

  const moveRow = async (id, newRoomId) => {
    const row = rows.find((r) => r.id === id);
    if (busyIn(row.checkin, row.checkout, id).has(newRoomId)) {
      setError("Camera aleasă este ocupată în intervalul acestei camere.");
      return;
    }
    const newCap = core.rooms.find((x) => x.id === newRoomId)?.capacity || 20;
    const occ = (row.adults ?? 2) + (row.children ?? 0);
    if (occ > newCap) {
      setError(`Ocuparea actuală (${occ}) depășește capacitatea camerei alese (${newCap}).`);
      return;
    }
    const from = core.rooms.find((x) => x.id === row.roomId)?.name;
    const to = core.rooms.find((x) => x.id === newRoomId)?.name;
    await patchRow(id, { roomId: newRoomId });
    await audit.push("Cameră schimbată în grup", `${group.name}: ${from} → ${to}`);
    toaster.show(`Mutat din ${from} în ${to}`, { tone: "ok" });
  };

  const addRoom = async (roomId) => {
    if (!span) { setError("Grupul nu mai are nicio rezervare de la care să preiau datele."); return; }
    const template = rows[0];
    const recordBase = {
      id: uid(), roomId, guestId: group.mainGuestId, groupId: group.id,
      checkin: span.checkin, checkout: span.checkout,
      status: template?.status === "cancelled" ? "confirmed" : (template?.status || "confirmed"),
      notes: "", priceOverride: null, adults: 2, children: 0,
      source: template?.source || "direct", tags: [], messages: [],
    };
    const record = { ...recordBase, bookedPrice: liveReservationTotalOnline(recordBase, core, reservations) };
    await updateReservations([...reservations, record]);
    const rn = core.rooms.find((x) => x.id === roomId)?.name;
    await audit.push("Cameră adăugată în grup", `${group.name}: ${rn}`);
    toaster.show(`Camera ${rn} adăugată în grup`, { tone: "ok" });
    setAddOpen(false);
    setError("");
  };

  const dropRoom = async (id) => {
    const row = rows.find((r) => r.id === id);
    const rn = core.rooms.find((x) => x.id === row.roomId)?.name;
    const before = reservations;
    const next = reservations.filter((r) => r.id !== id);
    await updateReservations(next);
    await audit.push("Cameră scoasă din grup", `${group.name}: ${rn}`);
    toaster.show(`Camera ${rn} scoasă din grup`, {
      tone: "danger",
      onUndo: async () => { await updateReservations(before); },
    });
    if (!next.some((r) => r.groupId === group.id)) {
      await updateGroups(groups.filter((g) => g.id !== group.id));
      onClose();
    }
  };

  const renameGroup = async (name) => {
    await updateGroups(groups.map((g) => (g.id === group.id ? { ...g, name } : g)));
  };

  return (
    <Dialog onClose={onClose} title={`Grup: ${group.name}`}>
      <label className="field">
        <span className="fl">Nume grup</span>
        <input value={group.name} onChange={(e) => renameGroup(e.target.value)} />
      </label>

      <div className="group-summary">
        <div><strong>{rows.length}</strong> camere</div>
        <div><strong>{totalGuests}</strong> persoane</div>
        <div><strong>{minN === maxN ? minN : `${minN}–${maxN}`}</strong> nopți</div>
        <div><strong>{namedRooms}</strong>/{rows.length} cu ocupant</div>
        <div><strong>{fmtMoney(totalValue)}</strong></div>
      </div>

      {span && (
        <div className="grp-period">
          <div className="grp-period-head">Perioadă pentru tot grupul</div>
          <div className="grp-dates">
            <label className="grp-num">
              <span>Sosire</span>
              <input type="date" value={toDateInput(span.checkin)}
                onChange={(e) => shiftAll(withNewDate(span.checkin, e.target.value), null)} />
            </label>
            <label className="grp-num">
              <span>Plecare</span>
              <input type="date" value={toDateInput(span.checkout)}
                onChange={(e) => shiftAll(null, withNewDate(span.checkout, e.target.value))} />
            </label>
            <div className="grp-nights">
              <span>{nightsBetween(span.checkin, span.checkout)}</span>
              nopți
            </div>
          </div>
          <p className="grp-period-hint">
            Schimbarea aici mută toate camerele. Fiecare cameră poate fi ajustată separat mai jos.
          </p>
        </div>
      )}

      {span && (
        <div className="note" style={{ marginBottom: 12 }}>
          Interval grup: {fmtDate(span.checkin)} → {fmtDate(span.checkout)}. Fiecare cameră poate avea propriile
          date — camerele adăugate pornesc de la intervalul grupului și pot fi ajustate individual.
        </div>
      )}

      {error && <div className="drag-error" role="alert" style={{ marginBottom: 10 }}>{error}</div>}

      <div className="grp-rows">
        {rows.map((r) => {
          return (
            <div className="grp-row" key={r.id}>
              <div className="grp-row-head">
                <select
                  value={r.roomId}
                  onChange={(e) => moveRow(r.id, e.target.value)}
                  aria-label="Schimbă camera"
                >
                  <option value={r.roomId}>
                    {core.rooms.find((x) => x.id === r.roomId)?.name} — {ROOM_TYPE[core.rooms.find((x) => x.id === r.roomId)?.type]?.label}
                  </option>
                  {freeRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} — {ROOM_TYPE[room.type]?.label}
                    </option>
                  ))}
                </select>
                <button className="icon-btn" onClick={() => dropRoom(r.id)}
                  aria-label="Scoate camera din grup" title="Scoate camera din grup">
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="grp-dates">
                <label className="grp-num">
                  <span>Sosire</span>
                  <input type="date" value={toDateInput(r.checkin)}
                    onChange={(e) => changeDates(r.id, withNewDate(r.checkin, e.target.value), null)} />
                </label>
                <label className="grp-num">
                  <span>Plecare</span>
                  <input type="date" value={toDateInput(r.checkout)}
                    onChange={(e) => changeDates(r.id, null, withNewDate(r.checkout, e.target.value))} />
                </label>
                <div className="grp-nights">
                  <span>{nightsBetween(r.checkin, r.checkout)}</span>
                  nopți
                </div>
              </div>

              <div className="grp-row-body">
                {(() => {
                  const roomCap = core.rooms.find((x) => x.id === r.roomId)?.capacity || 20;
                  return (
                    <>
                      <div className="grp-num">
                        <span>Adulți</span>
                        <OccupantStepper label="Adulți" value={r.adults ?? 2} otherValue={r.children ?? 0} capacity={roomCap} min={1}
                          onChange={(n) => patchRow(r.id, { adults: n })} />
                      </div>
                      <div className="grp-num">
                        <span>Copii</span>
                        <OccupantStepper label="Copii" value={r.children ?? 0} otherValue={r.adults ?? 2} capacity={roomCap} min={0}
                          onChange={(n) => patchRow(r.id, { children: n })} />
                      </div>
                    </>
                  );
                })()}
                <div className="grp-price">{fmtMoney(reservationTotal(r, core))}</div>
              </div>

              {(() => {
                const [legacyLast, ...legacyRest] = (r.occupantName || "").trim().split(" ");
                const lastVal = r.occupantLastName ?? legacyLast ?? "";
                const firstVal = r.occupantFirstName ?? legacyRest.join(" ");
                const phoneVal = r.occupantPhone ?? "";
                const complete = lastVal.trim() && firstVal.trim() && phoneVal.trim();
                return (
                  <div className="grp-occupant">
                    <div className="grp-occupant-head">
                      <span>Ocupant cameră</span>
                      {!complete && <span className="grp-occupant-required">Nume, prenume și telefon obligatorii</span>}
                    </div>
                    <div className="grp-occupant-row">
                      <input
                        className={!lastVal.trim() ? "input-error" : ""}
                        value={lastVal}
                        placeholder="Nume *"
                        aria-label="Numele ocupantului"
                        onChange={(e) => patchOccupant(r.id, { occupantLastName: e.target.value })}
                      />
                      <input
                        className={!firstVal.trim() ? "input-error" : ""}
                        value={firstVal}
                        placeholder="Prenume *"
                        aria-label="Prenumele ocupantului"
                        onChange={(e) => patchOccupant(r.id, { occupantFirstName: e.target.value })}
                      />
                      <input
                        className={!phoneVal.trim() ? "input-error" : ""}
                        value={phoneVal}
                        type="tel"
                        placeholder="Telefon *"
                        aria-label="Telefonul ocupantului"
                        onChange={(e) => patchOccupant(r.id, { occupantPhone: e.target.value })}
                        onBlur={() => {
                          if (lastVal.trim() && firstVal.trim() && phoneVal.trim()) {
                            audit.push("Ocupant setat",
                              `${group.name} · ${core.rooms.find((x) => x.id === r.roomId)?.name}: ${lastVal.trim()} ${firstVal.trim()}`);
                          }
                        }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {addOpen ? (
        <div className="subform">
          <div className="subform-head">
            Adaugă cameră
            <button className="link-btn" onClick={() => setAddOpen(false)}>Renunță</button>
          </div>
          {freeRooms.length === 0 ? (
            <p style={{ fontSize: "var(--fs-base)", color: "var(--text-muted)", margin: "0 0 12px" }}>
              Nicio cameră liberă în intervalul grupului.
            </p>
          ) : (
            <div className="room-chips" style={{ marginBottom: 12 }}>
              {freeRooms.map((room) => (
                <button className="room-chip" key={room.id} onClick={() => addRoom(room.id)}>
                  {room.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button className="btn btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Adaugă cameră în grup
        </button>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onPrint}>
          <Printer size={15} /> Listă cazare
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>
          <Check size={15} /> Gata
        </button>
      </div>

    </Dialog>
  );
}

export function GroupsView({ core, groups, updateGroups, reservations, updateReservations, blocks }) {
  const [confirmId, setConfirmId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [printId, setPrintId] = useState(null);
  const [q, setQ] = useState("");

  const removeGroup = async (groupId) => {
    const g = groups.find((x) => x.id === groupId);
    const n = reservations.filter((r) => r.groupId === groupId).length;
    await updateReservations(reservations.filter((r) => r.groupId !== groupId));
    await updateGroups(groups.filter((x) => x.id !== groupId));
    await audit.push("Grup șters", `${g?.name || groupId} · ${n} rezervări`);
    const beforeRes = reservations, beforeGroups = groups;
    toaster.show(`Grupul ${g?.name || ""} a fost șters`, {
      tone: "danger",
      onUndo: async () => {
        await updateReservations(beforeRes);
        await updateGroups(beforeGroups);
        await audit.push("Ștergere grup anulată", g?.name || groupId);
      },
    });
    setConfirmId(null);
  };

  const sorted = [...groups].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const rows = sorted.map((g) => {
    const res = reservations.filter((r) => r.groupId === g.id);
    const main = core.guests.find((x) => x.id === g.mainGuestId);
    const rooms = res.map((r) => core.rooms.find((rm) => rm.id === r.roomId)?.name).filter(Boolean);
    const ci = res.length ? new Date(Math.min(...res.map((r) => new Date(r.checkin)))) : null;
    const co = res.length ? new Date(Math.max(...res.map((r) => new Date(r.checkout)))) : null;
    return { g, main, rooms, ci, co };
  });

  const t = q.trim().toLowerCase();
  const filtered = !t ? rows : rows.filter(({ g, main }) =>
    g.name.toLowerCase().includes(t) || (main && guestFullName(main).toLowerCase().includes(t)));
  /* Verificarea de lista goala vine dupa hook-uri: React cere ca ele sa
     fie apelate in aceeasi ordine la fiecare randare, deci nu pot sta
     dupa un return conditionat. */
  const paginare = usePaginare(filtered);

  if (!sorted.length) {
    return (
      <div className="empty-state">
        <UsersRound size={26} />
        <h4>Niciun grup</h4>
        <p>Creezi un grup din Calendar → Rezervare nouă → Grup.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar">
        <div className="search-box">
          <Search size={15} color="var(--text-muted)" />
          <input placeholder="Caută după numele grupului sau clientul principal"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="badge-count">{filtered.length} {filtered.length === 1 ? "grup" : "grupuri"}</span>
      </div>

      <div className="panel group-table">
        <div className="gt-row gt-head">
          <div className="gt-col gt-col-name">Grup</div>
          <div className="gt-col gt-col-period">Perioadă</div>
          <div className="gt-col gt-col-rooms">Camere</div>
          <div className="gt-col gt-col-actions" />
        </div>

        {filtered.length === 0 ? (
          <div className="section-empty">Niciun grup nu corespunde căutării.</div>
        ) : paginare.feliate.map(({ g, main, rooms, ci, co }) => {
          const visibleRooms = rooms.slice(0, 4);
          const extra = rooms.length - visibleRooms.length;
          return (
            <div className="gt-row" key={g.id}>
              <div className="gt-col gt-col-name">
                <div className="primary truncate" title={g.name}>{g.name}</div>
                <div className="secondary truncate" title={main ? guestFullName(main) : undefined}>
                  {main ? guestFullName(main) : "Fără client principal"}
                </div>
              </div>
              <div className="gt-col gt-col-period">
                {ci && co
                  ? <span className="mono">{fmtDate(ci)} → {fmtDate(co)}</span>
                  : <span className="secondary">—</span>}
              </div>
              <div className="gt-col gt-col-rooms">
                <div className="group-rooms">
                  {visibleRooms.map((n) => <span className="room-tag mono" key={n}>{n}</span>)}
                  {extra > 0 && <span className="room-tag room-tag-more">+{extra}</span>}
                  {!rooms.length && <span className="secondary">Fără camere</span>}
                </div>
              </div>
              <div className="gt-col gt-col-actions">
                {confirmId === g.id ? (
                  <>
                    {/* Verificare proprie, nu doar pe butonul care deschide
                        confirmarea: rolul se re-verifică periodic (vezi
                        pms-app.jsx) fără să remonteze acest ecran, deci
                        confirmId ar putea rămâne setat după o retrogradare
                        din admin. */}
                    {isAdmin() && (
                      <button className="btn btn-danger" style={{ padding: "8px 12px" }} onClick={() => removeGroup(g.id)}>
                        Șterge tot
                      </button>
                    )}
                    <button className="btn btn-ghost" style={{ padding: "8px 12px" }} onClick={() => setConfirmId(null)}>
                      Renunță
                    </button>
                  </>
                ) : (
                  <>
                    <button className="icon-btn" onClick={() => setPrintId(g.id)}
                      title="Listă cazare pentru print" aria-label={`Printează lista grupului ${g.name}`}>
                      <Printer size={14} />
                    </button>
                    <button className="icon-btn" onClick={() => setEditId(g.id)}
                      title="Editează grupul" aria-label={`Editează grupul ${g.name}`}>
                      <Pencil size={14} />
                    </button>
                    {/* Doar adminul poate șterge grupul (și rezervările lui) —
                        recepția editează și adaugă. Oglindește politica RLS
                        "sterge grupuri". */}
                    {isAdmin() && (
                      <button className="icon-btn" onClick={() => setConfirmId(g.id)}
                        title="Șterge grupul și rezervările lui" aria-label={`Șterge grupul ${g.name}`}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Paginare stare={paginare} eticheta={paginare.totalItems === 1 ? "grup" : "grupuri"} />

      {printId && (
        <GroupPrint
          group={sorted.find((g) => g.id === printId)}
          core={core}
          reservations={reservations}
          onClose={() => setPrintId(null)}
        />
      )}

      {editId && (
        <GroupEditor
          group={sorted.find((g) => g.id === editId)}
          core={core}
          groups={groups}
          updateGroups={updateGroups}
          reservations={reservations}
          updateReservations={updateReservations}
          onClose={() => setEditId(null)}
          blocks={blocks}
          onPrint={() => { setPrintId(editId); setEditId(null); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   SHARED: check-in / check-out actions
----------------------------------------------------------------*/
