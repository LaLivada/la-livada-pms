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
import { Zap, ShowerHead, Spotlight, PlugZap, Gauge, RefreshCw, Plus, Trash2, Clock } from "lucide-react";
import { audit, isAdmin } from "../lib/audit.js";
import { mesajEroare } from "../lib/errors.js";
import { fmtDateTime } from "../lib/format.js";
import { Dialog, toaster, useModalLock } from "../ui/primitive.jsx";
import {
  CAMERE_TEHNICE, CANALE, toateDispozitivele, adaugaShelly, stergeShelly,
  cheamaDispozitiv, contorul,
} from "../data/dispozitive.js";

/* Iconul spune ce comanda releul, deci merita sa fie cel concret, nu unul
   generic: un dus pentru boiler (apa calda, nu foc), un proiector pentru
   iluminatul exterior (nu un bec de camera), o priza cu fulger pentru
   circuitul de prize. */
const PICTOGRAMA = {
  boiler: ShowerHead,
  iluminat_exterior: Spotlight,
  prize: PlugZap,
};

/* Cat de des se reciteste contorul cat timp ecranul e deschis. Cinci secunde
   arata „viu" fara sa se apropie de limita Shelly de o cerere pe secunda,
   care ar fi atinsa abia pe la cinci ecrane deschise simultan. */
const RITM_MS = 5000;
/* Dupa atata timp de citire neintrerupta, se opreste singura. Vezi comentariul
   de la `bate()`. */
const LIVE_MAX_MS = 30 * 60 * 1000;

