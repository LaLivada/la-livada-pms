// Shelly Cloud Control API v2 — releele din camere.
//
// DE CE DOAR v2, FĂRĂ RAMURA GEN1. Planul din docs/shelly-integration.md
// (august 2026) trata ambiguitatea Gen1/v2 ca risc principal, fiindcă
// dispozitivul avut în vedere atunci era un Shelly 2.5 (Gen1), iar
// documentația Shelly nu confirmă răspicat că v2 îl acoperă. Dispozitivul
// chiar montat e un Shelly Pro 4PM, care e Gen2 — acolo v2 e documentat
// fără ambiguități. Ramura v1 nu se scrie până nu apare un Gen1 real;
// `devices.device_gen` există deja în schemă ca să poată fi adăugată atunci
// fără migrare.
//
// Sursă: https://shelly-api-docs.shelly.cloud/cloud-control-api/communication-v2/

/* Starea unui DISPOZITIV FIZIC, nu a unui canal. Shelly răspunde o dată per
   dispozitiv, cu toate canalele înăuntru, iar un Pro 4PM are patru canale
   cu stări independente — boilerul poate fi pornit și prizele oprite. De
   aceea `status` rămâne brut aici, iar canalul se extrage separat cu
   `citesteIesire(status, canal)`. O variantă care ar fi întors un singur
   `on` per dispozitiv ar fi scris aceeași stare la toate cele patru canale. */
export interface StareDispozitiv {
  online: boolean;
  status: unknown;
}

/* Serverul contului (ex. "shelly-103-eu.shelly.cloud") nu e un domeniu
   universal — e legat de contul Shelly și se citește din aplicație, de pe
   aceeași pagină de unde se ia cheia. De-aia vine ca parametru, nu ca
   constantă.

   `auth_key` merge în QUERY STRING, cum cere API-ul Shelly. Consecința e
   că nu are voie să ajungă niciodată într-un mesaj de eroare sau într-un
   log — vezi `faraCheie()` mai jos, prin care trece orice text de eroare
   înainte de a pleca mai departe. */
const url = (serverUri: string, cale: string, authKey: string) =>
  `https://${serverUri}${cale}?auth_key=${encodeURIComponent(authKey)}`;

/* Shelly pune cheia în query string, deci ea apare în orice mesaj care
   citează URL-ul. Funcția asta e ultima poartă înainte ca un text să
   ajungă în `device_commands.detail` sau la client. */
export function faraCheie(text: string): string {
  return String(text).replace(/auth_key=[^&\s"']+/gi, "auth_key=***");
}

/* Timeout explicit: Shelly nu documentează niciun timeout, iar un fetch
   fără el poate atârna până la limita platformei, blocând funcția edge
   pentru o comandă care oricum n-a ajuns. Opt secunde e generos față de
   cele câteva sute de milisecunde tipice unui apel cloud-to-cloud. */
const TIMEOUT_MS = 8000;

async function cere(adresa: string, corp: unknown): Promise<Response> {
  const ceas = AbortSignal.timeout(TIMEOUT_MS);
  try {
    return await fetch(adresa, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corp),
      signal: ceas,
    });
  } catch (e) {
    /* TimeoutError vs. orice altă cădere de rețea: recepția trebuie să
       poată distinge „n-a răspuns la timp" (poate a ajuns totuși) de „n-am
       putut trimite deloc". */
    if ((e as Error)?.name === "TimeoutError") {
      throw new Error("Shelly Cloud n-a răspuns în 8 secunde.");
    }
    throw new Error(faraCheie(`Nu am putut contacta Shelly Cloud: ${(e as Error).message}`));
  }
}

/* Traduce codurile Shelly în text pentru recepție. Codurile documentate
   sunt DEVICE_OFFLINE, DEVICE_INVALID_CHANNEL, DEVICE_FAILED_COMMAND;
   restul trec ca atare, curățate de cheie. */
const MESAJE: Record<string, string> = {
  DEVICE_OFFLINE: "Dispozitivul e offline — verifică alimentarea și internetul la pensiune.",
  DEVICE_INVALID_CHANNEL: "Ieșirea configurată nu există pe acest releu. Verifică-l în Automatizare.",
  DEVICE_FAILED_COMMAND: "Dispozitivul a primit comanda dar n-a executat-o. Încearcă din nou.",
};

async function eroareDin(r: Response): Promise<Error> {
  const date = await r.json().catch(() => null);
  const cod = date?.error ? String(date.error) : "";
  const e = new Error(MESAJE[cod] || faraCheie(cod || `Shelly a răspuns HTTP ${r.status}.`));
  /* Codul brut rămâne atașat pentru `reason`-ul din răspunsul PMS, ca
     interfața să poată ramifica pe el (ex. dezactivează butoanele când e
     offline), fără să depindă de textul în română. */
  (e as Error & { cod?: string }).cod = cod;
  return e;
}

export async function seteazaComutator(
  serverUri: string,
  authKey: string,
  deviceId: string,
  canal: number,
  pornit: boolean,
): Promise<void> {
  const r = await cere(
    url(serverUri, "/v2/devices/api/set/switch", authKey),
    { id: deviceId, channel: canal, on: pornit },
  );
  if (!r.ok) throw await eroareDin(r);
}

