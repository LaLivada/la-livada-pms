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

export async function generatePdfBlob(el, opts = {}) {
  if (!el) return null;
  const { singlePage = false, latimeFixa = 0 } = opts;
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
  /* `latimeFixa`: documentul se aseaza la o latime data DOAR cat tine
     captura, apoi revine cum era. Asa PDF-ul iese identic de pe telefon si
     de pe laptop, fara ca fereastra de pe ecran sa fie obligata la aceeasi
     latime — altfel raportul pe 650px ar cere derulare laterala pe telefon.
     `windowWidth` merge in pereche cu ea: html2canvas cloneaza pagina intr-un
     iframe lat cat fereastra, deci pe un ecran de 375px un document de 650px
     s-ar aseza altfel in clona decat in pagina reala. */
  const latimeInitiala = el.style.width;
  if (latimeFixa) el.style.width = `${latimeFixa}px`;
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
