/* REZERVARI / CALENDARUL — grila camere x zile: barele rezervarilor si
 * blocajele, latimea (7 zile pe tableta, pinch), intentiile venite din cautare
 * si din scurtaturi, vederea saraca a cameristei (doarCitire).
 *
 * Desprins din features/rezervari.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  CalendarDays, Plus, ChevronLeft, ChevronRight, Trash2, UsersRound, MoveRight, MessageSquare,
  Wrench, Rows2, Rows3, Columns2, Columns3, CalendarRange,
} from "lucide-react";
import { audit } from "../../lib/audit.js";
import { guestFullName, occupantName } from "../../lib/nume.js";
import { nightsBetween, isLive } from "../../lib/availability.js";
import { ziLocala, adaugaZile, zileIntre, momentLocal, laOraLocala, partiLocale, esteWeekend } from "../../lib/timp.js";
import { planIntentie } from "../../lib/scurtaturi.js";
import {
  CHEIE_LATIME, ETICHETA_LATIME, latimeImplicita, latimeSalvata, urmatoareaLatime, latimeDupaPinch,
  latimeZiPx, numeZiIntreg, decidePinch, distantaAtingeri,
} from "../../lib/calendar-latime.js";
import { isToday } from "../../lib/tranzitii.js";
import { fmtDate, fmtDateTime, toDateInput, FMT_WEEKDAY, FMT_WEEKDAY_LONG } from "../../lib/format.js";
import { ROOM_TYPE, STATUS_LABEL, STATUS_GLYPH, STATUS_CLASS } from "../../lib/constante.js";
import { Dialog, toaster } from "../../ui/primitive.jsx";
import { EtichetaNou } from "./eticheta-nou.jsx";
import { ReservationViewModal } from "./vizualizare.jsx";
import { ReservationModal } from "./fisa-rezervare.jsx";
import { ReservationActions } from "./actiuni.jsx";

/* `doarCitire` — calendarul pentru cameristă.
 *
 * Nu e un mod „dezactivat" al aceluiași ecran, ci un ecran mai sărac: nu
 * doar că nu se poate scrie, dar nici nu se arată cine stă în cameră.
 * Camerista are nevoie să știe CE cameră e prinsă și ÎN CE zile, ca să-și
 * planifice curățenia; numele oaspetelui nu o ajută cu nimic, deci nu are
 * de ce să treacă prin ecranul ei.
 *
 * Ascunderea butoanelor n-ar fi de ajuns singură — de aceea și dispecerul
 * de clic din celule iese devreme, nu doar controalele lipsesc. */

