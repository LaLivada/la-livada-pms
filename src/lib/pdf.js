// @ts-check
/* Generare PDF din DOM (html2canvas + jsPDF), nu window.print().
 *
 * Intoarce un Blob, nu descarca: pe telefon un fisier aterizat in Downloads
 * inseamna ca trebuie sa iesi din aplicatie ca sa-l vezi.
 *
 * Doua lucruri care au costat scump si sunt comentate la locul lor mai jos:
 * `compress: true` (fara el o fisa de anuntare are 10,7 MB in loc de 219 KB)
 * si marginea de pagina (fara ea imprimantele decaleaza sau taie).
 */

import { mesajEroare } from "./errors.js";

/* Oprește transformările de pe strămoșii unui element și întoarce funcția
   care le pune la loc.

   De ce: pe ecran coala facturii e micșorată cu `transform: scale(...)` ca să
   încapă în fereastră, iar html2canvas ia dimensiunea VIZUALĂ a elementului,
   nu pe cea din așezare. Pe 17 septembrie 2026 factura a ieșit într-un canvas
   de 343px în loc de 794 — conținutul unei coli A4 înghesuit pe o treime din
   lățime, cu literele călcate una peste alta. Se vedea doar în PDF, fiindcă pe
   ecran scalarea e tocmai ce trebuie.

   Elementul capturat NU e atins: dacă are el însuși o transformare, aia face
   parte din cum arată documentul. Se opresc doar strămoșii, care țin de cum e
   așezat el în pagină.
   @param {HTMLElement} el
   @returns {() => void} */
export function opresteTransformarile(el) {
  const oprite = [];
  for (let nod = el?.parentElement; nod; nod = nod.parentElement) {
    if (getComputedStyle(nod).transform !== "none") {
      oprite.push([nod, nod.style.transform]);
      nod.style.transform = "none";
    }
  }
  return () => { for (const [nod, valoare] of oprite) nod.style.transform = valoare; };
}

/* Unde se rupe un document mai lung decât o coală.

   Până pe 18 septembrie 2026 se tăia la înălțime fixă, adică oriunde: pe lista
   de cazare a unui grup de 15 camere, pagina a doua începea cu jumătatea de jos
   a unui rând, iar capul de tabel („# Cameră Ocupant …") rămânea doar pe prima.

   `opriri` sunt marginile de jos ale lucrurilor care nu se taie — rândurile
   tabelului și blocurile din jurul lui. Se ia cea mai de jos oprire care încape
   pe pagină. Dacă niciuna nu încape — un rând mai înalt decât o coală — se taie
   drept, altfel bucla n-ar avansa niciodată și am scrie pagini la infinit.

   `inaltimeCap` e banda repetată în capul paginilor următoare: ea mănâncă din
   spațiul disponibil, de aceea intră în socoteală aici, nu la desenare. Fiecare
   pagină își primește înapoi înălțimea de cap pe care chiar o folosește (`cap`),
   ca desenarea să n-o recalculeze și să iasă altfel.
   @param {number} inaltimeTotala
   @param {number} inaltimePagina
   @param {number[]} [opriri]
   @param {number} [inaltimeCap]
   @returns {{ sus: number, jos: number, cap: number }[]} */
export function taieturiPagina(inaltimeTotala, inaltimePagina, opriri = [], inaltimeCap = 0) {
  if (!(inaltimeTotala > 0) || !(inaltimePagina > 0)) return [];
  /* Un cap care ar mânca jumătate de pagină nu se mai repetă: ar umfla
     documentul în loc să-l facă de citit. */
  const cap = inaltimeCap > 0 && inaltimeCap < inaltimePagina / 2 ? inaltimeCap : 0;
  const sortate = [...new Set(opriri)].filter((o) => o > 0).sort((a, b) => a - b);
  const pagini = [];
  let sus = 0;
  while (sus < inaltimeTotala - 0.5) {
    const capAcum = pagini.length ? cap : 0;
    const limita = sus + inaltimePagina - capAcum;
    if (inaltimeTotala <= limita + 0.5) {
      pagini.push({ sus, jos: inaltimeTotala, cap: capAcum });
      break;
    }
    let jos = 0;
    /* `sus + 1`, nu `sus`: oprirea chiar de unde începe pagina ar da o felie
       goală, iar bucla ar bate pasul pe loc. */
    for (const o of sortate) { if (o > sus + 1 && o <= limita) jos = o; }
    if (!jos) jos = limita;
    pagini.push({ sus, jos, cap: capAcum });
    sus = jos;
  }
  return pagini;
}

