import { supabase } from "./supabase.js";
/* Logica pura (preturi, disponibilitate, bani) traieste in ./lib — fara
   React, fara acces la baza de date, testabila direct. Vezi
   src/pricing.test.js. */
import {
  DEAD_STATUSES, isLive, startOfDay, nightsBetween, rangesOverlap,
  validateStay, occupancyForStay,
} from "./lib/availability.js";
import {
  inSeason, nightlyRate, liveReservationTotal, onlinePriceAdjustmentPct,
  liveReservationTotalOnline, reservationTotal,
} from "./lib/pricing.js";
import { round2, splitEvenly, calcAmounts } from "./lib/money.js";
/* Regula "cand trebuie resincronizat codul de acces" sta in lib si e
   testata separat (src/acces.test.js) — nu se rescrie aici. */
import { decideActiuneAcces } from "./lib/acces.js";
/* Regulile de tranzitie (check-in/out, anulare, no-show) si night audit-ul
   stau in lib ca sa existe o singura definitie, testata — vezi
   src/tranzitii.test.js. */
import {
  isSameDay, isToday, canCheckIn, canCheckOut, canCancel, canNoShow,
  checkouturiRestante, zileIntarziere, ORE_CHECKIN_DEVREME,
} from "./lib/tranzitii.js";
import { validateCUIFormat, validatePhone, validateEmail } from "./lib/validation.js";
import {
  FMT_MONEY, FMT_DATE, FMT_DATETIME, FMT_DATE_FULL, FMT_TIME, FMT_WEEKDAY, FMT_MONTH_YEAR,
  fmtMoney, fmtDate, fmtDateFull, fmtDateTime,
  toDateInput, toLocalInputValue, withNewDate, initials, validatePrice,
} from "./lib/format.js";
import {
  ROOM_TYPE, STATUS_LABEL, STATUS_GLYPH, STATUS_CLASS, CREATE_STATUSES, EDIT_STATUSES,
  INVOICE_STATUS_LABEL, INVOICE_STATUS_CLASS, PAYMENT_METHOD_LABEL,
  BILLING_PERMISSION_LABEL, BILLING_PERMISSION_KEYS,
  SOURCES, sourceLabel, DEFAULT_TAGS, ROLE_LABEL, JUDETE, TARI, PHONE_DIAL, DIAL_LIST,
} from "./lib/constante.js";
/* Stratul de acces la date — cererile catre Supabase, grupate pe domenii,
   ca sa se poata audita intr-un loc ce citeste si ce scrie aplicatia.
   Se migreaza domeniu cu domeniu; deocamdata contabilitatea. */
import {
  camelRes, snakeRes, camelGuest, snakeGuest, camelRoom, snakeRoom,
  camelGroup, snakeGroup, snakeTier, camelVatRate, snakeVatRate,
  camelPaymentMethod, snakePaymentMethod, camelProduct, snakeProduct,
  camelBillingCustomer, snakeBillingCustomer,
} from "./data/mapari.js";
import { syncTable, saveRatesAndSeasons, loadAll } from "./data/nucleu.js";
import {
  Dialog, toaster, ToastHost, Paginare, usePaginare,
  useModalLock, useAduInVizor, useVisualViewportHeight, PdfPreview,
} from "./ui/primitive.jsx";
import { K, loadShared, saveShared } from "./data/stare-partajata.js";
import { audit } from "./lib/audit.js";
import { occupantName, guestFullName } from "./lib/nume.js";
import { canBilling, billingPerms } from "./lib/permisiuni.js";
import { GUEST_HISTORY_PAGE_SIZE } from "./lib/constante.js";
import { isStatsEligible } from "./lib/availability.js";
import { Stat, Section, OccupantStepper } from "./ui/primitive.jsx";
import { generatePdfBlob } from "./lib/pdf.js";


import { HK_STATUSES, PERMISSIONS, ALL_PERMS, DEFAULT_ONLINE_TIERS } from "./lib/constante.js";
import * as dateContabilitate from "./data/contabilitate.js";
import * as dateFacturare from "./data/facturare.js";
import * as datePlati from "./data/plati.js";
import * as dateFolio from "./data/folio.js";
import * as datePersonal from "./data/personal.js";
import * as dateAcces from "./data/acces.js";
import { uid } from "./lib/uid.js";
import { mesajEroare } from "./lib/errors.js";
import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { createPortal } from "react-dom";

/* ECRANE INCARCATE LA CERERE.
   Nu toata lumea deschide rapoartele, contabilitatea sau administrarea de
   useri — o cameristă nu le poate deschide deloc. Pana acum codul lor
   ajungea in browser oricum, la fiecare pornire. Cu `lazy` se descarca abia
   la primul click, iar pornirea aduce doar ce se vede.
   Ce NU e lene: calendarul si ecranul Azi (primul lucru pe care il vede
   receptia), plus curatenia, singurul ecran al camerarelor. */
const CalendarView = lazy(() => import("./features/rezervari.jsx").then((m) => ({ default: m.CalendarView })));
const TodayView = lazy(() => import("./features/rezervari.jsx").then((m) => ({ default: m.TodayView })));
const ClientsView = lazy(() => import("./features/clienti.jsx").then((m) => ({ default: m.ClientsView })));
const RoomsView = lazy(() => import("./features/camere.jsx").then((m) => ({ default: m.RoomsView })));
const FinancialView = lazy(() => import("./features/facturare.jsx").then((m) => ({ default: m.FinancialView })));
const ReportsView = lazy(() => import("./features/setari.jsx").then((m) => ({ default: m.ReportsView })));
const UsersView = lazy(() => import("./features/setari.jsx").then((m) => ({ default: m.UsersView })));
const LogView = lazy(() => import("./features/setari.jsx").then((m) => ({ default: m.LogView })));
const ProfileView = lazy(() => import("./features/setari.jsx").then((m) => ({ default: m.ProfileView })));
const SettingsView = lazy(() => import("./features/setari.jsx").then((m) => ({ default: m.SettingsView })));
const HousekeepingView = lazy(() => import("./features/camere.jsx").then((m) => ({ default: m.HousekeepingView })));
const NightAuditGate = lazy(() => import("./features/rezervari.jsx").then((m) => ({ default: m.NightAuditGate })));
import {
  CalendarDays, Users, DoorOpen, Zap, UserCog, LogOut,
  Plus, X, Search, ChevronLeft, ChevronRight, Flame, Wind, Snowflake,
  Sparkles, Check, Trash2, Pencil, ShieldCheck, UsersRound,
  BarChart3, History, LogIn, Printer, Banknote, ArrowRight,
  Settings, Eye, XCircle, MoveRight, Tag as TagIcon, Rows2, Rows3, MessageSquare, Wrench, UserCheck,
  AlertTriangle, RefreshCw, Undo2, Copy, Info, Cpu, TrendingUp, Phone, MessageCircle,
  Package, Receipt, CreditCard, FileDown, Mail, KeyRound
} from "lucide-react";

