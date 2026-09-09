// Reguli automate pentru relee — logica pura, fara Deno.*, fara acces la
// baza de date, testabila direct din vitest (la fel ca providers/shelly.ts).
// Orchestrarea (interogari Supabase, apeluri Shelly) sta in index.ts;
// fisierul asta raspunde doar la intrebarea "ce ar trebui sa fie pornit,
// dat fiind ce ore e si ce rezervari exista".
//
// Trei reguli, pe releele existente (boiler / iluminat exterior):
//
// 1. ANTI-LEGIONELA: boilerul porneste 11:00->14:00, o data la 10 zile,
//    dar numai daca nicio camera legata de el n-a fost cazata efectiv
//    (checkedin/checkedout) in ultimele 10 zile.
// 2. LUMINI EXTERIOARE: cat timp exista MACAR O camera cazata ACUM oriunde
//    in pensiune, toate luminile exterioare se aprind intre apus si
//    rasarit; altfel raman stinse. Comanda manuala suprascrie automatizarea
//    pana la urmatoarea tranzitie naturala (vezi `urmatoareaTranzitie`).
// 3. PREINCALZIRE BOILER: la o rezervare `checkedin`, boilerul camerei
//    porneste cu 4 ore inainte de `checkin` si ramane pornit pe toata
//    durata sejurului; nu se opreste daca a doua zi mai vine cineva pe
//    oricare din cele doua camere ale releului.
//
// deno-lint-ignore-file no-explicit-any

export interface Rezervare {
  id?: string;
  room_id?: string;
  status: string;
  checkin: string;
  checkout: string;
}

export const ZILE_LEGIONELA = 10;
export const ORA_START_LEGIONELA = 11;
export const ORA_STOP_LEGIONELA = 14;
export const ORE_PREINCALZIRE = 4;
export const FUS_ORAR = "Europe/Bucharest";

/* Cheile din `automation_rules`. Fiecare regula se poate opri separat din
   ecranul Automatizari; o regula oprita nu mai COMANDA nimic, dar nu stinge
   ce a pornit deja — releele raman unde sunt, sub control manual. */
export const REGULI = {
  PREINCALZIRE: "preincalzire_boiler",
  LUMINI: "lumini_exterioare",
  LEGIONELA: "anti_legionella",
} as const;

/* Coordonatele pensiunii — sursa e src/guest/continut.js:41 (`ACASA`),
   folosite acolo pentru harta din guest app. Funcția edge nu poate importa
   peste granița guest-app/edge-function (deploy-uri separate), deci
   valoarea e duplicată aici; dacă pensiunea se mută, ambele locuri trebuie
   actualizate. */
export const ACASA = { lat: 46.6225253, lon: 27.7551750 };

/* --- timp local, fara librarie noua: Intl are baza IANA completa, atat in
   Deno cat si in Node (deci testabil din vitest), si trece corect peste
   schimbarea orei de vara/iarna fara nicio ajustare manuala. */

export function dataLocala(data: Date, fus: string = FUS_ORAR): string {
  // "en-CA" formateaza AAAA-LL-ZZ direct, comparabil cu o coloana `date`.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: fus, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(data);
}

export function oraLocala(data: Date, fus: string = FUS_ORAR): number {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: fus, hour: "numeric", hour12: false,
  }).format(data);
  // Unele medii ICU scriu miezul noptii ca "24" — normalizat la 0.
  return parseInt(text, 10) % 24;
}

