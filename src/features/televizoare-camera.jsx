/* Tabul „Televizor" din fișa camerei (26 septembrie 2026).
 *
 * Televizoarele unei camere se pun din camera ei, ca yala: ce televizor e al
 * camerei, ce scrie acum pe ecranul lui, și legarea sau scoaterea unuia.
 * Setările generale — mesajul, furnizorul, aparatele din cont, istoricul —
 * stau în Automatizare → Televizoare (features/televizoare.jsx).
 *
 * Legătura NU se face automat după nume, din același motiv ca la yale: un
 * televizor pus pe camera greșită scrie numele unui oaspete pe ecranul
 * altuia. De aceea alegerea spune la vedere unde e acum fiecare aparat.
 * Doar adminul schimbă legături (RLS pe `tv_devices`).
 */
import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Link2, Unlink } from "lucide-react";
import { audit, isAdmin } from "../lib/audit.js";
import { mesajEroare } from "../lib/errors.js";
import { fmtDateTime } from "../lib/format.js";
import { toateTelevizoarele, mapeazaCamera, cheamaTv } from "../data/televizoare.js";

export function TelevizoareCamera({ room }) {
  const [televizoare, setTelevizoare] = useState(null);   // null = încă se încarcă
  const [ales, setAles] = useState("");
  const [ocupat, setOcupat] = useState(null);
  const [stare, setStare] = useState(null);               // { ok, text } după o acțiune
  const poateSchimba = isAdmin();

  const incarca = useCallback(async () => {
    try {
      setTelevizoare(await toateTelevizoarele());
    } catch (e) {
      setTelevizoare([]);
      setStare({ ok: false, text: mesajEroare(e, "Nu am putut citi televizoarele.") });
    }
  }, []);
  useEffect(() => { incarca(); }, [incarca]);

  const aleCamerei = (televizoare || []).filter((t) => t.cameraId === room.id);
  const deLegat = (televizoare || []).filter((t) => t.cameraId !== room.id);

  const leaga = async () => {
    const t = deLegat.find((x) => x.id === ales);
    if (!t) return;
    setOcupat("leaga");
    setStare(null);
    try {
      await mapeazaCamera(t.id, room.id);
      await audit.push("Televizor mapat", `${t.nume} → ${room.name}`, { roomId: room.id });
      setAles("");
      await incarca();
    } catch (e) {
      setStare({ ok: false, text: mesajEroare(e, "Nu am putut lega televizorul de cameră.") });
    } finally {
      setOcupat(null);
    }
  };

  const scoate = async (t) => {
    setOcupat("scoate" + t.id);
    setStare(null);
    try {
      await mapeazaCamera(t.id, null);
      await audit.push("Televizor scos din cameră", `${t.nume} · ${room.name}`, { roomId: room.id });
      await incarca();
    } catch (e) {
      setStare({ ok: false, text: mesajEroare(e, "Nu am putut scoate televizorul din cameră.") });
    } finally {
      setOcupat(null);
    }
  };

  const sincronizeaza = async () => {
    setOcupat("sync");
    setStare(null);
    const r = await cheamaTv("sync-tvs");
    setOcupat(null);
    if (!r.ok) { setStare({ ok: false, text: r.error || "Sincronizarea a eșuat." }); return; }
    setStare({ ok: true, text: `${r.total} televizoare în cont, ${r.noi} noi.` });
    await incarca();
  };

  return (
    <div>
      <div className="section-head">Televizoarele camerei</div>
      <div className="panel mb-12 tv-camera-lista">
        {televizoare === null ? (
          <div className="section-empty">Se încarcă…</div>
        ) : aleCamerei.length === 0 ? (
          <div className="section-empty">
            Camera n-are încă niciun televizor. Când televizoarele vor fi instalate, adu-le
            din contul Samsung LYNK cu „Sincronizează televizoare", apoi leagă-l pe al camerei
            de aici.
          </div>
        ) : aleCamerei.map((t) => (
          <div className="tv-camera-rand" key={t.id}>
            <div className="tv-camera-cap">
              <div>
                <div className="primary">
                  {t.nume}
                  {t.simulat && <span className="dv-manual">simulare</span>}
                </div>
                <div className="secondary">
                  {[t.model, t.online ? "online" : "offline", t.activ ? null : "dezactivat"].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-mic"
                disabled={!poateSchimba || Boolean(ocupat)} onClick={() => scoate(t)}>
                <Unlink size={14} /> Scoate din cameră
              </button>
            </div>
            {/* Mesajul AȘA CUM E PE ECRAN, cu rândurile lui și pe toată
                lățimea — ca în Automatizare → Televizoare → Camere. Într-o
                coloană îngustă, lângă buton, rândurile s-ar fi rupt altfel
                decât pe televizor. */}
            {t.mesaj
              ? <pre className="tv-ecran">{t.mesaj}</pre>
              : <div className="tv-gol">Ecranul e gol.</div>}
            {t.mesajLa && <div className="tv-camera-scris">scris {fmtDateTime(t.mesajLa)}</div>}
          </div>
        ))}
      </div>

      {deLegat.length > 0 && (
        <label className="field">
          <span className="fl">Leagă un televizor de cameră</span>
          <select name="tv-de-legat" value={ales} disabled={!poateSchimba}
            onChange={(e) => { setAles(e.target.value); setStare(null); }}>
            <option value="">— alege televizorul —</option>
            {deLegat.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nume} · {t.camera ? `acum în ${t.camera}` : "fără cameră"}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Nu `.modal-actions`: în fereastră, aceea se lipește de marginea de
          jos, peste „Salvează". */}
      <div className="tv-camera-actiuni">
        {deLegat.length > 0 && (
          <button type="button" className="btn btn-primary"
            disabled={!poateSchimba || !ales || Boolean(ocupat)} onClick={leaga}>
            <Link2 size={14} /> Leagă de cameră
          </button>
        )}
        <button type="button" className="btn btn-ghost" disabled={Boolean(ocupat)} onClick={sincronizeaza}>
          <RefreshCw size={14} /> {ocupat === "sync" ? "Sincronizez…" : "Sincronizează televizoare"}
        </button>
      </div>

      {stare && (
        <div className={(stare.ok ? "text-secundar" : "error-text") + " mt-8"} role={stare.ok ? undefined : "alert"}>
          {stare.text}
        </div>
      )}

      <div className="note mt-14">
        Mesajul de bun venit, furnizorul și istoricul mesajelor sunt în Automatizare → Televizoare.
      </div>
    </div>
  );
}
