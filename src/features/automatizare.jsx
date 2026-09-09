/* AUTOMATIZARE — releele Shelly din camerele tehnice.
 *
 * Ecranul e organizat dupa MONTAJUL FIZIC, nu dupa camere: camerele sunt
 * legate cate doua la o camera tehnica, iar acolo sta un Shelly Pro 4PM cu
 * patru iesiri. Doua dintre ele servesc amandoua camerele perechii.
 *
 * De-aici vine decizia de prezentare: fiecare iesire spune EXPLICIT ce
 * comanda si pentru cine. O interfata organizata pe camere ar fi ascuns
 * tocmai partea periculoasa — ca oprind boilerul lui 1005 ramane fara apa
 * calda si 1003.
 *
 * Comenzile trec prin Edge Function-ul `device-provider`; cheia contului
 * Shelly nu ajunge niciodata in browser.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Zap, Flame, Lightbulb, Plug, RefreshCw, Plus, Trash2, AlertTriangle, Users } from "lucide-react";
import { audit, isAdmin } from "../lib/audit.js";
import { mesajEroare } from "../lib/errors.js";
import { fmtDateTime } from "../lib/format.js";
import { Dialog, toaster, useModalLock } from "../ui/primitive.jsx";
import {
  CAMERE_TEHNICE, CANALE, toateDispozitivele, adaugaShelly, stergeShelly,
  cheamaDispozitiv,
} from "../data/dispozitive.js";

const PICTOGRAMA = {
  boiler: Flame,
  iluminat_exterior: Lightbulb,
  prize: Plug,
};

/* Lofturile n-au camera tehnica, deci n-au releu. Se spune pe ecran, ca sa
   nu para o omisiune si sa nu le caute nimeni. */
const FARA_SHELLY = ["1101", "1102"];

export function AutomatizareView({ core }) {
  const [dispozitive, setDispozitive] = useState([]);
  const [seIncarca, setSeIncarca] = useState(true);
  const [ocupat, setOcupat] = useState(null);
  const [adauga, setAdauga] = useState(null);

  const numeCamera = useCallback(
    (id) => (core.rooms || []).find((r) => r.id === id)?.name || id,
    [core.rooms],
  );

  const reincarca = useCallback(async () => {
    try {
      setDispozitive(await toateDispozitivele());
    } catch (e) {
      toaster.push(mesajEroare(e, "Nu am putut citi dispozitivele."), "error");
    } finally {
      setSeIncarca(false);
    }
  }, []);

  useEffect(() => { reincarca(); }, [reincarca]);

  /* Starea din baza e ultima cunoscuta, nu cea de acum: intre doua refresh-uri
     cineva poate apasa intrerupatorul fizic. Butonul e deci parte din ecran,
     nu un detaliu de depanare. */
  const actualizeaza = useCallback(async () => {
    setOcupat("refresh");
    const r = await cheamaDispozitiv("refresh");
    setOcupat(null);
    if (!r.ok) { toaster.push(r.error, "error"); return; }
    await reincarca();
    toaster.push(r.actualizate ? `Stare actualizată pentru ${r.actualizate} ieșiri.` : "Niciun dispozitiv de actualizat.");
  }, [reincarca]);

  const comuta = useCallback(async (dispozitiv, pornit) => {
    setOcupat(dispozitiv.id);
    const r = await cheamaDispozitiv(pornit ? "on" : "off", { deviceId: dispozitiv.id });
    setOcupat(null);
    if (!r.ok) { toaster.push(r.error, "error"); return; }
    audit.push(
      pornit ? "Pornit dispozitiv" : "Oprit dispozitiv",
      `${dispozitiv.eticheta} · ${dispozitiv.camere.join(", ")}`,
    );
    await reincarca();
  }, [reincarca]);

  /* Dispozitivele grupate pe camera tehnica. Legatura se face prin ID-ul de
     Shelly: toate cele patru randuri ale unui releu il au pe acelasi. */
  const peCameraTehnica = useMemo(() => {
    const harta = new Map();
    for (const ct of CAMERE_TEHNICE) {
      const aleLui = dispozitive.filter((d) =>
        d.camereIds.some((id) => ct.camere.includes(id)));
      harta.set(ct.nr, aleLui);
    }
    return harta;
  }, [dispozitive]);

  const idShellyFolosite = useMemo(
    () => new Set(dispozitive.map((d) => d.idShelly)),
    [dispozitive],
  );

  if (seIncarca) return <div className="note">Se încarcă dispozitivele…</div>;

  return (
    <div>
      <div className="note">
        Fiecare pereche de camere are o cameră tehnică, iar acolo un releu Shelly Pro 4PM cu patru ieșiri.
        Ieșirile de boiler și iluminat exterior sunt <strong>comune celor două camere</strong> — cine le oprește
        le oprește pentru amândouă. Camerele {FARA_SHELLY.join(" și ")} nu au releu.
      </div>

      <div className="toolbar">
        <div className="grow" />
        <button
          className="btn btn-ghost" style={{ width: "auto" }}
          disabled={ocupat === "refresh"} onClick={actualizeaza}
        >
          <RefreshCw size={15} /> {ocupat === "refresh" ? "Se actualizează…" : "Actualizează starea"}
        </button>
      </div>

      {CAMERE_TEHNICE.map((ct) => (
        <CameraTehnica
          key={ct.nr}
          ct={ct}
          dispozitive={peCameraTehnica.get(ct.nr) || []}
          numeCamera={numeCamera}
          ocupat={ocupat}
          onComuta={comuta}
          onAdauga={() => setAdauga(ct)}
          onSterge={reincarca}
        />
      ))}

      {adauga && (
        <AdaugaReleu
          ct={adauga}
          numeCamera={numeCamera}
          idFolosite={idShellyFolosite}
          onClose={() => setAdauga(null)}
          onGata={async () => { setAdauga(null); await reincarca(); }}
        />
      )}
    </div>
  );
}

