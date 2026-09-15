/* REZERVARI / ECRANUL AZI — sosiri, plecari, in house, camere de pregatit si
 * cardul „De pe site".
 *
 * Desprins din features/rezervari.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { useState, useEffect, useMemo } from "react";
import { CalendarDays, Users, DoorOpen, Sparkles, LogIn, LogOut, Printer, ArrowRight, Globe } from "lucide-react";
import { occupantName } from "../../lib/nume.js";
import { nightsBetween, isLive, esteProtocol } from "../../lib/availability.js";
import { ziLocala, adaugaZile } from "../../lib/timp.js";
import { reservationTotal } from "../../lib/pricing.js";
import { canCheckIn, canCheckOut } from "../../lib/tranzitii.js";
import { fmtMoney, fmtDate, fmtDateTime, FMT_TIME } from "../../lib/format.js";
import { ROOM_TYPE, STATUS_LABEL, STATUS_CLASS } from "../../lib/constante.js";
import { Stat, Section } from "../../ui/primitive.jsx";
import { useInterfata } from "../../ui/interfata.jsx";
import { numarOaspeti } from "../../data/oaspeti.js";
import { ultimeleOnline, candAVenit } from "../../lib/rezervari-online.js";
import { ArrivalForm } from "../documente.jsx";
import { EtichetaNou } from "./eticheta-nou.jsx";
import { ReservationViewModal } from "./vizualizare.jsx";
import { ReservationModal } from "./fisa-rezervare.jsx";
import { doCheckIn, doCheckOut } from "./checkin-checkout.jsx";

/* CE A INTRAT DE PE SITE — pe ecranul Azi, sub scurtaturile de sus.
 *
 * O rezervare facuta de pe site vine singura, adesea noaptea, peste ecranul
 * nimanui: pana acum se vedea doar daca cineva derula calendarul pana la data
 * ei. Aici sunt ultimele cinci, in ordinea in care au intrat.
 *
 * ANULATELE RAMAN IN LISTA, cu statusul la vedere. Scoase, cardul ar fi spus
 * „ultimele cinci" si ar fi aratat altceva — iar o anulare venita de pe site
 * e exact felul de veste pentru care exista cardul.
 */
export function CardOnline({ rezervari, numeOaspete, numeCamera, core, onDeschide, noutati }) {
  const acum = new Date();
  const { noua } = useInterfata();
  const ultimele = useMemo(() => ultimeleOnline(rezervari), [rezervari]);

  return (
    <div className="panel section-panel card-online">
      <div className="section-head">
        <span className="co-titlu"><Globe size={14} /> De pe site</span>
        <span className="badge-count">{ultimele.length}</span>
      </div>
      {ultimele.length ? ultimele.map((r) => (
        <div className="list-row" key={r.id}>
          <div style={{ minWidth: 0, cursor: "pointer" }}
            role="button" tabIndex={0}
            onClick={() => onDeschide(r)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDeschide(r); } }}
          >
            <div className="primary">{numeOaspete(r)}<EtichetaNou res={r} noutati={noutati} /></div>
            <div className="secondary">
              <span className="mono">{numeCamera(r.roomId)}</span> ·{" "}
              {fmtDate(r.checkin)} → {fmtDate(r.checkout)} · {fmtMoney(reservationTotal(r, core))}
            </div>
          </div>
          <div className="row-actions">
            {/* Statusul apare doar cand NU e cel asteptat: rezervarile de pe
                site intra 'confirmed', deci o eticheta pe fiecare rand ar fi
                fost zgomot in care nu s-ar mai fi vazut o anulare. */}
            {r.status !== "confirmed" && (
              <span className={"role-tag " + (noua ? STATUS_CLASS[r.status] : isLive(r) ? "role-admin" : "co-moarta")}>
                {STATUS_LABEL[r.status]}
              </span>
            )}
            <span className="co-cand">{candAVenit(r.createdAt, acum, fmtDateTime)}</span>
          </div>
        </div>
      )) : (
        <div className="section-empty">Nicio rezervare de pe site încă.</div>
      )}
    </div>
  );
}

