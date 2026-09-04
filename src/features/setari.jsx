/* SETARI — useri si drepturi, profilul propriu, jurnalul, rapoartele.
 *
 * Verificarea de parola scursa (aparitiiInScurgeri) foloseste k-anonimatul
 * Have I Been Pwned: se trimit primele 5 caractere din SHA-1, niciodata
 * parola. Serviciul nu poate sti ce parola s-a verificat.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, Check, Trash2, Pencil, UserCog, LogOut, ShieldCheck, History, BarChart3, ChevronLeft, ChevronRight, TrendingUp, AlertTriangle, Settings, ArrowRight, Printer } from "lucide-react";
import { supabase } from "../supabase.js";
import * as datePersonal from "../data/personal.js";
import { mesajEroare } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { fmtMoney, fmtDate, fmtDateTime, initials, FMT_MONTH_YEAR } from "../lib/format.js";
import { ROLE_LABEL, ROOM_TYPE, SOURCES, sourceLabel, STATUS_CLASS, PERMISSIONS, ALL_PERMS } from "../lib/constante.js";
import { nightsBetween, isStatsEligible } from "../lib/availability.js";
import { reservationTotal } from "../lib/pricing.js";
import { Dialog, toaster, useModalLock, Stat, PdfPreview } from "../ui/primitive.jsx";
import { generatePdfBlob, pregatesteFila, arataInFila, inchideFila } from "../lib/pdf.js";

export function UsersView() {
  const [list, setList] = useState(null);
  const [modal, setModal] = useState(null);
  const [loadError, setLoadError] = useState("");
  const adminCount = (list || []).filter((u) => u.role === "admin").length;

  const load = useCallback(async () => {
    try { setList(await datePersonal.listeazaPersonal()); setLoadError(""); }
    catch (e) { setLoadError(mesajEroare(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (user, isNew) => {
    const camp = { idUtilizator: user.user_id, nume: user.name, rol: user.role };
    try {
      if (isNew) await datePersonal.adaugaMembru(camp);
      else await datePersonal.actualizeazaMembru(camp);
    } catch (e) {
      toaster.show(mesajEroare(e, isNew ? "Nu am putut adăuga userul" : "Nu am putut salva userul"), { tone: "danger" });
      return;
    }
    await audit.push(isNew ? "User adăugat" : "User modificat", `${user.name} (${ROLE_LABEL[user.role]})`);
    setModal(null);
    load();
  };

  const remove = async (u) => {
    if (list.length <= 1) {
      toaster.show("Nu poți șterge singurul user rămas.", { tone: "danger" });
      return;
    }
    if (u.role === "admin" && adminCount <= 1) {
      toaster.show("Nu poți șterge singurul admin. Numește întâi alt user admin.", { tone: "danger" });
      return;
    }
    try { await datePersonal.stergeMembru(u.user_id); }
    catch (e) { toaster.show(mesajEroare(e, "Nu am putut șterge userul"), { tone: "danger" }); return; }
    await audit.push("User șters", u.name);
    toaster.show(`${u.name} a fost șters`, {
      tone: "danger",
      onUndo: async () => {
        await datePersonal.adaugaMembru({ idUtilizator: u.user_id, nume: u.name, rol: u.role });
        await audit.push("Ștergere anulată", u.name);
        load();
      },
    });
    load();
  };

  if (list === null) {
    return loadError
      ? <div className="section-empty">Nu am putut încărca lista de useri: {loadError}</div>
      : <div className="section-empty">Se încarcă…</div>;
  }

  return (
    <div>
      <div className="note">
        Contul (email + parolă) se creează în Supabase → Authentication → Users. De aici legi doar
        numele și rolul de UUID-ul acelui cont.
      </div>
      <div className="toolbar">
        <span className="badge-count">{list.length} useri</span>
        <div className="grow" />
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ user: null })}>
          <Plus size={15} /> User nou
        </button>
      </div>
      <div className="panel">
        {list.map((u) => (
          <div className="list-row" key={u.user_id}>
            <div>
              <div className="primary">{u.name}</div>
              <div className="secondary mono" style={{ fontSize: 11 }}>{u.user_id}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className={"role-tag role-" + u.role}>{ROLE_LABEL[u.role]}</span>
              <div className="row-actions">
                <button className="icon-btn" onClick={() => setModal({ user: u })} aria-label={`Editează ${u.name}`}><Pencil size={14} /></button>
                <button className="icon-btn" onClick={() => remove(u)} aria-label={`Șterge ${u.name}`}><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {modal && <UserModal user={modal.user} list={list} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}

export function UserModal({ user, list, onSave, onClose }) {
  useModalLock();
  const isNew = !user;
  const [userId, setUserId] = useState(user?.user_id || "");
  const [name, setName] = useState(user?.name || "");
  const [role, setRole] = useState(user?.role || "receptionist");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const submit = async () => {
    if (!name.trim()) { setError("Numele este obligatoriu."); return; }
    if (isNew && !uuidRe.test(userId.trim())) {
      setError("UUID invalid — copiază-l din Supabase → Authentication → Users.");
      return;
    }
    if (isNew && list.some((u) => u.user_id === userId.trim())) {
      setError("Acest UUID are deja un rol în aplicație.");
      return;
    }
    if (user && user.role === "admin" && role !== "admin") {
      const otherAdmins = list.filter((u) => u.user_id !== user.user_id && u.role === "admin").length;
      if (otherAdmins === 0) {
        setError("Nu poți schimba rolul singurului admin. Numește întâi alt user admin.");
        return;
      }
    }
    setBusy(true);
    await onSave({ user_id: isNew ? userId.trim() : user.user_id, name: name.trim(), role }, isNew);
    setBusy(false);
  };

  return (
    <Dialog onClose={onClose} title={user ? "Editează user" : "User nou"}>
        {isNew && (
          <label className="field">
            <span className="fl">UUID cont Supabase</span>
            <input className="mono" value={userId} onChange={(e) => setUserId(e.target.value)}
              placeholder="ex: 3fa85f64-5717-4562-b3fc-2c963f66afa6" />
          </label>
        )}
        <label className="field"><span className="fl">Nume</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">
          <span className="fl">Rol</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">Admin — acces complet</option>
            <option value="receptionist">Recepționer — rezervări, clienți, camere</option>
            <option value="housekeeping">Cameristă — doar status camere</option>
          </select>
        </label>
        {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="modal-actions">
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Anulează</button>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit} disabled={busy}><Check size={15} /> Salvează</button>
        </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   PROFILE VIEW
----------------------------------------------------------------*/

