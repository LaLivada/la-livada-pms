/* Motorul de rezervări directe.
 *
 * Mașina de stări, explicit:
 *
 *   cautare ──► rezultate ──► date ──► trimitere ──┬─► confirmat
 *                   ▲                              │
 *                   └────────── conflict ◄─────────┘
 *
 * Regula de fond: disponibilitatea și prețul afișate aici sunt
 * INFORMATIVE. Nimic nu se decide în browser — verificarea reală se face
 * atomic în PostgreSQL, în momentul creării. Dacă între căutare și
 * confirmare camera s-a ocupat, utilizatorul primește un mesaj clar și se
 * întoarce la rezultate, nu o „eroare de server".
 *
 * FOLOSIRE. Componenta e de sine stătătoare și nu depinde de nimic din
 * PMS. Merge în două feluri:
 *
 *   · ca aplicație proprie — vezi booking/index.html, build separat;
 *   · importată direct într-un alt site React:
 *
 *       import MotorRezervari from ".../src/booking/App.jsx";
 *       <MotorRezervari valoriInitiale={{ adulti: 2 }} />
 *
 * Fără `valoriInitiale`, citește parametrii din adresă
 * (?checkin=…&checkout=…&adults=…&children=…), ca să poată fi lansată
 * dintr-un formular scurt aflat pe altă pagină.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  cautaDisponibilitate, creeazaRezervare, citesteRezervare, citesteCapacitatea,
  anuleazaRezervare, trimiteEmailConfirmare, COD_INDISPONIBIL,
} from "./api.js";
import { STILURI } from "./styles.js";
import { JUDETE, TARI, PREFIXE_TELEFON, PREFIX_IMPLICIT, telefonInternational } from "./nomenclatoare.js";

/* Aceleași denumiri ca în PMS (vezi ROOM_TYPES din pms-app.jsx), ca
   recepția și clientul să vorbească despre același lucru. */
const ETICHETE_TIP = {
  tiny: "Tiny house",
  loft: "Loft",
  /* Serverul intoarce "mixt" cand grupul nu incape intr-un singur tip si
     foloseste camere din amandoua — cazul grupurilor mari. */
  mixt: "Camere mixte",
};
const numeTip = (t) => ETICHETE_TIP[t] || t;

const azi = () => new Date().toISOString().slice(0, 10);
const peste = (zile) => {
  const d = new Date();
  d.setDate(d.getDate() + zile);
  return d.toISOString().slice(0, 10);
};
/* Aritmetica pe zile calendaristice, în UTC, pe „YYYY-MM-DD".
   În fus local o zi are 23 sau 25 de ore la schimbarea orei, deci
   scăderea a două date dă 2,96 sau 3,04 zile în loc de 3. Rotunjirea
   ascunde asta la sejururi scurte, dar e o proprietate a lui `round`,
   nu a calculului. În UTC ziua are mereu 86.400.000 ms, iar `setUTCDate`
   trece corect peste luni și ani bisecți — deci nu ne mai bazăm pe noroc. */
