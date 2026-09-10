/* FISA DE CAZARE, vazuta de la receptie.
 *
 * Trei lucruri: indicatorul din rezervare, fisa completata (doar citire) si
 * completarea in locul oaspetelui.
 *
 * NU EXISTA PANZA DE SEMNAT AICI, si e o alegere, nu o lipsa. Fisa scrisa de
 * la receptie merge pe drumul „fara semnatura, cu motiv" (hotarat
 * 7 septembrie 2026): cine POATE semna o face de pe linkul lui, unde
 * semnatura ii apartine fara discutie. Calea de aici e pentru cine nu poate
 * — un om fara smartphone, unul care a plecat in oras — iar acolo nu exista
 * semnatura de cules, ci un motiv de consemnat.
 *
 * FISA NU SE MODIFICA. Triggerul din baza respinge orice update in afara
 * anularii, deci nu exista buton de „editeaza": o greseala se anuleaza si se
 * scrie alta. Vezi docs/fisa-cazare.md 2.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { FileText, FilePlus, Ban, Search } from "lucide-react";
import * as dateFise from "../data/fise.js";
import { audit } from "../lib/audit.js";
import { mesajEroare } from "../lib/errors.js";
import { fmtDateTime, fmtDateFull } from "../lib/format.js";
import { CAMPURI, ACT_TIPURI, valideazaFisa, SABLON_VERSIUNE,
         precompletareDinOaspete, dataInParti, dataDinParti } from "../lib/fisa.js";
import { Dialog, toaster, usePaginare, Paginare } from "../ui/primitive.jsx";
import { uid } from "../lib/uid.js";
import { LATIME_PANZA, INALTIME_PANZA } from "../lib/semnatura.js";

const eticheta = (cheie) => CAMPURI.find((c) => c.cheie === cheie)?.eticheta || cheie;
const tipAct = (c) => ACT_TIPURI.find((t) => t.cheie === c)?.eticheta || c || "—";

/* ---------------------------------------------------------------
   INDICATORUL DIN REZERVARE
----------------------------------------------------------------*/

