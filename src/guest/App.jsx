/* Pagina oaspetelui: salutul, codul de acces, deschiderea usii si cele
 * patru sectiuni de continut.
 *
 * Autentificarea e linkul insusi. Nu exista cont, nu exista parola, iar
 * fereastra de valabilitate NU se tine aici: serverul refuza codul in afara
 * sejurului, deci un link expirat nu intoarce date pe care interfata sa le
 * ascunda — nu le intoarce deloc. Tot ce face fisierul asta cu motivul
 * refuzului e sa-l traduca in ceva ce omul poate citi.
 *
 * Ordinea de pe ecran nu e estetica, e operationala: pagina se deschide cel
 * mai des stand in fata usii, cu o mana ocupata. Deci codul si butonul de
 * deschidere sunt primele si mari; restul vine sub ele, pliat in butoane.
 */
import { useEffect, useRef, useState } from "react";
import {
  citesteSejurul, citesteCodulDeAcces, citesteMinibarul, deschideUsa,
} from "./api.js";
import { citesteVremea } from "./vreme.js";
import {
  TELEFON, TELEFON_SCRIS, ACASA, BUN_VENIT, IMPORTANT,
  ATRACTII, ATRACTII_PE_PAGINA, linkHarta,
} from "./continut.js";

/* Codul se ia din fragment, nu din calea adresei.
 *
 * Linkul dat oaspetelui e guest.lalivada.ro/#Ajh6k. Fragmentul nu se
 * trimite niciodata serverului, deci codul nu ajunge in logurile de acces
 * ale Vercel. Calea ramane citita ca rezerva, pentru cine nimereste pe
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

/* Salutul dupa ceasul telefonului, nu dupa al serverului: oaspetele citeste
   „bună seara" cand e seara la el, iar el si casa sunt in acelasi fus. */
export function salut(ora) {
  if (ora >= 5 && ora < 11) return "Bună dimineața,";
  if (ora >= 11 && ora < 18) return "Bună ziua,";
  return "Bună seara,";
}

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

/* Pictogramele sunt scrise aici, nu importate dintr-o biblioteca: sunt
   cateva, iar lucide-react ar fi adus un pachet intreg pentru ele. */
const Casa = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    <path d="M9.5 21v-6h5v6" />
  </svg>
);
const Info = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6h.01" />
  </svg>
);
const Cana = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 8h11v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
    <path d="M15 9.5h1.8a2.5 2.5 0 0 1 0 5H15" />
    <path d="M4 21h12" />
  </svg>
);
const Reper = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);
const Cheie = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M18 12v3.5M15.5 12v2.5" />
  </svg>
);

/* Pictogramele de vreme. Aceleasi sase stari din vreme.js. */
const VREME = {
  senin: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
    </svg>
  ),
  parcial: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="3.2" />
      <path d="M8.5 2.6v1.6M2.6 8.5h1.6M4.3 4.3l1.2 1.2M12.7 4.3l-1.2 1.2" />
      <path d="M9 19.5h8.4a3.1 3.1 0 0 0 .3-6.2 4.4 4.4 0 0 0-8.4-.8A3.5 3.5 0 0 0 9 19.5z" />
    </svg>
  ),
  innorat: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.4 19h9.3a3.4 3.4 0 0 0 .3-6.8 4.8 4.8 0 0 0-9.2-.9A3.8 3.8 0 0 0 7.4 19z" />
    </svg>
  ),
  ceata: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.4 15h9.3a3.4 3.4 0 0 0 .3-6.8 4.8 4.8 0 0 0-9.2-.9A3.8 3.8 0 0 0 7.4 15z" />
      <path d="M5 18.4h14M7.5 21.4h9" />
    </svg>
  ),
  ploaie: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.4 15.4h9.3a3.4 3.4 0 0 0 .3-6.8 4.8 4.8 0 0 0-9.2-.9 3.8 3.8 0 0 0-.4 7.7z" />
      <path d="M9 18.4 8.2 21M13 18.4 12.2 21M17 18.4 16.2 21" />
    </svg>
  ),
  ninsoare: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.4 15.4h9.3a3.4 3.4 0 0 0 .3-6.8 4.8 4.8 0 0 0-9.2-.9 3.8 3.8 0 0 0-.4 7.7z" />
      <path d="M8.6 19.4h.01M12.4 19.4h.01M16.2 19.4h.01M10.5 21.8h.01M14.3 21.8h.01" />
    </svg>
  ),
  furtuna: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.4 15.4h9.3a3.4 3.4 0 0 0 .3-6.8 4.8 4.8 0 0 0-9.2-.9 3.8 3.8 0 0 0-.4 7.7z" />
      <path d="m12.8 17.4-2.4 3.2h3l-2 3" />
    </svg>
  ),
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

