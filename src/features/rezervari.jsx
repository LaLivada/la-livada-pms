/* REZERVARI — calendarul, fereastra de rezervare, actiunile pe ea,
 * check-in / check-out si ecranul Azi.
 *
 * Inima aplicatiei. Regulile de tranzitie (cine poate face check-in si cand,
 * fereastra de check-in, night audit-ul) NU sunt aici: stau in lib/tranzitii.js,
 * testate — o regula despre timp verificata cu "acum" real trece sau cade
 * dupa ora la care ruleaza suita.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  CalendarDays, Users, DoorOpen, Plus, X, Search, ChevronLeft, ChevronRight,
  Sparkles, Check, Trash2, Pencil, UsersRound, LogIn, LogOut, Printer, Eye,
  ArrowRight, MoveRight, XCircle, MessageSquare, AlertTriangle, RefreshCw,
  Undo2, Copy, Info, Wrench, Tag as TagIcon, Rows2, Rows3, Zap, Flame, Wind, Snowflake, UserCheck,
} from "lucide-react";
import { uid } from "../lib/uid.js";
import { mesajEroare } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { guestFullName, occupantName } from "../lib/nume.js";
import { nightsBetween, rangesOverlap, validateStay, isLive, isStatsEligible, startOfDay } from "../lib/availability.js";
import { reservationTotal, nightlyRate, liveReservationTotalOnline } from "../lib/pricing.js";
import { splitEvenly } from "../lib/money.js";
import { isSameDay, isToday, canCheckIn, canCheckOut, canCancel, canNoShow, checkouturiRestante, zileIntarziere, sosiriRestante, zileIntarziereSosire, ZILE_CHECKIN_DEVREME } from "../lib/tranzitii.js";
import { fmtMoney, fmtDate, fmtDateFull, fmtDateTime, toDateInput, toLocalInputValue, withNewDate, initials, validatePrice, FMT_DATE, FMT_TIME, FMT_WEEKDAY, FMT_MONTH_YEAR } from "../lib/format.js";
import { ROOM_TYPE, STATUS_LABEL, STATUS_GLYPH, STATUS_CLASS, CREATE_STATUSES, EDIT_STATUSES, SOURCES, sourceLabel, DEFAULT_TAGS, HK_STATUSES } from "../lib/constante.js";
import { Dialog, toaster, useModalLock, useAduInVizor, usePaginare, Paginare, Stat, Section, OccupantStepper } from "../ui/primitive.jsx";
import { snakeRes } from "../data/mapari.js";
import { syncTable } from "../data/nucleu.js";
import { SectiuneAcces, cheamaAcces, reconciliazaAcces } from "./acces.jsx";
import { FolioPanel, InvoicePrint, BillingCustomerPicker, BillingCustomerModal, billingCustomerLabel } from "./facturare.jsx";
import { GuestFields, GuestModal, ContactQuickActions, emptyGuest } from "./clienti.jsx";
import { ArrivalForm } from "./documente.jsx";
import { GroupEditor, GroupPrint } from "./grupuri.jsx";

export function NightAuditGate({ restante, sosiri, core, updateCore, groups, updateGroups, blocks, updateBlocks, reservations, updateReservations, housekeeping, updateHousekeeping, onLogout }) {
  const [busyId, setBusyId] = useState(null);
  const [modal, setModal] = useState(null); // { reservation } — deschis din Editează, mai jos

  const marcheazaNoShow = async (r) => {
    const camera = core.rooms.find((x) => x.id === r.roomId);
    await updateReservations(reservations.map((x) => (x.id === r.id ? { ...x, status: "noshow" } : x)));
    await audit.push("No-show", `${camera?.name || r.roomId} · ${occupantName(r, core, groups) || "Fără nume"}`);
  };

  const anuleaza = async (r) => {
    const camera = core.rooms.find((x) => x.id === r.roomId);
    await updateReservations(reservations.map((x) => (x.id === r.id ? { ...x, status: "cancelled" } : x)));
    await audit.push("Rezervare anulată",
      `${camera?.name || r.roomId} · ${occupantName(r, core, groups) || "Fără nume"} · ${fmtDate(r.checkin)}`);
  };

  return (
    <div className="login-wrap">
      <div className="boot boot-error" style={{ maxWidth: 560, alignItems: "stretch", textAlign: "left" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <AlertTriangle size={24} style={{ flexShrink: 0 }} />
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
          <div className="panel" style={{ marginTop: 4 }}>
            {restante.map((r) => {
              const camera = core.rooms.find((x) => x.id === r.roomId);
              const zile = zileIntarziere(r);
              return (
                <div className="list-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }} key={r.id}>
                  <div style={{ minWidth: 0 }}>
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
                    <button className="btn btn-ghost" onClick={() => setModal({ reservation: r })}>
                      <Pencil size={14} /> Editează
                    </button>
                    <button className="btn btn-primary"
                      disabled={busyId === r.id}
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
          <div className="panel" style={{ marginTop: restante.length > 0 ? 10 : 4 }}>
            {sosiri.map((r) => {
              const camera = core.rooms.find((x) => x.id === r.roomId);
              const zile = zileIntarziereSosire(r);
              return (
                <div className="list-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }} key={r.id}>
                  <div style={{ minWidth: 0 }}>
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
                      disabled={busyId === r.id}
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
                      disabled={busyId === r.id}
                      onClick={async () => {
                        if (busyId) return;
                        setBusyId(r.id);
                        try { await marcheazaNoShow(r); } finally { setBusyId(null); }
                      }}>
                      {busyId === r.id ? "…" : <><UserCheck size={14} /> No-show</>}
                    </button>
                    <button className="btn btn-danger"
                      disabled={busyId === r.id}
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

        <button className="btn btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={onLogout}>
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
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   LOGIN
----------------------------------------------------------------*/

