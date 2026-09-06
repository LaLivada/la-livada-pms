/* Pagina oaspetelui: sejurul, codul de acces si meniul de minibar.
 *
 * Autentificarea e linkul insusi. Nu exista cont, nu exista parola, iar
 * fereastra de valabilitate NU se tine aici: serverul refuza codul in afara
 * sejurului, deci un link expirat nu intoarce date pe care interfata sa le
 * ascunda — nu le intoarce deloc. Tot ce face fisierul asta cu motivul
 * refuzului e sa-l traduca in ceva ce omul poate citi.
 *
 * Deschiderea usii de la distanta vine la pasul urmator (docs/guest-app.md
 * pasul 4). Pana atunci pagina nu arata niciun buton de usa: unul care nu
 * deschide nimic e mai rau decat niciunul, mai ales in fata usii.
 */
import { useEffect, useState } from "react";
import { citesteSejurul, citesteCodulDeAcces, citesteMinibarul } from "./api.js";

const TELEFON = "+40722899899";
const TELEFON_SCRIS = "+40 722 899 899";

/* Codul se ia din fragment, nu din calea adresei.
 *
 * Linkul dat oaspetelui e lalivada.ro/guest/Ajh6k; hostingul obisnuit il
 * redirectioneaza aici, mutand codul in fragment. Fragmentul nu se trimite
 * niciodata serverului, deci codul nu ajunge in logurile de acces ale
 * Vercel. Calea ramane citita ca rezerva, pentru cine nimereste direct pe
 * subdomeniu cu adresa scrisa de mana. */
function codDinAdresa() {
  const dinFragment = window.location.hash.replace(/^#/, "").trim();
  if (dinFragment) return dinFragment;
  return window.location.pathname.split("/").filter(Boolean).pop() || "";
}

const FMT_ZI = new Intl.DateTimeFormat("ro-RO", {
  weekday: "long", day: "numeric", month: "long",
});
const FMT_ORA = new Intl.DateTimeFormat("ro-RO", { hour: "2-digit", minute: "2-digit" });

const ziSiOra = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return `${FMT_ZI.format(d)}, ${FMT_ORA.format(d)}`;
};

const pret = (n) => `${Number(n || 0).toLocaleString("ro-RO", {
  minimumFractionDigits: 0, maximumFractionDigits: 2,
})} lei`;

const TIP = { tiny: "Tiny house", loft: "Loft" };

/* Fiecare motiv de refuz primeste propriul ecran. „Link invalid" pentru
   toate ar fi trimis la receptie si oaspetii care n-au nicio problema —
   doar au deschis linkul cu o zi mai devreme. */
const REFUZURI = {
  neinceput: {
    titlu: "Sejurul n-a început încă",
    text: "Pagina se deschide singură când te cazezi. Codul de acces apare aici imediat după check-in.",
  },
  incheiat: {
    titlu: "Sejurul s-a încheiat",
    text: "Linkul a expirat odată cu plecarea. Îți mulțumim că ai stat la noi.",
  },
  anulat: {
    titlu: "Rezervarea nu mai este activă",
    text: "Dacă e o greșeală, sună-ne și o lămurim pe loc.",
  },
  necunoscut: {
    titlu: "Linkul nu funcționează",
    text: "Verifică dacă l-ai deschis întreg, așa cum l-ai primit. Dacă tot nu merge, sună-ne.",
  },
  "prea-multe": {
    titlu: "Prea multe încercări",
    text: "Așteaptă câteva minute și încearcă din nou. Dacă te grăbești, sună-ne.",
  },
  lipsa: {
    titlu: "Link incomplet",
    text: "Adresa nu conține codul sejurului. Deschide linkul întreg, așa cum l-ai primit.",
  },
  eroare: {
    titlu: "Ceva n-a mers",
    text: "N-am putut încărca datele. Încearcă să reîncarci pagina.",
  },
};

function Refuz({ motiv }) {
  const m = REFUZURI[motiv] || REFUZURI.eroare;
  return (
    <div className="g-pagina">
      <div className="g-card g-mesaj">
        <h1>{m.titlu}</h1>
        <p>{m.text}</p>
        <a className="g-buton" href={`tel:${TELEFON}`}>Sună recepția</a>
      </div>
      <p className="g-subsol">Complex La Livada · {TELEFON_SCRIS}</p>
    </div>
  );
}

