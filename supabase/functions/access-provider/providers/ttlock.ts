// Adaptor TTLock — Open Platform (https://euopen.ttlock.com).
//
// Singurul loc din proiect care știe cum arată TTLock. Restul aplicației
// cere „dă-mi un cod pentru yala X, în intervalul Y" și primește un
// rezultat neutru. Alt furnizor de yale înseamnă alt fișier ca ăsta, care
// implementează aceeași interfață — nu modificări în restul integrării.
//
// ENDPOINT-URI FOLOSITE (verificate în documentația oficială, nu deduse):
//   POST /oauth2/token           autentificare
//   POST /v3/lock/list           lista yalelor contului
//   POST /v3/keyboardPwd/add     creează cod, întoarce keyboardPwdId
//   POST /v3/keyboardPwd/delete  șterge codul
//
// De ce `add` și nu `keyboardPwd/get`: `get` întoarce un cod pe care norul
// îl derivă din secretul yalei și care merge chiar fără gateway, dar NU
// întoarce un identificator — deci codul nu mai poate fi șters mai târziu.
// Cum ne trebuie revocarea la mutarea camerei și la anulare, folosim `add`,
// care întoarce keyboardPwdId. `add` cere gateway (addType=2) — pensiunea
// are, altfel această alegere ar fi fost greșită.
//
// Pentru schimbarea perioadei există și /v3/keyboardPwd/change, cu
// changeType=2 prin gateway — confirmat de ghidul oficial. Deocamdată tot
// ștergem și creăm din nou, fiindcă parametrii lui exacți nu sunt verificați;
// efectul secundar e că oaspetele primește alt cod când i se schimbă
// perioada. Trecerea la `change` ar păstra codul și merită făcută, dar
// numai după ce îi citim semnătura, nu ghicind-o.

/* Regiunea contului. EU pentru pensiunea asta; documentația arată și
   api.sciener.com pentru contul global. Configurabil, ca mutarea între
   regiuni să nu ceară recompilare. */
const BAZA = Deno.env.get("TTLOCK_API_BASE") || "https://euapi.ttlock.com";

const CLIENT_ID     = Deno.env.get("TTLOCK_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("TTLOCK_CLIENT_SECRET") || "";
const USERNAME      = Deno.env.get("TTLOCK_USERNAME") || "";
const PASSWORD_MD5  = Deno.env.get("TTLOCK_PASSWORD_MD5") || "";

export const configurat = () =>
  Boolean(CLIENT_ID && CLIENT_SECRET && USERNAME && PASSWORD_MD5);

export class EroareTTLock extends Error {
  constructor(mesaj: string, public cod?: number) {
    super(mesaj);
    this.name = "EroareTTLock";
  }
}

/* Tokenul ține 90 de zile, deci îl păstrăm în memorie cât trăiește
   instanța și îl luăm din nou la pornire la rece. NU se salvează în baza
   de date: e o credențială, iar regula proiectului e ca tokenurile să nu
   ajungă acolo. Costul e un apel în plus la fiecare pornire la rece —
   neglijabil față de a avea un token în clar într-un tabel. */
let token: { valoare: string; expiraLa: number } | null = null;

async function cere(cale: string, campuri: Record<string, string | number>) {
  const corp = new URLSearchParams();
  for (const [k, v] of Object.entries(campuri)) corp.set(k, String(v));

  const r = await fetch(`${BAZA}${cale}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corp,
  });

  if (!r.ok) throw new EroareTTLock(`TTLock a răspuns HTTP ${r.status}.`);

  const date = await r.json();
  /* TTLock întoarce 200 și pentru erori: adevărul e în errcode. Un errcode
     lipsă sau 0 înseamnă succes. */
  if (date?.errcode !== undefined && date.errcode !== 0) {
    throw new EroareTTLock(date.errmsg || `Eroare TTLock ${date.errcode}.`, date.errcode);
  }
  return date;
}

async function acces(): Promise<string> {
  if (token && token.expiraLa > Date.now() + 60_000) return token.valoare;

  const r = await fetch(`${BAZA}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username: USERNAME,
      // Documentația cere md5 lowercase, 32 de caractere. Conversia o face
      // administratorul o singură dată; noi nu ținem parola în clar nicăieri.
      password: PASSWORD_MD5,
    }),
  });

  const date = await r.json().catch(() => null);
  if (!r.ok || !date?.access_token) {
    throw new EroareTTLock(
      date?.errmsg || "Autentificarea la TTLock a eșuat. Verifică datele contului.",
      date?.errcode);
  }

  token = {
    valoare: date.access_token,
    expiraLa: Date.now() + (Number(date.expires_in) || 7_776_000) * 1000,
  };
  return token.valoare;
}

export interface Yala { lockId: string; lockName: string; lockAlias?: string }

/* Lista yalelor contului, pentru asocierea cu camerele. Paginăm până se
   termină: o pensiune are zeci de yale, dar codul nu trebuie să presupună. */
export async function listeazaYale(): Promise<Yala[]> {
  const accessToken = await acces();
  const toate: Yala[] = [];

  for (let pagina = 1; pagina <= 20; pagina++) {
    const d = await cere("/v3/lock/list", {
      clientId: CLIENT_ID, accessToken,
      pageNo: pagina, pageSize: 100, date: Date.now(),
    });
    const lista = d?.list || [];
    for (const y of lista) {
      toate.push({
        lockId: String(y.lockId),
        lockName: y.lockName || "",
        lockAlias: y.lockAlias || undefined,
      });
    }
    if (lista.length < 100) break;
  }
  return toate;
}

export interface CodNou { code: string; externalId: string }

/* Creează un cod valabil într-un interval.
 *
 * Codul vine de la apelant — de aceea `add` și nu `get`. Generarea și
 * lungimea lui stau în src/lib/acces.js, unde sunt testate; adaptorul doar
 * îl trimite mai departe.
 *
 * Lungimea: ghidul oficial de integrare spune 4-9 cifre pentru codurile
 * alese de noi (cele generate de sistem sunt 6-9) — încă un motiv pentru
 * `add` în locul lui `get`, dacă se vor coduri scurte. */
export async function creeazaCod(
  lockId: string, de: Date, pana: Date, nume: string, cod: string,
): Promise<CodNou> {
  const accessToken = await acces();

  const d = await cere("/v3/keyboardPwd/add", {
    clientId: CLIENT_ID, accessToken,
    lockId,
    keyboardPwd: cod,
    keyboardPwdName: nume.slice(0, 40),
    startDate: de.getTime(),
    endDate: pana.getTime(),
    // 2 = prin gateway. Fără gateway ar trebui Bluetooth cu SDK-ul din
    // telefon, ceea ce nu e posibil dintr-un server.
    addType: 2,
    date: Date.now(),
  });

  const id = d?.keyboardPwdId;
  if (!id) throw new EroareTTLock("TTLock nu a întors identificatorul codului.");
  return { code: cod, externalId: String(id) };
}

/* Șterge codul de pe yală. Fără asta, un cod ar rămâne valabil după ce
   oaspetele a fost mutat în altă cameră sau rezervarea a fost anulată. */
export async function stergeCod(lockId: string, externalId: string): Promise<void> {
  const accessToken = await acces();
  await cere("/v3/keyboardPwd/delete", {
    clientId: CLIENT_ID, accessToken,
    lockId, keyboardPwdId: externalId,
    deleteType: 2,        // prin gateway, ca la creare
    date: Date.now(),
  });
}
