/* SETARI — useri si drepturi, profilul propriu, jurnalul, rapoartele.
 *
 * Verificarea de parola scursa (aparitiiInScurgeri) foloseste k-anonimatul
 * Have I Been Pwned: se trimit primele 5 caractere din SHA-1, niciodata
 * parola. Serviciul nu poate sti ce parola s-a verificat.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, Check, Trash2, Pencil, UserCog, LogOut, ShieldCheck, History, BarChart3, ChevronLeft, ChevronRight, TrendingUp, AlertTriangle, Settings, ArrowRight, Printer, Download } from "lucide-react";
import { supabase } from "../supabase.js";
import * as datePersonal from "../data/personal.js";
import { mesajEroare } from "../lib/errors.js";
import { audit, incarcaJurnal } from "../lib/audit.js";
import { fmtMoney, fmtDate, fmtDateTime, FMT_TIME, initials, FMT_MONTH_YEAR } from "../lib/format.js";
import { ROLE_LABEL, ROOM_TYPE, sourceLabel, STATUS_CLASS, PERMISSIONS, ALL_PERMS } from "../lib/constante.js";
import { nightsBetween } from "../lib/availability.js";
/* Cifrele lunare vin din baza (raport_luna) si se traduc in lib/rapoarte.js
   (testat in src/rapoarte.test.js); ecranul doar le cere si le deseneaza. */
import { inceputDeLuna, statisticiDinSql, deltaRaport, csvRaport, numeFisierRaport } from "../lib/rapoarte.js";
import { FUS_HOTEL, partiLocale, adaugaZile, dinPartiLocale } from "../lib/timp.js";
import { descarcaText } from "../lib/descarcare.js";
import * as dateRapoarte from "../data/rapoarte.js";
import { Dialog, toaster, useModalLock, Stat, PdfPreview } from "../ui/primitive.jsx";
import { useInterfata } from "../ui/interfata.jsx";
import { INTERFETE, ETICHETA_INTERFATA, TEME, ETICHETA_TEMA } from "../lib/interfata.js";
import { ContCaldav } from "./caldav.jsx";
import { cameraDinDetaliu, filtreazaJurnal, ziiDistincte, grupeazaPeZi, etichetaZi, INTARZIERE_RECERERE_JURNAL_MS } from "../lib/jurnal.js";
import { ACTIUNE_EROARE } from "../lib/erori-productie.js";
import { generatePdfBlob, pregatesteFila, arataInFila, inchideFila } from "../lib/pdf.js";

