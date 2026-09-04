/* CAMERE — inventarul, yalele, curatenia, tarifele.
 *
 * Tariful de baza si sezoanele stau aici fiindca sunt proprietati ale
 * camerei, nu ale rezervarii. Calculul propriu-zis e in lib/pricing.js,
 * testat separat.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, X, Check, Trash2, Pencil, DoorOpen, Sparkles, Wrench, KeyRound, Banknote, RefreshCw, AlertTriangle, ArrowRight, Info, TrendingUp, Tag as TagIcon, Copy, Cpu, Flame, Snowflake, Wind, Unlock } from "lucide-react";
import { uid } from "../lib/uid.js";
import { isLive } from "../lib/availability.js";
import { mesajEroare } from "../lib/errors.js";
import { audit, isAdmin } from "../lib/audit.js";
import { fmtMoney, fmtDate, validatePrice } from "../lib/format.js";
import { ROOM_TYPE, DEFAULT_TAGS, HK_STATUSES, DEFAULT_ONLINE_TIERS } from "../lib/constante.js";
import { Dialog, toaster, useModalLock } from "../ui/primitive.jsx";
import { cheamaAcces } from "./acces.jsx";

/* Glisor de deschidere a ușii.
 *
 * DE CE GLISARE, nu un buton. Cardurile de status se folosesc de pe telefon,
 * cu mâna ocupată, iar butoanele de curățenie sunt exact deasupra: un tap
 * greșit pe un buton obișnuit ar descuia o ușă, iar o ușă deschisă din
 * greșeală nu se poate anula. Glisarea cere o intenție pe care atingerea
 * accidentală n-o are. Aceeași grijă ca la confirmarea din panoul de
 * administrare, dar fără un dialog care ar cere două atingeri la o
 * operațiune de câteva secunde.
 *
 * Regula „camerele cazate doar pentru admin" e verificată ȘI pe server
 * (vezi access-provider/index.ts). Aici e doar afișată — un glisor
 * dezactivat spune de ce, un glisor lipsă ar lăsa omul să se întrebe.
 */
