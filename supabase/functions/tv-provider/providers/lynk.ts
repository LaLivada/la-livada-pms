// Samsung LYNK Cloud — mesajele de bun venit de pe televizoarele din camere.
//
// CE E VERIFICAT ȘI CE NU. Se scrie aici, în capul fișierului, fiindcă
// diferența contează pentru cine vine după:
//
//   · VERIFICAT, din paginile publice Samsung (18 septembrie 2026):
//     LYNK Cloud administrează televizoarele de hotel din cloud, ține
//     mesajul de bun venit per cameră și primește datele oaspetelui din PMS
//     — chiar exemplul lor e „Welcome John Smith, we hope you enjoy your
//     stay with us!". Există și un „Open API" pentru integrări.
//     https://www.samsung.com/us/business/solutions/industries/hospitality/lynk-cloud/
//
//   · NEVERIFICAT: contractul REST propriu-zis — adresele, numele câmpurilor
//     și forma tokenului. Samsung nu publică documentația Open API; ea vine
//     odată cu contul de proprietate, de la partenerul care face instalarea.
//     Ce e mai jos e forma OBIȘNUITĂ a unui astfel de API (OAuth2 client
//     credentials + REST pe proprietate și aparat), pusă într-un singur loc
//     ca să poată fi corectată dintr-o singură privire când sosesc
//     credențialele: constantele `CAI` de mai jos și cele trei funcții de
//     citire a răspunsului (`listaDin`, `idDin`, `onlineDin`).
//
// PÂNĂ ATUNCI, integrarea merge pe furnizorul `simulare` (vezi simulare.ts și
// setarea `provider` din `pms:tv:v1`). Alegerea e DELIBERATĂ, dintr-o setare,
// niciodată o rezervă automată: un cont LYNK care nu răspunde n-are voie să
// se transforme tăcut în „mesaje trimise cu succes".
//
// deno-lint-ignore-file no-explicit-any

export interface Televizor {
  deviceId: string;
  name: string;
  model?: string;
  /* Camera așa cum e numită în contul LYNK, dacă o spune. Nu leagă nimic
     singură — e doar propunerea pe care ecranul o arată adminului la mapare:
     o cameră greșită pe un televizor înseamnă numele altui oaspete pe ecran. */
  roomHint?: string;
  online?: boolean;
}

export interface Stare {
  online: boolean;
  status: unknown;
}

const BASE = (Deno.env.get("LYNK_API_BASE") || "").replace(/\/+$/, "");
const CLIENT_ID = Deno.env.get("LYNK_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("LYNK_CLIENT_SECRET") || "";
/* Proprietatea (hotelul) din contul LYNK. Un cont poate administra mai
   multe; fără ea, apelurile ar fi ambigue exact în felul care ar trimite un
   mesaj în altă clădire. */
const SITE_ID = Deno.env.get("LYNK_SITE_ID") || "";

export const configurat = () => Boolean(BASE && CLIENT_ID && CLIENT_SECRET && SITE_ID);

export const ceLipseste = () => [
  !BASE && "LYNK_API_BASE",
  !CLIENT_ID && "LYNK_CLIENT_ID",
  !CLIENT_SECRET && "LYNK_CLIENT_SECRET",
  !SITE_ID && "LYNK_SITE_ID",
].filter(Boolean).join(", ");

/* TOATE ADRESELE, ÎNTR-UN SINGUR LOC.
 *
 * Când sosește documentația Open API a contului, aici se corectează — nu
 * prin cod. `{site}` și `{device}` se înlocuiesc la apel. */
const CAI = {
  token: "/oauth2/token",
  televizoare: "/v1/sites/{site}/devices",
  televizor: "/v1/sites/{site}/devices/{device}",
  mesaj: "/v1/sites/{site}/devices/{device}/welcome-message",
};

const adresa = (cale: string, device = "") =>
  `${BASE}${cale.replace("{site}", encodeURIComponent(SITE_ID)).replace("{device}", encodeURIComponent(device))}`;

/* Opt secunde, ca la Shelly: un fetch fără timeout poate atârna până la
   limita platformei, blocând funcția pentru un mesaj care oricum n-a ajuns.
   Un televizor care nu primește mesajul nu e o urgență; o funcție edge
   blocată la un check-in este. */
const TIMEOUT_MS = 8000;

async function cere(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    if ((e as Error)?.name === "TimeoutError") {
      throw new Error("LYNK Cloud n-a răspuns în 8 secunde.");
    }
    throw new Error(`Nu am putut contacta LYNK Cloud: ${(e as Error).message}`);
  }
}

/* Tokenul, ținut cât trăiește instanța. O funcție edge pornește la rece des,
   deci nu e o memorie pe care să te bazezi — e doar economia de a nu cere un
   token nou pentru fiecare televizor dintr-o sincronizare de douăzeci.
   Se reînnoiește cu un minut înainte de expirare, ca o cerere pornită
   fix la limită să nu plece cu un token mort. */
let token: { valoare: string; expira: number } | null = null;

