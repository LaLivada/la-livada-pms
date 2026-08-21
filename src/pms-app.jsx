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
import {
  canBilling, billingPerms, billingCustomerLabel,
  emiteFactura, ensureCazareLine, FolioPanel, InvoiceBuilderModal,
  InvoicePrint, InvoicesListView, PaymentsListView, ProductsView,
  BillingPermissionsView, FinancialView, AccountingExportView,
  BillingCustomerPicker, BillingCustomerModal, InvoiceIssuerCard,
  PaymentMethodsEditor, ReceiptSeriesEditor,
} from "./features/facturare.jsx";
import * as dateContabilitate from "./data/contabilitate.js";
import * as dateFacturare from "./data/facturare.js";
import * as datePlati from "./data/plati.js";
import * as dateFolio from "./data/folio.js";
import * as datePersonal from "./data/personal.js";
import * as dateAcces from "./data/acces.js";
import { uid } from "./lib/uid.js";
import { mesajEroare } from "./lib/errors.js";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
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

const isStatsEligible = (r) => isLive(r) && r.status !== "protocol";

async function cheamaAcces(action, payload = {}) {
  try {
    const { data, error } = await supabase.functions.invoke("access-provider", {
      body: { action, ...payload },
    });
    if (error) {
      /* invoke() marcheaza ca eroare orice status non-2xx, dar corpul are
         mesajul nostru — il preferam celui generic al bibliotecii. */
      let detaliu = null;
      try { detaliu = (await error.context?.json())?.error; } catch { /* ramane null */ }
      if (detaliu) return { ok: false, error: detaliu };

      /* Fara corp de raspuns inseamna ca cererea nu a ajuns deloc: retea
         cazuta, extensie de browser care blocheaza, sau functia in curs de
         redeploy. Mesajul bibliotecii ("Failed to send a request to the Edge
         Function") nu spune nimanui ce sa faca, asa ca il traducem. */
      const retea = /failed to send|fetch/i.test(error.message || "");
      return {
        ok: false,
        error: retea
          ? "Nu am putut contacta serviciul de acces. Verifică conexiunea și încearcă din nou; dacă persistă, reîncarcă pagina."
          : (error.message || "Serviciul de acces a răspuns cu eroare."),
      };
    }
    return data || { ok: false, error: "Raspuns gol de la serviciul de acces." };
  } catch (e) {
    return { ok: false, error: e?.message || "Serviciul de acces nu a raspuns." };
  }
}

/* Aduce codul de acces la zi după ce o rezervare s-a modificat.
 *
 * Trei situații în care codul vechi nu mai are voie să rămână valabil:
 *   · perioada s-a schimbat — altfel ar deschide ușa mai mult sau mai
 *     puțin decât ține rezervarea;
 *   · camera s-a schimbat — altfel oaspetele mutat ar putea intra în
 *     continuare în camera veche, unde între timp poate sta altcineva;
 *   · rezervarea a fost anulată sau marcată no-show.
 *
 * Nu decidem noi ce se întâmplă la furnizor: `issue` din funcția edge
 * recalculează perioada din rezervare, șterge codul vechi de pe yala lui
 * și creează unul nou. Aici doar recunoaștem CÂND trebuie chemat.
 *
 * Ca peste tot în integrarea asta, eșecul nu răstoarnă salvarea: rezervarea
 * e deja modificată, iar recepția primește un avertisment cu ce a rămas de
 * făcut. Un cod nesincronizat e o problemă; o rezervare pierdută e alta,
 * mai mare. */
