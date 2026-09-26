/* TELEVIZOARE — mesajele de bun venit din camere (Samsung LYNK Cloud).
 *
 * Din 26 septembrie 2026 e tabul „Televizoare" din Automatizare, nu o
 * intrare proprie în meniu; televizorul fiecărei camere se leagă și din fișa
 * camerei (features/televizoare-camera.jsx).
 *
 * Ecranul e organizat pe trei întrebări, în ordinea în care le pune cineva
 * care stă la recepție:
 *   · „ce scrie acum pe ecranul din camera X?"  → Camere
 *   · „care televizor e al cărei camere?"       → Aparate
 *   · „ce scrie în mesaj, și cum arată?"        → Mesaj
 * plus istoricul, care răspunde la „a plecat sau nu mesajul?".
 *
 * Nimic de aici nu vorbește direct cu LYNK Cloud: tot ce atinge un televizor
 * trece prin Edge Function-ul `tv-provider`, unde stau credențialele contului.
 *
 * Mesajele pleacă singure la check-in și dispar la check-out (vezi
 * features/tv-mesaje.js). Butoanele de aici sunt pentru când ceva n-a mers,
 * sau pentru când recepția vrea să vadă cu ochii ei.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Tv, RefreshCw, Trash2, Send, Eraser, AlertTriangle, MessageSquare, Settings } from "lucide-react";
import { audit, isAdmin } from "../lib/audit.js";
import { mesajEroare } from "../lib/errors.js";
import { fmtDateTime } from "../lib/format.js";
import { toaster } from "../ui/primitive.jsx";
import {
  toateTelevizoarele, mapeazaCamera, comutaActiv, stergeTelevizor,
  mesajeRecente, setariTv, salveazaSetariTv, cheamaTv,
} from "../data/televizoare.js";
import { mesajBunVenit, SABLOANE_IMPLICITE, LIMBI } from "../lib/tv.js";

const ETICHETA_LIMBA = { ro: "română", en: "engleză" };

/* Rezervarea cazată acum în cameră. Una singură poate fi — garda din
   doCheckIn nu lasă două. */
const cazataIn = (rezervari, cameraId) =>
  (rezervari || []).find((r) => r.roomId === cameraId && r.status === "checkedin") || null;