export function CalendarView({ core, updateCore, reservations, updateReservations, groups, updateGroups, housekeeping, updateHousekeeping, blocks, updateBlocks, stergeRezervari, stergeGrupuri, stergeBlocaje, adaugaOaspetiInCache, salveazaOaspete, asiguraPerioada, intent, clearIntent, doarCitire = false, noutati }) {
  const [offset, setOffset] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  /* Implicit active — cerut pe 9 septembrie 2026: calendarul se deschide
     direct in vederea densa, nu mai cere un clic de fiecare data. */
  const [dense, setDense] = useState(true);
  const [actionRes, setActionRes] = useState(null);
  const [blockInfo, setBlockInfo] = useState(null);
  const [moveId, setMoveId] = useState(null);
  const [dragError, setDragError] = useState("");
  /* Fereastra vizibila. Latimea unei zile ramane 66px, deci grila creste
     in lateral si se deruleaza — 30 de zile inseamna ~2060px, adica vreo
     doua ecrane de laptop. Alegerea e deliberata: mai bine derulezi si
     citesti numele oaspetilor, decat sa incapa luna intreaga cu bare fara
     nume. */
  const PAS_FEREASTRA = 30;
  /* Cat se adauga la capatul din dreapta, cand derularea ajunge acolo.
     Cinci zile, nu inca treizeci: cine deruleaza pana la capat vrea de
     obicei sa vada putin mai departe, nu sa sara o luna. */
  const ZILE_IN_PLUS = 5;
  /* Plafon pentru cresterea prin derulare. Fiecare zi inseamna cate o celula
     pentru fiecare camera, deci o fereastra care creste la nesfarsit ajunge
     o grila de mii de noduri. Patru luni acopera orice planificare; mai
     departe se merge cu butoanele, care muta fereastra in loc s-o lungeasca. */
  const MAX_ZILE = 120;
  /* Inapoi se merge doar cu cinci zile, si atat. Spre trecut ai nevoie de
     context — ce s-a intamplat zilele astea — nu de rasfoit istoricul; iar
     fereastra porneste de la ziua de azi, deci tot ce e la stanga e trecut.
     Cine chiar vrea mai mult are butonul de 30 de zile inapoi. */
  const ZILE_INAINTE = 5;
  /* Cat de aproape de capat trebuie sa fii ca sa se adauge. */
  const PRAG_CAPAT = 60;

  /* Zilele adaugate prin derulare, tinute separat de pasul butoanelor: ele
     pasesc mai departe cu 30, ca eticheta lor sa nu inceapa sa minta. */
  const [inPlus, setInPlus] = useState(0);
  const [inainte, setInainte] = useState(0);
  const DAYS = inainte + PAS_FEREASTRA + inPlus;

  /* Orice navigare readuce fereastra la lungimea ei normala. Efect pe
     `offset`, nu cate o linie in fiecare buton: sunt patru locuri care muta
     fereastra (inapoi, inainte, saltul la data, „inapoi la azi"), iar unul
     uitat ar fi lasat fereastra lunga pe termen nedefinit. */
  /* Cresterea prin derulare e doar pentru ecranele atinse cu degetul.
     Pe desktop derularea orizontala vine din trackpad sau din roata
     mouse-ului si porneste usor din greseala, iar acolo butoanele sunt la
     indemana oricum. Intrebarea e despre felul de a atinge, nu despre
     latime: o tableta in landscape e lata cat un laptop, dar tot deget e,
     iar o fereastra de desktop ingustata are tot mouse. */
  const INTREBARE_TACTIL = "(hover: none) and (pointer: coarse)";
  const [eTactil, setETactil] = useState(
    () => window.matchMedia?.(INTREBARE_TACTIL).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(INTREBARE_TACTIL);
    if (!mq) return;
    const asculta = (e) => setETactil(e.matches);
    mq.addEventListener("change", asculta);
    return () => mq.removeEventListener("change", asculta);
  }, []);

  /* Si la schimbarea felului de atins, nu doar la navigare: altfel o
     fereastra lungita pe tableta ar ramane asa dupa ce se ataseaza o
     tastatura cu trackpad. */
  useEffect(() => { setInPlus(0); setInainte(0); }, [offset, eTactil]);

  /* Latimea zilelor (faza 3, C3, lib/calendar-latime.js): inguste, „7 zile
     pe ecran" sau late (numele intreg). Separat de `dense`: acela schimba
     inaltimea randului, asta latimea coloanei, si se pot folosi impreuna.
     Implicit 7 zile pe tableta, late in rest; alegerea ramane in browser. */
  const [latime, setLatimeStare] = useState(() =>
    latimeSalvata(globalThis.localStorage)
    || latimeImplicita({ tactil: window.matchMedia?.(INTREBARE_TACTIL).matches ?? false, latimeEcran: window.innerWidth }));
  const setLatime = (mod) => {
    setLatimeStare(mod);
    try { localStorage.setItem(CHEIE_LATIME, mod); } catch { /* fara stocare, alegerea tine cat pagina */ }
  };

  const zonaDerulare = useRef(null);
  /* Latimea grilei, pentru „7 zile pe ecran": se imparte la sapte. Se
     masoara cu ResizeObserver, nu din latimea ferestrei — grila are
     margini si, pe desktop, bara laterala. */
  const [latimeGrila, setLatimeGrila] = useState(0);
  useEffect(() => {
    const el = zonaDerulare.current;
    if (!el) return;
    setLatimeGrila(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setLatimeGrila(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ziPx = latimeZiPx(latime, latimeGrila);

  /* Pinch pe grila: doua degete departate = zile mai late, apropiate =
     mai inguste, cate un pas. `touch-action: pan-x pan-y` pe .cal-scroll
     lasa derularea browserului si opreste zoom-ul paginii — gestul ajunge
     aici, nu la Safari. Referinta se muta dupa fiecare pas, deci un pinch
     continuu urca treptele pe rand. */
  const pinch = useRef(0);
  const laAtingereStart = (e) => { pinch.current = distantaAtingeri(e.touches); };
  const laAtingereMiscare = (e) => {
    if (!pinch.current || e.touches.length < 2) return;
    const d = distantaAtingeri(e.touches);
    const directie = decidePinch(pinch.current, d);
    if (!directie) return;
    setLatime(latimeDupaPinch(latime, directie));
    pinch.current = d;
  };
  const laAtingereSfarsit = () => { pinch.current = 0; };
  /* Latimea grilei chiar inainte de a adauga zile la stanga, ca sa stim cu
     cat s-a lungit dupa ce React redeseneaza. Vezi useLayoutEffect-ul de mai
     jos. Null cand nu e nicio adaugare in curs. */
  const latimeInainteDeAdaugare = useRef(null);

  const laDerulare = () => {
    if (!eTactil) return;
    const el = zonaDerulare.current;
    if (!el) return;
    /* Doar cand chiar exista ce derula. Pe un ecran mai lat decat grila,
       scrollWidth === clientWidth, iar ambele conditii de capat ar fi
       adevarate deodata: fereastra ar creste singura, fara ca nimeni sa fi
       derulat, pana in plafon. */
    if (el.scrollWidth <= el.clientWidth) return;

    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - PRAG_CAPAT) {
      setInPlus((n) => Math.min(n + ZILE_IN_PLUS, MAX_ZILE - PAS_FEREASTRA));
      return;
    }
    if (el.scrollLeft <= PRAG_CAPAT && inainte < ZILE_INAINTE) {
      latimeInainteDeAdaugare.current = el.scrollWidth;
      setInainte(ZILE_INAINTE);
    }
  };

  /* Zilele adaugate la stanga impinge spre dreapta tot ce era vizibil, iar
     browserul pastreaza acelasi scrollLeft — adica privirea ar aluneca in
     trecut cu exact cat s-a adaugat, desi omul n-a mai derulat. Mutam
     scroll-ul cu latimea castigata, ca zilele de sub ochi sa ramana pe loc.
     useLayoutEffect, nu useEffect: corectia trebuie facuta inainte ca
     browserul sa deseneze, altfel saltul se vede. */
  useLayoutEffect(() => {
    const el = zonaDerulare.current;
    const inaintea = latimeInainteDeAdaugare.current;
    if (!el || inaintea === null) return;
    latimeInainteDeAdaugare.current = null;
    el.scrollLeft += el.scrollWidth - inaintea;
  }, [inainte]);
  const [modal, setModal] = useState(null); // { reservation | null, defaultRoomId, defaultDate }
  const [viewModal, setViewModal] = useState(null); // rezervarea afișată doar-vizualizare, sau null

  const days = useMemo(() => {
    /* Miezul noptii de la Vaslui, nu al browserului (lib/timp.js).
       `- inainte`: zilele castigate prin derulare la stanga se adauga
       inaintea ferestrei, deci mut inceputul cu atat in urma. */
    const start = adaugaZile(ziLocala(new Date()), offset - inainte);
    return Array.from({ length: DAYS }, (_, i) => adaugaZile(start, i));
    /* `DAYS` in dependinte, nu doar `offset`: cat timp a fost constanta nu
       conta, dar acum creste la derulare, iar fara ea lista de zile ar fi
       ramas la lungimea de la prima randare — grila n-ar creste niciodata. */
  }, [offset, DAYS, inainte]);

  const rangeStart = days[0], rangeEnd = adaugaZile(days[DAYS - 1], 1);
  /* Ziua la care e ancorata fereastra — cea de care asculta butoanele si
     saltul la data. Nu e neaparat days[0]: derularea la stanga adauga zile
     inaintea ei. Eticheta si selectorul de data arata ancora, altfel ar fi
     inceput sa afiseze o data cu cinci zile mai devreme decat cea la care
     te-ai dus, iar un salt „la aceeasi data" ar fi alunecat de fiecare data. */
  const ziAncora = days[inainte];

  const moveReservation = async (resId, targetRoomId, targetDay) => {
    const res = reservations.find((r) => r.id === resId);
    if (!res) return;
    const nights = nightsBetween(res.checkin, res.checkout);
    const oldCi = new Date(res.checkin), oldCo = new Date(res.checkout);
    /* Aceleasi ore de perete (la Vaslui) in ziua tinta, plus acelasi numar
       de nopti; lib/timp.js trece corect peste schimbarea orei, deci nu mai
       e nevoie de corectia de „drift" de dinainte. */
    const oc = partiLocale(oldCi), oo = partiLocale(oldCo);
    const newCi = laOraLocala(targetDay, oc.ore, oc.minute);
    const newCo = laOraLocala(adaugaZile(newCi, nights), oo.ore, oo.minute);

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
      `${who}: ${fromRoom} ${fmtDate(oldCi)} → ${toRoom} ${fmtDate(newCi)}`, { roomId: targetRoomId, reservationId: res.id });
  };

  /* Intentiile din antet (lib/scurtaturi.js): grup nou din Clienti,
     rezervare noua si „azi" de la tastatura, saptamana inainte/inapoi,
     deschiderea unui rezultat din cautarea globala (faza 3, C1/C2). */
  const [deDeschis, setDeDeschis] = useState(null);
  useEffect(() => {
    if (!intent) return;
    const plan = planIntentie(intent);
    clearIntent();
    if (!plan) return;
    if (plan.modal) setModal(plan.modal);
    if (plan.zile) setOffset((o) => o + plan.zile);
    if (plan.salt) { setOffset(zileIntre(new Date(), plan.salt)); setPickerOpen(false); }
    if (plan.deDeschis) setDeDeschis(plan.deDeschis);
  }, [intent, clearIntent]);

  /* Rezultatul cautarii se deschide abia cand rezervarea e in stare: saltul
     de mai sus largeste fereastra (asiguraPerioada), iar randul ei vine
     odata cu restul perioadei. Daca nu apare (stearsa intre timp), dupa
     10 secunde se renunta in tacere. */
  useEffect(() => {
    if (!deDeschis) return;
    const r = reservations.find((x) => x.id === deDeschis);
    if (r) { setViewModal(r); setDeDeschis(null); return; }
    const t = setTimeout(() => setDeDeschis(null), 10000);
    return () => clearTimeout(t);
  }, [deDeschis, reservations]);

  const jumpTo = (target) => {
    setOffset(zileIntre(new Date(), target));
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
      const ciDay = ziLocala(ciMs), coDay = ziLocala(coMs);
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

  /* Fereastra incarcata la pornire acopera -30/+400 de zile (docs/faza1.md);
     cand derularea sau saltul la o data ies din ea, PMS-ul aduce restul si
     il adauga la starea locala. Grila se deseneaza imediat cu ce exista, iar
     rezervarile noi apar cand sosesc. Dependintele sunt momentele, nu
     obiectele Date — `days` se reconstruieste si fara sa se schimbe. */
  useEffect(() => {
    asiguraPerioada?.(new Date(rangeStartMs), new Date(rangeEndMs));
  }, [asiguraPerioada, rangeStartMs, rangeEndMs]);

  const spanIndices = (startMs, endMs) => {
    let startIdx = -1, endIdx = -1;
    for (let i = 0; i < dayMs.length; i++) {
      const dStart = dayMs[i], dEnd = i + 1 < dayMs.length ? dayMs[i + 1] : rangeEndMs;
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
        const ciDay = ziLocala(ciMs), coDay = ziLocala(coMs);
        return {
          res: r, startIdx, endIdx, len: endIdx - startIdx + 1,
          nights: Math.max(1, zileIntre(ciDay, coDay)),
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
          <button onClick={() => setOffset((o) => o - PAS_FEREASTRA)}
            aria-label={`Cele ${PAS_FEREASTRA} zile anterioare`}>
            <ChevronLeft size={15} />
            <span>{PAS_FEREASTRA} zile</span>
          </button>
          <div className="jump-wrap">
            <button className={offset === 0 ? "on" : ""} onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v); }}>
              <CalendarDays size={14} />
              <span>{offset === 0 ? "Azi" : fmtDate(ziAncora)}</span>
            </button>
            {pickerOpen && (
              <div className="jump-pop" onClick={(e) => e.stopPropagation()}>
                <label>Sari la data</label>
                <input
                  type="date"
                  autoFocus
                  value={toDateInput(ziAncora)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    jumpTo(momentLocal(e.target.value));
                  }}
                />
                <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => { setOffset(0); setPickerOpen(false); }}>
                  Înapoi la azi
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setOffset((o) => o + PAS_FEREASTRA)}
            aria-label={`Următoarele ${PAS_FEREASTRA} zile`}>
            <span>{PAS_FEREASTRA} zile</span>
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
        <button
          className={"icon-btn" + (latime !== "ingust" ? " active" : "")}
          onClick={() => setLatime(urmatoareaLatime(latime))}
          title={`${ETICHETA_LATIME[latime]} · apasă pentru: ${ETICHETA_LATIME[urmatoareaLatime(latime)]}`}
          aria-label={`Lățimea zilelor: ${ETICHETA_LATIME[latime]}. Treci la: ${ETICHETA_LATIME[urmatoareaLatime(latime)]}`}
        >
          {latime === "ingust" ? <Columns3 size={16} /> : latime === "saptamana" ? <CalendarRange size={16} /> : <Columns2 size={16} />}
        </button>
        {!doarCitire && (
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ reservation: null })}>
            <Plus size={15} />
            <span className="lbl-long">Rezervare nouă</span>
            <span className="lbl-short">Rezervare</span>
          </button>
        )}
      </div>

      {dragError && <div className="drag-error" role="alert">{dragError}</div>}
      {moveId ? (
        <div className="move-banner" role="status">
          <MoveRight size={15} />
          <span>Atinge celula unde muți rezervarea — camera și ziua de sosire.</span>
          <button className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={() => setMoveId(null)}>Renunță</button>
        </div>
      ) : null}

      <div className={"cal-scroll" + (dense ? " dense" : "")} style={{ "--zi-w": `${ziPx}px` }}
        ref={zonaDerulare} onScroll={laDerulare}
        onTouchStart={laAtingereStart} onTouchMove={laAtingereMiscare}
        onTouchEnd={laAtingereSfarsit} onTouchCancel={laAtingereSfarsit}>
        <div className="cal-grid" style={{ "--days": DAYS }}>
          <div className="cal-row cal-head">
            <div className="cal-roomcell"><div className="cal-roomcell-inner" style={{ fontWeight: 700, fontSize: 12 }}>Cameră</div></div>
            {days.map((d, i) => {
              const wk = esteWeekend(d);
              return (
                <div key={i} className={"cal-daycell" + (isToday(d) ? " today" : wk ? " weekend" : "")}>
                  {(numeZiIntreg(ziPx) ? FMT_WEEKDAY_LONG : FMT_WEEKDAY).format(d)}<br />{fmtDate(d)}
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
                        + (esteWeekend(d) ? " weekend" : "")
                        + (moveId ? " movable" : "")
                        + (doarCitire ? " cal-cell-static" : "")}
                      onClick={doarCitire ? undefined : () => {
                        if (moveId) { moveReservation(moveId, room.id, d); setMoveId(null); return; }
                        if (bCovered) { setBlockInfo(bCovered.block); return; }
                        if (covered) setActionRes(covered.res);
                        else setModal({ reservation: null, defaultRoomId: room.id, defaultDate: d });
                      }}
                    >
                      {bSpan && (
                        <div
                          role={doarCitire ? undefined : "button"}
                          tabIndex={doarCitire ? undefined : 0}
                          onClick={doarCitire ? undefined : (e) => { e.stopPropagation(); setBlockInfo(bSpan.block); }}
                          onKeyDown={doarCitire ? undefined : (e) => {
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
                        const ciIdx = zileIntre(rangeStart, span.res.checkin);
                        const coIdx = zileIntre(rangeStart, span.res.checkout);
                        const leftAbs = span.clipStart ? span.startIdx : ciIdx + 0.5;
                        const rightAbs = span.clipEnd ? days.length : coIdx + 0.5;
                        const barLeft = span.clipStart ? "3px" : "calc(50% + 3px)";
                        const barWidthUnits = rightAbs - leftAbs;
                        return (
                          <div
                            key={span.res.id}
                            role={doarCitire ? undefined : "button"}
                            tabIndex={doarCitire ? undefined : 0}
                            onClick={doarCitire ? undefined : (e) => { e.stopPropagation(); if (moveId) return; setActionRes(span.res); }}
                            onKeyDown={doarCitire ? undefined : (e) => {
                              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActionRes(span.res); }
                            }}
                            className={"cal-bar " + STATUS_CLASS[span.res.status] +
                              (span.clipStart ? " clip-start" : "") + (span.clipEnd ? " clip-end" : "") +
                              (moveId === span.res.id ? " moving" : "")}
                            style={{ left: barLeft, width: `calc(${barWidthUnits} * 100% - 6px)` }}
                            /* Tooltipul urmează aceeași regulă ca eticheta: fără nume
                               în vederea cameristei — altfel numele ar reintra pe ușa
                               din dos, la trecerea cu mausul. */
                            title={doarCitire
                              ? `${fmtDateTime(span.res.checkin)} → ${fmtDateTime(span.res.checkout)} · ${STATUS_LABEL[span.res.status]}`
                              : `${occupantName(span.res, core, groups) || "Fără nume"} · ${fmtDateTime(span.res.checkin)} → ${fmtDateTime(span.res.checkout)} · ${STATUS_LABEL[span.res.status]}`}
                          >
                            <span className="bar-glyph" aria-hidden="true">{STATUS_GLYPH[span.res.status]}</span>
                            {!doarCitire && <EtichetaNou res={span.res} noutati={noutati} />}
                            {!doarCitire && span.res.groupId && <UsersRound size={11} style={{ flexShrink: 0, opacity: .8 }} />}
                            <span className="bar-name">
                              {doarCitire
                                ? STATUS_LABEL[span.res.status]
                                : (occupantName(span.res, core, groups) || "Fără nume")}
                            </span>
                            {!doarCitire && span.res.tags?.includes("VIP") && <span className="bar-vip">VIP</span>}
                            {!doarCitire && span.res.messages?.length > 0 && <MessageSquare size={10} style={{ flexShrink: 0, opacity: .75 }} />}
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
                if (!await stergeBlocaje([blockInfo.id])) return;
                await audit.push("Blocaj eliminat",
                  `${core.rooms.find((r) => r.id === blockInfo.roomId)?.name} · ${blockInfo.reason}`, { roomId: blockInfo.roomId });
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
          noutati={noutati}
          core={core}
          updateCore={updateCore}
          stergeRezervari={stergeRezervari}
          stergeGrupuri={stergeGrupuri}
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
