/* SALI SI CALDAV (etapa 1, 15 septembrie 2026): ecranul adminului cu
 * calendarele salilor de evenimente (nume, culoare, import .ics) si panoul
 * din „Contul tau" de unde fiecare user isi ia parola CalDAV pentru
 * telefon. Serverul e functia supabase/functions/caldav; datele in
 * data/caldav.js.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload, Copy, KeyRound, Check, Pencil, X } from "lucide-react";
import { toaster } from "../ui/primitive.jsx";
import { mesajEroare } from "../lib/errors.js";
import { fmtDateTime } from "../lib/format.js";
import * as date from "../data/caldav.js";
import * as datePersonal from "../data/personal.js";

/* Adresa scurta: pms.lalivada.ro. Vercel rescrie /caldav/* catre functia
   Supabase si trimite /.well-known/caldav la /caldav/, deci telefonul gaseste
   singur principalul doar din numele gazdei. Adresa lunga, direct pe
   supabase.co, ramane ca rezerva. */
const GAZDA = "pms.lalivada.ro";
const ADRESA_SERVER = `https://${GAZDA}/caldav/`;
const ADRESA_LUNGA = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/caldav/`;
const CULORI = ["#2B5C8A", "#C2410C", "#0F766E", "#7C3AED", "#B45309", "#BE123C", "#4D7C0F", "#1D4ED8"];

async function copiaza(text, ce) {
  try { await navigator.clipboard.writeText(text); toaster.show(`${ce} copiat`, { tone: "ok" }); }
  catch { toaster.show("Nu am putut copia; selectează textul și copiază-l manual.", { tone: "danger" }); }
}

/* ---------- ecranul adminului ---------- */

export function SaliView() {
  const [calendare, setCalendare] = useState([]);
  const [numar, setNumar] = useState({});
  const [seIncarca, setSeIncarca] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nume, setNume] = useState("");
  const [culoare, setCuloare] = useState(CULORI[0]);
  const [editez, setEditez] = useState(null);
  const [deSters, setDeSters] = useState(null);
  const fisier = useRef(null);
  const tintaImport = useRef(null);

  const reincarca = useCallback(async () => {
    try {
      const [c, n] = await Promise.all([date.listeazaCalendare(), date.numarEvenimente()]);
      setCalendare(c); setNumar(n);
    } catch (e) {
      toaster.show(mesajEroare(e, "Nu am putut citi sălile."), { tone: "danger" });
    } finally {
      setSeIncarca(false);
    }
  }, []);
  useEffect(() => { reincarca(); }, [reincarca]);

  const ruleaza = async (ce, mesajOk) => {
    setBusy(true);
    try { await ce(); if (mesajOk) toaster.show(mesajOk, { tone: "ok" }); await reincarca(); }
    catch (e) { toaster.show(mesajEroare(e), { tone: "danger" }); }
    finally { setBusy(false); }
  };

  const adauga = (e) => {
    e.preventDefault();
    if (!nume.trim()) return;
    ruleaza(async () => { await date.adaugaCalendar({ nume: nume.trim(), culoare }); setNume(""); }, "Sală adăugată");
  };
  const salveaza = () => {
    if (!editez?.nume.trim()) return;
    ruleaza(async () => { await date.actualizeazaCalendar(editez.id, { nume: editez.nume.trim(), culoare: editez.culoare }); setEditez(null); }, "Salvat");
  };
  const sterge = (c) => ruleaza(async () => { await date.stergeCalendar(c.id); setDeSters(null); }, `„${c.nume}” ștearsă, cu evenimentele ei`);
  const alegeFisier = (c) => { tintaImport.current = c; fisier.current?.click(); };
  const importa = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    const c = tintaImport.current;
    if (!f || !c) return;
    const text = await f.text();
    await ruleaza(async () => {
      const r = await date.importaICS(c.slug, text);
      toaster.show(`${c.nume}: ${r.noi} evenimente noi, ${r.actualizate} actualizate, ${r.ignorate} deja existente`, { tone: "ok" });
    });
  };

  return (
    <div className="sali">
      <div className="panel sali-server">
        <div className="sali-server-t"><KeyRound size={15} /> Serverul CalDAV</div>
        <p className="sali-nota">
          Calendarele de mai jos se văd în aplicația Calendar de pe iPhone sau Mac printr-un cont CalDAV.
          Fiecare user își generează parola din Useri și drepturi → Contul tău, unde sunt și pașii de adăugare.
          Calendarele noi se creează doar de aici, nu din telefon.
        </p>
        <div className="sali-adresa">
          <input className="mono" readOnly value={ADRESA_SERVER} aria-label="Adresa serverului CalDAV" />
          <button type="button" className="icon-btn" onClick={() => copiaza(ADRESA_SERVER, "Adresa")} aria-label="Copiază adresa" title="Copiază adresa"><Copy size={15} /></button>
        </div>
      </div>

      <div className="panel">
        <div className="sali-cap">
          <h3>Săli</h3>
          <span className="sali-nota">{seIncarca ? "Se încarcă…" : `${calendare.length} calendare`}</span>
        </div>
        <input ref={fisier} type="file" accept=".ics,text/calendar" onChange={importa} hidden />
        {calendare.map((c) => (
          <div className="sala-rand" key={c.id}>
            {editez?.id === c.id ? (
              <>
                <input type="color" className="sala-culoare-input" value={editez.culoare || CULORI[0]}
                  onChange={(e) => setEditez({ ...editez, culoare: e.target.value.toUpperCase() })} aria-label="Culoarea sălii" />
                <input className="sala-nume-input" value={editez.nume} onChange={(e) => setEditez({ ...editez, nume: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") salveaza(); if (e.key === "Escape") setEditez(null); }} aria-label="Numele sălii" autoFocus />
                <button type="button" className="btn btn-primary sala-btn" disabled={busy} onClick={salveaza}><Check size={14} /> Salvează</button>
                <button type="button" className="icon-btn" onClick={() => setEditez(null)} aria-label="Renunță"><X size={15} /></button>
              </>
            ) : (
              <>
                {/* Bulina colorata ca SVG, nu ca stil inline: culoarea e a salii,
                    iar plafonul din stiluri-inline.test.js nu creste. */}
                <svg className="sala-culoare" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <circle cx="7" cy="7" r="7" fill={c.culoare || CULORI[0]} />
                </svg>
                <span className="sala-info">
                  <span className="sala-nume">{c.nume}</span>
                  <span className="sala-meta">
                    {numar[c.id] || 0} evenimente · <span className="mono">{c.slug}</span>
                    {c.actualizat_la ? ` · schimbat ${fmtDateTime(new Date(c.actualizat_la))}` : ""}
                  </span>
                </span>
                <span className="row-actions">
                  <button type="button" className="icon-btn" onClick={() => alegeFisier(c)} disabled={busy} title="Importă un fișier .ics" aria-label={`Importă .ics în ${c.nume}`}><Upload size={15} /></button>
                  <button type="button" className="icon-btn" onClick={() => setEditez({ id: c.id, nume: c.nume, culoare: c.culoare || CULORI[0] })} title="Redenumește sau schimbă culoarea" aria-label={`Editează ${c.nume}`}><Pencil size={15} /></button>
                  {deSters === c.id ? (
                    <>
                      <button type="button" className="btn btn-danger sala-btn" disabled={busy} onClick={() => sterge(c)}>Șterge tot</button>
                      <button type="button" className="icon-btn" onClick={() => setDeSters(null)} aria-label="Renunță"><X size={15} /></button>
                    </>
                  ) : (
                    <button type="button" className="icon-btn" onClick={() => setDeSters(c.id)} title="Șterge sala și evenimentele ei" aria-label={`Șterge ${c.nume}`}><Trash2 size={15} /></button>
                  )}
                </span>
              </>
            )}
          </div>
        ))}
        {!seIncarca && calendare.length === 0 && <p className="sali-nota sali-gol">Nicio sală încă. Adaugă câte un calendar pentru fiecare sală, apoi importă exportul .ics din calendarul vechi.</p>}

        <form className="sala-adauga" onSubmit={adauga}>
          <input type="color" className="sala-culoare-input" value={culoare} onChange={(e) => setCuloare(e.target.value.toUpperCase())} aria-label="Culoarea sălii noi" />
          <input className="sala-nume-input" value={nume} onChange={(e) => setNume(e.target.value)} placeholder="Sală nouă, ex. Sala Mare" aria-label="Numele sălii noi" />
          <button type="submit" className="btn btn-primary sala-btn" disabled={busy || !nume.trim()}><Plus size={14} /> Adaugă</button>
        </form>
      </div>
    </div>
  );
}

/* ---------- panoul din „Contul tau" ---------- */

export function ContCaldav({ user }) {
  const [cont, setCont] = useState(undefined);
  const [email, setEmail] = useState("");
  const [parola, setParola] = useState("");
  const [busy, setBusy] = useState(false);
  const [pasi, setPasi] = useState(false);

  useEffect(() => {
    let viu = true;
    (async () => {
      try {
        const [s, c] = await Promise.all([datePersonal.sesiuneCurenta(), date.contCaldav(user.id)]);
        if (!viu) return;
        setEmail((s?.user?.email || "").toLowerCase());
        setCont(c);
      } catch (e) {
        if (!viu) return;
        setCont(null);
        toaster.show(mesajEroare(e, "Nu am putut citi contul CalDAV."), { tone: "danger" });
      }
    })();
    return () => { viu = false; };
  }, [user.id]);

  const utilizator = cont?.utilizator || email;
  const adresaLunga = utilizator ? `${ADRESA_LUNGA}principals/${utilizator}/` : "";

  const genereaza = async () => {
    if (!email) { toaster.show("Nu știu emailul contului; reîncarcă pagina.", { tone: "danger" }); return; }
    setBusy(true);
    try {
      const p = await date.genereazaParolaCaldav({ userId: user.id, utilizator: email, email });
      setParola(p);
      setCont(await date.contCaldav(user.id));
      setPasi(true);
    } catch (e) {
      toaster.show(mesajEroare(e, "Nu am putut genera parola."), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const sterge = async () => {
    setBusy(true);
    try { await date.stergeContCaldav(user.id); setCont(null); setParola(""); toaster.show("Accesul CalDAV a fost oprit", { tone: "ok" }); }
    catch (e) { toaster.show(mesajEroare(e), { tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="cont-caldav">
      <span className="cont-optiune-eticheta">Calendarul sălilor pe telefon (CalDAV)</span>
      {cont === undefined ? (
        <span className="cont-optiune-nota">Se încarcă…</span>
      ) : (
        <>
          <span className="cont-optiune-nota">
            {cont
              ? `Acces activ, parolă generată ${fmtDateTime(new Date(cont.creat_la))}${cont.ultima_folosire ? `, folosită ultima dată ${fmtDateTime(new Date(cont.ultima_folosire))}` : ", încă nefolosită"}.`
              : "Fără acces încă. Generează o parolă și adaugă contul în aplicația Calendar."}
          </span>
          {parola && (
            <div className="parola-caldav-cutie">
              <span className="cont-optiune-nota">Parola, arătată o singură dată. Copiaz-o acum în telefon:</span>
              <div className="parola-caldav">
                <code>{parola}</code>
                <button type="button" className="icon-btn" onClick={() => copiaza(parola, "Parola")} aria-label="Copiază parola" title="Copiază parola"><Copy size={15} /></button>
              </div>
            </div>
          )}
          <div className="cont-caldav-actiuni">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={genereaza}>
              <KeyRound size={14} /> {cont ? "Generează altă parolă" : "Generează parola"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPasi((v) => !v)} aria-expanded={pasi}>Cum adaug contul</button>
            {cont && <button type="button" className="btn btn-ghost" disabled={busy} onClick={sterge}><Trash2 size={14} /> Oprește accesul</button>}
          </div>
          {pasi && (
            <div className="pasi-caldav">
              <div className="pasi-caldav-date">
                <span>Server</span>
                <span className="pasi-caldav-val"><code>{GAZDA}</code>
                  <button type="button" className="icon-btn" onClick={() => copiaza(GAZDA, "Adresa")} aria-label="Copiază adresa serverului"><Copy size={14} /></button>
                </span>
                <span>Adresă completă (rezervă)</span>
                <span className="pasi-caldav-val"><code>{adresaLunga}</code>
                  <button type="button" className="icon-btn" onClick={() => copiaza(adresaLunga, "Adresa completă")} aria-label="Copiază adresa completă"><Copy size={14} /></button>
                </span>
                <span>Utilizator</span><span className="pasi-caldav-val"><code>{utilizator}</code></span>
                <span>Parolă</span><span className="pasi-caldav-val">cea generată mai sus</span>
              </div>
              <ol>
                <li><b>iPhone:</b> Configurări → Aplicații → Calendar → Conturi → Adaugă cont → Altul → Adaugă cont CalDAV. La Server scrie doar <code>{GAZDA}</code>, apoi Utilizator, Parolă și Următorul (telefonul găsește singur restul). Dacă cere port sau SSL: 443, cu SSL.</li>
                <li><b>Mac:</b> Calendar → Configurări → Conturi → + → Alt cont CalDAV → tip „Automat”: utilizator, parolă și serverul <code>{GAZDA}</code>. Dacă nu merge automat, tip „Avansat” cu adresa completă de rezervă, port 443, cu SSL.</li>
                <li>În Calendar, bifează sălile pe care vrei să le vezi. Evenimentele adăugate din telefon ajung în PMS la următoarea sincronizare.</li>
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}