export function AutomatizareView({ core }) {
  const [dispozitive, setDispozitive] = useState([]);
  const [seIncarca, setSeIncarca] = useState(true);
  const [ocupat, setOcupat] = useState(null);
  const [adauga, setAdauga] = useState(null);
  /* O singura camera tehnica pe ecran. Cu toate sapte una sub alta ieseau
     peste 3000px de derulat pe telefon, iar releul cautat era mereu jos. */
  const [activ, setActiv] = useState(1);
  const [sectiune, setSectiune] = useState("camere");

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

  /* CONSUM „ÎN TIMP REAL"
   *
   * Interfața reciteşte doar contorul, la câteva secunde, cât timp ecranul e
   * deschis. Nu e un compromis din lene — e singura formă care nu cere
   * infrastructură nouă:
   *
   * Un WebSocket direct din browser la Shelly ar cere ca browserul să țină
   * cheia contului, aceeaşi cheie care comandă toate releele. Un bundle de
   * browser e public, deci asta e exclus.
   * Un WebSocket ținut de server ar cere un proces mereu pornit — o funcție
   * edge trăieşte cât o cerere. Ar fi infrastructură nouă de administrat
   * pentru un număr care oricum se citeşte cu ochiul.
   *
   * Deci: reîncărcare deasă, doar a contorului (o singură cerere Shelly),
   * doar cât timp fila e vizibilă, cu trei opriri de siguranță mai jos.
   */
  const idContor = contorul(dispozitive)?.id || null;
  const [liveOprit, setLiveOprit] = useState(false);
  const [liveEroare, setLiveEroare] = useState(false);

  useEffect(() => {
    if (!idContor || sectiune !== "camere" || liveOprit) return;

    let anulat = false;
    let ceas;
    let esecuri = 0;
    const pornitLa = Date.now();

    const bate = async () => {
      if (anulat) return;

      /* 1. Fila ascunsă nu consumă apeluri — nimeni nu se uită. */
      if (document.hidden) { ceas = setTimeout(bate, RITM_MS); return; }

      /* 2. Un ecran uitat deschis peste noapte ar trage ~17.000 de apeluri pe
         zi, adică singur cât toată cota lunară a planului. După o jumătate de
         oră se opreşte şi cere o apăsare ca să continue. */
      if (Date.now() - pornitLa > LIVE_MAX_MS) { setLiveOprit(true); return; }

      const r = await cheamaDispozitiv("refresh", { deviceId: idContor });
      if (anulat) return;

      if (r.ok && r.device?.status) {
        esecuri = 0;
        setLiveEroare(false);
        const s = r.device.status;
        setDispozitive((lista) => lista.map((d) =>
          d.id === idContor
            ? { ...d, consum: s.consum || null, online: s.online === true, vazutLa: r.device.lastSeenAt }
            : d));
      } else {
        /* 3. Când Shelly nu răspunde, rărim în loc să insistăm: altfel o
           pană de internet ar produce un apel la fiecare cinci secunde,
           ore în şir, fără ca vreunul să aibă şanse. */
        esecuri = Math.min(esecuri + 1, 4);
        setLiveEroare(true);
      }
      ceas = setTimeout(bate, RITM_MS * 2 ** esecuri);
    };

    ceas = setTimeout(bate, RITM_MS);
    return () => { anulat = true; clearTimeout(ceas); };
  }, [idContor, sectiune, liveOprit]);

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
      <div className="sub-tabs" role="tablist" aria-label="Secțiuni">
        <button
          role="tab" aria-selected={sectiune === "camere"}
          className={sectiune === "camere" ? "on" : ""}
          onClick={() => setSectiune("camere")}
        >
          <Zap size={14} /> Camere tehnice
        </button>
        <button
          role="tab" aria-selected={sectiune === "automatizari"}
          className={sectiune === "automatizari" ? "on" : ""}
          onClick={() => setSectiune("automatizari")}
        >
          <Clock size={14} /> Automatizări
        </button>
      </div>

      {sectiune === "automatizari" ? <Automatizari /> : (
        <>
      <ConsumCurent
        contor={contorul(dispozitive)}
        oprit={liveOprit}
        eroare={liveEroare}
        onReia={() => { setLiveEroare(false); setLiveOprit(false); }}
      />

      <div className="tabs-bar">
        <div className="sub-tabs dv-tabs" role="tablist" aria-label="Camere tehnice">
          {CAMERE_TEHNICE.map((ct) => {
            const camere = ct.camere.map(numeCamera).join(" și ");
            const gol = !(peCameraTehnica.get(ct.nr) || []).length;
            return (
              <button
                key={ct.nr}
                role="tab"
                aria-selected={activ === ct.nr}
                className={activ === ct.nr ? "on" : ""}
                /* Numarul singur nu spune ce camere sunt dedesubt — titlul
                   si eticheta pentru cititoarele de ecran o spun, fara sa
                   lateasca tabul cat sa nu mai incapa sapte pe telefon. */
                title={`Camera tehnică ${ct.nr} · camerele ${camere}`}
                aria-label={`Camera tehnică ${ct.nr}, camerele ${camere}`}
                onClick={() => setActiv(ct.nr)}
              >
                #{ct.nr}
                {gol && <span className="dv-punct" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="tabs-actions">
          <button
            className="btn btn-ghost" style={{ width: "auto" }}
            disabled={ocupat === "refresh"} onClick={actualizeaza}
          >
            <RefreshCw size={15} /> {ocupat === "refresh" ? "Se actualizează…" : "Actualizează starea"}
          </button>
        </div>
      </div>

      {CAMERE_TEHNICE.filter((ct) => ct.nr === activ).map((ct) => (
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
        </>
      )}
    </div>
  );
}

/* Consumul general, citit de Shelly Pro 3EM. R, S si T sunt fazele 1, 2 si 3
   — asa le numeste electricianul, si asa scrie pe tablou; in API-ul Shelly
   ele sunt a, b si c.
   Randul e deasupra camerelor tehnice fiindca priveste toata pensiunea, nu o
   pereche de camere: cand cineva se uita de ce a sarit ceva, prima intrebare
   e cat trage in total si daca fazele sunt echilibrate. */
function ConsumCurent({ contor, oprit, eroare, onReia }) {
  if (!contor) return null;

  const c = contor.consum;
  const necunoscut = !c || !contor.online;

  return (
    <div className="dv-consum">
      <span className="dv-consum-titlu">
        <Gauge size={15} /> Consum curent
        {/* Punctul spune ca cifrele se reimprospateaza singure. Fara el,
            cineva ar sta si ar apasa „Actualizează starea" degeaba. */}
        {!oprit && !eroare && <span className="dv-live" title={`Se reciteşte la ${RITM_MS / 1000} secunde`} aria-label="se actualizează automat" role="img" />}
      </span>
      {oprit ? (
        <span className="dv-consum-gol">
          actualizarea automată s-a oprit după 30 de minute{" "}
          <button type="button" className="dv-reia" onClick={onReia}>reia</button>
        </span>
      ) : necunoscut ? (
        <span className="dv-consum-gol">
          {contor.online === false && contor.vazutLa
            ? "contorul nu răspunde"
            : "încă necitit — apasă „Actualizează starea”"}
        </span>
      ) : (
        <>
          <span className="dv-consum-total">{nr(c.totalKw, 2)} kW</span>
          <span className="dv-consum-total">{nr(c.totalA, 1)} A</span>
          {(c.faze || []).map((f) => (
            <span className="dv-faza" key={f.nume}>
              <b>{f.nume}</b> {nr(f.kw, 2)} kW · {nr(f.a, 1)} A
            </span>
          ))}
        </>
      )}
    </div>
  );
}

/* Virgula zecimala, ca peste tot in aplicatie. */
const nr = (v, zecimale) =>
  Number(v || 0).toLocaleString("ro-RO", {
    minimumFractionDigits: zecimale, maximumFractionDigits: zecimale,
  });

/* Regulile care pornesc singure releele — pornit boilerul inainte de sosire,
   stins iluminatul dupa o ora. Nu exista inca niciuna: ecranul spune asta
   deschis, in loc sa arate o lista goala din care nu se intelege daca e o
   functie neterminata sau doar n-a configurat nimeni nimic. */
function Automatizari() {
  return (
    <div className="panel">
      <div className="empty-state">
        <Clock size={26} />
        <h4>Nicio automatizare</h4>
        <p>
          Aici vor sta regulile care comandă releele singure — de exemplu „pornește boilerul
          cu două ore înainte de sosire" sau „stinge iluminatul exterior la răsărit".
          Deocamdată releele se comandă doar manual, din <strong>Camere tehnice</strong>.
        </p>
      </div>
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
      <div className="dv-head">
        <div className="dv-info">
          <div className="dv-title">
            Camera tehnică {ct.nr}
            {/* Numerele camerelor ingrosate, restul stins: cand cauti o
                camera anume, „1013" e singurul lucru pe care il scanezi. */}
            <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
              · camerele <strong style={{ color: "var(--text)" }}>{nume[0]}</strong>
              {" și "}
              <strong style={{ color: "var(--text)" }}>{nume[1]}</strong>
            </span>
          </div>
          <div className="dv-sub">
            {idShelly
              ? <span className="mono">Shelly Pro 4PM · {idShelly}</span>
              : "Niciun Shelly înregistrat"}
          </div>
        </div>
        {isAdmin() && (
          <div className="row-actions" style={{ marginLeft: "auto" }}>
            {!idShelly && (
              <button className="btn btn-ghost" style={{ width: "auto" }} onClick={onAdauga}>
                <Plus size={14} /> Adaugă Shelly
              </button>
            )}
            {idShelly && (confirmaStergere ? (
              <>
                <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>Ștergi Shelly-ul din camera tehnică?</span>
                <button
                  className="icon-btn" aria-label="Confirmă ștergerea"
                  onClick={async () => {
                    try {
                      await stergeShelly(idShelly);
                      audit.push("Șters Shelly", `Camera tehnică ${ct.nr} · ${idShelly}`);
                      await onSterge();
                    } catch (e) {
                      toaster.push(mesajEroare(e, "Nu am putut șterge Shelly-ul."), "error");
                    } finally { setConfirmaStergere(false); }
                  }}
                ><Trash2 size={14} /></button>
                <button className="btn btn-ghost" style={{ width: "auto" }} onClick={() => setConfirmaStergere(false)}>
                  Renunță
                </button>
              </>
            ) : (
              <button className="icon-btn" aria-label="Șterge Shelly-ul" onClick={() => setConfirmaStergere(true)}>
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
              ? "Adaugă ID-ul din contul Shelly ca să apară cele patru relee."
              : "Shelly-ul nu e încă înregistrat. Cere-i adminului să-l adauge."}
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
  const stare = stareaLui(dispozitiv);

  return (
    <div className="dv-row">
      {/* Iconul e o coloana a lui, inalta cat amandoua randurile de text.
          Starea releului sta in culoarea lui: verde aprins, rosu stins.
          `role="img"` cu eticheta, fiindca altfel informatia ar exista doar
          in culoare — invizibila pentru un cititor de ecran si pentru cine
          nu deosebeste rosu de verde. */}
      <span className={"dv-icon dv-icon-" + stare.cheie}
            role="img" aria-label={stare.eticheta} title={stare.titlu}>
        <Icon size={34} />
      </span>
      <div className="dv-info">
        <div className="dv-title">
          Releu {config.iesire} · {config.eticheta}
        </div>
        {/* Partajarea se citeste din numarul de camere scrise aici: doua
            nume inseamna ca releul le serveste pe amandoua, unul singur ca e
            doar al camerei alea. Eticheta „comun" de dinainte spunea acelasi
            lucru a doua oara. */}
        <div className="dv-sub"><span>{camere.join(" și ")}</span></div>
      </div>
      {!dispozitiv ? (
        <div className="dv-ctrl"><span className="dv-sub">neînregistrat</span></div>
      ) : (
        <div className="dv-ctrl">
          <button
            className={"btn " + (dispozitiv.pornit ? "btn-ghost" : "btn-primary")}
            disabled={acestaOcupat || !dispozitiv.activ}
            onClick={() => onComuta(dispozitiv, !dispozitiv.pornit)}
          >
            {acestaOcupat ? "…" : dispozitiv.pornit ? "Oprește" : "Pornește"}
          </button>
        </div>
      )}
    </div>
  );
}

/* Starea unui releu, redusa la ce are nevoie interfata: o cheie pentru
   culoarea iconului si un text pentru cine nu se uita la culoare.
   Ordinea conditiilor conteaza — „offline" bate „pornit", fiindca o stare
   veche afisata ca sigura e mai rea decat una recunoscuta ca necunoscuta. */
function stareaLui(dispozitiv) {
  if (!dispozitiv) {
    return { cheie: "necunoscut", eticheta: "Neînregistrat", titlu: "Releul nu e înregistrat" };
  }
  const cand = dispozitiv.vazutLa ? ` · verificat ${fmtDateTime(dispozitiv.vazutLa)}` : "";
  if (!dispozitiv.activ) {
    return { cheie: "necunoscut", eticheta: "Dezactivat", titlu: "Dezactivat din setări" };
  }
  if (!dispozitiv.vazutLa) {
    return { cheie: "necunoscut", eticheta: "Stare necunoscută",
             titlu: "Stare necunoscută — apasă „Actualizează starea”" };
  }
  if (!dispozitiv.online) {
    return { cheie: "offline", eticheta: "Offline", titlu: `Offline — nu răspunde${cand}` };
  }
  return dispozitiv.pornit
    ? { cheie: "on",  eticheta: "Pornit", titlu: `Pornit${cand}` }
    : { cheie: "off", eticheta: "Oprit",  titlu: `Oprit${cand}` };
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
      audit.push("Adăugat Shelly", `Camera tehnică ${ct.nr} · ${curat}`);
      toaster.push("Shelly adăugat. Verifică starea celor patru relee.");
      await onGata();
    } catch (e) {
      toaster.push(mesajEroare(e, "Nu am putut adăuga Shelly-ul."), "error");
      setSalveaza(false);
    }
  }

  return (
    <Dialog title={`Adaugă Shelly · Camera tehnică ${ct.nr}`} onClose={onClose}>
      <div className="note">
        ID-ul se ia din aplicația Shelly: deschide dispozitivul → Settings → Device information →
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
        Se vor crea cele patru relee, în ordinea de pe dispozitiv:
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {CANALE.map((c) => (
            <li key={c.canal}>
              <strong>Releu {c.iesire}</strong> · {c.eticheta} —{" "}
              {c.ambele ? `${nume.join(" și ")} (comun)` : nume[c.indexCamera]}
            </li>
          ))}
        </ul>
      </div>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Renunță</button>
        <button className="btn btn-primary" disabled={!curat || duplicat || salveaza} onClick={salveaza_}>
          {salveaza ? "Se adaugă…" : "Adaugă Shelly-ul"}
        </button>
      </div>
    </Dialog>
  );
}