/* Măsurătorile de care are nevoie `taieturiPagina`, în pixeli CSS față de
   marginea de sus a documentului. Se cheamă ÎNAINTE de captură, cu lățimea de
   tipărire deja pusă și transformările oprite — adică pe exact așezarea pe care
   o vede html2canvas.
   @param {HTMLElement} el
   @param {string} intregi
   @param {string} capRepetat */
function masoaraPaginarea(el, intregi, capRepetat) {
  const coala = el.getBoundingClientRect();
  const opriri = [];
  if (intregi) {
    for (const nod of el.querySelectorAll(intregi)) {
      const r = nod.getBoundingClientRect();
      if (r.height > 0) opriri.push(r.bottom - coala.top);
    }
  }
  const nodCap = capRepetat ? el.querySelector(capRepetat) : null;
  const rCap = nodCap ? nodCap.getBoundingClientRect() : null;
  /* Banda urcă și peste linia de deasupra capului de tabel. Pe prima pagină
     linia aia e în document — e chenarul de jos al blocului dinaintea
     tabelului — dar nu ține de cap, deci pe paginile următoare capul ar
     începe cu nimic deasupra, lipit de muchia hârtiei. */
  const linie = rCap ? chenarulDeDeasupra(el, nodCap, rCap.top) : 0;
  return {
    inaltime: coala.height,
    opriri,
    cap: rCap && rCap.height > 0
      ? { sus: rCap.top - coala.top - linie, inaltime: rCap.height + linie }
      : null,
  };
}

/* Grosimea chenarului de jos al blocului care stă LIPIT deasupra unui element
   — cel care, pe hârtie, îi ține loc de linie de sus. Zero dacă nu există sau
   dacă între ele e spațiu: atunci n-am lua o linie, am lua o dungă albă.
   @param {HTMLElement} el
   @param {Element} nod
   @param {number} sus
   @returns {number} */
function chenarulDeDeasupra(el, nod, sus) {
  for (let x = nod; x && x !== el; x = x.parentElement) {
    const inainte = x.previousElementSibling;
    if (!inainte) continue;
    if (Math.abs(inainte.getBoundingClientRect().bottom - sus) > 1) return 0;
    return parseFloat(getComputedStyle(inainte).borderBottomWidth) || 0;
  }
  return 0;
}

/* O pagină decupată din captura întreagă: banda de cap (dacă e cerută) lipită
   deasupra feliei de conținut. Fondul se umple alb fiindcă banda și felia nu
   sunt lipite pixel-perfect — o dungă transparentă între ele ar ieși neagră la
   tipărire.
   @param {HTMLCanvasElement} captura
   @param {{ sus: number, jos: number, cap: number }} pagina
   @param {number} capSus
   @returns {string} */
function decupeazaPagina(captura, pagina, capSus) {
  const inaltime = Math.max(1, Math.round(pagina.cap + pagina.jos - pagina.sus));
  const coala = document.createElement("canvas");
  coala.width = captura.width;
  coala.height = inaltime;
  const ctx = coala.getContext("2d");
  if (!ctx) return captura.toDataURL("image/png");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, coala.width, coala.height);
  if (pagina.cap > 0) {
    ctx.drawImage(captura, 0, capSus, captura.width, pagina.cap, 0, 0, captura.width, pagina.cap);
  }
  const h = pagina.jos - pagina.sus;
  ctx.drawImage(captura, 0, pagina.sus, captura.width, h, 0, pagina.cap, captura.width, h);
  return coala.toDataURL("image/png");
}

