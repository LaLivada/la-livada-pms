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
import React, { useState, useEffect, useCallback } from "react";
import { FileText, FilePlus, Ban } from "lucide-react";
import * as dateFise from "../data/fise.js";
import { audit } from "../lib/audit.js";
import { mesajEroare } from "../lib/errors.js";
import { fmtDateTime, fmtDateFull } from "../lib/format.js";
import { CAMPURI, ACT_TIPURI, valideazaFisa, SABLON_VERSIUNE } from "../lib/fisa.js";
import { Dialog, toaster } from "../ui/primitive.jsx";
import { uid } from "../lib/uid.js";

const eticheta = (cheie) => CAMPURI.find((c) => c.cheie === cheie)?.eticheta || cheie;
const tipAct = (c) => ACT_TIPURI.find((t) => t.cheie === c)?.eticheta || c || "—";

/* ---------------------------------------------------------------
   INDICATORUL DIN REZERVARE
----------------------------------------------------------------*/

export function SectiuneFisa({ res }) {
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
        <FormularFisa res={res}
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
          {/* Acelasi viewBox ca panza pe care s-a desenat (600x200). Alt
              raport ar deforma semnatura, iar o semnatura deformata nu mai e
              a nimanui. */}
          <svg viewBox="0 0 600 200" className="fisa-semnatura" role="img"
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

function FormularFisa({ res, onGata, onClose }) {
  const [date, setDate] = useState({});
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

      {CAMPURI.map((c) => (
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
      ))}

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