/* Vremea de la complex. Cere singura, o data, la deschiderea paginii.
   Cat timp n-a raspuns sau daca a esuat, nu ocupa loc pe ecran. */
function Vremea() {
  const [v, setV] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    citesteVremea(ACASA, ctrl.signal).then(setV).catch(() => { /* tacut */ });
    return () => ctrl.abort();
  }, []);

  if (!v) return null;
  return (
    <div className="g-vreme" title={v.text}>
      <p className="g-vreme-loc">{ACASA.localitate}</p>
      <p className="g-vreme-grade">
        {VREME[v.fel] || VREME.innorat}
        <span>{v.grade}°</span>
      </p>
    </div>
  );
}

/* Butonul de usa. Sta separat fiindca are stare proprie — o cerere in curs,
   un rezultat de aratat — si n-are rost sa reincarce toata pagina. */
function ButonUsa({ cod }) {
  const [stare, setStare] = useState("gata");
  const [mesaj, setMesaj] = useState("");

  /* Dupa o deschidere reusita butonul ramane blocat cateva secunde. Nu ca
     masura de securitate — aia e in baza, cu plafoane pe ora — ci fiindca
     yala are nevoie de o clipa, iar cine nu aude clicul imediat apasa din
     nou si consuma degeaba din plafonul lui. */
  useEffect(() => {
    if (stare !== "deschis") return;
    const t = setTimeout(() => { setStare("gata"); setMesaj(""); }, 6000);
    return () => clearTimeout(t);
  }, [stare]);

  async function apasa() {
    setStare("trimite");
    setMesaj("");
    let r;
    try { r = await deschideUsa(cod); }
    catch { r = { ok: false, mesaj: "Fără legătură la internet. Folosește codul de acces." }; }
    if (r.ok) { setStare("deschis"); setMesaj("Ușa e deschisă. Intră în câteva secunde."); }
    else { setStare("gata"); setMesaj(r.mesaj); }
  }

  const fel = stare === "deschis" ? "bine" : (mesaj ? "rau" : "");

  return (
    <>
      <button
        className="g-usa"
        data-stare={stare}
        onClick={apasa}
        disabled={stare !== "gata"}
        type="button"
      >
        <Cheie />
        {stare === "trimite" ? "Se deschide…"
          : stare === "deschis" ? "Ușa e deschisă"
          : "Deschide ușa"}
      </button>
      {/* Randul isi tine inaltimea si cand e gol, ca aparitia mesajului sa
          nu impinga butonul sub degetul care tocmai l-a apasat. */}
      <p className="g-usa-stare" data-fel={fel} role="status">{mesaj}</p>
    </>
  );
}

/* Cele patru sectiuni. Se deschide una singura: pe telefon, patru panouri
   desfacute in acelasi timp ar impinge codul de acces mult sub linia
   ecranului, adica fix lucrul dupa care s-a intrat in pagina. */
function Sectiune({ cheie, deschis, alege, iconita, eticheta }) {
  return (
    <button
      className="g-scurtatura"
      type="button"
      aria-expanded={deschis === cheie}
      onClick={() => alege(deschis === cheie ? null : cheie)}
    >
      {iconita}
      <span>{eticheta}</span>
    </button>
  );
}

/* Atractiile, cinci pe pagina, ordonate dupa distanta.
 *
 * Paginarea nu e doar de asezare in pagina: pozele se incarca lenes, deci
 * cine nu trece la pagina a doua nu descarca niciodata ultimele cinci
 * imagini. Pe date mobile, in curte, asta se simte. */