/* ---------------------------------------------------------------
   DESIGN TOKENS + STILURI
   Stau in src/styles/pms.css, incarcat din src/main.jsx (dupa index.css —
   ordinea conteaza, vezi antetul acelui fisier). Au trait aici pana pe
   21 august 2026 ca template literal JS; un backtick scris intr-un
   comentariu din interiorul lui a lasat productia cu ecran alb pe
   20 august 2026, iar intr-un .css acel defect nu mai e posibil.
----------------------------------------------------------------*/

/* ---------------------------------------------------------------
   DATA HELPERS
----------------------------------------------------------------*/
/* uid s-a mutat in src/lib/uid.js — il foloseste si stratul de date, care
   n-are voie sa importe din interfata. Se importa mai sus. */

function seedCore() {
  const rooms = [];
  for (let n = 1001; n <= 1014; n++) {
    rooms.push({
      id: "r" + n, name: String(n), type: "tiny",
      boilerId: `shelly-boiler-${n}`, ventId: `shelly-vent-${n}`, sensiboId: `sensibo-${n}`,
    });
  }
  [1101, 1102].forEach((n) => {
    rooms.push({
      id: "r" + n, name: String(n), type: "loft",
      boilerId: `shelly-boiler-${n}`, ventId: `shelly-vent-${n}`, sensiboId: `sensibo-${n}`,
    });
  });
  const guests = [
    { id: "g1", lastName: "Popescu", firstName: "Andrei", name: "Popescu Andrei", phone: "0722 111 222", email: "andrei.popescu@example.com", address: "", city: "Cluj-Napoca", county: "Cluj", country: "România", notes: "" },
    { id: "g2", lastName: "Marin", firstName: "Elena", name: "Marin Elena", phone: "0733 222 333", email: "elena.marin@example.com", address: "", city: "București", county: "București", country: "România", notes: "Alergie la pene" },
    { id: "g3", lastName: "Ionescu", firstName: "Mihai", name: "Ionescu Mihai", phone: "0744 333 444", email: "", address: "", city: "", county: "Cluj", country: "România", notes: "" },
  ];
  const rates = {
    base: { tiny: 350, loft: 480 },
    seasons: [
      { id: uid(), name: "Vârf de sezon", start: "06-15", end: "09-15", tiny: 450, loft: 620 },
      { id: uid(), name: "Sărbători de iarnă", start: "12-20", end: "01-05", tiny: 500, loft: 680 },
    ],
  };
  return { rooms, guests, rates, tags: [...DEFAULT_TAGS] };
}

const SEED_GROUP_ID = "grp-seed";

function seedReservations(core) {
  const now = new Date();
  const in40 = new Date(now.getTime() + 40 * 60000);
  const tomorrow6pm = new Date(now); tomorrow6pm.setDate(now.getDate() + 1); tomorrow6pm.setHours(18, 0, 0, 0);
  const checkout2 = new Date(now); checkout2.setDate(now.getDate() + 3); checkout2.setHours(11, 0, 0, 0);

  // Group demo: four tiny houses over a weekend, each with its own occupant.
  const gIn = new Date(now); gIn.setDate(now.getDate() + 2); gIn.setHours(15, 0, 0, 0);
  const gOut = new Date(now); gOut.setDate(now.getDate() + 4); gOut.setHours(11, 0, 0, 0);
  const groupRooms = [
    { room: "r1005", occupant: "Popescu Andrei", adults: 2, children: 1 },
    { room: "r1006", occupant: "Marin Elena", adults: 2, children: 0 },
    { room: "r1007", occupant: "Ionescu Mihai", adults: 2, children: 2 },
    { room: "r1008", occupant: "Dumitru Ana", adults: 1, children: 0 },
  ];

  return [
    {
      id: uid(), roomId: "r1003", guestId: "g1",
      checkin: in40.toISOString(), checkout: checkout2.toISOString(),
      status: "confirmed", notes: "", adults: 2, children: 0, source: "direct", tags: [], messages: [],
    },
    {
      id: uid(), roomId: "r1101", guestId: "g2",
      checkin: tomorrow6pm.toISOString(), checkout: new Date(tomorrow6pm.getTime() + 2 * 86400000).toISOString(),
      status: "confirmed", notes: "", adults: 2, children: 0, source: "booking", tags: ["VIP"], messages: [],
    },
    ...groupRooms.map((g) => ({
      id: uid(), roomId: g.room, guestId: "g1", groupId: SEED_GROUP_ID,
      checkin: gIn.toISOString(), checkout: gOut.toISOString(),
      status: "confirmed", notes: "", occupantName: g.occupant,
      adults: g.adults, children: g.children, source: "direct", tags: [], messages: [],
    })),
  ];
}

/* Minimal first-run demo data: one small group so a brand-new install
   isn't an empty calendar. */
function seedGroups() {
  return [{
    id: SEED_GROUP_ID,
    name: "Familia Popescu",
    mainGuestId: "g1",
    createdAt: new Date().toISOString(),
    notes: "",
  }];
}