export function TodayView({ core, updateCore, reservations, updateReservations, housekeeping, updateHousekeeping, setView, groups, updateGroups, blocks, updateBlocks, stergeRezervari, stergeGrupuri, adaugaOaspetiInCache, salveazaOaspete, noutati }) {
  const [arrivalRes, setArrivalRes] = useState(null);
  const { noua } = useInterfata();
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
  /* Cati oaspeti sunt in baza: core.guests e doar un cache, nu spune. O
     cerere de numarat (head), la deschiderea ecranului. */
  const [numarClienti, setNumarClienti] = useState(null);
  useEffect(() => {
    let activ = true;
    numarOaspeti().then((n) => { if (activ) setNumarClienti(n); })
      .catch((e) => console.warn("Numarul de oaspeti nu s-a putut citi", e));
    return () => { activ = false; };
  }, []);

  const { arrivals, departures, inHouse, occupiedNow, revenueToday } = useMemo(() => {
    const today = ziLocala(new Date());
    const tomorrow = adaugaZile(today, 1);
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
      /* Ocupata/incasata/in-house ASTAZI inseamna noaptea care incepe azi,
         nu orice suprapunere cu ziua calendaristica de azi — acelasi prag ca
         la dailyOccupancy din CalendarView ("ziua de plecare nu e o noapte
         vanduta"). Cu ci/co brute (nu rotunjite la zi), o plecare de azi la
         ora 08:00 trecea testul (co > today) desi noaptea ei vanduta a fost
         ieri: "Venit azi" numara o rezervare care tocmai a plecat, si nu
         numara o sosire de azi decat daca soseste dupa miezul noptii — ceea
         ce oricum se intampla, dar plecarile ramaneau numarate gresit.
         Acelasi test opreste si "În house" sa numere un check-in facut cu
         zile inainte (fereastra de 14 zile, vezi lib/tranzitii.js) pentru o
         sosire care inca n-a ajuns — statusul e deja "checkedin", dar
         camera nu e ocupata azi. */
      const ocupaAzi = ziLocala(ci) <= today && ziLocala(co) > today;
      if (r.status === "checkedin" && ocupaAzi) ih.push(r);
      if (ocupaAzi) {
        occRooms.add(r.roomId);
        // Cota pe noapte din pretul REAL (inghetat/manual) al rezervarii,
        // nu un recalcul cu tarifele curente — altfel "Venit azi" nu se
        // potriveste cu ce plateste efectiv oaspetele. Vezi reservationTotal.
        // Rezervarile "protocol" nu se incaseaza — nu intra in venit,
        // desi camera conteaza normal la ocupare (chiar e folosita).
        if (!esteProtocol(r)) {
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
            <span className="ta-d">{numarClienti == null ? "Oaspeți, firme, grupuri" : `${numarClienti} în baza de date`}</span>
          </span>
          <ArrowRight size={15} className="ta-arrow" />
        </button>
      </div>

      <CardOnline rezervari={reservations} numeOaspete={guestName} numeCamera={roomName}
        core={core} onDeschide={setViewRes} noutati={noutati} />

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
                <div className="primary">{guestName(r)}<EtichetaNou res={r} noutati={noutati} /></div>
                <div className="secondary">
                  <span className="mono">{roomName(r.roomId)}</span> · {FMT_TIME.format(new Date(r.checkin))} · {fmtMoney(reservationTotal(r, core))}
                </div>
              </div>
              <div className="row-actions">
                <button className="icon-btn" title="Fișa de sosire" aria-label="Deschide fișa de sosire" onClick={() => setArrivalRes(r)}>
                  <Printer size={14} />
                </button>
                {r.status === "checkedin" ? (
                  <span className={"role-tag " + (noua ? "st-checkedin" : "role-housekeeping")}>Cazat</span>
                ) : r.status === "checkedout" ? (
                  <span className={"role-tag " + (noua ? "st-checkedout" : "role-receptionist")}>Plecat</span>
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
                  <span className={"role-tag " + (noua ? "st-checkedout" : "role-receptionist")}>Plecat</span>
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
          stergeRezervari={stergeRezervari}
          stergeGrupuri={stergeGrupuri}
          adaugaOaspetiInCache={adaugaOaspetiInCache}
          salveazaOaspete={salveazaOaspete}
          onClose={() => setEditRes(null)}
        />
      )}
    </div>
  );
}