export function TelevizoareView({ core, reservations }) {
  const [televizoare, setTelevizoare] = useState([]);
  const [setari, setSetari] = useState(null);
  const [istoric, setIstoric] = useState([]);
  const [seIncarca, setSeIncarca] = useState(true);
  const [ocupat, setOcupat] = useState(null);
  const [sectiune, setSectiune] = useState("camere");

  const reincarca = useCallback(async () => {
    try {
      const [tv, s, ist] = await Promise.all([toateTelevizoarele(), setariTv(), mesajeRecente(60)]);
      setTelevizoare(tv);
      setSetari(s);
      setIstoric(ist);
    } catch (e) {
      toaster.show(mesajEroare(e, "Nu am putut citi televizoarele."), { tone: "danger" });
    } finally {
      setSeIncarca(false);
    }
  }, []);

  useEffect(() => { reincarca(); }, [reincarca]);

  const cheama = useCallback(async (actiune, corp, reusita) => {
    setOcupat(actiune + (corp?.roomId || corp?.tvId || ""));
    const r = await cheamaTv(actiune, corp);
    setOcupat(null);
    if (!r.ok) { toaster.show(r.error, { tone: "danger" }); return r; }
    if (r.fara) { toaster.show("Camera n-are niciun televizor mapat.", { tone: "danger" }); return r; }
    await reincarca();
    if (reusita) toaster.show(reusita(r), { tone: "ok" });
    return r;
  }, [reincarca]);

  if (seIncarca || !setari) return <div className="note">Se încarcă televizoarele…</div>;

  const nemapate = televizoare.filter((t) => !t.cameraId);
  const simulare = setari.provider === "simulare";
  /* Aparate rămase de la celălalt furnizor. Se întâmplă la prima comutare
     simulare → LYNK: rândurile vechi rămân în tabel, iar funcția edge nu le
     atinge (filtrează pe furnizorul activ, ca un mesaj real să nu plece către
     un id simulat și invers). Fără rândul ăsta, o cameră ar arăta televizor
     în listă și ar răspunde „n-are televizor mapat" la apăsarea butonului. */
  const altFurnizor = televizoare.filter((t) => t.furnizor !== setari.provider);

  return (
    <div>
      <div className="sub-tabs" role="tablist" aria-label="Secțiuni televizoare">
        <button role="tab" aria-selected={sectiune === "camere"}
          className={sectiune === "camere" ? "on" : ""} onClick={() => setSectiune("camere")}>
          <Tv size={14} /> Camere
        </button>
        <button role="tab" aria-selected={sectiune === "aparate"}
          className={sectiune === "aparate" ? "on" : ""} onClick={() => setSectiune("aparate")}>
          <Settings size={14} /> Aparate
        </button>
        <button role="tab" aria-selected={sectiune === "mesaj"}
          className={sectiune === "mesaj" ? "on" : ""} onClick={() => setSectiune("mesaj")}>
          <MessageSquare size={14} /> Mesaj
        </button>
        <button role="tab" aria-selected={sectiune === "istoric"}
          className={sectiune === "istoric" ? "on" : ""} onClick={() => setSectiune("istoric")}>
          <RefreshCw size={14} /> Istoric
        </button>
      </div>

      {/* Avertismentele stau deasupra tuturor secțiunilor, nu într-una
          singură: amândouă înseamnă „ce vezi mai jos nu se întâmplă pe
          televizoare adevărate", iar asta nu are voie să depindă de tabul
          deschis. */}
      {simulare && (
        <div className="tv-avertisment">
          <AlertTriangle size={15} />
          <span>
            Furnizor: <b>simulare</b>. Mesajele NU ajung pe niciun televizor real —
            se scriu doar în PMS, ca să poată fi verificat fluxul. Comutarea pe LYNK Cloud
            se face în „Mesaj".
          </span>
        </div>
      )}
      {altFurnizor.length > 0 && (
        <div className="tv-avertisment">
          <AlertTriangle size={15} />
          <span>
            {altFurnizor.length} televizoare sunt salvate cu alt furnizor decât cel activ
            și nu primesc niciun mesaj. Sincronizează din „Aparate", apoi leagă-le de camere
            (pe cele vechi le poți șterge).
          </span>
        </div>
      )}
      {!setari.activ && (
        <div className="tv-avertisment">
          <AlertTriangle size={15} />
          <span>Integrarea e <b>oprită</b> din setări: check-in-urile nu mai trimit niciun mesaj.</span>
        </div>
      )}

      {sectiune === "camere" && (
        <Camere core={core} reservations={reservations} televizoare={televizoare}
          ocupat={ocupat} onCheama={cheama} />
      )}

      {sectiune === "aparate" && (
        <Aparate core={core} televizoare={televizoare} nemapate={nemapate}
          ocupat={ocupat} onCheama={cheama} onReincarca={reincarca} />
      )}

      {sectiune === "mesaj" && (
        <Mesaj setari={setari} core={core} reservations={reservations}
          onSalvat={reincarca} />
      )}

      {sectiune === "istoric" && <Istoric randuri={istoric} />}
    </div>
  );
}

