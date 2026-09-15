/* EVENIMENTE — salile si CalDAV (etapa 1, 15 septembrie 2026; ecranul cu
 * doua taburi in aceeasi zi): „Calendar pe ani" — evenimentele tuturor
 * salilor, an cu an, pe 12 luni mici — si „Serverul & sali" — calendarele
 * salilor (nume, culoare, import .ics) si adresa serverului. Tot aici e
 * panoul din „Contul tau" de unde fiecare user isi ia parola CalDAV pentru
 * telefon. Serverul e functia supabase/functions/caldav; datele in
 * data/caldav.js; aritmetica pe zile in lib/evenimente-an.js.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Upload, Copy, KeyRound, Check, Pencil, X, CalendarDays, Server, ChevronLeft, ChevronRight } from "lucide-react";
import { toaster } from "../ui/primitive.jsx";
import { mesajEroare } from "../lib/errors.js";
import { fmtDateTime } from "../lib/format.js";
import { dataLocala, partiLocale } from "../lib/timp.js";
import { ZILE_SAPT_SCURT, cheieZi, descriereMoment, grupeazaPeZile, luniAnului, numarPeLuni, titluZi, zileleEvenimentului } from "../lib/evenimente-an.js";
import * as date from "../data/caldav.js";
import * as datePersonal from "../data/personal.js";

/* Adresa completa a serverului, direct pe supabase.co: pe iPhone se scrie
   adresa principalului in campul Server. Numele scurt pms.lalivada.ro nu
   merge pe iOS: dupa redirectul /.well-known/caldav catre alt host, iOS
   ramane pe gazda initiala, iar un proxy prin Vercel e blocat de mitigarea
   de sistem (15 septembrie 2026, vezi docs/caldav.md). Cu "@" ca atare, nu
   %40: e permis in cale, iar serverul decodeaza oricum segmentele. */
