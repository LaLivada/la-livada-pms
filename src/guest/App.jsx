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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  citesteSejurul, citesteCodulDeAcces, citesteMinibarul, deschideUsa,
} from "./api.js";
import { citesteVremea } from "./vreme.js";
import Fisa from "./Fisa.jsx";
import {
  TELEFON, TELEFON_SCRIS, ASISTENTA, ACASA, BUN_VENIT, IMPORTANT,
  ATRACTII, ATRACTII_PE_PAGINA, linkHarta,
  LINK_MAPS, LINK_WAZE, ACCES_CAMERE, HARTA_INCORPORATA, WIFI, REGULAMENT,
} from "./continut.js";
import {
  promptDisponibil, asculta, cheamaPrompt, esteInstalata, esteIOS,
} from "./instalare.js";

/* Codul se ia din fragment, nu din calea adresei.
 *
 * Linkul dat oaspetelui e guest.lalivada.ro/#Q7moVrzk. Fragmentul nu se
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
const Usa = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 21V4.4a1 1 0 0 1 .8-1l9-1.8a1 1 0 0 1 1.2 1V21" />
    <path d="M3.5 21h17M13.6 12.2h.01" />
  </svg>
);
/* Receptorul e desenat aici, nu luat ca sigla: un telefon nu e marca nimanui.
   WhatsApp, in schimb, are semnul lui si se pune ca fisier, ca la Maps si
   Waze — unul desenat de mana ar fi si mai putin recunoscut, si in raspar cu
   regulile lor de marca. */
const Telefon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6.6 3h-2A1.6 1.6 0 0 0 3 4.6C3 13.1 10.9 21 19.4 21a1.6 1.6 0 0 0 1.6-1.6v-2a1 1 0 0 0-.8-1l-3.4-.7a1 1 0 0 0-1 .4l-1 1.3a13 13 0 0 1-5.2-5.2l1.3-1a1 1 0 0 0 .4-1l-.7-3.4a1 1 0 0 0-1-.8z" />
  </svg>
);

/* Telefon cu plus: aceeasi idee ca pictograma sistemului pentru „adauga pe
   ecranul principal", desenata cu linia celorlalte iconite de aici. */
const Adauga = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5" y="2.6" width="14" height="18.8" rx="2.6" />
    <path d="M12 8.7v6.6M8.7 12h6.6" />
  </svg>
);

/* Intampinarea, tinuta pe un singur rand.
 *
 * Nu din CSS: latimea depinde de fontul incarcat, iar Instrument Serif vine
 * de la Google Fonts si poate intarzia sau lipsi cu totul — un calc() pe vw
 * ar fi fost o presupunere despre metrica lui, gresita exact in clipa in
 * care fontul nu ajunge. Aici se masoara ce e pe ecran.
 *
 * Latimea textului creste liniar cu marimea fontului, deci nu e nevoie de
 * cautare: se masoara o data la marimea maxima si se imparte. */
const INTRO_MAX = 19;
const INTRO_MIN = 12;

function useUnSingurRand(ref) {
  useLayoutEffect(() => {
    const potriveste = () => {
      const el = ref.current;
      if (!el) return;
      el.style.whiteSpace = "nowrap";
      el.style.fontSize = INTRO_MAX + "px";
      const incape = el.clientWidth;
      const cere = el.scrollWidth;
      if (cere <= incape) return;

      const px = Math.max(INTRO_MIN, Math.floor(INTRO_MAX * incape / cere * 10) / 10);
      el.style.fontSize = px + "px";
      /* Daca nici la marimea minima nu incape — un font de rezerva mai lat,
         un ecran neobisnuit de ingust — se renunta la un singur rand si se
         lasa sa curga. Mai bine doua randuri decat text taiat. */
      if (el.scrollWidth > el.clientWidth) el.style.whiteSpace = "";
    };

    potriveste();
    document.fonts?.ready?.then(potriveste).catch(() => {});
    window.addEventListener("resize", potriveste);
    window.addEventListener("orientationchange", potriveste);
    return () => {
      window.removeEventListener("resize", potriveste);
      window.removeEventListener("orientationchange", potriveste);
    };
  }, [ref]);
}