function GlisorDeschidere({ room, blocat, motivBlocare }) {
  const sina = React.useRef(null);
  const [x, setX] = useState(0);
  const [maxim, setMaxim] = useState(0);
  /* Tragerea stă într-un ref, nu doar în state: `onPointerMove` citește
     valoarea din închiderea randării curente, iar între `pointerdown` și
     primul `pointermove` nu e garantată o re-randare. Cu state singur,
     o mișcare sosită în aceeași sarcină ar fi ignorată tăcut. State-ul
     rămâne doar pentru stil (oprirea tranziției în timpul tragerii). */
  const trageRef = React.useRef(false);
  const [trage, setTrage] = useState(false);
  const [stare, setStare] = useState("gata");   // gata | deschid | deschis | eroare
  const [eroare, setEroare] = useState(null);

  const LATIME_BUTON = 44;
  const PRAG = 0.82;                            // cât din cursă înseamnă „dus până la capăt"

  const masoara = useCallback(() => {
    if (sina.current) setMaxim(Math.max(0, sina.current.offsetWidth - LATIME_BUTON - 6));
  }, []);
  useEffect(() => {
    masoara();
    window.addEventListener("resize", masoara);
    return () => window.removeEventListener("resize", masoara);
  }, [masoara]);

  const inactiv = blocat || stare === "deschid" || stare === "deschis";

  /* Poziția curentă e ținută și într-un ref, din același motiv ca `trage`:
     `pointerup` trebuie să compare cu ultima poziție reală, nu cu cea din
     randarea în care s-a legat handlerul. */
  const xRef = React.useRef(0);
  const muta = useCallback((valoare) => { xRef.current = valoare; setX(valoare); }, []);

  const deschide = useCallback(async () => {
    setStare("deschid");
    setEroare(null);
    /* Trimitem camera, nu yala: id-ul yalei e configurare, n-are ce căuta
       în browser la o apăsare de zi cu zi. Serverul îl caută singur. */
    const r = await cheamaAcces("unlock", { roomId: room.id });
    if (r?.ok) {
      setStare("deschis");
      await audit.push("Deschidere ușă", `${room.name} — de la cardul de status`);
      /* Revine la starea inițială după câteva secunde: cardul rămâne pe
         ecran, iar un glisor înțepenit pe „deschis" ar sugera că ușa e
         încă deschisă, ceea ce nu e adevărat — yala se încuie la loc. */
      setTimeout(() => { setStare("gata"); muta(0); }, 4000);
    } else {
      setStare("eroare");
      setEroare(r?.error || "Deschiderea a eșuat.");
      muta(0);
      setTimeout(() => setStare((s) => (s === "eroare" ? "gata" : s)), 6000);
    }
  }, [room.id, room.name, muta]);

  const laCapat = (pozitie) => {
    if (maxim > 0 && pozitie >= maxim * PRAG) { muta(maxim); deschide(); }
    else muta(0);
  };

  const onPointerDown = (e) => {
    if (inactiv) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* neacceptat */ }
    trageRef.current = true;
    setTrage(true);
  };
  const onPointerMove = (e) => {
    if (!trageRef.current || inactiv || !sina.current) return;
    const stanga = sina.current.getBoundingClientRect().left;
    muta(Math.min(maxim, Math.max(0, e.clientX - stanga - LATIME_BUTON / 2)));
  };
  const incheie = (e) => {
    if (!trageRef.current) return;
    trageRef.current = false;
    setTrage(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* deja eliberat */ }
    laCapat(xRef.current);
  };

  const eticheta =
    stare === "deschid" ? "Deschid…"
    : stare === "deschis" ? "Ușa e deschisă"
    : blocat ? motivBlocare
    : "Glisează ca să deschizi";

  return (
    <div className="glisor-usa-wrap">
      <div
        ref={sina}
        className={"glisor-usa" + (blocat ? " blocat" : "") + (stare === "deschis" ? " reusit" : "")}
        aria-hidden={blocat ? "true" : undefined}
      >
        <span className="glisor-eticheta">{eticheta}</span>
        <button
          type="button"
          className="glisor-buton"
          style={{ transform: `translateX(${x}px)`, transition: trage ? "none" : undefined }}
          disabled={inactiv}
          aria-label={blocat ? motivBlocare : `Deschide ușa camerei ${room.name}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={incheie}
          onPointerCancel={incheie}
          /* Tastatura nu poate glisa. Enter/Space fac direct acțiunea:
             glisarea există împotriva atingerii accidentale pe telefon, iar
             o apăsare pe un element focalizat e deja deliberată. */
          onKeyDown={(e) => {
            if (inactiv) return;
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); muta(maxim); deschide(); }
          }}
        >
          {stare === "deschid" ? <RefreshCw size={15} className="spin" />
            : stare === "deschis" ? <Check size={15} />
            : <Unlock size={15} />}
        </button>
      </div>
      {eroare && <div className="error-text" role="alert" style={{ marginTop: 6 }}>{eroare}</div>}
    </div>
  );
}

export function HousekeepingView({ core, reservations, housekeeping, updateHousekeeping }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);

  const arrivesToday = (roomId) =>
    reservations.some((r) => r.roomId === roomId && isLive(r) &&
      new Date(r.checkin) >= today && new Date(r.checkin) < tomorrow);

  /* „Cazată" înseamnă check-in făcut, nu doar o rezervare care acoperă ziua
     de azi: între o sosire de azi neînregistrată încă și o cameră în care
     stă cineva chiar acum e toată diferența. Aceeași definiție ca pe server
     (status = 'checkedin'), altfel interfața ar bloca alte camere decât
     refuză funcția edge. */
  const ocupata = (roomId) =>
    reservations.some((r) => r.roomId === roomId && r.status === "checkedin");

  const setStatus = async (roomId, status) => {
    const next = { ...housekeeping, [roomId]: { status, updatedAt: new Date().toISOString() } };
    await updateHousekeeping(next);
    const label = HK_STATUSES.find((x) => x.key === status)?.label || status;
    await audit.push("Status cameră", `${core.rooms.find((r) => r.id === roomId)?.name} → ${label}`);
  };

  const groups = ["tiny", "loft"].map((t) => ({ type: t, rooms: core.rooms.filter((r) => r.type === t) })).filter((g) => g.rooms.length);

  return (
    <div>
      {groups.map((g) => (
        <div key={g.type} style={{ marginBottom: 22 }}>
          <div className="group-head">
            {ROOM_TYPE[g.type].label}
            <span className="badge-count">{g.rooms.length}</span>
          </div>
          <div className="room-grid">
            {g.rooms.map((room) => {
              const hk = housekeeping[room.id] || { status: "clean" };
              const arrival = arrivesToday(room.id);
              const cazata = ocupata(room.id);
              return (
                <div className="room-card" key={room.id}>
                  <div className="top">
                    <h4>{room.name}</h4>
                    {arrival && <span className="arrival-badge">Sosire azi</span>}
                    {cazata && <span className="occupied-badge">Cazată</span>}
                  </div>
                  <div className="status-btns">
                    {HK_STATUSES.map((s) => (
                      <button
                        key={s.key}
                        className={"status-btn" + (hk.status === s.key ? " on " + s.cls : "")}
                        onClick={() => setStatus(room.id, s.key)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {/* Camera fără yală asociată n-are ce deschide — glisorul
                      lipsește cu totul, nu apare dezactivat degeaba. */}
                  {room.accessLockId && (
                    <GlisorDeschidere
                      room={room}
                      blocat={cazata && !isAdmin()}
                      motivBlocare="Cazată — doar administratorul"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   PRODUSE/SERVICII + COTE TVA (nomenclator pentru folio/facturare)
----------------------------------------------------------------*/

export function RoomsView({ core, updateCore, reservations, updateReservations, blocks, updateBlocks }) {
  const [tab, setTab] = useState("rooms");
  const [modal, setModal] = useState(null);
  const [confirmRoomId, setConfirmRoomId] = useState(null);
  const [modPasajDeschis, setModPasajDeschis] = useState(false);

  const save = async (room) => {
    const exists = core.rooms.some((r) => r.id === room.id);
    // Merge peste rândul existent (nu înlocuire completă), ca sortOrder/
    // icalToken sau orice alt câmp neexpus în formular să nu se piardă.
    const next = exists
      ? core.rooms.map((r) => (r.id === room.id ? { ...r, ...room } : r))
      : [...core.rooms, room];
    await updateCore({ ...core, rooms: next });
    await audit.push(exists ? "Cameră modificată" : "Cameră adăugată", room.name);
    setModal(null);
  };
  const remove = async (id) => {
    const rm = core.rooms.find((r) => r.id === id);
    const beforeCore = core;
    const beforeRes = reservations;
    const beforeBlocks = blocks;
    const affectedRes = reservations.filter((r) => r.roomId === id).length;
    const affectedBlocks = (blocks || []).filter((b) => b.roomId === id).length;

    await updateCore({ ...core, rooms: core.rooms.filter((r) => r.id !== id) });
    await updateReservations(reservations.filter((r) => r.roomId !== id));
    await updateBlocks((blocks || []).filter((b) => b.roomId !== id));

    const extra = [
      affectedRes ? `${affectedRes} rezervări eliminate` : null,
      affectedBlocks ? `${affectedBlocks} blocaje eliminate` : null,
    ].filter(Boolean).join(" · ");
    await audit.push("Cameră ștearsă", extra ? `${rm?.name || id} · ${extra}` : (rm?.name || id));

    toaster.show(`Camera ${rm?.name || ""} a fost ștearsă`, {
      tone: "danger",
      onUndo: async () => {
        await updateCore(beforeCore);
        await updateReservations(beforeRes);
        await updateBlocks(beforeBlocks);
        await audit.push("Ștergere anulată", rm?.name || id);
      },
    });
  };

  const tabs = (
    <div className="sub-tabs">
      <button className={tab === "rooms" ? "on" : ""} onClick={() => setTab("rooms")}>
        <DoorOpen size={14} /> Camere <span className="tab-count">{core.rooms.length}</span>
      </button>
      <button className={tab === "rates" ? "on" : ""} onClick={() => setTab("rates")}>
        <Banknote size={14} /> Tarife
      </button>
      <button className={tab === "online" ? "on" : ""} onClick={() => setTab("online")}>
        <TrendingUp size={14} /> Optimizator preț
      </button>
      <button className={tab === "tags" ? "on" : ""} onClick={() => setTab("tags")}>
        <TagIcon size={14} /> Etichete <span className="tab-count">{(core.tags || DEFAULT_TAGS).length}</span>
      </button>
    </div>
  );

  if (tab === "rates") {
    return <div>{tabs}<RatesView core={core} updateCore={updateCore} /></div>;
  }

  if (tab === "online") {
    return <div>{tabs}<OnlinePricingView core={core} updateCore={updateCore} /></div>;
  }

  if (tab === "tags") {
    return <div>{tabs}<TagsView core={core} updateCore={updateCore} /></div>;
  }

  return (
    <div>
      {tabs}
      <div className="note">
        ID-urile de dispozitiv de mai jos sunt folosite de workflow-ul de automatizare (n8n → Home Assistant) ca să
        știe ce releu Shelly și ce unitate Sensibo aparțin fiecărei camere.
      </div>
      <div className="toolbar">
        <div className="grow" />
        {/* Doar admin — mod trecere liberă lasă usi descuiate, e mai
            sensibil decat deschiderea la distanta (vezi access-provider),
            care e deja restransa la admin. Ascuns, nu doar dezactivat: un
            buton care oricum ar refuza serverul e o eroare confuza in loc
            de una clara. */}
        {isAdmin() && (
          <button className="btn btn-ghost" style={{ width: "auto" }} onClick={() => setModPasajDeschis(true)}>
            <Unlock size={15} /> Mod trecere liberă
          </button>
        )}
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ room: null })}>
          <Plus size={15} /> Cameră nouă
        </button>
      </div>
      {modPasajDeschis && (
        <PassageModePanel
          rooms={core.rooms.filter((r) => r.accessLockId)}
          onClose={() => setModPasajDeschis(false)}
        />
      )}
      <div className="panel">
        {core.rooms.map((r) => (
          <div className="list-row" key={r.id}>
            <div>
              <div className="primary">{r.name} <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>· {ROOM_TYPE[r.type]?.label || ""}</span></div>
              <div className="device-row mono"><Flame size={12} /> {r.boilerId} &nbsp; <Wind size={12} /> {r.ventId} &nbsp; <Snowflake size={12} /> {r.sensiboId}</div>
            </div>
            <div className="row-actions">
              <button className="icon-btn" onClick={() => setModal({ room: r })} aria-label={`Editează camera ${r.name}`}><Pencil size={14} /></button>
              {confirmRoomId === r.id ? (
                <>
                  <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>
                    {(() => {
                      const nR = reservations.filter((x) => x.roomId === r.id).length;
                      const nB = (blocks || []).filter((x) => x.roomId === r.id).length;
                      const parts = [];
                      if (nR) parts.push(`${nR} rezervări`);
                      if (nB) parts.push(`${nB} blocaje`);
                      return parts.length ? `Se șterg și ${parts.join(" și ")}` : "Camera nu are rezervări";
                    })()}
                  </span>
                  <button className="btn btn-danger" style={{ padding: "8px 12px" }}
                    onClick={() => { remove(r.id); setConfirmRoomId(null); }}>
                    Șterge tot
                  </button>
                  <button className="btn btn-ghost" style={{ padding: "8px 12px" }}
                    onClick={() => setConfirmRoomId(null)}>
                    Renunță
                  </button>
                </>
              ) : (
                <button className="icon-btn" onClick={() => setConfirmRoomId(r.id)} aria-label={`Șterge camera ${r.name}`}><Trash2 size={14} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
      {modal && <RoomModal room={modal.room} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}

export function RoomModal({ room, onSave, onClose }) {
  useModalLock();
  const [tab, setTab] = useState("info");
  const [name, setName] = useState(room?.name || "");
  const [type, setType] = useState(room?.type || "tiny");
  const [capacity, setCapacity] = useState(room?.capacity ?? 2);
  const [boilerId, setBoilerId] = useState(room?.boilerId || "");
  const [ventId, setVentId] = useState(room?.ventId || "");
  const [sensiboId, setSensiboId] = useState(room?.sensiboId || "");
  const [accessLockId, setAccessLockId] = useState(room?.accessLockId || "");
  const [accessLockName, setAccessLockName] = useState(room?.accessLockName || "");
  /* Yalele citite de la furnizor. `null` = nu s-a cerut inca lista;
     [] = s-a cerut si nu a venit niciuna. Distinctia conteaza pentru mesaj. */
  const [yale, setYale] = useState(null);
  const [yaleStare, setYaleStare] = useState(null);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [unlockStare, setUnlockStare] = useState(null);
  const [error, setError] = useState("");

  const icalUrl = room?.icalToken
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ical-feed/${room.icalToken}.ics`
    : null;
  const copyIcal = async () => {
    if (!icalUrl) return;
    try {
      await navigator.clipboard.writeText(icalUrl);
      toaster.show("Link iCal copiat", { tone: "ok" });
    } catch {
      toaster.show("Nu am putut copia automat — selectează linkul manual.", { tone: "danger" });
    }
  };

  const submit = () => {
    if (!name.trim()) { setError("Numele camerei este obligatoriu."); setTab("info"); return; }
    const cap = Math.max(1, Number(capacity) || 1);
    onSave({
      id: room?.id || uid(), name: name.trim(), type, capacity: cap,
      boilerId: boilerId.trim(), ventId: ventId.trim(), sensiboId: sensiboId.trim(),
      accessLockId: accessLockId.trim(), accessLockName: accessLockName.trim(),
    });
  };

  return (
    <Dialog onClose={onClose} title={room ? "Editează cameră" : "Cameră nouă"}>
        <div className="sub-tabs" style={{ marginBottom: 16 }}>
          <button className={tab === "info" ? "on" : ""} onClick={() => setTab("info")}>
            <Info size={14} /> Informații cameră
          </button>
          <button className={tab === "acces" ? "on" : ""} onClick={() => setTab("acces")}>
            <KeyRound size={14} /> Yală
          </button>
          <button className={tab === "senzori" ? "on" : ""} onClick={() => setTab("senzori")}>
            <Cpu size={14} /> Senzori
          </button>
        </div>

        {tab === "info" ? (
          <>
            <div className="field-row">
              <label className="field"><span className="fl">Nume cameră</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="1015" /></label>
              <label className="field"><span className="fl">Tip</span>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="tiny">Tiny house</option>
                  <option value="loft">Loft</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span className="fl">Link iCal</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="mono" readOnly value={icalUrl || "Disponibil după prima salvare"}
                  style={{ color: icalUrl ? undefined : "var(--text-muted)" }} />
                <button type="button" className="icon-btn" onClick={copyIcal} disabled={!icalUrl}
                  aria-label="Copiază linkul iCal" title="Copiază linkul iCal">
                  <Copy size={14} />
                </button>
              </div>
            </label>
            <label className="field">
              <span className="fl">Număr maxim de persoane</span>
              <input type="number" min="1" max="20" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </label>
          </>
        ) : tab === "acces" ? (
          <>
            {/* Yala electronica. Id-ul se poate scrie de mana (din TTHOTEL)
                sau ales din lista adusa de la furnizor. Potrivirea NU se face
                automat dupa nume: numele yalei nu e o dovada ca e camera
                potrivita, iar o asociere gresita deschide alta usa. */}
            <label className="field">
              <span className="fl">Yală electronică — Lock ID</span>
              <input className="mono" value={accessLockId}
                onChange={(e) => setAccessLockId(e.target.value)}
                placeholder="ex. 1234567 (din TTHOTEL)" />
            </label>
            <label className="field">
              <span className="fl">Yală — denumire (opțional, pentru verificare)</span>
              <input value={accessLockName} onChange={(e) => setAccessLockName(e.target.value)}
                placeholder="cum apare yala în TTLock" />
            </label>

            <div className="modal-actions" style={{ marginTop: 4 }}>
              <button type="button" className="btn btn-ghost" disabled={yaleStare === "caut"}
                onClick={async () => {
                  setYaleStare("caut");
                  const r = await cheamaAcces("sync-locks");
                  if (r.ok) { setYale(r.locks || []); setYaleStare(null); }
                  else { setYale(null); setYaleStare(r.error || "Nu am putut citi yalele."); }
                }}>
                {yaleStare === "caut" ? "Citesc yalele…" : "Sincronizează yale"}
              </button>

              {/* Raspunde la "contul are drepturi pe yala asta?" fara sa
                  astepte un check-in real — necesar cand lista de yale e
                  goala, dar yala poate fi totusi operabila.
                  Codul de test e valabil abia peste o ora, deci nu deschide
                  usa nimanui, si se sterge imediat. */}
              {accessLockId.trim() && (
                <button type="button" className="btn btn-ghost" disabled={yaleStare === "test"}
                  onClick={async () => {
                    setYaleStare("test");
                    const r = await cheamaAcces("test-lock", { lockId: accessLockId.trim() });
                    setYaleStare(r?.ok
                      ? `Yala răspunde. Creare: ${r.creare}, ștergere: ${r.stergere}.${r.atentie ? " " + r.atentie : ""}`
                      : (r?.error || "Testul a eșuat."));
                  }}>
                  {yaleStare === "test" ? "Testez…" : "Testează yala"}
                </button>
              )}
            </div>

            {typeof yaleStare === "string" && yaleStare !== "caut" && (
              <div className="error-text" role="alert" style={{ marginTop: 8 }}>{yaleStare}</div>
            )}

            {yale && yale.length === 0 && (
              <div className="ldv-mic" style={{ marginTop: 8 }}>
                Contul nu are nicio yală în lista TTLock. Se întâmplă când yalele
                sunt administrate din TTHOTEL. Scrie Lock ID-ul manual (îl vezi
                în TTHOTEL, după MAC) și apasă „Testează yala" — dacă răspunde,
                integrarea merge chiar dacă lista e goală.
              </div>
            )}

            {yale && yale.length > 0 && (
              <label className="field" style={{ marginTop: 8 }}>
                <span className="fl">Alege yala ({yale.length} găsite)</span>
                <select value={accessLockId}
                  onChange={(e) => {
                    const y = yale.find((x) => x.lockId === e.target.value);
                    setAccessLockId(e.target.value);
                    if (y) setAccessLockName(y.lockAlias || y.lockName || "");
                  }}>
                  <option value="">— fără yală —</option>
                  {yale.map((y) => (
                    <option key={y.lockId} value={y.lockId}>
                      {(y.lockAlias || y.lockName || "fără nume")} · {y.lockId}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Deschidere manuala, la distanta — gandita pentru manager, nu
                pentru uz curent de receptie. De-aia cere confirmare explicita:
                o usa deschisa din greseala nu se poate anula. */}
            {accessLockId.trim() && (
              <div className="field" style={{ marginTop: 18 }}>
                <span className="fl">Deschidere la distanță</span>
                {confirmUnlock ? (
                  <div className="action-confirm">
                    <span>Deschizi ușa acum?</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-ghost" style={{ padding: "8px 12px" }}
                        onClick={() => setConfirmUnlock(false)} disabled={unlockStare === "deschid"}>Nu</button>
                      <button className="btn btn-danger" style={{ padding: "8px 12px" }}
                        disabled={unlockStare === "deschid"}
                        onClick={async () => {
                          setUnlockStare("deschid");
                          const r = await cheamaAcces("unlock", { lockId: accessLockId.trim() });
                          setUnlockStare(r?.ok ? "Ușa a fost deschisă." : (r?.error || "Deschiderea a eșuat."));
                          setConfirmUnlock(false);
                        }}>
                        Da, deschide
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn btn-ghost"
                    onClick={() => { setConfirmUnlock(true); setUnlockStare(null); }}>
                    <DoorOpen size={14} /> Deschide ușa
                  </button>
                )}
                {typeof unlockStare === "string" && unlockStare !== "deschid" && (
                  <div className={unlockStare === "Ușa a fost deschisă." ? "ldv-mic" : "error-text"}
                    role={unlockStare === "Ușa a fost deschisă." ? undefined : "alert"} style={{ marginTop: 8 }}>
                    {unlockStare}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <label className="field"><span className="fl">ID releu Shelly — boiler</span><input className="mono" value={boilerId} onChange={(e) => setBoilerId(e.target.value)} placeholder="shelly-boiler-1015" /></label>
            <label className="field"><span className="fl">ID releu Shelly — ventilație</span><input className="mono" value={ventId} onChange={(e) => setVentId(e.target.value)} placeholder="shelly-vent-1015" /></label>
            <label className="field"><span className="fl">ID dispozitiv Sensibo — AC</span><input className="mono" value={sensiboId} onChange={(e) => setSensiboId(e.target.value)} placeholder="sensibo-1015" /></label>
          </>
        )}
        {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="modal-actions">
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Anulează</button>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit}><Check size={15} /> Salvează</button>
        </div>
    </Dialog>
  );
}

/* Modul "trecere liberă" al yalei TTLock: cât timp e activ, ușa rămâne
   descuiată, fără cod — gândit pentru spații comune în orele de
   funcționare, NU pentru camere de oaspeți ocupate (nu lasă nicio urmă a
   cui a intrat). De-aia panoul avertizează explicit și cere confirmare
   pentru orice activare, la fel ca "Deschide ușa" din RoomModal.

   Secvențial, nu Promise.all, la "pe toate": nu suprasolicităm API-ul
   TTLock pe 16+ yale deodată, iar o eroare pe o yală nu oprește restul. */
export function PassageModePanel({ rooms, onClose }) {
  useModalLock();
  const [stari, setStari] = useState({});
  const [confirmBulk, setConfirmBulk] = useState(null); // "activeaza" | "dezactiveaza" | null
  const [bulkInCurs, setBulkInCurs] = useState(false);
  const [bulkRezultat, setBulkRezultat] = useState(null);

  const setStare = (lockId, patch) =>
    setStari((prev) => ({ ...prev, [lockId]: { ...prev[lockId], ...patch } }));

  const verifica = async (lockId) => {
    setStare(lockId, { verificare: "verific", eroare: null });
    const r = await cheamaAcces("passage-mode-get", { lockId });
    setStare(lockId, r.ok
      ? { verificare: null, activ: r.activ, eroare: null }
      : { verificare: null, eroare: r.error || "Nu am putut citi starea." });
  };

  const seteaza = async (lockId, activ) => {
    setStare(lockId, { actiune: activ ? "pornesc" : "opresc", eroare: null });
    const r = await cheamaAcces("passage-mode-set", { lockId, on: activ });
    setStare(lockId, r.ok
      ? { actiune: null, activ: r.activ, eroare: null }
      : { actiune: null, eroare: r.error || "Comanda a eșuat." });
    return r.ok;
  };

  const seteazaToate = async (activ) => {
    setConfirmBulk(null);
    setBulkInCurs(true);
    setBulkRezultat(null);
    let reusite = 0, esuate = 0;
    for (const r of rooms) {
      const ok = await seteaza(r.accessLockId, activ);
      if (ok) reusite++; else esuate++;
    }
    setBulkInCurs(false);
    setBulkRezultat(`${reusite} reușite${esuate ? `, ${esuate} eșuate` : ""}.`);
  };

  return (
    <Dialog onClose={onClose} title="Mod trecere liberă">
      <div className="note" style={{ marginBottom: 14 }}>
        Cât timp e activ pe o yală, ușa rămâne descuiată — oricine intră, fără
        cod și fără nicio urmă a cui a fost. Gândit pentru spații comune (hol,
        recepție) în orele de funcționare — nu pentru camere de oaspeți
        ocupate. Nu toate yalele/firmware-urile suportă modul ăsta; dacă nu-l
        suportă, comanda întoarce eroarea primită de la TTLock.
      </div>

      {rooms.length === 0 ? (
        <div className="ldv-mic">
          Nicio cameră nu are o yală asociată — configureaz-o din Editează cameră → Yală.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            {confirmBulk ? (
              <div className="action-confirm">
                <span>
                  {confirmBulk === "activeaza"
                    ? `Activezi trecerea liberă pe toate cele ${rooms.length} yale?`
                    : `Dezactivezi trecerea liberă pe toate cele ${rooms.length} yale?`}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-ghost" style={{ padding: "8px 12px" }}
                    onClick={() => setConfirmBulk(null)} disabled={bulkInCurs}>Nu</button>
                  <button className={confirmBulk === "activeaza" ? "btn btn-danger" : "btn btn-primary"}
                    style={{ padding: "8px 12px", width: "auto" }} disabled={bulkInCurs}
                    onClick={() => seteazaToate(confirmBulk === "activeaza")}>
                    Da, {confirmBulk === "activeaza" ? "activează" : "dezactivează"} pe toate
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-danger" style={{ width: "auto" }} disabled={bulkInCurs}
                  onClick={() => setConfirmBulk("activeaza")}>
                  <Unlock size={15} /> Activează pe toate
                </button>
                <button className="btn btn-ghost" style={{ width: "auto" }} disabled={bulkInCurs}
                  onClick={() => setConfirmBulk("dezactiveaza")}>
                  Dezactivează pe toate
                </button>
              </div>
            )}
            {bulkInCurs && <div className="ldv-mic" style={{ marginTop: 8 }}>Se aplică pe rând, ca să nu suprasolicităm yalele…</div>}
            {bulkRezultat && !bulkInCurs && <div className="ldv-mic" style={{ marginTop: 8 }}>{bulkRezultat}</div>}
          </div>

          <div className="panel">
            {rooms.map((r) => {
              const s = stari[r.accessLockId] || {};
              return (
                <div className="list-row" key={r.id}>
                  <div>
                    <div className="primary">{r.name}</div>
                    <div className="secondary mono">{r.accessLockName || r.accessLockId}</div>
                    {s.eroare && <div className="error-text" style={{ marginTop: 4 }}>{s.eroare}</div>}
                  </div>
                  <div className="row-actions" style={{ alignItems: "center", gap: 8 }}>
                    {s.activ === true && (
                      <span className="role-tag" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>Activ</span>
                    )}
                    {s.activ === false && <span className="secondary">Inactiv</span>}
                    <button className="btn btn-ghost" style={{ padding: "6px 10px" }}
                      disabled={s.verificare === "verific" || !!s.actiune}
                      onClick={() => verifica(r.accessLockId)}>
                      {s.verificare === "verific" ? "Verific…" : "Verifică"}
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "6px 10px" }}
                      disabled={!!s.actiune} onClick={() => seteaza(r.accessLockId, false)}>
                      {s.actiune === "opresc" ? "…" : "Dezactivează"}
                    </button>
                    <button className="btn btn-danger" style={{ padding: "6px 10px" }}
                      disabled={!!s.actiune} onClick={() => seteaza(r.accessLockId, true)}>
                      {s.actiune === "pornesc" ? "…" : "Activează"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="modal-actions" style={{ marginTop: 14 }}>
        <div className="grow" />
        <button className="btn btn-ghost" onClick={onClose}>Închide</button>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   USERS VIEW
----------------------------------------------------------------*/

export function TagsView({ core, updateCore }) {
  const tags = core.tags || DEFAULT_TAGS;
  const [draft, setDraft] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState("");

  const save = async (next, action, detail) => {
    await updateCore({ ...core, tags: next });
    await audit.push(action, detail);
    setError("");
  };

  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) { setError("Eticheta există deja."); return; }
    await save([...tags, t], "Etichetă adăugată", t);
    setDraft("");
  };

  const commitEdit = async (i) => {
    const t = editValue.trim();
    if (!t) { setEditIdx(null); return; }
    if (tags.some((x, j) => j !== i && x.toLowerCase() === t.toLowerCase())) {
      setError("Există deja o etichetă cu acest nume."); return;
    }
    const old = tags[i];
    await save(tags.map((x, j) => (j === i ? t : x)), "Etichetă redenumită", `${old} → ${t}`);
    setEditIdx(null);
  };

  const remove = async (i) => {
    const old = tags[i];
    const before = tags;
    await save(tags.filter((_, j) => j !== i), "Etichetă ștearsă", old);
    toaster.show(`Eticheta „${old}” a fost ștearsă`, {
      tone: "danger",
      onUndo: async () => { await updateCore({ ...core, tags: before }); },
    });
  };

  return (
    <div>
      <div className="note">
        Etichetele apar în formularul de rezervare. Redenumirea uneia nu schimbă rezervările care o au deja
        atașată — acelea păstrează numele vechi.
      </div>

      <div className="toolbar">
        <div className="search-box" style={{ maxWidth: 320 }}>
          <TagIcon size={15} color="var(--text-muted)" />
          <input
            value={draft}
            placeholder="Etichetă nouă"
            onChange={(e) => { setDraft(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={add} disabled={!draft.trim()}>
          <Plus size={15} /> Adaugă
        </button>
      </div>

      {error && <div className="drag-error" role="alert" style={{ marginBottom: 10 }}>{error}</div>}

      <div className="panel">
        {tags.length === 0 ? (
          <div className="section-empty">Nicio etichetă definită.</div>
        ) : tags.map((t, i) => (
          <div className="list-row" key={t + i}>
            {editIdx === i ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit(i);
                  if (e.key === "Escape") setEditIdx(null);
                }}
                onBlur={() => commitEdit(i)}
                style={{
                  flex: 1, padding: "9px 11px", border: "1px solid var(--accent)",
                  borderRadius: "var(--r-sm)", fontSize: "var(--fs-base)",
                  background: "var(--surface)", color: "var(--text)",
                }}
              />
            ) : (
              <div className="primary">{t}</div>
            )}
            <div className="row-actions">
              <button className="icon-btn" aria-label={`Redenumește ${t}`}
                onClick={() => { setEditIdx(i); setEditValue(t); setError(""); }}>
                <Pencil size={14} />
              </button>
              <button className="icon-btn" aria-label={`Șterge ${t}`} onClick={() => remove(i)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   OPTIMIZATOR PRET PE GRAD DE OCUPARE (doar rezervari "direct")
----------------------------------------------------------------*/

export function OnlinePricingView({ core, updateCore }) {
  /* `tiers` e ce e salvat cu adevarat (poate fi []); draft porneste din
     sugestiile implicite DOAR daca inca nu exista nimic salvat — dar ca
     obiect NOU, distinct de `tiers`, ca butonul de salvare sa fie activ
     de la inceput (altfel sugestiile s-ar afisa fara sa poata fi
     acceptate fara o editare in plus, inutila). */
  const tiers = core.onlinePricing || [];
  const [draft, setDraft] = useState(() => (tiers.length ? tiers : DEFAULT_ONLINE_TIERS.map((t) => ({ ...t }))));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(tiers);

  useEffect(() => {
    if (!dirty) setDraft(tiers.length ? tiers : DEFAULT_ONLINE_TIERS.map((t) => ({ ...t })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiers]);

  const setTier = (id, patch) => {
    setDraft((d) => d.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setSaved(false);
  };
  const addTier = () => {
    setDraft((d) => [...d, { id: uid(), min: 0, max: 10, adjustmentPct: 0 }]);
    setSaved(false);
  };
  const removeTier = (id) => {
    setDraft((d) => d.filter((t) => t.id !== id));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    const normalized = draft
      .map((t) => ({
        ...t,
        min: Math.max(0, Math.min(100, Number(t.min) || 0)),
        max: Math.max(0, Math.min(100, Number(t.max) || 0)),
        adjustmentPct: Number(t.adjustmentPct) || 0,
      }))
      .sort((a, b) => a.min - b.min);
    await updateCore({ ...core, onlinePricing: normalized });
    await audit.push("Optimizator preț online modificat", "Praguri de ocupare actualizate");
    setDraft(normalized);
    setSaving(false);
    setSaved(true);
  };

  return (
    <div>
      <div className="note">
        Se aplică <strong>doar</strong> rezervărilor cu sursa <strong>Site propriu (online)</strong> — nu afectează
        rezervările introduse manual de recepție (Direct, Telefon, Walk-in etc.). Booking.com și Airbnb nu pot primi
        tarife prin feedul iCal, doar disponibilitate, așa că rămân la tariful standard. Ocuparea se calculează ca
        medie pe toată perioada sejurului, la nivel de proprietate (toate camerele), iar ajustarea se aplică
        procentual peste prețul standard calculat din tarife/sezoane.
      </div>

      <div className="panel" style={{ padding: 18 }}>
        {draft.length === 0 ? (
          <div className="section-empty">Niciun prag definit — rezervările directe folosesc tariful standard.</div>
        ) : draft.map((t) => {
          const sign = t.adjustmentPct > 0 ? "up" : t.adjustmentPct < 0 ? "down" : null;
          return (
            <div key={t.id} className="tier-row">
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">Ocupare de la (%)</span>
                <input type="number" min="0" max="100" value={t.min} onChange={(e) => setTier(t.id, { min: e.target.value })} />
              </label>
              <span className="tier-sep">–</span>
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">până la (%)</span>
                <input type="number" min="0" max="100" value={t.max} onChange={(e) => setTier(t.id, { max: e.target.value })} />
              </label>
              <label className="field tier-adj" style={{ margin: 0 }}>
                <span className="fl">Ajustare preț</span>
                <div className="tier-adj-input">
                  <input type="number" step="1" value={t.adjustmentPct} onChange={(e) => setTier(t.id, { adjustmentPct: e.target.value })} />
                  <span>%</span>
                  {sign === "up" && <TrendingUp size={14} className="tier-up" />}
                  {sign === "down" && <TrendingUp size={14} className="tier-down" />}
                </div>
              </label>
              <button className="icon-btn" onClick={() => removeTier(t.id)} aria-label="Șterge pragul">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        <button className="btn btn-ghost" style={{ marginTop: draft.length ? 12 : 0 }} onClick={addTier}>
          <Plus size={15} /> Prag nou
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={save} disabled={!dirty || saving}>
          <Check size={15} /> {saving ? "Se salvează…" : "Salvează"}
        </button>
        {saved && !dirty && <span style={{ color: "var(--success)", fontSize: 13, fontWeight: 600 }}>Salvat</span>}
        {dirty && <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Modificări nesalvate</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   RATES EDITOR (inside Configurare)
----------------------------------------------------------------*/

export function RatesView({ core, updateCore }) {
  const rates = core.rates || { base: { tiny: 0, loft: 0 }, seasons: [] };
  const [draft, setDraft] = useState(rates);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(rates);

  /* Daca tarifele se schimba din exterior (ex. un reload fortat de o
     eroare de sincronizare in alta parte a aplicatiei) cat timp pagina
     asta e deschisa, draft-ul ramane blocat pe useState-ul initial —
     resincronizam aici, dar doar cat timp nu exista modificari nesalvate. */
  useEffect(() => {
    if (!dirty) setDraft(rates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates]);

  const setBase = (key, v) => { setDraft((d) => ({ ...d, base: { ...d.base, [key]: v } })); setSaved(false); };
  const setSeason = (id, patch) => {
    setDraft((d) => ({ ...d, seasons: d.seasons.map((sn) => (sn.id === id ? { ...sn, ...patch } : sn)) }));
    setSaved(false);
  };
  const addSeason = () => {
    setDraft((d) => ({
      ...d,
      seasons: [...d.seasons, { id: uid(), name: "Sezon nou", start: "01-01", end: "01-31", tiny: d.base.tiny, loft: d.base.loft }],
    }));
    setSaved(false);
  };
  const removeSeason = (id) => {
    setDraft((d) => ({ ...d, seasons: d.seasons.filter((sn) => sn.id !== id) }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    const normalized = {
      base: {
        tiny: Number(draft.base.tiny) || 0, loft: Number(draft.base.loft) || 0,
        tinySingle: Number(draft.base.tinySingle) || 0, loftSingle: Number(draft.base.loftSingle) || 0,
        adultSupplement: Number(draft.base.adultSupplement) || 0, childSupplement: Number(draft.base.childSupplement) || 0,
      },
      seasons: draft.seasons.map((sn) => ({ ...sn, tiny: Number(sn.tiny) || 0, loft: Number(sn.loft) || 0 })),
    };
    await updateCore({ ...core, rates: normalized });
    await audit.push("Tarife modificate", "Configurare tarife actualizată");
    setDraft(normalized);
    setSaving(false);
    setSaved(true);
  };

  return (
    <div>
      <div className="note">
        Tarifele sunt pe noapte, per cameră. Sezoanele au prioritate față de tariful de bază; se dau ca zi-lună
        (LL-ZZ) și pot trece peste Anul Nou. Tariful single se aplică doar la 1 adult și niciun copil — orice altă
        ocupare folosește tariful standard, plus suplimentul de adult peste 2 adulți și suplimentul de copil pentru
        fiecare copil. Modificările se salvează doar la apăsarea butonului de mai jos.
      </div>

      <div className="panel" style={{ padding: 18, marginBottom: 16 }}>
        <div className="section-head" style={{ padding: 0, border: "none", marginBottom: 14 }}>Tarif de bază</div>
        <div className="field-row field-row-2col">
          <label className="field">
            <span className="fl">Tiny house (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.tiny} onChange={(e) => setBase("tiny", e.target.value)} />
          </label>
          <label className="field">
            <span className="fl">Loft (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.loft} onChange={(e) => setBase("loft", e.target.value)} />
          </label>
        </div>
        <div className="field-row field-row-2col">
          <label className="field">
            <span className="fl">Supliment adult (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.adultSupplement ?? ""} onChange={(e) => setBase("adultSupplement", e.target.value)} placeholder="0" />
          </label>
          <label className="field">
            <span className="fl">Supliment copil (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.childSupplement ?? ""} onChange={(e) => setBase("childSupplement", e.target.value)} placeholder="0" />
          </label>
        </div>
        <div className="field-row field-row-2col">
          <label className="field">
            <span className="fl">Tiny house — ocupare single (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.tinySingle ?? ""} onChange={(e) => setBase("tinySingle", e.target.value)} placeholder="ex: 300" />
          </label>
          <label className="field">
            <span className="fl">Loft — ocupare single (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.loftSingle ?? ""} onChange={(e) => setBase("loftSingle", e.target.value)} placeholder="ex: 420" />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={save} disabled={!dirty || saving}>
            <Check size={15} /> {saving ? "Se salvează…" : "Salvează tarifele"}
          </button>
          {saved && !dirty && <span style={{ color: "var(--success)", fontSize: 13, fontWeight: 600 }}>Salvat</span>}
          {dirty && <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Modificări nesalvate</span>}
        </div>
      </div>

      <div className="toolbar">
        <span className="badge-count">{draft.seasons.length} sezoane</span>
        <div className="grow" />
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={addSeason}><Plus size={15} /> Sezon nou</button>
      </div>

      <div className="panel">
        {draft.seasons.length === 0 ? (
          <div className="section-empty">Niciun sezon — se aplică tariful de bază tot anul.</div>
        ) : draft.seasons.map((sn) => (
          <div key={sn.id} style={{ padding: 16, borderBottom: "1px solid var(--border-soft)" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={sn.name} onChange={(e) => setSeason(sn.id, { name: e.target.value })}
                style={{ flex: 1, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 10, fontSize: 13.5 }} />
              <button className="icon-btn" onClick={() => removeSeason(sn.id)} aria-label={`Șterge sezonul ${sn.name}`}><Trash2 size={14} /></button>
            </div>
            <div className="season-grid">
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">De la (LL-ZZ)</span>
                <input className="mono" value={sn.start} placeholder="06-15" onChange={(e) => setSeason(sn.id, { start: e.target.value })} />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">Până la</span>
                <input className="mono" value={sn.end} placeholder="09-15" onChange={(e) => setSeason(sn.id, { end: e.target.value })} />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">Tiny</span>
                <input type="number" min="0" value={sn.tiny} onChange={(e) => setSeason(sn.id, { tiny: Number(e.target.value) || 0 })} />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">Loft</span>
                <input type="number" min="0" value={sn.loft} onChange={(e) => setSeason(sn.id, { loft: Number(e.target.value) || 0 })} />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   RESERVATION ACTION SHEET
----------------------------------------------------------------*/