export function UsersView({ user, onLogout }) {
  const admin = user.role === "admin";
  const [list, setList] = useState(null);
  const [modal, setModal] = useState(null);
  const [loadError, setLoadError] = useState("");
  const adminCount = (list || []).filter((u) => u.role === "admin").length;

  const load = useCallback(async () => {
    try { setList(await datePersonal.listeazaPersonal()); setLoadError(""); }
    catch (e) { setLoadError(mesajEroare(e)); }
  }, []);
  useEffect(() => { if (admin) load(); }, [admin, load]);

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

  /* Lista echipei e doar a adminului (RLS o si refuza altora); ceilalti
     gasesc aici doar contul lor. Contul sta primul: e ce cauta oricine
     aici; echipa vine sub el. */
  const echipa = !admin ? null : list === null ? (
    <div className="section-empty">
      {loadError ? `Nu am putut încărca lista de useri: ${loadError}` : "Se încarcă…"}
    </div>
  ) : (
    <>
      <div className="note">
        Contul (email + parolă) se creează în Supabase → Authentication → Users. De aici legi doar
        numele și rolul de UUID-ul acelui cont.
      </div>
      <div className="toolbar">
        <span className="badge-count">{list.length} useri</span>
        <div className="grow" />
        <button className="btn btn-primary btn-lat" onClick={() => setModal({ user: null })}>
          <Plus size={15} /> User nou
        </button>
      </div>
      <div className="panel">
        {list.map((u) => (
          <div className="list-row" key={u.user_id}>
            <div>
              <div className="primary">{u.name}</div>
              <div className="secondary mono setari-id-mic">{u.user_id}</div>
            </div>
            <div className="setari-user-dreapta">
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
    </>
  );

  return (
    <div>
      <ContulMeu user={user} onLogout={onLogout} />
      {echipa}
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
        {error && <div className="error-text mb-10" role="alert">{error}</div>}
        <div className="modal-actions">
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Anulează</button>
          <button className="btn btn-primary btn-lat" onClick={submit} disabled={busy}><Check size={15} /> Salvează</button>
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

/* Contul propriu: cine esti, ce drepturi ai, schimbarea parolei si iesirea
   din cont. Sta in „Useri și drepturi", deasupra echipei, nu pe un buton
   propriu in antet: pe telefon, al patrulea buton din bara nu mai lasa loc
   titlului ecranului. Formularul de parola e pliat — se schimba rar, iar
   desfacut impingea echipa sub margine. */
export function ContulMeu({ user, onLogout }) {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [schimbaParola, setSchimbaParola] = useState(false);
  const { interfata, seteazaInterfata, tema, seteazaTema } = useInterfata();
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
    <div className="panel cont-meu">
      <div className="profile-head">
        <div className="big-avatar">{initials(user.name)}</div>
        <div className="cont-cine">
          <div className="pname">{user.name}</div>
          <span className={"role-tag role-" + user.role}>{ROLE_LABEL[user.role]}</span>
        </div>
        <div className="cont-actiuni">
          <button className="btn btn-ghost" onClick={() => setSchimbaParola((v) => !v)} aria-expanded={schimbaParola}>
            <ShieldCheck size={14} /> Schimbă parola
          </button>
          <button className="btn btn-danger" onClick={onLogout}><LogOut size={14} /> Ieși din cont</button>
        </div>
      </div>

      {/* Comutatorul si tema stau aici, nu in Setari: sunt ale dispozitivului
          (localStorage), nu ale pensiunii — vezi lib/interfata.js. */}
      <div className="cont-optiuni">
        <div className="cont-optiune">
          <span className="cont-optiune-eticheta">Interfața</span>
          <div className="mode-switch" role="group" aria-label="Interfața">
            {INTERFETE.map((k) => (
              <button key={k} type="button" className={interfata === k ? "on" : ""} aria-pressed={interfata === k}
                onClick={() => seteazaInterfata(k)}>{ETICHETA_INTERFATA[k]}</button>
            ))}
          </div>
          <span className="cont-optiune-nota">
            Nouă: navigare jos pe telefon, „înapoi” închide fereastra, erorile lângă câmp,
            bara de acțiuni lipită jos, culorile stărilor în Azi. O apăsare pe „Actuală”
            readuce forma de dinainte, pe acest dispozitiv.
          </span>
        </div>
        <div className="cont-optiune">
          <span className="cont-optiune-eticheta">Aspect</span>
          <div className="mode-switch" role="group" aria-label="Aspect">
            {TEME.map((k) => (
              <button key={k} type="button" className={tema === k ? "on" : ""} aria-pressed={tema === k}
                onClick={() => seteazaTema(k)}>{ETICHETA_TEMA[k]}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Parola CalDAV pentru calendarul salilor pe telefon (features/caldav.jsx). */}
      <ContCaldav user={user} />

      {schimbaParola && (
        <div className="cont-parola">
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
          {msg && <div className={msg.type === "ok" ? "ok-text" : "error-text"} role="alert">{msg.text}</div>}
          <button className="btn btn-primary" onClick={changePassword} disabled={busy}><ShieldCheck size={15} /> Salvează parola</button>
        </div>
      )}

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
    adaugaZile(monthStart, zi - 1).toLocaleDateString("ro-RO", { weekday: "long", timeZone: FUS_HOTEL });

  return (
    <Dialog onClose={onClose} className="arrival-modal" overlayClassName="arrival-overlay" title={undefined}>
      <div className="modal-head no-print">
        <h3>Raport zilnic</h3>
        <div className="setari-ocupare-modal-actiuni">
          <button className="btn btn-primary btn-lat" onClick={descarca} disabled={genereaza}>
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
            <h2 className="mt-0">Raport zilnic · {luna}</h2>

            {/* O singura coloana: toate zilele lunii una sub alta, 31 de
                randuri. */}
            <table className="tabel-zile">
              <thead>
                <tr>
                  <th>Ziua</th>
                  <th className="setari-ocupare-num">Camere</th>
                  <th className="setari-ocupare-num">Grad</th>
                  <th className="setari-ocupare-num">Încasat</th>
                </tr>
              </thead>
              <tbody>
                {perDay.map((p) => (
                  <tr key={p.day} className={p.occ === 0 ? "zi-goala" : undefined}>
                    <td>{String(p.day).padStart(2, "0")} <span className="zi-nume">{numeZi(p.day)}</span></td>
                    <td className="text-right">{p.occ}{totalCamere ? ` / ${totalCamere}` : ""}</td>
                    <td className="text-right">{totalCamere ? Math.round((p.occ / totalCamere) * 100) : 0}%</td>
                    <td className="text-right">{fmtMoney(p.rev)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Total lună</th>
                  <th className="setari-ocupare-num">{totalCamereNopti} nopți</th>
                  <th className="setari-ocupare-num">
                    {totalCamere && perDay.length
                      ? Math.round((totalCamereNopti / (totalCamere * perDay.length)) * 100) : 0}%
                  </th>
                  <th className="setari-ocupare-num">{fmtMoney(totalVenit)}</th>
                </tr>
              </tfoot>
            </table>

            <p className="text-secundar mt-10">
              Ziua plecării nu se numără ca noapte vândută, deci o zi cu schimb de
              oaspeți apare o singură dată. Rezervările de protocol sunt excluse.
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function ReportsView({ core }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [detaliuZilnic, setDetaliuZilnic] = useState(false);

  const monthStart = inceputDeLuna(monthOffset);
  const monthStartMs = monthStart.getTime();

  /* Cifrele vin din baza (`raport_luna`, docs/faza1.md 2.5), nu din
     rezervarile din browser: acelea sunt doar fereastra de timp, iar luna
     trecuta incepe cu pana la 61 de zile in urma, dincolo de cele 30
     incarcate. Definitia ramane cea din lib/rapoarte.js (statisticiLuna),
     verificata cifra cu cifra cu SQL-ul (scripts/paritate-raport.mjs). Cat
     timp raspunsul e pe drum raman cifrele lunii de dinainte, estompate. */
  const [raport, setRaport] = useState(() => ({ ...statisticiDinSql(null), anTrecut: null, pentru: null, eroare: "" }));
  const { an, luna } = partiLocale(monthStart);
  useEffect(() => {
    let activ = true;
    Promise.all([
      dateRapoarte.raportLuna(an, luna),
      /* Aceeasi luna a anului trecut, pentru delta (faza 3, C6). Daca nu
         vine, cardurile raman fara delta — nu fara cifre. */
      dateRapoarte.raportLuna(an - 1, luna).catch((e) => {
        console.warn("Raportul anului trecut nu s-a putut citi", e);
        return null;
      }),
    ])
      .then(([r, r1]) => {
        if (activ) setRaport({ ...statisticiDinSql(r), anTrecut: statisticiDinSql(r1).luna, pentru: monthStartMs, eroare: "" });
      })
      .catch((e) => {
        if (!activ) return;
        console.error("Raportul lunar nu s-a putut citi", e);
        setRaport((s) => ({ ...s, pentru: monthStartMs, eroare: mesajEroare(e, "Nu am putut încărca raportul") }));
      });
    return () => { activ = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStartMs]);
  const seIncarca = raport.pentru !== monthStartMs;
  const etichetaAnTrecut = FMT_MONTH_YEAR.format(dinPartiLocale(an - 1, luna, 1));
  const delta = deltaRaport(raport.luna, raport.anTrecut);
  const cuDelta = (d) => (d ? { ...d, titlu: `față de ${etichetaAnTrecut}` } : undefined);
  const exportaCsv = () => {
    descarcaText(csvRaport(raport, { an, luna }), numeFisierRaport(an, luna), "text/csv;charset=utf-8", { bom: true });
    audit.push("Raport exportat", FMT_MONTH_YEAR.format(monthStart));
  };

  const { roomNights, revenue, perDay, capacity, byType, bySource, occupancy, adr, revpar, maxOcc } = raport.luna;
  /* Statistica separata, doar pentru rezervarile "protocol" — nu se
     amesteca cu cifrele de business. */
  const protocolStats = raport.protocol;

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
        <div className="grow" />
        <button type="button" className="btn btn-ghost btn-lat" onClick={exportaCsv} disabled={seIncarca}
          title="Zilele, totalul, sursele și tipurile de cameră ale lunii, în CSV (Excel)">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {raport.eroare && <div className="drag-error" role="alert">{raport.eroare}</div>}

      <div className={"setari-raport-continut" + (seIncarca ? " setari-raport-incarca" : "")} aria-busy={seIncarca}>
      <div className="stat-row">
        <Stat label="Ocupare" value={`${occupancy}%`} sub={`${roomNights} din ${capacity} camere-nopți`} delta={cuDelta(delta?.ocupare)} />
        <Stat label="Venit" value={fmtMoney(revenue)} sub="prețuri reale, pe nopți din lună" delta={cuDelta(delta?.venit)} />
        <Stat label="ADR" value={fmtMoney(adr)} sub="tarif mediu pe noapte" delta={cuDelta(delta?.adr)} />
        <Stat label="RevPAR" value={fmtMoney(revpar)} sub="venit pe cameră disponibilă" delta={cuDelta(delta?.revpar)} />
      </div>
      <div className="text-secundar raport-comparatie">
        {delta
          ? `Deltele sunt față de ${etichetaAnTrecut}: ocuparea în puncte procentuale, restul în procente.`
          : `Fără cifre pentru ${etichetaAnTrecut}, deci fără comparație.`}
      </div>

      {/* Tot blocul e apasabil, nu doar un link intr-un colt: graficul e
          deja lucrul la care te uiti cand vrei cifra unei zile anume. */}
      <button type="button" className="panel panel-clickabil setari-raport-buton"
        onClick={() => setDetaliuZilnic(true)}
        aria-label={`Raportul zilnic pe ${FMT_MONTH_YEAR.format(monthStart)}: camere ocupate și total încasat pe zi`}>
        <div className="section-head setari-raport-cap">
          <span>Ocupare zilnică</span>
          <span className="setari-raport-vezi-zile">Vezi pe zile <ArrowRight size={13} /></span>
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

      <div className="panel mb-14">
        <div className="section-head">Rezervări pe sursă</div>
        {bySource.length === 0 ? (
          <div className="section-empty">Nicio rezervare în această lună.</div>
        ) : bySource.map((r) => (
          <div className="list-row" key={r.key}>
            <div>
              <div className="primary">{r.label}</div>
              <div className="secondary">{r.count} rezervări · {fmtMoney(r.rev)}</div>
            </div>
            <div className="setari-raport-meter-rand">
              <div className="meter"><div className="meter-fill" style={{ width: `${r.pct}%` }} /></div>
              <span className="mono setari-raport-meter-pct">{r.pct}%</span>
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
            <div className="setari-raport-meter-rand">
              <div className="meter"><div className="meter-fill" style={{ width: `${t.pct}%` }} /></div>
              <span className="mono setari-raport-meter-pct">{t.pct}%</span>
            </div>
          </div>
        ))}
      </div>

      {protocolStats.count > 0 && (
        <div className="panel mt-14">
          <div className="section-head">
            <span className={"role-tag " + STATUS_CLASS.protocol + " mr-8"}>Protocol</span>
            Statistică separată — necontorizată în venit
          </div>
          <div className="stat-row p-16">
            <Stat label="Sejururi" value={protocolStats.count} sub="protocol" />
            <Stat label="Nopți" value={protocolStats.nights} sub="în lună" />
            <Stat label="Valoare" value={fmtMoney(protocolStats.value)} sub="neîncasată" />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   LOG VIEW
----------------------------------------------------------------*/

/* Doua select-uri, nu un cap de coloana: cerinta e sa alegi O cameră și să
 * vezi TOT istoricul ei, nu să răstorni ordinea unei liste amestecate.
 * Selectul de Zi se strânge la zilele care chiar au o intrare PENTRU CAMERA
 * ALEASĂ — altfel ai alege dintr-un calendar plin de zile goale.
 */
export function LogView({ entries, core }) {
  const [cameraId, setCameraId] = useState("");
  const [zi, setZi] = useState("");

  /* Camerele, în ordinea din Camere — aceeași ordine pe care o vede recepția
     peste tot altundeva. `sort_order` e deja aplicat la încărcare. Numele
     rămân necesare pentru intrările fără `room_id`, unde camera se citește
     din text (cameraDinDetaliu). */
  const camere = useMemo(() => core?.rooms || [], [core?.rooms]);
  const numeCamere = useMemo(() => camere.map((r) => r.name), [camere]);
  const numeDupaId = useMemo(() => new Map(camere.map((r) => [r.id, r.name])), [camere]);
  const camera = numeDupaId.get(cameraId) || "";

  /* Cu o cameră aleasă, lista vine din bază (coloana `room_id`, faza 2 A4),
     nu din cele 400 de intrări de pe ecran: filtrul vede tot istoricul
     camerei. Până sosește răspunsul se arată ce e deja aici (instant); după
     fiecare intrare nouă se recere, cu o mică întârziere, ca inserarea să fi
     ajuns în bază. */
  const [dinServer, setDinServer] = useState(null);
  const cameraAnterioara = useRef("");
  useEffect(() => {
    const schimbata = cameraAnterioara.current !== cameraId;
    cameraAnterioara.current = cameraId;
    if (schimbata) setDinServer(null);
    if (!cameraId) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      incarcaJurnal(undefined, { roomId: cameraId })
        .then((randuri) => { if (alive) setDinServer(randuri); });
    }, schimbata ? 0 : INTARZIERE_RECERERE_JURNAL_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [cameraId, entries]);

  const dinCamera = useMemo(
    () => dinServer ?? filtreazaJurnal(entries, { camera, cameraId }, numeCamere),
    [dinServer, entries, camera, cameraId, numeCamere]);

  const ziiOptiuni = useMemo(() => ziiDistincte(dinCamera), [dinCamera]);

  const filtrate = useMemo(
    () => filtreazaJurnal(dinCamera, { zi }),
    [dinCamera, zi]);

  const grupuri = useMemo(() => grupeazaPeZi(filtrate), [filtrate]);

  /* Schimbarea camerei reseteaza ziua: o zi aleasa pentru 1102 n-are de ce
     sa ramana selectata cand receptia trece la 1005 — cel mai probabil n-are
     nicio intrare acolo, si selectul ar arata gol fara motiv vizibil. */
  const alegeCamera = (id) => { setCameraId(id); setZi(""); };

  if (!entries.length) {
    return <div className="empty-state"><History size={26} /><h4>Jurnal gol</h4><p>Aici apar modificările făcute în aplicație.</p></div>;
  }

  return (
    <div>
      <div className="toolbar">
        <label className="field setari-jrn-camp">
          <span className="fl">Cameră</span>
          <select value={cameraId} onChange={(e) => alegeCamera(e.target.value)}>
            <option value="">Toate camerele</option>
            {camere.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="field setari-jrn-camp">
          <span className="fl">Zi</span>
          <select value={zi} onChange={(e) => setZi(e.target.value)} disabled={!ziiOptiuni.length}>
            <option value="">Toate zilele</option>
            {ziiOptiuni.map((z) => <option key={z} value={z}>{fmtDate(z)}</option>)}
          </select>
        </label>
      </div>

      {!filtrate.length ? (
        <div className="empty-state">
          <History size={26} /><h4>Nicio modificare</h4>
          <p>{camera ? `Nimic pentru camera ${camera}${zi ? " în ziua aleasă" : ""}.` : "Nimic pentru ziua aleasă."}</p>
        </div>
      ) : grupuri.map((g) => (
        <div key={g.zi || "fara-data"} className="jrn-grup">
          <div className="jrn-zi-cap">{etichetaZi(g.zi)}</div>
          <div className="panel">
            {g.intrari.map((e) => {
              const cameraRand = numeDupaId.get(e.roomId) || cameraDinDetaliu(e.detail, numeCamere);
              return (
                <div className={"list-row" + (e.action === ACTIUNE_EROARE ? " list-row-eroare" : "")} key={e.id}>
                  <div className="min-w-0">
                    <div className="primary">{e.action}</div>
                    <div className="secondary">{e.detail}</div>
                  </div>
                  <div className="text-right no-shrink">
                    <div className="setari-jrn-user">
                      {e.userName}
                      {/* Camera apare aici doar cand vezi TOATE camerele —
                          selectand una, e deja titlul filtrului, deci a o
                          repeta pe fiecare rand ar fi zgomot. */}
                      {!camera && cameraRand ? ` · ${cameraRand}` : ""}
                    </div>
                    <div className="secondary mono setari-id-mic">{FMT_TIME.format(new Date(e.ts))}</div>
                  </div>
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
   TAGS EDITOR (inside Configurare)
----------------------------------------------------------------*/

export function SettingsView({ setView, items }) {
  return (
    <div className="settings-grid">
      {items.map((it) => (
        <button className="settings-card" key={it.key} onClick={() => setView(it.key)}>
          <span className="ico"><it.icon size={18} /></span>
          <span>
            <span className="t">{it.label}</span>
            <span className="d">{it.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