function CameraTehnica({ ct, dispozitive, numeCamera, ocupat, onComuta, onAdauga, onSterge }) {
  const [confirmaStergere, setConfirmaStergere] = useState(false);
  const nume = ct.camere.map(numeCamera);
  const idShelly = dispozitive[0]?.idShelly || null;

  /* Randurile se aseaza dupa CANALE, nu dupa ce a venit din baza: ordinea
     iesirilor pe ecran trebuie sa fie mereu cea de pe releu, chiar daca un
     canal lipseste din baza. */
  const peCanal = new Map(dispozitive.map((d) => [d.canal, d]));

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="list-row" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="primary">
            Camera tehnică {ct.nr}
            <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
              {" "}· camerele {nume.join(" și ")}
            </span>
          </div>
          <div className="secondary">
            {idShelly
              ? <span className="mono">Shelly Pro 4PM · {idShelly}</span>
              : "Niciun releu înregistrat"}
          </div>
        </div>
        {isAdmin() && (
          <div className="row-actions">
            {!idShelly && (
              <button className="btn btn-ghost" style={{ width: "auto" }} onClick={onAdauga}>
                <Plus size={14} /> Adaugă releu
              </button>
            )}
            {idShelly && (confirmaStergere ? (
              <>
                <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>Ștergi releul?</span>
                <button
                  className="icon-btn" aria-label="Confirmă ștergerea releului"
                  onClick={async () => {
                    try {
                      await stergeShelly(idShelly);
                      audit.push("Șters releu", `Camera tehnică ${ct.nr} · ${idShelly}`);
                      await onSterge();
                    } catch (e) {
                      toaster.push(mesajEroare(e, "Nu am putut șterge releul."), "error");
                    } finally { setConfirmaStergere(false); }
                  }}
                ><Trash2 size={14} /></button>
                <button className="btn btn-ghost" style={{ width: "auto" }} onClick={() => setConfirmaStergere(false)}>
                  Renunță
                </button>
              </>
            ) : (
              <button className="icon-btn" aria-label="Șterge releul" onClick={() => setConfirmaStergere(true)}>
                <Trash2 size={14} />
              </button>
            ))}
          </div>
        )}
      </div>

      {!idShelly ? (
        <div className="empty-state">
          <Zap size={22} />
          <p>
            {isAdmin()
              ? "Adaugă ID-ul releului din contul Shelly ca să apară cele patru ieșiri."
              : "Releul nu e încă înregistrat. Cere-i adminului să-l adauge."}
          </p>
        </div>
      ) : (
        CANALE.map((c) => (
          <Iesire
            key={c.canal}
            config={c}
            dispozitiv={peCanal.get(c.canal)}
            camere={c.ambele ? nume : [nume[c.indexCamera]]}
            ocupat={ocupat}
            onComuta={onComuta}
          />
        ))
      )}
    </div>
  );
}