export async function aparitiiInScurgeri(parola) {
  try {
    const octeti = new TextEncoder().encode(parola);
    const hash = await crypto.subtle.digest("SHA-1", octeti);
    const hex = [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

    const raspuns = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, {
      // Adaugă rânduri false în răspuns, ca mărimea lui să nu spună nimic.
      headers: { "Add-Padding": "true" },
    });
    if (!raspuns.ok) return null;

    const restul = hex.slice(5);
    for (const linie of (await raspuns.text()).split("\n")) {
      const [sufix, numar] = linie.trim().split(":");
      if (sufix === restul) return Number(numar) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}

export function ProfileView({ user, onLogout, onBack }) {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const mine = PERMISSIONS[user.role] || [];

  const changePassword = async () => {
    if (password.length < 8) { setMsg({ type: "err", text: "Parola trebuie să aibă cel puțin 8 caractere." }); return; }
    if (password !== password2) { setMsg({ type: "err", text: "Cele două parole nu coincid." }); return; }
    setBusy(true);

    const aparitii = await aparitiiInScurgeri(password);
    if (aparitii) {
      setBusy(false);
      setMsg({
        type: "err",
        text: `Parola asta apare în scurgeri publice de date (de ${aparitii.toLocaleString("ro-RO")} ori). `
            + `Atacurile automate o încearcă prima. Alege alta.`,
      });
      return;
    }

    const { error } = await datePersonal.schimbaParola(password).then(() => ({ error: null }), (e) => ({ error: e }));
    setBusy(false);
    if (error) { setMsg({ type: "err", text: mesajEroare(error) }); return; }
    setPassword(""); setPassword2("");
    setMsg({ type: "ok", text: "Parola a fost schimbată." });
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="profile-head">
          <div className="big-avatar">{initials(user.name)}</div>
          <div>
            <div className="pname">{user.name}</div>
            <span className={"role-tag role-" + user.role}>{ROLE_LABEL[user.role]}</span>
          </div>
        </div>
        <div className="perm-list">
          {ALL_PERMS.map((p) => {
            const has = mine.includes(p);
            return (
              <div className={"perm-item" + (has ? "" : " off")} key={p}>
                {has ? <Check size={15} /> : <X size={15} />} {p}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel" style={{ padding: 20, marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 14px", fontSize: 14 }}>Schimbă parola</h4>
        <div className="field-row">
          <label className="field">
            <span className="fl">Parolă nouă</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setMsg(null); }} />
          </label>
          <label className="field">
            <span className="fl">Confirmă parola</span>
            <input type="password" autoComplete="new-password" value={password2} onChange={(e) => { setPassword2(e.target.value); setMsg(null); }} />
          </label>
        </div>
        {msg && <div className="error-text" role="alert" style={{ color: msg.type === "ok" ? "var(--success)" : "var(--danger)", marginBottom: 10 }}>{msg.text}</div>}
        <button className="btn btn-primary" onClick={changePassword} disabled={busy}><ShieldCheck size={15} /> Salvează parola</button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-ghost" onClick={onBack}><ChevronLeft size={15} /> Înapoi</button>
        <button className="btn btn-danger" onClick={onLogout}><LogOut size={14} /> Ieși din cont</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   GROUPS VIEW
----------------------------------------------------------------*/

/* Detaliul zilnic din spatele graficului de ocupare.
 *
 * Graficul arata forma lunii; cifra exacta a unei zile se citea doar din
 * tooltip, adica nicaieri pe telefon si niciunde tiparibil. Aici e aceeasi
 * serie (`perDay`, calculata o singura data in ReportsView), pusa in tabel.
 *
 * Nu recalculeaza nimic: primeste datele gata facute. Doua surse pentru
 * aceleasi cifre ar fi insemnat, mai devreme sau mai tarziu, doua raspunsuri
 * diferite la aceeasi intrebare. */

/* Latimea la care foaia se aseaza pentru tiparire — masurata, nu aleasa din
   ochi: cu 31 de randuri foaia iese de 935px inaltime, iar 645/935 = 0,690,
   exact proportia zonei utile a paginii A4 (194/281). Asa incadrarea pe o
   pagina umple foaia in loc s-o micsoreze. Pe ecran raportul NU are latimea
   asta; vezi .raport-sheet in pms.css. */
const LATIME_TIPAR = 645;

function OcupareZilnicaModal({ perDay, monthStart, totalCamere, onClose }) {
  const foaie = useRef(null);
  const [genereaza, setGenereaza] = useState(false);
  const [pdf, setPdf] = useState(null);
  useModalLock();

  const luna = FMT_MONTH_YEAR.format(monthStart);
  const totalCamereNopti = perDay.reduce((s, p) => s + p.occ, 0);
  const totalVenit = perDay.reduce((s, p) => s + p.rev, 0);


  const descarca = async () => {
    setGenereaza(true);
    /* Fila se cere aici, in gestul de click, nu dupa generare — vezi
       comentariul de la `pregatesteFila`. */
    const fila = pregatesteFila();
    /* Fara `catch`, un esec de generare ar trece neobservat: butonul ar
       clipi si n-ar aparea nimic. */
    try {
      /* `singlePage`: raportul unei luni e un singur document, nu o lista
         care curge. Fereastra poate fi derulata, dar PDF-ul de tiparit
         intra intreg pe o pagina, oricat de lunga e luna.
         `latimeFixa`: latimea la care foaia are proportia A4 (vezi
         LATIME_TIPAR). Se aplica doar pe durata capturii, ca pe ecran
         raportul sa curga dupa latimea ferestrei. */
      const blob = await generatePdfBlob(foaie.current, {
        singlePage: true, latimeFixa: LATIME_TIPAR,
      });
      /* Daca browserul a blocat fila, documentul tot trebuie sa apara —
         altfel butonul pare ca n-a facut nimic. */
      if (!arataInFila(fila, blob)) {
        setPdf({ blob, filename: `Raport-zilnic-${luna.replace(/\s+/g, "-")}.pdf` });
      }
    } catch (e) {
      inchideFila(fila);
      toaster.show(mesajEroare(e, "PDF-ul nu a putut fi generat"), { tone: "danger" });
    } finally { setGenereaza(false); }
  };

  /* Numele intreg, nu prescurtarea: „mar." si „mie." se confunda la
     citirea rapida a unei coloane de 31 de randuri, iar loc este. */
  const numeZi = (zi) =>
    new Date(monthStart.getFullYear(), monthStart.getMonth(), zi)
      .toLocaleDateString("ro-RO", { weekday: "long" });

  return (
    <Dialog onClose={onClose} className="arrival-modal" overlayClassName="arrival-overlay" title={undefined}>
      <div className="modal-head no-print">
        <h3>Raport zilnic</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={descarca} disabled={genereaza}>
            <Printer size={15} /> {genereaza ? "Se generează…" : "Vezi PDF"}
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Închide fereastra"><X size={16} /></button>
        </div>
      </div>

      {pdf && (
        <div onClick={(e) => e.stopPropagation()}>
          <PdfPreview blob={pdf.blob} filename={pdf.filename} onClose={() => setPdf(null)} />
        </div>
      )}

      {/* Cadrul taie ce iese in afara pe orizontala. Pe ecran nu iese nimic
          — foaia curge dupa latimea ferestrei — dar in secunda in care se
          genereaza PDF-ul ea se aseaza la LATIME_TIPAR, iar pe un telefon
          asta ar impinge fereastra in lateral. */}
      <div className="raport-cadru">
        <div className="arrival-sheet raport-sheet" ref={foaie}>
          <div className="fisa">
            <h2 style={{ marginTop: 0 }}>Raport zilnic · {luna}</h2>

            {/* O singura coloana: toate zilele lunii una sub alta, 31 de
                randuri. */}
            <table className="tabel-zile">
              <thead>
                <tr>
                  <th>Ziua</th>
                  <th style={{ textAlign: "right" }}>Camere</th>
                  <th style={{ textAlign: "right" }}>Grad</th>
                  <th style={{ textAlign: "right" }}>Încasat</th>
                </tr>
              </thead>
              <tbody>
                {perDay.map((p) => (
                  <tr key={p.day} className={p.occ === 0 ? "zi-goala" : undefined}>
                    <td>{String(p.day).padStart(2, "0")} <span className="zi-nume">{numeZi(p.day)}</span></td>
                    <td style={{ textAlign: "right" }}>{p.occ}{totalCamere ? ` / ${totalCamere}` : ""}</td>
                    <td style={{ textAlign: "right" }}>{totalCamere ? Math.round((p.occ / totalCamere) * 100) : 0}%</td>
                    <td style={{ textAlign: "right" }}>{fmtMoney(p.rev)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total lună</th>
                  <th style={{ textAlign: "right" }}>{totalCamereNopti} nopți</th>
                  <th style={{ textAlign: "right" }}>
                    {totalCamere && perDay.length
                      ? Math.round((totalCamereNopti / (totalCamere * perDay.length)) * 100) : 0}%
                  </th>
                  <th style={{ textAlign: "right" }}>{fmtMoney(totalVenit)}</th>
                </tr>
              </tfoot>
            </table>

            <p className="ldv-mic" style={{ marginTop: 10 }}>
              Ziua plecării nu se numără ca noapte vândută, deci o zi cu schimb de
              oaspeți apare o singură dată. Rezervările de protocol sunt excluse.
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function ReportsView({ core, reservations }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [detaliuZilnic, setDetaliuZilnic] = useState(false);

  const base = new Date();
  base.setDate(1); base.setHours(0, 0, 0, 0);
  base.setMonth(base.getMonth() + monthOffset);
  const monthStart = new Date(base);
  const monthEnd = new Date(base); monthEnd.setMonth(monthEnd.getMonth() + 1);
  const daysInMonth = Math.round((monthEnd - monthStart) / 86400000);
  const monthStartMs = monthStart.getTime();

  /* All month figures come from one memoized pass: dates parsed once per
     reservation, rooms looked up through a map instead of a linear find
     inside the day loop, and per-type nights accumulated in the same
     sweep rather than re-scanning the month once per room type. */
  const stats = useMemo(() => {
    const roomById = new Map(core.rooms.map((r) => [r.id, r]));
    const active = [];
    // Rezervarile protocol au propria sectiune, separata (protocolStats mai
    // jos) — nu intra in ocupare/venit/ADR/RevPAR/surse ca sa nu denatureze
    // cifrele reale de business cu sederi pe care nu se incaseaza bani.
    for (const r of reservations) {
      if (!isStatsEligible(r)) continue;
      const ciMs = new Date(r.checkin).getTime();
      const coMs = new Date(r.checkout).getTime();
      if (!Number.isFinite(ciMs) || !Number.isFinite(coMs)) continue;
      const ciDay = new Date(ciMs); ciDay.setHours(0, 0, 0, 0);
      const coDay = new Date(coMs); coDay.setHours(0, 0, 0, 0);
      // Cota pe noapte din pretul REAL (inghetat/manual), nu un recalcul cu
      // tarifele curente — la fel ca in TodayView.revenueToday, altfel
      // veniturile de aici nu se potrivesc cu cele din "bySource" mai jos.
      const totalNights = Math.max(1, Math.round((coDay - ciDay) / 86400000));
      const perNight = reservationTotal(r, core) / totalNights;
      active.push({ res: r, ciMs, coMs, ciDayMs: ciDay.getTime(), coDayMs: coDay.getTime(), room: roomById.get(r.roomId), perNight });
    }

    let roomNights = 0, revenue = 0;
    const perDay = [];
    const nightsByType = { tiny: 0, loft: 0 };

    for (let i = 0; i < daysInMonth; i++) {
      const d = new Date(monthStart); d.setDate(monthStart.getDate() + i);
      const dStart = d.getTime();
      let occ = 0, rev = 0;
      for (const e of active) {
        // Same room-night rule as the calendar footer: the departure day
        // is not a sold night, so a turnover day counts once, not twice.
        if (e.ciDayMs <= dStart && e.coDayMs > dStart) {
          occ++;
          if (e.room) {
            rev += e.perNight;
            if (nightsByType[e.room.type] != null) nightsByType[e.room.type]++;
          }
        }
      }
      roomNights += occ; revenue += rev;
      perDay.push({ day: i + 1, occ, rev });
    }

    const capacity = core.rooms.length * daysInMonth;
    const byType = ["tiny", "loft"].map((t) => {
      const cap = core.rooms.filter((r) => r.type === t).length * daysInMonth;
      const nights = nightsByType[t] || 0;
      return { type: t, nights, cap, pct: cap ? Math.round((nights / cap) * 100) : 0 };
    });

    const monthEndMs = monthEnd.getTime();
    const inMonth = active.filter((e) => e.ciMs < monthEndMs && e.coMs > monthStartMs);
    const totalInMonth = inMonth.length;
    const bySource = SOURCES.map((sc) => {
      const list = inMonth.filter((e) => (e.res.source || "direct") === sc.key);
      const rev = list.reduce((sum, e) => sum + reservationTotal(e.res, core), 0);
      return { ...sc, count: list.length, rev, pct: totalInMonth ? Math.round((list.length / totalInMonth) * 100) : 0 };
    }).filter((x) => x.count > 0).sort((a, b) => b.count - a.count);

    return {
      roomNights, revenue, perDay, capacity, byType, bySource,
      occupancy: capacity ? Math.round((roomNights / capacity) * 100) : 0,
      adr: roomNights ? revenue / roomNights : 0,
      revpar: capacity ? revenue / capacity : 0,
      maxOcc: Math.max(1, ...perDay.map((p) => p.occ)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, core, monthStartMs, daysInMonth]);

  const { roomNights, revenue, perDay, capacity, byType, bySource, occupancy, adr, revpar, maxOcc } = stats;

  /* Statistica separata, doar pentru camerele/rezervarile "protocol" —
     numar sejururi, nopti si valoarea lor (pe nopti din luna, ca la
     revenue de mai sus), fara sa se amestece cu cifrele de business. */
  const protocolStats = useMemo(() => {
    let count = 0, nights = 0, value = 0;
    const seen = new Set();
    for (const r of reservations) {
      if (r.status !== "protocol") continue;
      const ciMs = new Date(r.checkin).getTime();
      const coMs = new Date(r.checkout).getTime();
      if (!Number.isFinite(ciMs) || !Number.isFinite(coMs)) continue;
      if (ciMs >= monthEnd.getTime() || coMs <= monthStartMs) continue;
      if (!seen.has(r.id)) { seen.add(r.id); count++; }
      const ciDay = new Date(ciMs); ciDay.setHours(0, 0, 0, 0);
      const coDay = new Date(coMs); coDay.setHours(0, 0, 0, 0);
      const totalNights = Math.max(1, Math.round((coDay - ciDay) / 86400000));
      const perNight = reservationTotal(r, core) / totalNights;
      for (let d = new Date(ciDay); d < coDay; d.setDate(d.getDate() + 1)) {
        if (d.getTime() >= monthStartMs && d.getTime() < monthEnd.getTime()) { nights++; value += perNight; }
      }
    }
    return { count, nights, value };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, core, monthStartMs, daysInMonth]);

  return (
    <div>
      <div className="toolbar">
        <div className="week-nav">
          <button onClick={() => setMonthOffset((m) => m - 1)}><ChevronLeft size={15} /></button>
          <button className={monthOffset === 0 ? "on" : ""} onClick={() => setMonthOffset(0)}>
            <span>{FMT_MONTH_YEAR.format(monthStart)}</span>
          </button>
          <button onClick={() => setMonthOffset((m) => m + 1)}><ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="stat-row">
        <Stat label="Ocupare" value={`${occupancy}%`} sub={`${roomNights} din ${capacity} camere-nopți`} />
        <Stat label="Venit" value={fmtMoney(revenue)} sub="prețuri reale, pe nopți din lună" />
        <Stat label="ADR" value={fmtMoney(adr)} sub="tarif mediu pe noapte" />
        <Stat label="RevPAR" value={fmtMoney(revpar)} sub="venit pe cameră disponibilă" />
      </div>

      {/* Tot blocul e apasabil, nu doar un link intr-un colt: graficul e
          deja lucrul la care te uiti cand vrei cifra unei zile anume. */}
      <button type="button" className="panel panel-clickabil"
        style={{ padding: 18, marginBottom: 14, width: "100%", textAlign: "left" }}
        onClick={() => setDetaliuZilnic(true)}
        aria-label={`Raportul zilnic pe ${FMT_MONTH_YEAR.format(monthStart)}: camere ocupate și total încasat pe zi`}>
        <div className="section-head" style={{ padding: 0, border: "none", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Ocupare zilnică</span>
          <span className="ldv-mic" style={{ fontWeight: 500 }}>Vezi pe zile <ArrowRight size={13} /></span>
        </div>
        <div className="bar-chart">
          {perDay.map((p) => (
            <div className="bar-col" key={p.day} title={`${p.day}: ${p.occ} camere · ${fmtMoney(p.rev)}`}>
              <div className="bar-fill" style={{ height: `${(p.occ / maxOcc) * 100}%` }} />
              {p.day % 5 === 0 && <span className="bar-label">{p.day}</span>}
            </div>
          ))}
        </div>
      </button>

      {detaliuZilnic && (
        <OcupareZilnicaModal
          perDay={perDay} monthStart={monthStart} totalCamere={core.rooms.length}
          onClose={() => setDetaliuZilnic(false)}
        />
      )}

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="section-head">Rezervări pe sursă</div>
        {bySource.length === 0 ? (
          <div className="section-empty">Nicio rezervare în această lună.</div>
        ) : bySource.map((r) => (
          <div className="list-row" key={r.key}>
            <div>
              <div className="primary">{r.label}</div>
              <div className="secondary">{r.count} rezervări · {fmtMoney(r.rev)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 160 }}>
              <div className="meter"><div className="meter-fill" style={{ width: `${r.pct}%` }} /></div>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{r.pct}%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="section-head">Ocupare pe tip de cameră</div>
        {byType.map((t) => (
          <div className="list-row" key={t.type}>
            <div>
              <div className="primary">{ROOM_TYPE[t.type].label}</div>
              <div className="secondary">{t.nights} din {t.cap} camere-nopți</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 160 }}>
              <div className="meter"><div className="meter-fill" style={{ width: `${t.pct}%` }} /></div>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{t.pct}%</span>
            </div>
          </div>
        ))}
      </div>

      {protocolStats.count > 0 && (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="section-head">
            <span className={"role-tag " + STATUS_CLASS.protocol} style={{ marginRight: 8 }}>Protocol</span>
            Statistică separată — necontorizată în venit
          </div>
          <div className="stat-row" style={{ padding: 16 }}>
            <Stat label="Sejururi" value={protocolStats.count} sub="protocol" />
            <Stat label="Nopți" value={protocolStats.nights} sub="în lună" />
            <Stat label="Valoare" value={fmtMoney(protocolStats.value)} sub="neîncasată" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   LOG VIEW
----------------------------------------------------------------*/

export function LogView({ entries }) {
  if (!entries.length) {
    return <div className="empty-state"><History size={26} /><h4>Jurnal gol</h4><p>Aici apar modificările făcute în aplicație.</p></div>;
  }
  return (
    <div className="panel">
      {entries.map((e) => (
        <div className="list-row" key={e.id}>
          <div style={{ minWidth: 0 }}>
            <div className="primary">{e.action}</div>
            <div className="secondary">{e.detail}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{e.userName}</div>
            <div className="secondary mono" style={{ fontSize: 11 }}>{fmtDateTime(e.ts)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   TAGS EDITOR (inside Configurare)
----------------------------------------------------------------*/

export function SettingsView({ setView, items }) {
  return (
    <div className="settings-grid">
      {items.map((it) => (
        <button className="settings-card" key={it.key} onClick={() => setView(it.key)}>
          <span className="ico"><it.icon size={18} /></span>
          <span>
            <span className="t" style={{ display: "block" }}>{it.label}</span>
            <span className="d" style={{ display: "block" }}>{it.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
