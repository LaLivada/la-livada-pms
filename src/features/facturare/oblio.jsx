/* FACTURARE / OBLIO — setarile legaturii cu oblio.eu (CIF, seria, pornit /
 * oprit, e-Factura) si verificarea ei. Secretul contului NU trece pe aici:
 * sta doar in secretele functiei edge `oblio-facturare`; de aici se salveaza
 * doar ce nu e secret, in app_state `pms:oblio:v1` (scris doar de admin —
 * politica RLS). Vezi docs/oblio.md.
 */

import { useState, useEffect } from "react";
import { Check, PlugZap } from "lucide-react";
import * as dateOblio from "../../data/oblio.js";
import { mesajEroare } from "../../lib/errors.js";
import { toaster } from "../../ui/primitive.jsx";
import { audit } from "../../lib/audit.js";

export function OblioView({ core }) {
  const [salvat, setSalvat] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  /* null | { ruleaza: true } | raspunsul functiei ({ok, ...} / {ok:false, error}) */
  const [verificare, setVerificare] = useState(null);
  const cuiEmitent = (core?.invoiceIssuer?.cui || "").trim().toUpperCase();

  useEffect(() => {
    let viu = true;
    dateOblio.setariOblio().then((s) => {
      if (!viu) return;
      /* CIF-ul e acelasi cu al emitentului de pe factura; il propunem cand
         setarile Oblio n-au inca unul. */
      setSalvat(s);
      setDraft({ ...s, cif: s.cif || cuiEmitent });
    });
    return () => { viu = false; };
  }, [cuiEmitent]);

  if (!draft) return <div className="note">Se încarcă…</div>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(salvat);
  const set = (k) => (e) => setDraft({ ...draft, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const save = async () => {
    if (draft.activ && (!draft.cif.trim() || !draft.serie.trim())) {
      toaster.show("Ca să pornești Oblio, completează CIF-ul și seria.", { tone: "danger" });
      return;
    }
    setSaving(true);
    try {
      await dateOblio.salveazaSetariOblio(draft);
      const s = await dateOblio.setariOblio();
      setSalvat(s);
      setDraft(s);
      await audit.push(s.activ ? "Facturare prin Oblio pornită" : "Setări Oblio salvate", `${s.cif} · seria ${s.serie || "—"}`);
      toaster.show("Setările Oblio au fost salvate", { tone: "ok" });
    } catch (e) {
      toaster.show(mesajEroare(e, "Nu am putut salva setările Oblio"), { tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const verifica = async () => {
    setVerificare({ ruleaza: true });
    setVerificare(await dateOblio.cheamaOblio("verifica", { cif: draft.cif.trim(), serie: draft.serie.trim() }));
  };

  const serie = draft.serie.trim();
  return (
    <div className="panel oblio-panel">
      <div className="section-head oblio-head">Facturare prin Oblio</div>
      <p className="note">
        Facturile se emit în contul Oblio al firmei (serie, număr, PDF, e-Factura), iar PMS-ul păstrează o copie.
        Tokenul contului nu se introduce aici: adminul îl pune în Supabase → Edge Functions → Secrets
        (<code>OBLIO_CLIENT_ID</code>, <code>OBLIO_CLIENT_SECRET</code>).
      </p>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">CIF (ca în Oblio)</span><input value={draft.cif} onChange={set("cif")} placeholder="RO12345678" /></label>
        <label className="field"><span className="fl">Seria facturilor (din Oblio)</span><input value={draft.serie} onChange={set("serie")} placeholder="LL" /></label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Punct de lucru</span><input value={draft.punctLucru} onChange={set("punctLucru")} placeholder="Sediu" /></label>
        <label className="field oblio-check">
          <input type="checkbox" checked={!!draft.trimiteEFactura} onChange={set("trimiteEFactura")} />
          Trimite în SPV (e-Factura) imediat după emitere
        </label>
      </div>
      <label className="field oblio-check oblio-activ">
        <input type="checkbox" checked={!!draft.activ} onChange={set("activ")} />
        Emite facturile prin Oblio
      </label>
      <div className="oblio-actiuni">
        <button className="btn btn-primary btn-lat" onClick={save} disabled={!dirty || saving}>
          <Check size={15} /> {saving ? "Se salvează…" : "Salvează"}
        </button>
        <button className="btn btn-ghost btn-lat" onClick={verifica} disabled={!!verificare?.ruleaza || !draft.cif.trim()}>
          <PlugZap size={15} /> {verificare?.ruleaza ? "Se verifică…" : "Verifică legătura"}
        </button>
        {dirty && <span className="oblio-nesalvat">Modificări nesalvate</span>}
      </div>
      {verificare && !verificare.ruleaza && (
        verificare.ok ? (
          <div className="note oblio-rezultat" data-ok="1">
            <div><strong>{verificare.firma}</strong> — legătura merge.</div>
            <div>
              Serii de facturi în Oblio: {verificare.serii.map((s) => s.nume).join(", ") || "niciuna"}
              {serie && !verificare.seriaOk && <> — <strong>seria „{serie}” nu există</strong></>}
            </div>
            <div>Cote de TVA: {verificare.cote.map((c) => `${c.name} ${c.percentage}%`).join(", ") || "niciuna"}</div>
          </div>
        ) : (
          <div className="note oblio-rezultat" data-ok="0">{verificare.error}</div>
        )
      )}
    </div>
  );
}