const ADRESA_SERVER = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/caldav/`;
const adresaPrincipal = (utilizator) => `${ADRESA_SERVER}principals/${utilizator}/`;
const CULORI = ["#2B5C8A", "#C2410C", "#0F766E", "#7C3AED", "#B45309", "#BE123C", "#4D7C0F", "#1D4ED8"];
/* Calendarul gri in care functia edge muta evenimentele anulate. */
const SLUG_ANULATE = "anulate";

const plural = (n) => `${n} ${n === 1 ? "eveniment" : "evenimente"}`;

async function copiaza(text, ce) {
  try { await navigator.clipboard.writeText(text); toaster.show(`${ce} copiat`, { tone: "ok" }); }
  catch { toaster.show("Nu am putut copia; selectează textul și copiază-l manual.", { tone: "danger" }); }
}

/* Bulina colorata a unei sali, ca SVG, nu ca stil inline: culoarea e a
   salii, iar plafonul din stiluri-inline.test.js nu creste. */
function Bulina({ culoare, marime = 14, className = "" }) {
  return (
    <svg className={className} width={marime} height={marime} viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="7" fill={culoare || CULORI[0]} />
    </svg>
  );
}

/* ---------- ecranul adminului: doua taburi ---------- */

export function EvenimenteView() {
  const [tab, setTab] = useState("calendar");
  return (
    <div className="evenimente">
      <div className="sub-tabs" role="tablist" aria-label="Secțiuni">
        <button type="button" role="tab" aria-selected={tab === "calendar"} className={tab === "calendar" ? "on" : ""} onClick={() => setTab("calendar")}>
          <CalendarDays size={14} /> Calendar pe ani
        </button>
        <button type="button" role="tab" aria-selected={tab === "server"} className={tab === "server" ? "on" : ""} onClick={() => setTab("server")}>
          <Server size={14} /> Serverul &amp; săli
        </button>
      </div>
      {tab === "calendar" ? <CalendarAnual /> : <ServerSiSali />}
    </div>
  );
}

/* ---------- tabul „Calendar pe ani" ---------- */

/* 12 luni mici, cu cate o bulina pe zi pentru fiecare sala care are ceva
   atunci. Ziua apasata isi desface lista chiar sub luna ei (pe telefon
   lunile stau una sub alta, iar o lista la capatul paginii ar fi departe
   de ziua apasata). Legenda ascunde/arata salile; anul se schimba cu
   sagetile. Seriile recurente apar doar la prima lor data (functia nu
   expandeaza RRULE), marcate „se repeta". */
function CalendarAnual() {
  const anAzi = partiLocale(Date.now())?.an ?? new Date().getFullYear();
  const azi = dataLocala(Date.now());
  const [an, setAn] = useState(anAzi);
  const [calendare, setCalendare] = useState([]);
  const [evenimente, setEvenimente] = useState([]);
  const [seIncarca, setSeIncarca] = useState(true);
  const [ascunse, setAscunse] = useState(() => new Set());
  const [ziAleasa, setZiAleasa] = useState(null);
  const filtruPornit = useRef(false);

  useEffect(() => {
    let viu = true;
    date.listeazaCalendare()
      .then((c) => {
        if (!viu) return;
        setCalendare(c);
        /* „Anulate" porneste ascuns: anul arata implicit doar ce tine, iar
           gri-ul e la un clic distanta, in legenda. */
        if (!filtruPornit.current) {
          filtruPornit.current = true;
          const gri = c.find((x) => x.slug === SLUG_ANULATE);
          if (gri) setAscunse(new Set([gri.id]));
        }
      })
      .catch((e) => { if (viu) toaster.show(mesajEroare(e, "Nu am putut citi sălile."), { tone: "danger" }); });
    return () => { viu = false; };
  }, []);

  useEffect(() => {
    let viu = true;
    setSeIncarca(true);
    date.listeazaEvenimente(an)
      .then((ev) => { if (viu) setEvenimente(ev); })
      .catch((e) => { if (viu) toaster.show(mesajEroare(e, "Nu am putut citi evenimentele."), { tone: "danger" }); })
      .finally(() => { if (viu) setSeIncarca(false); });
    return () => { viu = false; };
  }, [an]);

  const salaDupaId = useMemo(() => new Map(calendare.map((c) => [c.id, c])), [calendare]);
  const ordineSala = useMemo(() => {
    const m = new Map(calendare.map((c, i) => [c.id, i]));
    return (id) => m.get(id) ?? calendare.length;
  }, [calendare]);
  /* Evenimentele care ating anul, indiferent de filtre: numerele din legenda. */
  const inAn = useMemo(() => {
    const prefix = `${an}-`;
    return evenimente.filter((e) => zileleEvenimentului(e).some((z) => z.startsWith(prefix)));
  }, [evenimente, an]);
  const numarPeSala = useMemo(() => {
    const n = {};
    for (const e of inAn) n[e.calendar_id] = (n[e.calendar_id] || 0) + 1;
    return n;
  }, [inAn]);
  const vizibile = useMemo(() => inAn.filter((e) => !ascunse.has(e.calendar_id)), [inAn, ascunse]);
  const peZile = useMemo(() => grupeazaPeZile(vizibile, an, ordineSala), [vizibile, an, ordineSala]);
  const peLuni = useMemo(() => numarPeLuni(peZile), [peZile]);
  const luni = useMemo(() => luniAnului(an), [an]);

  const schimbaAn = (nou) => { setAn(nou); setZiAleasa(null); };
  const comuta = (id) => setAscunse((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="calendar-an">
      <div className="an-cap">
        <div className="an-nav">
          <button type="button" className="icon-btn" onClick={() => schimbaAn(an - 1)} aria-label="Anul anterior"><ChevronLeft size={16} /></button>
          <strong>{an}</strong>
          <button type="button" className="icon-btn" onClick={() => schimbaAn(an + 1)} aria-label="Anul următor"><ChevronRight size={16} /></button>
          {an !== anAzi && <button type="button" className="btn btn-ghost sala-btn" onClick={() => schimbaAn(anAzi)}>Anul curent</button>}
        </div>
        <span className="sali-nota">{seIncarca ? "Se încarcă…" : `${plural(vizibile.length)} în ${an}`}</span>
        <div className="an-legenda" role="group" aria-label="Săli: apasă ca să ascunzi sau să arăți">
          {calendare.map((c) => (
            <button type="button" key={c.id} className={ascunse.has(c.id) ? "ascuns" : ""} aria-pressed={!ascunse.has(c.id)}
              onClick={() => comuta(c.id)} title={ascunse.has(c.id) ? `Arată ${c.nume}` : `Ascunde ${c.nume}`}>
              <Bulina culoare={c.culoare} marime={10} /> {c.nume} <span className="an-nr">{numarPeSala[c.id] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="an-grila">
        {luni.map((l, i) => {
          const prefixLuna = `${an}-${String(l.luna).padStart(2, "0")}-`;
          const listaZi = ziAleasa && ziAleasa.startsWith(prefixLuna) ? peZile.get(ziAleasa) : null;
          return (
            <section className="panel luna" key={l.luna} aria-label={`${l.nume} ${an}`}>
              <div className="luna-cap">
                <h4>{l.nume}</h4>
                {peLuni[i] > 0 && <span className="sali-nota">{plural(peLuni[i])}</span>}
              </div>
              <div className="luna-zile">
                {ZILE_SAPT_SCURT.map((z, k) => <span className="zs" key={k} aria-hidden="true">{z}</span>)}
                {Array.from({ length: l.decalaj }, (_, k) => <span className="zi gol" key={`gol-${k}`} />)}
                {Array.from({ length: l.zile }, (_, k) => {
                  const zi = k + 1;
                  const cheie = cheieZi(an, l.luna, zi);
                  const lista = peZile.get(cheie);
                  const clase = ["zi", cheie === azi ? "azi" : "", lista ? "cu" : "", cheie === ziAleasa ? "on" : ""].filter(Boolean).join(" ");
                  if (!lista) return <span className={clase} key={cheie}>{zi}</span>;
                  const sali = [...new Set(lista.map((e) => e.calendar_id))].map((id) => salaDupaId.get(id)).filter(Boolean);
                  return (
                    <button type="button" className={clase} key={cheie} aria-pressed={cheie === ziAleasa}
                      aria-label={`${zi} ${l.nume}: ${plural(lista.length)}`}
                      onClick={() => setZiAleasa(cheie === ziAleasa ? null : cheie)}>
                      <span>{zi}</span>
                      <span className="zi-pct">{sali.map((c) => <Bulina key={c.id} culoare={c.culoare} marime={5} />)}</span>
                    </button>
                  );
                })}
              </div>
              {listaZi && (
                <div className="zi-lista">
                  <div className="zi-lista-cap">
                    <strong>{titluZi(ziAleasa)}</strong>
                    <button type="button" className="icon-btn" onClick={() => setZiAleasa(null)} aria-label="Închide lista zilei"><X size={14} /></button>
                  </div>
                  <ul>
                    {listaZi.map((ev) => {
                      const c = salaDupaId.get(ev.calendar_id);
                      return (
                        <li key={ev.id}>
                          <Bulina culoare={c?.culoare} marime={10} />
                          <span className="zi-ev">
                            <span className="zi-ev-titlu">{ev.rezumat || "(fără titlu)"}</span>
                            <span className="sali-nota">{c?.nume || "sală ștearsă"} · {descriereMoment(ev)}{ev.recurent ? " · se repetă" : ""}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- tabul „Serverul & sali" ---------- */

function ServerSiSali() {
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
                <Bulina className="sala-culoare" culoare={c.culoare} />
                <span className="sala-info">
                  <span className="sala-nume">{c.nume}</span>
                  <span className="sala-meta">
                    {plural(numar[c.id] || 0)} · <span className="mono">{c.slug}</span>
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
  const adresa = utilizator ? adresaPrincipal(utilizator) : "";
  const urlAdresa = adresa ? new URL(adresa) : null;

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
                <span className="pasi-caldav-val"><code>{adresa}</code>
                  <button type="button" className="icon-btn" onClick={() => copiaza(adresa, "Adresa")} aria-label="Copiază adresa serverului"><Copy size={14} /></button>
                </span>
                <span>Utilizator</span><span className="pasi-caldav-val"><code>{utilizator}</code></span>
                <span>Parolă</span><span className="pasi-caldav-val">cea generată mai sus</span>
              </div>
              <ol>
                <li><b>iPhone:</b> Configurări → Aplicații → Calendar → Conturi → Adaugă cont → Altul → Adaugă cont CalDAV. La Server lipește adresa completă de mai sus (cu tot cu https:// și cale), apoi Utilizator, Parolă și Următorul. Dacă cere port sau SSL: 443, cu SSL.</li>
                <li><b>Mac:</b> Calendar → Configurări → Conturi → + → Alt cont CalDAV → tip „Avansat”: adresa serverului <code>{urlAdresa ? urlAdresa.host : ""}</code>, calea <code>{urlAdresa ? urlAdresa.pathname : ""}</code>, port 443, cu SSL.</li>
                <li>În Calendar, bifează sălile pe care vrei să le vezi. Evenimentele adăugate din telefon ajung în PMS la următoarea sincronizare.</li>
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}