/* Dupa un deploy, fisierele ecranelor incarcate la cerere (lazy, vezi
   liniile 79-90) primesc alt hash. O fila ramasa deschisa dintr-o versiune
   veche incearca sa importe un fisier care nu mai exista pe server si pica
   aici cu "Importing a module script failed" / "Failed to fetch dynamically
   imported module" — mesaje de la browser, nu bug de-al nostru.
   Plasa secundara: Vite mai jos are propriul semnal, structural, pentru
   exact acest caz — ramane si potrivirea de text, pentru un caz prins de
   ErrorBoundary fara sa treaca prin acel eveniment. */
const esteEroareDeIncarcareModul = (error) =>
  /dynamically imported module|importing a module script failed|loading chunk/i
    .test(error?.message || "");

/* O reincarcare reala (nu doar stergerea erorii din React) rezolva cazul de
   mai sus, fiindca aduce din nou index.html si hash-urile curente.
   Racire, nu "o singura data pe toata durata filei": sessionStorage
   supravietuieste unui reload, deci un flag pus o singura data ar ramane
   activ pentru totdeauna — a doua eroare de acelasi fel, de la un deploy
   urmator din aceeasi zi, nu s-ar mai repara singura. 60s e suficient sa
   opreasca o bucla (esec imediat, la loc) fara sa blocheze un esec real,
   mai tarziu. */