function Iesire({ config, dispozitiv, camere, ocupat, onComuta }) {
  const Icon = PICTOGRAMA[config.kind] || Zap;
  const acestaOcupat = dispozitiv && ocupat === dispozitiv.id;
  const lipseste = !dispozitiv;

  return (
    <div className="list-row">
      <div>
        <div className="primary" style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Icon size={14} />
          Ieșirea {config.iesire} · {config.eticheta}
        </div>
        <div className="secondary" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span>{camere.join(" și ")}</span>
          {config.ambele && (
            /* Avertismentul e permanent, nu doar in momentul apasarii:
               receptia trebuie sa vada partajarea cand se uita pe ecran, nu
               dupa ce a oprit deja apa calda vecinului. */
            <span className="role-tag role-admin" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Users size={11} /> comun celor două camere
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {lipseste ? (
          <span className="secondary">neînregistrată</span>
        ) : (
          <>
            <StarePastila dispozitiv={dispozitiv} />
            <button
              className={"btn " + (dispozitiv.pornit ? "btn-ghost" : "btn-primary")}
              style={{ width: "auto" }}
              disabled={acestaOcupat || !dispozitiv.activ}
              onClick={() => onComuta(dispozitiv, !dispozitiv.pornit)}
            >
              {acestaOcupat ? "…" : dispozitiv.pornit ? "Oprește" : "Pornește"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StarePastila({ dispozitiv }) {
  if (!dispozitiv.activ) return <span className="role-tag">dezactivată</span>;
  if (!dispozitiv.vazutLa) return <span className="role-tag">stare necunoscută</span>;
  if (!dispozitiv.online) {
    return (
      <span className="role-tag role-receptionist" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            title={`Ultima stare cunoscută: ${fmtDateTime(dispozitiv.vazutLa)}`}>
        <AlertTriangle size={11} /> offline
      </span>
    );
  }
  return (
    <span
      className={"role-tag " + (dispozitiv.pornit ? "role-admin" : "role-housekeeping")}
      title={`Verificat: ${fmtDateTime(dispozitiv.vazutLa)}`}
    >
      {dispozitiv.pornit ? "pornit" : "oprit"}
    </span>
  );
}

function AdaugaReleu({ ct, numeCamera, idFolosite, onClose, onGata }) {
  const [id, setId] = useState("");
  const [salveaza, setSalveaza] = useState(false);
  useModalLock();

  const curat = id.trim();
  const duplicat = curat && idFolosite.has(curat);
  const nume = ct.camere.map(numeCamera);

  async function salveaza_() {
    if (!curat || duplicat) return;
    setSalveaza(true);
    try {
      await adaugaShelly({ idShelly: curat, nrCameraTehnica: ct.nr, model: "Shelly Pro 4PM" });
      audit.push("Adăugat releu", `Camera tehnică ${ct.nr} · ${curat}`);
      toaster.push("Releu adăugat. Verifică starea ieșirilor.");
      await onGata();
    } catch (e) {
      toaster.push(mesajEroare(e, "Nu am putut adăuga releul."), "error");
      setSalveaza(false);
    }
  }

  return (
    <Dialog title={`Adaugă releu · Camera tehnică ${ct.nr}`} onClose={onClose}>
      <div className="note">
        ID-ul dispozitivului se ia din aplicația Shelly: deschide releul → Settings → Device information →
        Device ID. Nu introduce aici cheia contului („auth key”) — aceea se pune o singură dată în setările
        serverului și nu are ce căuta în aplicație.
      </div>

      <div className="field">
        <label htmlFor="id-shelly">ID dispozitiv Shelly</label>
        <input
          id="id-shelly" className="mono" value={id} autoFocus
          placeholder="ex. 34987a1b2c3d"
          onChange={(e) => setId(e.target.value)}
        />
        {duplicat && (
          <div className="field-error">ID-ul e deja folosit de altă cameră tehnică.</div>
        )}
      </div>

      <div className="note">
        Se vor crea cele patru ieșiri, în ordinea de pe releu:
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {CANALE.map((c) => (
            <li key={c.canal}>
              <strong>Ieșirea {c.iesire}</strong> · {c.eticheta} —{" "}
              {c.ambele ? `${nume.join(" și ")} (comun)` : nume[c.indexCamera]}
            </li>
          ))}
        </ul>
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Renunță</button>
        <button className="btn btn-primary" disabled={!curat || duplicat || salveaza} onClick={salveaza_}>
          {salveaza ? "Se adaugă…" : "Adaugă releul"}
        </button>
      </div>
    </Dialog>
  );
}