/* Componenta proprie, ca masurarea sa se faca la deschiderea panoului.
   Paragraful nu exista in pagina pana atunci, deci un hook chemat din
   componenta mare ar fi masurat un element inexistent, o singura data. */
function Intro({ children }) {
  const ref = useRef(null);
  useUnSingurRand(ref);
  return <p className="g-intro" ref={ref}>{children}</p>;
}

/* Undele de Wi-Fi. Punctul de dedesubt e o linie de lungime zero cu capat
   rotund — un <circle> ar iesi inel, fiindca regula de stil pune fill:none
   pe tot ce e in butoanele astea. */
const Semnal = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2.6 8.9a14.4 14.4 0 0 1 18.8 0" />
    <path d="M5.9 12.6a9.4 9.4 0 0 1 12.2 0" />
    <path d="M9.1 16.3a4.5 4.5 0 0 1 5.8 0" />
    <path className="g-punct" d="M12 19.8h.01" />
  </svg>
);

/* Pasii scrisi cu numele exacte pe care oaspetele le vede pe ecran. Traduse
   gresit, instructiunile sunt mai rele decat lipsa lor: omul cauta un buton
   care nu exista si conchide ca pagina e stricata. */
const PASI_IOS = [
  <>Apasă <b>Partajare</b> — pătratul cu săgeata în sus, în bara de jos.</>,
  <>Derulează și alege <b>Adaugă la ecranul principal</b>.</>,
  <>Confirmă cu <b>Adaugă</b>, sus în dreapta.</>,
];
const PASI_ANDROID = [
  <>Apasă <b>⋮</b> în colțul din dreapta sus.</>,
  <>Alege <b>Adaugă la ecranul principal</b> sau <b>Instalează aplicația</b>.</>,
  <>Confirmă cu <b>Adaugă</b>.</>,
];

const PASI_WIFI_IOS = [
  <>Deschide <b>Setări</b> → <b>Wi-Fi</b>.</>,
  <>Alege <b>{WIFI.retea}</b> din listă.</>,
  <>Gata — rețeaua nu cere parolă.</>,
];
const PASI_WIFI_ANDROID = [
  <>Trage în jos bara de sus și ține apăsat pe <b>Wi-Fi</b>.</>,
  <>Alege <b>{WIFI.retea}</b> din listă.</>,
  <>Gata — rețeaua nu cere parolă.</>,
];

/* Conectarea la Wi-Fi.
 *
 * Nu exista niciun mijloc prin care o pagina web sa conecteze telefonul la o
 * retea, nici pe iOS, nici pe Android. Nu e o lipsa de API — e o granita de
 * securitate a sistemului, si nu are cum sa cada.
 *
 * Ce se poate: codul QR standard „WIFI:S:...;T:nopass;;", pe care camera
 * ambelor sisteme il recunoaste si il ofera drept „conecteaza-te la retea".
 * Scanarea o face camera sistemului, nu pagina, deci un telefon nu-si poate
 * citi propriul ecran; codul e pentru al doilea telefon din camera, care il
 * scaneaza de pe ecranul primului. Pentru telefonul care tine pagina raman
 * pasii de dedesubt.
 *
 * QR-ul e fisier static, generat o data si pus in public-guest/: numele
 * retelei e constanta, iar un generator adus in bundle ar fi zeci de
 * kiloocteti pentru o imagine care nu se schimba niciodata. */