/* ---------------------------------------------------------------
   CAMERE — ce scrie acum pe fiecare ecran
----------------------------------------------------------------*/
function Camere({ core, reservations, televizoare, ocupat, onCheama }) {
  const peCamera = useMemo(() => {
    const m = new Map();
    for (const t of televizoare.filter((x) => x.cameraId)) {
      m.set(t.cameraId, [...(m.get(t.cameraId) || []), t]);
    }
    return m;
  }, [televizoare]);

  const camere = (core.rooms || []).filter((c) => peCamera.has(c.id));

  if (!camere.length) {
    return (
      <div className="empty-state">
        Niciun televizor nu e legat de vreo cameră. Adu aparatele din contul LYNK
        și leagă-le de camere în „Aparate" sau din fișa fiecărei camere (Camere și
        tarife → camera → Televizor).
      </div>
    );
  }

  return (
    <div className="panel">
      {camere.map((camera) => {
        const ale = peCamera.get(camera.id) || [];
        const cazata = cazataIn(reservations, camera.id);
        const cuMesaj = ale.find((t) => t.mesaj);
        return (
          <div className="dv-row" key={camera.id}>
            <div className="dv-info">
              <div className="dv-title">
                <Tv size={15} /> {camera.name}
                {ale.length > 1 && <span className="dv-sub">· {ale.length} ecrane</span>}
              </div>
              <div className="dv-sub">
                {ale.map((t) => (
                  <span key={t.id}>
                    {t.nume}
                    {t.activ ? "" : " (dezactivat)"}
                    {t.online ? "" : " · offline"}
                  </span>
                ))}
              </div>
              {/* Mesajul se arată AȘA CUM E PE ECRAN, cu rândurile lui: la un
                  text de patru rânduri strâns într-o singură linie, nimeni
                  n-ar observa că unul dintre ele lipsește. */}
              {cuMesaj
                ? <pre className="tv-ecran">{cuMesaj.mesaj}</pre>
                : <div className="tv-gol">Ecranul e gol.</div>}
              {cuMesaj?.mesajLa && (
                <div className="dv-sub">scris {fmtDateTime(cuMesaj.mesajLa)}</div>
              )}
            </div>
            <div className="dv-ctrl">
              <button className="btn btn-ghost btn-mic"
                disabled={!cazata || Boolean(ocupat)}
                title={cazata ? "" : "Camera n-are nicio cazare în curs"}
                onClick={() => onCheama("welcome", { reservationId: cazata.id },
                  (r) => `Mesaj trimis · ${r.camera}`)}>
                <Send size={14} /> Trimite
              </button>
              <button className="btn btn-ghost btn-mic"
                disabled={!cuMesaj || Boolean(ocupat)}
                onClick={() => onCheama("clear", { roomId: camera.id },
                  () => `Ecranul din ${camera.name} a fost golit.`)}>
                <Eraser size={14} /> Șterge
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------
   APARATE — sincronizarea din LYNK și maparea pe camere
----------------------------------------------------------------*/
function Aparate({ core, televizoare, nemapate, ocupat, onCheama, onReincarca }) {
  const poateSchimba = isAdmin();

  const leaga = async (tv, cameraId) => {
    try {
      await mapeazaCamera(tv.id, cameraId);
      await audit.push("Televizor mapat",
        `${tv.nume} → ${(core.rooms || []).find((c) => c.id === cameraId)?.name || "nemapat"}`);
      await onReincarca();
    } catch (e) {
      toaster.show(mesajEroare(e, "Nu am putut lega televizorul de cameră."), { tone: "danger" });
    }
  };

  const sterge = async (tv) => {
    /* Nu cere confirmare printr-un dialog: ștergerea de aici scoate aparatul
       doar din PMS, iar o sincronizare îl aduce înapoi. Ce se pierde e
       maparea pe cameră — de-aia scrie asta în text, lângă buton. */
    try {
      await stergeTelevizor(tv.id);
      await audit.push("Televizor șters din PMS", tv.nume);
      await onReincarca();
    } catch (e) {
      toaster.show(mesajEroare(e, "Nu am putut șterge televizorul."), { tone: "danger" });
    }
  };

  return (
    <>
      <div className="panel mb-14">
        <div className="dv-head">
          <div className="dv-info">
            <div className="dv-title">Aparatele din contul LYNK</div>
            <div className="dv-sub">
              Sincronizarea aduce televizoarele din cont, dar NU le leagă singură de
              camere: un televizor pus pe camera greșită scrie numele unui oaspete pe
              ecranul altuia. Legătura o faci tu, mai jos.
            </div>
          </div>
          <div className="dv-ctrl">
            <button className="btn btn-primary btn-mic" disabled={Boolean(ocupat)}
              onClick={() => onCheama("sync-tvs", {},
                (r) => `${r.total} televizoare în cont, ${r.noi} noi.`)}>
              <RefreshCw size={14} /> Sincronizează
            </button>
            <button className="btn btn-ghost btn-mic" disabled={Boolean(ocupat)}
              onClick={() => onCheama("refresh", {}, (r) => `Stare citită pentru ${r.actualizate} televizoare.`)}>
              Stare
            </button>
          </div>
        </div>
      </div>

      {nemapate.length > 0 && (
        <div className="note mb-14">
          {nemapate.length} televizoare fără cameră. Cât timp rămân așa, nu primesc niciun mesaj.
        </div>
      )}

      {!televizoare.length ? (
        <div className="empty-state">
          Niciun televizor în PMS. Apasă „Sincronizează" ca să le aduci din contul LYNK.
        </div>
      ) : (
        <div className="panel">
          {televizoare.map((t) => (
            <div className="dv-row" key={t.id}>
              <div className="dv-info">
                <div className="dv-title">
                  <Tv size={15} /> {t.nume}
                  {t.simulat && <span className="dv-manual">simulare</span>}
                </div>
                <div className="dv-sub">
                  <span className="mono">{t.idLynk}</span>
                  {t.model && <span>· {t.model}</span>}
                  <span>· {t.online ? "online" : "offline"}</span>
                  {t.vazutLa && <span>· văzut {fmtDateTime(t.vazutLa)}</span>}
                  {t.sugestieCamera && !t.cameraId && <span>· în cont: „{t.sugestieCamera}"</span>}
                </div>
              </div>
              <div className="dv-ctrl">
                <label className="field">
                  <span className="fl">Cameră</span>
                  <select value={t.cameraId || ""} disabled={!poateSchimba}
                    onChange={(e) => leaga(t, e.target.value)}>
                    <option value="">— nemapat —</option>
                    {(core.rooms || []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-ghost btn-mic" disabled={!poateSchimba}
                  onClick={async () => {
                    try {
                      await comutaActiv(t.id, !t.activ);
                      await onReincarca();
                    } catch (e) {
                      toaster.show(mesajEroare(e, "Nu am putut schimba starea."), { tone: "danger" });
                    }
                  }}>
                  {t.activ ? "Dezactivează" : "Activează"}
                </button>
                <button className="icon-btn" aria-label={`Șterge ${t.nume} din PMS`}
                  title="Scoate aparatul din PMS (o sincronizare îl aduce înapoi, nemapat)"
                  disabled={!poateSchimba} onClick={() => sterge(t)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------
   MESAJ — șabloanele și setările, cu previzualizare
----------------------------------------------------------------*/
function Mesaj({ setari, core, reservations, onSalvat }) {
  const poateSchimba = isAdmin();
  const [form, setForm] = useState(setari);
  const [salveaza, setSalveaza] = useState(false);

  const pune = (camp, valoare) => setForm((f) => ({ ...f, [camp]: valoare }));
  const puneSablon = (limba, text) =>
    setForm((f) => ({ ...f, templates: { ...f.templates, [limba]: text } }));

  /* PREVIZUALIZAREA SE FACE CU DATE REALE cât timp există: prima cazare în
     curs, cu camera și numele ei. Un exemplu inventat arată mereu bine — un
     nume real e cel care dă pe-afară din plafon. */
  const exemplu = useMemo(() => {
    const cazata = (reservations || []).find((r) => r.status === "checkedin");
    const camera = cazata ? (core.rooms || []).find((c) => c.id === cazata.roomId) : null;
    const oaspete = cazata ? (core.guests || []).find((g) => g.id === cazata.guestId) : null;
    return {
      rezervare: cazata || {
        checkin: new Date().toISOString(),
        checkout: new Date(Date.now() + 2 * 86400000).toISOString(),
        occupantFirstName: "Ana", occupantLastName: "Popescu-Vasilescu",
      },
      oaspete: oaspete || { firstName: "Ana", lastName: "Popescu-Vasilescu", country: "România" },
      numeCamera: camera?.name || "1003",
      real: Boolean(cazata),
    };
  }, [reservations, core.rooms, core.guests]);

  const salveazaTot = async () => {
    setSalveaza(true);
    try {
      await salveazaSetariTv(form);
      await audit.push("Setări televizoare modificate", `furnizor: ${form.provider}`);
      toaster.show("Setările televizoarelor au fost salvate.", { tone: "ok" });
      await onSalvat();
    } catch (e) {
      toaster.show(mesajEroare(e, "Nu am putut salva setările."), { tone: "danger" });
    } finally {
      setSalveaza(false);
    }
  };

  return (
    <>
      <div className="panel mb-14 p-16">
        <label className="field">
          <span className="fl">Furnizor</span>
          <select value={form.provider} disabled={!poateSchimba}
            onChange={(e) => pune("provider", e.target.value)}>
            <option value="simulare">Simulare (nu atinge niciun televizor)</option>
            <option value="lynk">Samsung LYNK Cloud</option>
          </select>
        </label>
        <label className="field">
          <span className="fl">Integrarea e pornită</span>
          <input type="checkbox" checked={form.activ} disabled={!poateSchimba}
            onChange={(e) => pune("activ", e.target.checked)} />
        </label>
        <label className="field">
          <span className="fl">Numele pensiunii, în mesaj</span>
          <input value={form.hotelName} disabled={!poateSchimba}
            onChange={(e) => pune("hotelName", e.target.value)} />
        </label>
        <label className="field">
          <span className="fl">Rețeaua Wi-Fi scrisă pe ecran</span>
          <input value={form.wifiName} disabled={!poateSchimba} placeholder="ex. LaLivada-Oaspeti"
            onChange={(e) => pune("wifiName", e.target.value)} />
        </label>
        <label className="field">
          <span className="fl">Telefonul recepției, în mesaj</span>
          <input value={form.supportPhone} disabled={!poateSchimba} placeholder="ex. +40 722 899 899"
            onChange={(e) => pune("supportPhone", e.target.value)} />
        </label>
        <label className="field">
          <span className="fl">Fără diacritice</span>
          <input type="checkbox" checked={form.faraDiacritice} disabled={!poateSchimba}
            onChange={(e) => pune("faraDiacritice", e.target.checked)} />
        </label>
        <div className="note">
          Bifează „fără diacritice" doar dacă un televizor arată dreptunghiuri în loc de
          ș și ț. Restul aparatelor scriu corect.
        </div>
      </div>

      {LIMBI.map((limba) => {
        const { text } = mesajBunVenit({
          rezervare: exemplu.rezervare, oaspete: { ...exemplu.oaspete, country: limba === "ro" ? "RO" : "IT" },
          numeCamera: exemplu.numeCamera, setari: { ...form, limbaFortata: limba },
        });
        return (
          <div className="panel mb-14 p-16" key={limba}>
            <div className="dv-title">Mesajul în {ETICHETA_LIMBA[limba]}</div>
            <div className="dv-sub">
              Chei: {"{{guest_name}} {{hotel_name}} {{room_number}} {{wifi_name}} {{support_phone}} {{checkout_date}} {{checkout_time}} {{nights}}"}.
              Un rând rămas fără valoare dispare de pe ecran.
            </div>
            <textarea className="tv-sablon" rows={5} value={form.templates[limba] || ""}
              disabled={!poateSchimba}
              onChange={(e) => puneSablon(limba, e.target.value)} />
            <div className="dv-sub">
              Așa se vede în cameră{exemplu.real ? " (date dintr-o cazare în curs)" : " (exemplu)"}:
            </div>
            <pre className="tv-ecran">{text}</pre>
            {form.templates[limba] !== SABLOANE_IMPLICITE[limba] && poateSchimba && (
              <button className="btn btn-ghost btn-mic"
                onClick={() => puneSablon(limba, SABLOANE_IMPLICITE[limba])}>
                Revino la textul implicit
              </button>
            )}
          </div>
        );
      })}

      {poateSchimba ? (
        <button className="btn btn-primary" disabled={salveaza} onClick={salveazaTot}>
          {salveaza ? "Se salvează…" : "Salvează setările"}
        </button>
      ) : (
        <div className="note">Setările televizoarelor le poate schimba doar un administrator.</div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------
   ISTORIC — ce s-a trimis, și ce n-a plecat
----------------------------------------------------------------*/
const ETICHETA_ACTIUNE = {
  welcome: "mesaj trimis",
  clear: "ecran golit",
  sync: "sincronizare",
  refresh: "citire stare",
};

function Istoric({ randuri }) {
  if (!randuri.length) return <div className="empty-state">Încă niciun mesaj trimis.</div>;
  return (
    <div className="panel">
      {randuri.map((r) => (
        <div className="dv-row" key={r.id}>
          <div className="dv-info">
            <div className="dv-title">
              {r.room_name || r.tv_name || "—"} · {ETICHETA_ACTIUNE[r.action] || r.action}
              {r.result === "error" && <span className="dv-manual">eșuat</span>}
            </div>
            <div className="dv-sub">
              {fmtDateTime(r.at)} · {r.actor}
            </div>
            {r.message && <pre className="tv-ecran">{r.message}</pre>}
            {r.detail && <div className="dv-ciclu-eroare">{r.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