async function autentifica(): Promise<string> {
  if (token && token.expira > Date.now() + 60_000) return token.valoare;

  const r = await cere(adresa(CAI.token), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      /* Basic pe client_id:client_secret e forma standard din RFC 6749 §2.3.1
         și cea acceptată de majoritatea serverelor; unele le vor în corp.
         Le trimitem în antet, nu în corp, tocmai ca să nu ajungă secretul în
         logul de cerere al vreunui proxy. */
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!r.ok) {
    throw new Error(`Autentificarea la LYNK Cloud a eșuat (HTTP ${r.status}). Verifică LYNK_CLIENT_ID și LYNK_CLIENT_SECRET.`);
  }
  const date = await r.json().catch(() => null);
  const valoare = date?.access_token || date?.accessToken || date?.token;
  if (!valoare) throw new Error("LYNK Cloud n-a întors niciun token de acces.");

  const secunde = Number(date?.expires_in ?? date?.expiresIn);
  token = {
    valoare: String(valoare),
    /* Fără `expires_in` presupunem cinci minute: un token presupus prea lung
       ar duce la un 401 fix la check-in, iar unul presupus prea scurt doar la
       o cerere de token în plus. */
    expira: Date.now() + (Number.isFinite(secunde) && secunde > 0 ? secunde * 1000 : 300_000),
  };
  return token.valoare;
}

/* Un 401 înseamnă de obicei că tokenul a murit mai devreme decât a spus
   serverul. Îl aruncăm și încercăm o singură dată cu unul nou — a doua oară
   e o problemă reală, nu un token expirat. */
async function cereCuToken(url: string, init: RequestInit = {}): Promise<Response> {
  const cu = async (t: string) => cere(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}), Authorization: `Bearer ${t}` },
  });

  let r = await cu(await autentifica());
  if (r.status === 401) {
    token = null;
    r = await cu(await autentifica());
  }
  return r;
}

async function eroareDin(r: Response, ce: string): Promise<Error> {
  const text = await r.text().catch(() => "");
  let detaliu = text.slice(0, 200);
  try {
    const j = JSON.parse(text);
    detaliu = String(j?.message || j?.error?.message || j?.error || detaliu);
  } catch { /* rămâne textul brut */ }
  if (r.status === 404) return new Error(`${ce}: LYNK Cloud nu găsește televizorul sau proprietatea.`);
  if (r.status === 403) return new Error(`${ce}: contul LYNK n-are drept pe proprietatea ${SITE_ID}.`);
  return new Error(`${ce}: LYNK Cloud a răspuns HTTP ${r.status}${detaliu ? ` — ${detaliu}` : ""}.`);
}

/* CITIREA RĂSPUNSULUI, tolerantă la formă.
 *
 * Nu din eleganță: forma exactă nu e cunoscută încă (vezi capul fișierului),
 * iar un `date.items` presupus greșit ar da „niciun televizor găsit" la o
 * sincronizare care de fapt a mers. Numele încercate sunt cele obișnuite. */
function listaDin(date: any): any[] {
  if (Array.isArray(date)) return date;
  for (const cheie of ["items", "devices", "data", "results", "content"]) {
    if (Array.isArray(date?.[cheie])) return date[cheie];
  }
  return [];
}

const idDin = (d: any) =>
  String(d?.deviceId ?? d?.id ?? d?.serialNumber ?? d?.serial ?? d?.macAddress ?? "").trim();

const onlineDin = (d: any) => {
  const s = String(d?.status ?? d?.powerStatus ?? d?.connectionStatus ?? "").toLowerCase();
  if (typeof d?.online === "boolean") return d.online;
  if (s) return ["online", "on", "connected", "normal"].includes(s);
  return false;
};

export async function listeazaTelevizoare(): Promise<Televizor[]> {
  const r = await cereCuToken(adresa(CAI.televizoare));
  if (!r.ok) throw await eroareDin(r, "Nu am putut citi lista de televizoare");
  const date = await r.json().catch(() => null);

  return listaDin(date)
    .map((d: any) => ({
      deviceId: idDin(d),
      name: String(d?.name ?? d?.deviceName ?? d?.alias ?? idDin(d)).slice(0, 60),
      model: d?.model ? String(d.model).slice(0, 60) : undefined,
      roomHint: d?.roomName ? String(d.roomName) : (d?.room ? String(d.room) : undefined),
      online: onlineDin(d),
    }))
    .filter((t: Televizor) => t.deviceId);
}

/* Mesajul de bun venit al unui televizor.
 *
 * `limba` pleacă odată cu textul: televizoarele Samsung de hotel țin limba
 * per cameră, iar un text în engleză lăsat pe o interfață în română arată a
 * greșeală. Nu schimbăm limba MENIULUI televizorului de aici — doar spunem
 * în ce limbă e mesajul, ca aparatul să-l poată așeza corect. */
export async function trimiteMesaj(deviceId: string, text: string, limba: string): Promise<void> {
  const r = await cereCuToken(adresa(CAI.mesaj, deviceId), {
    method: "PUT",
    body: JSON.stringify({ message: text, language: limba, enabled: true }),
  });
  if (!r.ok) throw await eroareDin(r, "Mesajul n-a ajuns pe televizor");
}

/* Ștergerea mesajului. DELETE, nu „mesaj gol": un text gol ar putea lăsa
   banner-ul pe ecran, doar fără cuvinte — iar pe ecranul următorului oaspete
   o casetă goală e mai vizibilă decât lipsa ei. Dacă în contul real
   ștergerea nu există, se înlocuiește aici cu `enabled: false`. */
export async function stergeMesaj(deviceId: string): Promise<void> {
  const r = await cereCuToken(adresa(CAI.mesaj, deviceId), { method: "DELETE" });
  /* 404 la ștergere înseamnă că nu era nimic de șters — exact rezultatul
     dorit, nu o eroare de raportat recepției. */
  if (!r.ok && r.status !== 404) throw await eroareDin(r, "Mesajul n-a putut fi șters");
}

export async function citesteStare(deviceId: string): Promise<Stare> {
  const r = await cereCuToken(adresa(CAI.televizor, deviceId));
  if (!r.ok) throw await eroareDin(r, "Nu am putut citi starea televizorului");
  const date = await r.json().catch(() => null);
  return { online: onlineDin(date), status: date ?? null };
}