export async function generatePdfBlob(el, opts = {}) {
  if (!el) return null;
  const { singlePage = false, latimeFixa = 0, intregi = "", capRepetat = "" } = opts;
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
    const eroare = /** @type {Error & { code?: string }} */ (new Error(`Import dinamic eșuat: ${e?.message || e}`));
    eroare.code = "APP_VERSIUNE";
    throw eroare;
  }
  /* `latimeFixa`: documentul se aseaza la o latime data DOAR cat tine
     captura, apoi revine cum era. Asa PDF-ul iese identic de pe telefon si
     de pe laptop, fara ca fereastra de pe ecran sa fie obligata la aceeasi
     latime — altfel raportul pe 650px ar cere derulare laterala pe telefon.
     `windowWidth` merge in pereche cu ea: html2canvas cloneaza pagina intr-un
     iframe lat cat fereastra, deci pe un ecran de 375px un document de 650px
     s-ar aseza altfel in clona decat in pagina reala. */
  const latimeInitiala = el.style.width;
  if (latimeFixa) el.style.width = `${latimeFixa}px`;
  // Vezi `opresteTransformarile`: si ea doar cat tine captura.
  const reporneste = opresteTransformarile(el);
  /* Masurat aici, nu dupa captura: acum documentul e asezat exact cum il vede
     html2canvas (latimea de tiparire pusa, transformarile oprite). */
  const masuri = (intregi || capRepetat) ? masoaraPaginarea(el, intregi, capRepetat) : null;
  let canvas;
  try {
    canvas = await html2canvas(el, {
      scale: 2, backgroundColor: "#ffffff", useCORS: true,
      ...(latimeFixa
        ? { windowWidth: Math.max(document.documentElement.clientWidth, latimeFixa + 40) }
        : {}),
      // .no-print e gandit pentru @media print (window.print()) — aici nu
      // exista niciun context de print, deci regula CSS n-ar avea niciun
      // efect; excludem explicit acele elemente (controale de editare,
      // butoane) din captura, ca sa nu ajunga in PDF.
      ignoreElements: (node) => node.classList?.contains("no-print"),
    });
  } finally {
    /* `finally`, nu dupa apel: daca html2canvas arunca, documentul ar
       ramane inghetat la latimea de tiparire pe ecranul utilizatorului. */
    if (latimeFixa) el.style.width = latimeInitiala;
    reporneste();
  }
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

  /* Cand apelantul a spus ce nu se taie, fiecare pagina se decupeaza separat
     si primeste capul de tabel. Altfel ramane taierea veche, la inaltime fixa:
     aceeasi imagine mutata in sus de la o pagina la alta. */
  const mmPePixel = imgWidth / canvas.width;
  /* Pixeli de captura pe pixel CSS: masuratorile s-au luat pe document, taierea
     se face pe imagine. */
  const raport = masuri && masuri.inaltime > 0 ? canvas.height / masuri.inaltime : 0;
  const pagini = raport
    ? taieturiPagina(
      canvas.height, utilH / mmPePixel,
      masuri.opriri.map((o) => o * raport),
      masuri.cap ? masuri.cap.inaltime * raport : 0,
    )
    : [];
  if (pagini.length) {
    const capSus = masuri.cap ? masuri.cap.sus * raport : 0;
    pagini.forEach((pagina, i) => {
      if (i) pdf.addPage();
      const inaltime = (pagina.cap + pagina.jos - pagina.sus) * mmPePixel;
      pdf.addImage(decupeazaPagina(canvas, pagina, capSus), "PNG", MARGINE_MM, MARGINE_MM, imgWidth, inaltime);
    });
    return pdf.output("blob");
  }

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
   DESCHIDEREA PDF-ULUI INTR-O FILA NOUA

   Ordinea apelurilor NU e o preferinta de stil. Fila se cere in gestul de
   click (`pregatesteFila`), inainte de generare; generarea dureaza in jur
   de o secunda, iar un `window.open` de dupa `await` nu mai e legat de
   click, deci browserul il trateaza drept fereastra nesolicitata si il
   blocheaza — Safari intotdeauna, Chrome cand utilizatorul a refuzat
   ferestrele o data. Fila goala se deschide pe loc si e trimisa la
   document abia cand blob-ul e gata.
----------------------------------------------------------------*/

export function pregatesteFila() {
  try {
    const fila = window.open("", "_blank");
    /* Fila goala arata a pagina crapata cat dureaza generarea. */
    if (fila) fila.document.write("<title>Se generează PDF…</title>");
    return fila;
  } catch { return null; }
}

/* Intoarce `false` daca fila lipseste (blocata sau inchisa intre timp) —
   apelantul are atunci de ales ce face, de obicei arata vizualizatorul din
   aplicatie, ca sa nu ramana cu un buton care pare ca n-a facut nimic. */
export function arataInFila(fila, blob) {
  if (!fila || fila.closed) return false;
  const url = URL.createObjectURL(blob);
  /* URL-ul NU se revoca: fila tocmai a fost trimisa acolo, iar o revocare
     ar goli-o. Se elibereaza cand se inchide fila din care a plecat. */
  fila.location.replace(url);
  try { fila.opener = null; } catch { /* deja navigata, nu mai e treaba noastra */ }
  return true;
}

/* La o eroare de generare, fila deschisa in avans ar ramane alba pe ecran. */
export function inchideFila(fila) {
  try { if (fila && !fila.closed) fila.close(); } catch { /* deja inchisa */ }
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