export function ziUrmatoare(dataISO: string): string {
  const d = new Date(dataISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function zileIntre(dataISOa: string, dataISOb: string): number {
  const a = new Date(dataISOa + "T00:00:00Z").getTime();
  const b = new Date(dataISOb + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

/* --- ocupare ---
 *
 * "Cazata" nu inseamna acelasi lucru in fiecare regula — vezi docs/plan.
 * `cazatAcum` e duplicata din src/lib/tranzitii.js (aceeasi definitie, cu
 * acelasi motiv: check-in-ul se poate face cu pana la 14 zile inainte de
 * sosire, deci status `checkedin` singur NU inseamna ca oaspetele a ajuns
 * fizic — pragul e ora de `checkin`, nu statusul). Funcția edge nu poate
 * importa din src/, deci definitia e copiata, nu partajata. */
export function cazatAcum(r: Rezervare, acum: Date): boolean {
  return r.status === "checkedin" && new Date(r.checkin).getTime() <= acum.getTime();
}

/* Suprapunere de intervale semi-deschise [start, end) — acelasi model ca
   `rangesOverlap` din src/lib/availability.js, reimplementat aici pentru
   acelasi motiv de granita guest-app/edge-function. */
function seSuprapun(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime()
      && new Date(aEnd).getTime() > new Date(bStart).getTime();
}

/* --- regula 3: preincalzire boiler --- */

/* Pornire precisa: exista o rezervare `checkedin` a carei fereastra de
   preincalzire (checkin - 4h) a inceput deja, si sejurul nu s-a terminat. */
export function sejurActiv(rezervari: Rezervare[], acum: Date): boolean {
  const acumMs = acum.getTime();
  return (rezervari || []).some((r) =>
    r.status === "checkedin"
    && new Date(r.checkin).getTime() - ORE_PREINCALZIRE * 3600_000 <= acumMs
    && acumMs < new Date(r.checkout).getTime());
}

/* Puntea peste un gol de aceeasi zi sau spre ziua urmatoare: folosita DOAR
   ca sa prelungeasca un releu deja pornit, niciodata ca sa porneasca unul
   nou mai devreme de fereastra de 4 ore — vezi boilerDorit. */
export function sejurCurandSauMaine(rezervari: Rezervare[], acum: Date, fus: string = FUS_ORAR): boolean {
  const acumMs = acum.getTime();
  const maine = ziUrmatoare(dataLocala(acum, fus));
  return (rezervari || []).some((r) =>
    r.status === "checkedin"
    && new Date(r.checkout).getTime() > acumMs
    && dataLocala(new Date(r.checkin), fus) <= maine);
}

/* --- regula 1: anti-legionela --- */

/* A stat efectiv cineva (checkedin/checkedout) in camerele astea in
   ultimele `zile` zile? Rezervarile viitoare (confirmed) nu conteaza —
   regula vrea absenta REALA, nu doar lipsa unei rezervari. */
export function ocupatRecentLegionela(rezervari: Rezervare[], acum: Date, zile: number = ZILE_LEGIONELA): boolean {
  const inceput = new Date(acum.getTime() - zile * 86400000).toISOString();
  return (rezervari || []).some((r) =>
    (r.status === "checkedin" || r.status === "checkedout")
    && seSuprapun(r.checkin, r.checkout, inceput, acum.toISOString()));
}

export function legionelaDorit(opts: {
  rezervari: Rezervare[];
  acum: Date;
  ultimaRulare: string | null;
  fus?: string;
}): boolean {
  const { rezervari, acum, ultimaRulare, fus = FUS_ORAR } = opts;

  const ora = oraLocala(acum, fus);
  if (ora < ORA_START_LEGIONELA || ora >= ORA_STOP_LEGIONELA) return false;

  const azi = dataLocala(acum, fus);
  /* "E momentul ciclului" daca n-a rulat niciodata, au trecut >=10 zile, SAU
     a rulat deja azi — ultima conditie tine boilerul pornit tot intervalul
     11-14, altfel al doilea tick din aceeasi fereastra (ex. 11:10) ar vedea
     `zileDeLaUltima = 0` si ar opri boilerul imediat dupa ce l-a pornit.
     Oprirea reala vine strict din inchiderea ferestrei orare, nu de aici. */
  const eMomentulCiclului = ultimaRulare === azi
    || ultimaRulare === null
    || zileIntre(ultimaRulare, azi) >= ZILE_LEGIONELA;
  if (!eMomentulCiclului) return false;

  return !ocupatRecentLegionela(rezervari, acum);
}

/* Cele doua reguli care ating boilerul se combina AICI, intr-un singur
   raspuns, tocmai ca sa nu se calce: altfel anti-legionela ar stinge la 14:00
   un boiler pe care preincalzirea tocmai l-a pornit pentru un oaspete.
 *
 * Steagurile vin din `automation_rules`. Cand AMANDOUA sunt oprite, apelantul
 * nu are voie sa foloseasca `pornit: false` ca sa stinga boilerul — o regula
 * oprita inseamna "nu mai comand", nu "opreste tot". Vezi garda din index.ts. */
export function boilerDorit(opts: {
  rezervari: Rezervare[];
  acum: Date;
  curentPornit: boolean;
  ultimaRulareLegionela: string | null;
  fus?: string;
  preincalzireActiva?: boolean;
  legionelaActiva?: boolean;
}): { pornit: boolean; motivLegionela: boolean } {
  const {
    rezervari, acum, curentPornit, ultimaRulareLegionela, fus = FUS_ORAR,
    preincalzireActiva = true, legionelaActiva = true,
  } = opts;

  const sejur = preincalzireActiva && (
    sejurActiv(rezervari, acum)
    || (curentPornit && sejurCurandSauMaine(rezervari, acum, fus)));
  const legionela = legionelaActiva
    && legionelaDorit({ rezervari, acum, ultimaRulare: ultimaRulareLegionela, fus });

  return { pornit: sejur || legionela, motivLegionela: legionela };
}

/* --- regula 2: lumini exterioare --- */

/* Rasarit/apus — formula NOAA/Naval Observatory de precizie joasa (in jur
   de 1-2 minute eroare), suficienta pentru comanda unui releu de iluminat.
   Nicio dependenta de retea sau libraria noua — doar aritmetica din
   lat/lon/data. Intoarce `null` pentru ambele doar la latitudini polare
   (noapte/zi polara), ceea ce nu se aplica niciodata la Vaslui. */
export function calculeazaRasaritApus(
  lat: number, lon: number, dataUTC: Date,
): { rasarit: Date | null; apus: Date | null } {
  const rad = Math.PI / 180;
  const an = dataUTC.getUTCFullYear();
  const inceputAn = Date.UTC(an, 0, 1);
  const ziuaCurenta = Date.UTC(an, dataUTC.getUTCMonth(), dataUTC.getUTCDate());
  const N = Math.floor((ziuaCurenta - inceputAn) / 86400000) + 1;

  function calc(esteRasarit: boolean): Date | null {
    const lngHour = lon / 15;
    const t = N + ((esteRasarit ? 6 : 18) - lngHour) / 24;

    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634;
    L = ((L % 360) + 360) % 360;

    let RA = (1 / rad) * Math.atan(0.91764 * Math.tan(L * rad));
    RA = ((RA % 360) + 360) % 360;
    const cadranL = Math.floor(L / 90) * 90;
    const cadranRA = Math.floor(RA / 90) * 90;
    RA = (RA + (cadranL - cadranRA)) / 15;

    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null; // noapte/zi polara — nu se aplica la Vaslui

    let H = esteRasarit ? 360 - (1 / rad) * Math.acos(cosH) : (1 / rad) * Math.acos(cosH);
    H = H / 15;

    const T = H + RA - 0.06571 * t - 6.622;
    let UT = ((T - lngHour) % 24 + 24) % 24;

    const ore = Math.floor(UT);
    const minute = Math.floor((UT - ore) * 60);
    const secunde = Math.round((((UT - ore) * 60) - minute) * 60);
    return new Date(Date.UTC(an, dataUTC.getUTCMonth(), dataUTC.getUTCDate(), ore, minute, secunde));
  }

  return { rasarit: calc(true), apus: calc(false) };
}

export function esteNoapte(acum: Date, lat: number = ACASA.lat, lon: number = ACASA.lon): boolean {
  const { rasarit, apus } = calculeazaRasaritApus(lat, lon, acum);
  if (!rasarit || !apus) return false;
  return acum.getTime() < rasarit.getTime() || acum.getTime() >= apus.getTime();
}

/* Urmatoarea tranzitie naturala (rasarit sau apus) de la `acum` incolo —
   folosita ca sa stabileasca pana cand tine o comanda manuala peste
   automatizare (device_automation_override.until). */
export function urmatoareaTranzitie(acum: Date, lat: number = ACASA.lat, lon: number = ACASA.lon): Date {
  const azi = calculeazaRasaritApus(lat, lon, acum);
  if (azi.rasarit && acum.getTime() < azi.rasarit.getTime()) return azi.rasarit;
  if (azi.apus && acum.getTime() < azi.apus.getTime()) return azi.apus;

  const maine = new Date(acum.getTime() + 86400000);
  const ziUrmatoare = calculeazaRasaritApus(lat, lon, maine);
  return ziUrmatoare.rasarit || maine;
}

/* `rezervariPensiune` = TOATE rezervarile relevante ale pensiunii (nu doar
   ale unei camere tehnice) — cerinta explicita: o singura camera cazata
   oriunde aprinde toate cele 7 relee de iluminat exterior deodata. */
export function luminiDorite(
  rezervariPensiune: Rezervare[], acum: Date, lat: number = ACASA.lat, lon: number = ACASA.lon,
): boolean {
  return esteNoapte(acum, lat, lon) && (rezervariPensiune || []).some((r) => cazatAcum(r, acum));
}
