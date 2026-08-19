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
import { useEffect, useMemo, useState } from "react";
import {
  cautaDisponibilitate, creeazaRezervare, citesteRezervare,
  anuleazaRezervare, trimiteEmailConfirmare, COD_INDISPONIBIL,
} from "./api.js";
import { STILURI } from "./styles.js";
import { JUDETE, TARI } from "./nomenclatoare.js";

const ETICHETE_TIP = { tiny: "Căsuță Tiny", loft: "Loft" };
const numeTip = (t) => ETICHETE_TIP[t] || t;

const azi = () => new Date().toISOString().slice(0, 10);
const peste = (zile) => {
  const d = new Date();
  d.setDate(d.getDate() + zile);
  return d.toISOString().slice(0, 10);
};
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
  const [selectie, setSelectie] = useState({});
  const [eroare, setEroare] = useState("");
  const [oaspete, setOaspete] = useState({
    nume: "", prenume: "", telefon: "", email: "",
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

  const nopti = useMemo(() => {
    const a = new Date(cautare.checkin), b = new Date(cautare.checkout);
    return Math.max(0, Math.round((b - a) / 86400000));
  }, [cautare.checkin, cautare.checkout]);

  async function cauta() {
    setEroare("");
    setStare("caut");
    setSelectie({});
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

  const camereAlese = useMemo(
    () => Object.entries(selectie).filter(([, n]) => n > 0),
    [selectie]);
  const totalCamere = camereAlese.reduce((s, [, n]) => s + n, 0);
  const totalEstimat = camereAlese.reduce((s, [tip, n]) => {
    const t = rezultate?.roomTypes?.find((x) => x.roomType === tip);
    return s + (t ? Number(t.price) * n : 0);
  }, 0);

  function schimbaNumar(tip, delta, maxim) {
    setSelectie((s) => {
      const acum = s[tip] || 0;
      const nou = Math.min(Math.max(0, acum + delta), Math.min(maxim, 5));
      return { ...s, [tip]: nou };
    });
  }

  const dateValide =
    oaspete.nume.trim() && oaspete.prenume.trim() && oaspete.telefon.trim() &&
    oaspete.oras.trim();

  async function trimite() {
    setEroare("");
    setStare("trimitere");
    /* Fiecare cameră aleasă devine o intrare separată, cu ocuparea cerută.
       Serverul alege camera fizică — noi nu trimitem niciun room_id. */
    const camere = camereAlese.flatMap(([tip, n]) =>
      Array.from({ length: n }, () => ({
        roomType: tip, adults: cautare.adulti, children: cautare.copii,
      })));
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
            <div className="ldv-rand-2">
              <label className="ldv-camp">
                <span>Sosire</span>
                <input type="date" value={cautare.checkin} min={azi()}
                  onChange={(e) => setCautare((c) => ({ ...c, checkin: e.target.value }))} />
              </label>
              <label className="ldv-camp">
                <span>Plecare</span>
                <input type="date" value={cautare.checkout} min={cautare.checkin || azi()}
                  onChange={(e) => setCautare((c) => ({ ...c, checkout: e.target.value }))} />
              </label>
            </div>
            <div className="ldv-rand-2">
              <label className="ldv-camp">
                <span>Adulți</span>
                <select value={cautare.adulti}
                  onChange={(e) => setCautare((c) => ({ ...c, adulti: Number(e.target.value) }))}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="ldv-camp">
                <span>Copii</span>
                <select value={cautare.copii}
                  onChange={(e) => setCautare((c) => ({ ...c, copii: Number(e.target.value) }))}>
                  {[0, 1, 2].map((n) => <option key={n} value={n}>{n}</option>)}
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

          {!rezultate.roomTypes?.length ? (
            <div className="ldv-gol">
              <p><strong>Nicio cameră liberă în perioada aleasă.</strong></p>
              <p className="ldv-mic">Încearcă alte date sau sună-ne — poate găsim o soluție.</p>
            </div>
          ) : (
            <>
              {rezultate.roomTypes.map((t) => (
                <div className="ldv-tip" key={t.roomType}>
                  <div className="ldv-tip-info">
                    <h3>{numeTip(t.roomType)}</h3>
                    <div className="ldv-mic">
                      {t.available} {t.available === 1 ? "disponibilă" : "disponibile"} ·
                      până la {t.maxGuests} {t.maxGuests === 1 ? "persoană" : "persoane"}
                    </div>
                  </div>
                  <div className="ldv-pret">
                    {fmtBani(t.price)}
                    <small>{nopti} {nopti === 1 ? "noapte" : "nopți"}, total</small>
                  </div>
                  <div className="ldv-numar">
                    <button type="button" aria-label={`Mai puține camere ${numeTip(t.roomType)}`}
                      onClick={() => schimbaNumar(t.roomType, -1, t.available)}
                      disabled={!selectie[t.roomType]}>−</button>
                    <span>{selectie[t.roomType] || 0}</span>
                    <button type="button" aria-label={`Mai multe camere ${numeTip(t.roomType)}`}
                      onClick={() => schimbaNumar(t.roomType, +1, t.available)}
                      disabled={(selectie[t.roomType] || 0) >= Math.min(t.available, 5)}>+</button>
                  </div>
                </div>
              ))}

              {totalCamere > 0 && (
                <div className="ldv-sumar" style={{ marginTop: 16 }}>
                  <div className="ldv-sumar-linie">
                    <span>{totalCamere} {totalCamere === 1 ? "cameră" : "camere"} · {nopti} {nopti === 1 ? "noapte" : "nopți"}</span>
                  </div>
                  <div className="ldv-sumar-linie ldv-sumar-total">
                    <span>Total estimat</span><span>{fmtBani(totalEstimat)}</span>
                  </div>
                </div>
              )}

              <div className="ldv-actiuni">
                <button className="ldv-btn ldv-btn-principal ldv-creste"
                  onClick={() => { setEroare(""); setStare("date"); }}
                  disabled={totalCamere === 0}>
                  {totalCamere === 0 ? "Alege cel puțin o cameră" : "Continuă"}
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
            {camereAlese.map(([tip, n]) => (
              <div className="ldv-sumar-linie" key={tip}>
                <span>{numeTip(tip)} × {n}</span>
                <span>{fmtBani((rezultate?.roomTypes?.find((x) => x.roomType === tip)?.price || 0) * n)}</span>
              </div>
            ))}
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
              <label className="ldv-camp">
                <span>Telefon *</span>
                <input type="tel" value={oaspete.telefon} autoComplete="tel" maxLength={40}
                  onChange={(e) => setOaspete((o) => ({ ...o, telefon: e.target.value }))} />
              </label>
              <label className="ldv-camp">
                <span>Email</span>
                <input type="email" value={oaspete.email} autoComplete="email" maxLength={200}
                  onChange={(e) => setOaspete((o) => ({ ...o, email: e.target.value }))} />
              </label>
            </div>
            <div className="ldv-rand-3">
              <label className="ldv-camp">
                <span>Oraș *</span>
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