function ConectareWifi() {
  const [deschis, setDeschis] = useState(false);

  return (
    <div className="g-actiune-loc">
      <button type="button" className="g-actiune"
        onClick={() => setDeschis((d) => !d)}
        aria-expanded={deschis} aria-controls="g-wifi-cum">
        <Semnal />
        Conectează-te la Wi-Fi
      </button>
      {deschis && (
        <div id="g-wifi-cum">
          <div className="g-qr">
            <img src="/wifi-qr.svg" width="128" height="128"
              alt={`Cod QR pentru rețeaua ${WIFI.retea}`} />
            <p>
              <b>Scanează cu camera altui telefon</b> — se conectează singur,
              fără parolă.
            </p>
          </div>
          <p className="g-instructiuni-titlu">Sau, de pe telefonul ăsta:</p>
          <ol className="g-instructiuni">
            {(esteIOS() ? PASI_WIFI_IOS : PASI_WIFI_ANDROID).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* Butonul de adaugare pe ecranul principal.
 *
 * Pe Android deschide dialogul sistemului, dintr-o apasare. Pe iPhone nu
 * are cum — Safari nu da paginii niciun mijloc — deci acolo arata pasii.
 * Diferenta e in instalare.js; aici ramane doar alegerea intre cele doua.
 *
 * Cand pagina e deja deschisa din icon, butonul dispare: n-are ce oferi. */
function Instaleaza() {
  const [nativ, setNativ] = useState(promptDisponibil);
  const [pasi, setPasi] = useState(false);
  const [gata, setGata] = useState(esteInstalata);

  useEffect(() => asculta(() => {
    setNativ(promptDisponibil());
    if (esteInstalata()) setGata(true);
  }), []);

  if (gata) return null;

  const apasa = async () => {
    if (nativ) {
      const raspuns = await cheamaPrompt();
      if (raspuns === "accepted") { setGata(true); return; }
      // A refuzat dialogul: nu-l intampinam imediat cu instructiuni pentru
      // acelasi lucru. Evenimentul s-a consumat, deci a doua apasare
      // ajunge oricum la pasii de mai jos.
      if (raspuns !== "indisponibil") return;
    }
    setPasi((p) => !p);
  };

  return (
    <div className="g-actiune-loc">
      <button type="button" className="g-actiune" onClick={apasa}
        aria-expanded={pasi} aria-controls="g-pasi-instalare">
        <Adauga />
        Adaugă iconul pe ecran
      </button>
      {pasi && (
        <div id="g-pasi-instalare">
          <ol className="g-instructiuni">
            {(esteIOS() ? PASI_IOS : PASI_ANDROID).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
          <p className="g-instructiuni-nota">
            Nu găsești opțiunea? Deschide pagina în{" "}
            {esteIOS() ? "Safari" : "Chrome"} — în browserul din WhatsApp nu
            apare.
          </p>
        </div>
      )}
    </div>
  );
}

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

/* Fereastra suprapusa, folosita deocamdata doar de „Acces către camere".
 *
 * Scrisa de mana, nu adusa dintr-o biblioteca: are de facut patru lucruri
 * — Escape, clic pe fundal, blocarea derularii in spate si intoarcerea
 * focusului la butonul care a deschis-o — iar pentru atat n-are rost inca
 * un pachet intr-un bundle deschis pe date mobile.
 *
 * Intoarcerea focusului nu e podoaba de accesibilitate: cine navigheaza cu
 * tastatura sau cu VoiceOver ar fi aruncat la inceputul paginii la fiecare
 * inchidere, si ar trebui sa refaca tot drumul pana la butoane. */
function Fereastra({ titlu, antet, onInchide, children }) {
  const butonInchide = useRef(null);

  useEffect(() => {
    const deUnde = document.activeElement;
    const laTasta = (e) => { if (e.key === "Escape") onInchide(); };
    const derulareVeche = document.body.style.overflow;

    document.addEventListener("keydown", laTasta);
    document.body.style.overflow = "hidden";
    butonInchide.current?.focus();

    return () => {
      document.removeEventListener("keydown", laTasta);
      document.body.style.overflow = derulareVeche;
      if (deUnde instanceof HTMLElement) deUnde.focus();
    };
  }, [onInchide]);

  return (
    <div className="g-fundal" onClick={onInchide}>
      {/* Clicul dinauntru nu se propaga la fundal, altfel orice apasare pe
          o poza ar inchide fereastra. */}
      <div className="g-fereastra" role="dialog" aria-modal="true" aria-label={titlu}
           onClick={(e) => e.stopPropagation()}>
        {/* `antet` inlocuieste titlul scris, pentru ferestrele care au nevoie
            de un cap propriu — regulamentul isi pune sigla acolo. `titlu`
            ramane oricum numele citit de cititoarele de ecran. */}
        <div className="g-fereastra-cap">
          {antet ?? <h2>{titlu}</h2>}
          <button ref={butonInchide} type="button" onClick={onInchide}
                  className="g-inchide" aria-label="Închide">×</button>
        </div>
        <div className="g-fereastra-corp">{children}</div>
      </div>
    </div>
  );
}

function ContinutAcces() {
  const { poze, pasi } = ACCES_CAMERE;
  /* Cat timp continutul nu e pus, fereastra spune de ce e goala si da
     numarul — nu se preface ca indruma pe cineva prin curte. */
  if (!poze.length && !pasi.length) {
    return (
      <p className="g-gol">
        Îndrumarea prin curte nu e încă pusă aici. Dacă nu găsești camera,
        sună-ne la <a href={`tel:${TELEFON}`}>{TELEFON_SCRIS}</a> și te
        conducem noi.
      </p>
    );
  }
  return (
    <>
      {poze.map((p) => (
        /* Textul sta DEASUPRA pozei, nu sub ea: e o indrumare, nu o
           legenda. Cine urmeaza traseul citeste ce are de facut si abia
           apoi se uita la poza ca sa recunoasca locul; invers, s-ar uita
           intai la o poza care inca nu inseamna nimic.
           `alt` ramane gol dinadins. Textul de deasupra spune deja ce e de
           facut, iar pus si in `alt` s-ar auzi de doua ori la rand in
           cititorul de ecran. Poza ilustreaza indrumarea, nu o inlocuieste. */
        <figure className="g-acces-foto" key={p.fisier}>
          {p.descriere && <figcaption>{p.descriere}</figcaption>}
          <img src={`/acces/${p.fisier}`} alt="" loading="lazy" decoding="async" />
        </figure>
      ))}
      {pasi.length > 0 && (
        <ol className="g-pasi">
          {pasi.map((t, i) => <li key={i}>{t}</li>)}
        </ol>
      )}
    </>
  );
}

/* Randul de sub butoane: cum ajungi la complex si, o data ajuns, cum
   gasesti camera. Sunt lucruri diferite, dar amandoua raspund la „unde
   trebuie sa merg acum", deci stau impreuna. */
/* Inaltimea hartii se MASOARA, nu se ghiceste.
 *
 * Cerinta e ca tot cardul sa incapa pe primul ecran. Cat loc ramane pentru
 * harta nu e o fractiune din inaltimea ecranului, ci exact ce nu ocupa deja
 * ce e deasupra — iar aia variaza: un nume lung urca salutul pe doua randuri,
 * rezervarea fara cod pregatit scoate randul „valabil pana", iar pe un telefon
 * ingust textul butoanelor se rupe si creste grila. O valoare in svh ar fi
 * nimerit un singur telefon si l-ar fi ratat pe urmatorul.
 *
 * Masuratoarea se reface si la rotirea telefonului, si cand barele browserului
 * se ascund la derulare (`innerHeight` se schimba), si cand se schimba
 * continutul de deasupra — de aici ResizeObserver pe pagina.
 *
 * Nu intra in bucla: valoarea calculata nu depinde de inaltimea paginii, ci de
 * `innerHeight` si de pozitia cardului, iar scrierea se face doar cand
 * rezultatul chiar difera.
 *
 * CSS-ul are oricum un clamp propriu — daca JS-ul asta n-ar rula deloc, harta
 * ar avea o inaltime rezonabila, nu zero. */
/* Pragul de jos e un compromis masurat, nu o cifra rotunda. Cu 96px cardul
   depasea cu exact 1px pe un Android de 360x680 — cel mai strans ecran obisnuit
   de azi. Cu 84 incape acolo, iar banda din satelit e inca destul de inalta cat
   sa se vada drumul si complexul. Mai jos de atat harta n-ar mai spune nimic,
   si atunci e mai cinstit sa iasa cardul putin sub pliu decat sa lasam o dunga
   inutila. */
const HARTA_MIN = 84;
/* Plafonul e o plasa pentru ecrane inalte (un laptop), nu o limita pentru
   telefoane. Cu 220 ramanea loc gol jos pe un iPhone mare — verificat pe
   dispozitiv, nu in emulator. */
const HARTA_MAX = 340;
const HARTA_AER = 6;     // cardul sa nu stea lipit de marginea de jos

/* Inaltimea REALA vizibila.
 *
 * Pe iOS Safari `innerHeight` da inaltimea de asezare, care include si fasia
 * de sub bara de jos — deci calculul iese cu cativa zeci de pixeli pe langa,
 * intr-un sens sau altul, exact pe telefonul unde conteaza. `visualViewport`
 * da ce se vede cu adevarat.
 *
 * Doar la scara 1: cand omul apropie cu doua degete, visualViewport se
 * micsoreaza si n-are nicio legatura cu spatiul de asezare — atunci harta
 * n-are de ce sa se schimbe, deci ramanem pe innerHeight. */
function inaltimeaVizibila() {
  const vv = window.visualViewport;
  if (vv && Math.abs(vv.scale - 1) < 0.01) return vv.height;
  return window.innerHeight;
}

function useInaltimeaHartii(refCard, refHarta) {
  useLayoutEffect(() => {
    const potriveste = () => {
      const card = refCard.current, harta = refHarta.current;
      if (!card || !harta) return;
      const susCard = card.getBoundingClientRect().top + window.scrollY;
      const fara = card.offsetHeight - harta.offsetHeight;   // cardul fara harta
      const liber = inaltimeaVizibila() - susCard - fara - HARTA_AER;
      const noua = Math.round(Math.max(HARTA_MIN, Math.min(HARTA_MAX, liber)));
      if (harta.style.height !== noua + "px") harta.style.height = noua + "px";
    };

    potriveste();
    /* Doua momente in care asezarea se schimba fara sa emita `resize`:
       cand se aseaza fonturile (serif-ul din salut si din numarul camerei
       schimba inaltimea a ce e deasupra cardului) si cand iframe-ul termina
       de incarcat. Fara ele, prima masuratoare ramane cea facuta pe fontul
       de rezerva, si e gresita cu cativa pixeli chiar pe incarcarea initiala —
       singura pe care o vede oaspetele. */
    document.fonts?.ready?.then(potriveste).catch(() => { /* fara fonturi, ramane cum e */ });
    window.addEventListener("load", potriveste);
    window.addEventListener("resize", potriveste);
    window.addEventListener("orientationchange", potriveste);
    /* Barele Safari se ascund si reapar la derulare fara sa emita `resize` pe
       window — dar visualViewport isi anunta schimbarea. */
    window.visualViewport?.addEventListener("resize", potriveste);
    const ochi = new ResizeObserver(potriveste);
    if (refCard.current?.parentElement) ochi.observe(refCard.current.parentElement);
    return () => {
      window.removeEventListener("load", potriveste);
      window.removeEventListener("resize", potriveste);
      window.removeEventListener("orientationchange", potriveste);
      window.visualViewport?.removeEventListener("resize", potriveste);
      ochi.disconnect();
    };
  }, [refCard, refHarta]);
}

function CumAjungi({ deschideAcces }) {
  const refCard = useRef(null);
  const refHarta = useRef(null);
  useInaltimeaHartii(refCard, refHarta);

  return (
    <div className="g-card g-drum" ref={refCard}>
      <h2>Cum ajungi la noi</h2>
      <p className="g-legaturi">
        {/* Perechea si bara dintre ele sunt un singur element de asezare:
            altfel „/" se rupe pe rand propriu si ramane atarnata la capat,
            aratand ca o greseala de tipar. */}
        {/* Cele doua harti stau impreuna, ca un singur element de asezare:
            sunt acelasi lucru facut in doua aplicatii, deci daca randul se
            rupe, se rup amandoua odata, nu una sus si una jos. */}
        <span className="g-pereche">
          {/* Marcile oficiale, luate din proiectul site-ului
              (public/assets/logo-*.webp), nu desenate de noi. Un pin si o
              sageata facute de mana ar fi fost si mai putin recunoscute, si
              in raspar cu regulile de marca ale celor doua companii. */}
          <a className="g-leg" href={LINK_MAPS} target="_blank" rel="noopener noreferrer">
            <img src="/brand/logo-google-maps.webp" alt="" width="15" height="15" />
            Google Maps
          </a>
          <a className="g-leg" href={LINK_WAZE} target="_blank" rel="noopener noreferrer">
            <img src="/brand/logo-waze.webp" alt="" width="15" height="15" />
            Waze
          </a>
        </span>
        <span className="g-sep" aria-hidden="true">•</span>
        {/* Ramane `button`, desi arata ca un link: nu duce nicaieri, deschide
            ceva pe loc. Un <a href="#"> ar minti cititorul de ecran si ar
            strica clicul cu rotita. Aspectul il face CSS-ul, nu eticheta. */}
        {/* Scris „Acces camere", nu „Acces către camere", si e o masuratoare,
            nu o preferinta: cu numele intreg randul nu incape pe un telefon
            de 375 sau 360px nici la 12px, marime la care textul deja nu se
            mai citeste comod in fata usii, seara. Numele intreg ramane in
            titlul ferestrei si in `aria-label`, deci un cititor de ecran il
            aude intreg. */}
        <button className="g-leg" type="button" onClick={deschideAcces}
                aria-label="Acces către camere">
          <Usa />Acces camere
        </button>
      </p>
      {/* Harta sub legaturi: intai butoanele cu care pornesti la drum, apoi
          imaginea locului, pentru cine vrea sa vada unde vine. */}
      <div className="g-harta-cadru" ref={refHarta}>
        <iframe
          className="g-harta-rama"
          src={HARTA_INCORPORATA}
          title="Harta către Complex La Livada"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
    </div>
  );
}

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
    <p className="g-vreme" title={v.text}>
      <span className="g-vreme-loc">{ACASA.localitate}</span>
      {VREME[v.fel] || VREME.innorat}
      <span className="g-vreme-grade">{v.grade}°</span>
    </p>
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
                    care avem voie sa folosim poza — de aceea pozele luate de
                    pe Wikimedia au mereu `credit`.
                    Pozele proprii ale pensiunii n-au: nu datoram atribuire
                    noua insine, iar o legenda „foto: undefined" ar fi fost
                    ceea ce apuca sa vada oaspetele. Fara garda de mai jos,
                    `a.credit.autor` chiar arunca si cade tot panoul. */}
                {a.credit ? (
                  <figcaption>
                    foto: {a.credit.autor} ·{" "}
                    <a href={a.credit.pagina} target="_blank" rel="noopener noreferrer">
                      {a.credit.licenta}
                    </a>
                  </figcaption>
                ) : null}
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
  /* Numit `aratAcces`, nu `acces`: acela e deja codul de acces al camerei,
     iar doua lucruri diferite cu acelasi nume in acelasi fisier e exact
     felul de confuzie care se plateste peste sase luni. */
  const [aratAcces, setAratAcces] = useState(false);
  const [aratRegulament, setAratRegulament] = useState(false);

  /* Fisa se cere o singura data per sejur. `null` = inca nu stim, true =
     completata. Cat timp nu stim, fereastra nu apare — un panou care
     clipeste la fiecare incarcare ar fi mai rau decat unul care intarzie o
     clipa. */
  const [fisaGata, setFisaGata] = useState(null);

  /* useCallback, si NU o functie scrisa in JSX. `fisaCompletata` intra in
     lista de dependente a efectului din Fisa.jsx; scrisa inline, ar fi alta
     functie la fiecare randare a lui App — iar App se re-randeaza de fiecare
     data cand oaspetele deschide un panou. Rezultatul ar fi fost o cerere
     noua catre baza la fiecare apasare pe „Wi-Fi". */
  const fisaCompletata = useCallback(() => setFisaGata(true), []);

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

  /* Felul camerei si numarul ei, separat — nu un singur sir. Omul care
     tocmai a ajuns cauta NUMARUL, ca sa stie la ce usa sa se duca; „Tiny
     house" ii spune doar ce fel de casuta e. Asa numarul poate fi scris
     mare, iar felul ramane eticheta mica de langa el. */
  const felCamera = TIP[sejur.roomType] || sejur.roomType || "";
  const nrCamera = sejur.roomName || "";

  /* „Important" incepe cu ce depinde de rezervarea asta si continua cu
     regulile generale din continut.js. Ora de plecare scrisa de mana in
     fisierul de continut ar fi fost gresita pentru orice sejur cu alta
     intelegere; asa vine din baza. */
  const important = [
    { titlu: "Decazarea", text: `Camera se eliberează ${ziSiOra(sejur.checkOut)}.` },
    acces?.code && {
      titlu: "Cât ține codul",
      text: `Codul ${acces.code}# funcționează până ${ziSiOra(acces.validUntil)}.`,
    },
    {
      titlu: "Dacă ușa nu se deschide",
      /* Numarul de asistenta, nu cel general de la subsol: cine sta in fata
         unei usi inchise are nevoie de omul care raspunde in cateva minute.
         Si e legatura de telefon, nu text: exact aici oaspetele are o mana
         pe clanta si cealalta pe telefon — un numar de copiat cu degetul e
         un pas in plus fix in clipa in care nu are rabdare de el.
         `text` primeste noduri, nu doar siruri; restul punctelor vin din
         continut.js, care e .js si nu poate purta JSX. */
      text: (
        <>
          Încearcă întâi codul pe tastatură, apoi sună-l pe {ASISTENTA.nume} la{" "}
          <a href={`tel:${ASISTENTA.telefon}`}>{ASISTENTA.scris}</a>. Răspundem non-stop.
        </>
      ),
    },
    ...IMPORTANT,
  ].filter(Boolean);

  return (
    <div className="g-pagina">
      <div className="g-salut">
        {/* Ora zilei la stanga, vremea la dreapta — deasupra siglei. */}
        <div className="g-salut-sus">
          <p className="g-salut-ora">{salut(new Date().getHours())}</p>
          <Vremea />
        </div>
        {/* Numele si sigla pe acelasi rand, centrate unul pe altul. */}
        <div className="g-salut-rand">
          {/* Spatiu neintrerupt inaintea emoji-ului: cu unul obisnuit, pe un
              telefon de 320px mana ramanea singura pe randul urmator, ca o
              greseala. Asa, ori sta langa ultimul cuvant, ori coboara
              impreuna cu el. */}
          <h1 className="g-salut-nume">
            {sejur.guestName || "bun venit"}{"\u00A0"}
            <span className="g-mana" role="img" aria-label="salut">👋</span>
          </h1>
          {/* Fisierul siglei e chiar cel folosit de
            rezervari.lalivada.ro — aceeasi marca, nu o refacere. */}
          {/* Spre pagina de rezervari, nu spre site: cine apasa sigla in
              timpul sejurului e deja aici — ce poate face mai departe e sa
              rezerve din nou, nu sa citeasca prezentarea. */}
          <a className="g-emblema" href="https://rezervari.lalivada.ro"
             target="_blank" rel="noopener noreferrer">
            <img src="/brand/livada-text.svg" alt="Complex La Livada"
                 width="132" height="33" />
          </a>
        </div>
      </div>

      <div className="g-hero">
        {/* Eticheta codului in stanga, camera in dreapta, pe acelasi rand.
            Randul de sus al cardului raspunde astfel la amandoua intrebarile
            omului din fata usii — la ce usa si cu ce cod — fara sa coste
            doua randuri. */}
        <div className="g-hero-sus">
          <p className="g-eticheta">Cod de acces</p>
          {(felCamera || nrCamera) && (
            <p className="g-hero-camera">
              {felCamera && <span className="g-hero-camera-fel">{felCamera}</span>}
              {nrCamera && <span className="g-hero-camera-nr">{nrCamera}</span>}
            </p>
          )}
        </div>
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

      {/* Fisa sta AICI, sub cardul cu codul si usa: deasupra ei ramane tot ce-i
          trebuie unui om in fata usii, iar sub ea sectiunile se ascund pana la
          semnare. Nu e un panou peste pagina — vezi comentariul din Fisa.jsx
          si docs/fisa-cazare.md 0. */}
      {fisaGata !== true && <Fisa cod={cod} onGata={fisaCompletata} />}

      {fisaGata === true && (<>
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

      {/* Numai pe prima pagina: cand se deschide un panou, cardul dispare.
          Pe langa ca asa s-a cerut, asta repara si o scapare de asezare —
          cu el intre butoane si panou, continutul aparea despartit de
          butonul care l-a deschis. Acum panoul urca imediat sub buton. */}
      {!deschis && <CumAjungi deschideAcces={() => setAratAcces(true)} />}

      {deschis === "venit" && (
        <div className="g-card">
          <h2>Bun venit la Livadă</h2>
          <Intro>{BUN_VENIT.intro}</Intro>

          <h3 className="g-eticheta-sectiune">Datele rezervării</h3>
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
          {/* Ascuns, nu zero: o rezervare fara pret in baza inseamna ca nu se
              stie cat e de plata, iar „0 lei" ar fi un raspuns gresit la o
              intrebare despre bani. */}
          {sejur.total != null && (
            <p className="g-total">
              <span>Total de plată</span>
              <b>{pret(sejur.total)}</b>
            </p>
          )}

          {BUN_VENIT.puncte.length > 0 && (
            <ul className="g-puncte g-puncte-sub-date">
              {BUN_VENIT.puncte.map((p, i) => (
                <li key={i}>
                  <b>{p.titlu}</b> —{" "}
                  {p.tare ? <>{p.inainte}<b>{p.tare}</b>{p.dupa}</> : p.text}
                  {p.actiune === "wifi" && <ConectareWifi />}
                  {p.actiune === "instalare" && <Instaleaza />}
                </li>
              ))}
            </ul>
          )}

          {/* Contactul sta la SFARSITUL panoului, nu la inceput: cine deschide
              „Bun venit" vrea intai sa-si vada sejurul. Butonul de ajutor e
              ultimul lucru pe care il vede, adica exact acolo unde il cauta
              cineva care n-a gasit ce-i trebuia mai sus. */}
          <div className="g-asistenta">
            <h3>Contact asistență</h3>
            <p className="g-asistenta-cine">
              <b>{ASISTENTA.nume}</b> — {ASISTENTA.raspuns}
            </p>
            <div className="g-asistenta-butoane">
              {/* wa.me, nu api.whatsapp.com: prima deschide direct aplicatia
                  daca e instalata si cade pe web doar daca nu e. */}
              <a className="g-contact g-contact-wa"
                 href={`https://wa.me/${ASISTENTA.wa}`}
                 target="_blank" rel="noopener noreferrer">
                <img src="/brand/logo-whatsapp.svg" alt="" width="18" height="18" />
                WhatsApp
              </a>
              <a className="g-contact" href={`tel:${ASISTENTA.telefon}`}>
                <Telefon />
                Sună
              </a>
            </div>
          </div>
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
          {/* Eticheta ingrosata, ca la punctele de deasupra: randul asta era
              singurul din panou fara nume, si se citea ca o nota agatata la
              sfarsit, nu ca inca o intrare din lista. */}
          <p className="g-legatura-rand">
            <b>Regulament:</b>{" "}
            {/* Buton, nu <a>: nu duce nicaieri, deschide o fereastra peste
                pagina. Un link cu href="#" ar fi mintit si tastatura, si
                cititoarele de ecran despre ce urmeaza sa se intample.
                Textul incepe cu verbul si din alt motiv: dupa eticheta
                „Regulament:", un „Regulamentul complexului" repeta cuvantul
                de care tocmai s-a agatat randul. */}
            <button type="button" className="g-legatura"
              onClick={() => setAratRegulament(true)}>
              Deschide regulamentul complexului
            </button>
          </p>
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

      </>)}

      <p className="g-subsol">
        Complex La Livada · <a href={`tel:${TELEFON}`}>{TELEFON_SCRIS}</a>
      </p>

      {aratAcces && (
        <Fereastra titlu="Acces către camere" onInchide={() => setAratAcces(false)}>
          <ContinutAcces />
        </Fereastra>
      )}

      {aratRegulament && (
        <Fereastra
          titlu="Regulamentul complexului"
          antet={
            <div className="g-reg-antet">
              <img src="/brand/livada-text.svg" alt="Complex La Livada"
                width="104" height="26" />
              <p>Regulament intern</p>
            </div>
          }
          onInchide={() => setAratRegulament(false)}>
          <p className="g-reg-intro">{REGULAMENT.intro}</p>
          <ul className="g-reg">
            {REGULAMENT.reguli.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Fereastra>
      )}
    </div>
  );
}