export function SectiuneFisa({ res, core }) {
  /* undefined = inca se incarca, null = nu exista. Distinctia conteaza:
     altfel s-ar vedea „fara fisa" o clipa la fiecare deschidere. */
  const [fisa, setFisa] = useState(undefined);
  const [formular, setFormular] = useState(false);
  const [vizualizare, setVizualizare] = useState(false);
  const [anulare, setAnulare] = useState(false);

  const incarca = useCallback(async () => {
    try {
      setFisa(await dateFise.fisaActiva(res.id));
    } catch (e) {
      console.error("citire fisa de cazare", e);
      setFisa(null);
    }
  }, [res.id]);

  useEffect(() => { incarca(); }, [incarca]);

  return (
    <div className="field">
      <label>Fișă de cazare</label>

      {fisa === undefined && <div className="ldv-mic">Se încarcă…</div>}

      {fisa === null && (
        <div className="ldv-mic" style={{ color: "var(--muted)" }}>
          Nu e completată. Oaspetele o poate completa din linkul lui, sau o
          completezi tu aici.
        </div>
      )}

      {fisa && (
        <div className="ldv-mic">
          Completată {fmtDateTime(fisa.semnat_la)}
          {fisa.completata_de ? ` · de ${fisa.completata_de}` : " · de oaspete"}
          {!fisa.semnatura_svg && (
            <div style={{ color: "var(--danger)", marginTop: 2 }}>
              Fără semnătură — {fisa.fara_semnatura_motiv}
            </div>
          )}
        </div>
      )}

      {fisa !== undefined && (
        <div className="quick-actions" style={{ marginTop: 8 }}>
          {fisa ? (
            <>
              <button className="btn btn-ghost" onClick={() => setVizualizare(true)}>
                <FileText size={14} color="var(--accent)" /> Vezi fișa
              </button>
              <button className="btn btn-ghost" onClick={() => setAnulare(true)}>
                <Ban size={14} color="var(--danger)" /> Anulează
              </button>
            </>
          ) : (
            <button className="btn btn-ghost" onClick={() => setFormular(true)}>
              <FilePlus size={14} color="var(--accent)" /> Completează
            </button>
          )}
        </div>
      )}

      {formular && (
        <FormularFisa res={res} core={core}
          onGata={() => { setFormular(false); incarca(); }}
          onClose={() => setFormular(false)} />
      )}
      {vizualizare && fisa && (
        <VizualizareFisa fisa={fisa} onClose={() => setVizualizare(false)} />
      )}
      {anulare && fisa && (
        <AnuleazaFisa fisa={fisa}
          onGata={() => { setAnulare(false); incarca(); }}
          onClose={() => setAnulare(false)} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   TOATE FISELE — ecranul din Clienti
----------------------------------------------------------------*/

/* DE CE EXISTA ECRANUL ASTA. Pana pe 9 septembrie 2026 o fisa se putea
 * atinge doar din interiorul rezervarii ei. Mergea, cat timp stiai care
 * rezervare — dar cand baza refuza stergerea unei rezervari fiindca are fisa
 * semnata, omul trebuie sa gaseasca fisa ca s-o anuleze, si n-avea de unde
 * s-o ia. Aici se vad toate, se cauta dupa nume si se anuleaza pe loc.
 *
 * Anulatele raman in lista, marcate. Un document legal care dispare din
 * liste fara urma e mai rau decat unul gresit. */
export function FiseView({ core, reservations }) {
  const [fise, setFise] = useState(null);   // null = se incarca
  const [q, setQ] = useState("");
  const [eroare, setEroare] = useState("");
  const [deschisa, setDeschisa] = useState(null);   // randul intreg, cu semnatura
  const [anulare, setAnulare] = useState(null);

  const incarca = useCallback(async () => {
    try { setFise(await dateFise.toateFisele()); setEroare(""); }
    catch (e) { console.error("citire fise", e); setFise([]); setEroare(mesajEroare(e)); }
  }, []);
  useEffect(() => { incarca(); }, [incarca]);

  /* Camera si perioada nu stau in fisa, ci in rezervarea ei — le luam din
     starea deja incarcata a aplicatiei, nu cu inca o cerere. O fisa a carei
     rezervare lipseste din felia curenta ramane in lista, fara ele: mai bine
     un rand incomplet decat un document care pare ca nu exista. */
  const rezDupaId = new Map((reservations || []).map((r) => [r.id, r]));
  const numeCamera = (id) => core.rooms.find((c) => c.id === id)?.name || null;

  const filtrate = (fise || []).filter((f) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    const rez = rezDupaId.get(f.reservation_id);
    return `${f.nume} ${f.prenume}`.toLowerCase().includes(t)
      || (numeCamera(rez?.roomId) || "").toLowerCase().includes(t);
  });
  const paginare = usePaginare(filtrate);

  const deschide = async (f) => {
    try { setDeschisa(await dateFise.fisaIntreaga(f.id)); }
    catch (e) { toaster.show(mesajEroare(e, "Fișa nu a putut fi deschisă"), { tone: "danger" }); }
  };

  if (fise === null) return <div className="ldv-mic" style={{ padding: 18 }}>Se încarcă…</div>;

  return (
    <div>
      <div className="toolbar">
        <div className="search-box">
          <Search size={15} color="var(--text-muted)" />
          <input placeholder="Caută după nume sau cameră" value={q}
            onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="badge-count">{filtrate.length} fișe</span>
      </div>

      {eroare && <div className="error-text" role="alert">{eroare}</div>}

      <div className="panel">
        {filtrate.length === 0 ? (
          <div className="empty-state">
            <FileText size={26} /><h4>Nicio fișă</h4>
            <p>Fișele completate de oaspeți sau de recepție apar aici.</p>
          </div>
        ) : paginare.feliate.map((f) => {
          const rez = rezDupaId.get(f.reservation_id);
          const camera = numeCamera(rez?.roomId);
          return (
            <div className="list-row" key={f.id}>
              <div style={{ minWidth: 0 }}>
                <div className="primary">
                  {f.nume} {f.prenume}
                  {f.anulata_la && <span className="badge-count" style={{ marginLeft: 8 }}>anulată</span>}
                </div>
                <div className="secondary">
                  {[camera, rez && `${fmtDateFull(rez.checkin)} → ${fmtDateFull(rez.checkout)}`]
                    .filter(Boolean).join(" · ") || "rezervare care nu mai e pe ecran"}
                </div>
                <div className="secondary" style={{ marginTop: 3 }}>
                  Completată {fmtDateTime(f.semnat_la)}
                  {f.completata_de ? ` · de ${f.completata_de}` : " · de oaspete"}
                </div>
                {!f.are_semnatura && (
                  <div className="secondary" style={{ color: "var(--danger)" }}>
                    Fără semnătură — {f.fara_semnatura_motiv}
                  </div>
                )}
                {f.anulata_la && (
                  <div className="secondary" style={{ color: "var(--danger)" }}>
                    Anulată {fmtDateTime(f.anulata_la)}
                    {f.anulata_de ? ` de ${f.anulata_de}` : ""}
                    {f.anulata_motiv ? ` — ${f.anulata_motiv}` : ""}
                  </div>
                )}
              </div>
              <div className="quick-actions" style={{ flexShrink: 0 }}>
                <button className="btn btn-ghost" onClick={() => deschide(f)}>
                  <FileText size={14} color="var(--accent)" /> Vezi fișa
                </button>
                {/* Anulata o data, fisa nu se mai atinge — triggerul din baza
                    refuza si a doua anulare, deci butonul dispare, nu ramane
                    sa dea eroare. */}
                {!f.anulata_la && (
                  <button className="btn btn-ghost" onClick={() => setAnulare(f)}>
                    <Ban size={14} color="var(--danger)" /> Anulează
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Paginare stare={paginare} eticheta={paginare.totalItems === 1 ? "fișă" : "fișe"} />

      {deschisa && <VizualizareFisa fisa={deschisa} onClose={() => setDeschisa(null)} />}
      {anulare && (
        <AnuleazaFisa fisa={anulare}
          onGata={() => { setAnulare(null); incarca(); }}
          onClose={() => setAnulare(null)} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   FISA COMPLETATA, DOAR CITIRE
----------------------------------------------------------------*/

function VizualizareFisa({ fisa, onClose }) {
  return (
    <Dialog title="Fișa de cazare" onClose={onClose}>
      <dl className="fisa-vedere">
        <Rand eticheta="Nume și prenume" valoare={`${fisa.nume} ${fisa.prenume}`} />
        <Rand eticheta={eticheta("dataNasterii")} valoare={fmtDateFull(fisa.data_nasterii)} />
        <Rand eticheta={eticheta("loculNasterii")} valoare={fisa.locul_nasterii} />
        <Rand eticheta={eticheta("nationalitate")} valoare={fisa.nationalitate} />
        <Rand eticheta={eticheta("tara")} valoare={fisa.tara} />
        <Rand eticheta={eticheta("adresa")} valoare={fisa.adresa} />
        <Rand eticheta={eticheta("localitate")} valoare={fisa.localitate} />
        <Rand eticheta={eticheta("scopul")} valoare={fisa.scopul} />
        <Rand eticheta="Act de identitate"
          valoare={`${tipAct(fisa.act_tip)} ${fisa.act_seria || ""} ${fisa.act_numarul}`.trim()} />
        <Rand eticheta="Completată" valoare={fmtDateTime(fisa.semnat_la)} />
        {fisa.completata_de && <Rand eticheta="Tastată de" valoare={fisa.completata_de} />}
      </dl>

      {fisa.semnatura_svg ? (
        <>
          <div className="ldv-mic" style={{ marginTop: 12 }}>Semnătura oaspetelui</div>
          {/* Acelasi viewBox ca panza pe care s-a desenat. Alt raport ar
              deforma semnatura, iar o semnatura deformata nu mai e a
              nimanui — de aceea numerele se IAU din lib/semnatura.js, nu se
              rescriu aici: scrise de mana, au ramas in urma cand panza a
              trecut de la 3:1 la 2:1, si nimic n-ar fi semnalat-o. */}
          <svg viewBox={`0 0 ${LATIME_PANZA} ${INALTIME_PANZA}`}
            className="fisa-semnatura" role="img"
            aria-label="Semnătura oaspetelui">
            <path d={fisa.semnatura_svg} fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </>
      ) : (
        <div className="error-text" style={{ marginTop: 12 }}>
          Fără semnătură — {fisa.fara_semnatura_motiv}
        </div>
      )}
    </Dialog>
  );
}

const Rand = ({ eticheta: e, valoare }) => (
  <div className="rs"><dt className="rs-k">{e}</dt><dd className="rs-v">{valoare || "—"}</dd></div>
);

/* ---------------------------------------------------------------
   COMPLETAREA IN LOCUL OASPETELUI
----------------------------------------------------------------*/

/* DATA NASTERII, IN TREI CASETE — nu `<input type="date">`.
 *
 * Perechea ei sta in guest/Fisa.jsx, si e o duplicare ASUMATA: cele doua
 * aplicatii au foi de stil diferite, iar pagina oaspetelui nu importa nimic
 * din `ui/` sau `features/` — se deschide pe date mobile, in fata unei usi,
 * si fiecare kilobyte in plus se plateste acolo.
 *
 * Ce conteaza e impartit, si tocmai de aceea: compunerea in „AAAA-LL-ZZ" si
 * validarea stau in lib/fisa.js, deci aceeasi zi tastata aici si acolo da
 * acelasi rand in baza. Ce se dubleaza e doar cablajul de DOM, iar o
 * divergenta acolo se vede din prima privire.
 */
function CaseteData({ valoare, eroare, onSchimbare }) {
  /* Partile stau in stare LOCALA, iar in sus pleaca sirul compus: cine
     tasteaza prima cifra din zi ar vedea altfel caseta golindu-se, fiindca
     din „1" nu se poate compune nicio data. Se seamana o singura data — data
     nasterii nu se precompleteaza niciodata, e camp sensibil. */
  const [parti, setParti] = useState(() => dataInParti(valoare));
  const refZi = useRef(null);
  const refLuna = useRef(null);
  const refAn = useRef(null);

  const pune = (care, brut, maxim, urmator) => {
    const v = String(brut).replace(/\D/g, "").slice(0, maxim);
    const noi = { ...parti, [care]: v };
    setParti(noi);
    onSchimbare(dataDinParti(noi));
    if (v.length === maxim && urmator?.current) urmator.current.focus();
  };

  const inapoi = (e, precedent) => {
    if (e.key === "Backspace" && e.currentTarget.value === "" && precedent?.current) {
      precedent.current.focus();
    }
  };

  const casete = [
    { cheie: "zi",   eticheta: "Ziua", loc: "ZZ",   maxim: 2, ref: refZi,   urmator: refLuna, precedent: null },
    { cheie: "luna", eticheta: "Luna", loc: "LL",   maxim: 2, ref: refLuna, urmator: refAn,   precedent: refZi },
    { cheie: "an",   eticheta: "Anul", loc: "AAAA", maxim: 4, ref: refAn,   urmator: null,    precedent: refLuna },
  ];

  return (
    <div className="field" role="group" aria-labelledby="fisa-nastere-eticheta">
      <label id="fisa-nastere-eticheta">Data nașterii</label>
      <div className="fisa-data">
        {casete.map((c) => (
          <input key={c.cheie} ref={c.ref}
            className={`fisa-data-${c.cheie}`}
            inputMode="numeric" placeholder={c.loc} aria-label={c.eticheta}
            value={parti[c.cheie]}
            onKeyDown={(e) => inapoi(e, c.precedent)}
            onChange={(e) => pune(c.cheie, e.target.value, c.maxim, c.urmator)} />
        ))}
      </div>
      {eroare && <div className="error-text">{eroare}</div>}
    </div>
  );
}

function FormularFisa({ res, core, onGata, onClose }) {
  /* Initializator LENES, nu `useState(precompletare(...))`: scris asa,
     precompletarea s-ar reface la fiecare tastare in formular. Ar fi fost
     aruncata oricum, dar cauta oaspetele prin toata lista de fiecare data.

     Si e doar punct de PORNIRE: de aici incolo starea e a formularului, deci
     ce corecteaza receptionerul ramane corectat. */
  const oaspete = core?.guests?.find((g) => g.id === res.guestId) || null;
  const [date, setDate] = useState(() => precompletareDinOaspete(oaspete, res));
  const [motiv, setMotiv] = useState("");
  const [erori, setErori] = useState({});
  const [lucrez, setLucrez] = useState(false);
  const [eroare, setEroare] = useState("");

  const pune = (cheie, v) => setDate((d) => ({ ...d, [cheie]: v }));

  async function salveaza() {
    const v = valideazaFisa(date);
    const toate = { ...v.erori };
    /* Motivul e cerut AICI, nu lasat pe seama constrangerii din baza:
       receptionerul n-are de ce sa afle de la o eroare de Postgres ce
       trebuia sa scrie. */
    if (!motiv.trim()) toate.motiv = "Scrie de ce nu semnează oaspetele.";
    setErori(toate);
    if (Object.keys(toate).length > 0) return;

    setLucrez(true);
    try {
      await dateFise.scrieFisa({
        id: `fc-${uid()}`,
        reservation_id: res.id,
        ordine: 1,
        guest_id: res.guestId || null,
        nume: date.nume, prenume: date.prenume,
        data_nasterii: date.dataNasterii,
        locul_nasterii: date.loculNasterii,
        nationalitate: date.nationalitate,
        tara: date.tara,
        adresa: date.adresa,
        localitate: date.localitate,
        scopul: date.scopul,
        act_tip: date.actTip,
        act_seria: date.actSeria || null,
        act_numarul: date.actNumarul,
        completata_de: audit.user?.name || "recepție",
        fara_semnatura_motiv: motiv.trim(),
        sablon_versiune: SABLON_VERSIUNE,
      });
      await audit.push("Fișă de cazare completată", `Rezervarea ${res.id}`);
      toaster.show("Fișa de cazare a fost salvată.", { tone: "ok" });
      onGata();
    } catch (e) {
      setEroare(mesajEroare(e));
    } finally {
      setLucrez(false);
    }
  }

  return (
    <Dialog title="Completează fișa de cazare" onClose={onClose}>
      <p className="ldv-mic" style={{ marginBottom: 12 }}>
        Pentru oaspeții care nu pot completa singuri. Cine poate o face din
        linkul lui, unde semnează el.
      </p>
      {/* Spus pe fata, fiindca un camp deja scris nu se mai citeste: numele si
          adresa vin din rezervare si pot fi vechi, iar actul nu se
          precompleteaza niciodata — se citeste de pe documentul din mana. */}
      <p className="ldv-mic" style={{ marginBottom: 12, color: "var(--muted)" }}>
        Datele oaspetelui sunt luate din rezervare. Verifică-le pe actul de
        identitate și corectează unde e cazul.
      </p>

      {CAMPURI.map((c) => (c.tip === "date" ? (
        <CaseteData key={c.cheie} valoare={date[c.cheie]} eroare={erori[c.cheie]}
          onSchimbare={(v) => pune(c.cheie, v)} />
      ) : (
        <div className="field" key={c.cheie}>
          <label>{c.eticheta}{!c.obligatoriu && " (dacă are)"}</label>
          {c.tip === "alegere" ? (
            <select value={date[c.cheie] || ""} onChange={(e) => pune(c.cheie, e.target.value)}>
              <option value="">Alege…</option>
              {ACT_TIPURI.map((t) => <option key={t.cheie} value={t.cheie}>{t.eticheta}</option>)}
            </select>
          ) : (
            <input type={c.tip === "date" ? "date" : "text"}
              value={date[c.cheie] || ""} onChange={(e) => pune(c.cheie, e.target.value)} />
          )}
          {erori[c.cheie] && <div className="error-text">{erori[c.cheie]}</div>}
        </div>
      )))}

      <div className="field">
        <label>De ce nu semnează oaspetele</label>
        <input value={motiv} onChange={(e) => setMotiv(e.target.value)}
          placeholder="ex. nu are telefon" />
        {erori.motiv && <div className="error-text">{erori.motiv}</div>}
      </div>

      {eroare && <div className="error-text" role="alert">{eroare}</div>}

      <button className="btn btn-primary" disabled={lucrez} onClick={salveaza}>
        {lucrez ? "Salvez…" : "Salvează fișa"}
      </button>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   ANULAREA
----------------------------------------------------------------*/

function AnuleazaFisa({ fisa, onGata, onClose }) {
  const [motiv, setMotiv] = useState("");
  const [lucrez, setLucrez] = useState(false);
  const [eroare, setEroare] = useState("");

  async function anuleaza() {
    if (!motiv.trim()) { setEroare("Scrie de ce anulezi fișa."); return; }
    setLucrez(true);
    try {
      await dateFise.anuleaza(fisa.id, audit.user?.name || "recepție", motiv.trim());
      await audit.push("Fișă de cazare anulată", motiv.trim());
      toaster.show("Fișa a fost anulată.", { tone: "ok" });
      onGata();
    } catch (e) {
      setEroare(mesajEroare(e));
    } finally {
      setLucrez(false);
    }
  }

  return (
    <Dialog title="Anulează fișa de cazare" onClose={onClose}>
      <p className="ldv-mic">
        Fișa nu se șterge — rămâne, marcată anulată, cu motivul de mai jos.
      </p>
      {/* Avertismentul nu e podoaba: dupa anulare linkul oaspetelui redevine
          deschis pentru scriere, fiindca cheia lui e „nu exista deja o fisa
          activa". Corect cand vrem sa fie refacuta, dar receptionerul trebuie
          sa stie ca a redeschis ceva. */}
      <div className="error-text" style={{ marginTop: 8 }}>
        După anulare, oaspetele poate completa din nou din linkul lui.
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label>Motivul anulării</label>
        <input value={motiv} onChange={(e) => setMotiv(e.target.value)}
          placeholder="ex. serie de buletin greșită" />
      </div>

      {eroare && <div className="error-text" role="alert">{eroare}</div>}

      <button className="btn btn-primary" disabled={lucrez} onClick={anuleaza}>
        {lucrez ? "Anulez…" : "Anulează fișa"}
      </button>
    </Dialog>
  );
}