export function CalendarView({ core, updateCore, reservations, updateReservations, groups, updateGroups, housekeeping, updateHousekeeping, blocks, updateBlocks, intent, clearIntent }) {
  const [offset, setOffset] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dense, setDense] = useState(false);
  const [actionRes, setActionRes] = useState(null);
  const [blockInfo, setBlockInfo] = useState(null);
  const [moveId, setMoveId] = useState(null);
  const [dragError, setDragError] = useState("");
  /* Fereastra vizibila. Latimea unei zile ramane 66px, deci grila creste
     in lateral si se deruleaza — 30 de zile inseamna ~2060px, adica vreo
     doua ecrane de laptop. Alegerea e deliberata: mai bine derulezi si
     citesti numele oaspetilor, decat sa incapa luna intreaga cu bare fara
     nume. Butoanele de navigare pasesc tot cu DAYS, ca sa nu sara peste
     zile intre doua ferestre. */
  const DAYS = 30;
  const [modal, setModal] = useState(null); // { reservation | null, defaultRoomId, defaultDate }
  const [viewModal, setViewModal] = useState(null); // rezervarea afișată doar-vizualizare, sau null

  const days = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + offset);
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); return d;
    });
  }, [offset]);

  const rangeStart = days[0], rangeEnd = new Date(days[DAYS - 1].getTime() + 86400000);

  const moveReservation = async (resId, targetRoomId, targetDay) => {
    const res = reservations.find((r) => r.id === resId);
    if (!res) return;
    const nights = nightsBetween(res.checkin, res.checkout);
    const oldCi = new Date(res.checkin), oldCo = new Date(res.checkout);
    const newCi = new Date(targetDay);
    newCi.setHours(oldCi.getHours(), oldCi.getMinutes(), 0, 0);
    const newCo = new Date(newCi);
    newCo.setDate(newCi.getDate() + nights);
    newCo.setHours(oldCo.getHours(), oldCo.getMinutes(), 0, 0);

    // Across a DST boundary the wall-clock arithmetic above can land a day off.
    // Correct it so the stay always keeps exactly the same number of nights.
    const drift = nights - nightsBetween(newCi, newCo);
    if (drift !== 0) newCo.setDate(newCo.getDate() + drift);

    if (targetRoomId === res.roomId && newCi.getTime() === oldCi.getTime()) return;

    const clash = reservations.some((r) =>
      r.id !== resId && r.roomId === targetRoomId && isLive(r) &&
      newCi < new Date(r.checkout) && newCo > new Date(r.checkin))
      || (blocks || []).some((b) =>
        b.roomId === targetRoomId && newCi < new Date(b.end) && newCo > new Date(b.start));
    if (clash) {
      const rn = core.rooms.find((r) => r.id === targetRoomId)?.name;
      setDragError(`Camera ${rn} e ocupată în intervalul ales.`);
      setTimeout(() => setDragError(""), 3500);
      return;
    }

    await updateReservations(reservations.map((r) => r.id === resId
      ? { ...r, roomId: targetRoomId, checkin: newCi.toISOString(), checkout: newCo.toISOString() }
      : r));

    const fromRoom = core.rooms.find((r) => r.id === res.roomId)?.name;
    const toRoom = core.rooms.find((r) => r.id === targetRoomId)?.name;
    const who = guestFullName(core.guests.find((g) => g.id === res.guestId)) || "Fără nume";
    await audit.push("Rezervare mutată",
      `${who}: ${fromRoom} ${fmtDate(oldCi)} → ${toRoom} ${fmtDate(newCi)}`);
  };

  useEffect(() => {
    if (intent === "group") {
      setModal({ reservation: null, mode: "group" });
      clearIntent();
    }
  }, [intent, clearIntent]);

  const jumpTo = (target) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    setOffset(Math.round((target - today) / 86400000));
    setPickerOpen(false);
  };

  useEffect(() => {
    if (!pickerOpen) return;
    const close = () => setPickerOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [pickerOpen]);

  /* Parse every date string once per data change instead of re-parsing it
     inside each per-room, per-day comparison below, and bucket by room so
     the calendar walks the reservation list once in total rather than once
     for each of the 16 rooms. */
  const resByRoom = useMemo(() => {
    const map = new Map();
    for (const r of reservations) {
      if (!isLive(r)) continue;
      const ciMs = new Date(r.checkin).getTime();
      const coMs = new Date(r.checkout).getTime();
      if (!Number.isFinite(ciMs) || !Number.isFinite(coMs)) continue;
      // Day-level boundaries too: occupancy is counted in room-nights, and
      // the night of day D belongs to a stay only when ciDay <= D < coDay.
      const ciDay = new Date(ciMs); ciDay.setHours(0, 0, 0, 0);
      const coDay = new Date(coMs); coDay.setHours(0, 0, 0, 0);
      let bucket = map.get(r.roomId);
      if (!bucket) { bucket = []; map.set(r.roomId, bucket); }
      bucket.push({ res: r, ciMs, coMs, ciDayMs: ciDay.getTime(), coDayMs: coDay.getTime() });
    }
    return map;
  }, [reservations]);

  const blocksByRoom = useMemo(() => {
    const map = new Map();
    for (const b of blocks || []) {
      const sMs = new Date(b.start).getTime();
      const eMs = new Date(b.end).getTime();
      if (!Number.isFinite(sMs) || !Number.isFinite(eMs)) continue;
      let bucket = map.get(b.roomId);
      if (!bucket) { bucket = []; map.set(b.roomId, bucket); }
      bucket.push({ block: b, sMs, eMs });
    }
    return map;
  }, [blocks]);

  /* Day boundaries as plain numbers, computed once per date range. */
  const dayMs = useMemo(() => days.map((d) => d.getTime()), [days]);

  /* Occupancy is the number of rooms sold for that night. A stay occupies
     the night of day D only while ciDay <= D < coDay — the departure day
     itself is not a sold night, so a same-day turnover counts once (the
     arriving guest), not twice as it did when any overlap with the
     calendar day was treated as occupancy. */
  const dailyOccupancy = useMemo(() => {
    const stays = [];
    for (const bucket of resByRoom.values()) {
      for (const e of bucket) stays.push(e);
    }
    return dayMs.map((dStart) => {
      let occ = 0;
      for (const e of stays) if (e.ciDayMs <= dStart && e.coDayMs > dStart) occ++;
      return { occ, pct: core.rooms.length ? Math.round((occ / core.rooms.length) * 100) : 0 };
    });
  }, [dayMs, resByRoom, core.rooms.length]);

  const rangeStartMs = rangeStart.getTime(), rangeEndMs = rangeEnd.getTime();

  const spanIndices = (startMs, endMs) => {
    let startIdx = -1, endIdx = -1;
    for (let i = 0; i < dayMs.length; i++) {
      const dStart = dayMs[i], dEnd = dStart + 86400000;
      if (startMs < dEnd && endMs > dStart) {
        if (startIdx === -1) startIdx = i;
        endIdx = i;
      }
    }
    return { startIdx, endIdx };
  };

  const spansForRoomRaw = (roomId) =>
    (resByRoom.get(roomId) || [])
      .filter((e) => e.coMs > rangeStartMs && e.ciMs < rangeEndMs)
      .map(({ res: r, ciMs, coMs }) => {
        const { startIdx, endIdx } = spanIndices(ciMs, coMs);
        if (startIdx === -1) return null;
        const ciDay = new Date(ciMs); ciDay.setHours(0, 0, 0, 0);
        const coDay = new Date(coMs); coDay.setHours(0, 0, 0, 0);
        return {
          res: r, startIdx, endIdx, len: endIdx - startIdx + 1,
          nights: Math.max(1, Math.round((coDay - ciDay) / 86400000)),
          clipStart: ciMs < rangeStartMs,
          clipEnd: coMs > rangeEndMs,
        };
      })
      .filter(Boolean);

  const blockSpansForRoomRaw = (roomId) =>
    (blocksByRoom.get(roomId) || [])
      .filter((e) => e.eMs > rangeStartMs && e.sMs < rangeEndMs)
      .map(({ block: b, sMs, eMs }) => {
        const { startIdx, endIdx } = spanIndices(sMs, eMs);
        if (startIdx === -1) return null;
        return { block: b, startIdx, endIdx, len: endIdx - startIdx + 1 };
      })
      .filter(Boolean);

  const rowSpans = useMemo(() => {
    const map = {};
    core.rooms.forEach((room) => {
      map[room.id] = { res: spansForRoomRaw(room.id), blocks: blockSpansForRoomRaw(room.id) };
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core.rooms, resByRoom, blocksByRoom, dayMs]);


  return (
    <div className="cal-view">
      <div className="toolbar cal-toolbar">
        <div className="week-nav">
          <button onClick={() => setOffset((o) => o - DAYS)} aria-label={`Cele ${DAYS} zile anterioare`}>
            <ChevronLeft size={15} />
            <span>{DAYS} zile</span>
          </button>
          <div className="jump-wrap">
            <button className={offset === 0 ? "on" : ""} onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v); }}>
              <CalendarDays size={14} />
              <span>{offset === 0 ? "Azi" : fmtDate(days[0])}</span>
            </button>
            {pickerOpen && (
              <div className="jump-pop" onClick={(e) => e.stopPropagation()}>
                <label>Sari la data</label>
                <input
                  type="date"
                  autoFocus
                  value={toDateInput(days[0])}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    jumpTo(new Date(e.target.value + "T00:00:00"));
                  }}
                />
                <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => { setOffset(0); setPickerOpen(false); }}>
                  Înapoi la azi
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setOffset((o) => o + DAYS)} aria-label={`Următoarele ${DAYS} zile`}>
            <span>{DAYS} zile</span>
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="grow" />
        <button
          className={"icon-btn" + (dense ? " active" : "")}
          onClick={() => setDense((v) => !v)}
          aria-pressed={dense}
          title={dense ? "Vedere confortabilă" : "Vedere compactă"}
          aria-label={dense ? "Treci la vedere confortabilă" : "Treci la vedere compactă"}
        >
          {dense ? <Rows3 size={16} /> : <Rows2 size={16} />}
        </button>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ reservation: null })}>
          <Plus size={15} />
          <span className="lbl-long">Rezervare nouă</span>
          <span className="lbl-short">Rezervare</span>
        </button>
      </div>

      {dragError && <div className="drag-error" role="alert">{dragError}</div>}
      {moveId ? (
        <div className="move-banner" role="status">
          <MoveRight size={15} />
          <span>Atinge celula unde muți rezervarea — camera și ziua de sosire.</span>
          <button className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={() => setMoveId(null)}>Renunță</button>
        </div>
      ) : null}

      <div className={"cal-scroll" + (dense ? " dense" : "")}>
        <div className="cal-grid" style={{ "--days": DAYS }}>
          <div className="cal-row cal-head">
            <div className="cal-roomcell"><div className="cal-roomcell-inner" style={{ fontWeight: 700, fontSize: 12 }}>Cameră</div></div>
            {days.map((d, i) => {
              const wk = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={i} className={"cal-daycell" + (isToday(d) ? " today" : wk ? " weekend" : "")}>
                  {FMT_WEEKDAY.format(d)}<br />{fmtDate(d)}
                </div>
              );
            })}
          </div>

          {core.rooms.map((room, roomIdx) => {
            const spans = rowSpans[room.id]?.res || [];
            const bSpans = rowSpans[room.id]?.blocks || [];
            // Rooms are listed grouped by type; mark where one type ends and
            // the next begins so tiny houses and lofts read as separate blocks.
            const prevType = roomIdx > 0 ? core.rooms[roomIdx - 1].type : null;
            const startsNewType = room.type !== prevType;
            return (
              <React.Fragment key={room.id}>
                {startsNewType && (
                  <div className="cal-typerow" aria-hidden="true">
                    <div className="cal-typelabel">{ROOM_TYPE[room.type]?.label || room.type}</div>
                  </div>
                )}
              <div className="cal-row">
                <div className="cal-roomcell">
                  <div className="cal-roomcell-inner">
                    <div className="rname">{room.name}</div>
                    <div className="rfloor">
                      {ROOM_TYPE[room.type]?.short || ""}
                      {room.capacity > 2 && <span className="room-cap-plus"> +</span>}
                    </div>
                  </div>
                </div>
                {days.map((d, i) => {
                  /* O rezervare care incepe INAINTE de fereastra vizibila e
                     "clipata" — spanIndices() nu are de unde sa stie ziua ei
                     reala de start (nu e in dayMs), asa ca prima zi vizibila
                     (i=0) devine startIdx-ul ei. Cand chiar in acea zi mai
                     soseste si un oaspete nou (turnover), ambele span-uri
                     ajung cu startIdx===i — un singur `.find()` ar arata doar
                     primul si l-ar pierde din vedere pe celalalt cu totul, nu
                     doar la click. De-asta se randeaza TOATE span-urile
                     ancorate in ziua i, nu doar primul gasit. */
                  const cellSpans = spans.filter((sp) => sp.startIdx === i);
                  const covered = cellSpans[0] || spans.find((sp) => i >= sp.startIdx && i <= sp.endIdx);
                  const bSpan = bSpans.find((sp) => sp.startIdx === i);
                  const bCovered = bSpans.find((sp) => i >= sp.startIdx && i <= sp.endIdx);
                  return (
                    <div
                      key={i}
                      className={"cal-cell"
                        + (d.getDay() === 0 || d.getDay() === 6 ? " weekend" : "")
                        + (moveId ? " movable" : "")}
                      onClick={() => {
                        if (moveId) { moveReservation(moveId, room.id, d); setMoveId(null); return; }
                        if (bCovered) { setBlockInfo(bCovered.block); return; }
                        if (covered) setActionRes(covered.res);
                        else setModal({ reservation: null, defaultRoomId: room.id, defaultDate: d });
                      }}
                    >
                      {bSpan && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); setBlockInfo(bSpan.block); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBlockInfo(bSpan.block); }
                          }}
                          className="cal-bar block-bar"
                          style={{ width: `calc(${bSpan.len} * 100% - 6px)` }}
                          title={`Blocat: ${bSpan.block.reason}`}
                        >
                          <Wrench size={11} style={{ flexShrink: 0 }} />
                          <span className="bar-name">{bSpan.block.reason}</span>
                        </div>
                      )}

                      {cellSpans.map((span) => {
                        // Reservation bars start/end at the midpoint of the checkin/checkout
                        // day cell, so a same-day turnover shows both the departing and the
                        // arriving stay side by side instead of one full cell hiding the other.
                        // Computed straight from the reservation's own checkin/checkout dates
                        // (not from span.len) since len counts the checkout day as fully
                        // occupied whenever checkout isn't exactly midnight — using it here
                        // pushed the bar a whole extra cell too far, overlapping the next stay.
                        // Clipped ends (stay continues outside the visible date range) stay
                        // flush with the cell edge instead of stopping at a midpoint.
                        const ciIdx = Math.floor((new Date(span.res.checkin) - rangeStart) / 86400000);
                        const coIdx = Math.floor((new Date(span.res.checkout) - rangeStart) / 86400000);
                        const leftAbs = span.clipStart ? span.startIdx : ciIdx + 0.5;
                        const rightAbs = span.clipEnd ? days.length : coIdx + 0.5;
                        const barLeft = span.clipStart ? "3px" : "calc(50% + 3px)";
                        const barWidthUnits = rightAbs - leftAbs;
                        return (
                          <div
                            key={span.res.id}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); if (moveId) return; setActionRes(span.res); }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActionRes(span.res); }
                            }}
                            className={"cal-bar " + STATUS_CLASS[span.res.status] +
                              (span.clipStart ? " clip-start" : "") + (span.clipEnd ? " clip-end" : "") +
                              (moveId === span.res.id ? " moving" : "")}
                            style={{ left: barLeft, width: `calc(${barWidthUnits} * 100% - 6px)` }}
                            title={`${occupantName(span.res, core, groups) || "Fără nume"} · ${fmtDateTime(span.res.checkin)} → ${fmtDateTime(span.res.checkout)} · ${STATUS_LABEL[span.res.status]}`}
                          >
                            <span className="bar-glyph" aria-hidden="true">{STATUS_GLYPH[span.res.status]}</span>
                            {span.res.groupId && <UsersRound size={11} style={{ flexShrink: 0, opacity: .8 }} />}
                            <span className="bar-name">
                              {occupantName(span.res, core, groups) || "Fără nume"}
                            </span>
                            {span.res.tags?.includes("VIP") && <span className="bar-vip">VIP</span>}
                            {span.res.messages?.length > 0 && <MessageSquare size={10} style={{ flexShrink: 0, opacity: .75 }} />}
                            {span.nights > 2 && <span className="bar-nights">{span.nights}n</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              </React.Fragment>
            );
          })}

          <div className="cal-row cal-foot">
            <div className="cal-roomcell">
              <div className="cal-roomcell-inner">
                <div className="rname" style={{ fontSize: 11, fontFamily: "inherit", fontWeight: 700 }}>Ocupare</div>
              </div>
            </div>
            {days.map((d, i) => {
              const { occ, pct } = dailyOccupancy[i];
              return (
                <div key={i} className={"cal-occ" + (isToday(d) ? " today" : "")}
                  title={`${occ} din ${core.rooms.length} camere ocupate`}>
                  <div className="occ-num mono">{occ}</div>
                  <div className="occ-pct">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {blockInfo && (
        <Dialog onClose={() => setBlockInfo(null)} className="action-modal" title={undefined}>
            <div className="action-head">
              <div>
                <div className="action-guest">{blockInfo.reason}</div>
                <div className="action-meta">
                  <span className="mono">{core.rooms.find((r) => r.id === blockInfo.roomId)?.name}</span>
                  {" · "}{fmtDate(blockInfo.start)} → {fmtDate(blockInfo.end)}
                </div>
              </div>
              <span className="role-tag role-receptionist">Blocaj</span>
            </div>
            <div className="action-list">
              <button className="action-item danger" onClick={async () => {
                const before = blocks || [];
                await updateBlocks(before.filter((b) => b.id !== blockInfo.id));
                await audit.push("Blocaj eliminat",
                  `${core.rooms.find((r) => r.id === blockInfo.roomId)?.name} · ${blockInfo.reason}`);
                toaster.show("Blocajul a fost eliminat", {
                  tone: "danger",
                  onUndo: async () => { await updateBlocks(before); },
                });
                setBlockInfo(null);
              }}>
                <span className="ai-ico"><Trash2 size={17} /></span>
                <span className="ai-body"><span className="ai-t">Elimină blocajul</span>
                  <span className="ai-d">Camera redevine disponibilă</span></span>
              </button>
            </div>
            <button className="btn btn-ghost" style={{ width: "100%", marginTop: 6 }} onClick={() => setBlockInfo(null)}>Închide</button>
          </Dialog>
      )}

      <div className="cal-legend">
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <span className="legend-item" key={k}>
            <span className={"legend-chip " + STATUS_CLASS[k]}>{STATUS_GLYPH[k]}</span>{v}
          </span>
        ))}
        <span className="legend-item">
          <span className="legend-chip block-bar"><Wrench size={9} /></span>Blocaj
        </span>
      </div>

      {actionRes && (
        <ReservationActions
          res={actionRes}
          core={core}
          groups={groups}
          reservations={reservations}
          updateReservations={updateReservations}
          housekeeping={housekeeping}
          updateHousekeeping={updateHousekeeping}
          onOpen={() => { setViewModal(actionRes); setActionRes(null); }}
          onEdit={() => { setModal({ reservation: actionRes }); setActionRes(null); }}
          onMove={() => { setMoveId(actionRes.id); setActionRes(null); setDragError(""); }}
          onClose={() => setActionRes(null)}
        />
      )}

      {viewModal && (
        <ReservationViewModal
          reservation={viewModal}
          core={core}
          updateCore={updateCore}
          groups={groups}
          updateGroups={updateGroups}
          reservations={reservations}
          updateReservations={updateReservations}
          blocks={blocks}
          onClose={() => setViewModal(null)}
          onEdit={() => { setModal({ reservation: viewModal }); setViewModal(null); }}
        />
      )}

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
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/* Stepper +/- pentru adulti/copii — evita inputurile numerice native (care
   fac zoom pe iOS la focus si permit tastarea unei valori peste capacitate)
   si aplica limita direct in logica de crestere/scadere. */

export function ReservationViewModal({ reservation, core, updateCore, groups, updateGroups, reservations, updateReservations, blocks, onClose, onEdit }) {
  useModalLock();
  const guest = core.guests.find((g) => g.id === reservation.guestId) || null;
  const room = core.rooms.find((r) => r.id === reservation.roomId);
  const editingGroup = reservation.groupId ? groups.find((g) => g.id === reservation.groupId) : null;

  const [billingCustomerId, setBillingCustomerId] = useState(reservation.billingCustomerId || "");
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [showArrival, setShowArrival] = useState(false);
  // "edit" deschide grupul, "print" lista de cazare — acelasi tipar ca in GroupsView.
  const [groupModal, setGroupModal] = useState(null);

  const saveNewBillingCustomer = async (customer) => {
    if ((core.billingCustomers || []).some((c) => c.id === customer.id)) { setBillingCustomerId(customer.id); setBillingModalOpen(false); return; }
    await updateCore({ ...core, billingCustomers: [...(core.billingCustomers || []), customer] });
    await audit.push("Client de facturare adăugat", billingCustomerLabel(customer));
    setBillingCustomerId(customer.id);
    setBillingModalOpen(false);
  };

  return (
    <Dialog onClose={onClose} title="Vezi rezervarea">
      {/* `flexDirection: row` explicit: .action-head trece pe coloană sub
          640px, iar aici vrem butonul chiar în dreapta rândurilor, și pe
          telefon. Rândurile din stânga stau strânse (margin-top mic). */}
      <div className="action-head" style={{ flexDirection: "row", alignItems: "flex-start", flexWrap: "nowrap", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="action-guest">{occupantName(reservation, core, groups) || "Fără nume"}</div>
          {guestFullName(guest) && guestFullName(guest) !== occupantName(reservation, core, groups) && (
            <div className="action-meta" style={{ marginTop: 1 }}>Rezervat de {guestFullName(guest)}</div>
          )}
          <div className="action-meta" style={{ marginTop: 1 }}>
            <span className="mono">{room?.name}</span> · {fmtDate(reservation.checkin)} → {fmtDate(reservation.checkout)}
            {" · "}{nightsBetween(reservation.checkin, reservation.checkout)} nopți
          </div>
          <div className="action-meta" style={{ marginTop: 1 }}>
            {reservation.adults ?? 2} adulți{reservation.children ? ` + ${reservation.children} copii` : ""} · {sourceLabel(reservation.source)} · {fmtMoney(reservationTotal(reservation, core))}
          </div>
          <div style={{ marginTop: 6 }}>
            <span className={"role-tag " + (reservation.status === "checkedin" ? "role-housekeeping"
              : reservation.status === "cancelled" ? "role-receptionist" : "role-admin")}>
              <span aria-hidden="true">{STATUS_GLYPH[reservation.status]}</span> {STATUS_LABEL[reservation.status]}
            </span>
          </div>
          {reservation.tags?.length > 0 && (
            <div className="tag-row">
              {reservation.tags.map((t) => <span className="tag-mini" key={t}>{t}</span>)}
            </div>
          )}
        </div>
        <button className="btn btn-ghost" style={{ width: "auto", padding: "8px 12px", flexShrink: 0 }} onClick={() => setShowArrival(true)}>
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
          <div className="ldv-mic">{reservation.notes}</div>
        </div>
      )}

      {reservation.messages?.length > 0 && (
        <div className="field">
          <label>Mesaje ({reservation.messages.length})</label>
          <div className="msg-list" style={{ marginTop: 0 }}>
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

      <FolioPanel reservation={reservation} core={core} updateCore={updateCore}
        billingCustomerId={billingCustomerId} setBillingCustomerId={setBillingCustomerId}
        onNewBillingCustomer={() => setBillingModalOpen(true)} />

      <div className="modal-actions">
        <div className="grow" />
        <button className="btn btn-ghost" onClick={onClose}>Închide</button>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={onEdit}>
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

export function ReservationModal({ data, core, updateCore, reservations, updateReservations, groups, updateGroups, blocks, updateBlocks, onClose }) {
  useModalLock();
  const editing = data.reservation;
  const [mode, setMode] = useState(data.mode || "single");
  const [roomId, setRoomId] = useState(editing?.roomId || data.defaultRoomId || core.rooms[0]?.id || "");
  const [roomIds, setRoomIds] = useState(data.defaultRoomId ? [data.defaultRoomId] : []);
  const [groupName, setGroupName] = useState("");
  const [guestId, setGuestId] = useState(editing?.guestId || "");
  const [guestQuery, setGuestQuery] = useState("");
  const [guestFormSeed, setGuestFormSeed] = useState(null);
  const [billingCustomerId, setBillingCustomerId] = useState(editing?.billingCustomerId || "");
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [checkin, setCheckin] = useState(
    editing ? toLocalInputValue(editing.checkin) :
    (() => { const d = data.defaultDate ? new Date(data.defaultDate) : new Date(); d.setHours(15, 0, 0, 0); return toLocalInputValue(d.toISOString()); })()
  );
  const [checkout, setCheckout] = useState(
    editing ? toLocalInputValue(editing.checkout) :
    (() => { const d = data.defaultDate ? new Date(data.defaultDate) : new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0); return toLocalInputValue(d.toISOString()); })()
  );
  const [status, setStatus] = useState(editing?.status || "confirmed");
  /* La creare: doar Cerere/Confirmata/Protocol. La editare: starile
     operationale clasice — plus statusul curent, daca a ramas pe
     Cerere/Protocol si n-a fost inca trecut mai departe, ca sa nu
     dispara din select fara sa fi fost ales explicit altceva. */
  const statusOptions = !editing
    ? CREATE_STATUSES
    : EDIT_STATUSES.includes(editing.status) ? EDIT_STATUSES : [editing.status, ...EDIT_STATUSES];
  const [priceOverride, setPriceOverride] = useState(editing?.priceOverride ?? "");
  const [adults, setAdults] = useState(editing?.adults ?? 2);
  const [children, setChildren] = useState(editing?.children ?? 0);
  const [source, setSource] = useState(editing?.source || "direct");
  const [tags, setTags] = useState(editing?.tags || []);
  const [newTag, setNewTag] = useState("");
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [showArrival, setShowArrival] = useState(false);
  const [notes, setNotes] = useState(editing?.notes || "");
  const [error, setError] = useState("");
  /* Blocheaza butoanele cat timp scrierea e in curs: un dublu-click putea
     altfel trimite doua scrieri suprapuse (a doua cu o stampila deja
     depasita) sau sterge de doua ori. Acelasi tipar exista deja la plati
     si la anulare/stornare. */
  const [saving, setSaving] = useState(false);
  const guests = core.guests;
  /* Cu tastatura deschisa pe telefon, lista de rezultate cadea sub
     marginea modalului: scriai si nu vedeai ce a gasit. */
  const refRezultateClient = useAduInVizor(Boolean(guestQuery.trim()));

  const isGroup = !editing && mode === "group";
  const isBlock = !editing && mode === "block";
  /* Cat timp e grup, adultii/copiii se aplica identic pe fiecare camera
     selectata — capacitatea folosita e cea mai mica dintre camerele alese,
     ca nicio camera sa nu ramana peste propria capacitate. */
  const maxOccupancy = isGroup
    ? (roomIds.length ? Math.min(...roomIds.map((id) => core.rooms.find((r) => r.id === id)?.capacity || 20)) : 20)
    : (core.rooms.find((r) => r.id === roomId)?.capacity || 20);
  /* Daca nimic ce afecteaza pretul (camera/data/ocupare) nu s-a schimbat
     fata de rezervarea existenta, previzualizarea si salvarea folosesc
     pretul deja inghetat, nu un recalcul cu tarifele curente. */
  const priceAffectingChanged = !editing
    || editing.roomId !== roomId
    || new Date(editing.checkin).getTime() !== new Date(checkin).getTime()
    || new Date(editing.checkout).getTime() !== new Date(checkout).getTime()
    || (editing.adults ?? 2) !== (Number(adults) || 1)
    || (editing.children ?? 0) !== (Number(children) || 0);
  const editingGroup = editing?.groupId ? groups.find((g) => g.id === editing.groupId) : null;
  const selectedGuest = guests.find((g) => g.id === guestId) || null;
  const matchingGuests = (() => {
    const t = guestQuery.trim().toLowerCase();
    if (!t) return [];
    return guests.filter((g) =>
      guestFullName(g).toLowerCase().includes(t) ||
      (g.phone || "").replace(/\s/g, "").includes(t.replace(/\s/g, "")) ||
      (g.city || "").toLowerCase().includes(t)
    );
  })();

  const startAddGuest = () => {
    const parts = guestQuery.trim().split(/\s+/);
    setGuestFormSeed({ ...emptyGuest(), lastName: parts[0] || "", firstName: parts.slice(1).join(" ") });
    setError("");
  };

  const saveNewGuest = async (guest) => {
    if (core.guests.some((g) => g.id === guest.id)) { setGuestId(guest.id); setGuestQuery(""); setGuestFormSeed(null); return; }
    await updateCore({ ...core, guests: [...core.guests, guest] });
    await audit.push("Client adăugat", guestFullName(guest));
    setGuestId(guest.id);
    setGuestQuery("");
    setGuestFormSeed(null);
  };

  const saveNewBillingCustomer = async (customer) => {
    if ((core.billingCustomers || []).some((c) => c.id === customer.id)) { setBillingCustomerId(customer.id); setBillingModalOpen(false); return; }
    await updateCore({ ...core, billingCustomers: [...(core.billingCustomers || []), customer] });
    await audit.push("Client de facturare adăugat", billingCustomerLabel(customer));
    setBillingCustomerId(customer.id);
    setBillingModalOpen(false);
  };

  /* A tag typed here joins the shared list, so it is reusable next time. */
  const commitNewTag = async () => {
    const t = newTag.trim();
    if (!t) { setNewTagOpen(false); return; }
    const list = core.tags || DEFAULT_TAGS;
    if (!list.some((x) => x.toLowerCase() === t.toLowerCase())) {
      await updateCore({ ...core, tags: [...list, t] });
      await audit.push("Etichetă adăugată", t);
    }
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setNewTag(""); setNewTagOpen(false);
  };

  const previewTotal = (() => {
    if (priceOverride !== "") {
      return Math.max(0, Number(priceOverride) || 0);
    }
    if (!isGroup && editing && !priceAffectingChanged && editing.bookedPrice != null) {
      return Number(editing.bookedPrice) || 0;
    }
    const ids = isGroup ? roomIds : [roomId];
    return ids.reduce((sum, rid) =>
      sum + liveReservationTotalOnline({ roomId: rid, checkin, checkout, adults, children, source }, core, reservations), 0);
  })();

  /* One pass over reservations and blocks per date change, rather than a
     scan per room on every render of the form. */
  const busyRooms = useMemo(() => {
    const ci = new Date(checkin), co = new Date(checkout);
    const set = new Set();
    if (isNaN(ci.getTime()) || isNaN(co.getTime())) return set;
    for (const r of reservations) {
      if (!isLive(r) || r.id === editing?.id) continue;
      if (rangesOverlap(ci, co, r.checkin, r.checkout)) set.add(r.roomId);
    }
    for (const b of blocks || []) {
      if (rangesOverlap(ci, co, b.start, b.end)) set.add(b.roomId);
    }
    return set;
  }, [checkin, checkout, reservations, blocks, editing?.id]);

  const conflictsFor = (ids) => ids.filter((rid) => busyRooms.has(rid));

  /* Corpul propriu-zis ramane neschimbat; `save`/`remove` de mai jos doar
     il imbraca in blocajul anti-dublu-click. */
  const saveInner = async (statusNou) => {
    /* Statusul efectiv al acestei salvari. Butoanele de check-in/out il dau
       explicit, ca sa nu depinda de un setState care nu s-a aplicat inca. */
    const statusFinal = statusNou || status;
    if (isBlock) {
      if (roomIds.length < 1) { setError("Selectează cel puțin o cameră de blocat."); return; }
      const dv = validateStay(checkin, checkout);
      if (dv) { setError(dv.replace("check-in", "început").replace("check-out", "sfârșit")); return; }
      const busy = conflictsFor(roomIds);
      if (busy.length) {
        const names = busy.map((id) => core.rooms.find((r) => r.id === id)?.name).join(", ");
        setError(`Ocupate în acest interval: ${names}`); return;
      }
      const newBlocks = roomIds.map((rid) => ({
        id: uid(), roomId: rid,
        start: new Date(checkin).toISOString(), end: new Date(checkout).toISOString(),
        reason: blockReason.trim() || "Mentenanță", createdAt: new Date().toISOString(),
      }));
      await updateBlocks([...(blocks || []), ...newBlocks]);
      await audit.push("Camere blocate",
        `${roomIds.map((id) => core.rooms.find((r) => r.id === id)?.name).join(", ")} · ${fmtDate(checkin)} → ${fmtDate(checkout)} · ${blockReason.trim() || "Mentenanță"}`);
      onClose();
      return;
    }

    if (!guestId) {
      setError(isGroup ? "Alege clientul principal al grupului." : "Caută și alege un client, sau adaugă unul nou.");
      return;
    }
    const dateErr = validateStay(checkin, checkout);
    if (dateErr) { setError(dateErr); return; }
    const priceErr = validatePrice(priceOverride);
    if (priceErr) { setError(priceErr); return; }
    if (!Number.isFinite(Number(adults)) || Number(adults) < 1) { setError("Numărul de adulți trebuie să fie cel puțin 1."); return; }
    if (!Number.isFinite(Number(children)) || Number(children) < 0) { setError("Numărul de copii nu poate fi negativ."); return; }
    /* Adulti/copii se clampeaza reactiv doar cand se modifica direct acele
       campuri — schimbarea camerei (sau a camerelor de grup) dupa aceea nu
       le reajusteaza, asa ca ocuparea trebuie reverificata explicit aici. */
    if (Number(adults) + Number(children) > maxOccupancy) {
      setError(`Ocuparea aleasă (${Number(adults) + Number(children)}) depășește capacitatea ${isGroup ? "camerelor selectate" : "camerei selectate"} (${maxOccupancy}).`);
      return;
    }

    /* Fara asta, dropdownul de status ar putea trece rezervarea in
       "checked-in" la orice data, ocolind regula pe care butoanele o
       respecta. Se blocheaza doar TRECEREA in checked-in — un sejur deja
       inceput ramane valid.
       Regula vine din canCheckIn (lib/tranzitii.js), nu e rescrisa aici:
       verificam data din FORMULAR (posibil modificata acum), cu statusul
       "confirmed" pe care rezervarea trebuie sa-l aiba ca sa poata fi
       cazata. */
    if (statusFinal === "checkedin" && editing?.status !== "checkedin"
      && !canCheckIn({ status: "confirmed", checkin })) {
      setError(`Check-in-ul se poate face cu cel mult ${ZILE_CHECKIN_DEVREME} zile înainte de sosire.`);
      return;
    }

    if (isGroup) {
      if (roomIds.length < 1) { setError("Selectează cel puțin o cameră pentru grup."); return; }
      if (!groupName.trim()) { setError("Dă un nume grupului."); return; }
      const busy = conflictsFor(roomIds);
      if (busy.length) {
        const names = busy.map((id) => core.rooms.find((r) => r.id === id)?.name).join(", ");
        setError(`Ocupate în acest interval: ${names}`); return;
      }
      const groupId = uid();
      const group = {
        id: groupId, name: groupName.trim(), mainGuestId: guestId,
        createdAt: new Date().toISOString(), notes,
      };
      /* Pretul manual pe grup e TOTALUL sejurului, deci se imparte intre
         camere, nu se copiaza pe fiecare. splitEvenly imparte la nivel de
         ban (nu de leu, ca inainte) si distribuie restul, astfel incat
         sumele pe camere sa dea exact cat s-a tastat. */
      const groupTotal = priceOverride === "" ? null : Math.max(0, Number(priceOverride) || 0);
      const coteGrup = groupTotal != null ? splitEvenly(groupTotal, roomIds.length) : null;
      const newRes = roomIds.map((rid, idx) => {
        const base = {
          id: uid(), roomId: rid, guestId, groupId,
          checkin: new Date(checkin).toISOString(), checkout: new Date(checkout).toISOString(),
          status: statusFinal, notes,
          adults: Number(adults) || 1, children: Number(children) || 0, source,
          tags: [...tags], messages: [], billingCustomerId: billingCustomerId || null,
        };
        return coteGrup == null
          ? { ...base, priceOverride: null, bookedPrice: liveReservationTotalOnline(base, core, reservations) }
          : { ...base, priceOverride: coteGrup[idx], bookedPrice: null };
      });
      await updateGroups([...groups, group]);
      await updateReservations([...reservations, ...newRes]);
      await audit.push("Grup creat",
        `${group.name} · ${roomIds.length} camere · ${fmtDate(checkin)} → ${fmtDate(checkout)}`);
      onClose();
      return;
    }

    if (conflictsFor([roomId]).length) { setError("Camera este deja rezervată în acest interval."); return; }

    /* Spread `editing` first so fields this form doesn't expose — the
       per-room occupant name/phone on group rooms above all — survive a
       save instead of being silently dropped by a from-scratch rebuild. */
    const recordBase = {
      ...(editing || {}),
      id: editing?.id || uid(), roomId, guestId, groupId: editing?.groupId || null,
      checkin: new Date(checkin).toISOString(), checkout: new Date(checkout).toISOString(),
      status: statusFinal, notes,
      adults: Number(adults) || 1, children: Number(children) || 0, source, tags: [...tags],
      messages: editing?.messages || [], billingCustomerId: billingCustomerId || null,
    };
    /* Pretul manual e mereu explicit. Cel "auto" ramane inghetat in
       bookedPrice pana cand ceva ce chiar afecteaza pretul se schimba
       (data, camera, ocupare) — un simplu re-salvare (ex. doar o nota
       modificata) sau un tarif schimbat ulterior nu il ating.
       priceAffectingChanged e calculat mai sus, langa previewTotal. */
    const record = priceOverride === ""
      ? {
          ...recordBase, priceOverride: null,
          bookedPrice: priceAffectingChanged || editing?.bookedPrice == null
            ? liveReservationTotalOnline(recordBase, core, reservations) : editing.bookedPrice,
        }
      : { ...recordBase, priceOverride: Number(priceOverride), bookedPrice: null };
    const nextRes = editing ? reservations.map((r) => (r.id === editing.id ? record : r)) : [...reservations, record];

    await updateReservations(nextRes);
    const who = guestFullName(core.guests.find((g) => g.id === guestId)) || "Fără nume";
    const rn = core.rooms.find((r) => r.id === roomId)?.name;
    await audit.push(editing ? "Rezervare modificată" : "Rezervare creată",
      `${who} · ${rn} · ${fmtDate(checkin)} → ${fmtDate(checkout)}`);
    /* După salvare, nu înainte: dacă sincronizarea yalei cade, rezervarea
       rămâne modificată. Vezi comentariul de la reconciliazaAcces. */
    if (editing) {
      try { await reconciliazaAcces(editing, record, core); }
      catch (e) { console.error("Sincronizare acces", e); }
    }
    toaster.show(editing ? "Rezervare actualizată" : `Rezervare creată · ${rn}`, { tone: "ok" });
    onClose();
  };

  /* `statusNou` vine de la butoanele "Marchează check-in/out", care salveaza
     pe loc. Nu ne putem baza pe setStatus + save in aceeasi apasare: setarea
     de state nu se vede in `status` decat la urmatorul render, deci salvarea
     ar folosi valoarea veche. */
  const save = async (statusNou) => {
    if (saving) return;
    setSaving(true);
    try { await saveInner(typeof statusNou === "string" ? statusNou : undefined); }
    finally { setSaving(false); }
  };

  const removeInner = async () => {
    /* Revocarea ÎNAINTE de ștergere, nu după: odată rândul dispărut,
       funcția edge nu mai are ce căuta, iar `on delete cascade` șterge și
       codul din access_codes. Fără pasul ăsta ar rămâne un cod activ pe
       yală despre care nu mai există nicio urmă nicăieri — cazul cel mai
       urât, fiindcă nimeni n-ar mai ști nici măcar că trebuie căutat. */
    try {
      const rev = await cheamaAcces("revoke", { reservationId: editing.id });
      if (rev && rev.ok === false && rev.reason !== "neconfigurat") {
        toaster.show(
          "Atenție: codul de acces nu a putut fi șters de pe yală. Verifică în TTHOTEL înainte de a șterge rezervarea.",
          { tone: "danger" });
      }
    } catch (e) { console.error("Revocare acces la ștergere", e); }

    const nextRes = reservations.filter((r) => r.id !== editing.id);
    await updateReservations(nextRes);

    // A group with no reservations left would linger as an orphan.
    if (editing.groupId && !nextRes.some((r) => r.groupId === editing.groupId)) {
      const g = (groups || []).find((x) => x.id === editing.groupId);
      await updateGroups((groups || []).filter((x) => x.id !== editing.groupId));
      if (g) await audit.push("Grup închis", `${g.name} · nu mai are rezervări`);
    }

    const who = guestFullName(core.guests.find((g) => g.id === editing.guestId)) || "Fără nume";
    const rn = core.rooms.find((r) => r.id === editing.roomId)?.name;
    await audit.push("Rezervare ștearsă", `${who} · ${rn} · ${fmtDate(editing.checkin)}`);
    const beforeRes = reservations, beforeGroups = groups;
    toaster.show(`Rezervarea ${who} · ${rn} a fost ștearsă`, {
      tone: "danger",
      onUndo: async () => {
        await updateReservations(beforeRes);
        await updateGroups(beforeGroups);
        await audit.push("Ștergere anulată", `${who} · ${rn}`);
      },
    });
    onClose();
  };

  const remove = async () => {
    if (saving) return;
    setSaving(true);
    try { await removeInner(); } finally { setSaving(false); }
  };

  return (
    <Dialog
      onClose={onClose}
      title={editing ? "Editează rezervarea" : isGroup ? "Rezervare de grup" : isBlock ? "Blocaj cameră" : "Rezervare nouă"}
    >

        {!editing && (
          <div className="mode-switch">
            <button className={mode === "single" ? "on" : ""} onClick={() => { setMode("single"); setError(""); }}>
              <DoorOpen size={14} /> O cameră
            </button>
            <button className={mode === "group" ? "on" : ""} onClick={() => { setMode("group"); setError(""); }}>
              <UsersRound size={14} /> Grup
            </button>
            <button className={mode === "block" ? "on" : ""} onClick={() => { setMode("block"); setError(""); }}>
              <Wrench size={14} /> Blocaj
            </button>
          </div>
        )}

        {editingGroup && (
          <div className="group-banner">
            <UsersRound size={15} />
            <span>Face parte din grupul <strong>{editingGroup.name}</strong></span>
          </div>
        )}

        {isGroup || isBlock ? (
          <>
            {isGroup && <label className="field">
              <span className="fl">Nume grup *</span>
              <input value={groupName} onChange={(e) => { setGroupName(e.target.value); setError(""); }}
                placeholder="ex. Familia Popescu · Nuntă Ionescu" />
            </label>}

            {isBlock && <label className="field">
              <span className="fl">Motiv</span>
              <input value={blockReason} onChange={(e) => { setBlockReason(e.target.value); setError(""); }}
                placeholder="ex. Zugrăvit · reparație boiler" />
            </label>}
            <div className="field">
              <label>{isBlock ? "Camere blocate" : "Camere"} * ({roomIds.length} selectate)</label>
              <div className="room-picker">
                {["tiny", "loft"].map((t) => {
                  const list = core.rooms.filter((r) => r.type === t);
                  if (!list.length) return null;
                  const freeRooms = list.filter((r) => !busyRooms.has(r.id));
                  const allOn = freeRooms.length > 0 && freeRooms.every((r) => roomIds.includes(r.id));
                  return (
                    <div key={t} className="room-picker-group">
                      <div className="room-picker-head">
                        {ROOM_TYPE[t].label}
                        <button className="link-btn" onClick={() => {
                          const free = freeRooms.map((r) => r.id);
                          setRoomIds((prev) => allOn
                            ? prev.filter((id) => !list.some((r) => r.id === id))
                            : [...new Set([...prev, ...free])]);
                          setError("");
                        }}>{allOn ? "Deselectează" : "Toate libere"}</button>
                      </div>
                      <div className="room-chips">
                        {list.map((r) => {
                          const on = roomIds.includes(r.id);
                          const busy = busyRooms.has(r.id);
                          return (
                            <button
                              key={r.id}
                              className={"room-chip" + (on ? " on" : "") + (busy ? " busy" : "")}
                              title={busy ? "Ocupată sau blocată în acest interval" : ""}
                              onClick={() => {
                                setRoomIds((prev) => on ? prev.filter((id) => id !== r.id) : [...prev, r.id]);
                                setError("");
                              }}
                            >
                              {r.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <label className="field">
            <span className="fl">Cameră</span>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              {core.rooms.map((r) => {
                const busy = busyRooms.has(r.id);
                return (
                  <option key={r.id} value={r.id} disabled={busy && r.id !== editing?.roomId}>
                    {r.name} — {ROOM_TYPE[r.type]?.label || ""}{busy && r.id !== editing?.roomId ? " · ocupată" : ""}
                  </option>
                );
              })}
            </select>
          </label>
        )}

        {!isBlock && <div className="field">
          <label>{isGroup ? "Client principal *" : "Client *"}</label>
          {selectedGuest ? (
            <div className="guest-chip">
              <div className="guest-chip-av">{initials(guestFullName(selectedGuest))}</div>
              <div className="guest-chip-body">
                <div className="gname">{guestFullName(selectedGuest)}</div>
                <div className="gmeta">{[selectedGuest.phone, selectedGuest.city].filter(Boolean).join(" · ") || "Fără date de contact"}</div>
              </div>
              <ContactQuickActions guest={selectedGuest} />
              <button className="icon-btn" onClick={() => { setGuestId(""); setGuestQuery(""); }} aria-label="Schimbă clientul">
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="guest-search">
              <div className="search-box" style={{ maxWidth: "none", width: "100%" }}>
                <Search size={15} color="var(--text-muted)" />
                <input
                  value={guestQuery}
                  onChange={(e) => { setGuestQuery(e.target.value); setError(""); }}
                  placeholder="Caută după nume, telefon sau oraș"
                />
              </div>
              {guestQuery.trim() && (
                matchingGuests.length > 0 ? (
                  <div className="guest-results" ref={refRezultateClient}>
                    {matchingGuests.slice(0, 6).map((g) => (
                      <button key={g.id} className="guest-result" onClick={() => { setGuestId(g.id); setGuestQuery(""); }}>
                        <div className="guest-chip-av">{initials(guestFullName(g))}</div>
                        <div>
                          <div className="gname">{guestFullName(g)}</div>
                          <div className="gmeta">{[g.phone, g.city].filter(Boolean).join(" · ")}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="guest-none" ref={refRezultateClient}>
                    <div>Niciun client cu „{guestQuery.trim()}”.</div>
                    <button className="btn btn-primary" style={{ width: "auto", marginTop: 10 }} onClick={startAddGuest}>
                      <Plus size={15} /> Adaugă client nou
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>}

        {!isBlock && (
          <div className="field-row field-row-2col">
            <div className="field">
              <span className="fl">Adulți{isGroup ? " (per cameră)" : ""}</span>
              <OccupantStepper label="Adulți" value={adults} otherValue={children} capacity={maxOccupancy} min={1} onChange={setAdults} />
            </div>
            <div className="field">
              <span className="fl">Copii{isGroup ? " (per cameră)" : ""}</span>
              <OccupantStepper label="Copii" value={children} otherValue={adults} capacity={maxOccupancy} min={0} onChange={setChildren} />
            </div>
          </div>
        )}
        {!isBlock && (
          <div className="note" style={{ marginTop: -6 }}>
            Maxim {maxOccupancy} {maxOccupancy === 1 ? "persoană" : "persoane"} pentru {isGroup ? "camerele selectate" : "camera selectată"}.
          </div>
        )}
        {isGroup && (
          <div className="note">
            Numărul de adulți/copii, etichetele și notele de mai jos se aplică identic pe fiecare
            cameră a grupului. Ocupanții și prețul pot fi ajustați individual după creare, din Grupuri → editează grupul.
          </div>
        )}

        {!isBlock && (
          <label className="field">
            <span className="fl">Sursa rezervării</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((sc) => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
            </select>
          </label>
        )}

        <div className="field-row field-row-dates">
          <label className="field">
            <span className="fl">{isBlock ? "De la" : "Check-in"}</span>
            <input type="date" value={checkin.slice(0, 10)} onChange={(e) => setCheckin(withNewDate(checkin, e.target.value))} />
          </label>
          <label className="field">
            <span className="fl">Zile</span>
            <select
              value={Math.min(30, Math.max(1, nightsBetween(checkin, checkout)))}
              onChange={(e) => {
                const n = Number(e.target.value);
                const [y, m, d] = checkin.slice(0, 10).split("-").map(Number);
                setCheckout(withNewDate(checkout, toDateInput(new Date(y, m - 1, d + n))));
              }}
            >
              {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="fl">{isBlock ? "Până la" : "Check-out"}</span>
            <input type="date" value={checkout.slice(0, 10)} onChange={(e) => setCheckout(withNewDate(checkout, e.target.value))} />
          </label>
        </div>

        {!isBlock && <div className="price-box">
          <div className="pb-info">
            <div className="price-label">
              {nightsBetween(checkin, checkout)} nopți{isGroup && roomIds.length ? ` × ${roomIds.length} camere` : ""}
            </div>
            <div className="price-value">{fmtMoney(previewTotal)}</div>
          </div>
          <div className="pb-manual">
            <label htmlFor="manual-price">Preț manual{isGroup ? " (total grup)" : ""}</label>
            <input id="manual-price" type="number" min="0" step="1" placeholder="auto" value={priceOverride}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || (Number(v) >= 0 && Number.isFinite(Number(v)))) { setPriceOverride(v); setError(""); }
              }} />
          </div>
        </div>}

        {!isBlock && editing && (
          <FolioPanel reservation={editing} core={core} updateCore={updateCore}
            billingCustomerId={billingCustomerId} setBillingCustomerId={setBillingCustomerId}
            onNewBillingCustomer={() => setBillingModalOpen(true)} />
        )}

        {!isBlock && (
          <div className="field">
            <label>Etichete</label>
            <div className="tag-picker">
              {(core.tags || DEFAULT_TAGS).map((t) => (
                <button key={t}
                  className={"tag-chip" + (tags.includes(t) ? " on" : "")}
                  onClick={() => setTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                >{t}</button>
              ))}
              {newTagOpen ? (
                <span className="tag-new">
                  <input
                    autoFocus
                    value={newTag}
                    placeholder="Etichetă nouă"
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitNewTag(); }
                      if (e.key === "Escape") { e.preventDefault(); setNewTagOpen(false); setNewTag(""); }
                    }}
                  />
                  <button className="icon-btn" onClick={commitNewTag} aria-label="Adaugă eticheta">
                    <Check size={14} />
                  </button>
                </span>
              ) : (
                <button className="tag-chip tag-add" onClick={() => setNewTagOpen(true)}>
                  <Plus size={13} /> Etichetă
                </button>
              )}
            </div>
          </div>
        )}

        {!isBlock && (
          <label className="field">
            <span className="fl">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOptions.map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
            </select>
          </label>
        )}

        <label className="field">
          <span className="fl">Note</span>
          <textarea rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observații interne" />
        </label>

        {editing?.messages?.length > 0 && (
          <div className="field">
            <label>Mesaje ({editing.messages.length})</label>
            <div className="msg-list" style={{ marginTop: 0 }}>
              {[...editing.messages].reverse().map((m) => (
                <div className="msg-item" key={m.id}>
                  <div className="msg-text">{m.text}</div>
                  <div className="msg-meta">{m.author} · {fmtDateTime(m.ts)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {editing && !isBlock && <SectiuneAcces res={editing} core={core} />}

        {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}

        {editing && (
          <div className="quick-actions">
            <button className="btn btn-ghost" onClick={() => setShowArrival(true)}>
              <Printer size={14} /> Fișa de sosire
            </button>
            {/* Aceeasi regula canCheckIn ca in panoul din calendar: cu pana
                la ZILE_CHECKIN_DEVREME zile inainte de sosire.
                Butonul SALVEAZA pe loc, nu doar schimba dropdownul de status:
                inainte apela setStatus si atat, iar dropdownul fiind derulat
                sus, in afara ecranului, parea ca apasarea nu face nimic. */}
            {canCheckIn(editing) && (
              <button className="btn btn-ghost" disabled={saving}
                onClick={() => { setStatus("checkedin"); save("checkedin"); }}>
                <LogIn size={14} /> Marchează check-in
              </button>
            )}
            {editing.status === "confirmed" && !canCheckIn(editing) && (
              <span className="quick-hint">
                {new Date(editing.checkin) > new Date()
                  ? `Check-in disponibil cu ${ZILE_CHECKIN_DEVREME} zile înainte de sosire (${fmtDate(editing.checkin)})`
                  : "Sosirea era într-o zi trecută — corectează data de check-in."}
              </span>
            )}
            {canCheckOut(editing) && (
              <button className="btn btn-ghost" disabled={saving}
                onClick={() => { setStatus("checkedout"); save("checkedout"); }}>
                Marchează check-out <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}

        <div className="modal-actions">
          {editing && (
            <button className="btn btn-danger" onClick={remove} disabled={saving}>
              <Trash2 size={14} /> Șterge
            </button>
          )}
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Anulează</button>
          {/* `() => save()`, nu `save`: altfel React ar trimite evenimentul de
              click drept prim argument, adica drept status. */}
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => save()} disabled={saving}>
            <Check size={15} /> {saving ? "Se salvează..." : "Salvează"}
          </button>
        </div>

      {showArrival && editing && (
        <div onClick={(e) => e.stopPropagation()}>
          <ArrivalForm res={editing} core={core} groups={groups} onClose={() => setShowArrival(false)} />
        </div>
      )}

      {guestFormSeed && (
        <div onClick={(e) => e.stopPropagation()}>
          <GuestModal
            guest={guestFormSeed}
            onSave={saveNewGuest}
            onClose={() => setGuestFormSeed(null)}
          />
        </div>
      )}

      {billingModalOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <BillingCustomerModal
            seedFromGuest={selectedGuest}
            existingCustomers={core.billingCustomers || []}
            onSave={saveNewBillingCustomer}
            onClose={() => setBillingModalOpen(false)}
          />
        </div>
      )}
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   CLIENTS VIEW
----------------------------------------------------------------*/

/* `forta` ocoleste doar fereastra de zile dinaintea sosirii (canCheckIn) —
   folosita de night audit, unde operatorul rezolva manual o sosire deja
   restanta (canCheckIn refuza orice zi trecuta, vezi lib/tranzitii.js).
   Garda de camera ocupata ramane oricum, mai jos: aceea nu e o regula de
   fereastra, ci o imposibilitate reala. */
export async function doCheckIn(res, reservations, updateReservations, core, { forta = false } = {}) {
  if (!forta && !canCheckIn(res)) return false;

  // Someone else may still be occupying the room — refuse rather than
  // silently place two guests in it.
  const blocker = reservations.find((r) =>
    r.id !== res.id && r.roomId === res.roomId && r.status === "checkedin" &&
    new Date(r.checkout) > new Date(res.checkin));
  if (blocker) {
    const who = guestFullName(core.guests.find((g) => g.id === blocker.guestId)) || "alt oaspete";
    const room = core.rooms.find((x) => x.id === res.roomId);
    await audit.push("Check-in blocat",
      `${room?.name || res.roomId} · încă ocupată de ${who}`);
    return { error: `Camera ${room?.name || ""} este încă ocupată de ${who}. Fă întâi check-out.` };
  }

  const next = reservations.map((r) => (r.id === res.id ? { ...r, status: "checkedin" } : r));
  await updateReservations(next);
  const room = core.rooms.find((x) => x.id === res.roomId);
  await audit.push("Check-in", `${room?.name || res.roomId} · ${guestFullName(core.guests.find((g) => g.id === res.guestId))}`);
  toaster.show(`Check-in făcut · ${room?.name || ""}`, { tone: "ok" });

  /* Codul de acces se cere DUPĂ ce check-in-ul e salvat, și nu are voie
     să-l răstoarne.
     Un oaspete stă la recepție: dacă yala nu răspunde, operațiunea
     hotelieră trebuie să meargă mai departe, iar codul se poate genera
     din rezervare, cu butonul de acolo. De aceea nu se face `await` pe
     rezultat înainte de a raporta succesul, iar eșecul e doar un
     avertisment — nu o eroare care anulează sosirea.
     `cheamaAcces` nu aruncă niciodată, dar păstrăm și catch-ul: o
     promisiune respinsă aici ar lăsa check-in-ul raportat ca eșuat. */
  if (room?.accessLockId) {
    cheamaAcces("issue", { reservationId: res.id })
      .then((r) => {
        if (r?.ok) {
          toaster.show(`Cod de acces generat · ${room.name || ""}`, { tone: "ok" });
        } else {
          toaster.show(
            `Check-in făcut, dar codul de acces nu a putut fi generat. Îl poți genera din rezervare.`,
            { tone: "danger" });
        }
      })
      .catch(() => { /* check-in-ul e deja făcut; nu-l stricăm */ });
  }

  return true;
}

export async function doCheckOut(res, reservations, updateReservations, core, housekeeping, updateHousekeeping) {
  if (!canCheckOut(res)) return false;
  const next = reservations.map((r) => (r.id === res.id ? { ...r, status: "checkedout" } : r));
  await updateReservations(next);
  await updateHousekeeping({ ...housekeeping, [res.roomId]: { status: "dirty", updatedAt: new Date().toISOString() } });
  const room = core.rooms.find((x) => x.id === res.roomId);
  await audit.push("Check-out", `${room?.name || res.roomId} · camera trecută pe „murdară”`);
  toaster.show(`Check-out făcut · ${room?.name || ""} trecută pe „murdară”`, { tone: "ok" });

  /* Codul se șterge ACUM, nu lăsat să expire singur la ora calculată la
     emitere: camera trece la următorul oaspete, iar un cod încă valid ar
     deschide ușa oricui îl mai are, indiferent cine stă acum acolo.
     Aceeași plasă ca la ștergerea rezervării (removeInner, mai sus): nu
     blocăm check-out-ul dacă revocarea eșuează — operațiunea hotelieră
     contează mai mult — dar avertizăm explicit, ca recepția să știe că
     mai are de verificat manual în TTHOTEL. */
  if (room?.accessLockId) {
    try {
      const rev = await cheamaAcces("revoke", { reservationId: res.id });
      if (rev && rev.ok === false && rev.reason !== "neconfigurat") {
        toaster.show(
          "Check-out făcut, dar codul de acces nu a putut fi șters de pe yală. Verifică în TTHOTEL.",
          { tone: "danger" });
      }
    } catch (e) { console.error("Revocare acces la check-out", e); }
  }

  return true;
}

/* ---------------------------------------------------------------
   ARRIVAL FORM (Fișa de anunțare a sosirii)
   Rendered in-app: artifacts run sandboxed, so a popup window is
   unavailable. Print styles isolate this sheet on paper.
----------------------------------------------------------------*/

export function TodayView({ core, updateCore, reservations, updateReservations, housekeeping, updateHousekeeping, setView, groups, updateGroups, blocks, updateBlocks }) {
  const [arrivalRes, setArrivalRes] = useState(null);
  const [viewRes, setViewRes] = useState(null);
  const [editRes, setEditRes] = useState(null);
  const [checkinError, setCheckinError] = useState("");
  const [todayTab, setTodayTab] = useState("arrivals");
  /* Rezervarea pe care ruleaza chiar acum un check-in/check-out. Fara ea,
     un dublu-click trimitea doua scrieri pe acelasi rand. */
  const [busyId, setBusyId] = useState(null);

  /* One pass over the reservation list instead of six, and O(1) room lookups. */
  const roomById = useMemo(
    () => Object.fromEntries(core.rooms.map((r) => [r.id, r])),
    [core.rooms]);
  const guestById = useMemo(
    () => Object.fromEntries(core.guests.map((g) => [g.id, g])),
    [core.guests]);

  const { arrivals, departures, inHouse, occupiedNow, revenueToday } = useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today.getTime() + 86400000);
    const arr = [], dep = [], ih = [];
    // Set de camere, nu numar de rezervari — intr-o zi de turnover (o
    // camera eliberata si realocata azi) doua rezervari diferite se
    // suprapun cu azi pe aceeasi camera; numaratul pe rezervari dubla
    // acea camera si umfla gradul de ocupare afisat pe "Azi".
    const occRooms = new Set();
    let rev = 0;

    for (const r of reservations) {
      if (!isLive(r)) continue;
      const ci = new Date(r.checkin), co = new Date(r.checkout);
      if (ci >= today && ci < tomorrow) arr.push(r);
      if (co >= today && co < tomorrow) dep.push(r);
      if (r.status === "checkedin") ih.push(r);
      if (ci < tomorrow && co > today) {
        occRooms.add(r.roomId);
        // Cota pe noapte din pretul REAL (inghetat/manual) al rezervarii,
        // nu un recalcul cu tarifele curente — altfel "Venit azi" nu se
        // potriveste cu ce plateste efectiv oaspetele. Vezi reservationTotal.
        // Rezervarile "protocol" nu se incaseaza — nu intra in venit,
        // desi camera conteaza normal la ocupare (chiar e folosita).
        if (r.status !== "protocol") {
          const n = nightsBetween(r.checkin, r.checkout);
          rev += reservationTotal(r, core) / n;
        }
      }
    }
    arr.sort((a, b) => new Date(a.checkin) - new Date(b.checkin));
    dep.sort((a, b) => new Date(a.checkout) - new Date(b.checkout));
    return { arrivals: arr, departures: dep, inHouse: ih, occupiedNow: occRooms.size, revenueToday: rev };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, roomById, core]);

  const toClean = useMemo(
    () => core.rooms.filter((r) => (housekeeping[r.id]?.status || "clean") !== "clean"),
    [core.rooms, housekeeping]);

  const guestName = (res) => occupantName(res, core, groups) || "Fără nume";
  const roomName = (id) => roomById[id]?.name || id;
  const occupancy = core.rooms.length ? Math.round((occupiedNow / core.rooms.length) * 100) : 0;

  return (
    <div>
      <div className="stat-row">
        <Stat label="Ocupare" value={`${occupancy}%`} sub={`${occupiedNow} din ${core.rooms.length} camere`} />
        <Stat label="Sosiri" value={arrivals.length} sub="astăzi" />
        <Stat label="Plecări" value={departures.length} sub="astăzi" />
        <Stat label="Venit azi" value={fmtMoney(revenueToday)} sub="camere ocupate" />
      </div>

      {checkinError && (
        <div className="drag-error" role="alert" onClick={() => setCheckinError("")}>{checkinError}</div>
      )}

      <div className="today-actions">
        <button className="today-action" onClick={() => setView("housekeeping")}>
          <span className="ta-ico"><Sparkles size={17} /></span>
          <span className="ta-body">
            <span className="ta-t">Status camere</span>
            <span className="ta-d">{toClean.length ? `${toClean.length} de pregătit` : "Toate curate"}</span>
          </span>
          <ArrowRight size={15} className="ta-arrow" />
        </button>
        <button className="today-action" onClick={() => setView("calendar")}>
          <span className="ta-ico"><CalendarDays size={17} /></span>
          <span className="ta-body">
            <span className="ta-t">Calendar</span>
            <span className="ta-d">Rezervări și disponibilitate</span>
          </span>
          <ArrowRight size={15} className="ta-arrow" />
        </button>
        <button className="today-action" onClick={() => setView("clients")}>
          <span className="ta-ico"><Users size={17} /></span>
          <span className="ta-body">
            <span className="ta-t">Clienți</span>
            <span className="ta-d">{core.guests.length} în baza de date</span>
          </span>
          <ArrowRight size={15} className="ta-arrow" />
        </button>
      </div>

      <div className="sub-tabs">
        <button className={todayTab === "arrivals" ? "on" : ""} onClick={() => setTodayTab("arrivals")}>
          <LogIn size={14} /> Sosiri <span className="tab-count">{arrivals.length}</span>
        </button>
        <button className={todayTab === "departures" ? "on" : ""} onClick={() => setTodayTab("departures")}>
          <LogOut size={14} /> Plecări <span className="tab-count">{departures.length}</span>
        </button>
        <button className={todayTab === "inhouse" ? "on" : ""} onClick={() => setTodayTab("inhouse")}>
          <DoorOpen size={14} /> In house <span className="tab-count">{inHouse.length}</span>
        </button>
        <button className={todayTab === "clean" ? "on" : ""} onClick={() => setTodayTab("clean")}>
          <Sparkles size={14} /> Camere de pregătit <span className="tab-count">{toClean.length}</span>
        </button>
      </div>

      {todayTab === "arrivals" && (
        <Section title="Sosiri" items={arrivals} empty="Nicio sosire astăzi."
          renderItem={(r) => (
            <div className="list-row" key={r.id}>
              <div style={{ minWidth: 0, cursor: "pointer" }}
                role="button" tabIndex={0}
                onClick={() => setViewRes(r)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewRes(r); } }}
              >
                <div className="primary">{guestName(r)}</div>
                <div className="secondary">
                  <span className="mono">{roomName(r.roomId)}</span> · {FMT_TIME.format(new Date(r.checkin))} · {fmtMoney(reservationTotal(r, core))}
                </div>
              </div>
              <div className="row-actions">
                <button className="icon-btn" title="Fișa de sosire" aria-label="Deschide fișa de sosire" onClick={() => setArrivalRes(r)}>
                  <Printer size={14} />
                </button>
                {r.status === "checkedin" ? (
                  <span className="role-tag role-housekeeping">Cazat</span>
                ) : r.status === "checkedout" ? (
                  <span className="role-tag role-receptionist">Plecat</span>
                ) : canCheckIn(r) ? (
                  <button className="btn btn-primary" style={{ width: "auto", padding: "8px 12px" }}
                    disabled={busyId === r.id}
                    onClick={async () => {
                      if (busyId) return;
                      setBusyId(r.id);
                      try {
                        const out = await doCheckIn(r, reservations, updateReservations, core);
                        if (out && out.error) setCheckinError(out.error);
                      } finally { setBusyId(null); }
                    }}>
                    <LogIn size={14} /> Check-in
                  </button>
                ) : (
                  <span className="role-tag role-admin">{STATUS_LABEL[r.status]}</span>
                )}
              </div>
            </div>
          )}
        />
      )}

      {todayTab === "departures" && (
        <Section title="Plecări" items={departures} empty="Nicio plecare astăzi."
          renderItem={(r) => (
            <div className="list-row" key={r.id}>
              <div style={{ minWidth: 0, cursor: "pointer" }}
                role="button" tabIndex={0}
                onClick={() => setViewRes(r)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewRes(r); } }}
              >
                <div className="primary">{guestName(r)}</div>
                <div className="secondary">
                  <span className="mono">{roomName(r.roomId)}</span> · până la {FMT_TIME.format(new Date(r.checkout))}
                </div>
              </div>
              <div className="row-actions">
                {r.status === "checkedout" ? (
                  <span className="role-tag role-receptionist">Plecat</span>
                ) : canCheckOut(r) ? (
                  <button className="btn btn-ghost" style={{ padding: "8px 12px" }}
                    disabled={busyId === r.id}
                    onClick={async () => {
                      if (busyId) return;
                      setBusyId(r.id);
                      try {
                        await doCheckOut(r, reservations, updateReservations, core, housekeeping, updateHousekeeping);
                      } finally { setBusyId(null); }
                    }}>
                    Check-out <ArrowRight size={14} />
                  </button>
                ) : (
                  <span className="role-tag role-admin">{STATUS_LABEL[r.status]}</span>
                )}
              </div>
            </div>
          )}
        />
      )}

      {todayTab === "inhouse" && (
        <Section title="In house" items={inHouse} empty="Nicio cameră ocupată."
          renderItem={(r) => (
            <div className="list-row" key={r.id}>
              <div style={{ cursor: "pointer" }}
                role="button" tabIndex={0}
                onClick={() => setViewRes(r)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewRes(r); } }}
              >
                <div className="primary">{guestName(r)}</div>
                <div className="secondary"><span className="mono">{roomName(r.roomId)}</span> · pleacă {fmtDate(r.checkout)}</div>
              </div>
            </div>
          )}
        />
      )}

      {todayTab === "clean" && (
        <Section title="Camere de pregătit" items={toClean} empty="Toate camerele sunt curate."
          renderItem={(room) => (
            <div className="list-row" key={room.id}>
              <div>
                <div className="primary mono">{room.name}</div>
                <div className="secondary">{ROOM_TYPE[room.type]?.label}</div>
              </div>
              <button className="btn btn-ghost" style={{ padding: "8px 12px" }} onClick={() => setView("housekeeping")}>
                Vezi <ArrowRight size={14} />
              </button>
            </div>
          )}
        />
      )}

      {arrivalRes && <ArrivalForm res={arrivalRes} core={core} groups={groups} onClose={() => setArrivalRes(null)} />}

      {viewRes && (
        <ReservationViewModal
          reservation={viewRes}
          core={core}
          updateCore={updateCore}
          groups={groups}
          updateGroups={updateGroups}
          reservations={reservations}
          updateReservations={updateReservations}
          blocks={blocks}
          onClose={() => setViewRes(null)}
          onEdit={() => { setEditRes(viewRes); setViewRes(null); }}
        />
      )}

      {editRes && (
        <ReservationModal
          data={{ reservation: editRes }}
          core={core}
          updateCore={updateCore}
          reservations={reservations}
          updateReservations={updateReservations}
          groups={groups}
          updateGroups={updateGroups}
          blocks={blocks}
          updateBlocks={updateBlocks}
          onClose={() => setEditRes(null)}
        />
      )}
    </div>
  );
}

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
  const now = new Date();

  const arrivesToday = isSameDay(res.checkin, now);
  const departsToday = isSameDay(res.checkout, now);
  const mayCheckIn = canCheckIn(res, now);
  const mayCheckOut = canCheckOut(res);

  /* Explicatia apare doar cand check-in-ul chiar NU e posibil: cu fereastra
     de ZILE_CHECKIN_DEVREME zile, o sosire apropiata e deja cazabila, deci
     n-are ce explica. */
  const checkInHint = res.status !== "confirmed" || mayCheckIn
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
      `${guestFullName(guest) || "Fără nume"} · ${room?.name}: ${text.slice(0, 60)}`);
    setMsgText(""); setMsgOpen(false);
    onClose();
  };

  const cancel = async () => {
    await updateReservations(reservations.map((r) => (r.id === res.id ? { ...r, status: "cancelled" } : r)));
    await audit.push("Rezervare anulată",
      `${guestFullName(guest) || "Fără nume"} · ${room?.name} · ${fmtDate(res.checkin)}`);
    const before = reservations;
    toaster.show(`Rezervarea ${guestFullName(guest) || ""} a fost anulată`, {
      tone: "danger",
      onUndo: async () => {
        await updateReservations(before);
        await audit.push("Anulare revocată", `${guestFullName(guest) || ""} · ${room?.name}`);
      },
    });
    onClose();
  };

  return (
    <Dialog onClose={onClose} className="action-modal" title={undefined}>
        <div className="action-head">
          <div style={{ minWidth: 0 }}>
            <div className="action-guest">{occupantName(res, core, groups) || "Fără nume"}</div>
            {guestFullName(guest) && guestFullName(guest) !== occupantName(res, core, groups) && (
              <div className="action-meta">Rezervat de {guestFullName(guest)}</div>
            )}
            <div className="action-meta">
              <span className="mono">{room?.name}</span> · {fmtDate(res.checkin)} → {fmtDate(res.checkout)}
              {" · "}{nightsBetween(res.checkin, res.checkout)} nopți
            </div>
            <div className="action-meta">
              {res.adults ?? 2} adulți{res.children ? ` + ${res.children} copii` : ""} · {sourceLabel(res.source)} · {fmtMoney(reservationTotal(res, core))}
            </div>
            {res.tags?.length > 0 && (
              <div className="tag-row">
                {res.tags.map((t) => <span className="tag-mini" key={t}>{t}</span>)}
              </div>
            )}
          </div>
          <span className={"role-tag " + (res.status === "checkedin" ? "role-housekeeping"
            : res.status === "cancelled" ? "role-receptionist" : "role-admin")}>
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
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" style={{ padding: "8px 12px" }}
                  onClick={() => { setMsgOpen(false); setMsgText(""); }}>Renunță</button>
                <button className="btn btn-primary" style={{ width: "auto", padding: "8px 14px" }}
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
                `${guestFullName(guest) || "Fără nume"} · ${room?.name} · ${fmtDate(res.checkin)}`);
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
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-ghost" style={{ padding: "8px 12px" }} onClick={() => setConfirmCancel(false)} disabled={busy}>Nu</button>
                  <button className="btn btn-danger" style={{ padding: "8px 12px" }} onClick={() => ruleaza(cancel)} disabled={busy}>Da, anulează</button>
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

        {actionError && <div className="drag-error" role="alert" style={{ marginTop: 10 }}>{actionError}</div>}

        <button className="btn btn-ghost" style={{ width: "100%", marginTop: 6 }} onClick={onClose}>Închide</button>
      </Dialog>
  );
}

/* ---------------------------------------------------------------
   SETTINGS HUB
----------------------------------------------------------------*/