/* Maximum 10 id-uri per apel, documentat. Gruparea o face apelantul —
   funcția asta refuză explicit un lot prea mare în loc să-l trunchieze în
   tăcere, fiindcă un lot trunchiat ar lăsa dispozitive cu status vechi
   fără ca nimeni să observe. */
export const MAX_PE_LOT = 10;

export async function citesteStare(
  serverUri: string,
  authKey: string,
  deviceIds: string[],
): Promise<Record<string, StareDispozitiv>> {
  if (!deviceIds.length) return {};
  if (deviceIds.length > MAX_PE_LOT) {
    throw new Error(`Shelly acceptă cel mult ${MAX_PE_LOT} dispozitive per apel.`);
  }

  const r = await cere(
    url(serverUri, "/v2/devices/api/get", authKey),
    { ids: deviceIds, select: ["status"] },
  );
  if (!r.ok) throw await eroareDin(r);

  const lista = await r.json().catch(() => null);
  if (!Array.isArray(lista)) return {};

  const rezultat: Record<string, StareDispozitiv> = {};
  for (const d of lista) {
    if (!d?.id) continue;
    rezultat[String(d.id)] = {
      online: d.online === 1 || d.online === true,
      status: d.status,
    };
  }
  return rezultat;
}

/* Consumul citit de un Shelly Pro 3EM.
   Puterea vine în WAȚI de la Shelly; aici pleacă în kW, fiindcă asta se
   afișează — conversia se face o singură dată, aici, nu în fiecare loc care
   pune cifra pe ecran. */
export interface Faza {
  nume: "R" | "S" | "T";
  kw: number;
  a: number;
  v: number;
}
export interface Consum {
  faze: Faza[];
  totalKw: number;
  totalA: number;
}

const NUME_FAZE: Array<"R" | "S" | "T"> = ["R", "S", "T"];

/* Extras separat, testabil fără rețea — vezi src/shelly.test.js.

   Două forme acceptate, fiindcă n-am putut verifica pe dispozitivul real
   care dintre ele vine: Pro 3EM (Gen2) raportează un obiect `em:0` cu chei
   `a_act_power` / `b_` / `c_`, iar 3EM-ul Gen1 raporta un tablou `emeters`.
   Ce nu se potrivește iese ca zero — o cifră lipsă e mai onestă decât una
   inventată dintr-o cheie ghicită greșit. */
export function citesteConsum(status: unknown): Consum | null {
  if (!status || typeof status !== "object") return null;
  const s = status as Record<string, any>;
  const em = s["em:0"] || s.em0 || s.em;

  let faze: Faza[];
  if (em && typeof em === "object") {
    faze = ["a", "b", "c"].map((litera, i) => ({
      nume: NUME_FAZE[i],
      kw: numar(em[`${litera}_act_power`]) / 1000,
      a: numar(em[`${litera}_current`]),
      v: numar(em[`${litera}_voltage`]),
    }));
  } else if (Array.isArray(s.emeters)) {
    faze = s.emeters.slice(0, 3).map((e: any, i: number) => ({
      nume: NUME_FAZE[i],
      kw: numar(e?.power) / 1000,
      a: numar(e?.current),
      v: numar(e?.voltage),
    }));
  } else {
    return null;
  }

  /* Totalul raportat de dispozitiv are prioritate fata de suma fazelor:
     Shelly il calculeaza din aceleasi masuratori, dar fara erorile de
     rotunjire pe care le-ar aduna trei impartiri la 1000. */
  const totalKw = em && em.total_act_power !== undefined
    ? numar(em.total_act_power) / 1000
    : faze.reduce((t, f) => t + f.kw, 0);
  const totalA = em && em.total_current !== undefined
    ? numar(em.total_current)
    : faze.reduce((t, f) => t + f.a, 0);

  return { faze, totalKw, totalA };
}

const numar = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

/* Starea unui CANAL anume din răspunsul brut.

   Forma lui `status` diferă între familii de dispozitive. Pro 4PM (Gen2)
   raportează pe `switch:N`; unele răspunsuri folosesc `switchN`, iar Gen1
   raporta `relays[N].ison` sau un `on` simplu. Le încercăm pe toate, în
   ordinea asta, în loc să presupunem una — dacă niciuna nu se potrivește,
   rămâne false, adică „Oprit" în interfață, nu o eroare tăcută.

   Extras separat şi ca să fie testabil fără rețea — vezi src/shelly.test.js. */
export function citesteIesire(status: unknown, canal = 0): boolean {
  if (!status || typeof status !== "object") return false;
  const s = status as Record<string, any>;
  const candidati = [
    s[`switch:${canal}`]?.output,
    s[`switch${canal}`]?.output,
    canal === 0 ? s.on : undefined,
    canal === 0 ? s.relays?.[0]?.ison : undefined,
    s.relays?.[canal]?.ison,
  ];
  for (const v of candidati) {
    if (typeof v === "boolean") return v;
  }
  return false;
}