const CHEIE_RELOAD_MODUL = "pms-reload-modul-la";
const RACIRE_RELOAD_MODUL_MS = 60_000;
function reincarcaDupaEsecModul() {
  const ultima = Number(sessionStorage.getItem(CHEIE_RELOAD_MODUL) || 0);
  if (Date.now() - ultima <= RACIRE_RELOAD_MODUL_MS) return;
  sessionStorage.setItem(CHEIE_RELOAD_MODUL, String(Date.now()));
  window.location.reload();
}
/* Vite emite acest eveniment tocmai pentru importul dinamic esuat dupa un
   deploy — semnal structural, nu text parsat, deci nu se strica daca un
   browser isi schimba formularea erorii. */
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", reincarcaDupaEsecModul);
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("PMS render error", error, info);
    if (esteEroareDeIncarcareModul(error)) reincarcaDupaEsecModul();
  }
  render() {
    if (this.state.error) {
      /* O reincarcare completa (retea) are rost doar cand promisiunea unui
         import lazy a picat de-adevaratelea — pentru orice alta eroare de
         randare (tranzitorie, fara legatura cu un deploy), stergerea
         starii locale remonteaza aplicatia instant, fara retea; utila la
         receptie, pe o conexiune care poate lipsi exact cand ai nevoie de
         reincarcare. */
      const eEsecModul = esteEroareDeIncarcareModul(this.state.error);
      return (
        <div className="pms">
          <div className="login-wrap">
            <div className="boot boot-error">
              <AlertTriangle size={24} />
              <div>
                <strong>Ceva n-a mers bine</strong>
                <p>{this.state.error?.message || "Eroare neașteptată în interfață."}</p>
              </div>
              <button className="btn btn-primary"
                onClick={() => eEsecModul ? window.location.reload() : this.setState({ error: null })}>
                <RefreshCw size={15} /> Reîncarcă interfața
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------------------------------------------------------
   GENERARE PDF — direct din DOM (html2canvas + jsPDF), nu window.print().
   Safari/WebKit are mai multe bug-uri cunoscute la randarea print-ului
   (fantome de position:sticky, pagini goale) care nu apar deloc pe Chrome
   — html2canvas rastrizeaza elementul o singura data intr-un canvas, deci
   rezultatul e identic pe orice browser si nu mai depinde deloc de motorul
   de print/paginare al fiecaruia.

   Intoarce un Blob, nu descarca. Fisierele aterizau inainte direct in
   Downloads, ceea ce pe telefon insemna ca trebuia sa iesi din aplicatie
   ca sa vezi ce ai generat; acum se deschid intr-un vizualizator in
   aplicatie (PdfPreview), de unde pot fi si salvate daca chiar e nevoie.
----------------------------------------------------------------*/
function validCore(c) {
  if (!c || typeof c !== "object") return false;
  return Array.isArray(c.rooms) && Array.isArray(c.guests);
}

function repairCore(c) {
  const seed = seedCore();
  if (!validCore(c)) return seed;
  return {
    ...c,
    rooms: c.rooms.filter((r) => r && r.id && r.name)
      .map((r) => ({ ...r, type: r.type === "loft" ? "loft" : "tiny" })),
    guests: c.guests.filter((g) => g && g.id),
    rates: (c.rates && c.rates.base) ? c.rates : seed.rates,
    tags: Array.isArray(c.tags) && c.tags.length ? c.tags : [...DEFAULT_TAGS],
  };
}

function repairReservations(list, core) {
  if (!Array.isArray(list)) return [];
  const roomIds = new Set(core.rooms.map((r) => r.id));
  return list.filter((r) =>
    r && typeof r.id === "string" && roomIds.has(r.roomId) &&
    !isNaN(new Date(r.checkin).getTime()) && !isNaN(new Date(r.checkout).getTime()) &&
    new Date(r.checkout) > new Date(r.checkin)
  ).map((r) => ({
    ...r,
    status: STATUS_LABEL[r.status] ? r.status : "confirmed",
    adults: Number.isFinite(Number(r.adults)) && Number(r.adults) > 0 ? Number(r.adults) : 2,
    children: Number.isFinite(Number(r.children)) && Number(r.children) >= 0 ? Number(r.children) : 0,
    occupantName: typeof r.occupantName === "string" ? r.occupantName : "",
    tags: Array.isArray(r.tags) ? r.tags : [],
    messages: Array.isArray(r.messages) ? r.messages : [],
  }));
}

function repairBlocks(list, core) {
  if (!Array.isArray(list)) return [];
  const roomIds = new Set(core.rooms.map((r) => r.id));
  return list.filter((b) =>
    b && b.id && roomIds.has(b.roomId) &&
    !isNaN(new Date(b.start).getTime()) && !isNaN(new Date(b.end).getTime()) &&
    new Date(b.end) > new Date(b.start));
}

/* Safari iOS raporteaza gresit 100vh (include zona ascunsa sub bara de
   adrese), iar 100dvh nu e suportat decat din iOS 15.4. window.visualViewport
   e sustinut din iOS 13 si da inaltimea vizibila reala — o punem intr-o
   variabila CSS pe care o foloseste fereastra modala pentru dimensionare.
   offsetTop conteaza la fel de mult: cand bara de adrese e vizibila, zona
   vizibila incepe mai jos decat y=0 al paginii, iar un element position:fixed
   cu top:0 se ancoreaza tot la y=0 (sub bara de adrese) daca nu scadem si
   asta — altfel varful ferestrei modale ramane ascuns/taiat.
   Valorile astea nu sunt stabile chiar de la incarcarea paginii — Safari
   le "aseaza" pe masura ce utilizatorul interactioneaza. De-aia le
   recitim si in useModalLock, nu doar o singura data la pornirea
   aplicatiei, ca fereastra sa fie corecta chiar daca utilizatorul
   deschide un popup fara sa fi derulat pagina inainte. */
function PMSApp() {
  useVisualViewportHeight();
  const [loading, setLoading] = useState(true);
  const [core, setCore] = useState({ rooms: [], guests: [] });
  const [reservations, setReservations] = useState([]);
  const [housekeeping, setHousekeeping] = useState({});
  const [groups, setGroups] = useState([]);
  const [logEntries, setLogEntries] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [initError, setInitError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState("calendar");

  /* Golirea completa a datelor tinute in memorie. Deconectarea stergea
     doar sesiunea Supabase: rezervarile, oaspetii si jurnalul ramaneau in
     starea React si erau inca vizibile pe ecranul urmatorului care se
     autentifica pe acelasi calculator, pana la prima reincarcare.
     Folosim doar setterele de stare (identitate stabila) plus cele doua
     obiecte de la nivel de modul; ref-urile se resincronizeaza singure
     din useEffect-urile lor. */
  const resetStareLocala = useCallback(() => {
    setCore({ rooms: [], guests: [] });
    setReservations([]);
    setHousekeeping({});
    setGroups([]);
    setLogEntries([]);
    setBlocks([]);
    setInitError(null);
    setView("calendar");
    audit.entries = [];
    audit.user = null;
    audit.setEntries = null;
    billingPerms.role = null;
    billingPerms.set = new Set();
  }, []);

  /* La refresh de pagina, Supabase are deja sesiunea in localStorage —
     o refolosim ca sa nu ceara login din nou de fiecare data. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const session = await datePersonal.sesiuneCurenta();
        if (session?.user) {
          const st = await datePersonal.membruPersonal(session.user.id);
          if (alive && st) setCurrentUser({ id: session.user.id, name: st.name, role: st.role });
        }
      } finally {
        if (alive) setAuthChecked(true);
      }
    })();
    /* Supabase propaga evenimentele de autentificare intre taburile
       aceluiasi browser, deci o deconectare intr-un tab goleste datele si
       in celelalte, nu doar in cel in care s-a apasat butonul. */
    const dezaboneaza = datePersonal.laSchimbareSesiune((eveniment) => {
      if (eveniment === "SIGNED_OUT") { setCurrentUser(null); resetStareLocala(); }
    });
    return () => { alive = false; dezaboneaza(); };
  }, [resetStareLocala]);

  /* Rolul se citeste o singura data, la autentificare. Un tab lasat
     deschis continua altfel sa lucreze cu drepturile vechi dupa ce
     adminul le-a schimbat — pana la un refresh manual. Reverificam la
     revenirea pe tab si periodic; daca randul din staff a disparut
     (acces retras), deconectam. Baza impune oricum regulile prin RLS —
     asta doar aliniaza interfata la realitate. */
  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    const verifica = async () => {
      const { data: st, error } = await supabase
        .from("staff").select("name, role").eq("user_id", currentUser.id).maybeSingle();
      if (!alive || error) return;
      if (!st) {
        toaster.show("Contul tău nu mai are acces în aplicație.", { tone: "danger" });
        await datePersonal.deconecteaza();
        return;
      }
      if (st.role !== currentUser.role || st.name !== currentUser.name) {
        setCurrentUser((u) => (u ? { ...u, name: st.name, role: st.role } : u));
        if (st.role !== currentUser.role) {
          toaster.show("Drepturile contului tău au fost modificate între timp.", { tone: "danger" });
        }
      }
    };
    const laFocus = () => verifica();
    window.addEventListener("focus", laFocus);
    const cronometru = setInterval(verifica, 5 * 60 * 1000);
    return () => {
      alive = false;
      window.removeEventListener("focus", laFocus);
      clearInterval(cronometru);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!authChecked) return;
    let alive = true;
    (async () => {
      try {
        if (!currentUser) { if (alive) setLoading(false); return; }
        const db = await loadAll();
        // Setarile care nu au tabel propriu (useri, ore check-in etc.)
        // raman in app_state; restul vine acum din tabele reale.
        const settings = (await loadShared(K.core, null)) || {};
        const c = repairCore({
          ...settings,
          rooms: db.rooms,
          guests: db.guests,
          rates: db.rates,
          onlinePricing: db.onlinePricing,
          billingCustomers: db.billingCustomers,
          vatRates: db.vatRates,
          products: db.products,
          paymentMethods: db.paymentMethods,
        });
        /* Rezervarile facute inainte de pretul inghetat (bookedPrice) inca
           n-au un snapshot — le calculam o singura data, acum, cu tarifele
           curente, ca sa nu mai fie afectate de modificari viitoare de
           tarife. Scriere in fundal, fara sa blocheze incarcarea; no-op
           la urmatoarele porniri, odata ce fiecare rezervare are snapshot. */
        const rawRes = db.reservations;
        const r = rawRes.map((x) => (x.priceOverride == null && x.bookedPrice == null)
          ? { ...x, bookedPrice: liveReservationTotalOnline(x, c, rawRes) }
          : x);
        const backfilled = r.filter((x, i) => x !== rawRes[i]);
        if (backfilled.length) {
          syncTable("reservations", [], backfilled, snakeRes)
            /* Backfill-ul avanseaza updated_at in baza; fara preluarea
               stampilelor noi, prima salvare facuta de utilizator pe una
               dintre rezervarile astea ar fi respinsa ca modificare
               concurenta, desi n-a intervenit nimeni. */
            .then((scrise) => {
              if (!alive || !scrise.length) return;
              const stampile = new Map(scrise.map((x) => [x.id, x.updated_at]));
              setReservations((cur) => cur.map((x) =>
                stampile.has(x.id) ? { ...x, updatedAt: stampile.get(x.id) } : x));
            })
            .catch((e) => console.error("Backfill bookedPrice esuat", e));
        }
        const gr = db.groups.filter((g) => r.some((x) => x.groupId === g.id));
        const bl = db.blocks;

        let h = await loadShared(K.hk, null);
        if (!h || typeof h !== "object" || Array.isArray(h)) {
          h = {};
          c.rooms.forEach((rm) => { h[rm.id] = { status: "clean", updatedAt: new Date().toISOString() }; });
          await saveShared(K.hk, h);
        }
        let lg = await loadShared(K.log, []);
        if (!Array.isArray(lg)) lg = [];
        if (!alive) return;
        audit.entries = lg; audit.setEntries = setLogEntries;
        setCore(c); setReservations(r); setHousekeeping(h);
        setGroups(gr); setBlocks(bl); setLogEntries(lg);
      } catch (err) {
        console.error("PMS init failed", err);
        if (alive) setInitError(mesajEroare(err, "Aplicația nu a putut porni"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reloadKey, currentUser, authChecked]);

  /* Fiecare functie trimite doar randurile schimbate. Starea locala
     se actualizeaza imediat, iar daca scrierea esueaza (de ex. camera
     tocmai a fost ocupata de altcineva) eroarea ajunge la utilizator
     si datele se reincarca din baza. */
  const coreRef = useRef(core);
  useEffect(() => { coreRef.current = core; }, [core]);
  const resRef = useRef(reservations);
  useEffect(() => { resRef.current = reservations; }, [reservations]);
  const grRef = useRef(groups);
  useEffect(() => { grRef.current = groups; }, [groups]);
  const blRef = useRef(blocks);
  useEffect(() => { blRef.current = blocks; }, [blocks]);
  const housekeepingRef = useRef(housekeeping);
  useEffect(() => { housekeepingRef.current = housekeeping; }, [housekeeping]);

  const raporteazaEroare = useCallback((e) => {
    /* Traducerea (coduri Postgres -> limbaj de recepție) sta in
       lib/errors.js, ca sa fie o singura definitie folosita peste tot,
       nu cate un lant de if-uri in fiecare ecran. */
    toaster.show(mesajEroare(e, "Salvarea a eșuat"), { tone: "danger" });
    setReloadKey((k) => k + 1);
  }, []);

  const updateCore = useCallback(async (next) => {
    const before = coreRef.current;
    setCore(next);
    try {
      await syncTable("rooms", before.rooms, next.rooms, snakeRoom);
      await syncTable("guests", before.guests, next.guests, snakeGuest);
      if (next.rates !== before.rates) await saveRatesAndSeasons(before.rates || {}, next.rates || {});
      if (next.onlinePricing !== before.onlinePricing) {
        await syncTable("online_pricing_tiers", before.onlinePricing || [], next.onlinePricing || [], snakeTier);
      }
      if (next.billingCustomers !== before.billingCustomers) {
        await syncTable("billing_customers", before.billingCustomers || [], next.billingCustomers || [], snakeBillingCustomer);
      }
      if (next.vatRates !== before.vatRates) {
        await syncTable("vat_rates", before.vatRates || [], next.vatRates || [], snakeVatRate);
      }
      if (next.products !== before.products) {
        await syncTable("products", before.products || [], next.products || [], snakeProduct);
      }
      if (next.paymentMethods !== before.paymentMethods) {
        await syncTable("payment_methods", before.paymentMethods || [], next.paymentMethods || [], snakePaymentMethod);
      }
      const { rooms, guests, rates, onlinePricing, billingCustomers, vatRates, products, paymentMethods, ...settings } = next;
      await saveShared(K.core, settings);
    } catch (e) { raporteazaEroare(e); }
  }, [raporteazaEroare]);

  const updateReservations = useCallback(async (next) => {
    const before = resRef.current;
    setReservations(next);
    /* Ref-ul se actualizeaza si sincron, nu doar prin useEffect: doua
       salvari rapide una dupa alta ar citi altfel starea veche si ar
       trimite o stampila deja depasita, respinsa inutil ca si conflict. */
    resRef.current = next;
    try {
      const scrise = await syncTable("reservations", before, next, snakeRes);
      /* Stampila noua vine de la server; fara pasul asta, urmatoarea
         salvare a aceluiasi utilizator ar trimite-o pe cea veche si ar fi
         respinsa ca modificare concurenta, desi e tot el. */
      if (scrise.length) {
        const stampile = new Map(scrise.map((r) => [r.id, r.updated_at]));
        const actualizate = resRef.current.map((r) =>
          stampile.has(r.id) ? { ...r, updatedAt: stampile.get(r.id) } : r);
        resRef.current = actualizate;
        setReservations(actualizate);
      }
    } catch (e) { raporteazaEroare(e); }
  }, [raporteazaEroare]);

  const updateGroups = useCallback(async (next) => {
    const before = grRef.current;
    setGroups(next);
    try { await syncTable("res_groups", before, next, snakeGroup); }
    catch (e) { raporteazaEroare(e); }
  }, [raporteazaEroare]);

  const updateBlocks = useCallback(async (next) => {
    const before = blRef.current;
    setBlocks(next);
    try {
      await syncTable("reservations", before, next, (b) => ({
        id: b.id, room_id: b.roomId,
        checkin: new Date(b.start).toISOString(),
        checkout: new Date(b.end).toISOString(),
        status: "confirmed", source: "blocaj", notes: b.reason || null,
      }));
    } catch (e) { raporteazaEroare(e); }
  }, [raporteazaEroare]);

  const updateHousekeeping = useCallback(async (next) => {
    const before = housekeepingRef.current;
    setHousekeeping(next);
    housekeepingRef.current = next;
    try {
      await saveShared(K.hk, next);
    } catch (e) {
      /* Fara asta, un status de curatenie care nu s-a putut salva ramanea
         afisat ca si cum ar fi fost scris, pana la urmatoarea reincarcare. */
      console.error("Salvarea statusului camerelor a esuat", e);
      setHousekeeping(before);
      housekeepingRef.current = before;
      toaster.show(mesajEroare(e, "Statusul camerei nu a putut fi salvat"), { tone: "danger" });
    }
  }, []);

  useEffect(() => { audit.user = currentUser; }, [currentUser]);

  /* Adminii au automat tot (vezi canBilling); pentru restul, incarcam
     doar drepturile explicit acordate din billing_permissions. */
  useEffect(() => {
    let alive = true;
    billingPerms.role = currentUser?.role || null;
    billingPerms.set = new Set();
    if (currentUser && currentUser.role !== "admin") {
      datePersonal.permisiunileMele(currentUser.id)
        .then((lista) => { if (alive) billingPerms.set = new Set(lista); })
        .catch((e) => console.error("citire permisiuni", e));
    }
    return () => { alive = false; };
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      setView(defaultViewFor(currentUser.role));
    }
  }, [currentUser]);

  /* Ceas propriu pentru night audit. Aplicatia nu are realtime si nici
     polling pe rezervari, deci o fila lasata deschisa peste noapte n-ar
     observa singura ca plecarile de ieri au devenit restante — blocajul ar
     aparea abia la urmatorul refresh. Un tick pe minut e destul: pragul e
     ziua, nu ora. */
  const [tickAudit, setTickAudit] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTickAudit(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const restanteAudit = useMemo(
    () => checkouturiRestante(reservations, new Date(tickAudit)),
    [reservations, tickAudit]);

  if (loading) {
    return (
      <div className="pms">
        <div className="skeleton-shell" aria-busy="true" aria-label="Se încarcă">
          <div className="sk sk-topbar" />
          <div className="skeleton-body">
            <div className="sk-row">
              {[0, 1, 2, 3].map((i) => <div className="sk sk-stat" key={i} />)}
            </div>
            <div className="sk sk-block" />
            <div className="sk-row">
              <div className="sk sk-panel" />
              <div className="sk sk-panel" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="pms">
        <div className="login-wrap">
          <div className="boot boot-error">
            <AlertTriangle size={24} />
            <div>
              <strong>Aplicația nu a putut porni</strong>
              <p>{initError}</p>
            </div>
            <button className="btn btn-primary" onClick={() => {
              setInitError(null); setLoading(true); setReloadKey((k) => k + 1);
            }}>
              <RefreshCw size={15} /> Încearcă din nou
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="pms">
        <Login onLogin={setCurrentUser} />
      </div>
    );
  }

  /* NIGHT AUDIT — blocaj pana se inchide ziua.
   *
   * Nu are buton de ocolire: decizia e ca disciplina de inchidere sa fie
   * obligatorie. Nu se poate ajunge la un blocaj permanent, fiindca fiecare
   * rezervare din lista e "checked-in", iar canCheckOut cere exact atat —
   * deci fiecare rand poate fi rezolvat pe loc, din ecranul asta.
   *
   * Housekeeping nu e blocat: nu poate face check-out, deci blocarea lui ar
   * opri curatenia fara sa deblocheze nimic. */
  if (restanteAudit.length > 0 && ["admin", "receptionist"].includes(currentUser.role)) {
    return (
      <div className="pms">
        <ToastHost />
        {/* Poarta de night audit e incarcata la cerere ca restul ecranelor,
            deci are nevoie de granita ei de asteptare — altfel React arunca
            "suspended while responding to synchronous input". */}
        <Suspense fallback={<div className="login-wrap"><div className="boot">Se încarcă…</div></div>}>
        <NightAuditGate
          restante={restanteAudit}
          core={core}
          groups={groups}
          reservations={reservations}
          updateReservations={updateReservations}
          housekeeping={housekeeping}
          updateHousekeeping={updateHousekeeping}
          onLogout={async () => {
            try { await datePersonal.deconecteaza(); } finally { setCurrentUser(null); resetStareLocala(); }
          }}
        />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="pms">
      <ToastHost />
      <Shell
        user={currentUser}
        view={view}
        setView={setView}
        /* Golim si local, nu doar sesiunea: daca reteaua pica in timpul
           signOut, evenimentul SIGNED_OUT poate sa nu ajunga, iar datele
           ar ramane pe ecran. */
        onLogout={async () => {
          try { await datePersonal.deconecteaza(); } finally { setCurrentUser(null); resetStareLocala(); }
        }}
        core={core}
        updateCore={updateCore}
        reservations={reservations}
        updateReservations={updateReservations}
        housekeeping={housekeeping}
        updateHousekeeping={updateHousekeeping}
        groups={groups}
        updateGroups={updateGroups}
        blocks={blocks}
        updateBlocks={updateBlocks}
        logEntries={logEntries}
      />
    </div>
  );
}

/* ---------------------------------------------------------------
   NIGHT AUDIT — inchiderea zilei
----------------------------------------------------------------*/
/* Ecran de blocaj: cat timp exista camere care trebuiau eliberate in zilele
   trecute dar au ramas "checked-in", nu se poate lucra in aplicatie.
   Fara buton de ocolire — dar cu check-out direct de aici, deci blocajul e
   intotdeauna rezolvabil din ecranul insusi. */
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const data = await datePersonal.autentifica(email.trim(), password);
      const st = await datePersonal.membruPersonal(data.user.id);
      if (!st) {
        await datePersonal.deconecteaza();
        throw new Error("Contul nu are drepturi in aplicatie.");
      }
      onLogin({ id: data.user.id, name: st.name, role: st.role });
    } catch (e) {
      setError(mesajEroare(e));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo.svg" alt="La Livadă" className="login-logo-img" />
          <div>
            <h1>La Livada PMS</h1>
            <p>Autentifica-te pentru a continua</p>
          </div>
        </div>
        <label className="field">
          <span className="fl">Email</span>
          <input type="email" value={email} autoComplete="username"
            onChange={(e) => { setEmail(e.target.value); setError(""); }} />
        </label>
        <label className="field">
          <span className="fl">Parola</span>
          <input type="password" value={password} autoComplete="current-password"
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        <button className="btn btn-primary" onClick={submit}
          disabled={busy || !email.trim() || !password}>
          <ShieldCheck size={15} /> {busy ? "Se verifica..." : "Intra in cont"}
        </button>
        {error && <div className="error-text" role="alert">{error}</div>}
      </div>
    </div>
  );
}


/* ---------------------------------------------------------------
   APP SHELL — nav + routed content
----------------------------------------------------------------*/
/* Navigation lives in the top bar: the brand returns to Azi, Calendar sits
   beside it, and everything else is grouped under Setări. */
const SETTINGS_ITEMS = [
  { key: "clients", label: "Clienți", icon: Users, desc: "Oaspeți și grupuri", roles: ["admin", "receptionist"] },
  { key: "automation", label: "Automatizare", icon: Zap, desc: "Boiler, aer condiționat și ventilație înainte de sosire", roles: ["admin", "receptionist"] },
  { key: "rooms", label: "Camere și tarife", icon: DoorOpen, desc: "Numere, tip, dispozitive Shelly/Sensibo și prețuri", roles: ["admin"] },
  { key: "financial", label: "Financiar", icon: Receipt, desc: "Facturi, încasări, produse și TVA", roles: ["admin"] },
  { key: "reports", label: "Rapoarte", icon: BarChart3, desc: "Ocupare, venit, ADR și RevPAR pe luni", roles: ["admin"] },
  { key: "users", label: "Useri și drepturi", icon: UserCog, desc: "Conturi și roluri", roles: ["admin"] },
  { key: "log", label: "Jurnal de activitate", icon: History, desc: "Cine ce a modificat și când", roles: ["admin", "receptionist"] },
];

const VIEW_TITLES = {
  today: ["Azi", "Sosiri, plecări și camere de pregătit"],
  reports: ["Rapoarte", "Ocupare, venituri și tarif mediu"],
  log: ["Jurnal de activitate", "Cine ce a modificat"],
  settings: ["Setări", "Configurare și administrare"],
  calendar: ["Calendar rezervări", "Vizualizare pe camere, următoarele 30 de zile"],
  clients: ["Clienți", "Oaspeți și grupuri"],
  housekeeping: ["Status camere", "Curățenie și pregătire pentru sosiri"],
  automation: ["Automatizare pre-sosire", "Boiler · aer condiționat · ventilație"],
  rooms: ["Configurare camere", "Mapare dispozitive Shelly / Sensibo"],
  financial: ["Financiar", "Facturi, încasări, produse și TVA"],
  users: ["Useri și drepturi", "Acces pe roluri"],
  profile: ["Profilul meu", "Cont și securitate"],
};

const VIEW_ROLES = {
  today: ["admin", "receptionist"],
  calendar: ["admin", "receptionist"],
  housekeeping: ["admin", "receptionist", "housekeeping"],
  clients: ["admin", "receptionist"],
  automation: ["admin", "receptionist"],
  settings: ["admin", "receptionist"],
  profile: ["admin", "receptionist", "housekeeping"],
  rooms: ["admin"],
  financial: ["admin"],
  reports: ["admin"],
  users: ["admin"],
  log: ["admin", "receptionist"],
  seed: ["admin"],
};
const mayView = (view, role) => (VIEW_ROLES[view] || []).includes(role);

function defaultViewFor(role) {
  return role === "housekeeping" ? "housekeeping" : "today";
}

function Shell({ user, view, setView, onLogout, core, updateCore, reservations, updateReservations, housekeeping, updateHousekeeping, groups, updateGroups, blocks, updateBlocks, logEntries }) {
  const [calendarIntent, setCalendarIntent] = useState(null);

  const settingsItems = SETTINGS_ITEMS.filter((i) => i.roles.includes(user.role));
  const homeView = defaultViewFor(user.role);
  const canCalendar = mayView("calendar", user.role);

  // Snap back to a permitted screen if the current one isn't allowed for this role.
  useEffect(() => {
    if (!mayView(view, user.role)) setView(homeView);
  }, [view, user.role, homeView, setView]);

  const safeView = mayView(view, user.role) ? view : homeView;
  const [title] = VIEW_TITLES[safeView] || ["", ""];

  return (
    <div className="shell">
      <div className="main">
        <header className={"topbar" + (safeView === "calendar" ? " topbar-cal" : "")}>
          <button className="brand-block" onClick={() => setView(homeView)} title="Înapoi la Azi">
            <span className="brand-mark"><DoorOpen size={16} /></span>
            <span className="brand-text">
              <span className="brand-name">La Livada</span>
              <span className="sub">{title}</span>
            </span>
          </button>

          <div className="topbar-actions">
            {canCalendar && (
              <button
                className={"top-btn" + (safeView === "calendar" ? " active" : "")}
                onClick={() => setView("calendar")}
                aria-label="Calendar"
              >
                <CalendarDays size={16} /> <span>Calendar</span>
              </button>
            )}
            {settingsItems.length > 0 && (
              <button
                className={"icon-btn gear-btn" + (["settings", ...settingsItems.map((i) => i.key)].includes(safeView) ? " active" : "")}
                onClick={() => setView("settings")}
                title="Setări"
                aria-label="Setări"
              >
                <Settings size={17} />
              </button>
            )}
            <button
              className={"avatar-btn" + (safeView === "profile" ? " active" : "")}
              onClick={() => setView("profile")}
              title={`${user.name} — ${ROLE_LABEL[user.role]}`}
              aria-label="Profilul meu"
            >
              {initials(user.name)}
            </button>
          </div>
        </header>

        <div className={"content" + (safeView === "calendar" ? " content-cal" : "")}>
          {/* Ecranele incarcate la cerere au nevoie de o granita de asteptare.
              Mesajul e discret deliberat: pe o conexiune buna chunk-ul vine in
              zeci de milisecunde, iar un spinner mare ar clipi suparator. */}
          <Suspense fallback={<div className="note">Se încarcă…</div>}>
          {safeView === "profile" && (
            <ProfileView user={user} onLogout={onLogout} onBack={() => setView(homeView)} />
          )}
          {safeView === "settings" && <SettingsView setView={setView} items={settingsItems} />}
          {safeView === "today" && (
            <TodayView core={core} updateCore={updateCore} reservations={reservations}
              updateReservations={updateReservations} housekeeping={housekeeping}
              updateHousekeeping={updateHousekeeping} setView={setView} groups={groups}
              updateGroups={updateGroups} blocks={blocks} updateBlocks={updateBlocks} />
          )}
          {safeView === "reports" && <ReportsView core={core} reservations={reservations} />}
          {safeView === "log" && <LogView entries={logEntries} />}
          {safeView === "calendar" && (
            <CalendarView core={core} updateCore={updateCore} reservations={reservations}
              updateReservations={updateReservations} groups={groups} updateGroups={updateGroups}
              housekeeping={housekeeping} updateHousekeeping={updateHousekeeping}
              blocks={blocks} updateBlocks={updateBlocks}
              intent={calendarIntent} clearIntent={() => setCalendarIntent(null)} />
          )}
          {safeView === "clients" && (
            <ClientsView core={core} updateCore={updateCore} groups={groups} updateGroups={updateGroups}
              reservations={reservations} updateReservations={updateReservations} blocks={blocks}
              onNewGroup={() => { setCalendarIntent("group"); setView("calendar"); }} />
          )}
          {safeView === "housekeeping" && (
            <HousekeepingView core={core} reservations={reservations} housekeeping={housekeeping} updateHousekeeping={updateHousekeeping} />
          )}
          {safeView === "automation" && <AutomationView core={core} reservations={reservations} />}
          {safeView === "rooms" && (
            <RoomsView core={core} updateCore={updateCore}
              reservations={reservations} updateReservations={updateReservations}
              blocks={blocks} updateBlocks={updateBlocks} />
          )}
          {safeView === "financial" && <FinancialView core={core} updateCore={updateCore} />}
          {safeView === "users" && <UsersView />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   AUTOMATION STRIP — shared signature element (used on Calendar + Automation)
----------------------------------------------------------------*/
function computeTriggers(core, reservations, hoursAhead = 24) {
  const now = new Date();
  const horizon = new Date(now.getTime() + hoursAhead * 3600000);
  const list = [];
  reservations
    .filter((r) => r.status === "confirmed" || r.status === "checkedin")
    .forEach((r) => {
      const checkin = new Date(r.checkin);
      const trigger = new Date(checkin.getTime() - 60 * 60000); // -1h
      if (trigger > horizon) return;
      if (checkin < now && r.status !== "checkedin") return;
      const room = core.rooms.find((rm) => rm.id === r.roomId);
      if (!room) return;
      const diffMin = Math.round((trigger.getTime() - now.getTime()) / 60000);
      list.push({ reservation: r, room, checkin, trigger, diffMin });
    });
  return list.sort((a, b) => a.trigger - b.trigger);
}

function triggerLabel(diffMin) {
  if (diffMin <= 0) return { text: "Pornit", cls: "done" };
  if (diffMin < 60) return { text: `Pornește în ${diffMin} min`, cls: "soon" };
  const h = Math.floor(diffMin / 60), m = diffMin % 60;
  return { text: `Pornește în ${h}h ${m}min`, cls: "later" };
}

/* ---------------------------------------------------------------
   GROUP ROOMING LIST (printable)
----------------------------------------------------------------*/
function AutomationView({ core, reservations }) {
  const triggers = useMemo(() => computeTriggers(core, reservations, 72), [core, reservations]);
  return (
    <div>
      <div className="note">
        Această pagină arată doar starea programărilor. Comenzile efective către boiler, AC și ventilație sunt
        trimise de workflow-ul n8n către Home Assistant, pe baza ID-urilor de dispozitiv setate în Configurare camere —
        nu din acest ecran.
      </div>
      <div className="panel">
        {triggers.length === 0 ? (
          <div className="empty-state">
            <Zap size={26} />
            <h4>Nimic programat</h4>
            <p>Nicio sosire în următoarele 72h.</p>
          </div>
        ) : (
          triggers.map((t) => {
            const lbl = triggerLabel(t.diffMin);
            return (
              <div className="list-row" key={t.reservation.id}>
                <div>
                  <div className="primary">{t.room.name}</div>
                  <div className="secondary">Check-in {fmtDateTime(t.checkin)} · declanșare {fmtDateTime(t.trigger)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--text-muted)" }}>
                    <Flame size={13} /><Wind size={13} /><Snowflake size={13} />
                  </span>
                  <span className={"role-tag " + (lbl.cls === "done" ? "role-housekeeping" : lbl.cls === "soon" ? "role-admin" : "role-receptionist")}>
                    {lbl.text}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   CALENDAR VIEW
----------------------------------------------------------------*/
export default function PMSAppRoot() {
  return (
    <ErrorBoundary>
      <PMSApp />
    </ErrorBoundary>
  );
}