export default function App() {
  const [cod, setCod] = useState(codDinAdresa);
  const [stare, setStare] = useState("incarca");
  const [motiv, setMotiv] = useState(null);
  const [sejur, setSejur] = useState(null);
  const [acces, setAcces] = useState(null);
  const [minibar, setMinibar] = useState([]);

  /* Codul stand in fragment, trecerea de la un link la altul in aceeasi
     fila NU e o navigare: browserul schimba doar adresa, nimic nu se
     reincarca. O familie cu doua camere care deschide al doilea link ar fi
     ramas cu codul primei camere pe ecran — aceeasi pagina, alta usa.
     Prins la verificare, exact asa. */
  useEffect(() => {
    const laSchimbare = () => setCod(codDinAdresa());
    window.addEventListener("hashchange", laSchimbare);
    return () => window.removeEventListener("hashchange", laSchimbare);
  }, []);

  useEffect(() => {
    setStare("incarca");
    if (!cod) { setMotiv("lipsa"); setStare("refuzat"); return; }

    let viu = true;
    /* Cele trei apeluri pleaca deodata. In serie ar fi insemnat trei dus-
       intors pe date mobile inainte ca omul sa vada codul, adica exact
       lucrul pentru care a deschis pagina. */
    Promise.all([
      citesteSejurul(cod),
      citesteCodulDeAcces(cod),
      citesteMinibarul().catch(() => []),
    ])
      .then(([s, a, m]) => {
        if (!viu) return;
        if (!s?.ok) { setMotiv(s?.motiv || "eroare"); setStare("refuzat"); return; }
        setSejur(s.stay);
        /* Codul poate lipsi fara ca sejurul sa fie invalid: se genereaza la
           check-in si uneori intarzie. Nu e motiv de refuz. */
        setAcces(a?.ok ? a : null);
        setMinibar(Array.isArray(m) ? m : []);
        setStare("gata");
      })
      .catch(() => { if (viu) { setMotiv("eroare"); setStare("refuzat"); } });

    return () => { viu = false; };
  }, [cod]);

  if (stare === "incarca") {
    return (
      <div className="g-pagina">
        <div className="g-card g-mesaj"><p>Se încarcă…</p></div>
      </div>
    );
  }
  if (stare === "refuzat") return <Refuz motiv={motiv} />;

  return (
    <div className="g-pagina">
      <div className="g-cap">
        <h1>{sejur.guestName || "Bine ai venit"}</h1>
        <p>{TIP[sejur.roomType] || sejur.roomType} {sejur.roomName}</p>
      </div>

      <div className="g-card">
        <h2>Codul de acces</h2>
        {acces?.code ? (
          <>
            <p className="g-cod">{acces.code}</p>
            <p className="g-cod-valabil">
              Valabil de la <b>{ziSiOra(acces.validFrom)}</b> până la{" "}
              <b>{ziSiOra(acces.validUntil)}</b>
            </p>
          </>
        ) : (
          <p className="g-cod-lipsa">
            Codul nu e încă pregătit. Reîncarcă pagina în câteva minute sau
            întreabă la recepție.
          </p>
        )}
      </div>

      <div className="g-card">
        <h2>Sejurul</h2>
        <dl className="g-lista">
          <div className="g-rand"><dt>Sosire</dt><dd>{ziSiOra(sejur.checkIn)}</dd></div>
          <div className="g-rand"><dt>Plecare</dt><dd>{ziSiOra(sejur.checkOut)}</dd></div>
          <div className="g-rand">
            <dt>Nopți</dt><dd>{sejur.nights}</dd>
          </div>
          <div className="g-rand">
            <dt>Persoane</dt>
            <dd>
              {sejur.adults} {sejur.adults === 1 ? "adult" : "adulți"}
              {sejur.children > 0 && `, ${sejur.children} ${sejur.children === 1 ? "copil" : "copii"}`}
            </dd>
          </div>
        </dl>
      </div>

      {/* Sectiunea lipseste cu totul cand meniul e gol, in loc sa arate un
          titlu urmat de nimic. Azi chiar e gol: niciun produs nu e marcat
          vizibil public (vezi docs/guest-app.md, pasul 2). */}
      {minibar.length > 0 && (
        <div className="g-card">
          <h2>Minibar</h2>
          <div className="g-minibar">
            {minibar.map((p, i) => (
              <div className="g-produs" key={i}>
                <span className="g-produs-nume">
                  {p.name}
                  {p.description && <span className="g-produs-desc">{p.description}</span>}
                </span>
                <span className="g-produs-pret">{pret(p.price)}</span>
              </div>
            ))}
          </div>
          <p className="g-gol" style={{ marginTop: 10 }}>
            Consumul se trece pe notă la recepție.
          </p>
        </div>
      )}

      <p className="g-subsol">
        Complex La Livada · <a href={`tel:${TELEFON}`}>{TELEFON_SCRIS}</a>
      </p>
    </div>
  );
}