async function reconciliazaAcces(inainte, dupa, core) {
  if (!inainte || !dupa) return;

  const camera = core.rooms.find((r) => r.id === dupa.roomId);
  const actiune = decideActiuneAcces(inainte, dupa);
  if (!actiune) return;
  const anulata = actiune === "revoke";

  /* Un cod există doar după check-in. Fără el nu e nimic de sincronizat —
     iar la anulare nu vrem să chemăm furnizorul degeaba. */
  let areCod = false;
  try { areCod = await dateAcces.existaCodActiv(dupa.id); }
  catch (e) { console.error("verificare cod acces", e); return; }
  if (!areCod) return;

  if (anulata) {
    const r = await cheamaAcces("revoke", { reservationId: dupa.id });
    await audit.push(r?.ok ? "Cod acces revocat" : "Revocare cod eșuată",
      `${camera?.name || dupa.roomId}`);
    if (!r?.ok) {
      toaster.show(
        "Rezervarea e anulată, dar codul de acces NU a putut fi șters de pe yală. Verifică în TTHOTEL.",
        { tone: "danger" });
    }
    return;
  }

  const r = await cheamaAcces("issue", { reservationId: dupa.id });
  await audit.push(r?.ok ? "Cod acces actualizat" : "Actualizare cod eșuată",
    `${camera?.name || dupa.roomId}${inainte.roomId !== dupa.roomId ? " · cameră schimbată" : " · perioadă schimbată"}`);
  if (r?.ok) {
    toaster.show("Codul de acces a fost actualizat — oaspetele are alt cod.", { tone: "ok" });
  } else {
    toaster.show(
      "Rezervarea e salvată, dar codul de acces nu a putut fi actualizat. Regenerează-l din rezervare.",
      { tone: "danger" });
  }
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
  }
  render() {
    if (this.state.error) {
      return (
        <div className="pms">
          <div className="login-wrap">
            <div className="boot boot-error">
              <AlertTriangle size={24} />
              <div>
                <strong>Ceva n-a mers bine</strong>
                <p>{this.state.error?.message || "Eroare neașteptată în interfață."}</p>
              </div>
              <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
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
async function generatePdfBlob(el, opts = {}) {
  if (!el) return null;
  const { singlePage = false } = opts;
  /* Incarcare la cerere: cele doua biblioteci inseamna ~180 KB din
     pachetul principal, dar se folosesc doar cand cineva chiar descarca
     un PDF — nu la fiecare pornire a aplicatiei. Importul dinamic le
     scoate intr-un chunk separat, adus abia la primul click.

     Pretul ascuns al importului dinamic: numele fisierelor contin un hash
     care se schimba la fiecare build. Daca a aparut intre timp un deploy
     nou, chunk-ul cerut aici NU MAI EXISTA pe server — 404, iar importul
     arunca. S-a intamplat pe 20 august 2026: descarcarea facturii "nu
     facea nimic" pe o fila lasata deschisa peste patru deploy-uri.
     Traducem esecul intr-un mesaj care spune ce trebuie facut. */
  let jsPDF, html2canvas;
  try {
    [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import("jspdf"),
      import("html2canvas"),
    ]);
  } catch (e) {
    /* Textul pentru utilizator sta in lib/errors.js, ca toate celelalte —
       aici doar marcam despre ce fel de esec e vorba. */
    const eroare = new Error(`Import dinamic eșuat: ${e?.message || e}`);
    eroare.code = "APP_VERSIUNE";
    throw eroare;
  }
  const canvas = await html2canvas(el, {
    scale: 2, backgroundColor: "#ffffff", useCORS: true,
    // .no-print e gandit pentru @media print (window.print()) — aici nu
    // exista niciun context de print, deci regula CSS n-ar avea niciun
    // efect; excludem explicit acele elemente (controale de editare,
    // butoane) din captura, ca sa nu ajunga in PDF.
    ignoreElements: (node) => node.classList?.contains("no-print"),
  });
  const imgData = canvas.toDataURL("image/png");

  /* `compress: true` la fiecare jsPDF de mai jos NU e optional. Fara el,
     jsPDF scrie bitmapul BRUT in fisier: 1588x2246 pixeli x 3 octeti =
     ~10,7 MB pentru o singura fisa de anuntare — exact cat masura fisierul
     descarcat pe 20 august 2026. Cu compresie, acelasi document are 219 KB,
     de cincizeci de ori mai putin.
     Masurat atunci si varianta JPEG 0.85: 224 KB, deci PNG comprimat e chiar
     mai mic — si in plus fara pierderi, ceea ce conteaza pentru un document
     numai text. */

  /* Marginea paginii. Fara ea imaginea se aseaza de la muchie la muchie, iar
     imprimantele — care nu pot tipari pana in marginea hartiei — decaleaza
     sau taie rezultatul: pe foaia tiparita pe 20 august 2026 continutul
     iesea pana in muchia din stanga, in timp ce in dreapta ramanea alb. */
  const MARGINE_MM = 8;

  if (singlePage) {
    /* Documentul sta pe o singura pagina A4, incadrat in interiorul
       marginilor si centrat. Pastram proportia continutului: alegem
       factorul care incape si pe latime si pe inaltime. */
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const dispW = pageW - 2 * MARGINE_MM;
    const dispH = pageH - 2 * MARGINE_MM;
    const factor = Math.min(dispW / canvas.width, dispH / canvas.height);
    const w = canvas.width * factor;
    const h = canvas.height * factor;
    pdf.addImage(imgData, "PNG", (pageW - w) / 2, (pageH - h) / 2, w, h);
    return pdf.output("blob");
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 2 * MARGINE_MM;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  /* Inaltimea utila a unei pagini, fara marginile de sus si de jos. */
  const utilH = pageHeight - 2 * MARGINE_MM;

  let heightLeft = imgHeight;
  let position = MARGINE_MM;
  pdf.addImage(imgData, "PNG", MARGINE_MM, position, imgWidth, imgHeight);
  heightLeft -= utilH;
  while (heightLeft > 0) {
    position = MARGINE_MM + heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", MARGINE_MM, position, imgWidth, imgHeight);
    heightLeft -= utilH;
  }
  return pdf.output("blob");
}

/* ---------------------------------------------------------------
   TOASTS
   Destructive actions are reversible for a few seconds instead of
   being guarded by another confirmation prompt.
----------------------------------------------------------------*/
/* ---------------------------------------------------------------
   VIZUALIZATOR PDF — afiseaza documentul in aplicatie, nu il descarca.
   Blob-ul e tinut intr-un obiect URL, revocat la inchidere ca sa nu ramana
   in memorie. Link-ul "Deschide in filă nouă" e plasa de siguranta pentru
   iOS, unde randarea PDF-urilor in iframe e capricioasa; fiind un click
   direct al utilizatorului, nu il opreste blocarea de ferestre.
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
function NightAuditGate({ restante, core, groups, reservations, updateReservations, housekeeping, updateHousekeeping, onLogout }) {
  const [busyId, setBusyId] = useState(null);

  return (
    <div className="login-wrap">
      <div className="boot boot-error" style={{ maxWidth: 560, alignItems: "stretch", textAlign: "left" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <AlertTriangle size={24} style={{ flexShrink: 0 }} />
          <div>
            <strong>Închide ziua</strong>
            <p>
              {restante.length === 1
                ? "O cameră a rămas ocupată după data plecării."
                : `${restante.length} camere au rămas ocupate după data plecării.`}
              {" "}Fă check-out ca să poți folosi mai departe aplicația.
            </p>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 4 }}>
          {restante.map((r) => {
            const camera = core.rooms.find((x) => x.id === r.roomId);
            const zile = zileIntarziere(r);
            return (
              <div className="list-row" key={r.id}>
                <div style={{ minWidth: 0 }}>
                  <div className="primary">
                    <span className="mono">{camera?.name || r.roomId}</span>
                    {" · "}{occupantName(r, core, groups) || "Fără nume"}
                  </div>
                  <div className="secondary">
                    Plecare {fmtDate(r.checkout)} · {zile === 1 ? "o zi" : `${zile} zile`} întârziere
                  </div>
                </div>
                <button className="btn btn-primary" style={{ width: "auto", padding: "8px 14px" }}
                  disabled={busyId === r.id}
                  onClick={async () => {
                    if (busyId) return;
                    setBusyId(r.id);
                    try {
                      await doCheckOut(r, reservations, updateReservations, core, housekeeping, updateHousekeeping);
                    } finally { setBusyId(null); }
                  }}>
                  {busyId === r.id ? "…" : <><ArrowRight size={14} /> Check-out</>}
                </button>
              </div>
            );
          })}
        </div>

        <button className="btn btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={onLogout}>
          <LogOut size={15} /> Delogare
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   LOGIN
----------------------------------------------------------------*/
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
  { key: "log", label: "Jurnal de activitate", icon: History, desc: "Cine ce a modificat și când", roles: ["admin"] },
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
  log: ["admin"],
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
function GroupPrint({ group, core, reservations, onClose }) {
  const sheetRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [pdf, setPdf] = useState(null);
  const download = async () => {
    setDownloading(true);
    /* Fara `catch`, un esec de generare trecea complet neobservat: butonul
       clipea „Se generează…", revenea, si nu aparea niciun fisier si niciun
       mesaj. Mai bine o eroare vizibila decat o tacere. */
    try {
      const blob = await generatePdfBlob(sheetRef.current);
      setPdf({ blob, filename: `Cazare-grup-${group.id}.pdf` });
    }
    catch (e) { toaster.show(mesajEroare(e, "PDF-ul nu a putut fi generat"), { tone: "danger" }); }
    finally { setDownloading(false); }
  };
  const rows = reservations
    .filter((r) => r.groupId === group.id)
    .sort((a, b) => (core.rooms.find((x) => x.id === a.roomId)?.name || "")
      .localeCompare(core.rooms.find((x) => x.id === b.roomId)?.name || ""));

  const main = core.guests.find((g) => g.id === group.mainGuestId);
  const ci = rows.length ? new Date(Math.min(...rows.map((r) => new Date(r.checkin)))) : null;
  const co = rows.length ? new Date(Math.max(...rows.map((r) => new Date(r.checkout)))) : null;
  const totAd = rows.reduce((n, r) => n + (r.adults ?? 2), 0);
  const totCh = rows.reduce((n, r) => n + (r.children ?? 0), 0);
  const totVal = rows.reduce((v, r) => v + reservationTotal(r, core), 0);
  const nightsPerRoom = rows.map((r) => nightsBetween(r.checkin, r.checkout));
  const totNights = nightsPerRoom.reduce((a, b) => a + b, 0);
  const minN = nightsPerRoom.length ? Math.min(...nightsPerRoom) : 0;
  const maxN = nightsPerRoom.length ? Math.max(...nightsPerRoom) : 0;
  const nightsLabel = !nightsPerRoom.length ? "—" : minN === maxN ? String(minN) : `${minN}–${maxN}`;
  const sameIn = rows.every((r) => isSameDay(r.checkin, rows[0].checkin));
  const sameOut = rows.every((r) => isSameDay(r.checkout, rows[0].checkout));
  const d = (v) => FMT_DATE_FULL.format(new Date(v)).replace(/\./g, "-");
  const ds = (v) => FMT_DATE.format(new Date(v)).replace(/\.$/, "");

  return (
    <Dialog onClose={onClose} className="arrival-modal" overlayClassName="arrival-overlay" title={undefined}>
      <div className="modal-head no-print">
        <h3>Listă cazare grup</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={download} disabled={downloading}>
            <Printer size={15} /> {downloading ? "Se generează…" : "Vezi PDF"}
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Închide fereastra"><X size={16} /></button>
        </div>
      </div>

      {pdf && (
        <div onClick={(e) => e.stopPropagation()}>
          <PdfPreview blob={pdf.blob} filename={pdf.filename} onClose={() => setPdf(null)} />
        </div>
      )}

      <div className="arrival-sheet" ref={sheetRef}>
        <div className="fisa rooming-sheet">
          <div className="fisa-top">
            <img src="/logo.png" alt="La Livadă" className="fisa-logo-img" />
            <div className="rs-meta">
              <div className="rs-meta-label">Listă cazare</div>
              <div className="rs-meta-value">{group.name}</div>
              <div className="rs-meta-date">Emisă {d(new Date())}</div>
            </div>
          </div>

          <div className="rs-summary">
            <div className="rs-line">
              <div className="rs-cell rs-grow">
                <span className="rs-k">Client principal</span>
                <span className="rs-v">{guestFullName(main) || "—"}</span>
              </div>
              <div className="rs-cell">
                <span className="rs-k">Nopți</span>
                <span className="rs-v">{nightsLabel}</span>
              </div>
              <div className="rs-cell">
                <span className="rs-k">Camere</span>
                <span className="rs-v">{rows.length}</span>
              </div>
              <div className="rs-cell">
                <span className="rs-k">Persoane</span>
                <span className="rs-v">{totAd + totCh}</span>
              </div>
            </div>
            <div className="rs-line">
              <div className="rs-cell rs-grow">
                <span className="rs-k">Data sosirii</span>
                <span className="rs-v">{ci ? d(ci) : "—"}{sameIn ? "" : " (diferite)"}</span>
              </div>
              <div className="rs-cell rs-grow">
                <span className="rs-k">Data plecării</span>
                <span className="rs-v">{co ? d(co) : "—"}{sameOut ? "" : " (diferite)"}</span>
              </div>
            </div>
          </div>

          <div className="rooming-wrap">
          <table className="rooming">
            <thead>
              <tr>
                <th className="c-num">#</th>
                <th className="c-room">Cameră</th>
                <th className="c-occ">Ocupant</th>
                <th className="c-d">Perioadă</th>
                <th className="c-n">Nopți</th>
                <th className="c-n">Pers.</th>
                <th className="c-sign">Semnătură</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const room = core.rooms.find((x) => x.id === r.roomId);
                const ad = r.adults ?? 2, ch = r.children ?? 0;
                return (
                  <tr key={r.id}>
                    <td className="c-num">{i + 1}</td>
                    <td className="c-room">
                      <span className="rs-room-no">{room?.name}</span>
                      <span className="rs-room-type">{ROOM_TYPE[room?.type]?.label}</span>
                    </td>
                    <td className="c-occ">{occupantName(r, core, group ? [group] : null) || ""}</td>
                    <td className="c-d">
                      <span className="rs-d1">{ds(r.checkin)}</span>
                      <span className="rs-d2">{ds(r.checkout)}</span>
                    </td>
                    <td className="c-n">{nightsBetween(r.checkin, r.checkout)}</td>
                    <td className="c-n c-tot">
                      {ad + ch}
                      {ch > 0 && <span className="rs-brk">{ad}+{ch}</span>}
                    </td>
                    <td className="c-sign" />
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="c-num" />
                <td className="c-room">Total</td>
                <td className="c-occ">{rows.length} camere</td>
                <td className="c-d" />
                <td className="c-n">{totNights}</td>
                <td className="c-n c-tot">
                  {totAd + totCh}
                  {totCh > 0 && <span className="rs-brk">{totAd}+{totCh}</span>}
                </td>
                <td className="c-sign" />
              </tr>
            </tfoot>
          </table>
          </div>

          <div className="rs-value">Valoare totală sejur: <strong>{fmtMoney(totVal)}</strong></div>

          <div className="rs-notes">
            <div className="rs-notes-title">Observații</div>
            <div className="rs-notes-lines"><span /><span /><span /></div>
          </div>

          <div className="sheet-sign">
            <div>Reprezentant grup</div>
            <div>Recepție</div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   GROUP EDITOR
   Rooms can be added, swapped or dropped, and occupancy set per
   room — all reservations of the group stay in step.
----------------------------------------------------------------*/
function GroupEditor({ group, core, groups, updateGroups, reservations, updateReservations, blocks, onClose, onPrint }) {
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  if (!group) return null;

  const rows = reservations
    .filter((r) => r.groupId === group.id)
    .sort((a, b) => (core.rooms.find((x) => x.id === a.roomId)?.name || "")
      .localeCompare(core.rooms.find((x) => x.id === b.roomId)?.name || ""));

  const span = rows.length
    ? {
        checkin: new Date(Math.min(...rows.map((r) => new Date(r.checkin)))).toISOString(),
        checkout: new Date(Math.max(...rows.map((r) => new Date(r.checkout)))).toISOString(),
      }
    : null;

  const groupRoomIds = new Set(rows.map((r) => r.roomId));

  /* Rooms taken by anything else live in this window (any reservation
     except exceptResId, plus maintenance blocks). Deliberately not
     special-cased by group: a room double-booked by two reservations
     of the *same* group is still a real conflict, so every other room
     is checked the same way regardless of which group it belongs to. */
  const busyIn = (fromISO, toISO, exceptResId) => {
    const set = new Set();
    const ci = new Date(fromISO), co = new Date(toISO);
    if (isNaN(ci.getTime()) || isNaN(co.getTime())) return set;
    for (const r of reservations) {
      if (!isLive(r) || r.id === exceptResId) continue;
      if (rangesOverlap(ci, co, r.checkin, r.checkout)) set.add(r.roomId);
    }
    for (const b of blocks || []) {
      if (rangesOverlap(ci, co, b.start, b.end)) set.add(b.roomId);
    }
    return set;
  };

  const busyRooms = span ? busyIn(span.checkin, span.checkout) : new Set();

  const freeRooms = core.rooms.filter((r) => !busyRooms.has(r.id) && !groupRoomIds.has(r.id));
  const totalGuests = rows.reduce((n, r) => n + (r.adults ?? 2) + (r.children ?? 0), 0);
  const namedRooms = rows.filter((r) =>
    r.occupantLastName?.trim() && r.occupantFirstName?.trim() && r.occupantPhone?.trim()).length;
  const nightsList = rows.map((r) => nightsBetween(r.checkin, r.checkout));
  const minN = nightsList.length ? Math.min(...nightsList) : 0;
  const maxN = nightsList.length ? Math.max(...nightsList) : 0;
  const totalValue = rows.reduce((v, r) => v + reservationTotal(r, core), 0);

  /* Recalculeaza bookedPrice doar cand se schimba ceva ce afecteaza pretul
     (data, ocupare, camera) si doar daca rezervarea nu are deja un pret
     manual — altfel un tarif modificat intre timp ar "sari" pe rezervari
     deja facute, fara sa fi fost editate cu adevarat. */
  const PRICE_AFFECTING = ["roomId", "checkin", "checkout", "adults", "children"];
  const patchRow = async (id, patch) => {
    const row = reservations.find((r) => r.id === id);
    let finalPatch = patch;
    if (row && row.priceOverride == null && PRICE_AFFECTING.some((f) => patch[f] !== undefined)) {
      finalPatch = { ...patch, bookedPrice: liveReservationTotalOnline({ ...row, ...patch }, core, reservations) };
    }
    await updateReservations(reservations.map((r) => (r.id === id ? { ...r, ...finalPatch } : r)));
    setError("");
    /* Editările din grup ocolesc fereastra rezervării, deci sincronizarea
       yalei trebuie chemată și de aici — altfel o cameră schimbată în grup
       ar lăsa codul vechi activ pe ușa veche. */
    if (row) {
      try { await reconciliazaAcces(row, { ...row, ...finalPatch }, core); }
      catch (e) { console.error("Sincronizare acces", e); }
    }
  };

  /* Keeps the free-text occupantName (used everywhere else for display)
     in sync whenever the structured last/first name fields change.
     Also seeds the two structured fields from any legacy combined
     occupantName the first time a room is edited, so an older/seeded
     row doesn't silently lose half its name on the first keystroke. */
  const patchOccupant = async (id, patch) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const [legacyLast, ...legacyRest] = (row.occupantName || "").trim().split(" ");
    const base = {
      occupantLastName: row.occupantLastName ?? legacyLast ?? "",
      occupantFirstName: row.occupantFirstName ?? legacyRest.join(" "),
      occupantPhone: row.occupantPhone ?? "",
    };
    const next = { ...base, ...patch };
    const combined = [next.occupantLastName, next.occupantFirstName]
      .filter((v) => v?.trim()).join(" ").trim();
    await patchRow(id, { ...base, ...patch, occupantName: combined });
  };

  /* Applies one period to every room, keeping each room's own time of day. */
  const shiftAll = async (newIn, newOut) => {
    const ci = newIn ? new Date(newIn) : new Date(span.checkin);
    const co = newOut ? new Date(newOut) : new Date(span.checkout);
    const err = validateStay(ci, co);
    if (err) { setError(err); return; }

    const clashes = rows.filter((r) =>
      busyIn(ci.toISOString(), co.toISOString(), r.id).has(r.roomId));
    if (clashes.length) {
      const names = clashes.map((r) => core.rooms.find((x) => x.id === r.roomId)?.name).join(", ");
      setError(`Ocupate în intervalul ales: ${names}`);
      return;
    }

    const ids = new Set(rows.map((r) => r.id));
    await updateReservations(reservations.map((r) => {
      if (!ids.has(r.id)) return r;
      const patched = { ...r, checkin: ci.toISOString(), checkout: co.toISOString() };
      return r.priceOverride == null ? { ...patched, bookedPrice: liveReservationTotalOnline(patched, core, reservations) } : patched;
    }));
    await audit.push("Perioadă grup schimbată",
      `${group.name}: ${fmtDate(ci)} → ${fmtDate(co)} · ${rows.length} camere`);

    /* Aceeași perioadă nouă pentru toate camerele: fiecare cod de acces
       trebuie adus la zi separat, fiindcă fiecare stă pe altă yală. */
    for (const r of rows) {
      const inainte = reservations.find((x) => x.id === r.id);
      if (!inainte) continue;
      try {
        await reconciliazaAcces(inainte,
          { ...inainte, checkin: ci.toISOString(), checkout: co.toISOString() }, core);
      } catch (e) { console.error("Sincronizare acces", e); }
    }
    toaster.show(`Perioada grupului mutată pe ${fmtDate(ci)} → ${fmtDate(co)}`, { tone: "ok" });
    setError("");
  };

  /* Each room may run on its own dates — validate that room alone. */
  const changeDates = async (id, newIn, newOut) => {
    const row = rows.find((r) => r.id === id);
    const ci = newIn ? new Date(newIn) : new Date(row.checkin);
    const co = newOut ? new Date(newOut) : new Date(row.checkout);
    const err = validateStay(ci, co);
    if (err) { setError(err); return; }
    if (busyIn(ci.toISOString(), co.toISOString(), id).has(row.roomId)) {
      setError(`Camera ${core.rooms.find((x) => x.id === row.roomId)?.name} este ocupată în intervalul ales.`);
      return;
    }
    await patchRow(id, { checkin: ci.toISOString(), checkout: co.toISOString() });
    await audit.push("Interval schimbat în grup",
      `${group.name} · ${core.rooms.find((x) => x.id === row.roomId)?.name}: ${fmtDate(ci)} → ${fmtDate(co)}`);
  };

  const moveRow = async (id, newRoomId) => {
    const row = rows.find((r) => r.id === id);
    if (busyIn(row.checkin, row.checkout, id).has(newRoomId)) {
      setError("Camera aleasă este ocupată în intervalul acestei camere.");
      return;
    }
    const newCap = core.rooms.find((x) => x.id === newRoomId)?.capacity || 20;
    const occ = (row.adults ?? 2) + (row.children ?? 0);
    if (occ > newCap) {
      setError(`Ocuparea actuală (${occ}) depășește capacitatea camerei alese (${newCap}).`);
      return;
    }
    const from = core.rooms.find((x) => x.id === row.roomId)?.name;
    const to = core.rooms.find((x) => x.id === newRoomId)?.name;
    await patchRow(id, { roomId: newRoomId });
    await audit.push("Cameră schimbată în grup", `${group.name}: ${from} → ${to}`);
    toaster.show(`Mutat din ${from} în ${to}`, { tone: "ok" });
  };

  const addRoom = async (roomId) => {
    if (!span) { setError("Grupul nu mai are nicio rezervare de la care să preiau datele."); return; }
    const template = rows[0];
    const recordBase = {
      id: uid(), roomId, guestId: group.mainGuestId, groupId: group.id,
      checkin: span.checkin, checkout: span.checkout,
      status: template?.status === "cancelled" ? "confirmed" : (template?.status || "confirmed"),
      notes: "", priceOverride: null, adults: 2, children: 0,
      source: template?.source || "direct", tags: [], messages: [],
    };
    const record = { ...recordBase, bookedPrice: liveReservationTotalOnline(recordBase, core, reservations) };
    await updateReservations([...reservations, record]);
    const rn = core.rooms.find((x) => x.id === roomId)?.name;
    await audit.push("Cameră adăugată în grup", `${group.name}: ${rn}`);
    toaster.show(`Camera ${rn} adăugată în grup`, { tone: "ok" });
    setAddOpen(false);
    setError("");
  };

  const dropRoom = async (id) => {
    const row = rows.find((r) => r.id === id);
    const rn = core.rooms.find((x) => x.id === row.roomId)?.name;
    const before = reservations;
    const next = reservations.filter((r) => r.id !== id);
    await updateReservations(next);
    await audit.push("Cameră scoasă din grup", `${group.name}: ${rn}`);
    toaster.show(`Camera ${rn} scoasă din grup`, {
      tone: "danger",
      onUndo: async () => { await updateReservations(before); },
    });
    if (!next.some((r) => r.groupId === group.id)) {
      await updateGroups(groups.filter((g) => g.id !== group.id));
      onClose();
    }
  };

  const renameGroup = async (name) => {
    await updateGroups(groups.map((g) => (g.id === group.id ? { ...g, name } : g)));
  };

  return (
    <Dialog onClose={onClose} title={`Grup: ${group.name}`}>
      <label className="field">
        <span className="fl">Nume grup</span>
        <input value={group.name} onChange={(e) => renameGroup(e.target.value)} />
      </label>

      <div className="group-summary">
        <div><strong>{rows.length}</strong> camere</div>
        <div><strong>{totalGuests}</strong> persoane</div>
        <div><strong>{minN === maxN ? minN : `${minN}–${maxN}`}</strong> nopți</div>
        <div><strong>{namedRooms}</strong>/{rows.length} cu ocupant</div>
        <div><strong>{fmtMoney(totalValue)}</strong></div>
      </div>

      {span && (
        <div className="grp-period">
          <div className="grp-period-head">Perioadă pentru tot grupul</div>
          <div className="grp-dates">
            <label className="grp-num">
              <span>Sosire</span>
              <input type="date" value={toDateInput(span.checkin)}
                onChange={(e) => shiftAll(withNewDate(span.checkin, e.target.value), null)} />
            </label>
            <label className="grp-num">
              <span>Plecare</span>
              <input type="date" value={toDateInput(span.checkout)}
                onChange={(e) => shiftAll(null, withNewDate(span.checkout, e.target.value))} />
            </label>
            <div className="grp-nights">
              <span>{nightsBetween(span.checkin, span.checkout)}</span>
              nopți
            </div>
          </div>
          <p className="grp-period-hint">
            Schimbarea aici mută toate camerele. Fiecare cameră poate fi ajustată separat mai jos.
          </p>
        </div>
      )}

      {span && (
        <div className="note" style={{ marginBottom: 12 }}>
          Interval grup: {fmtDate(span.checkin)} → {fmtDate(span.checkout)}. Fiecare cameră poate avea propriile
          date — camerele adăugate pornesc de la intervalul grupului și pot fi ajustate individual.
        </div>
      )}

      {error && <div className="drag-error" role="alert" style={{ marginBottom: 10 }}>{error}</div>}

      <div className="grp-rows">
        {rows.map((r) => {
          return (
            <div className="grp-row" key={r.id}>
              <div className="grp-row-head">
                <select
                  value={r.roomId}
                  onChange={(e) => moveRow(r.id, e.target.value)}
                  aria-label="Schimbă camera"
                >
                  <option value={r.roomId}>
                    {core.rooms.find((x) => x.id === r.roomId)?.name} — {ROOM_TYPE[core.rooms.find((x) => x.id === r.roomId)?.type]?.label}
                  </option>
                  {freeRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} — {ROOM_TYPE[room.type]?.label}
                    </option>
                  ))}
                </select>
                <button className="icon-btn" onClick={() => dropRoom(r.id)}
                  aria-label="Scoate camera din grup" title="Scoate camera din grup">
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="grp-dates">
                <label className="grp-num">
                  <span>Sosire</span>
                  <input type="date" value={toDateInput(r.checkin)}
                    onChange={(e) => changeDates(r.id, withNewDate(r.checkin, e.target.value), null)} />
                </label>
                <label className="grp-num">
                  <span>Plecare</span>
                  <input type="date" value={toDateInput(r.checkout)}
                    onChange={(e) => changeDates(r.id, null, withNewDate(r.checkout, e.target.value))} />
                </label>
                <div className="grp-nights">
                  <span>{nightsBetween(r.checkin, r.checkout)}</span>
                  nopți
                </div>
              </div>

              <div className="grp-row-body">
                {(() => {
                  const roomCap = core.rooms.find((x) => x.id === r.roomId)?.capacity || 20;
                  return (
                    <>
                      <div className="grp-num">
                        <span>Adulți</span>
                        <OccupantStepper label="Adulți" value={r.adults ?? 2} otherValue={r.children ?? 0} capacity={roomCap} min={1}
                          onChange={(n) => patchRow(r.id, { adults: n })} />
                      </div>
                      <div className="grp-num">
                        <span>Copii</span>
                        <OccupantStepper label="Copii" value={r.children ?? 0} otherValue={r.adults ?? 2} capacity={roomCap} min={0}
                          onChange={(n) => patchRow(r.id, { children: n })} />
                      </div>
                    </>
                  );
                })()}
                <div className="grp-price">{fmtMoney(reservationTotal(r, core))}</div>
              </div>

              {(() => {
                const [legacyLast, ...legacyRest] = (r.occupantName || "").trim().split(" ");
                const lastVal = r.occupantLastName ?? legacyLast ?? "";
                const firstVal = r.occupantFirstName ?? legacyRest.join(" ");
                const phoneVal = r.occupantPhone ?? "";
                const complete = lastVal.trim() && firstVal.trim() && phoneVal.trim();
                return (
                  <div className="grp-occupant">
                    <div className="grp-occupant-head">
                      <span>Ocupant cameră</span>
                      {!complete && <span className="grp-occupant-required">Nume, prenume și telefon obligatorii</span>}
                    </div>
                    <div className="grp-occupant-row">
                      <input
                        className={!lastVal.trim() ? "input-error" : ""}
                        value={lastVal}
                        placeholder="Nume *"
                        aria-label="Numele ocupantului"
                        onChange={(e) => patchOccupant(r.id, { occupantLastName: e.target.value })}
                      />
                      <input
                        className={!firstVal.trim() ? "input-error" : ""}
                        value={firstVal}
                        placeholder="Prenume *"
                        aria-label="Prenumele ocupantului"
                        onChange={(e) => patchOccupant(r.id, { occupantFirstName: e.target.value })}
                      />
                      <input
                        className={!phoneVal.trim() ? "input-error" : ""}
                        value={phoneVal}
                        type="tel"
                        placeholder="Telefon *"
                        aria-label="Telefonul ocupantului"
                        onChange={(e) => patchOccupant(r.id, { occupantPhone: e.target.value })}
                        onBlur={() => {
                          if (lastVal.trim() && firstVal.trim() && phoneVal.trim()) {
                            audit.push("Ocupant setat",
                              `${group.name} · ${core.rooms.find((x) => x.id === r.roomId)?.name}: ${lastVal.trim()} ${firstVal.trim()}`);
                          }
                        }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {addOpen ? (
        <div className="subform">
          <div className="subform-head">
            Adaugă cameră
            <button className="link-btn" onClick={() => setAddOpen(false)}>Renunță</button>
          </div>
          {freeRooms.length === 0 ? (
            <p style={{ fontSize: "var(--fs-base)", color: "var(--text-muted)", margin: "0 0 12px" }}>
              Nicio cameră liberă în intervalul grupului.
            </p>
          ) : (
            <div className="room-chips" style={{ marginBottom: 12 }}>
              {freeRooms.map((room) => (
                <button className="room-chip" key={room.id} onClick={() => addRoom(room.id)}>
                  {room.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button className="btn btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Adaugă cameră în grup
        </button>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onPrint}>
          <Printer size={15} /> Listă cazare
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>
          <Check size={15} /> Gata
        </button>
      </div>

    </Dialog>
  );
}

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
function CalendarView({ core, updateCore, reservations, updateReservations, groups, updateGroups, housekeeping, updateHousekeeping, blocks, updateBlocks, intent, clearIntent }) {
  const [offset, setOffset] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dense, setDense] = useState(false);
  const [actionRes, setActionRes] = useState(null);
  const [blockInfo, setBlockInfo] = useState(null);
  const [moveId, setMoveId] = useState(null);
  const [dragError, setDragError] = useState("");
  /* Fereastra vizibila. Latimea unei zile ramane 66px, deci grila creste
     in lateral si se deruleaza — 30 de zile inseamna ~2060px, adica vreo
     doua ecrane de laptop. Alegerea e deliberata: mai bine derulezi si
     citesti numele oaspetilor, decat sa incapa luna intreaga cu bare fara
     nume. Butoanele de navigare pasesc tot cu DAYS, ca sa nu sara peste
     zile intre doua ferestre. */
  const DAYS = 30;
  const [modal, setModal] = useState(null); // { reservation | null, defaultRoomId, defaultDate }
  const [viewModal, setViewModal] = useState(null); // rezervarea afișată doar-vizualizare, sau null

  const days = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + offset);
    return Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); return d;
    });
  }, [offset]);

  const rangeStart = days[0], rangeEnd = new Date(days[DAYS - 1].getTime() + 86400000);

  const moveReservation = async (resId, targetRoomId, targetDay) => {
    const res = reservations.find((r) => r.id === resId);
    if (!res) return;
    const nights = nightsBetween(res.checkin, res.checkout);
    const oldCi = new Date(res.checkin), oldCo = new Date(res.checkout);
    const newCi = new Date(targetDay);
    newCi.setHours(oldCi.getHours(), oldCi.getMinutes(), 0, 0);
    const newCo = new Date(newCi);
    newCo.setDate(newCi.getDate() + nights);
    newCo.setHours(oldCo.getHours(), oldCo.getMinutes(), 0, 0);

    // Across a DST boundary the wall-clock arithmetic above can land a day off.
    // Correct it so the stay always keeps exactly the same number of nights.
    const drift = nights - nightsBetween(newCi, newCo);
    if (drift !== 0) newCo.setDate(newCo.getDate() + drift);

    if (targetRoomId === res.roomId && newCi.getTime() === oldCi.getTime()) return;

    const clash = reservations.some((r) =>
      r.id !== resId && r.roomId === targetRoomId && isLive(r) &&
      newCi < new Date(r.checkout) && newCo > new Date(r.checkin))
      || (blocks || []).some((b) =>
        b.roomId === targetRoomId && newCi < new Date(b.end) && newCo > new Date(b.start));
    if (clash) {
      const rn = core.rooms.find((r) => r.id === targetRoomId)?.name;
      setDragError(`Camera ${rn} e ocupată în intervalul ales.`);
      setTimeout(() => setDragError(""), 3500);
      return;
    }

    await updateReservations(reservations.map((r) => r.id === resId
      ? { ...r, roomId: targetRoomId, checkin: newCi.toISOString(), checkout: newCo.toISOString() }
      : r));

    const fromRoom = core.rooms.find((r) => r.id === res.roomId)?.name;
    const toRoom = core.rooms.find((r) => r.id === targetRoomId)?.name;
    const who = guestFullName(core.guests.find((g) => g.id === res.guestId)) || "Fără nume";
    await audit.push("Rezervare mutată",
      `${who}: ${fromRoom} ${fmtDate(oldCi)} → ${toRoom} ${fmtDate(newCi)}`);
  };

  useEffect(() => {
    if (intent === "group") {
      setModal({ reservation: null, mode: "group" });
      clearIntent();
    }
  }, [intent, clearIntent]);

  const jumpTo = (target) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    setOffset(Math.round((target - today) / 86400000));
    setPickerOpen(false);
  };

  useEffect(() => {
    if (!pickerOpen) return;
    const close = () => setPickerOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [pickerOpen]);

  /* Parse every date string once per data change instead of re-parsing it
     inside each per-room, per-day comparison below, and bucket by room so
     the calendar walks the reservation list once in total rather than once
     for each of the 16 rooms. */
  const resByRoom = useMemo(() => {
    const map = new Map();
    for (const r of reservations) {
      if (!isLive(r)) continue;
      const ciMs = new Date(r.checkin).getTime();
      const coMs = new Date(r.checkout).getTime();
      if (!Number.isFinite(ciMs) || !Number.isFinite(coMs)) continue;
      // Day-level boundaries too: occupancy is counted in room-nights, and
      // the night of day D belongs to a stay only when ciDay <= D < coDay.
      const ciDay = new Date(ciMs); ciDay.setHours(0, 0, 0, 0);
      const coDay = new Date(coMs); coDay.setHours(0, 0, 0, 0);
      let bucket = map.get(r.roomId);
      if (!bucket) { bucket = []; map.set(r.roomId, bucket); }
      bucket.push({ res: r, ciMs, coMs, ciDayMs: ciDay.getTime(), coDayMs: coDay.getTime() });
    }
    return map;
  }, [reservations]);

  const blocksByRoom = useMemo(() => {
    const map = new Map();
    for (const b of blocks || []) {
      const sMs = new Date(b.start).getTime();
      const eMs = new Date(b.end).getTime();
      if (!Number.isFinite(sMs) || !Number.isFinite(eMs)) continue;
      let bucket = map.get(b.roomId);
      if (!bucket) { bucket = []; map.set(b.roomId, bucket); }
      bucket.push({ block: b, sMs, eMs });
    }
    return map;
  }, [blocks]);

  /* Day boundaries as plain numbers, computed once per date range. */
  const dayMs = useMemo(() => days.map((d) => d.getTime()), [days]);

  /* Occupancy is the number of rooms sold for that night. A stay occupies
     the night of day D only while ciDay <= D < coDay — the departure day
     itself is not a sold night, so a same-day turnover counts once (the
     arriving guest), not twice as it did when any overlap with the
     calendar day was treated as occupancy. */
  const dailyOccupancy = useMemo(() => {
    const stays = [];
    for (const bucket of resByRoom.values()) {
      for (const e of bucket) stays.push(e);
    }
    return dayMs.map((dStart) => {
      let occ = 0;
      for (const e of stays) if (e.ciDayMs <= dStart && e.coDayMs > dStart) occ++;
      return { occ, pct: core.rooms.length ? Math.round((occ / core.rooms.length) * 100) : 0 };
    });
  }, [dayMs, resByRoom, core.rooms.length]);

  const rangeStartMs = rangeStart.getTime(), rangeEndMs = rangeEnd.getTime();

  const spanIndices = (startMs, endMs) => {
    let startIdx = -1, endIdx = -1;
    for (let i = 0; i < dayMs.length; i++) {
      const dStart = dayMs[i], dEnd = dStart + 86400000;
      if (startMs < dEnd && endMs > dStart) {
        if (startIdx === -1) startIdx = i;
        endIdx = i;
      }
    }
    return { startIdx, endIdx };
  };

  const spansForRoomRaw = (roomId) =>
    (resByRoom.get(roomId) || [])
      .filter((e) => e.coMs > rangeStartMs && e.ciMs < rangeEndMs)
      .map(({ res: r, ciMs, coMs }) => {
        const { startIdx, endIdx } = spanIndices(ciMs, coMs);
        if (startIdx === -1) return null;
        const ciDay = new Date(ciMs); ciDay.setHours(0, 0, 0, 0);
        const coDay = new Date(coMs); coDay.setHours(0, 0, 0, 0);
        return {
          res: r, startIdx, endIdx, len: endIdx - startIdx + 1,
          nights: Math.max(1, Math.round((coDay - ciDay) / 86400000)),
          clipStart: ciMs < rangeStartMs,
          clipEnd: coMs > rangeEndMs,
        };
      })
      .filter(Boolean);

  const blockSpansForRoomRaw = (roomId) =>
    (blocksByRoom.get(roomId) || [])
      .filter((e) => e.eMs > rangeStartMs && e.sMs < rangeEndMs)
      .map(({ block: b, sMs, eMs }) => {
        const { startIdx, endIdx } = spanIndices(sMs, eMs);
        if (startIdx === -1) return null;
        return { block: b, startIdx, endIdx, len: endIdx - startIdx + 1 };
      })
      .filter(Boolean);

  const rowSpans = useMemo(() => {
    const map = {};
    core.rooms.forEach((room) => {
      map[room.id] = { res: spansForRoomRaw(room.id), blocks: blockSpansForRoomRaw(room.id) };
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core.rooms, resByRoom, blocksByRoom, dayMs]);


  return (
    <div className="cal-view">
      <div className="toolbar cal-toolbar">
        <div className="week-nav">
          <button onClick={() => setOffset((o) => o - DAYS)} aria-label={`Cele ${DAYS} zile anterioare`}>
            <ChevronLeft size={15} />
            <span>{DAYS} zile</span>
          </button>
          <div className="jump-wrap">
            <button className={offset === 0 ? "on" : ""} onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v); }}>
              <CalendarDays size={14} />
              <span>{offset === 0 ? "Azi" : fmtDate(days[0])}</span>
            </button>
            {pickerOpen && (
              <div className="jump-pop" onClick={(e) => e.stopPropagation()}>
                <label>Sari la data</label>
                <input
                  type="date"
                  autoFocus
                  value={toDateInput(days[0])}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    jumpTo(new Date(e.target.value + "T00:00:00"));
                  }}
                />
                <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => { setOffset(0); setPickerOpen(false); }}>
                  Înapoi la azi
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setOffset((o) => o + DAYS)} aria-label={`Următoarele ${DAYS} zile`}>
            <span>{DAYS} zile</span>
            <ChevronRight size={15} />
          </button>
        </div>
        <div className="grow" />
        <button
          className={"icon-btn" + (dense ? " active" : "")}
          onClick={() => setDense((v) => !v)}
          aria-pressed={dense}
          title={dense ? "Vedere confortabilă" : "Vedere compactă"}
          aria-label={dense ? "Treci la vedere confortabilă" : "Treci la vedere compactă"}
        >
          {dense ? <Rows3 size={16} /> : <Rows2 size={16} />}
        </button>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ reservation: null })}>
          <Plus size={15} />
          <span className="lbl-long">Rezervare nouă</span>
          <span className="lbl-short">Rezervare</span>
        </button>
      </div>

      {dragError && <div className="drag-error" role="alert">{dragError}</div>}
      {moveId ? (
        <div className="move-banner" role="status">
          <MoveRight size={15} />
          <span>Atinge celula unde muți rezervarea — camera și ziua de sosire.</span>
          <button className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={() => setMoveId(null)}>Renunță</button>
        </div>
      ) : null}

      <div className={"cal-scroll" + (dense ? " dense" : "")}>
        <div className="cal-grid" style={{ "--days": DAYS }}>
          <div className="cal-row cal-head">
            <div className="cal-roomcell" style={{ fontWeight: 700, fontSize: 12 }}>Cameră</div>
            {days.map((d, i) => {
              const wk = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={i} className={"cal-daycell" + (isToday(d) ? " today" : wk ? " weekend" : "")}>
                  {FMT_WEEKDAY.format(d)}<br />{fmtDate(d)}
                </div>
              );
            })}
          </div>

          {core.rooms.map((room, roomIdx) => {
            const spans = rowSpans[room.id]?.res || [];
            const bSpans = rowSpans[room.id]?.blocks || [];
            // Rooms are listed grouped by type; mark where one type ends and
            // the next begins so tiny houses and lofts read as separate blocks.
            const prevType = roomIdx > 0 ? core.rooms[roomIdx - 1].type : null;
            const startsNewType = room.type !== prevType;
            return (
              <React.Fragment key={room.id}>
                {startsNewType && (
                  <div className="cal-typerow" aria-hidden="true">
                    <div className="cal-typelabel">{ROOM_TYPE[room.type]?.label || room.type}</div>
                  </div>
                )}
              <div className="cal-row">
                <div className="cal-roomcell">
                  <div className="rname">{room.name}</div>
                  <div className="rfloor">
                    {ROOM_TYPE[room.type]?.short || ""}
                    {room.capacity > 2 && <span className="room-cap-plus"> +</span>}
                  </div>
                </div>
                {days.map((d, i) => {
                  const span = spans.find((sp) => sp.startIdx === i);
                  const covered = spans.find((sp) => i >= sp.startIdx && i <= sp.endIdx);
                  const bSpan = bSpans.find((sp) => sp.startIdx === i);
                  const bCovered = bSpans.find((sp) => i >= sp.startIdx && i <= sp.endIdx);
                  // Reservation bars start/end at the midpoint of the checkin/checkout
                  // day cell, so a same-day turnover shows both the departing and the
                  // arriving stay side by side instead of one full cell hiding the other.
                  // Computed straight from the reservation's own checkin/checkout dates
                  // (not from span.len) since len counts the checkout day as fully
                  // occupied whenever checkout isn't exactly midnight — using it here
                  // pushed the bar a whole extra cell too far, overlapping the next stay.
                  // Clipped ends (stay continues outside the visible date range) stay
                  // flush with the cell edge instead of stopping at a midpoint.
                  let barLeft = "3px";
                  let barWidthUnits = 0;
                  if (span) {
                    const ciIdx = Math.floor((new Date(span.res.checkin) - rangeStart) / 86400000);
                    const coIdx = Math.floor((new Date(span.res.checkout) - rangeStart) / 86400000);
                    const leftAbs = span.clipStart ? span.startIdx : ciIdx + 0.5;
                    const rightAbs = span.clipEnd ? days.length : coIdx + 0.5;
                    barLeft = span.clipStart ? "3px" : "calc(50% + 3px)";
                    barWidthUnits = rightAbs - leftAbs;
                  }
                  return (
                    <div
                      key={i}
                      className={"cal-cell"
                        + (d.getDay() === 0 || d.getDay() === 6 ? " weekend" : "")
                        + (moveId ? " movable" : "")}
                      onClick={() => {
                        if (moveId) { moveReservation(moveId, room.id, d); setMoveId(null); return; }
                        if (bCovered) { setBlockInfo(bCovered.block); return; }
                        if (covered) setActionRes(covered.res);
                        else setModal({ reservation: null, defaultRoomId: room.id, defaultDate: d });
                      }}
                    >
                      {bSpan && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); setBlockInfo(bSpan.block); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBlockInfo(bSpan.block); }
                          }}
                          className="cal-bar block-bar"
                          style={{ width: `calc(${bSpan.len} * 100% - 6px)` }}
                          title={`Blocat: ${bSpan.block.reason}`}
                        >
                          <Wrench size={11} style={{ flexShrink: 0 }} />
                          <span className="bar-name">{bSpan.block.reason}</span>
                        </div>
                      )}

                      {span && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); if (moveId) return; setActionRes(span.res); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActionRes(span.res); }
                          }}
                          className={"cal-bar " + STATUS_CLASS[span.res.status] +
                            (span.clipStart ? " clip-start" : "") + (span.clipEnd ? " clip-end" : "") +
                            (moveId === span.res.id ? " moving" : "")}
                          style={{ left: barLeft, width: `calc(${barWidthUnits} * 100% - 6px)` }}
                          title={`${occupantName(span.res, core, groups) || "Fără nume"} · ${fmtDateTime(span.res.checkin)} → ${fmtDateTime(span.res.checkout)} · ${STATUS_LABEL[span.res.status]}`}
                        >
                          <span className="bar-glyph" aria-hidden="true">{STATUS_GLYPH[span.res.status]}</span>
                          {span.res.groupId && <UsersRound size={11} style={{ flexShrink: 0, opacity: .8 }} />}
                          <span className="bar-name">
                            {occupantName(span.res, core, groups) || "Fără nume"}
                          </span>
                          {span.res.tags?.includes("VIP") && <span className="bar-vip">VIP</span>}
                          {span.res.messages?.length > 0 && <MessageSquare size={10} style={{ flexShrink: 0, opacity: .75 }} />}
                          {span.nights > 2 && <span className="bar-nights">{span.nights}n</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </React.Fragment>
            );
          })}

          <div className="cal-row cal-foot">
            <div className="cal-roomcell">
              <div className="rname" style={{ fontSize: 11, fontFamily: "inherit", fontWeight: 700 }}>Ocupare</div>
            </div>
            {days.map((d, i) => {
              const { occ, pct } = dailyOccupancy[i];
              return (
                <div key={i} className={"cal-occ" + (isToday(d) ? " today" : "")}
                  title={`${occ} din ${core.rooms.length} camere ocupate`}>
                  <div className="occ-num mono">{occ}</div>
                  <div className="occ-pct">{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {blockInfo && (
        <Dialog onClose={() => setBlockInfo(null)} className="action-modal" title={undefined}>
            <div className="action-head">
              <div>
                <div className="action-guest">{blockInfo.reason}</div>
                <div className="action-meta">
                  <span className="mono">{core.rooms.find((r) => r.id === blockInfo.roomId)?.name}</span>
                  {" · "}{fmtDate(blockInfo.start)} → {fmtDate(blockInfo.end)}
                </div>
              </div>
              <span className="role-tag role-receptionist">Blocaj</span>
            </div>
            <div className="action-list">
              <button className="action-item danger" onClick={async () => {
                const before = blocks || [];
                await updateBlocks(before.filter((b) => b.id !== blockInfo.id));
                await audit.push("Blocaj eliminat",
                  `${core.rooms.find((r) => r.id === blockInfo.roomId)?.name} · ${blockInfo.reason}`);
                toaster.show("Blocajul a fost eliminat", {
                  tone: "danger",
                  onUndo: async () => { await updateBlocks(before); },
                });
                setBlockInfo(null);
              }}>
                <span className="ai-ico"><Trash2 size={17} /></span>
                <span className="ai-body"><span className="ai-t">Elimină blocajul</span>
                  <span className="ai-d">Camera redevine disponibilă</span></span>
              </button>
            </div>
            <button className="btn btn-ghost" style={{ width: "100%", marginTop: 6 }} onClick={() => setBlockInfo(null)}>Închide</button>
          </Dialog>
      )}

      <div className="cal-legend">
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <span className="legend-item" key={k}>
            <span className={"legend-chip " + STATUS_CLASS[k]}>{STATUS_GLYPH[k]}</span>{v}
          </span>
        ))}
        <span className="legend-item">
          <span className="legend-chip block-bar"><Wrench size={9} /></span>Blocaj
        </span>
      </div>

      {actionRes && (
        <ReservationActions
          res={actionRes}
          core={core}
          groups={groups}
          reservations={reservations}
          updateReservations={updateReservations}
          housekeeping={housekeeping}
          updateHousekeeping={updateHousekeeping}
          onOpen={() => { setViewModal(actionRes); setActionRes(null); }}
          onEdit={() => { setModal({ reservation: actionRes }); setActionRes(null); }}
          onMove={() => { setMoveId(actionRes.id); setActionRes(null); setDragError(""); }}
          onClose={() => setActionRes(null)}
        />
      )}

      {viewModal && (
        <ReservationViewModal
          reservation={viewModal}
          core={core}
          updateCore={updateCore}
          groups={groups}
          onClose={() => setViewModal(null)}
          onEdit={() => { setModal({ reservation: viewModal }); setViewModal(null); }}
        />
      )}

      {modal && (
        <ReservationModal
          data={modal}
          core={core}
          updateCore={updateCore}
          reservations={reservations}
          updateReservations={updateReservations}
          groups={groups}
          updateGroups={updateGroups}
          blocks={blocks}
          updateBlocks={updateBlocks}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/* Stepper +/- pentru adulti/copii — evita inputurile numerice native (care
   fac zoom pe iOS la focus si permit tastarea unei valori peste capacitate)
   si aplica limita direct in logica de crestere/scadere. */
function OccupantStepper({ label, value, otherValue, capacity, min, onChange }) {
  const cap = Number(capacity) || 20;
  const max = Math.max(min, cap - (Number(otherValue) || 0));
  const v = Math.min(max, Math.max(min, Number(value) || min));
  const set = (n) => onChange(Math.min(max, Math.max(min, n)));
  /* Cand capacitatea scade (camera schimbata, celalalt ocupant crescut),
     valoarea afisata se clampeaza automat — sincronizam si starea reala
     din parinte, ca ce se vede sa fie mereu ce se si salveaza. */
  useEffect(() => {
    if (Number(value) !== v) onChange(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return (
    <div className="stepper">
      <button type="button" className="stepper-btn" onClick={() => set(v - 1)} disabled={v <= min} aria-label={`${label} — scade`}>−</button>
      <span className="stepper-value" aria-live="polite">{v}</span>
      <button type="button" className="stepper-btn" onClick={() => set(v + 1)} disabled={v >= max} aria-label={`${label} — crește`}>+</button>
    </div>
  );
}

/* ---------------------------------------------------------------
   FOLIO — pozitii de cazare + extra, direct din rezervare.
   Nu trece prin core/syncTable (colectie separata, per rezervare) —
   citeste/scrie direct in Supabase, incarcata la deschiderea modalului.
----------------------------------------------------------------*/
/* Sincronizeaza linia de "Cazare" din folio cu pretul curent al
   rezervarii (bookedPrice/priceOverride) — dar NICIODATA daca acea
   linie e deja legata de o factura activa (invoiced_status='invoiced'),
   ca sa nu modificam retroactiv ceva deja facturat. */
/* Emiterea unei facturi — draft -> emisa, cu alocarea numarului.
 *
 * Seria NU mai e scrisa in cod. Inainte se cerea "LIV", iar in baza seria
 * configurata era "LL": next_invoice_number arunca "Serie de facturare
 * inexistenta sau inactiva", deci emiterea esua de fiecare data. Seria e
 * oricum configurabila din Setari, deci a o fixa in cod anula acel
 * setting. Acum se citeste seria activa in momentul emiterii.
 *
 * Intoarce randul actualizat, sau null daca ceva a esuat (mesajul e deja
 * aratat utilizatorului). Folosita si din folio, si din lista de facturi.
 */
function SectiuneAcces({ res, core }) {
  const camera = core.rooms.find((r) => r.id === res.roomId);
  /* undefined = încă se încarcă, null = nu există cod. Distincția
     contează: altfel s-ar vedea „fără cod" o clipă la fiecare deschidere. */
  const [cod, setCod] = useState(undefined);
  const [trimiteri, setTrimiteri] = useState([]);
  const [lucrez, setLucrez] = useState(false);
  const [eroare, setEroare] = useState("");

  const incarca = useCallback(async () => {
    try {
      const { cod: c, trimiteri: t } = await dateAcces.codActivCuTrimiteri(res.id);
      setCod(c); setTrimiteri(t);
    } catch (e) {
      /* Inainte, esecul se pierdea tacit prin destructurare si sectiunea
         ramanea la nesfarsit pe "Se incarca...". */
      console.error("citire cod acces", e);
      setCod(null); setTrimiteri([]);
    }
  }, [res.id]);

  useEffect(() => { incarca(); }, [incarca]);

  const genereaza = async () => {
    setEroare("");
    setLucrez(true);
    /* Dacă există deja un cod, butonul zice "Regenerează" — și chiar
       trebuie să dea unul nou, nu să întoarcă tot codul vechi doar fiindcă
       perioada n-a fost atinsă. */
    const r = await cheamaAcces("issue", { reservationId: res.id, force: Boolean(cod) });
    setLucrez(false);
    if (r?.ok) {
      await incarca();
      await audit.push(r.reused ? "Cod acces refolosit" : "Cod acces generat",
        `${camera?.name || res.roomId}`);
      toaster.show(r.reused ? "Codul exista deja." : "Cod de acces generat.", { tone: "ok" });
    } else {
      setEroare(r?.error || "Codul nu a putut fi generat.");
    }
  };

  if (!camera?.accessLockId) {
    return (
      <div className="field">
        <label>Acces cameră</label>
        <div className="ldv-mic" style={{ color: "var(--muted)" }}>
          Camera {camera?.name || res.roomId} nu are o yală asociată.
          Se configurează în Setări → Camere.
        </div>
      </div>
    );
  }

  const facutCheckIn = res.status === "checkedin" || res.status === "checkedout";

  return (
    <div className="field">
      <label>Acces cameră · {camera.name}</label>

      {cod === undefined && <div className="ldv-mic">Se încarcă…</div>}

      {cod === null && (
        <div className="ldv-mic" style={{ color: "var(--muted)" }}>
          {facutCheckIn
            ? "Codul de acces nu a fost generat."
            : "Codul de acces se generează automat la check-in."}
        </div>
      )}

      {cod && cod.provider === "simulare" && (
        <div className="error-text" role="alert" style={{ marginBottom: 6 }}>
          COD SIMULAT — nu deschide nicio ușă. Serviciul de acces e în modul de
          probă. Nu-l trimite oaspetelui.
        </div>
      )}

      {cod && (
        <div className="sumar-acces">
          <div className="mono" style={{ fontSize: 26, fontWeight: 700, letterSpacing: ".12em" }}>
            {cod.code}
          </div>
          <div className="ldv-mic" style={{ color: "var(--muted)" }}>
            Valabil de la {fmtDateTime(cod.valid_from)}<br />
            până la {fmtDateTime(cod.valid_until)}
          </div>
        </div>
      )}

      {eroare && (
        <div className="error-text" role="alert" style={{ marginTop: 8 }}>
          {eroare}
        </div>
      )}

      {cod && trimiteri.length > 0 && (
        <div className="ldv-mic" style={{ marginTop: 8 }}>
          {trimiteri.slice(0, 4).map((t) => (
            <div key={t.id}>
              {t.channel === "email" ? "Email" : "WhatsApp"}:{" "}
              {t.status === "sent" ? "✓ trimis" : "✗ eșuat"}
              {t.sent_at ? ` · ${fmtDateTime(t.sent_at)}` : ""}
              {t.error_message ? ` · ${t.error_message}` : ""}
            </div>
          ))}
        </div>
      )}

      {(facutCheckIn || cod) && (
        <div className="quick-actions acces-actions" style={{ marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={genereaza} disabled={lucrez}>
            <RefreshCw size={14} color="var(--accent)" />
            {lucrez ? "Lucrez…" : cod ? "Regenerează" : "Generează"}
          </button>

          {cod && cod.provider !== "simulare" && (
            <button className="btn btn-ghost" disabled={lucrez} onClick={async () => {
              setEroare("");
              setLucrez(true);
              const r = await cheamaAcces("send-email", { reservationId: res.id });
              setLucrez(false);
              await incarca();
              if (r?.ok) toaster.show(`Cod trimis pe email · ${r.recipient}`, { tone: "ok" });
              else setEroare(r?.error || "Emailul nu a putut fi trimis.");
            }}>
              <Mail size={14} color="#2563eb" />
              Email
            </button>
          )}

          {cod && cod.provider !== "simulare" && (() => {
            /* WhatsApp merge prin linkul wa.me: nu avem API oficial, iar o
               automatizare pe WhatsApp Web ar fi fragilă și împotriva
               regulilor lor. Recepționerul apasă trimite în aplicație.
               Consemnăm doar că mesajul a fost pregătit — nu putem confirma
               livrarea, și nu pretindem că o facem. */
            const oaspete = core.guests.find((g) => g.id === res.guestId);
            const cifre = String(oaspete?.phone || "").replace(/[^\d]/g, "");
            if (!cifre) {
              return <span className="ldv-mic" style={{ alignSelf: "center" }}>
                Numărul de WhatsApp nu este disponibil.
              </span>;
            }
            const text = `Bună ${guestFullName(oaspete) || ""},

Camera ta este ${camera.name}.
Codul de acces este: ${cod.code}

Valabil de la ${fmtDateTime(cod.valid_from)} până la ${fmtDateTime(cod.valid_until)}.

Introdu codul pe tastatura yalei și apasă tasta de confirmare #.`;
            return (
              <a className="btn btn-ghost" href={`https://wa.me/${cifre}?text=${encodeURIComponent(text)}`}
                target="_blank" rel="noopener noreferrer"
                onClick={() => {
                  cheamaAcces("log-whatsapp", { reservationId: res.id, recipient: cifre })
                    .then(() => incarca());
                }}>
                <MessageCircle size={14} color="#25D366" />
                WhatsApp
              </a>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* Doar-vizualizare pentru o rezervare existentă: detalii, acces yală și
   facturare — fără câmpurile de editare (cameră, date, client, status).
   `SectiuneAcces`/`FolioPanel` sunt aceleași componente folosite și în
   ReservationModal, nemodificate — doar reasamblate aici. */
function ReservationViewModal({ reservation, core, updateCore, groups, onClose, onEdit }) {
  useModalLock();
  const guest = core.guests.find((g) => g.id === reservation.guestId) || null;
  const room = core.rooms.find((r) => r.id === reservation.roomId);
  const editingGroup = reservation.groupId ? groups.find((g) => g.id === reservation.groupId) : null;

  const [billingCustomerId, setBillingCustomerId] = useState(reservation.billingCustomerId || "");
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [showArrival, setShowArrival] = useState(false);

  const saveNewBillingCustomer = async (customer) => {
    if ((core.billingCustomers || []).some((c) => c.id === customer.id)) { setBillingCustomerId(customer.id); setBillingModalOpen(false); return; }
    await updateCore({ ...core, billingCustomers: [...(core.billingCustomers || []), customer] });
    await audit.push("Client de facturare adăugat", billingCustomerLabel(customer));
    setBillingCustomerId(customer.id);
    setBillingModalOpen(false);
  };

  return (
    <Dialog onClose={onClose} title="Vezi rezervarea">
      {/* `flexDirection: row` explicit: .action-head trece pe coloană sub
          640px, iar aici vrem butonul chiar în dreapta rândurilor, și pe
          telefon. Rândurile din stânga stau strânse (margin-top mic). */}
      <div className="action-head" style={{ flexDirection: "row", alignItems: "flex-start", flexWrap: "nowrap", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="action-guest">{occupantName(reservation, core, groups) || "Fără nume"}</div>
          {guestFullName(guest) && guestFullName(guest) !== occupantName(reservation, core, groups) && (
            <div className="action-meta" style={{ marginTop: 1 }}>Rezervat de {guestFullName(guest)}</div>
          )}
          <div className="action-meta" style={{ marginTop: 1 }}>
            <span className="mono">{room?.name}</span> · {fmtDate(reservation.checkin)} → {fmtDate(reservation.checkout)}
            {" · "}{nightsBetween(reservation.checkin, reservation.checkout)} nopți
          </div>
          <div className="action-meta" style={{ marginTop: 1 }}>
            {reservation.adults ?? 2} adulți{reservation.children ? ` + ${reservation.children} copii` : ""} · {sourceLabel(reservation.source)} · {fmtMoney(reservationTotal(reservation, core))}
          </div>
          <div style={{ marginTop: 6 }}>
            <span className={"role-tag " + (reservation.status === "checkedin" ? "role-housekeeping"
              : reservation.status === "cancelled" ? "role-receptionist" : "role-admin")}>
              <span aria-hidden="true">{STATUS_GLYPH[reservation.status]}</span> {STATUS_LABEL[reservation.status]}
            </span>
          </div>
          {reservation.tags?.length > 0 && (
            <div className="tag-row">
              {reservation.tags.map((t) => <span className="tag-mini" key={t}>{t}</span>)}
            </div>
          )}
        </div>
        <button className="btn btn-ghost" style={{ width: "auto", padding: "8px 12px", flexShrink: 0 }} onClick={() => setShowArrival(true)}>
          <Printer size={14} /> Fișa de sosire
        </button>
      </div>

      {editingGroup && (
        <div className="group-banner">
          <UsersRound size={15} />
          <span>Face parte din grupul <strong>{editingGroup.name}</strong></span>
        </div>
      )}

      {guest && (
        <div className="field">
          <label>Client</label>
          <div className="guest-chip">
            <div className="guest-chip-av">{initials(guestFullName(guest))}</div>
            <div className="guest-chip-body">
              <div className="gname">{guestFullName(guest)}</div>
              <div className="gmeta">{[guest.phone, guest.city].filter(Boolean).join(" · ") || "Fără date de contact"}</div>
            </div>
            <ContactQuickActions guest={guest} />
          </div>
        </div>
      )}

      {reservation.notes && (
        <div className="field">
          <label>Note</label>
          <div className="ldv-mic">{reservation.notes}</div>
        </div>
      )}

      {reservation.messages?.length > 0 && (
        <div className="field">
          <label>Mesaje ({reservation.messages.length})</label>
          <div className="msg-list" style={{ marginTop: 0 }}>
            {[...reservation.messages].reverse().map((m) => (
              <div className="msg-item" key={m.id}>
                <div className="msg-text">{m.text}</div>
                <div className="msg-meta">{m.author} · {fmtDateTime(m.ts)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <SectiuneAcces res={reservation} core={core} />

      <FolioPanel reservation={reservation} core={core} updateCore={updateCore}
        billingCustomerId={billingCustomerId} setBillingCustomerId={setBillingCustomerId}
        onNewBillingCustomer={() => setBillingModalOpen(true)} />

      <div className="modal-actions">
        <div className="grow" />
        <button className="btn btn-ghost" onClick={onClose}>Închide</button>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={onEdit}>
          <Pencil size={14} /> Editează rezervarea
        </button>
      </div>

      {showArrival && (
        <div onClick={(e) => e.stopPropagation()}>
          <ArrivalForm res={reservation} core={core} groups={groups} onClose={() => setShowArrival(false)} />
        </div>
      )}

      {billingModalOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <BillingCustomerModal
            seedFromGuest={guest}
            existingCustomers={core.billingCustomers || []}
            onSave={saveNewBillingCustomer}
            onClose={() => setBillingModalOpen(false)}
          />
        </div>
      )}
    </Dialog>
  );
}

function ReservationModal({ data, core, updateCore, reservations, updateReservations, groups, updateGroups, blocks, updateBlocks, onClose }) {
  useModalLock();
  const editing = data.reservation;
  const [mode, setMode] = useState(data.mode || "single");
  const [roomId, setRoomId] = useState(editing?.roomId || data.defaultRoomId || core.rooms[0]?.id || "");
  const [roomIds, setRoomIds] = useState(data.defaultRoomId ? [data.defaultRoomId] : []);
  const [groupName, setGroupName] = useState("");
  const [guestId, setGuestId] = useState(editing?.guestId || "");
  const [guestQuery, setGuestQuery] = useState("");
  const [guestFormSeed, setGuestFormSeed] = useState(null);
  const [billingCustomerId, setBillingCustomerId] = useState(editing?.billingCustomerId || "");
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [checkin, setCheckin] = useState(
    editing ? toLocalInputValue(editing.checkin) :
    (() => { const d = data.defaultDate ? new Date(data.defaultDate) : new Date(); d.setHours(15, 0, 0, 0); return toLocalInputValue(d.toISOString()); })()
  );
  const [checkout, setCheckout] = useState(
    editing ? toLocalInputValue(editing.checkout) :
    (() => { const d = data.defaultDate ? new Date(data.defaultDate) : new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0); return toLocalInputValue(d.toISOString()); })()
  );
  const [status, setStatus] = useState(editing?.status || "confirmed");
  /* La creare: doar Cerere/Confirmata/Protocol. La editare: starile
     operationale clasice — plus statusul curent, daca a ramas pe
     Cerere/Protocol si n-a fost inca trecut mai departe, ca sa nu
     dispara din select fara sa fi fost ales explicit altceva. */
  const statusOptions = !editing
    ? CREATE_STATUSES
    : EDIT_STATUSES.includes(editing.status) ? EDIT_STATUSES : [editing.status, ...EDIT_STATUSES];
  const [priceOverride, setPriceOverride] = useState(editing?.priceOverride ?? "");
  const [adults, setAdults] = useState(editing?.adults ?? 2);
  const [children, setChildren] = useState(editing?.children ?? 0);
  const [source, setSource] = useState(editing?.source || "direct");
  const [tags, setTags] = useState(editing?.tags || []);
  const [newTag, setNewTag] = useState("");
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [showArrival, setShowArrival] = useState(false);
  const [notes, setNotes] = useState(editing?.notes || "");
  const [error, setError] = useState("");
  /* Blocheaza butoanele cat timp scrierea e in curs: un dublu-click putea
     altfel trimite doua scrieri suprapuse (a doua cu o stampila deja
     depasita) sau sterge de doua ori. Acelasi tipar exista deja la plati
     si la anulare/stornare. */
  const [saving, setSaving] = useState(false);
  const guests = core.guests;
  /* Cu tastatura deschisa pe telefon, lista de rezultate cadea sub
     marginea modalului: scriai si nu vedeai ce a gasit. */
  const refRezultateClient = useAduInVizor(Boolean(guestQuery.trim()));

  const isGroup = !editing && mode === "group";
  const isBlock = !editing && mode === "block";
  /* Cat timp e grup, adultii/copiii se aplica identic pe fiecare camera
     selectata — capacitatea folosita e cea mai mica dintre camerele alese,
     ca nicio camera sa nu ramana peste propria capacitate. */
  const maxOccupancy = isGroup
    ? (roomIds.length ? Math.min(...roomIds.map((id) => core.rooms.find((r) => r.id === id)?.capacity || 20)) : 20)
    : (core.rooms.find((r) => r.id === roomId)?.capacity || 20);
  /* Daca nimic ce afecteaza pretul (camera/data/ocupare) nu s-a schimbat
     fata de rezervarea existenta, previzualizarea si salvarea folosesc
     pretul deja inghetat, nu un recalcul cu tarifele curente. */
  const priceAffectingChanged = !editing
    || editing.roomId !== roomId
    || new Date(editing.checkin).getTime() !== new Date(checkin).getTime()
    || new Date(editing.checkout).getTime() !== new Date(checkout).getTime()
    || (editing.adults ?? 2) !== (Number(adults) || 1)
    || (editing.children ?? 0) !== (Number(children) || 0);
  const editingGroup = editing?.groupId ? groups.find((g) => g.id === editing.groupId) : null;
  const selectedGuest = guests.find((g) => g.id === guestId) || null;
  const matchingGuests = (() => {
    const t = guestQuery.trim().toLowerCase();
    if (!t) return [];
    return guests.filter((g) =>
      guestFullName(g).toLowerCase().includes(t) ||
      (g.phone || "").replace(/\s/g, "").includes(t.replace(/\s/g, "")) ||
      (g.city || "").toLowerCase().includes(t)
    );
  })();

  const startAddGuest = () => {
    const parts = guestQuery.trim().split(/\s+/);
    setGuestFormSeed({ ...emptyGuest(), lastName: parts[0] || "", firstName: parts.slice(1).join(" ") });
    setError("");
  };

  const saveNewGuest = async (guest) => {
    if (core.guests.some((g) => g.id === guest.id)) { setGuestId(guest.id); setGuestQuery(""); setGuestFormSeed(null); return; }
    await updateCore({ ...core, guests: [...core.guests, guest] });
    await audit.push("Client adăugat", guestFullName(guest));
    setGuestId(guest.id);
    setGuestQuery("");
    setGuestFormSeed(null);
  };

  const saveNewBillingCustomer = async (customer) => {
    if ((core.billingCustomers || []).some((c) => c.id === customer.id)) { setBillingCustomerId(customer.id); setBillingModalOpen(false); return; }
    await updateCore({ ...core, billingCustomers: [...(core.billingCustomers || []), customer] });
    await audit.push("Client de facturare adăugat", billingCustomerLabel(customer));
    setBillingCustomerId(customer.id);
    setBillingModalOpen(false);
  };

  /* A tag typed here joins the shared list, so it is reusable next time. */
  const commitNewTag = async () => {
    const t = newTag.trim();
    if (!t) { setNewTagOpen(false); return; }
    const list = core.tags || DEFAULT_TAGS;
    if (!list.some((x) => x.toLowerCase() === t.toLowerCase())) {
      await updateCore({ ...core, tags: [...list, t] });
      await audit.push("Etichetă adăugată", t);
    }
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setNewTag(""); setNewTagOpen(false);
  };

  const previewTotal = (() => {
    if (priceOverride !== "") {
      return Math.max(0, Number(priceOverride) || 0);
    }
    if (!isGroup && editing && !priceAffectingChanged && editing.bookedPrice != null) {
      return Number(editing.bookedPrice) || 0;
    }
    const ids = isGroup ? roomIds : [roomId];
    return ids.reduce((sum, rid) =>
      sum + liveReservationTotalOnline({ roomId: rid, checkin, checkout, adults, children, source }, core, reservations), 0);
  })();

  /* One pass over reservations and blocks per date change, rather than a
     scan per room on every render of the form. */
  const busyRooms = useMemo(() => {
    const ci = new Date(checkin), co = new Date(checkout);
    const set = new Set();
    if (isNaN(ci.getTime()) || isNaN(co.getTime())) return set;
    for (const r of reservations) {
      if (!isLive(r) || r.id === editing?.id) continue;
      if (rangesOverlap(ci, co, r.checkin, r.checkout)) set.add(r.roomId);
    }
    for (const b of blocks || []) {
      if (rangesOverlap(ci, co, b.start, b.end)) set.add(b.roomId);
    }
    return set;
  }, [checkin, checkout, reservations, blocks, editing?.id]);

  const conflictsFor = (ids) => ids.filter((rid) => busyRooms.has(rid));

  /* Corpul propriu-zis ramane neschimbat; `save`/`remove` de mai jos doar
     il imbraca in blocajul anti-dublu-click. */
  const saveInner = async (statusNou) => {
    /* Statusul efectiv al acestei salvari. Butoanele de check-in/out il dau
       explicit, ca sa nu depinda de un setState care nu s-a aplicat inca. */
    const statusFinal = statusNou || status;
    if (isBlock) {
      if (roomIds.length < 1) { setError("Selectează cel puțin o cameră de blocat."); return; }
      const dv = validateStay(checkin, checkout);
      if (dv) { setError(dv.replace("check-in", "început").replace("check-out", "sfârșit")); return; }
      const busy = conflictsFor(roomIds);
      if (busy.length) {
        const names = busy.map((id) => core.rooms.find((r) => r.id === id)?.name).join(", ");
        setError(`Ocupate în acest interval: ${names}`); return;
      }
      const newBlocks = roomIds.map((rid) => ({
        id: uid(), roomId: rid,
        start: new Date(checkin).toISOString(), end: new Date(checkout).toISOString(),
        reason: blockReason.trim() || "Mentenanță", createdAt: new Date().toISOString(),
      }));
      await updateBlocks([...(blocks || []), ...newBlocks]);
      await audit.push("Camere blocate",
        `${roomIds.map((id) => core.rooms.find((r) => r.id === id)?.name).join(", ")} · ${fmtDate(checkin)} → ${fmtDate(checkout)} · ${blockReason.trim() || "Mentenanță"}`);
      onClose();
      return;
    }

    if (!guestId) {
      setError(isGroup ? "Alege clientul principal al grupului." : "Caută și alege un client, sau adaugă unul nou.");
      return;
    }
    const dateErr = validateStay(checkin, checkout);
    if (dateErr) { setError(dateErr); return; }
    const priceErr = validatePrice(priceOverride);
    if (priceErr) { setError(priceErr); return; }
    if (!Number.isFinite(Number(adults)) || Number(adults) < 1) { setError("Numărul de adulți trebuie să fie cel puțin 1."); return; }
    if (!Number.isFinite(Number(children)) || Number(children) < 0) { setError("Numărul de copii nu poate fi negativ."); return; }
    /* Adulti/copii se clampeaza reactiv doar cand se modifica direct acele
       campuri — schimbarea camerei (sau a camerelor de grup) dupa aceea nu
       le reajusteaza, asa ca ocuparea trebuie reverificata explicit aici. */
    if (Number(adults) + Number(children) > maxOccupancy) {
      setError(`Ocuparea aleasă (${Number(adults) + Number(children)}) depășește capacitatea ${isGroup ? "camerelor selectate" : "camerei selectate"} (${maxOccupancy}).`);
      return;
    }

    /* Fara asta, dropdownul de status ar putea trece rezervarea in
       "checked-in" la orice data, ocolind regula pe care butoanele o
       respecta. Se blocheaza doar TRECEREA in checked-in — un sejur deja
       inceput ramane valid.
       Regula vine din canCheckIn (lib/tranzitii.js), nu e rescrisa aici:
       verificam data din FORMULAR (posibil modificata acum), cu statusul
       "confirmed" pe care rezervarea trebuie sa-l aiba ca sa poata fi
       cazata. */
    if (statusFinal === "checkedin" && editing?.status !== "checkedin"
      && !canCheckIn({ status: "confirmed", checkin })) {
      setError(`Check-in-ul se poate face cu cel mult ${ORE_CHECKIN_DEVREME}h înainte de sosire.`);
      return;
    }

    if (isGroup) {
      if (roomIds.length < 1) { setError("Selectează cel puțin o cameră pentru grup."); return; }
      if (!groupName.trim()) { setError("Dă un nume grupului."); return; }
      const busy = conflictsFor(roomIds);
      if (busy.length) {
        const names = busy.map((id) => core.rooms.find((r) => r.id === id)?.name).join(", ");
        setError(`Ocupate în acest interval: ${names}`); return;
      }
      const groupId = uid();
      const group = {
        id: groupId, name: groupName.trim(), mainGuestId: guestId,
        createdAt: new Date().toISOString(), notes,
      };
      /* Pretul manual pe grup e TOTALUL sejurului, deci se imparte intre
         camere, nu se copiaza pe fiecare. splitEvenly imparte la nivel de
         ban (nu de leu, ca inainte) si distribuie restul, astfel incat
         sumele pe camere sa dea exact cat s-a tastat. */
      const groupTotal = priceOverride === "" ? null : Math.max(0, Number(priceOverride) || 0);
      const coteGrup = groupTotal != null ? splitEvenly(groupTotal, roomIds.length) : null;
      const newRes = roomIds.map((rid, idx) => {
        const base = {
          id: uid(), roomId: rid, guestId, groupId,
          checkin: new Date(checkin).toISOString(), checkout: new Date(checkout).toISOString(),
          status: statusFinal, notes,
          adults: Number(adults) || 1, children: Number(children) || 0, source,
          tags: [...tags], messages: [], billingCustomerId: billingCustomerId || null,
        };
        return coteGrup == null
          ? { ...base, priceOverride: null, bookedPrice: liveReservationTotalOnline(base, core, reservations) }
          : { ...base, priceOverride: coteGrup[idx], bookedPrice: null };
      });
      await updateGroups([...groups, group]);
      await updateReservations([...reservations, ...newRes]);
      await audit.push("Grup creat",
        `${group.name} · ${roomIds.length} camere · ${fmtDate(checkin)} → ${fmtDate(checkout)}`);
      onClose();
      return;
    }

    if (conflictsFor([roomId]).length) { setError("Camera este deja rezervată în acest interval."); return; }

    /* Spread `editing` first so fields this form doesn't expose — the
       per-room occupant name/phone on group rooms above all — survive a
       save instead of being silently dropped by a from-scratch rebuild. */
    const recordBase = {
      ...(editing || {}),
      id: editing?.id || uid(), roomId, guestId, groupId: editing?.groupId || null,
      checkin: new Date(checkin).toISOString(), checkout: new Date(checkout).toISOString(),
      status: statusFinal, notes,
      adults: Number(adults) || 1, children: Number(children) || 0, source, tags: [...tags],
      messages: editing?.messages || [], billingCustomerId: billingCustomerId || null,
    };
    /* Pretul manual e mereu explicit. Cel "auto" ramane inghetat in
       bookedPrice pana cand ceva ce chiar afecteaza pretul se schimba
       (data, camera, ocupare) — un simplu re-salvare (ex. doar o nota
       modificata) sau un tarif schimbat ulterior nu il ating.
       priceAffectingChanged e calculat mai sus, langa previewTotal. */
    const record = priceOverride === ""
      ? {
          ...recordBase, priceOverride: null,
          bookedPrice: priceAffectingChanged || editing?.bookedPrice == null
            ? liveReservationTotalOnline(recordBase, core, reservations) : editing.bookedPrice,
        }
      : { ...recordBase, priceOverride: Number(priceOverride), bookedPrice: null };
    const nextRes = editing ? reservations.map((r) => (r.id === editing.id ? record : r)) : [...reservations, record];

    await updateReservations(nextRes);
    const who = guestFullName(core.guests.find((g) => g.id === guestId)) || "Fără nume";
    const rn = core.rooms.find((r) => r.id === roomId)?.name;
    await audit.push(editing ? "Rezervare modificată" : "Rezervare creată",
      `${who} · ${rn} · ${fmtDate(checkin)} → ${fmtDate(checkout)}`);
    /* După salvare, nu înainte: dacă sincronizarea yalei cade, rezervarea
       rămâne modificată. Vezi comentariul de la reconciliazaAcces. */
    if (editing) {
      try { await reconciliazaAcces(editing, record, core); }
      catch (e) { console.error("Sincronizare acces", e); }
    }
    toaster.show(editing ? "Rezervare actualizată" : `Rezervare creată · ${rn}`, { tone: "ok" });
    onClose();
  };

  /* `statusNou` vine de la butoanele "Marchează check-in/out", care salveaza
     pe loc. Nu ne putem baza pe setStatus + save in aceeasi apasare: setarea
     de state nu se vede in `status` decat la urmatorul render, deci salvarea
     ar folosi valoarea veche. */
  const save = async (statusNou) => {
    if (saving) return;
    setSaving(true);
    try { await saveInner(typeof statusNou === "string" ? statusNou : undefined); }
    finally { setSaving(false); }
  };

  const removeInner = async () => {
    /* Revocarea ÎNAINTE de ștergere, nu după: odată rândul dispărut,
       funcția edge nu mai are ce căuta, iar `on delete cascade` șterge și
       codul din access_codes. Fără pasul ăsta ar rămâne un cod activ pe
       yală despre care nu mai există nicio urmă nicăieri — cazul cel mai
       urât, fiindcă nimeni n-ar mai ști nici măcar că trebuie căutat. */
    try {
      const rev = await cheamaAcces("revoke", { reservationId: editing.id });
      if (rev && rev.ok === false && rev.reason !== "neconfigurat") {
        toaster.show(
          "Atenție: codul de acces nu a putut fi șters de pe yală. Verifică în TTHOTEL înainte de a șterge rezervarea.",
          { tone: "danger" });
      }
    } catch (e) { console.error("Revocare acces la ștergere", e); }

    const nextRes = reservations.filter((r) => r.id !== editing.id);
    await updateReservations(nextRes);

    // A group with no reservations left would linger as an orphan.
    if (editing.groupId && !nextRes.some((r) => r.groupId === editing.groupId)) {
      const g = (groups || []).find((x) => x.id === editing.groupId);
      await updateGroups((groups || []).filter((x) => x.id !== editing.groupId));
      if (g) await audit.push("Grup închis", `${g.name} · nu mai are rezervări`);
    }

    const who = guestFullName(core.guests.find((g) => g.id === editing.guestId)) || "Fără nume";
    const rn = core.rooms.find((r) => r.id === editing.roomId)?.name;
    await audit.push("Rezervare ștearsă", `${who} · ${rn} · ${fmtDate(editing.checkin)}`);
    const beforeRes = reservations, beforeGroups = groups;
    toaster.show(`Rezervarea ${who} · ${rn} a fost ștearsă`, {
      tone: "danger",
      onUndo: async () => {
        await updateReservations(beforeRes);
        await updateGroups(beforeGroups);
        await audit.push("Ștergere anulată", `${who} · ${rn}`);
      },
    });
    onClose();
  };

  const remove = async () => {
    if (saving) return;
    setSaving(true);
    try { await removeInner(); } finally { setSaving(false); }
  };

  return (
    <Dialog
      onClose={onClose}
      title={editing ? "Editează rezervarea" : isGroup ? "Rezervare de grup" : isBlock ? "Blocaj cameră" : "Rezervare nouă"}
    >

        {!editing && (
          <div className="mode-switch">
            <button className={mode === "single" ? "on" : ""} onClick={() => { setMode("single"); setError(""); }}>
              <DoorOpen size={14} /> O cameră
            </button>
            <button className={mode === "group" ? "on" : ""} onClick={() => { setMode("group"); setError(""); }}>
              <UsersRound size={14} /> Grup
            </button>
            <button className={mode === "block" ? "on" : ""} onClick={() => { setMode("block"); setError(""); }}>
              <Wrench size={14} /> Blocaj
            </button>
          </div>
        )}

        {editingGroup && (
          <div className="group-banner">
            <UsersRound size={15} />
            <span>Face parte din grupul <strong>{editingGroup.name}</strong></span>
          </div>
        )}

        {isGroup || isBlock ? (
          <>
            {isGroup && <label className="field">
              <span className="fl">Nume grup *</span>
              <input value={groupName} onChange={(e) => { setGroupName(e.target.value); setError(""); }}
                placeholder="ex. Familia Popescu · Nuntă Ionescu" />
            </label>}

            {isBlock && <label className="field">
              <span className="fl">Motiv</span>
              <input value={blockReason} onChange={(e) => { setBlockReason(e.target.value); setError(""); }}
                placeholder="ex. Zugrăvit · reparație boiler" />
            </label>}
            <div className="field">
              <label>{isBlock ? "Camere blocate" : "Camere"} * ({roomIds.length} selectate)</label>
              <div className="room-picker">
                {["tiny", "loft"].map((t) => {
                  const list = core.rooms.filter((r) => r.type === t);
                  if (!list.length) return null;
                  const freeRooms = list.filter((r) => !busyRooms.has(r.id));
                  const allOn = freeRooms.length > 0 && freeRooms.every((r) => roomIds.includes(r.id));
                  return (
                    <div key={t} className="room-picker-group">
                      <div className="room-picker-head">
                        {ROOM_TYPE[t].label}
                        <button className="link-btn" onClick={() => {
                          const free = freeRooms.map((r) => r.id);
                          setRoomIds((prev) => allOn
                            ? prev.filter((id) => !list.some((r) => r.id === id))
                            : [...new Set([...prev, ...free])]);
                          setError("");
                        }}>{allOn ? "Deselectează" : "Toate libere"}</button>
                      </div>
                      <div className="room-chips">
                        {list.map((r) => {
                          const on = roomIds.includes(r.id);
                          const busy = busyRooms.has(r.id);
                          return (
                            <button
                              key={r.id}
                              className={"room-chip" + (on ? " on" : "") + (busy ? " busy" : "")}
                              title={busy ? "Ocupată sau blocată în acest interval" : ""}
                              onClick={() => {
                                setRoomIds((prev) => on ? prev.filter((id) => id !== r.id) : [...prev, r.id]);
                                setError("");
                              }}
                            >
                              {r.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <label className="field">
            <span className="fl">Cameră</span>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              {core.rooms.map((r) => {
                const busy = busyRooms.has(r.id);
                return (
                  <option key={r.id} value={r.id} disabled={busy && r.id !== editing?.roomId}>
                    {r.name} — {ROOM_TYPE[r.type]?.label || ""}{busy && r.id !== editing?.roomId ? " · ocupată" : ""}
                  </option>
                );
              })}
            </select>
          </label>
        )}

        {!isBlock && <div className="field">
          <label>{isGroup ? "Client principal *" : "Client *"}</label>
          {selectedGuest ? (
            <div className="guest-chip">
              <div className="guest-chip-av">{initials(guestFullName(selectedGuest))}</div>
              <div className="guest-chip-body">
                <div className="gname">{guestFullName(selectedGuest)}</div>
                <div className="gmeta">{[selectedGuest.phone, selectedGuest.city].filter(Boolean).join(" · ") || "Fără date de contact"}</div>
              </div>
              <ContactQuickActions guest={selectedGuest} />
              <button className="icon-btn" onClick={() => { setGuestId(""); setGuestQuery(""); }} aria-label="Schimbă clientul">
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="guest-search">
              <div className="search-box" style={{ maxWidth: "none", width: "100%" }}>
                <Search size={15} color="var(--text-muted)" />
                <input
                  value={guestQuery}
                  onChange={(e) => { setGuestQuery(e.target.value); setError(""); }}
                  placeholder="Caută după nume, telefon sau oraș"
                />
              </div>
              {guestQuery.trim() && (
                matchingGuests.length > 0 ? (
                  <div className="guest-results" ref={refRezultateClient}>
                    {matchingGuests.slice(0, 6).map((g) => (
                      <button key={g.id} className="guest-result" onClick={() => { setGuestId(g.id); setGuestQuery(""); }}>
                        <div className="guest-chip-av">{initials(guestFullName(g))}</div>
                        <div>
                          <div className="gname">{guestFullName(g)}</div>
                          <div className="gmeta">{[g.phone, g.city].filter(Boolean).join(" · ")}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="guest-none" ref={refRezultateClient}>
                    <div>Niciun client cu „{guestQuery.trim()}”.</div>
                    <button className="btn btn-primary" style={{ width: "auto", marginTop: 10 }} onClick={startAddGuest}>
                      <Plus size={15} /> Adaugă client nou
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>}

        {!isBlock && (
          <div className="field-row field-row-2col">
            <div className="field">
              <span className="fl">Adulți{isGroup ? " (per cameră)" : ""}</span>
              <OccupantStepper label="Adulți" value={adults} otherValue={children} capacity={maxOccupancy} min={1} onChange={setAdults} />
            </div>
            <div className="field">
              <span className="fl">Copii{isGroup ? " (per cameră)" : ""}</span>
              <OccupantStepper label="Copii" value={children} otherValue={adults} capacity={maxOccupancy} min={0} onChange={setChildren} />
            </div>
          </div>
        )}
        {!isBlock && (
          <div className="note" style={{ marginTop: -6 }}>
            Maxim {maxOccupancy} {maxOccupancy === 1 ? "persoană" : "persoane"} pentru {isGroup ? "camerele selectate" : "camera selectată"}.
          </div>
        )}
        {isGroup && (
          <div className="note">
            Numărul de adulți/copii, etichetele și notele de mai jos se aplică identic pe fiecare
            cameră a grupului. Ocupanții și prețul pot fi ajustați individual după creare, din Grupuri → editează grupul.
          </div>
        )}

        {!isBlock && (
          <label className="field">
            <span className="fl">Sursa rezervării</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((sc) => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
            </select>
          </label>
        )}

        <div className="field-row field-row-dates">
          <label className="field">
            <span className="fl">{isBlock ? "De la" : "Check-in"}</span>
            <input type="date" value={checkin.slice(0, 10)} onChange={(e) => setCheckin(withNewDate(checkin, e.target.value))} />
          </label>
          <label className="field">
            <span className="fl">Zile</span>
            <select
              value={Math.min(30, Math.max(1, nightsBetween(checkin, checkout)))}
              onChange={(e) => {
                const n = Number(e.target.value);
                const [y, m, d] = checkin.slice(0, 10).split("-").map(Number);
                setCheckout(withNewDate(checkout, toDateInput(new Date(y, m - 1, d + n))));
              }}
            >
              {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="fl">{isBlock ? "Până la" : "Check-out"}</span>
            <input type="date" value={checkout.slice(0, 10)} onChange={(e) => setCheckout(withNewDate(checkout, e.target.value))} />
          </label>
        </div>

        {!isBlock && <div className="price-box">
          <div className="pb-info">
            <div className="price-label">
              {nightsBetween(checkin, checkout)} nopți{isGroup && roomIds.length ? ` × ${roomIds.length} camere` : ""}
            </div>
            <div className="price-value">{fmtMoney(previewTotal)}</div>
          </div>
          <div className="pb-manual">
            <label htmlFor="manual-price">Preț manual{isGroup ? " (total grup)" : ""}</label>
            <input id="manual-price" type="number" min="0" step="1" placeholder="auto" value={priceOverride}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || (Number(v) >= 0 && Number.isFinite(Number(v)))) { setPriceOverride(v); setError(""); }
              }} />
          </div>
        </div>}

        {!isBlock && editing && (
          <FolioPanel reservation={editing} core={core} updateCore={updateCore}
            billingCustomerId={billingCustomerId} setBillingCustomerId={setBillingCustomerId}
            onNewBillingCustomer={() => setBillingModalOpen(true)} />
        )}

        {!isBlock && (
          <div className="field">
            <label>Etichete</label>
            <div className="tag-picker">
              {(core.tags || DEFAULT_TAGS).map((t) => (
                <button key={t}
                  className={"tag-chip" + (tags.includes(t) ? " on" : "")}
                  onClick={() => setTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                >{t}</button>
              ))}
              {newTagOpen ? (
                <span className="tag-new">
                  <input
                    autoFocus
                    value={newTag}
                    placeholder="Etichetă nouă"
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitNewTag(); }
                      if (e.key === "Escape") { e.preventDefault(); setNewTagOpen(false); setNewTag(""); }
                    }}
                  />
                  <button className="icon-btn" onClick={commitNewTag} aria-label="Adaugă eticheta">
                    <Check size={14} />
                  </button>
                </span>
              ) : (
                <button className="tag-chip tag-add" onClick={() => setNewTagOpen(true)}>
                  <Plus size={13} /> Etichetă
                </button>
              )}
            </div>
          </div>
        )}

        {!isBlock && (
          <label className="field">
            <span className="fl">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOptions.map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
            </select>
          </label>
        )}

        <label className="field">
          <span className="fl">Note</span>
          <textarea rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observații interne" />
        </label>

        {editing?.messages?.length > 0 && (
          <div className="field">
            <label>Mesaje ({editing.messages.length})</label>
            <div className="msg-list" style={{ marginTop: 0 }}>
              {[...editing.messages].reverse().map((m) => (
                <div className="msg-item" key={m.id}>
                  <div className="msg-text">{m.text}</div>
                  <div className="msg-meta">{m.author} · {fmtDateTime(m.ts)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {editing && !isBlock && <SectiuneAcces res={editing} core={core} />}

        {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}

        {editing && (
          <div className="quick-actions">
            <button className="btn btn-ghost" onClick={() => setShowArrival(true)}>
              <Printer size={14} /> Fișa de sosire
            </button>
            {/* Aceeasi regula canCheckIn ca in panoul din calendar: cu pana
                la 48h inainte de sosire.
                Butonul SALVEAZA pe loc, nu doar schimba dropdownul de status:
                inainte apela setStatus si atat, iar dropdownul fiind derulat
                sus, in afara ecranului, parea ca apasarea nu face nimic. */}
            {canCheckIn(editing) && (
              <button className="btn btn-ghost" disabled={saving}
                onClick={() => { setStatus("checkedin"); save("checkedin"); }}>
                <LogIn size={14} /> Marchează check-in
              </button>
            )}
            {editing.status === "confirmed" && !canCheckIn(editing) && (
              <span className="quick-hint">
                {new Date(editing.checkin) > new Date()
                  ? `Check-in disponibil cu ${ORE_CHECKIN_DEVREME}h înainte de sosire (${fmtDate(editing.checkin)})`
                  : "Sosirea era într-o zi trecută — corectează data de check-in."}
              </span>
            )}
            {canCheckOut(editing) && (
              <button className="btn btn-ghost" disabled={saving}
                onClick={() => { setStatus("checkedout"); save("checkedout"); }}>
                Marchează check-out <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}

        <div className="modal-actions">
          {editing && (
            <button className="btn btn-danger" onClick={remove} disabled={saving}>
              <Trash2 size={14} /> Șterge
            </button>
          )}
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Anulează</button>
          {/* `() => save()`, nu `save`: altfel React ar trimite evenimentul de
              click drept prim argument, adica drept status. */}
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => save()} disabled={saving}>
            <Check size={15} /> {saving ? "Se salvează..." : "Salvează"}
          </button>
        </div>

      {showArrival && editing && (
        <div onClick={(e) => e.stopPropagation()}>
          <ArrivalForm res={editing} core={core} groups={groups} onClose={() => setShowArrival(false)} />
        </div>
      )}

      {guestFormSeed && (
        <div onClick={(e) => e.stopPropagation()}>
          <GuestModal
            guest={guestFormSeed}
            onSave={saveNewGuest}
            onClose={() => setGuestFormSeed(null)}
          />
        </div>
      )}

      {billingModalOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <BillingCustomerModal
            seedFromGuest={selectedGuest}
            existingCustomers={core.billingCustomers || []}
            onSave={saveNewBillingCustomer}
            onClose={() => setBillingModalOpen(false)}
          />
        </div>
      )}
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   CLIENTS VIEW
----------------------------------------------------------------*/
function ClientsView({ core, updateCore, groups, updateGroups, reservations, updateReservations, blocks, onNewGroup }) {
  const [historyGuest, setHistoryGuest] = useState(null);
  const [tab, setTab] = useState("guests");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null); // { guest | null }
  /* Butonul "Firmă nouă" sta in antetul comun al tab-urilor, dar
     formularul apartine listei de firme — starea trece de aici acolo. */
  const [firmModal, setFirmModal] = useState(null);

  const filtered = core.guests.filter((g) => {
    const t = q.toLowerCase();
    return guestFullName(g).toLowerCase().includes(t) ||
      (g.phone || "").includes(q) ||
      (g.city || "").toLowerCase().includes(t);
  });

  const save = async (guest) => {
    const exists = core.guests.some((g) => g.id === guest.id);
    const next = exists ? core.guests.map((g) => (g.id === guest.id ? guest : g)) : [...core.guests, guest];
    await updateCore({ ...core, guests: next });
    await audit.push(exists ? "Client modificat" : "Client adăugat", guestFullName(guest));
    setModal(null);
  };
  const remove = async (id) => {
    const g = core.guests.find((x) => x.id === id);
    const hasReservations = reservations.some((r) => r.guestId === id);
    const isGroupMain = groups.some((gr) => gr.mainGuestId === id);
    if (hasReservations || isGroupMain) {
      toaster.show(
        `${guestFullName(g)} are rezervări asociate și nu poate fi șters. Anulează sau șterge întâi rezervările.`,
        { tone: "danger" }
      );
      return;
    }
    const before = core.guests;
    await updateCore({ ...core, guests: core.guests.filter((x) => x.id !== id) });
    await audit.push("Client șters", guestFullName(g));
    toaster.show(`${guestFullName(g)} a fost șters`, {
      tone: "danger",
      onUndo: async () => {
        await updateCore({ ...core, guests: before });
        await audit.push("Ștergere anulată", guestFullName(g));
      },
    });
  };

  const paginare = usePaginare(filtered);
  const firmCount = (core.billingCustomers || []).filter((c) => c.kind === "company").length;

  const header = (
    <div className="tabs-bar">
      <SubTabs tab={tab} setTab={setTab} groupCount={groups.length}
        guestCount={core.guests.length} firmCount={firmCount} />
      <div className="tabs-actions">
        {tab === "groups" ? (
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={onNewGroup}>
            <UsersRound size={15} /> Grup nou
          </button>
        ) : tab === "firms" ? (
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setFirmModal({ customer: null })}>
            <Plus size={15} /> Firmă nouă
          </button>
        ) : (
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ guest: null })}>
            <Plus size={15} /> Client nou
          </button>
        )}
      </div>
    </div>
  );

  if (tab === "groups") {
    return (
      <div>
        {header}
        <GroupsView core={core} groups={groups} updateGroups={updateGroups}
          reservations={reservations} updateReservations={updateReservations} blocks={blocks} />
      </div>
    );
  }

  if (tab === "firms") {
    return (
      <div>
        {header}
        <FirmsView core={core} updateCore={updateCore} reservations={reservations}
          modalExtern={firmModal} inchideModalExtern={() => setFirmModal(null)} />
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="toolbar">
        <div className="search-box">
          <Search size={15} color="var(--text-muted)" />
          <input placeholder="Caută după nume sau telefon" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="badge-count">{filtered.length} clienți</span>
      </div>

      <div className="panel">
        {filtered.length === 0 ? (
          <div className="empty-state"><Users size={26} /><h4>Niciun client</h4><p>Adaugă primul client.</p></div>
        ) : paginare.feliate.map((g) => (
          <div className="list-row" key={g.id}>
            <div
              role="button" tabIndex={0} style={{ cursor: "pointer" }}
              onClick={() => setHistoryGuest(g)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setHistoryGuest(g); } }}
            >
              <div className="primary">{guestFullName(g)}</div>
              <div className="secondary">
                {[g.phone, g.email, [g.city, g.county].filter(Boolean).join(", "), g.country !== "România" ? g.country : null]
                  .filter(Boolean).join(" · ")}
              </div>
              {(() => {
                const stays = reservations.filter((r) => r.guestId === g.id && isLive(r));
                if (!stays.length) return null;
                const nights = stays.reduce((n, r) => n + nightsBetween(r.checkin, r.checkout), 0);
                // Protocol nu se incaseaza — nu intra in suma "incasati".
                const spent = stays.filter(isStatsEligible).reduce((v, r) => v + reservationTotal(r, core), 0);
                return <div className="secondary" style={{ marginTop: 3 }}>
                  <strong>{stays.length}</strong> sejururi · {nights} nopți · {fmtMoney(spent)} încasați
                </div>;
              })()}
            </div>
            <div className="row-actions">
              <button className="icon-btn" title="Istoric sejururi" aria-label={`Istoric sejururi ${guestFullName(g)}`} onClick={() => setHistoryGuest(g)}>
                <History size={14} />
              </button>
              <button className="icon-btn" onClick={() => setModal({ guest: g })} aria-label={`Editează ${guestFullName(g)}`}><Pencil size={14} /></button>
              <button className="icon-btn" onClick={() => remove(g.id)} aria-label={`Șterge ${guestFullName(g)}`}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      <Paginare stare={paginare} eticheta="clienți" />

      {modal && <GuestModal guest={modal.guest} onSave={save} onClose={() => setModal(null)} />}
      {historyGuest && (
        <GuestHistory guest={historyGuest} core={core} reservations={reservations} onClose={() => setHistoryGuest(null)} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   FIRME — clientii de facturare de tip companie.
   Traiesc in `billing_customers`, acelasi tabel cu persoanele fizice
   catre care se factureaza; aici se vad doar cele cu kind='company'.
   Se creau pana acum doar din interiorul unei rezervari, deci nu exista
   niciun loc unde sa fie vazute toate la un loc, editate sau sterse.
----------------------------------------------------------------*/
function FirmsView({ core, updateCore, reservations, modalExtern, inchideModalExtern }) {
  const [q, setQ] = useState("");
  const [modalIntern, setModalIntern] = useState(null); // { customer } | null
  const [istoric, setIstoric] = useState(null);         // firma pentru care aratam istoricul

  /* Formularul se poate deschide din doua locuri: butonul "Firmă nouă"
     din antetul tab-urilor (care traieste in ClientsView) si creionul de
     pe fiecare rand. */
  const modal = modalIntern || modalExtern;
  const setModal = (v) => { setModalIntern(v); if (!v) inchideModalExtern?.(); };

  const firme = (core.billingCustomers || []).filter((c) => c.kind === "company");
  const filtrate = firme.filter((c) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return [c.companyName, c.cui, c.regCom, c.city, c.contactName, c.email, c.phone]
      .filter(Boolean).join(" ").toLowerCase().includes(t);
  });

  const paginare = usePaginare(filtrate);

  const save = async (customer) => {
    const exista = (core.billingCustomers || []).some((c) => c.id === customer.id);
    const next = exista
      ? core.billingCustomers.map((c) => (c.id === customer.id ? customer : c))
      : [...(core.billingCustomers || []), customer];
    await updateCore({ ...core, billingCustomers: next });
    await audit.push(exista ? "Firmă modificată" : "Firmă adăugată", billingCustomerLabel(customer));
    setModal(null);
  };

  /* Stergerea e blocata daca firma e folosita undeva. Baza refuza oricum
     (invoices.billing_customer_id are on delete restrict), dar un mesaj
     clar e mai util decat o eroare de constrangere. */
  const remove = async (firma) => {
    const areRezervari = reservations.some((r) => r.billingCustomerId === firma.id);
    if (areRezervari) {
      toaster.show(
        `${billingCustomerLabel(firma)} e folosită pe rezervări și nu poate fi ștearsă. Schimbă întâi clientul de facturare pe acele rezervări.`,
        { tone: "danger" });
      return;
    }
    const { count, error } = await supabase
      .from("invoices").select("id", { count: "exact", head: true }).eq("billing_customer_id", firma.id);
    if (error) { toaster.show(mesajEroare(error, "Nu am putut verifica facturile firmei"), { tone: "danger" }); return; }
    if (count > 0) {
      toaster.show(
        `${billingCustomerLabel(firma)} are ${count} ${count === 1 ? "factură emisă" : "facturi emise"} și nu poate fi ștearsă — facturile trebuie păstrate.`,
        { tone: "danger" });
      return;
    }

    const before = core.billingCustomers;
    await updateCore({ ...core, billingCustomers: firme.length
      ? core.billingCustomers.filter((c) => c.id !== firma.id) : [] });
    await audit.push("Firmă ștearsă", billingCustomerLabel(firma));
    toaster.show(`${billingCustomerLabel(firma)} a fost ștearsă`, {
      tone: "danger",
      onUndo: async () => {
        await updateCore({ ...core, billingCustomers: before });
        await audit.push("Ștergere anulată", billingCustomerLabel(firma));
      },
    });
  };

  return (
    <div>
      <div className="toolbar">
        <div className="search-box">
          <Search size={15} color="var(--text-muted)" />
          <input placeholder="Caută după denumire, CUI sau oraș" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Caută firme" />
        </div>
        <span className="badge-count">{filtrate.length} {filtrate.length === 1 ? "firmă" : "firme"}</span>
      </div>

      <div className="panel">
        {filtrate.length === 0 ? (
          <div className="empty-state">
            <Receipt size={26} />
            <h4>{firme.length ? "Nicio firmă găsită" : "Nicio firmă"}</h4>
            <p>{firme.length
              ? "Încearcă alt termen de căutare."
              : "Firmele se adaugă de aici sau direct dintr-o rezervare, la „Facturare către”."}</p>
          </div>
        ) : paginare.feliate.map((c) => {
          const rezervari = reservations.filter((r) => r.billingCustomerId === c.id);
          return (
            <div className="list-row" key={c.id}>
              <div
                role="button" tabIndex={0} style={{ cursor: "pointer", minWidth: 0 }}
                onClick={() => setIstoric(c)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIstoric(c); } }}
              >
                <div className="primary">{c.companyName}</div>
                <div className="secondary">
                  {[c.cui ? `CUI ${c.cui}` : null, c.regCom, [c.city, c.county].filter(Boolean).join(", ")]
                    .filter(Boolean).join(" · ")}
                </div>
                {/* Persoana de contact si datele ei nu se mai afiseaza in
                    lista — se vad la editare si in istoric. Randul din
                    lista ramane pe ce identifica firma: denumire, CUI,
                    oras. */}
                {rezervari.length > 0 && (
                  <div className="secondary" style={{ marginTop: 3 }}>
                    <strong>{rezervari.length}</strong> {rezervari.length === 1 ? "rezervare" : "rezervări"} facturate către firmă
                  </div>
                )}
              </div>
              <div className="row-actions">
                <button className="icon-btn" title="Istoric" aria-label={`Istoric ${billingCustomerLabel(c)}`}
                  onClick={() => setIstoric(c)}><History size={14} /></button>
                <button className="icon-btn" aria-label={`Editează ${billingCustomerLabel(c)}`}
                  onClick={() => setModal({ customer: c })}><Pencil size={14} /></button>
                <button className="icon-btn" aria-label={`Șterge ${billingCustomerLabel(c)}`}
                  onClick={() => remove(c)}><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>

      <Paginare stare={paginare} eticheta={paginare.totalItems === 1 ? "firmă" : "firme"} />

      {modal && (
        <BillingCustomerModal
          customer={modal.customer}
          existingCustomers={core.billingCustomers || []}
          onSave={save}
          onClose={() => setModal(null)}
        />
      )}
      {istoric && (
        <FirmHistory firma={istoric} core={core} reservations={reservations} onClose={() => setIstoric(null)} />
      )}
    </div>
  );
}

/* Istoricul unei firme: rezervarile facturate catre ea si facturile
   emise pe numele ei. Facturile se citesc la deschidere — nu sunt in
   `core`, care tine doar ce e nevoie la pornirea aplicatiei. */
function FirmHistory({ firma, core, reservations, onClose }) {
  useModalLock();
  const [facturi, setFacturi] = useState(null);
  const [eroare, setEroare] = useState("");

  useEffect(() => {
    let activ = true;
    (async () => {
      try {
        const data = await dateFacturare.facturiAleClientului(firma.id);
        if (!activ) return;
        setFacturi(data);
      } catch (e) {
        if (!activ) return;
        setEroare(mesajEroare(e, "Nu am putut încărca facturile"));
      }
    })();
    return () => { activ = false; };
  }, [firma.id]);

  const rezervari = reservations
    .filter((r) => r.billingCustomerId === firma.id)
    .sort((a, b) => new Date(b.checkin) - new Date(a.checkin));

  const totalFacturat = (facturi || []).reduce((s, f) => s + Number(f.total_amount), 0);
  const totalIncasat = (facturi || []).reduce((s, f) => s + Number(f.paid_amount), 0);

  return (
    <Dialog onClose={onClose} title={firma.companyName}>
      <div className="note" style={{ marginBottom: 14 }}>
        {[firma.cui ? `CUI ${firma.cui}` : null, firma.regCom,
          [firma.address, firma.city, firma.county, firma.country].filter(Boolean).join(", ")]
          .filter(Boolean).join(" · ")}
      </div>

      {facturi !== null && facturi.length > 0 && (
        <div className="stat-row" style={{ marginBottom: 14 }}>
          <Stat label="Facturi" value={facturi.length} />
          <Stat label="Total facturat" value={fmtMoney(totalFacturat)} />
          <Stat label="Încasat" value={fmtMoney(totalIncasat)} />
        </div>
      )}

      <label className="field"><span className="fl">Rezervări facturate către firmă</span></label>
      {rezervari.length === 0 ? (
        <div className="note">Nicio rezervare facturată către această firmă.</div>
      ) : (
        <div className="panel" style={{ marginBottom: 16 }}>
          {rezervari.map((r) => {
            const camera = core.rooms.find((x) => x.id === r.roomId);
            return (
              <div className="list-row" key={r.id}>
                <div style={{ minWidth: 0 }}>
                  <div className="primary">{occupantName(r, core, []) || guestFullName(core.guests.find((g) => g.id === r.guestId)) || "Fără nume"}</div>
                  <div className="secondary">
                    <span className="mono">{camera?.name || r.roomId}</span> · {fmtDate(r.checkin)} → {fmtDate(r.checkout)}
                  </div>
                </div>
                <span className="mono" style={{ fontWeight: 650 }}>{fmtMoney(reservationTotal(r, core))}</span>
              </div>
            );
          })}
        </div>
      )}

      <label className="field"><span className="fl">Facturi emise</span></label>
      {eroare ? (
        <div className="note" style={{ color: "var(--danger)" }}>{eroare}</div>
      ) : facturi === null ? (
        <div className="note">Se încarcă…</div>
      ) : facturi.length === 0 ? (
        <div className="note">Nicio factură emisă pe această firmă.</div>
      ) : (
        <div className="panel">
          {facturi.map((f) => (
            <div className="list-row" key={f.id}>
              <div style={{ minWidth: 0 }}>
                <div className="primary">
                  {f.series ? `${f.series} ${f.number}` : "Draft"}
                  <span className={"role-tag " + INVOICE_STATUS_CLASS[f.status]} style={{ marginLeft: 8 }}>
                    {INVOICE_STATUS_LABEL[f.status]}
                  </span>
                </div>
                <div className="secondary">{f.issue_date ? fmtDateFull(f.issue_date) : "neemisă"}</div>
              </div>
              <span className="mono" style={{ fontWeight: 650 }}>{fmtMoney(f.total_amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="modal-actions">
        <div className="grow" />
        <button className="btn btn-ghost" onClick={onClose}>Închide</button>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   GUEST FORM — shared by ClientsView and ReservationModal
----------------------------------------------------------------*/
function splitPhone(phone) {
  const s = String(phone || "").trim();
  if (s.startsWith("+")) {
    const match = DIAL_LIST
      .filter((d) => s.startsWith(d.dial))
      .sort((a, b) => b.dial.length - a.dial.length)[0];
    if (match) return { dial: match.dial, local: s.slice(match.dial.length).trim() };
  }
  return { dial: "+40", local: s.replace(/^0/, "") };
}
function joinPhone(dial, local) {
  const l = String(local || "").trim();
  return l ? `${dial} ${l}` : "";
}

function PhoneDialPicker({ dial, onSelect }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const t = q.trim().toLowerCase();
  const filtered = t
    ? DIAL_LIST.filter((d) => d.country.toLowerCase().includes(t) || d.dial.includes(t))
    : DIAL_LIST;

  return (
    <div className="phone-dial-wrap" ref={ref}>
      <button type="button" className="phone-dial-btn" onClick={() => setOpen((v) => !v)}>
        <span className="mono">{dial}</span>
      </button>
      {open && (
        <div className="phone-dial-pop">
          <input
            autoFocus placeholder="Caută țara" value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="phone-dial-list">
            {filtered.length === 0 && <div className="phone-dial-empty">Nicio țară găsită.</div>}
            {filtered.map((d) => (
              <button
                type="button" key={d.country}
                className={"phone-dial-item" + (d.dial === dial ? " on" : "")}
                onClick={() => { onSelect(d.dial); setOpen(false); setQ(""); }}
              >
                <span>{d.country}</span>
                <span className="mono">{d.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const emptyGuest = () => ({
  lastName: "", firstName: "", phone: "", email: "",
  address: "", city: "", county: "Cluj", country: "România", notes: "", salutation: "",
});

/* Group rooms can each carry their own occupant, while the group's
   main client stays the billing contact. */
function telHref(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

/* Mesaj WhatsApp predefinit, personalizat cu titlul (Dl/Dna) ales pe fisa
   clientului. Fara titlu salvat, mesajul sare peste formula de adresare
   ca sa nu sune ciudat ("Buna ziua Popescu Andrei" fara Domnule/Doamna). */
function whatsappHref(guest) {
  const digits = String(guest?.phone || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const formula = guest?.salutation === "Dl" ? "domnule "
    : guest?.salutation === "Dna" ? "doamnă " : "";
  const name = guestFullName(guest);
  const text = `Bună ziua ${formula}${name}, vă contactez de la recepția Complexului La Livada, `;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/* Perechea de iconite telefon/WhatsApp, refolosita in lista de clienti si
   in fereastra de rezervare. `onClick` optional opreste propagarea cand
   butoanele stau intr-un rand care are propriul click handler (ex. randul
   de client care deschide istoricul la click). */
function ContactQuickActions({ guest, onClick }) {
  const tel = telHref(guest?.phone);
  const wa = whatsappHref(guest);
  if (!tel && !wa) return null;
  return (
    <span className="contact-quick" onClick={onClick}>
      {tel && (
        <a className="icon-btn tel" href={tel} title="Sună clientul" aria-label={`Sună ${guestFullName(guest)}`}>
          <Phone size={17} />
        </a>
      )}
      {wa && (
        <a className="icon-btn wa" href={wa} target="_blank" rel="noreferrer"
          title="Mesaj WhatsApp" aria-label={`Mesaj WhatsApp către ${guestFullName(guest)}`}>
          <MessageCircle size={17} />
        </a>
      )}
    </span>
  );
}

const GuestFields = React.memo(function GuestFields({ value, onChange, invalid }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const err = (k) => (invalid?.has(k) ? " input-error" : "");
  const { dial, local } = splitPhone(value.phone);
  const phoneCheck = validatePhone(local, dial);
  const emailCheck = validateEmail(value.email);
  return (
    <>
      <div className="field-row field-row-2col">
        <label className="field">
          <select value={value.salutation} onChange={set("salutation")}>
            <option value="">Dl / Dnă</option>
            <option value="Dl">Domnul</option>
            <option value="Dna">Doamna</option>
          </select>
        </label>
        <div />
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Nume *</span><input className={err("lastName")} value={value.lastName} onChange={set("lastName")} placeholder="Popescu" /></label>
        <label className="field"><span className="fl">Prenume *</span><input className={err("firstName")} value={value.firstName} onChange={set("firstName")} placeholder="Andrei" /></label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field">
          <span className="fl">Telefon *</span>
          <div className="phone-input-row">
            <PhoneDialPicker dial={dial} onSelect={(d) => onChange({ ...value, phone: joinPhone(d, local) })} />
            <input className={err("phone") + (local && !phoneCheck.ok ? " input-error" : "")} value={local}
              onChange={(e) => onChange({ ...value, phone: joinPhone(dial, e.target.value) })}
              placeholder="722 111 222" />
          </div>
        </label>
        <label className="field">
          <span className="fl">Email</span>
          <input type="email" className={value.email && !emailCheck.ok ? "input-error" : ""}
            value={value.email} onChange={set("email")} placeholder="nume@exemplu.ro" />
        </label>
      </div>
      {local && !phoneCheck.ok && (
        <div className="note" style={{ marginTop: -6, marginBottom: 14 }}>{phoneCheck.message}</div>
      )}
      {value.email && !emailCheck.ok && (
        <div className="note" style={{ marginTop: -6, marginBottom: 14 }}>{emailCheck.message}</div>
      )}
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Adresă</span><input value={value.address} onChange={set("address")} placeholder="Str. Exemplu nr. 10" /></label>
        <label className="field"><span className="fl">Oraș *</span><input className={err("city")} value={value.city} onChange={set("city")} /></label>
      </div>
      <div className="field-row field-row-2col">
        <div className="field">
          <label>Județ *</label>
          {value.country === "România" ? (
            <select className={err("county")} value={value.county} onChange={set("county")}>
              {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          ) : (
            <input className={err("county")} value={value.county} onChange={set("county")} placeholder="Regiune" />
          )}
        </div>
        <label className="field">
          <span className="fl">Țară *</span>
          <select className={err("country")} value={value.country} onChange={set("country")}>
            {TARI.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
    </>
  );
});

const GUEST_HISTORY_PAGE_SIZE = 15;

function GuestHistory({ guest, core, reservations, onClose }) {
  useModalLock();
  const [page, setPage] = useState(0);
  const stays = reservations
    .filter((r) => r.guestId === guest.id)
    .sort((a, b) => new Date(b.checkin) - new Date(a.checkin));
  const live = stays.filter(isLive);
  const nights = live.reduce((n, r) => n + nightsBetween(r.checkin, r.checkout), 0);
  // Protocol nu se incaseaza — nu intra in "Valoare".
  const spent = live.filter(isStatsEligible).reduce((v, r) => v + reservationTotal(r, core), 0);

  const pageCount = Math.max(1, Math.ceil(stays.length / GUEST_HISTORY_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStays = stays.slice(safePage * GUEST_HISTORY_PAGE_SIZE, (safePage + 1) * GUEST_HISTORY_PAGE_SIZE);

  const contactLine = [guest.city, guest.county].filter(Boolean).join(", ");

  return (
    <Dialog onClose={onClose} title={guestFullName(guest)}>

        <div className="guest-contact-info">
          {contactLine && <div>{contactLine}{guest.country && guest.country !== "România" ? ` · ${guest.country}` : ""}</div>}
          {guest.phone && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {guest.phone}
              <ContactQuickActions guest={guest} />
            </div>
          )}
          {guest.email && <div><a href={`mailto:${guest.email}`}>{guest.email}</a></div>}
        </div>

        <div className="stat-row" style={{ marginBottom: 14 }}>
          <Stat label="Sejururi" value={live.length} sub="valide" />
          <Stat label="Nopți" value={nights} sub="total" />
          <Stat label="Valoare" value={fmtMoney(spent)} sub="cumulat" />
          <Stat label="Ultimul" value={live[0] ? fmtDateFull(live[0].checkin) : "—"} sub="sosire" />
        </div>

        {stays.length === 0 ? (
          <div className="section-empty">Niciun sejur înregistrat.</div>
        ) : (
          <>
            <div className="panel">
              {pageStays.map((r) => (
                <div className="list-row" key={r.id}>
                  <div>
                    <div className="primary mono">{core.rooms.find((x) => x.id === r.roomId)?.name || "—"}</div>
                    <div className="secondary">
                      {fmtDateFull(r.checkin)} → {fmtDateFull(r.checkout)} · {nightsBetween(r.checkin, r.checkout)} nopți · {sourceLabel(r.source)}
                    </div>
                  </div>
                  <span className={"role-tag " + (r.status === "checkedout" ? "role-receptionist"
                    : isLive(r) ? "role-admin" : "role-housekeeping")}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
              ))}
            </div>
            {pageCount > 1 && (
              <div className="pager">
                <button className="btn btn-ghost" style={{ width: "auto" }} disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft size={15} /> Anterior
                </button>
                <span className="pager-info">Pagina {safePage + 1} din {pageCount}</span>
                <button className="btn btn-ghost" style={{ width: "auto" }} disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
                  Următor <ChevronRight size={15} />
                </button>
              </div>
            )}
          </>
        )}
      </Dialog>
  );
}

function SubTabs({ tab, setTab, guestCount, groupCount, firmCount }) {
  return (
    <div className="sub-tabs">
      <button className={tab === "guests" ? "on" : ""} onClick={() => setTab("guests")}>
        <Users size={14} /> Oaspeți <span className="tab-count">{guestCount}</span>
      </button>
      <button className={tab === "firms" ? "on" : ""} onClick={() => setTab("firms")}>
        <Receipt size={14} /> Firme <span className="tab-count">{firmCount}</span>
      </button>
      <button className={tab === "groups" ? "on" : ""} onClick={() => setTab("groups")}>
        <UsersRound size={14} /> Grupuri <span className="tab-count">{groupCount}</span>
      </button>
    </div>
  );
}

function GuestModal({ guest, onSave, onClose }) {
  useModalLock();
  const [g, setG] = useState(() => ({ ...emptyGuest(), ...(guest || {}) }));
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(null);
  const [saving, setSaving] = useState(false);
  // Generat o singura data, nu la fiecare submit — altfel un dublu-tap pe
  // "Salveaza" (usor de facut pe mobil cat timp raspunsul serverului
  // intarzie) produce doua id-uri diferite, deci doi clienti locali
  // distincti adaugati optimist in core.guests inainte ca salvarea sa se
  // termine si dialogul sa se inchida — apar duplicate in cautare chiar
  // daca la final se salveaza un singur rand in baza de date.
  const idRef = useRef(guest?.id || uid());

  const REQUIRED = [
    ["lastName", "nume"], ["firstName", "prenume"], ["phone", "telefon"],
    ["city", "oraș"], ["county", "județ"], ["country", "țară"],
  ];

  const submit = async () => {
    if (saving) return;
    const missing = REQUIRED.filter(([k]) => !String(g[k] ?? "").trim());
    if (missing.length) {
      setInvalid(new Set(missing.map(([k]) => k)));
      setError(`Completează: ${missing.map(([, label]) => label).join(", ")}.`);
      return;
    }
    const { dial, local } = splitPhone(g.phone);
    const phoneCheck = validatePhone(local, dial);
    if (!phoneCheck.ok) {
      setInvalid(new Set(["phone"]));
      setError(phoneCheck.message);
      return;
    }
    const emailCheck = validateEmail(g.email);
    if (!emailCheck.ok) {
      setInvalid(new Set(["email"]));
      setError(emailCheck.message);
      return;
    }
    setInvalid(null);
    setSaving(true);
    const record = {
      ...g,
      id: idRef.current,
      lastName: g.lastName.trim(), firstName: g.firstName.trim(),
      phone: g.phone.trim(), email: g.email.trim(),
      address: g.address.trim(), city: g.city.trim(),
      county: g.county.trim(), country: g.country.trim(),
    };
    record.name = guestFullName(record);
    try {
      await onSave(record);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onClose={onClose} title={guest?.id ? "Editează client" : "Client nou"}>
        <GuestFields value={g} invalid={invalid} onChange={(v) => { setG(v); setError(""); setInvalid(null); }} />
        <label className="field"><span className="fl">Note</span><textarea rows={2} maxLength={2000} value={g.notes} onChange={(e) => setG({ ...g, notes: e.target.value })} /></label>
        {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="modal-actions">
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Anulează</button>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit} disabled={saving}>
            <Check size={15} /> {saving ? "Se salvează…" : "Salvează"}
          </button>
        </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   HOUSEKEEPING VIEW
----------------------------------------------------------------*/
const HK_STATUSES = [
  { key: "clean", label: "Curată", cls: "clean" },
  { key: "progress", label: "În curs", cls: "progress" },
  { key: "dirty", label: "Murdară", cls: "dirty" },
];

function HousekeepingView({ core, reservations, housekeeping, updateHousekeeping }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);

  const arrivesToday = (roomId) =>
    reservations.some((r) => r.roomId === roomId && isLive(r) &&
      new Date(r.checkin) >= today && new Date(r.checkin) < tomorrow);

  const setStatus = async (roomId, status) => {
    const next = { ...housekeeping, [roomId]: { status, updatedAt: new Date().toISOString() } };
    await updateHousekeeping(next);
    const label = HK_STATUSES.find((x) => x.key === status)?.label || status;
    await audit.push("Status cameră", `${core.rooms.find((r) => r.id === roomId)?.name} → ${label}`);
  };

  const groups = ["tiny", "loft"].map((t) => ({ type: t, rooms: core.rooms.filter((r) => r.type === t) })).filter((g) => g.rooms.length);

  return (
    <div>
      {groups.map((g) => (
        <div key={g.type} style={{ marginBottom: 22 }}>
          <div className="group-head">
            {ROOM_TYPE[g.type].label}
            <span className="badge-count">{g.rooms.length}</span>
          </div>
          <div className="room-grid">
            {g.rooms.map((room) => {
              const hk = housekeeping[room.id] || { status: "clean" };
              const arrival = arrivesToday(room.id);
              return (
                <div className="room-card" key={room.id}>
                  <div className="top">
                    <h4>{room.name}</h4>
                    {arrival && <span className="arrival-badge">Sosire azi</span>}
                  </div>
                  <div className="status-btns">
                    {HK_STATUSES.map((s) => (
                      <button
                        key={s.key}
                        className={"status-btn" + (hk.status === s.key ? " on " + s.cls : "")}
                        onClick={() => setStatus(room.id, s.key)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   PRODUSE/SERVICII + COTE TVA (nomenclator pentru folio/facturare)
----------------------------------------------------------------*/
function RoomsView({ core, updateCore, reservations, updateReservations, blocks, updateBlocks }) {
  const [tab, setTab] = useState("rooms");
  const [modal, setModal] = useState(null);
  const [confirmRoomId, setConfirmRoomId] = useState(null);

  const save = async (room) => {
    const exists = core.rooms.some((r) => r.id === room.id);
    // Merge peste rândul existent (nu înlocuire completă), ca sortOrder/
    // icalToken sau orice alt câmp neexpus în formular să nu se piardă.
    const next = exists
      ? core.rooms.map((r) => (r.id === room.id ? { ...r, ...room } : r))
      : [...core.rooms, room];
    await updateCore({ ...core, rooms: next });
    await audit.push(exists ? "Cameră modificată" : "Cameră adăugată", room.name);
    setModal(null);
  };
  const remove = async (id) => {
    const rm = core.rooms.find((r) => r.id === id);
    const beforeCore = core;
    const beforeRes = reservations;
    const beforeBlocks = blocks;
    const affectedRes = reservations.filter((r) => r.roomId === id).length;
    const affectedBlocks = (blocks || []).filter((b) => b.roomId === id).length;

    await updateCore({ ...core, rooms: core.rooms.filter((r) => r.id !== id) });
    await updateReservations(reservations.filter((r) => r.roomId !== id));
    await updateBlocks((blocks || []).filter((b) => b.roomId !== id));

    const extra = [
      affectedRes ? `${affectedRes} rezervări eliminate` : null,
      affectedBlocks ? `${affectedBlocks} blocaje eliminate` : null,
    ].filter(Boolean).join(" · ");
    await audit.push("Cameră ștearsă", extra ? `${rm?.name || id} · ${extra}` : (rm?.name || id));

    toaster.show(`Camera ${rm?.name || ""} a fost ștearsă`, {
      tone: "danger",
      onUndo: async () => {
        await updateCore(beforeCore);
        await updateReservations(beforeRes);
        await updateBlocks(beforeBlocks);
        await audit.push("Ștergere anulată", rm?.name || id);
      },
    });
  };

  const tabs = (
    <div className="sub-tabs">
      <button className={tab === "rooms" ? "on" : ""} onClick={() => setTab("rooms")}>
        <DoorOpen size={14} /> Camere <span className="tab-count">{core.rooms.length}</span>
      </button>
      <button className={tab === "rates" ? "on" : ""} onClick={() => setTab("rates")}>
        <Banknote size={14} /> Tarife
      </button>
      <button className={tab === "online" ? "on" : ""} onClick={() => setTab("online")}>
        <TrendingUp size={14} /> Optimizator preț
      </button>
      <button className={tab === "tags" ? "on" : ""} onClick={() => setTab("tags")}>
        <TagIcon size={14} /> Etichete <span className="tab-count">{(core.tags || DEFAULT_TAGS).length}</span>
      </button>
    </div>
  );

  if (tab === "rates") {
    return <div>{tabs}<RatesView core={core} updateCore={updateCore} /></div>;
  }

  if (tab === "online") {
    return <div>{tabs}<OnlinePricingView core={core} updateCore={updateCore} /></div>;
  }

  if (tab === "tags") {
    return <div>{tabs}<TagsView core={core} updateCore={updateCore} /></div>;
  }

  return (
    <div>
      {tabs}
      <div className="note">
        ID-urile de dispozitiv de mai jos sunt folosite de workflow-ul de automatizare (n8n → Home Assistant) ca să
        știe ce releu Shelly și ce unitate Sensibo aparțin fiecărei camere.
      </div>
      <div className="toolbar">
        <span className="badge-count">{core.rooms.length} camere</span>
        <div className="grow" />
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ room: null })}>
          <Plus size={15} /> Cameră nouă
        </button>
      </div>
      <div className="panel">
        {core.rooms.map((r) => (
          <div className="list-row" key={r.id}>
            <div>
              <div className="primary">{r.name} <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>· {ROOM_TYPE[r.type]?.label || ""}</span></div>
              <div className="device-row mono"><Flame size={12} /> {r.boilerId} &nbsp; <Wind size={12} /> {r.ventId} &nbsp; <Snowflake size={12} /> {r.sensiboId}</div>
            </div>
            <div className="row-actions">
              <button className="icon-btn" onClick={() => setModal({ room: r })} aria-label={`Editează camera ${r.name}`}><Pencil size={14} /></button>
              {confirmRoomId === r.id ? (
                <>
                  <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600 }}>
                    {(() => {
                      const nR = reservations.filter((x) => x.roomId === r.id).length;
                      const nB = (blocks || []).filter((x) => x.roomId === r.id).length;
                      const parts = [];
                      if (nR) parts.push(`${nR} rezervări`);
                      if (nB) parts.push(`${nB} blocaje`);
                      return parts.length ? `Se șterg și ${parts.join(" și ")}` : "Camera nu are rezervări";
                    })()}
                  </span>
                  <button className="btn btn-danger" style={{ padding: "8px 12px" }}
                    onClick={() => { remove(r.id); setConfirmRoomId(null); }}>
                    Șterge tot
                  </button>
                  <button className="btn btn-ghost" style={{ padding: "8px 12px" }}
                    onClick={() => setConfirmRoomId(null)}>
                    Renunță
                  </button>
                </>
              ) : (
                <button className="icon-btn" onClick={() => setConfirmRoomId(r.id)} aria-label={`Șterge camera ${r.name}`}><Trash2 size={14} /></button>
              )}
            </div>
          </div>
        ))}
      </div>
      {modal && <RoomModal room={modal.room} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}

function RoomModal({ room, onSave, onClose }) {
  useModalLock();
  const [tab, setTab] = useState("info");
  const [name, setName] = useState(room?.name || "");
  const [type, setType] = useState(room?.type || "tiny");
  const [capacity, setCapacity] = useState(room?.capacity ?? 2);
  const [boilerId, setBoilerId] = useState(room?.boilerId || "");
  const [ventId, setVentId] = useState(room?.ventId || "");
  const [sensiboId, setSensiboId] = useState(room?.sensiboId || "");
  const [accessLockId, setAccessLockId] = useState(room?.accessLockId || "");
  const [accessLockName, setAccessLockName] = useState(room?.accessLockName || "");
  /* Yalele citite de la furnizor. `null` = nu s-a cerut inca lista;
     [] = s-a cerut si nu a venit niciuna. Distinctia conteaza pentru mesaj. */
  const [yale, setYale] = useState(null);
  const [yaleStare, setYaleStare] = useState(null);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [unlockStare, setUnlockStare] = useState(null);
  const [error, setError] = useState("");

  const icalUrl = room?.icalToken
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ical-feed/${room.icalToken}.ics`
    : null;
  const copyIcal = async () => {
    if (!icalUrl) return;
    try {
      await navigator.clipboard.writeText(icalUrl);
      toaster.show("Link iCal copiat", { tone: "ok" });
    } catch {
      toaster.show("Nu am putut copia automat — selectează linkul manual.", { tone: "danger" });
    }
  };

  const submit = () => {
    if (!name.trim()) { setError("Numele camerei este obligatoriu."); setTab("info"); return; }
    const cap = Math.max(1, Number(capacity) || 1);
    onSave({
      id: room?.id || uid(), name: name.trim(), type, capacity: cap,
      boilerId: boilerId.trim(), ventId: ventId.trim(), sensiboId: sensiboId.trim(),
      accessLockId: accessLockId.trim(), accessLockName: accessLockName.trim(),
    });
  };

  return (
    <Dialog onClose={onClose} title={room ? "Editează cameră" : "Cameră nouă"}>
        <div className="sub-tabs" style={{ marginBottom: 16 }}>
          <button className={tab === "info" ? "on" : ""} onClick={() => setTab("info")}>
            <Info size={14} /> Informații cameră
          </button>
          <button className={tab === "acces" ? "on" : ""} onClick={() => setTab("acces")}>
            <KeyRound size={14} /> Yală
          </button>
          <button className={tab === "senzori" ? "on" : ""} onClick={() => setTab("senzori")}>
            <Cpu size={14} /> Senzori
          </button>
        </div>

        {tab === "info" ? (
          <>
            <div className="field-row">
              <label className="field"><span className="fl">Nume cameră</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="1015" /></label>
              <label className="field"><span className="fl">Tip</span>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="tiny">Tiny house</option>
                  <option value="loft">Loft</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span className="fl">Link iCal</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="mono" readOnly value={icalUrl || "Disponibil după prima salvare"}
                  style={{ color: icalUrl ? undefined : "var(--text-muted)" }} />
                <button type="button" className="icon-btn" onClick={copyIcal} disabled={!icalUrl}
                  aria-label="Copiază linkul iCal" title="Copiază linkul iCal">
                  <Copy size={14} />
                </button>
              </div>
            </label>
            <label className="field">
              <span className="fl">Număr maxim de persoane</span>
              <input type="number" min="1" max="20" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </label>
          </>
        ) : tab === "acces" ? (
          <>
            {/* Yala electronica. Id-ul se poate scrie de mana (din TTHOTEL)
                sau ales din lista adusa de la furnizor. Potrivirea NU se face
                automat dupa nume: numele yalei nu e o dovada ca e camera
                potrivita, iar o asociere gresita deschide alta usa. */}
            <label className="field">
              <span className="fl">Yală electronică — Lock ID</span>
              <input className="mono" value={accessLockId}
                onChange={(e) => setAccessLockId(e.target.value)}
                placeholder="ex. 1234567 (din TTHOTEL)" />
            </label>
            <label className="field">
              <span className="fl">Yală — denumire (opțional, pentru verificare)</span>
              <input value={accessLockName} onChange={(e) => setAccessLockName(e.target.value)}
                placeholder="cum apare yala în TTLock" />
            </label>

            <div className="modal-actions" style={{ marginTop: 4 }}>
              <button type="button" className="btn btn-ghost" disabled={yaleStare === "caut"}
                onClick={async () => {
                  setYaleStare("caut");
                  const r = await cheamaAcces("sync-locks");
                  if (r.ok) { setYale(r.locks || []); setYaleStare(null); }
                  else { setYale(null); setYaleStare(r.error || "Nu am putut citi yalele."); }
                }}>
                {yaleStare === "caut" ? "Citesc yalele…" : "Sincronizează yale"}
              </button>

              {/* Raspunde la "contul are drepturi pe yala asta?" fara sa
                  astepte un check-in real — necesar cand lista de yale e
                  goala, dar yala poate fi totusi operabila.
                  Codul de test e valabil abia peste o ora, deci nu deschide
                  usa nimanui, si se sterge imediat. */}
              {accessLockId.trim() && (
                <button type="button" className="btn btn-ghost" disabled={yaleStare === "test"}
                  onClick={async () => {
                    setYaleStare("test");
                    const r = await cheamaAcces("test-lock", { lockId: accessLockId.trim() });
                    setYaleStare(r?.ok
                      ? `Yala răspunde. Creare: ${r.creare}, ștergere: ${r.stergere}.${r.atentie ? " " + r.atentie : ""}`
                      : (r?.error || "Testul a eșuat."));
                  }}>
                  {yaleStare === "test" ? "Testez…" : "Testează yala"}
                </button>
              )}
            </div>

            {typeof yaleStare === "string" && yaleStare !== "caut" && (
              <div className="error-text" role="alert" style={{ marginTop: 8 }}>{yaleStare}</div>
            )}

            {yale && yale.length === 0 && (
              <div className="ldv-mic" style={{ marginTop: 8 }}>
                Contul nu are nicio yală în lista TTLock. Se întâmplă când yalele
                sunt administrate din TTHOTEL. Scrie Lock ID-ul manual (îl vezi
                în TTHOTEL, după MAC) și apasă „Testează yala" — dacă răspunde,
                integrarea merge chiar dacă lista e goală.
              </div>
            )}

            {yale && yale.length > 0 && (
              <label className="field" style={{ marginTop: 8 }}>
                <span className="fl">Alege yala ({yale.length} găsite)</span>
                <select value={accessLockId}
                  onChange={(e) => {
                    const y = yale.find((x) => x.lockId === e.target.value);
                    setAccessLockId(e.target.value);
                    if (y) setAccessLockName(y.lockAlias || y.lockName || "");
                  }}>
                  <option value="">— fără yală —</option>
                  {yale.map((y) => (
                    <option key={y.lockId} value={y.lockId}>
                      {(y.lockAlias || y.lockName || "fără nume")} · {y.lockId}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Deschidere manuala, la distanta — gandita pentru manager, nu
                pentru uz curent de receptie. De-aia cere confirmare explicita:
                o usa deschisa din greseala nu se poate anula. */}
            {accessLockId.trim() && (
              <div className="field" style={{ marginTop: 18 }}>
                <span className="fl">Deschidere la distanță</span>
                {confirmUnlock ? (
                  <div className="action-confirm">
                    <span>Deschizi ușa acum?</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-ghost" style={{ padding: "8px 12px" }}
                        onClick={() => setConfirmUnlock(false)} disabled={unlockStare === "deschid"}>Nu</button>
                      <button className="btn btn-danger" style={{ padding: "8px 12px" }}
                        disabled={unlockStare === "deschid"}
                        onClick={async () => {
                          setUnlockStare("deschid");
                          const r = await cheamaAcces("unlock", { lockId: accessLockId.trim() });
                          setUnlockStare(r?.ok ? "Ușa a fost deschisă." : (r?.error || "Deschiderea a eșuat."));
                          setConfirmUnlock(false);
                        }}>
                        Da, deschide
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn btn-ghost"
                    onClick={() => { setConfirmUnlock(true); setUnlockStare(null); }}>
                    <DoorOpen size={14} /> Deschide ușa
                  </button>
                )}
                {typeof unlockStare === "string" && unlockStare !== "deschid" && (
                  <div className={unlockStare === "Ușa a fost deschisă." ? "ldv-mic" : "error-text"}
                    role={unlockStare === "Ușa a fost deschisă." ? undefined : "alert"} style={{ marginTop: 8 }}>
                    {unlockStare}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <label className="field"><span className="fl">ID releu Shelly — boiler</span><input className="mono" value={boilerId} onChange={(e) => setBoilerId(e.target.value)} placeholder="shelly-boiler-1015" /></label>
            <label className="field"><span className="fl">ID releu Shelly — ventilație</span><input className="mono" value={ventId} onChange={(e) => setVentId(e.target.value)} placeholder="shelly-vent-1015" /></label>
            <label className="field"><span className="fl">ID dispozitiv Sensibo — AC</span><input className="mono" value={sensiboId} onChange={(e) => setSensiboId(e.target.value)} placeholder="sensibo-1015" /></label>
          </>
        )}
        {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="modal-actions">
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Anulează</button>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit}><Check size={15} /> Salvează</button>
        </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   USERS VIEW
----------------------------------------------------------------*/
function UsersView() {
  const [list, setList] = useState(null);
  const [modal, setModal] = useState(null);
  const [loadError, setLoadError] = useState("");
  const adminCount = (list || []).filter((u) => u.role === "admin").length;

  const load = useCallback(async () => {
    try { setList(await datePersonal.listeazaPersonal()); setLoadError(""); }
    catch (e) { setLoadError(mesajEroare(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (user, isNew) => {
    const camp = { idUtilizator: user.user_id, nume: user.name, rol: user.role };
    try {
      if (isNew) await datePersonal.adaugaMembru(camp);
      else await datePersonal.actualizeazaMembru(camp);
    } catch (e) {
      toaster.show(mesajEroare(e, isNew ? "Nu am putut adăuga userul" : "Nu am putut salva userul"), { tone: "danger" });
      return;
    }
    await audit.push(isNew ? "User adăugat" : "User modificat", `${user.name} (${ROLE_LABEL[user.role]})`);
    setModal(null);
    load();
  };

  const remove = async (u) => {
    if (list.length <= 1) {
      toaster.show("Nu poți șterge singurul user rămas.", { tone: "danger" });
      return;
    }
    if (u.role === "admin" && adminCount <= 1) {
      toaster.show("Nu poți șterge singurul admin. Numește întâi alt user admin.", { tone: "danger" });
      return;
    }
    try { await datePersonal.stergeMembru(u.user_id); }
    catch (e) { toaster.show(mesajEroare(e, "Nu am putut șterge userul"), { tone: "danger" }); return; }
    await audit.push("User șters", u.name);
    toaster.show(`${u.name} a fost șters`, {
      tone: "danger",
      onUndo: async () => {
        await datePersonal.adaugaMembru({ idUtilizator: u.user_id, nume: u.name, rol: u.role });
        await audit.push("Ștergere anulată", u.name);
        load();
      },
    });
    load();
  };

  if (list === null) {
    return loadError
      ? <div className="section-empty">Nu am putut încărca lista de useri: {loadError}</div>
      : <div className="section-empty">Se încarcă…</div>;
  }

  return (
    <div>
      <div className="note">
        Contul (email + parolă) se creează în Supabase → Authentication → Users. De aici legi doar
        numele și rolul de UUID-ul acelui cont.
      </div>
      <div className="toolbar">
        <span className="badge-count">{list.length} useri</span>
        <div className="grow" />
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ user: null })}>
          <Plus size={15} /> User nou
        </button>
      </div>
      <div className="panel">
        {list.map((u) => (
          <div className="list-row" key={u.user_id}>
            <div>
              <div className="primary">{u.name}</div>
              <div className="secondary mono" style={{ fontSize: 11 }}>{u.user_id}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className={"role-tag role-" + u.role}>{ROLE_LABEL[u.role]}</span>
              <div className="row-actions">
                <button className="icon-btn" onClick={() => setModal({ user: u })} aria-label={`Editează ${u.name}`}><Pencil size={14} /></button>
                <button className="icon-btn" onClick={() => remove(u)} aria-label={`Șterge ${u.name}`}><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {modal && <UserModal user={modal.user} list={list} onSave={save} onClose={() => setModal(null)} />}
    </div>
  );
}

function UserModal({ user, list, onSave, onClose }) {
  useModalLock();
  const isNew = !user;
  const [userId, setUserId] = useState(user?.user_id || "");
  const [name, setName] = useState(user?.name || "");
  const [role, setRole] = useState(user?.role || "receptionist");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const submit = async () => {
    if (!name.trim()) { setError("Numele este obligatoriu."); return; }
    if (isNew && !uuidRe.test(userId.trim())) {
      setError("UUID invalid — copiază-l din Supabase → Authentication → Users.");
      return;
    }
    if (isNew && list.some((u) => u.user_id === userId.trim())) {
      setError("Acest UUID are deja un rol în aplicație.");
      return;
    }
    if (user && user.role === "admin" && role !== "admin") {
      const otherAdmins = list.filter((u) => u.user_id !== user.user_id && u.role === "admin").length;
      if (otherAdmins === 0) {
        setError("Nu poți schimba rolul singurului admin. Numește întâi alt user admin.");
        return;
      }
    }
    setBusy(true);
    await onSave({ user_id: isNew ? userId.trim() : user.user_id, name: name.trim(), role }, isNew);
    setBusy(false);
  };

  return (
    <Dialog onClose={onClose} title={user ? "Editează user" : "User nou"}>
        {isNew && (
          <label className="field">
            <span className="fl">UUID cont Supabase</span>
            <input className="mono" value={userId} onChange={(e) => setUserId(e.target.value)}
              placeholder="ex: 3fa85f64-5717-4562-b3fc-2c963f66afa6" />
          </label>
        )}
        <label className="field"><span className="fl">Nume</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">
          <span className="fl">Rol</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="admin">Admin — acces complet</option>
            <option value="receptionist">Recepționer — rezervări, clienți, camere</option>
            <option value="housekeeping">Cameristă — doar status camere</option>
          </select>
        </label>
        {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="modal-actions">
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose}>Anulează</button>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit} disabled={busy}><Check size={15} /> Salvează</button>
        </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   PROFILE VIEW
----------------------------------------------------------------*/
const PERMISSIONS = {
  admin: ["Calendar și rezervări", "Clienți", "Status camere", "Automatizare pre-sosire", "Configurare camere și dispozitive", "Administrare useri"],
  receptionist: ["Calendar și rezervări", "Clienți", "Status camere", "Automatizare pre-sosire"],
  housekeeping: ["Status camere"],
};
const ALL_PERMS = PERMISSIONS.admin;

/* Verifică dacă parola apare în scurgerile publice de date (HaveIBeenPwned).
 *
 * Supabase are asta încorporat, dar doar pe planul Pro. Verificarea în sine
 * e un API public și gratuit, așa că o facem noi. O parolă apărută într-o
 * scurgere e prima încercată de orice atac automat, indiferent cât de
 * complicată pare după regulile obișnuite: „Parola123" trece de „minim 8
 * caractere, o cifră", dar apare în scurgeri de peste 233.000 de ori.
 *
 * Parola NU pleacă din browser. Se trimit primele 5 caractere din hash-ul
 * SHA-1; serverul întoarce toate hash-urile care încep așa (câteva sute),
 * iar potrivirea se face local. Metoda se numește k-anonymity și e exact
 * ce face Supabase pe Pro.
 *
 * Întoarce numărul de apariții, 0 dacă e curată, sau null dacă verificarea
 * n-a putut fi făcută. La null lăsăm parola să treacă: un serviciu extern
 * picat nu trebuie să blocheze pe cineva care își schimbă parola.
 */
async function aparitiiInScurgeri(parola) {
  try {
    const octeti = new TextEncoder().encode(parola);
    const hash = await crypto.subtle.digest("SHA-1", octeti);
    const hex = [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

    const raspuns = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, {
      // Adaugă rânduri false în răspuns, ca mărimea lui să nu spună nimic.
      headers: { "Add-Padding": "true" },
    });
    if (!raspuns.ok) return null;

    const restul = hex.slice(5);
    for (const linie of (await raspuns.text()).split("\n")) {
      const [sufix, numar] = linie.trim().split(":");
      if (sufix === restul) return Number(numar) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}

function ProfileView({ user, onLogout, onBack }) {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const mine = PERMISSIONS[user.role] || [];

  const changePassword = async () => {
    if (password.length < 8) { setMsg({ type: "err", text: "Parola trebuie să aibă cel puțin 8 caractere." }); return; }
    if (password !== password2) { setMsg({ type: "err", text: "Cele două parole nu coincid." }); return; }
    setBusy(true);

    const aparitii = await aparitiiInScurgeri(password);
    if (aparitii) {
      setBusy(false);
      setMsg({
        type: "err",
        text: `Parola asta apare în scurgeri publice de date (de ${aparitii.toLocaleString("ro-RO")} ori). `
            + `Atacurile automate o încearcă prima. Alege alta.`,
      });
      return;
    }

    const { error } = await datePersonal.schimbaParola(password).then(() => ({ error: null }), (e) => ({ error: e }));
    setBusy(false);
    if (error) { setMsg({ type: "err", text: mesajEroare(error) }); return; }
    setPassword(""); setPassword2("");
    setMsg({ type: "ok", text: "Parola a fost schimbată." });
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="profile-head">
          <div className="big-avatar">{initials(user.name)}</div>
          <div>
            <div className="pname">{user.name}</div>
            <span className={"role-tag role-" + user.role}>{ROLE_LABEL[user.role]}</span>
          </div>
        </div>
        <div className="perm-list">
          {ALL_PERMS.map((p) => {
            const has = mine.includes(p);
            return (
              <div className={"perm-item" + (has ? "" : " off")} key={p}>
                {has ? <Check size={15} /> : <X size={15} />} {p}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel" style={{ padding: 20, marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 14px", fontSize: 14 }}>Schimbă parola</h4>
        <div className="field-row">
          <label className="field">
            <span className="fl">Parolă nouă</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setMsg(null); }} />
          </label>
          <label className="field">
            <span className="fl">Confirmă parola</span>
            <input type="password" autoComplete="new-password" value={password2} onChange={(e) => { setPassword2(e.target.value); setMsg(null); }} />
          </label>
        </div>
        {msg && <div className="error-text" role="alert" style={{ color: msg.type === "ok" ? "var(--success)" : "var(--danger)", marginBottom: 10 }}>{msg.text}</div>}
        <button className="btn btn-primary" onClick={changePassword} disabled={busy}><ShieldCheck size={15} /> Salvează parola</button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-ghost" onClick={onBack}><ChevronLeft size={15} /> Înapoi</button>
        <button className="btn btn-danger" onClick={onLogout}><LogOut size={14} /> Ieși din cont</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   GROUPS VIEW
----------------------------------------------------------------*/
function GroupsView({ core, groups, updateGroups, reservations, updateReservations, blocks }) {
  const [confirmId, setConfirmId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [printId, setPrintId] = useState(null);
  const [q, setQ] = useState("");

  const removeGroup = async (groupId) => {
    const g = groups.find((x) => x.id === groupId);
    const n = reservations.filter((r) => r.groupId === groupId).length;
    await updateReservations(reservations.filter((r) => r.groupId !== groupId));
    await updateGroups(groups.filter((x) => x.id !== groupId));
    await audit.push("Grup șters", `${g?.name || groupId} · ${n} rezervări`);
    const beforeRes = reservations, beforeGroups = groups;
    toaster.show(`Grupul ${g?.name || ""} a fost șters`, {
      tone: "danger",
      onUndo: async () => {
        await updateReservations(beforeRes);
        await updateGroups(beforeGroups);
        await audit.push("Ștergere grup anulată", g?.name || groupId);
      },
    });
    setConfirmId(null);
  };

  const sorted = [...groups].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const rows = sorted.map((g) => {
    const res = reservations.filter((r) => r.groupId === g.id);
    const main = core.guests.find((x) => x.id === g.mainGuestId);
    const rooms = res.map((r) => core.rooms.find((rm) => rm.id === r.roomId)?.name).filter(Boolean);
    const ci = res.length ? new Date(Math.min(...res.map((r) => new Date(r.checkin)))) : null;
    const co = res.length ? new Date(Math.max(...res.map((r) => new Date(r.checkout)))) : null;
    return { g, main, rooms, ci, co };
  });

  const t = q.trim().toLowerCase();
  const filtered = !t ? rows : rows.filter(({ g, main }) =>
    g.name.toLowerCase().includes(t) || (main && guestFullName(main).toLowerCase().includes(t)));
  /* Verificarea de lista goala vine dupa hook-uri: React cere ca ele sa
     fie apelate in aceeasi ordine la fiecare randare, deci nu pot sta
     dupa un return conditionat. */
  const paginare = usePaginare(filtered);

  if (!sorted.length) {
    return (
      <div className="empty-state">
        <UsersRound size={26} />
        <h4>Niciun grup</h4>
        <p>Creezi un grup din Calendar → Rezervare nouă → Grup.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar">
        <div className="search-box">
          <Search size={15} color="var(--text-muted)" />
          <input placeholder="Caută după numele grupului sau clientul principal"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="badge-count">{filtered.length} {filtered.length === 1 ? "grup" : "grupuri"}</span>
      </div>

      <div className="panel group-table">
        <div className="gt-row gt-head">
          <div className="gt-col gt-col-name">Grup</div>
          <div className="gt-col gt-col-period">Perioadă</div>
          <div className="gt-col gt-col-rooms">Camere</div>
          <div className="gt-col gt-col-actions" />
        </div>

        {filtered.length === 0 ? (
          <div className="section-empty">Niciun grup nu corespunde căutării.</div>
        ) : paginare.feliate.map(({ g, main, rooms, ci, co }) => {
          const visibleRooms = rooms.slice(0, 4);
          const extra = rooms.length - visibleRooms.length;
          return (
            <div className="gt-row" key={g.id}>
              <div className="gt-col gt-col-name">
                <div className="primary truncate" title={g.name}>{g.name}</div>
                <div className="secondary truncate" title={main ? guestFullName(main) : undefined}>
                  {main ? guestFullName(main) : "Fără client principal"}
                </div>
              </div>
              <div className="gt-col gt-col-period">
                {ci && co
                  ? <span className="mono">{fmtDate(ci)} → {fmtDate(co)}</span>
                  : <span className="secondary">—</span>}
              </div>
              <div className="gt-col gt-col-rooms">
                <div className="group-rooms">
                  {visibleRooms.map((n) => <span className="room-tag mono" key={n}>{n}</span>)}
                  {extra > 0 && <span className="room-tag room-tag-more">+{extra}</span>}
                  {!rooms.length && <span className="secondary">Fără camere</span>}
                </div>
              </div>
              <div className="gt-col gt-col-actions">
                {confirmId === g.id ? (
                  <>
                    <button className="btn btn-danger" style={{ padding: "8px 12px" }} onClick={() => removeGroup(g.id)}>
                      Șterge tot
                    </button>
                    <button className="btn btn-ghost" style={{ padding: "8px 12px" }} onClick={() => setConfirmId(null)}>
                      Renunță
                    </button>
                  </>
                ) : (
                  <>
                    <button className="icon-btn" onClick={() => setPrintId(g.id)}
                      title="Listă cazare pentru print" aria-label={`Printează lista grupului ${g.name}`}>
                      <Printer size={14} />
                    </button>
                    <button className="icon-btn" onClick={() => setEditId(g.id)}
                      title="Editează grupul" aria-label={`Editează grupul ${g.name}`}>
                      <Pencil size={14} />
                    </button>
                    <button className="icon-btn" onClick={() => setConfirmId(g.id)}
                      title="Șterge grupul și rezervările lui" aria-label={`Șterge grupul ${g.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Paginare stare={paginare} eticheta={paginare.totalItems === 1 ? "grup" : "grupuri"} />

      {printId && (
        <GroupPrint
          group={sorted.find((g) => g.id === printId)}
          core={core}
          reservations={reservations}
          onClose={() => setPrintId(null)}
        />
      )}

      {editId && (
        <GroupEditor
          group={sorted.find((g) => g.id === editId)}
          core={core}
          groups={groups}
          updateGroups={updateGroups}
          reservations={reservations}
          updateReservations={updateReservations}
          onClose={() => setEditId(null)}
          blocks={blocks}
          onPrint={() => { setPrintId(editId); setEditId(null); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   SHARED: check-in / check-out actions
----------------------------------------------------------------*/
async function doCheckIn(res, reservations, updateReservations, core) {
  if (!canCheckIn(res)) return false;

  // Someone else may still be occupying the room — refuse rather than
  // silently place two guests in it.
  const blocker = reservations.find((r) =>
    r.id !== res.id && r.roomId === res.roomId && r.status === "checkedin" &&
    new Date(r.checkout) > new Date(res.checkin));
  if (blocker) {
    const who = guestFullName(core.guests.find((g) => g.id === blocker.guestId)) || "alt oaspete";
    const room = core.rooms.find((x) => x.id === res.roomId);
    await audit.push("Check-in blocat",
      `${room?.name || res.roomId} · încă ocupată de ${who}`);
    return { error: `Camera ${room?.name || ""} este încă ocupată de ${who}. Fă întâi check-out.` };
  }

  const next = reservations.map((r) => (r.id === res.id ? { ...r, status: "checkedin" } : r));
  await updateReservations(next);
  const room = core.rooms.find((x) => x.id === res.roomId);
  await audit.push("Check-in", `${room?.name || res.roomId} · ${guestFullName(core.guests.find((g) => g.id === res.guestId))}`);
  toaster.show(`Check-in făcut · ${room?.name || ""}`, { tone: "ok" });

  /* Codul de acces se cere DUPĂ ce check-in-ul e salvat, și nu are voie
     să-l răstoarne.
     Un oaspete stă la recepție: dacă yala nu răspunde, operațiunea
     hotelieră trebuie să meargă mai departe, iar codul se poate genera
     din rezervare, cu butonul de acolo. De aceea nu se face `await` pe
     rezultat înainte de a raporta succesul, iar eșecul e doar un
     avertisment — nu o eroare care anulează sosirea.
     `cheamaAcces` nu aruncă niciodată, dar păstrăm și catch-ul: o
     promisiune respinsă aici ar lăsa check-in-ul raportat ca eșuat. */
  if (room?.accessLockId) {
    cheamaAcces("issue", { reservationId: res.id })
      .then((r) => {
        if (r?.ok) {
          toaster.show(`Cod de acces generat · ${room.name || ""}`, { tone: "ok" });
        } else {
          toaster.show(
            `Check-in făcut, dar codul de acces nu a putut fi generat. Îl poți genera din rezervare.`,
            { tone: "danger" });
        }
      })
      .catch(() => { /* check-in-ul e deja făcut; nu-l stricăm */ });
  }

  return true;
}

async function doCheckOut(res, reservations, updateReservations, core, housekeeping, updateHousekeeping) {
  if (!canCheckOut(res)) return false;
  const next = reservations.map((r) => (r.id === res.id ? { ...r, status: "checkedout" } : r));
  await updateReservations(next);
  await updateHousekeeping({ ...housekeeping, [res.roomId]: { status: "dirty", updatedAt: new Date().toISOString() } });
  const room = core.rooms.find((x) => x.id === res.roomId);
  await audit.push("Check-out", `${room?.name || res.roomId} · camera trecută pe „murdară”`);
  toaster.show(`Check-out făcut · ${room?.name || ""} trecută pe „murdară”`, { tone: "ok" });
  return true;
}

/* ---------------------------------------------------------------
   ARRIVAL FORM (Fișa de anunțare a sosirii)
   Rendered in-app: artifacts run sandboxed, so a popup window is
   unavailable. Print styles isolate this sheet on paper.
----------------------------------------------------------------*/
function ArrivalSheet({ res, core, groups }) {
  const g = core.guests.find((x) => x.id === res.guestId) || {};
  const room = core.rooms.find((x) => x.id === res.roomId) || {};
  const d = (v) => FMT_DATE_FULL.format(new Date(v)).replace(/\./g, "-");
  const ds = (v) => FMT_DATE.format(new Date(v)).replace(/\.$/, "");

  const Cell = ({ ro, en, value, wide }) => (
    <div className={"fc" + (wide ? " wide" : "")}>
      <div className="fc-lab">
        <span className="ro">{ro}</span>
        <span className="en">{en}</span>
      </div>
      <div className="fc-val">{value || ""}</div>
    </div>
  );

  return (
    <div className="fisa">
      <div className="fisa-top">
        <img src="/logo.png" alt="La Livadă" className="fisa-logo-img" />
        <div className="fisa-room">
          <div>Nr.</div>
          <div>ROOM No. {room.name || ""}</div>
        </div>
      </div>

      <div className="fisa-title">Fișă de anunțare a sosirii și plecării</div>
      <div className="fisa-sub">Registration form - To be completed on arrival</div>

      <div className="fisa-grid">
        <div className="frow">
          <Cell ro="Nume și prenume" en="Surname and first name"
            value={occupantName(res, core, groups)} wide />
        </div>
        <div className="frow c3">
          <Cell ro="Data nașterii" en="Date of birth" />
          <Cell ro="Locul nașterii" en="Place of birth" />
          <Cell ro="Naționalitate" en="Nationality" value={g.country} />
        </div>
        <div className="frow c3">
          <Cell ro="Localitatea" en="City" value={g.city} />
          <Cell ro="Strada" en="Street" value={g.address} />
          <Cell ro="Țara" en="Country" value={g.country} />
        </div>
        <div className="frow c3">
          <Cell ro="Data sosirii" en="Date of arrival" value={d(res.checkin)} />
          <Cell ro="Data plecării" en="Date of departure" value={d(res.checkout)} />
          <Cell ro="Scopul călătoriei" en="Purpose of travelling" />
        </div>
        <div className="frow c3">
          <Cell ro="Act de identitate" en="Identity card" />
          <Cell ro="Seria" en="Series" />
          <Cell ro="Nr" en="No" />
        </div>
        <div className="frow c2">
          <Cell ro="Semnătura turistului" en="Tourist's signature" />
          <Cell ro="Semnătura recepționerului" en="Receptionist's signature" />
        </div>
      </div>

      <div className="fisa-space" />

      <div className="fisa-foot">
        <div>Unitatea: <strong>La Livada</strong></div>
        <div>office@lalivada.com</div>
      </div>
    </div>
  );
}

function ArrivalForm({ res, core, groups, onClose }) {
  useModalLock();
  const scaleWrapRef = useRef(null);

  /* Coala e fixata la 794x1123px (proportia A4); pe ecran o scalam vizual,
     ca sa incapa in modal si pe telefon. La print, regulile din STYLES
     resetează scalarea (.arrival-scaler, .arrival-sheet-wrap, .fisa-duo)
     si lasă coala să curgă la mărimea ei naturală A4. */
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const wrap = scaleWrapRef.current;
    if (!wrap) return;
    const update = () => {
      const w = wrap.clientWidth;
      setScale(w > 0 ? Math.min(1, w / 794) : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  /* Randat prin portal, ca la factura (InvoicePrint): fereastra se deschide
     din interiorul TodayView/CalendarView, deci fara portal ar ramane
     descendenta a .content, ingropata sub un div fara clasa arrival-overlay
     — regula de print care ascunde tot din .content in afara de
     .arrival-overlay ar ascunde-o si pe ea odata cu acel div. */
  return createPortal(
    <Dialog onClose={onClose} className="arrival-modal" overlayClassName="arrival-overlay" title={undefined}>
        <div className="modal-head no-print">
          <h3 id="arrival-title">Fișă de anunțare</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => window.print()}>
              <Printer size={15} /> Printează
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Închide fereastra"><X size={16} /></button>
          </div>
        </div>

        <div className="arrival-sheet-wrap" ref={scaleWrapRef} style={{ height: 1123 * scale }}>
          <div className="arrival-scaler"
            style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <div className="arrival-sheet fisa-duo">
              <ArrivalSheet res={res} core={core} groups={groups} />
              <div className="fisa-sep" />
              <ArrivalSheet res={res} core={core} groups={groups} />
            </div>
          </div>
        </div>
    </Dialog>,
    document.body
  );
}

/* ---------------------------------------------------------------
   TODAY VIEW
----------------------------------------------------------------*/
function TodayView({ core, updateCore, reservations, updateReservations, housekeeping, updateHousekeeping, setView, groups, updateGroups, blocks, updateBlocks }) {
  const [arrivalRes, setArrivalRes] = useState(null);
  const [viewRes, setViewRes] = useState(null);
  const [editRes, setEditRes] = useState(null);
  const [checkinError, setCheckinError] = useState("");
  const [todayTab, setTodayTab] = useState("arrivals");
  /* Rezervarea pe care ruleaza chiar acum un check-in/check-out. Fara ea,
     un dublu-click trimitea doua scrieri pe acelasi rand. */
  const [busyId, setBusyId] = useState(null);

  /* One pass over the reservation list instead of six, and O(1) room lookups. */
  const roomById = useMemo(
    () => Object.fromEntries(core.rooms.map((r) => [r.id, r])),
    [core.rooms]);
  const guestById = useMemo(
    () => Object.fromEntries(core.guests.map((g) => [g.id, g])),
    [core.guests]);

  const { arrivals, departures, inHouse, occupiedNow, revenueToday } = useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = new Date(today.getTime() + 86400000);
    const arr = [], dep = [], ih = [];
    // Set de camere, nu numar de rezervari — intr-o zi de turnover (o
    // camera eliberata si realocata azi) doua rezervari diferite se
    // suprapun cu azi pe aceeasi camera; numaratul pe rezervari dubla
    // acea camera si umfla gradul de ocupare afisat pe "Azi".
    const occRooms = new Set();
    let rev = 0;

    for (const r of reservations) {
      if (!isLive(r)) continue;
      const ci = new Date(r.checkin), co = new Date(r.checkout);
      if (ci >= today && ci < tomorrow) arr.push(r);
      if (co >= today && co < tomorrow) dep.push(r);
      if (r.status === "checkedin") ih.push(r);
      if (ci < tomorrow && co > today) {
        occRooms.add(r.roomId);
        // Cota pe noapte din pretul REAL (inghetat/manual) al rezervarii,
        // nu un recalcul cu tarifele curente — altfel "Venit azi" nu se
        // potriveste cu ce plateste efectiv oaspetele. Vezi reservationTotal.
        // Rezervarile "protocol" nu se incaseaza — nu intra in venit,
        // desi camera conteaza normal la ocupare (chiar e folosita).
        if (r.status !== "protocol") {
          const n = nightsBetween(r.checkin, r.checkout);
          rev += reservationTotal(r, core) / n;
        }
      }
    }
    arr.sort((a, b) => new Date(a.checkin) - new Date(b.checkin));
    dep.sort((a, b) => new Date(a.checkout) - new Date(b.checkout));
    return { arrivals: arr, departures: dep, inHouse: ih, occupiedNow: occRooms.size, revenueToday: rev };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, roomById, core]);

  const toClean = useMemo(
    () => core.rooms.filter((r) => (housekeeping[r.id]?.status || "clean") !== "clean"),
    [core.rooms, housekeeping]);

  const guestName = (res) => occupantName(res, core, groups) || "Fără nume";
  const roomName = (id) => roomById[id]?.name || id;
  const occupancy = core.rooms.length ? Math.round((occupiedNow / core.rooms.length) * 100) : 0;

  return (
    <div>
      <div className="stat-row">
        <Stat label="Ocupare" value={`${occupancy}%`} sub={`${occupiedNow} din ${core.rooms.length} camere`} />
        <Stat label="Sosiri" value={arrivals.length} sub="astăzi" />
        <Stat label="Plecări" value={departures.length} sub="astăzi" />
        <Stat label="Venit azi" value={fmtMoney(revenueToday)} sub="camere ocupate" />
      </div>

      {checkinError && (
        <div className="drag-error" role="alert" onClick={() => setCheckinError("")}>{checkinError}</div>
      )}

      <div className="today-actions">
        <button className="today-action" onClick={() => setView("housekeeping")}>
          <span className="ta-ico"><Sparkles size={17} /></span>
          <span className="ta-body">
            <span className="ta-t">Status camere</span>
            <span className="ta-d">{toClean.length ? `${toClean.length} de pregătit` : "Toate curate"}</span>
          </span>
          <ArrowRight size={15} className="ta-arrow" />
        </button>
        <button className="today-action" onClick={() => setView("calendar")}>
          <span className="ta-ico"><CalendarDays size={17} /></span>
          <span className="ta-body">
            <span className="ta-t">Calendar</span>
            <span className="ta-d">Rezervări și disponibilitate</span>
          </span>
          <ArrowRight size={15} className="ta-arrow" />
        </button>
        <button className="today-action" onClick={() => setView("clients")}>
          <span className="ta-ico"><Users size={17} /></span>
          <span className="ta-body">
            <span className="ta-t">Clienți</span>
            <span className="ta-d">{core.guests.length} în baza de date</span>
          </span>
          <ArrowRight size={15} className="ta-arrow" />
        </button>
      </div>

      <div className="sub-tabs">
        <button className={todayTab === "arrivals" ? "on" : ""} onClick={() => setTodayTab("arrivals")}>
          <LogIn size={14} /> Sosiri <span className="tab-count">{arrivals.length}</span>
        </button>
        <button className={todayTab === "departures" ? "on" : ""} onClick={() => setTodayTab("departures")}>
          <LogOut size={14} /> Plecări <span className="tab-count">{departures.length}</span>
        </button>
        <button className={todayTab === "inhouse" ? "on" : ""} onClick={() => setTodayTab("inhouse")}>
          <DoorOpen size={14} /> In house <span className="tab-count">{inHouse.length}</span>
        </button>
        <button className={todayTab === "clean" ? "on" : ""} onClick={() => setTodayTab("clean")}>
          <Sparkles size={14} /> Camere de pregătit <span className="tab-count">{toClean.length}</span>
        </button>
      </div>

      {todayTab === "arrivals" && (
        <Section title="Sosiri" items={arrivals} empty="Nicio sosire astăzi."
          renderItem={(r) => (
            <div className="list-row" key={r.id}>
              <div style={{ minWidth: 0, cursor: "pointer" }}
                role="button" tabIndex={0}
                onClick={() => setViewRes(r)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewRes(r); } }}
              >
                <div className="primary">{guestName(r)}</div>
                <div className="secondary">
                  <span className="mono">{roomName(r.roomId)}</span> · {FMT_TIME.format(new Date(r.checkin))} · {fmtMoney(reservationTotal(r, core))}
                </div>
              </div>
              <div className="row-actions">
                <button className="icon-btn" title="Fișa de sosire" aria-label="Deschide fișa de sosire" onClick={() => setArrivalRes(r)}>
                  <Printer size={14} />
                </button>
                {r.status === "checkedin" ? (
                  <span className="role-tag role-housekeeping">Cazat</span>
                ) : r.status === "checkedout" ? (
                  <span className="role-tag role-receptionist">Plecat</span>
                ) : canCheckIn(r) ? (
                  <button className="btn btn-primary" style={{ width: "auto", padding: "8px 12px" }}
                    disabled={busyId === r.id}
                    onClick={async () => {
                      if (busyId) return;
                      setBusyId(r.id);
                      try {
                        const out = await doCheckIn(r, reservations, updateReservations, core);
                        if (out && out.error) setCheckinError(out.error);
                      } finally { setBusyId(null); }
                    }}>
                    <LogIn size={14} /> Check-in
                  </button>
                ) : (
                  <span className="role-tag role-admin">{STATUS_LABEL[r.status]}</span>
                )}
              </div>
            </div>
          )}
        />
      )}

      {todayTab === "departures" && (
        <Section title="Plecări" items={departures} empty="Nicio plecare astăzi."
          renderItem={(r) => (
            <div className="list-row" key={r.id}>
              <div style={{ minWidth: 0, cursor: "pointer" }}
                role="button" tabIndex={0}
                onClick={() => setViewRes(r)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewRes(r); } }}
              >
                <div className="primary">{guestName(r)}</div>
                <div className="secondary">
                  <span className="mono">{roomName(r.roomId)}</span> · până la {FMT_TIME.format(new Date(r.checkout))}
                </div>
              </div>
              <div className="row-actions">
                {r.status === "checkedout" ? (
                  <span className="role-tag role-receptionist">Plecat</span>
                ) : canCheckOut(r) ? (
                  <button className="btn btn-ghost" style={{ padding: "8px 12px" }}
                    disabled={busyId === r.id}
                    onClick={async () => {
                      if (busyId) return;
                      setBusyId(r.id);
                      try {
                        await doCheckOut(r, reservations, updateReservations, core, housekeeping, updateHousekeeping);
                      } finally { setBusyId(null); }
                    }}>
                    Check-out <ArrowRight size={14} />
                  </button>
                ) : (
                  <span className="role-tag role-admin">{STATUS_LABEL[r.status]}</span>
                )}
              </div>
            </div>
          )}
        />
      )}

      {todayTab === "inhouse" && (
        <Section title="In house" items={inHouse} empty="Nicio cameră ocupată."
          renderItem={(r) => (
            <div className="list-row" key={r.id}>
              <div style={{ cursor: "pointer" }}
                role="button" tabIndex={0}
                onClick={() => setViewRes(r)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setViewRes(r); } }}
              >
                <div className="primary">{guestName(r)}</div>
                <div className="secondary"><span className="mono">{roomName(r.roomId)}</span> · pleacă {fmtDate(r.checkout)}</div>
              </div>
            </div>
          )}
        />
      )}

      {todayTab === "clean" && (
        <Section title="Camere de pregătit" items={toClean} empty="Toate camerele sunt curate."
          renderItem={(room) => (
            <div className="list-row" key={room.id}>
              <div>
                <div className="primary mono">{room.name}</div>
                <div className="secondary">{ROOM_TYPE[room.type]?.label}</div>
              </div>
              <button className="btn btn-ghost" style={{ padding: "8px 12px" }} onClick={() => setView("housekeeping")}>
                Vezi <ArrowRight size={14} />
              </button>
            </div>
          )}
        />
      )}

      {arrivalRes && <ArrivalForm res={arrivalRes} core={core} groups={groups} onClose={() => setArrivalRes(null)} />}

      {viewRes && (
        <ReservationViewModal
          reservation={viewRes}
          core={core}
          updateCore={updateCore}
          groups={groups}
          onClose={() => setViewRes(null)}
          onEdit={() => { setEditRes(viewRes); setViewRes(null); }}
        />
      )}

      {editRes && (
        <ReservationModal
          data={{ reservation: editRes }}
          core={core}
          updateCore={updateCore}
          reservations={reservations}
          updateReservations={updateReservations}
          groups={groups}
          updateGroups={updateGroups}
          blocks={blocks}
          updateBlocks={updateBlocks}
          onClose={() => setEditRes(null)}
        />
      )}
    </div>
  );
}

const Stat = React.memo(function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
});

const TODAY_SECTION_PAGE_SIZE = 10;

const Section = React.memo(function Section({ title, items, renderItem, empty }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / TODAY_SECTION_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = items.slice(safePage * TODAY_SECTION_PAGE_SIZE, (safePage + 1) * TODAY_SECTION_PAGE_SIZE);
  return (
    <div className="panel section-panel">
      <div className="section-head">{title}<span className="badge-count">{items.length}</span></div>
      {pageItems.length ? pageItems.map(renderItem) : <div className="section-empty">{empty}</div>}
      {pageCount > 1 && (
        <div className="pager">
          <button className="btn btn-ghost" style={{ width: "auto" }} disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft size={15} />
          </button>
          <span className="pager-info">Pagina {safePage + 1} din {pageCount}</span>
          <button className="btn btn-ghost" style={{ width: "auto" }} disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
});

/* ---------------------------------------------------------------
   REPORTS VIEW
----------------------------------------------------------------*/
function ReportsView({ core, reservations }) {
  const [monthOffset, setMonthOffset] = useState(0);

  const base = new Date();
  base.setDate(1); base.setHours(0, 0, 0, 0);
  base.setMonth(base.getMonth() + monthOffset);
  const monthStart = new Date(base);
  const monthEnd = new Date(base); monthEnd.setMonth(monthEnd.getMonth() + 1);
  const daysInMonth = Math.round((monthEnd - monthStart) / 86400000);
  const monthStartMs = monthStart.getTime();

  /* All month figures come from one memoized pass: dates parsed once per
     reservation, rooms looked up through a map instead of a linear find
     inside the day loop, and per-type nights accumulated in the same
     sweep rather than re-scanning the month once per room type. */
  const stats = useMemo(() => {
    const roomById = new Map(core.rooms.map((r) => [r.id, r]));
    const active = [];
    // Rezervarile protocol au propria sectiune, separata (protocolStats mai
    // jos) — nu intra in ocupare/venit/ADR/RevPAR/surse ca sa nu denatureze
    // cifrele reale de business cu sederi pe care nu se incaseaza bani.
    for (const r of reservations) {
      if (!isStatsEligible(r)) continue;
      const ciMs = new Date(r.checkin).getTime();
      const coMs = new Date(r.checkout).getTime();
      if (!Number.isFinite(ciMs) || !Number.isFinite(coMs)) continue;
      const ciDay = new Date(ciMs); ciDay.setHours(0, 0, 0, 0);
      const coDay = new Date(coMs); coDay.setHours(0, 0, 0, 0);
      // Cota pe noapte din pretul REAL (inghetat/manual), nu un recalcul cu
      // tarifele curente — la fel ca in TodayView.revenueToday, altfel
      // veniturile de aici nu se potrivesc cu cele din "bySource" mai jos.
      const totalNights = Math.max(1, Math.round((coDay - ciDay) / 86400000));
      const perNight = reservationTotal(r, core) / totalNights;
      active.push({ res: r, ciMs, coMs, ciDayMs: ciDay.getTime(), coDayMs: coDay.getTime(), room: roomById.get(r.roomId), perNight });
    }

    let roomNights = 0, revenue = 0;
    const perDay = [];
    const nightsByType = { tiny: 0, loft: 0 };

    for (let i = 0; i < daysInMonth; i++) {
      const d = new Date(monthStart); d.setDate(monthStart.getDate() + i);
      const dStart = d.getTime();
      let occ = 0, rev = 0;
      for (const e of active) {
        // Same room-night rule as the calendar footer: the departure day
        // is not a sold night, so a turnover day counts once, not twice.
        if (e.ciDayMs <= dStart && e.coDayMs > dStart) {
          occ++;
          if (e.room) {
            rev += e.perNight;
            if (nightsByType[e.room.type] != null) nightsByType[e.room.type]++;
          }
        }
      }
      roomNights += occ; revenue += rev;
      perDay.push({ day: i + 1, occ, rev });
    }

    const capacity = core.rooms.length * daysInMonth;
    const byType = ["tiny", "loft"].map((t) => {
      const cap = core.rooms.filter((r) => r.type === t).length * daysInMonth;
      const nights = nightsByType[t] || 0;
      return { type: t, nights, cap, pct: cap ? Math.round((nights / cap) * 100) : 0 };
    });

    const monthEndMs = monthEnd.getTime();
    const inMonth = active.filter((e) => e.ciMs < monthEndMs && e.coMs > monthStartMs);
    const totalInMonth = inMonth.length;
    const bySource = SOURCES.map((sc) => {
      const list = inMonth.filter((e) => (e.res.source || "direct") === sc.key);
      const rev = list.reduce((sum, e) => sum + reservationTotal(e.res, core), 0);
      return { ...sc, count: list.length, rev, pct: totalInMonth ? Math.round((list.length / totalInMonth) * 100) : 0 };
    }).filter((x) => x.count > 0).sort((a, b) => b.count - a.count);

    return {
      roomNights, revenue, perDay, capacity, byType, bySource,
      occupancy: capacity ? Math.round((roomNights / capacity) * 100) : 0,
      adr: roomNights ? revenue / roomNights : 0,
      revpar: capacity ? revenue / capacity : 0,
      maxOcc: Math.max(1, ...perDay.map((p) => p.occ)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, core, monthStartMs, daysInMonth]);

  const { roomNights, revenue, perDay, capacity, byType, bySource, occupancy, adr, revpar, maxOcc } = stats;

  /* Statistica separata, doar pentru camerele/rezervarile "protocol" —
     numar sejururi, nopti si valoarea lor (pe nopti din luna, ca la
     revenue de mai sus), fara sa se amestece cu cifrele de business. */
  const protocolStats = useMemo(() => {
    let count = 0, nights = 0, value = 0;
    const seen = new Set();
    for (const r of reservations) {
      if (r.status !== "protocol") continue;
      const ciMs = new Date(r.checkin).getTime();
      const coMs = new Date(r.checkout).getTime();
      if (!Number.isFinite(ciMs) || !Number.isFinite(coMs)) continue;
      if (ciMs >= monthEnd.getTime() || coMs <= monthStartMs) continue;
      if (!seen.has(r.id)) { seen.add(r.id); count++; }
      const ciDay = new Date(ciMs); ciDay.setHours(0, 0, 0, 0);
      const coDay = new Date(coMs); coDay.setHours(0, 0, 0, 0);
      const totalNights = Math.max(1, Math.round((coDay - ciDay) / 86400000));
      const perNight = reservationTotal(r, core) / totalNights;
      for (let d = new Date(ciDay); d < coDay; d.setDate(d.getDate() + 1)) {
        if (d.getTime() >= monthStartMs && d.getTime() < monthEnd.getTime()) { nights++; value += perNight; }
      }
    }
    return { count, nights, value };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservations, core, monthStartMs, daysInMonth]);

  return (
    <div>
      <div className="toolbar">
        <div className="week-nav">
          <button onClick={() => setMonthOffset((m) => m - 1)}><ChevronLeft size={15} /></button>
          <button className={monthOffset === 0 ? "on" : ""} onClick={() => setMonthOffset(0)}>
            <span>{FMT_MONTH_YEAR.format(monthStart)}</span>
          </button>
          <button onClick={() => setMonthOffset((m) => m + 1)}><ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="stat-row">
        <Stat label="Ocupare" value={`${occupancy}%`} sub={`${roomNights} din ${capacity} camere-nopți`} />
        <Stat label="Venit" value={fmtMoney(revenue)} sub="prețuri reale, pe nopți din lună" />
        <Stat label="ADR" value={fmtMoney(adr)} sub="tarif mediu pe noapte" />
        <Stat label="RevPAR" value={fmtMoney(revpar)} sub="venit pe cameră disponibilă" />
      </div>

      <div className="panel" style={{ padding: 18, marginBottom: 14 }}>
        <div className="section-head" style={{ padding: 0, border: "none", marginBottom: 14 }}>Ocupare zilnică</div>
        <div className="bar-chart">
          {perDay.map((p) => (
            <div className="bar-col" key={p.day} title={`${p.day}: ${p.occ} camere · ${fmtMoney(p.rev)}`}>
              <div className="bar-fill" style={{ height: `${(p.occ / maxOcc) * 100}%` }} />
              {p.day % 5 === 0 && <span className="bar-label">{p.day}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="section-head">Rezervări pe sursă</div>
        {bySource.length === 0 ? (
          <div className="section-empty">Nicio rezervare în această lună.</div>
        ) : bySource.map((r) => (
          <div className="list-row" key={r.key}>
            <div>
              <div className="primary">{r.label}</div>
              <div className="secondary">{r.count} rezervări · {fmtMoney(r.rev)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 160 }}>
              <div className="meter"><div className="meter-fill" style={{ width: `${r.pct}%` }} /></div>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{r.pct}%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="section-head">Ocupare pe tip de cameră</div>
        {byType.map((t) => (
          <div className="list-row" key={t.type}>
            <div>
              <div className="primary">{ROOM_TYPE[t.type].label}</div>
              <div className="secondary">{t.nights} din {t.cap} camere-nopți</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 160 }}>
              <div className="meter"><div className="meter-fill" style={{ width: `${t.pct}%` }} /></div>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{t.pct}%</span>
            </div>
          </div>
        ))}
      </div>

      {protocolStats.count > 0 && (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="section-head">
            <span className={"role-tag " + STATUS_CLASS.protocol} style={{ marginRight: 8 }}>Protocol</span>
            Statistică separată — necontorizată în venit
          </div>
          <div className="stat-row" style={{ padding: 16 }}>
            <Stat label="Sejururi" value={protocolStats.count} sub="protocol" />
            <Stat label="Nopți" value={protocolStats.nights} sub="în lună" />
            <Stat label="Valoare" value={fmtMoney(protocolStats.value)} sub="neîncasată" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   LOG VIEW
----------------------------------------------------------------*/
function LogView({ entries }) {
  if (!entries.length) {
    return <div className="empty-state"><History size={26} /><h4>Jurnal gol</h4><p>Aici apar modificările făcute în aplicație.</p></div>;
  }
  return (
    <div className="panel">
      {entries.map((e) => (
        <div className="list-row" key={e.id}>
          <div style={{ minWidth: 0 }}>
            <div className="primary">{e.action}</div>
            <div className="secondary">{e.detail}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{e.userName}</div>
            <div className="secondary mono" style={{ fontSize: 11 }}>{fmtDateTime(e.ts)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   TAGS EDITOR (inside Configurare)
----------------------------------------------------------------*/
function TagsView({ core, updateCore }) {
  const tags = core.tags || DEFAULT_TAGS;
  const [draft, setDraft] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState("");

  const save = async (next, action, detail) => {
    await updateCore({ ...core, tags: next });
    await audit.push(action, detail);
    setError("");
  };

  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) { setError("Eticheta există deja."); return; }
    await save([...tags, t], "Etichetă adăugată", t);
    setDraft("");
  };

  const commitEdit = async (i) => {
    const t = editValue.trim();
    if (!t) { setEditIdx(null); return; }
    if (tags.some((x, j) => j !== i && x.toLowerCase() === t.toLowerCase())) {
      setError("Există deja o etichetă cu acest nume."); return;
    }
    const old = tags[i];
    await save(tags.map((x, j) => (j === i ? t : x)), "Etichetă redenumită", `${old} → ${t}`);
    setEditIdx(null);
  };

  const remove = async (i) => {
    const old = tags[i];
    const before = tags;
    await save(tags.filter((_, j) => j !== i), "Etichetă ștearsă", old);
    toaster.show(`Eticheta „${old}” a fost ștearsă`, {
      tone: "danger",
      onUndo: async () => { await updateCore({ ...core, tags: before }); },
    });
  };

  return (
    <div>
      <div className="note">
        Etichetele apar în formularul de rezervare. Redenumirea uneia nu schimbă rezervările care o au deja
        atașată — acelea păstrează numele vechi.
      </div>

      <div className="toolbar">
        <div className="search-box" style={{ maxWidth: 320 }}>
          <TagIcon size={15} color="var(--text-muted)" />
          <input
            value={draft}
            placeholder="Etichetă nouă"
            onChange={(e) => { setDraft(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
        </div>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={add} disabled={!draft.trim()}>
          <Plus size={15} /> Adaugă
        </button>
      </div>

      {error && <div className="drag-error" role="alert" style={{ marginBottom: 10 }}>{error}</div>}

      <div className="panel">
        {tags.length === 0 ? (
          <div className="section-empty">Nicio etichetă definită.</div>
        ) : tags.map((t, i) => (
          <div className="list-row" key={t + i}>
            {editIdx === i ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit(i);
                  if (e.key === "Escape") setEditIdx(null);
                }}
                onBlur={() => commitEdit(i)}
                style={{
                  flex: 1, padding: "9px 11px", border: "1px solid var(--accent)",
                  borderRadius: "var(--r-sm)", fontSize: "var(--fs-base)",
                  background: "var(--surface)", color: "var(--text)",
                }}
              />
            ) : (
              <div className="primary">{t}</div>
            )}
            <div className="row-actions">
              <button className="icon-btn" aria-label={`Redenumește ${t}`}
                onClick={() => { setEditIdx(i); setEditValue(t); setError(""); }}>
                <Pencil size={14} />
              </button>
              <button className="icon-btn" aria-label={`Șterge ${t}`} onClick={() => remove(i)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   OPTIMIZATOR PRET PE GRAD DE OCUPARE (doar rezervari "direct")
----------------------------------------------------------------*/
const DEFAULT_ONLINE_TIERS = [
  { id: "ot1", min: 0, max: 30, adjustmentPct: -5 },
  { id: "ot2", min: 30, max: 50, adjustmentPct: 0 },
  { id: "ot3", min: 50, max: 70, adjustmentPct: 5 },
  { id: "ot4", min: 70, max: 90, adjustmentPct: 10 },
  { id: "ot5", min: 90, max: 100, adjustmentPct: 15 },
];

function OnlinePricingView({ core, updateCore }) {
  /* `tiers` e ce e salvat cu adevarat (poate fi []); draft porneste din
     sugestiile implicite DOAR daca inca nu exista nimic salvat — dar ca
     obiect NOU, distinct de `tiers`, ca butonul de salvare sa fie activ
     de la inceput (altfel sugestiile s-ar afisa fara sa poata fi
     acceptate fara o editare in plus, inutila). */
  const tiers = core.onlinePricing || [];
  const [draft, setDraft] = useState(() => (tiers.length ? tiers : DEFAULT_ONLINE_TIERS.map((t) => ({ ...t }))));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(tiers);

  useEffect(() => {
    if (!dirty) setDraft(tiers.length ? tiers : DEFAULT_ONLINE_TIERS.map((t) => ({ ...t })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiers]);

  const setTier = (id, patch) => {
    setDraft((d) => d.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setSaved(false);
  };
  const addTier = () => {
    setDraft((d) => [...d, { id: uid(), min: 0, max: 10, adjustmentPct: 0 }]);
    setSaved(false);
  };
  const removeTier = (id) => {
    setDraft((d) => d.filter((t) => t.id !== id));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    const normalized = draft
      .map((t) => ({
        ...t,
        min: Math.max(0, Math.min(100, Number(t.min) || 0)),
        max: Math.max(0, Math.min(100, Number(t.max) || 0)),
        adjustmentPct: Number(t.adjustmentPct) || 0,
      }))
      .sort((a, b) => a.min - b.min);
    await updateCore({ ...core, onlinePricing: normalized });
    await audit.push("Optimizator preț online modificat", "Praguri de ocupare actualizate");
    setDraft(normalized);
    setSaving(false);
    setSaved(true);
  };

  return (
    <div>
      <div className="note">
        Se aplică <strong>doar</strong> rezervărilor cu sursa <strong>Site propriu (online)</strong> — nu afectează
        rezervările introduse manual de recepție (Direct, Telefon, Walk-in etc.). Booking.com și Airbnb nu pot primi
        tarife prin feedul iCal, doar disponibilitate, așa că rămân la tariful standard. Ocuparea se calculează ca
        medie pe toată perioada sejurului, la nivel de proprietate (toate camerele), iar ajustarea se aplică
        procentual peste prețul standard calculat din tarife/sezoane.
      </div>

      <div className="panel" style={{ padding: 18 }}>
        {draft.length === 0 ? (
          <div className="section-empty">Niciun prag definit — rezervările directe folosesc tariful standard.</div>
        ) : draft.map((t) => {
          const sign = t.adjustmentPct > 0 ? "up" : t.adjustmentPct < 0 ? "down" : null;
          return (
            <div key={t.id} className="tier-row">
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">Ocupare de la (%)</span>
                <input type="number" min="0" max="100" value={t.min} onChange={(e) => setTier(t.id, { min: e.target.value })} />
              </label>
              <span className="tier-sep">–</span>
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">până la (%)</span>
                <input type="number" min="0" max="100" value={t.max} onChange={(e) => setTier(t.id, { max: e.target.value })} />
              </label>
              <label className="field tier-adj" style={{ margin: 0 }}>
                <span className="fl">Ajustare preț</span>
                <div className="tier-adj-input">
                  <input type="number" step="1" value={t.adjustmentPct} onChange={(e) => setTier(t.id, { adjustmentPct: e.target.value })} />
                  <span>%</span>
                  {sign === "up" && <TrendingUp size={14} className="tier-up" />}
                  {sign === "down" && <TrendingUp size={14} className="tier-down" />}
                </div>
              </label>
              <button className="icon-btn" onClick={() => removeTier(t.id)} aria-label="Șterge pragul">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        <button className="btn btn-ghost" style={{ marginTop: draft.length ? 12 : 0 }} onClick={addTier}>
          <Plus size={15} /> Prag nou
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={save} disabled={!dirty || saving}>
          <Check size={15} /> {saving ? "Se salvează…" : "Salvează"}
        </button>
        {saved && !dirty && <span style={{ color: "var(--success)", fontSize: 13, fontWeight: 600 }}>Salvat</span>}
        {dirty && <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Modificări nesalvate</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   RATES EDITOR (inside Configurare)
----------------------------------------------------------------*/
function RatesView({ core, updateCore }) {
  const rates = core.rates || { base: { tiny: 0, loft: 0 }, seasons: [] };
  const [draft, setDraft] = useState(rates);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(rates);

  /* Daca tarifele se schimba din exterior (ex. un reload fortat de o
     eroare de sincronizare in alta parte a aplicatiei) cat timp pagina
     asta e deschisa, draft-ul ramane blocat pe useState-ul initial —
     resincronizam aici, dar doar cat timp nu exista modificari nesalvate. */
  useEffect(() => {
    if (!dirty) setDraft(rates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates]);

  const setBase = (key, v) => { setDraft((d) => ({ ...d, base: { ...d.base, [key]: v } })); setSaved(false); };
  const setSeason = (id, patch) => {
    setDraft((d) => ({ ...d, seasons: d.seasons.map((sn) => (sn.id === id ? { ...sn, ...patch } : sn)) }));
    setSaved(false);
  };
  const addSeason = () => {
    setDraft((d) => ({
      ...d,
      seasons: [...d.seasons, { id: uid(), name: "Sezon nou", start: "01-01", end: "01-31", tiny: d.base.tiny, loft: d.base.loft }],
    }));
    setSaved(false);
  };
  const removeSeason = (id) => {
    setDraft((d) => ({ ...d, seasons: d.seasons.filter((sn) => sn.id !== id) }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    const normalized = {
      base: {
        tiny: Number(draft.base.tiny) || 0, loft: Number(draft.base.loft) || 0,
        tinySingle: Number(draft.base.tinySingle) || 0, loftSingle: Number(draft.base.loftSingle) || 0,
        adultSupplement: Number(draft.base.adultSupplement) || 0, childSupplement: Number(draft.base.childSupplement) || 0,
      },
      seasons: draft.seasons.map((sn) => ({ ...sn, tiny: Number(sn.tiny) || 0, loft: Number(sn.loft) || 0 })),
    };
    await updateCore({ ...core, rates: normalized });
    await audit.push("Tarife modificate", "Configurare tarife actualizată");
    setDraft(normalized);
    setSaving(false);
    setSaved(true);
  };

  return (
    <div>
      <div className="note">
        Tarifele sunt pe noapte, per cameră. Sezoanele au prioritate față de tariful de bază; se dau ca zi-lună
        (LL-ZZ) și pot trece peste Anul Nou. Tariful single se aplică doar la 1 adult și niciun copil — orice altă
        ocupare folosește tariful standard, plus suplimentul de adult peste 2 adulți și suplimentul de copil pentru
        fiecare copil. Modificările se salvează doar la apăsarea butonului de mai jos.
      </div>

      <div className="panel" style={{ padding: 18, marginBottom: 16 }}>
        <div className="section-head" style={{ padding: 0, border: "none", marginBottom: 14 }}>Tarif de bază</div>
        <div className="field-row field-row-2col">
          <label className="field">
            <span className="fl">Tiny house (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.tiny} onChange={(e) => setBase("tiny", e.target.value)} />
          </label>
          <label className="field">
            <span className="fl">Loft (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.loft} onChange={(e) => setBase("loft", e.target.value)} />
          </label>
        </div>
        <div className="field-row field-row-2col">
          <label className="field">
            <span className="fl">Supliment adult (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.adultSupplement ?? ""} onChange={(e) => setBase("adultSupplement", e.target.value)} placeholder="0" />
          </label>
          <label className="field">
            <span className="fl">Supliment copil (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.childSupplement ?? ""} onChange={(e) => setBase("childSupplement", e.target.value)} placeholder="0" />
          </label>
        </div>
        <div className="field-row field-row-2col">
          <label className="field">
            <span className="fl">Tiny house — ocupare single (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.tinySingle ?? ""} onChange={(e) => setBase("tinySingle", e.target.value)} placeholder="ex: 300" />
          </label>
          <label className="field">
            <span className="fl">Loft — ocupare single (lei/noapte)</span>
            <input type="number" min="0" value={draft.base.loftSingle ?? ""} onChange={(e) => setBase("loftSingle", e.target.value)} placeholder="ex: 420" />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={save} disabled={!dirty || saving}>
            <Check size={15} /> {saving ? "Se salvează…" : "Salvează tarifele"}
          </button>
          {saved && !dirty && <span style={{ color: "var(--success)", fontSize: 13, fontWeight: 600 }}>Salvat</span>}
          {dirty && <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Modificări nesalvate</span>}
        </div>
      </div>

      <div className="toolbar">
        <span className="badge-count">{draft.seasons.length} sezoane</span>
        <div className="grow" />
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={addSeason}><Plus size={15} /> Sezon nou</button>
      </div>

      <div className="panel">
        {draft.seasons.length === 0 ? (
          <div className="section-empty">Niciun sezon — se aplică tariful de bază tot anul.</div>
        ) : draft.seasons.map((sn) => (
          <div key={sn.id} style={{ padding: 16, borderBottom: "1px solid var(--border-soft)" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={sn.name} onChange={(e) => setSeason(sn.id, { name: e.target.value })}
                style={{ flex: 1, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 10, fontSize: 13.5 }} />
              <button className="icon-btn" onClick={() => removeSeason(sn.id)} aria-label={`Șterge sezonul ${sn.name}`}><Trash2 size={14} /></button>
            </div>
            <div className="season-grid">
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">De la (LL-ZZ)</span>
                <input className="mono" value={sn.start} placeholder="06-15" onChange={(e) => setSeason(sn.id, { start: e.target.value })} />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">Până la</span>
                <input className="mono" value={sn.end} placeholder="09-15" onChange={(e) => setSeason(sn.id, { end: e.target.value })} />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">Tiny</span>
                <input type="number" min="0" value={sn.tiny} onChange={(e) => setSeason(sn.id, { tiny: Number(e.target.value) || 0 })} />
              </label>
              <label className="field" style={{ margin: 0 }}>
                <span className="fl">Loft</span>
                <input type="number" min="0" value={sn.loft} onChange={(e) => setSeason(sn.id, { loft: Number(e.target.value) || 0 })} />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   RESERVATION ACTION SHEET
----------------------------------------------------------------*/
function ReservationActions({ res: resSnapshot, core, groups, reservations, updateReservations, housekeeping, updateHousekeeping, onOpen, onEdit, onMove, onClose }) {
  useModalLock();
  /* The panel was opened with a snapshot; re-read the reservation from the
     live list each render so actions never apply on top of stale state if
     it changed in the background while the panel was open. */
  const res = reservations.find((r) => r.id === resSnapshot.id) || resSnapshot;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState("");
  /* Cat timp ruleaza o actiune care scrie (check-in/out, no-show,
     anulare, mesaj), butoanele din panou raman blocate — altfel un
     dublu-click trimitea doua scrieri pe aceeasi rezervare. */
  const [busy, setBusy] = useState(false);
  const ruleaza = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgText, setMsgText] = useState("");
  const messages = res.messages || [];
  const guest = core.guests.find((g) => g.id === res.guestId);
  const room = core.rooms.find((r) => r.id === res.roomId);
  const now = new Date();

  const arrivesToday = isSameDay(res.checkin, now);
  const departsToday = isSameDay(res.checkout, now);
  const mayCheckIn = canCheckIn(res, now);
  const mayCheckOut = canCheckOut(res);

  /* Explicatia apare doar cand check-in-ul chiar NU e posibil: cu fereastra
     de 48h, o sosire de maine e deja cazabila, deci n-are ce explica. */
  const checkInHint = res.status !== "confirmed" || mayCheckIn
    ? null
    : new Date(res.checkin) > now
      ? `Check-in disponibil cu ${ORE_CHECKIN_DEVREME}h înainte de sosire (${fmtDate(res.checkin)})`
      : "Sosirea era într-o zi trecută — deschide rezervarea ca să corectezi data.";

  const addMessage = async () => {
    const text = msgText.trim();
    if (!text) return;
    const entry = { id: uid(), ts: new Date().toISOString(), author: audit.user?.name || "?", text };
    await updateReservations(reservations.map((r) =>
      (r.id === res.id ? { ...r, messages: [...(r.messages || []), entry] } : r)));
    await audit.push("Mesaj adăugat la rezervare",
      `${guestFullName(guest) || "Fără nume"} · ${room?.name}: ${text.slice(0, 60)}`);
    setMsgText(""); setMsgOpen(false);
    onClose();
  };

  const cancel = async () => {
    await updateReservations(reservations.map((r) => (r.id === res.id ? { ...r, status: "cancelled" } : r)));
    await audit.push("Rezervare anulată",
      `${guestFullName(guest) || "Fără nume"} · ${room?.name} · ${fmtDate(res.checkin)}`);
    const before = reservations;
    toaster.show(`Rezervarea ${guestFullName(guest) || ""} a fost anulată`, {
      tone: "danger",
      onUndo: async () => {
        await updateReservations(before);
        await audit.push("Anulare revocată", `${guestFullName(guest) || ""} · ${room?.name}`);
      },
    });
    onClose();
  };

  return (
    <Dialog onClose={onClose} className="action-modal" title={undefined}>
        <div className="action-head">
          <div style={{ minWidth: 0 }}>
            <div className="action-guest">{occupantName(res, core, groups) || "Fără nume"}</div>
            {guestFullName(guest) && guestFullName(guest) !== occupantName(res, core, groups) && (
              <div className="action-meta">Rezervat de {guestFullName(guest)}</div>
            )}
            <div className="action-meta">
              <span className="mono">{room?.name}</span> · {fmtDate(res.checkin)} → {fmtDate(res.checkout)}
              {" · "}{nightsBetween(res.checkin, res.checkout)} nopți
            </div>
            <div className="action-meta">
              {res.adults ?? 2} adulți{res.children ? ` + ${res.children} copii` : ""} · {sourceLabel(res.source)} · {fmtMoney(reservationTotal(res, core))}
            </div>
            {res.tags?.length > 0 && (
              <div className="tag-row">
                {res.tags.map((t) => <span className="tag-mini" key={t}>{t}</span>)}
              </div>
            )}
          </div>
          <span className={"role-tag " + (res.status === "checkedin" ? "role-housekeeping"
            : res.status === "cancelled" ? "role-receptionist" : "role-admin")}>
            <span aria-hidden="true">{STATUS_GLYPH[res.status]}</span> {STATUS_LABEL[res.status]}
          </span>
        </div>

        <div className="action-list">
          <button className="action-item" onClick={onOpen}>
            <span className="ai-ico"><Eye size={17} /></span>
            <span className="ai-body"><span className="ai-t">Vezi rezervarea</span>
              <span className="ai-d">Detalii, cod acces și facturare</span></span>
          </button>

          <button className="action-item" onClick={onEdit}>
            <span className="ai-ico"><Pencil size={17} /></span>
            <span className="ai-body"><span className="ai-t">Editează rezervarea</span>
              <span className="ai-d">Cameră, date, client, preț, status</span></span>
          </button>

          {mayCheckOut ? (
            <button className="action-item" disabled={busy} onClick={() => ruleaza(async () => {
              await doCheckOut(res, reservations, updateReservations, core, housekeeping, updateHousekeeping);
              onClose();
            })}>
              <span className="ai-ico"><ArrowRight size={17} /></span>
              <span className="ai-body"><span className="ai-t">Check-out</span>
                <span className="ai-d">{departsToday ? "Pleacă astăzi" : "Camera trece pe „murdară”"}</span></span>
            </button>
          ) : (
            <button className="action-item" disabled={!mayCheckIn || busy} onClick={() => ruleaza(async () => {
              const out = await doCheckIn(res, reservations, updateReservations, core);
              if (out && out.error) { setActionError(out.error); return; }
              onClose();
            })}>
              <span className="ai-ico"><LogIn size={17} /></span>
              <span className="ai-body"><span className="ai-t">Check-in</span>
                <span className="ai-d">{checkInHint
                  || (res.status === "checkedout" ? "Sejur încheiat"
                    : arrivesToday ? "Sosire astăzi" : `Sosire ${fmtDate(res.checkin)}`)}</span></span>
            </button>
          )}

          {msgOpen ? (
            <div className="msg-compose">
              <textarea rows={3} autoFocus maxLength={2000} value={msgText} placeholder="ex. Sosesc după ora 22 · cerere pat suplimentar"
                onChange={(e) => setMsgText(e.target.value)} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost" style={{ padding: "8px 12px" }}
                  onClick={() => { setMsgOpen(false); setMsgText(""); }}>Renunță</button>
                <button className="btn btn-primary" style={{ width: "auto", padding: "8px 14px" }}
                  onClick={() => ruleaza(addMessage)} disabled={!msgText.trim() || busy}>
                  <Check size={14} /> Salvează
                </button>
              </div>
            </div>
          ) : (
            <button className="action-item" onClick={() => setMsgOpen(true)}>
              <span className="ai-ico"><MessageSquare size={17} /></span>
              <span className="ai-body"><span className="ai-t">Adaugă mesaj</span>
                <span className="ai-d">{messages.length ? `${messages.length} mesaje pe rezervare` : "Notă vizibilă pentru echipă"}</span></span>
            </button>
          )}

          {messages.length > 0 && !msgOpen && (
            <div className="msg-list">
              {messages.slice(-3).reverse().map((m) => (
                <div className="msg-item" key={m.id}>
                  <div className="msg-text">{m.text}</div>
                  <div className="msg-meta">{m.author} · {fmtDateTime(m.ts)}</div>
                </div>
              ))}
            </div>
          )}

          {canNoShow(res, now) && (
            <button className="action-item" disabled={busy} onClick={() => ruleaza(async () => {
              await updateReservations(reservations.map((r) => (r.id === res.id ? { ...r, status: "noshow" } : r)));
              await audit.push("No-show",
                `${guestFullName(guest) || "Fără nume"} · ${room?.name} · ${fmtDate(res.checkin)}`);
              onClose();
            })}>
              <span className="ai-ico"><UserCheck size={17} /></span>
              <span className="ai-body"><span className="ai-t">Marchează no-show</span>
                <span className="ai-d">Nu s-a prezentat — camera se eliberează</span></span>
            </button>
          )}

          <button className="action-item" onClick={onMove} disabled={!isLive(res)}>
            <span className="ai-ico"><MoveRight size={17} /></span>
            <span className="ai-body"><span className="ai-t">Mută camera</span>
              <span className="ai-d">Alegi apoi camera și ziua de sosire</span></span>
          </button>

          {canCancel(res) && (
            confirmCancel ? (
              <div className="action-confirm">
                <span>Anulezi rezervarea?</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-ghost" style={{ padding: "8px 12px" }} onClick={() => setConfirmCancel(false)} disabled={busy}>Nu</button>
                  <button className="btn btn-danger" style={{ padding: "8px 12px" }} onClick={() => ruleaza(cancel)} disabled={busy}>Da, anulează</button>
                </div>
              </div>
            ) : (
              <button className="action-item danger" onClick={() => setConfirmCancel(true)}>
                <span className="ai-ico"><XCircle size={17} /></span>
                <span className="ai-body"><span className="ai-t">Anulează rezervarea</span>
                  <span className="ai-d">Rămâne în calendar, marcată ca anulată</span></span>
              </button>
            )
          )}
        </div>

        {actionError && <div className="drag-error" role="alert" style={{ marginTop: 10 }}>{actionError}</div>}

        <button className="btn btn-ghost" style={{ width: "100%", marginTop: 6 }} onClick={onClose}>Închide</button>
      </Dialog>
  );
}

/* ---------------------------------------------------------------
   SETTINGS HUB
----------------------------------------------------------------*/
function SettingsView({ setView, items }) {
  return (
    <div className="settings-grid">
      {items.map((it) => (
        <button className="settings-card" key={it.key} onClick={() => setView(it.key)}>
          <span className="ico"><it.icon size={18} /></span>
          <span>
            <span className="t" style={{ display: "block" }}>{it.label}</span>
            <span className="d" style={{ display: "block" }}>{it.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export default function PMSAppRoot() {
  return (
    <ErrorBoundary>
      <PMSApp />
    </ErrorBoundary>
  );
}