function Atractii() {
  const [pagina, setPagina] = useState(0);
  const capul = useRef(null);
  const pagini = Math.ceil(ATRACTII.length / ATRACTII_PE_PAGINA);
  const de = pagina * ATRACTII_PE_PAGINA;
  const feliile = ATRACTII.slice(de, de + ATRACTII_PE_PAGINA);

  /* La schimbarea paginii, inapoi la primul obiectiv. Altfel, cine apasa
     „Înainte" stand jos ramane cu ecranul la subsolul listei noi. */
  function mergiLa(p) {
    setPagina(p);
    capul.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="g-card" ref={capul}>
      <h2>Atracții în județul Vaslui</h2>
      <ul className="g-atractii">
        {feliile.map((a) => (
          <li className="g-atractie" key={a.cheie}>
            {a.foto ? (
              <figure className="g-atractie-foto">
                <img src={`/atractii/${a.foto}`} alt={a.nume}
                     width="720" height="450" loading="lazy" decoding="async" />
                {/* Autorul si licenta nu sunt politete, sunt conditia sub
                    care avem voie sa folosim poza. */}
                <figcaption>
                  foto: {a.credit.autor} ·{" "}
                  <a href={a.credit.pagina} target="_blank" rel="noopener noreferrer">
                    {a.credit.licenta}
                  </a>
                </figcaption>
              </figure>
            ) : null}
            <h3>{a.nume}</h3>
            <p className="g-atractie-drum">
              {a.loc} · {a.km} km · {a.minute} min cu mașina
            </p>
            <p className="g-atractie-text">{a.text}</p>
            <a className="g-harta" href={linkHarta(a)}
               target="_blank" rel="noopener noreferrer">
              <Reper /> Deschide în Google Maps
            </a>
          </li>
        ))}
      </ul>

      <div className="g-paginatie">
        <button type="button" onClick={() => mergiLa(pagina - 1)} disabled={pagina === 0}>
          ← Înapoi
        </button>
        <span>{de + 1}–{de + feliile.length} din {ATRACTII.length}</span>
        <button type="button" onClick={() => mergiLa(pagina + 1)}
                disabled={pagina >= pagini - 1}>
          Înainte →
        </button>
      </div>
      <p className="g-nota">Distanțele sunt pe șosea, de la complex.</p>
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
  const [deschis, setDeschis] = useState(null);

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

  const camera = `${TIP[sejur.roomType] || sejur.roomType || ""} ${sejur.roomName || ""}`.trim();

  /* „Important" incepe cu ce depinde de rezervarea asta si continua cu
     regulile generale din continut.js. Ora de plecare scrisa de mana in
     fisierul de continut ar fi fost gresita pentru orice sejur cu alta
     intelegere; asa vine din baza. */
  const important = [
    { titlu: "Plecarea", text: `Camera se eliberează ${ziSiOra(sejur.checkOut)}.` },
    acces?.code && {
      titlu: "Cât ține codul",
      text: `Codul ${acces.code}# funcționează până ${ziSiOra(acces.validUntil)}.`,
    },
    {
      titlu: "Dacă ușa nu se deschide",
      text: `Încearcă întâi codul pe tastatură, apoi sună-ne la ${TELEFON_SCRIS}. Răspundem non-stop.`,
    },
    ...IMPORTANT,
  ].filter(Boolean);

  return (
    <div className="g-pagina">
      <div className="g-salut">
        <div className="g-salut-text">
          <p className="g-salut-ora">{salut(new Date().getHours())}</p>
          <h1 className="g-salut-nume">
            {sejur.guestName || "bun venit"}{" "}
            <span className="g-mana" role="img" aria-label="salut">👋</span>
          </h1>
        </div>
        <Vremea />
        <a className="g-emblema" href="https://lalivada.ro"
           target="_blank" rel="noopener noreferrer">
          <img src="/brand/favicon.png" alt="Complex La Livada" />
        </a>
      </div>

      <div className="g-hero">
        {camera && <p className="g-hero-camera">{camera}</p>}
        <p className="g-eticheta">Cod de acces</p>
        {acces?.code ? (
          <>
            {/* Diezul face parte din ce se tasteaza pe yala, deci se
                afiseaza langa cifre, nu se lasa pe seama memoriei. */}
            <p className="g-cod">{acces.code}<span className="g-diez">#</span></p>
            <p className="g-valabil">
              Valabil până <b>{ziSiOra(acces.validUntil)}</b>
            </p>
          </>
        ) : (
          <p className="g-cod-lipsa">
            Codul nu e încă pregătit. Reîncarcă pagina în câteva minute sau
            sună-ne — între timp, poți intra cu butonul de mai jos.
          </p>
        )}
        {/* Butonul NU depinde de cod. Cand generarea codului esueaza la
            yala, oaspetele ramane fara cifre — si atunci deschiderea de
            aici e singurul lucru care il baga in camera. Legat de cod,
            ar fi lipsit exact cand e mai necesar. */}
        <ButonUsa cod={cod} />
      </div>

      <div className="g-scurtaturi">
        <Sectiune cheie="venit" deschis={deschis} alege={setDeschis}
          iconita={<Casa />} eticheta="Bun venit" />
        <Sectiune cheie="important" deschis={deschis} alege={setDeschis}
          iconita={<Info />} eticheta="Important" />
        <Sectiune cheie="minibar" deschis={deschis} alege={setDeschis}
          iconita={<Cana />} eticheta="Minibar" />
        <Sectiune cheie="atractii" deschis={deschis} alege={setDeschis}
          iconita={<Reper />} eticheta="Atracții" />
      </div>

      {deschis === "venit" && (
        <div className="g-card">
          <h2>Bun venit</h2>
          <p className="g-intro">{BUN_VENIT.intro}</p>
          <dl className="g-lista">
            <div className="g-rand"><dt>Sosire</dt><dd>{ziSiOra(sejur.checkIn)}</dd></div>
            <div className="g-rand"><dt>Plecare</dt><dd>{ziSiOra(sejur.checkOut)}</dd></div>
            <div className="g-rand"><dt>Nopți</dt><dd>{sejur.nights}</dd></div>
            <div className="g-rand">
              <dt>Persoane</dt>
              <dd>
                {sejur.adults} {sejur.adults === 1 ? "adult" : "adulți"}
                {sejur.children > 0 && `, ${sejur.children} ${sejur.children === 1 ? "copil" : "copii"}`}
              </dd>
            </div>
          </dl>
          {BUN_VENIT.puncte.length > 0 && (
            <ul className="g-puncte" style={{ marginTop: 12 }}>
              {BUN_VENIT.puncte.map((p, i) => (
                <li key={i}><b>{p.titlu}</b> — {p.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {deschis === "important" && (
        <div className="g-card">
          <h2>Important</h2>
          <ul className="g-puncte">
            {important.map((p, i) => (
              <li key={i}><b>{p.titlu}</b> — {p.text}</li>
            ))}
          </ul>
        </div>
      )}

      {deschis === "minibar" && (
        <div className="g-card">
          <h2>Minibar</h2>
          {minibar.length > 0 ? (
            <>
              {minibar.map((p, i) => (
                <div className="g-produs" key={i}>
                  <span>
                    {p.name}
                    {p.description && <span className="g-produs-desc">{p.description}</span>}
                  </span>
                  <span className="g-produs-pret">{pret(p.price)}</span>
                </div>
              ))}
              <p className="g-nota">Consumul se trece pe notă la recepție.</p>
            </>
          ) : (
            /* Meniul e gol cat timp niciun produs nu e marcat vizibil public
               in PMS. Butonul ramane, dar spune de ce nu are ce arata — un
               panou gol ar parea o eroare de incarcare. */
            <p className="g-gol">
              Meniul nu e încă publicat aici. Întreabă-ne ce avem — răspundem
              la <a href={`tel:${TELEFON}`}>{TELEFON_SCRIS}</a>.
            </p>
          )}
        </div>
      )}

      {deschis === "atractii" && <Atractii />}

      <p className="g-subsol">
        Complex La Livada · <a href={`tel:${TELEFON}`}>{TELEFON_SCRIS}</a>
      </p>
    </div>
  );
}