const adunaZile = (zi, n) => {
  const d = new Date(`${zi}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const noptiIntre = (a, b) =>
  Math.max(0, Math.round(
    (new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000));

const fmtData = (iso) =>
  new Date(iso).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
const fmtBani = (n) => new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(n) + " lei";

/* Datele din formular sunt zile calendaristice; le trimitem cu orele de
   check-in/check-out ale pensiunii, ca intervalul să fie cel real. */
const laSosire = (zi) => new Date(`${zi}T14:00:00`).toISOString();
const laPlecare = (zi) => new Date(`${zi}T11:00:00`).toISOString();

export default function App({ valoriInitiale }) {
  const params = new URLSearchParams(window.location.search);

  /* Ordinea surselor: ce primește componenta prin props, apoi ce vine din
     adresă (un formular de căutare aflat pe altă pagină poate trimite
     aici perioada deja aleasă), apoi valorile implicite. */
  const [cautare, setCautare] = useState(() => ({
    checkin: valoriInitiale?.checkin || params.get("checkin") || peste(1),
    checkout: valoriInitiale?.checkout || params.get("checkout") || peste(3),
    adulti: valoriInitiale?.adulti || Number(params.get("adults")) || 2,
    copii: valoriInitiale?.copii ?? (Number(params.get("children")) || 0),
  }));

  const [stare, setStare] = useState("cautare");
  const [rezultate, setRezultate] = useState(null);
  /* Tipul de cameră ales dintre propunerile serverului. Nu mai numărăm noi
     camere: serverul spune de câte e nevoie pentru grup și cu ce ocupare. */
  const [optiuneAleasa, setOptiuneAleasa] = useState(null);
  /* Plafoanele fizice ale pensiunii, citite o dată la deschidere. Fără ele
     formularul ar oferi valori imposibile — până acum oferea 4 adulți, deși
     cea mai mare cameră are 3 locuri, deci căutarea întorcea gol de fiecare
     dată. `null` cât timp nu au sosit: selectoarele rămân la minimul sigur. */
  const [capacitate, setCapacitate] = useState(null);
  const [eroare, setEroare] = useState("");
  const [oaspete, setOaspete] = useState({
    nume: "", prenume: "", prefix: PREFIX_IMPLICIT, telefon: "", email: "",
    oras: "", judet: "Cluj", tara: "România",
  });
  const [cerinte, setCerinte] = useState("");
  const [confirmare, setConfirmare] = useState(null);
  /* Ecranul de anulare se deschide din linkul din email
     (?token=…&anulare=1). Butonul din email NU anulează — deschide
     această pagină, unde utilizatorul confirmă. Multe clienți de email
     preîncarcă linkurile din mesaj; un link care anulează direct ar
     șterge rezervări de unul singur. */
  const [cereAnulare, setCereAnulare] = useState(false);
  const [anuleazaAcum, setAnuleazaAcum] = useState(false);

  /* Cheia de idempotență se generează O SINGURĂ DATĂ per intenție de
     rezervare. Dacă s-ar regenera la fiecare click pe „Trimite", un retry
     ar avea altă cheie și ar crea a doua rezervare — exact ce trebuie
     evitat. Se reînnoiește doar când utilizatorul pornește o căutare nouă. */
  const [cheie, setCheie] = useState(() => crypto.randomUUID());

  /* Pagina de confirmare: /?token=… — deschisă din emailul de confirmare
     sau salvată de client. */
  useEffect(() => {
    const token = params.get("token");
    if (!token) return;
    setStare("incarca-confirmare");
    citesteRezervare(token)
      .then((d) => {
        if (!d) { setEroare("Rezervarea nu a fost găsită."); setStare("cautare"); return; }
        setConfirmare({ ...d, publicToken: token });
        setCereAnulare(params.get("anulare") === "1" && d.canCancel);
        setStare("confirmat");
      })
      .catch((e) => { setEroare(e.message); setStare("cautare"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Dacă perioada a venit deja din adresă, sărim peste primul pas și
     căutăm direct — vizitatorul a ales-o deja în altă parte. */
  useEffect(() => {
    if (params.get("checkin") && params.get("checkout") && !params.get("token")) {
      cauta();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Plafoanele se cer o data, la deschidere. Daca apelul esueaza, ramanem
     pe valori minime sigure — mai bine un formular restrans decat unul care
     promite ce nu poate livra. */
  useEffect(() => {
    citesteCapacitatea()
      .then((d) => d && setCapacitate(d))
      .catch(() => { /* selectoarele raman la minimul implicit */ });
  }, []);

  /* La trecerea la un pas nou, browserul păstrează poziția de scroll de la
     pasul anterior — dacă cineva alege o cameră derulat jos în „Camerele",
     ajunge pe „Datele tale" tot jos, sub primele câmpuri, nu la începutul
     cardului. Aducem cardul la vedere la fiecare schimbare de pas, dar nu
     și la montare (`intaiRandare`), ca pagina să nu sară singură la deschidere. */
  const intaiRandare = useRef(true);
  useEffect(() => {
    if (intaiRandare.current) { intaiRandare.current = false; return; }
    document.querySelector(".ldv")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [stare]);

  const maxPers  = Number(capacitate?.maxGuests) || 2;
  const maxCopii = Math.max(0, maxPers - cautare.adulti);

  /* Adultii si copiii sunt legati: impreuna nu pot depasi grupul maxim.
     Cand cresc adultii, copiii se strang automat, ca suma sa ramana
     valida fara ca omul sa fie certat pentru o combinatie pe care i-am
     lasat-o noi la indemana. */
  const schimbaAdulti = (n) => setCautare((c) => ({
    ...c, adulti: n, copii: Math.min(c.copii, Math.max(0, maxPers - n)),
  }));

  const nopti = useMemo(
    () => noptiIntre(cautare.checkin, cautare.checkout),
    [cautare.checkin, cautare.checkout]);

  /* Perioada are trei câmpuri care descriu același lucru: sosire, plecare
     și număr de nopți. Ca să nu se contrazică, plecarea e mereu cea
     calculată — schimbi sosirea sau nopțile, plecarea se mută după ele.
     Invers merge la fel: alegi plecarea, se recalculează nopțile. */
  const schimbaSosirea = (zi) => setCautare((c) => ({
    ...c,
    checkin: zi,
    // Păstrăm durata aleasă. Fără `max(1,…)`, o plecare rămasă în urma
    // sosirii ar da zero nopți și butonul de căutare ar sta blocat.
    checkout: adunaZile(zi, Math.max(1, noptiIntre(c.checkin, c.checkout))),
  }));

  const schimbaPlecarea = (zi) => setCautare((c) => ({
    ...c,
    checkout: noptiIntre(c.checkin, zi) >= 1 ? zi : adunaZile(c.checkin, 1),
  }));

  const schimbaNoptile = (n) => setCautare((c) => ({
    ...c, checkout: adunaZile(c.checkin, n),
  }));

  /* 1–14 nopți acoperă practic tot. Dacă cineva a ales din calendar un
     sejur mai lung, îl adăugăm în listă ca selectorul să nu apară gol. */
  const optiuniNopti = useMemo(() => {
    const baza = Array.from({ length: 14 }, (_, i) => i + 1);
    return nopti > 14 ? [...baza, nopti] : baza;
  }, [nopti]);

  async function cauta() {
    setEroare("");
    setStare("caut");
    setOptiuneAleasa(null);
    setCheie(crypto.randomUUID());   // intenție nouă, cheie nouă
    try {
      const d = await cautaDisponibilitate({
        checkin: laSosire(cautare.checkin),
        checkout: laPlecare(cautare.checkout),
        adulti: cautare.adulti,
        copii: cautare.copii,
      });
      if (d?.error) { setEroare(d.error); setStare("cautare"); return; }
      setRezultate(d);
      setStare("rezultate");
    } catch (e) {
      setEroare(e.message);
      setStare("cautare");
    }
  }

  /* Nu mai numaram noi camere. Serverul intoarce, pentru fiecare tip care
     poate gazdui grupul, o propunere completa; noi alegem una dintre ele. */
  const optiune = useMemo(
    () => rezultate?.options?.find((o) => o.roomType === optiuneAleasa) || null,
    [rezultate, optiuneAleasa]);
  const totalCamere  = Number(optiune?.roomsNeeded) || 0;
  const totalEstimat = Number(optiune?.total) || 0;

  /* Prefixul scris de mana trebuie sa arate a prefix, iar numarul sa aiba
     destule cifre cat sa fie un numar — altfel rezervarea ajunge in PMS cu
     un telefon la care nu raspunde nimeni. Sase cifre e minimul: numerele
     nationale cele mai scurte din lume au atat. */
  const prefixCunoscut = PREFIXE_TELEFON.some((p) => p.cod === oaspete.prefix);
  const prefixValid = /^\+\d{1,4}$/.test(oaspete.prefix.trim());
  const numarValid = oaspete.telefon.replace(/\D/g, "").length >= 6;
  const dateValide =
    oaspete.nume.trim() && oaspete.prenume.trim() &&
    prefixValid && numarValid && oaspete.oras.trim();

  async function trimite() {
    setEroare("");
    setStare("trimitere");
    /* Fiecare cameră aleasă devine o intrare separată, cu ocuparea cerută.
       Serverul alege camera fizică — noi nu trimitem niciun room_id. */
    /* Exact lista propusa de server, cu ocuparea calculata de el. Nu
       recompunem nimic aici: orice diferenta ar fi o a doua parere despre
       cine sta unde. Camera fizica o alege tot serverul, la creare. */
    const camere = (optiune?.rooms || []).map((r) => ({
      roomType: r.roomType, adults: r.adults, children: r.children,
    }));
    try {
      const d = await creeazaRezervare({
        cheieIdempotenta: cheie,
        checkin: laSosire(cautare.checkin),
        checkout: laPlecare(cautare.checkout),
        camere, oaspete, cerinte,
      });
      setConfirmare({
        confirmationNumber: d.confirmationNumber,
        checkIn: laSosire(cautare.checkin),
        checkOut: laPlecare(cautare.checkout),
        rooms: d.rooms, total: d.total, status: d.status,
        guestName: `${oaspete.prenume} ${oaspete.nume}`.trim(),
        publicToken: d.publicToken,
        canCancel: true,
      });
      setStare("confirmat");
      /* Emailul se cere DUPĂ ce rezervarea există. Nu îl așteptăm și nu
         îi verificăm rezultatul: dacă eșuează, rezervarea rămâne validă,
         iar clientul are numărul pe ecran. */
      if (oaspete.email?.trim()) trimiteEmailConfirmare(d.publicToken);
    } catch (e) {
      if (e.cod === COD_INDISPONIBIL) {
        /* Nu e o defecțiune — între căutare și confirmare s-a ocupat
           camera. Îl ducem înapoi la rezultate, cu disponibilitatea
           reîmprospătată. */
        setEroare("Între timp camera s-a ocupat. Am actualizat disponibilitatea — alege din nou sau schimbă datele.");
        await cauta();
        setStare("rezultate");
        return;
      }
      setEroare(e.message);
      setStare("date");
    }
  }

  async function confirmaAnularea() {
    setEroare("");
    setAnuleazaAcum(true);
    try {
      await anuleazaRezervare(confirmare.publicToken);
      setConfirmare((c) => ({ ...c, status: "cancelled", canCancel: false }));
      setCereAnulare(false);
    } catch (e) {
      setEroare(e.message);
    } finally {
      setAnuleazaAcum(false);
    }
  }

  const pasCurent = stare === "caut" ? "cautare"
    : stare === "trimitere" ? "date" : stare;

  return (
    <div className="ldv">
      <style>{STILURI}</style>

      {stare !== "incarca-confirmare" && (
        <div className="ldv-pasi" aria-hidden="true">
          {[["cautare", "Perioada"], ["rezultate", "Camerele"],
            ["date", "Datele tale"], ["confirmat", "Gata"]].map(([cheiePas, eticheta]) => (
            <span key={cheiePas}
              className={pasCurent === cheiePas ? "ldv-pas-activ" : undefined}>
              {eticheta}
            </span>
          ))}
        </div>
      )}

      {eroare && (
        <div className="ldv-alerta ldv-alerta-eroare" role="alert">{eroare}</div>
      )}

      {stare === "incarca-confirmare" && (
        <div className="ldv-card"><div className="ldv-gol">Se încarcă rezervarea…</div></div>
      )}

      {/* ---------------- CĂUTARE ---------------- */}
      {(stare === "cautare" || stare === "caut" || stare === "rezultate") && (
        <div className="ldv-card">
          <h2>Verifică disponibilitatea</h2>
          <p className="ldv-sub">
            {nopti > 0
              ? `${nopti} ${nopti === 1 ? "noapte" : "nopți"} · sosire de la ora 14, plecare până la 11`
              : "Alege perioada sejurului"}
          </p>
          <div className="ldv-randuri">
            <div className="ldv-rand-3">
              <label className="ldv-camp">
                <span>Sosire</span>
                <input type="date" value={cautare.checkin} min={azi()}
                  onChange={(e) => e.target.value && schimbaSosirea(e.target.value)} />
              </label>
              <label className="ldv-camp">
                <span>Nopți</span>
                <select value={nopti}
                  onChange={(e) => schimbaNoptile(Number(e.target.value))}>
                  {optiuniNopti.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="ldv-camp">
                <span>Plecare</span>
                {/* Minimul e ziua de după sosire: o plecare în aceeași zi
                    ar însemna zero nopți, deci nimic de rezervat. */}
                <input type="date" value={cautare.checkout}
                  min={adunaZile(cautare.checkin || azi(), 1)}
                  onChange={(e) => e.target.value && schimbaPlecarea(e.target.value)} />
              </label>
            </div>
            <div className="ldv-rand-2">
              <label className="ldv-camp">
                <span>Adulți</span>
                <select value={cautare.adulti}
                  onChange={(e) => schimbaAdulti(Number(e.target.value))}>
                  {Array.from({ length: maxPers }, (_, i) => i + 1)
                    .map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="ldv-camp">
                <span>Copii</span>
                <select value={cautare.copii}
                  onChange={(e) => setCautare((c) => ({ ...c, copii: Number(e.target.value) }))}>
                  {Array.from({ length: maxCopii + 1 }, (_, i) => i)
                    .map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="ldv-actiuni">
            <button className="ldv-btn ldv-btn-principal ldv-creste"
              onClick={cauta} disabled={stare === "caut" || nopti < 1}>
              {stare === "caut" ? "Verific disponibilitatea…" : "Caută camere"}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- REZULTATE ---------------- */}
      {stare === "rezultate" && rezultate && (
        <div className="ldv-card">
          <h2>Camere disponibile</h2>
          <p className="ldv-sub">
            {fmtData(cautare.checkin)} → {fmtData(cautare.checkout)} ·{" "}
            {cautare.adulti} {cautare.adulti === 1 ? "adult" : "adulți"}
            {cautare.copii > 0 && ` · ${cautare.copii} ${cautare.copii === 1 ? "copil" : "copii"}`}
          </p>

          {!rezultate.options?.length ? (
            <div className="ldv-gol">
              <p><strong>{rezultate.error || "Nicio cameră liberă în perioada aleasă."}</strong></p>
              <p className="ldv-mic">Încearcă alte date sau sună-ne — poate găsim o soluție.</p>
            </div>
          ) : (
            <>
              {/* Fiecare opțiune e o cazare completă pentru tot grupul, nu o
                  cameră singură. Se alege una — repartizarea o face serverul. */}
              {rezultate.options.map((o) => {
                const ales = optiuneAleasa === o.roomType;
                return (
                  <button type="button" key={o.roomType}
                    className={`ldv-tip ldv-optiune${ales ? " ldv-optiune-aleasa" : ""}`}
                    aria-pressed={ales}
                    onClick={() => setOptiuneAleasa(o.roomType)}>
                    <div className="ldv-tip-info">
                      <h3>{numeTip(o.roomType)}</h3>
                      <div className="ldv-mic">
                        {o.roomsNeeded} {o.roomsNeeded === 1 ? "cameră" : "camere"}
                        {o.roomType === "mixt" && " · " + Object.entries(
                          o.rooms.reduce((a, r) => ({ ...a, [r.roomType]: (a[r.roomType] || 0) + 1 }), {}))
                          .map(([t, n]) => `${n} × ${numeTip(t)}`).join(" + ")}
                        {o.roomsNeeded > 1 && " · " + o.rooms
                          .map((r) => r.adults + r.children)
                          .join("+") + " persoane"}
                      </div>
                    </div>
                    <div className="ldv-pret">
                      {fmtBani(o.total)}
                      <small>{nopti} {nopti === 1 ? "noapte" : "nopți"}, total</small>
                    </div>
                  </button>
                );
              })}

              {optiune && (
                <div className="ldv-sumar" style={{ marginTop: 16 }}>
                  {optiune.rooms.map((r, i) => (
                    <div className="ldv-sumar-linie" key={i}>
                      <span>{numeTip(r.roomType)} {optiune.roomsNeeded > 1 && `#${i + 1}`}</span>
                      <span>
                        {r.adults} {r.adults === 1 ? "adult" : "adulți"}
                        {r.children > 0 && ` · ${r.children} ${r.children === 1 ? "copil" : "copii"}`}
                      </span>
                    </div>
                  ))}
                  <div className="ldv-sumar-linie ldv-sumar-total">
                    <span>Total estimat</span><span>{fmtBani(totalEstimat)}</span>
                  </div>
                </div>
              )}

              <div className="ldv-actiuni">
                <button className="ldv-btn ldv-btn-principal ldv-creste"
                  onClick={() => { setEroare(""); setStare("date"); }}
                  disabled={!optiune}>
                  {!optiune ? "Alege o variantă" : "Continuă"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------- DATELE CLIENTULUI ---------------- */}
      {(stare === "date" || stare === "trimitere") && (
        <div className="ldv-card">
          <h2>Datele tale</h2>
          <p className="ldv-sub">Îți trimitem confirmarea și te contactăm doar pentru rezervare.</p>

          <div className="ldv-sumar">
            <div className="ldv-sumar-linie">
              <span>Perioada</span>
              <span>{fmtData(cautare.checkin)} → {fmtData(cautare.checkout)}</span>
            </div>
            <div className="ldv-sumar-linie">
              <span>{numeTip(optiune?.roomType)} × {totalCamere}</span>
              <span>{cautare.adulti} {cautare.adulti === 1 ? "adult" : "adulți"}
                {cautare.copii > 0 && ` · ${cautare.copii} ${cautare.copii === 1 ? "copil" : "copii"}`}</span>
            </div>
            <div className="ldv-sumar-linie ldv-sumar-total">
              <span>Total estimat</span><span>{fmtBani(totalEstimat)}</span>
            </div>
          </div>

          <div className="ldv-randuri">
            <div className="ldv-rand-2">
              <label className="ldv-camp">
                <span>Nume *</span>
                <input value={oaspete.nume} autoComplete="family-name" maxLength={100}
                  onChange={(e) => setOaspete((o) => ({ ...o, nume: e.target.value }))} />
              </label>
              <label className="ldv-camp">
                <span>Prenume *</span>
                <input value={oaspete.prenume} autoComplete="given-name" maxLength={100}
                  onChange={(e) => setOaspete((o) => ({ ...o, prenume: e.target.value }))} />
              </label>
            </div>
            <div className="ldv-rand-2">
              {/* Nu e <label>, ci <div>: un label care cuprinde mai multe
                  controale nu spune caruia dintre ele ii apartine, deci
                  fiecare isi poarta propriul aria-label. */}
              <div className="ldv-camp">
                <span>Telefon *</span>
                <div className={`ldv-tel${prefixCunoscut ? "" : " ldv-tel-3"}`}>
                  <select className="ldv-tel-prefix" aria-label="Prefix internațional"
                    autoComplete="tel-country-code"
                    value={prefixCunoscut ? oaspete.prefix : "alt"}
                    onChange={(e) => setOaspete((o) => ({
                      ...o,
                      /* „Alt prefix" nu e un prefix: lasa campul gol, cu
                         plusul deja scris, ca omul sa continue de acolo. */
                      prefix: e.target.value === "alt" ? "+" : e.target.value,
                    }))}>
                    {/* Codul primul: caseta inchisa e ingusta si taie
                        sfarsitul etichetei, iar codul e partea care conteaza
                        cand te uiti la ce ai ales. Numele tarii ramane
                        vizibil intreg in lista deschisa. */}
                    {PREFIXE_TELEFON.map((p) => (
                      <option key={p.tara} value={p.cod}>{p.cod} {p.tara}</option>
                    ))}
                    <option value="alt">Alt prefix…</option>
                  </select>
                  {!prefixCunoscut && (
                    <input className="ldv-tel-alt" value={oaspete.prefix} inputMode="tel"
                      maxLength={5} aria-label="Prefixul țării" placeholder="+___"
                      onChange={(e) => setOaspete((o) => ({ ...o, prefix: e.target.value }))} />
                  )}
                  <input type="tel" className="ldv-tel-numar" value={oaspete.telefon}
                    autoComplete="tel-national" inputMode="tel" maxLength={20}
                    aria-label="Numărul de telefon" placeholder="722 123 456"
                    onChange={(e) => setOaspete((o) => ({ ...o, telefon: e.target.value }))} />
                </div>
              </div>
              <label className="ldv-camp">
                <span>Email</span>
                <input type="email" value={oaspete.email} autoComplete="email" maxLength={200}
                  onChange={(e) => setOaspete((o) => ({ ...o, email: e.target.value }))} />
              </label>
            </div>
            <div className="ldv-rand-3">
              <label className="ldv-camp">
                <span>Localitate *</span>
                <input value={oaspete.oras} autoComplete="address-level2" maxLength={100}
                  onChange={(e) => setOaspete((o) => ({ ...o, oras: e.target.value }))} />
              </label>
              <label className="ldv-camp">
                <span>Județ</span>
                <select value={oaspete.judet}
                  onChange={(e) => setOaspete((o) => ({ ...o, judet: e.target.value }))}>
                  {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
              </label>
              <label className="ldv-camp">
                <span>Țara</span>
                <select value={oaspete.tara}
                  onChange={(e) => setOaspete((o) => ({ ...o, tara: e.target.value }))}>
                  {TARI.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <label className="ldv-camp">
              <span>Cerințe speciale</span>
              <textarea value={cerinte} maxLength={2000} placeholder="ex. sosire după ora 22, pat suplimentar"
                onChange={(e) => setCerinte(e.target.value)} />
            </label>
          </div>

          <div className="ldv-actiuni">
            <button className="ldv-btn ldv-btn-simplu"
              onClick={() => { setEroare(""); setStare("rezultate"); }}
              disabled={stare === "trimitere"}>Înapoi</button>
            <button className="ldv-btn ldv-btn-principal ldv-creste"
              onClick={trimite} disabled={!dateValide || stare === "trimitere"}>
              {stare === "trimitere" ? "Se trimite…" : "Trimite rezervarea"}
            </button>
          </div>
          <p className="ldv-mic" style={{ marginTop: 12 }}>
            Prețul final se confirmă de noi la trimitere. Nu se cere plată online.
          </p>
        </div>
      )}

      {/* ---------------- CONFIRMARE ---------------- */}
      {stare === "confirmat" && confirmare && (
        <div className="ldv-card">
          <div className="ldv-confirmare">
            <h2>{confirmare.status === "cancelled"
              ? "Rezervarea a fost anulată"
              : "Rezervarea e înregistrată"}</h2>
            <div className="ldv-numar-confirmare">{confirmare.confirmationNumber}</div>
            <p className="ldv-mic">Notează numărul — îl folosim când ne suni.</p>
          </div>

          <div className="ldv-sumar" style={{ marginTop: 16 }}>
            {confirmare.guestName && (
              <div className="ldv-sumar-linie"><span>Pe numele</span><span>{confirmare.guestName}</span></div>
            )}
            <div className="ldv-sumar-linie">
              <span>Perioada</span>
              <span>{fmtData(confirmare.checkIn)} → {fmtData(confirmare.checkOut)}</span>
            </div>
            <div className="ldv-sumar-linie">
              <span>Camere</span><span>{confirmare.rooms}</span>
            </div>
            <div className="ldv-sumar-linie ldv-sumar-total">
              <span>Total</span><span>{fmtBani(confirmare.total)}</span>
            </div>
          </div>

          {confirmare.status === "cancelled" ? (
            <div className="ldv-alerta ldv-alerta-info" style={{ marginTop: 4 }}>
              Camerele au fost eliberate. Dacă a fost o greșeală, sună-ne —
              putem verifica dacă mai sunt disponibile.
            </div>
          ) : (
            <div className="ldv-alerta ldv-alerta-info" style={{ marginTop: 4 }}>
              Te contactăm telefonic pentru confirmare. Plata se face la sosire.
            </div>
          )}

          {/* Pasul de confirmare al anulării. Butonul din email duce aici,
              nu direct la anulare — vezi comentariul de la `cereAnulare`. */}
          {cereAnulare && confirmare.status !== "cancelled" && (
            <div className="ldv-alerta ldv-alerta-eroare" style={{ marginTop: 4 }}>
              <strong>Sigur anulezi rezervarea?</strong>
              <p style={{ margin: "6px 0 0" }}>
                Camerele se eliberează imediat și s-ar putea să nu mai fie
                disponibile dacă te răzgândești. Anularea e gratuită.
              </p>
              <div className="ldv-actiuni">
                <button className="ldv-btn ldv-btn-simplu"
                  onClick={() => setCereAnulare(false)} disabled={anuleazaAcum}>
                  Nu, păstrez rezervarea
                </button>
                <button className="ldv-btn ldv-btn-principal"
                  onClick={confirmaAnularea} disabled={anuleazaAcum}>
                  {anuleazaAcum ? "Se anulează…" : "Da, anulează"}
                </button>
              </div>
            </div>
          )}

          {!cereAnulare && confirmare.canCancel && (
            <div className="ldv-actiuni">
              <button className="ldv-btn ldv-btn-simplu"
                onClick={() => setCereAnulare(true)}>
                Anulează rezervarea
              </button>
            </div>
          )}

          {confirmare.publicToken && confirmare.status !== "cancelled" && (
            <p className="ldv-mic">
              Poți revedea sau anula rezervarea oricând la{" "}
              <a href={`?token=${confirmare.publicToken}`}>acest link</a> — păstrează-l.
              Ți l-am trimis și pe email.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
