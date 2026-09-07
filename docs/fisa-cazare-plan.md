# Fișa de cazare — planul de implementare (pașii 1–3)

> **Pentru lucrătorii agentici:** SUB-SKILL OBLIGATORIU: folosește
> superpowers:subagent-driven-development (recomandat) sau
> superpowers:executing-plans ca să duci planul la capăt sarcină cu sarcină.
> Pașii au casete (`- [ ]`) pentru urmărire.

**Scop:** Oaspetele își completează fișa de anunțare a sosirii din guest app,
o semnează cu degetul, iar fișa ajunge într-un rând imuabil în baza de date.

**Arhitectura:** Un tabel nou, `fise_cazare`, cu un rând per persoană cazată,
scris o singură dată prin două funcții `security definer` care trec prin
`guest_poarta` — poarta existentă a guest app-ului, cu plafoanele și
fereastra ei de sejur. Logica pură (ce câmpuri lipsesc, validarea,
transformarea semnăturii în traseu SVG) stă în `src/lib/`, testabilă cu
vitest fără rețea și fără bază.

**Tehnologii:** Postgres/Supabase, React 19, Vite, vitest. Nicio bibliotecă
nouă.

**Spec:** [docs/fisa-cazare.md](fisa-cazare.md) — planul argumentează din el;
citește-le pe amândouă.

**Ce NU e în planul ăsta:** congelarea documentului în Storage (spec §4, B3)
și ecranele de recepție (spec §5). Sunt independente și primesc planuri
proprii. Pașii 1–3 livrează software care merge singur.

## Constrângeri globale

- **Migrațiile se aplică cu `apply_migration` prin MCP-ul Supabase**, pe
  proiectul `suoowrginsliyrbxqeap`. Nume în snake_case românesc, ca în
  istoric: `guest_app_cod_sejur`, `restrange_suprafata_anon`.
- **`schema.sql` se actualizează la fiecare migrație.** E fișierul din care
  se reconstruiește baza pe un proiect gol; o migrație aplicată și nescrisă
  acolo dispare la următoarea reconstrucție.
- **Fiecare funcție nouă primește `revoke ... from public, anon,
  authenticated` ÎNAINTE de `grant`.** În Postgres orice funcție nouă
  primește EXECUTE pentru PUBLIC; o revocare scrisă doar pentru `anon` arată
  corect și nu face nimic. S-a întâmplat deja în proiect, la
  `create_public_booking`.
- **Fiecare funcție are `set search_path = public`.** Într-o funcție
  `security definer`, un search_path venit de la client ar putea îndrepta
  apelul către altă funcție cu același nume.
- **Testele de integrare verifică NUMAI refuzuri.** Regula de aur din
  [tests/integration/guest-cod.integration.test.js:19](../tests/integration/guest-cod.integration.test.js):
  niciun test nu creează și nu modifică date. Comportamentul pozitiv al
  funcțiilor SQL se verifică manual, cu tranzacții anulate (`begin; ...;
  rollback;`), și rezultatul se scrie în spec.
- **Comentariile explică DE CE, nu CE.** Convenția proiectului: fiecare
  decizie neevidentă poartă motivul lângă ea, cu data când s-a luat.
- **Diacriticele în cod sursă: comentariile fără, textul pentru oameni cu.**
  Vezi orice fișier din `src/guest/`.
- **Fișa nu se citește niciodată înapoi** (spec §3). Nicio funcție nu
  întoarce data nașterii, locul nașterii, actul de identitate sau
  semnătura. Dacă un pas pare să ceară asta, e o greșeală în plan — oprește-te
  și întreabă.

## Ce blochează ce

Sarcinile 1–6 nu depind de răspunsul avocatului (spec §6). **Sarcina 7
depinde** — ea introduce semnătura. Dacă răspunsul e „o semnătură desenată
nu ține loc de una pe hârtie", sarcina 7 se înlocuiește cu tipărirea fișei
precompletate, iar restul rămâne neatins.

---

## Structura fișierelor

| Fișier | Răspunde de |
|---|---|
| `schema.sql` (modificat) | tabelul, triggerul, cele două funcții — oglinda migrațiilor |
| `src/lib/fisa.js` (nou) | logica pură: ce câmpuri are fișa, care lipsesc, validarea |
| `src/fisa.test.js` (nou) | testele unitare pentru cele de mai sus |
| `src/lib/semnatura.js` (nou) | puncte de pe canvas → traseu SVG |
| `src/semnatura.test.js` (nou) | testele unitare pentru traseu |
| `src/guest/api.js` (modificat) | două apeluri noi către bază |
| `src/guest/Fisa.jsx` (nou) | fereastra de completare |
| `src/guest/Semnatura.jsx` (nou) | pânza de semnat |
| `src/guest/App.jsx` (modificat) | decide când se ridică fereastra |
| `src/guest/styles.js` (modificat) | stilurile ferestrei și ale pânzei |
| `tests/integration/fisa-cazare.integration.test.js` (nou) | suprafața văzută de un străin |

`fisa.js` și `semnatura.js` stau separat de componente pentru același motiv
pentru care stă `lib/acces.js`: pot fi testate fără DOM, fără rețea și fără
bază, iar regula pe care o apără e cea care se strică tăcut.

---

### Sarcina 1: Tabelul și triggerul de imuabilitate

**Fișiere:**
- Modifică: `schema.sql` (la final, după blocul guest app)
- Creează: `tests/integration/fisa-cazare.integration.test.js`

**Interfețe:**
- Produce: tabelul `fise_cazare` cu coloanele din spec §2; indexul parțial
  `fise_cazare_activa`; triggerul `fise_cazare_imuabila`.
- Consumă: `reservations(id)`, `guests(id)`.

- [ ] **Pasul 1: Scrie testul de integrare care verifică refuzurile**

Creează `tests/integration/fisa-cazare.integration.test.js`:

```javascript
/* Fisa de cazare — suprafata pe care o vede un strain.
 *
 * Tabelul tine date de identitate: serie si numar de act, data si locul
 * nasterii, semnatura. Spec-ul (docs/fisa-cazare.md 3) spune ca fisa se
 * scrie o data si nu se citeste niciodata inapoi. Testele de aici sunt
 * felul in care afirmatia aia ramane adevarata si peste sase luni.
 *
 * REGULA DE AUR, ca la restul testelor de integrare: fiecare caz verifica
 * un REFUZ. Niciun test nu creeaza si nu modifica date.
 *
 * Rulare:  npm run test:integration
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const auConfig = Boolean(URL && ANON_KEY);

describe.skipIf(!auConfig)("Fisa de cazare — vazuta din afara", () => {
  let anon;
  beforeAll(() => {
    anon = createClient(URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("nu se poate citi tabelul", async () => {
    /* Cel mai important test din fisier. O politica permisiva pusa din
       greseala aici ar expune actele de identitate ale tuturor
       oaspetilor, dintr-o cerere. */
    const { data, error } = await anon.from("fise_cazare").select("*").limit(1);
    /* Ori eroare de permisiune, ori zero randuri — dar NICIODATA un rand.
       Scris asa, si nu ca `expect(error).toBeTruthy()`, fiindca PostgREST
       raspunde diferit dupa cum lipseste grantul sau lipseste politica, si
       amandoua sunt refuzuri bune. Ce nu e bun e sa vina continut. */
    expect(data ?? []).toHaveLength(0);
  });

  it("nu se poate scrie in tabel direct", async () => {
    const { error } = await anon.from("fise_cazare").insert({
      id: "test", reservation_id: "inexistent", nume: "X", prenume: "Y",
    });
    expect(error).toBeTruthy();
  });

  it("nu se poate sterge din tabel", async () => {
    const { error } = await anon.from("fise_cazare").delete().eq("id", "inexistent");
    expect(error).toBeTruthy();
  });
});
```

- [ ] **Pasul 2: Rulează testul și verifică-l că pică**

Rulează: `npm run test:integration -- fisa-cazare`
Așteptat: PICĂ. Cererile către un tabel inexistent întorc eroare, deci
testele de insert și delete trec accidental — dar cel de citire trebuie să
fie clar. Notează care trec și de ce; le vei reciti după migrație.

- [ ] **Pasul 3: Aplică migrația**

Cu `apply_migration`, proiect `suoowrginsliyrbxqeap`, nume
`fisa_cazare_tabelul`:

```sql
create table fise_cazare (
  id              text primary key,
  reservation_id  text not null references reservations(id) on delete cascade,
  -- 1 = titularul. Coloana exista de la inceput ca insotitorii sa nu ceara
  -- o migratie de date mai tarziu; prima versiune scrie numai 1.
  ordine          smallint not null default 1,
  guest_id        text references guests(id),

  nume            text not null,
  prenume         text not null,
  data_nasterii   date not null,
  locul_nasterii  text not null,
  -- Doua campuri, nu unul. Coala tiparita scrie `guests.country` si la
  -- „Nationalitate" si la „Tara" (src/features/documente.jsx), deci un
  -- roman cu domiciliul in Germania iese cu „Germania" la nationalitate.
  -- Pe hartie trecea neobservat fiindca receptionerul corecta cu pixul;
  -- intr-un formular completat de oaspete, greseala se salveaza.
  nationalitate   text not null,
  tara            text not null,
  adresa          text not null,
  localitate      text not null,
  scopul          text not null,

  act_tip         text not null check (act_tip in ('ci','pasaport','permis')),
  act_seria       text,
  act_numarul     text not null,

  -- Semnatura oaspetelui SAU numele celui de la receptie care a completat
  -- fisa in locul lui. Un om de optzeci de ani fara smartphone tot trebuie
  -- cazat legal.
  semnatura_svg   text,
  completata_de   text,
  semnat_la       timestamptz not null default now(),
  semnat_ip       text,
  semnat_agent    text,
  -- Versiunea colii cu care s-a randat fisa. Vezi docs/fisa-cazare.md 4:
  -- pana se scrie congelarea in Storage, imuabilitatea randului plus
  -- versiunea asta sunt ce face documentul reproductibil.
  sablon_versiune text not null,

  anulata_la      timestamptz,
  anulata_de      text,
  anulata_motiv   text,

  -- `<>` pe doua teste de null inseamna EXACT UNA. O fisa fara niciun autor
  -- n-ar avea valoare; una cu amandoi ar spune doua povesti despre cine a
  -- completat-o.
  constraint fisa_are_un_autor check (
    (semnatura_svg is not null) <> (completata_de is not null))
);

-- Index partial, nu cheie unica: o fisa anulata trebuie sa lase loc alteia
-- pe acelasi (rezervare, ordine). Cu o cheie obisnuita, prima greseala ar
-- fi blocat locul pentru totdeauna.
create unique index fise_cazare_activa
  on fise_cazare (reservation_id, ordine) where anulata_la is null;
create index fise_cazare_rezervare on fise_cazare (reservation_id);

alter table fise_cazare enable row level security;

-- Nicio politica. Accesul trece exclusiv prin functiile security definer
-- de la sarcinile 2 si 3, care ocolesc RLS pentru propriile query-uri.
-- Acelasi tipar ca la guest_code_attempts.
revoke all on table fise_cazare from public, anon, authenticated;
```

- [ ] **Pasul 4: Rulează din nou testul de integrare**

Rulează: `npm run test:integration -- fisa-cazare`
Așteptat: TREC toate trei. Acum tabelul există, deci refuzurile sunt reale,
nu accidentale — asta e diferența pe care ai notat-o la pasul 2.

- [ ] **Pasul 5: Adaugă triggerul de imuabilitate**

Cu `apply_migration`, nume `fisa_cazare_imuabila`:

```sql
create or replace function fise_cazare_doar_anulare()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  vechi jsonb;
  nou   jsonb;
begin
  if TG_OP = 'DELETE' then
    raise exception 'O fisa de cazare nu se sterge. Anuleaz-o.'
      using errcode = 'check_violation';
  end if;

  if old.anulata_la is not null then
    raise exception 'Fisa e deja anulata si nu se mai modifica.'
      using errcode = 'check_violation';
  end if;

  -- `to_jsonb` minus cele trei coloane, pe ambele randuri. Comparatia
  -- ramane corecta si dupa ce cineva adauga o coloana noua tabelului —
  -- o lista scrisa de mana ar fi uitat-o, si exact aia ar fi devenit
  -- portita.
  vechi := to_jsonb(old) - 'anulata_la' - 'anulata_de' - 'anulata_motiv';
  nou   := to_jsonb(new) - 'anulata_la' - 'anulata_de' - 'anulata_motiv';

  if vechi is distinct from nou then
    raise exception 'O fisa de cazare semnata nu se modifica. Anuleaz-o si scrie alta.'
      using errcode = 'check_violation';
  end if;

  if new.anulata_la is null then
    raise exception 'Singura modificare permisa e anularea.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger fise_cazare_imuabila
  before update or delete on fise_cazare
  for each row execute function fise_cazare_doar_anulare();

revoke execute on function fise_cazare_doar_anulare()
  from public, anon, authenticated;
```

- [ ] **Pasul 6: Verifică triggerul cu o tranzacție anulată**

Cu `execute_sql`, într-o singură cerere. Fiecare `savepoint` izolează un caz,
iar `rollback` la final nu lasă nimic în urmă:

```sql
begin;
-- Datele sunt in 2030, nu „de acum": `reservations` are o constrangere
-- EXCLUDE care interzice suprapunerile pe aceeasi camera, iar o rezervare
-- de test pe zilele curente s-ar fi ciocnit de un oaspete real si ar fi
-- picat inainte sa apuce sa verifice ceva.
insert into reservations (id, room_id, checkin, checkout, status, adults, children)
  select 'test-fisa', id, '2030-01-10', '2030-01-12', 'checkedin', 2, 0
  from rooms limit 1;
insert into fise_cazare (id, reservation_id, nume, prenume, data_nasterii,
  locul_nasterii, nationalitate, tara, adresa, localitate, scopul,
  act_tip, act_numarul, semnatura_svg, sablon_versiune)
values ('f1','test-fisa','Popescu','Ion','1980-01-01','Vaslui','romana',
  'Romania','Str. Test 1','Vaslui','turism','ci','123456','M0 0',  'v1');

savepoint s1;
-- Trebuie sa PICE: modificare pe un camp obisnuit.
update fise_cazare set nume = 'Altul' where id = 'f1';
rollback to s1;

savepoint s2;
-- Trebuie sa PICE: stergere.
delete from fise_cazare where id = 'f1';
rollback to s2;

savepoint s3;
-- Trebuie sa TREACA: anulare curata.
update fise_cazare set anulata_la = now(), anulata_de = 'test',
  anulata_motiv = 'verificare' where id = 'f1';
rollback to s3;

savepoint s4;
-- Trebuie sa PICE: anulare care schimba si altceva pe drum.
update fise_cazare set anulata_la = now(), anulata_de = 'test',
  anulata_motiv = 'x', act_numarul = '999999' where id = 'f1';
rollback to s4;

rollback;
```

Așteptat: s1, s2 și s4 ridică `check_violation`; s3 trece. Rulează-le pe
rând, fiindcă o eroare oprește restul cererii. Scrie rezultatul în
`docs/fisa-cazare.md`, la §2 — proiectul ține verificările lângă decizii.

- [ ] **Pasul 7: Oglindește totul în `schema.sql`**

Adaugă la finalul lui `schema.sql`, după blocul guest app, un titlu
`-- FISA DE CAZARE` și tot DDL-ul de la pașii 3 și 5, cu comentariile lor.
Fără asta, o reconstrucție a bazei pe un proiect gol ar sări peste tabel.

- [ ] **Pasul 8: Commit**

```bash
git add schema.sql tests/integration/fisa-cazare.integration.test.js docs/fisa-cazare.md
git commit -m "Tabelul fiselor de cazare, imuabil dupa semnare"
```

---

### Sarcina 2: Logica pură — ce câmpuri are fișa și care lipsesc

**Fișiere:**
- Creează: `src/lib/fisa.js`
- Creează: `src/fisa.test.js`

**Interfețe:**
- Produce: `CAMPURI` (array de definiții), `ACT_TIPURI`, `campuriLipsa(date)
  -> string[]`, `valideazaFisa(date) -> { ok: boolean, erori: {camp:
  mesaj} }`, `SABLON_VERSIUNE` (string).
- Consumă: nimic. Fără rețea, fără DOM, fără bază.

- [ ] **Pasul 1: Scrie testele care pică**

Creează `src/fisa.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { CAMPURI, ACT_TIPURI, campuriLipsa, valideazaFisa } from "./lib/fisa.js";

const completa = {
  nume: "Popescu", prenume: "Ion",
  dataNasterii: "1980-05-14", loculNasterii: "Vaslui",
  nationalitate: "română", tara: "România",
  adresa: "Str. Ștefan cel Mare 12", localitate: "Vaslui",
  scopul: "turism", actTip: "ci", actSeria: "VS", actNumarul: "123456",
};

describe("campurile fisei", () => {
  it("fiecare camp are cheie, eticheta si daca e obligatoriu", () => {
    for (const c of CAMPURI) {
      expect(typeof c.cheie).toBe("string");
      expect(typeof c.eticheta).toBe("string");
      expect(typeof c.obligatoriu).toBe("boolean");
    }
  });

  /* Campurile sensibile nu se precompleteaza niciodata (spec 3). Regula
     traieste in date, nu in componenta, ca sa poata fi verificata aici. */
  it("campurile sensibile sunt marcate ca atare", () => {
    const sensibile = CAMPURI.filter((c) => c.sensibil).map((c) => c.cheie);
    expect(sensibile).toContain("dataNasterii");
    expect(sensibile).toContain("loculNasterii");
    expect(sensibile).toContain("actTip");
    expect(sensibile).toContain("actSeria");
    expect(sensibile).toContain("actNumarul");
  });

  it("nationalitatea si tara sunt campuri diferite", () => {
    // Coala tiparita le confunda; vezi docs/fisa-cazare.md 1.
    const chei = CAMPURI.map((c) => c.cheie);
    expect(chei).toContain("nationalitate");
    expect(chei).toContain("tara");
  });
});

describe("campuri lipsa", () => {
  it("o fisa completa nu are niciunul", () => {
    expect(campuriLipsa(completa)).toEqual([]);
  });

  it("le numeste pe cele goale", () => {
    const { loculNasterii, actNumarul, ...rest } = completa;
    expect(campuriLipsa(rest).sort()).toEqual(["actNumarul", "loculNasterii"]);
  });

  it("spatiile nu tin loc de valoare", () => {
    expect(campuriLipsa({ ...completa, scopul: "   " })).toEqual(["scopul"]);
  });

  it("seria nu e obligatorie — pasapoartele n-au", () => {
    expect(campuriLipsa({ ...completa, actSeria: "" })).toEqual([]);
  });
});

describe("validarea", () => {
  it("trece o fisa completa", () => {
    expect(valideazaFisa(completa).ok).toBe(true);
  });

  it("refuza o data a nasterii din viitor", () => {
    const r = valideazaFisa({ ...completa, dataNasterii: "2100-01-01" });
    expect(r.ok).toBe(false);
    expect(r.erori.dataNasterii).toBeTruthy();
  });

  it("refuza o varsta imposibila", () => {
    // Peste 120 de ani inseamna aproape sigur o cifra gresita la an.
    const r = valideazaFisa({ ...completa, dataNasterii: "1850-01-01" });
    expect(r.ok).toBe(false);
  });

  it("refuza un tip de act necunoscut", () => {
    const r = valideazaFisa({ ...completa, actTip: "card-bibliotecă" });
    expect(r.ok).toBe(false);
    expect(r.erori.actTip).toBeTruthy();
  });

  it("accepta toate tipurile declarate", () => {
    for (const t of ACT_TIPURI) {
      expect(valideazaFisa({ ...completa, actTip: t.cheie }).ok).toBe(true);
    }
  });

  it("aduna toate erorile, nu se opreste la prima", () => {
    // Un formular care arata o singura greseala pe rand se completeaza de
    // trei ori. Oaspetele e in fata usii.
    const r = valideazaFisa({ ...completa, dataNasterii: "", actTip: "" });
    expect(Object.keys(r.erori).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Pasul 2: Rulează testele și verifică-le că pică**

Rulează: `npx vitest run src/fisa.test.js`
Așteptat: PICĂ, cu „Failed to resolve import ./lib/fisa.js".

- [ ] **Pasul 3: Scrie modulul**

Creează `src/lib/fisa.js`:

```javascript
/* Fisa de anuntare a sosirii — logica pura.
 *
 * Traieste aici, nu in componenta, din acelasi motiv ca lib/acces.js: se
 * poate testa fara DOM, fara retea si fara baza, iar regula pe care o
 * apara e cea care se strica tacut. Un camp obligatoriu scapat dintr-o
 * lista nu da nicio eroare — da o fisa incompleta, aflata la un control.
 *
 * `sensibil` nu e o eticheta decorativa: campurile marcate asa nu se
 * precompleteaza NICIODATA si nu se citesc inapoi (docs/fisa-cazare.md 3).
 * Regula sta in date ca sa poata fi verificata de un test, nu doar promisa
 * intr-un comentariu.
 */

export const ACT_TIPURI = [
  { cheie: "ci",       eticheta: "Carte de identitate" },
  { cheie: "pasaport", eticheta: "Pașaport" },
  { cheie: "permis",   eticheta: "Permis de ședere" },
];

export const CAMPURI = [
  { cheie: "nume",           eticheta: "Nume",              obligatoriu: true,  sensibil: false },
  { cheie: "prenume",        eticheta: "Prenume",           obligatoriu: true,  sensibil: false },
  { cheie: "dataNasterii",   eticheta: "Data nașterii",     obligatoriu: true,  sensibil: true,  tip: "date" },
  { cheie: "loculNasterii",  eticheta: "Locul nașterii",    obligatoriu: true,  sensibil: true },
  /* Doua campuri, nu unul: coala tiparita scrie `guests.country` in
     amandoua, deci un roman cu domiciliul in Germania iesea cu
     „Germania" la nationalitate. */
  { cheie: "nationalitate",  eticheta: "Naționalitate",     obligatoriu: true,  sensibil: false },
  { cheie: "tara",           eticheta: "Țara de domiciliu", obligatoriu: true,  sensibil: false },
  { cheie: "adresa",         eticheta: "Adresa",            obligatoriu: true,  sensibil: false },
  { cheie: "localitate",     eticheta: "Localitatea",       obligatoriu: true,  sensibil: false },
  { cheie: "scopul",         eticheta: "Scopul călătoriei", obligatoriu: true,  sensibil: false },
  { cheie: "actTip",         eticheta: "Act de identitate", obligatoriu: true,  sensibil: true,  tip: "alegere" },
  /* Seria NU e obligatorie: pasapoartele romanesti n-au serie separata,
     doar numar. Ceruta, ar fi blocat orice oaspete strain. */
  { cheie: "actSeria",       eticheta: "Seria",             obligatoriu: false, sensibil: true },
  { cheie: "actNumarul",     eticheta: "Numărul",           obligatoriu: true,  sensibil: true },
];

/* Versiunea colii cu care se randeaza fisa. Se scrie in randul din baza si
   creste cand se schimba aspectul tiparit — vezi docs/fisa-cazare.md 4. */
export const SABLON_VERSIUNE = "fisa-2026-09";

const gol = (v) => v == null || String(v).trim() === "";

export function campuriLipsa(date) {
  return CAMPURI
    .filter((c) => c.obligatoriu && gol(date?.[c.cheie]))
    .map((c) => c.cheie);
}

const ANI_MAXIM = 120;

export function valideazaFisa(date) {
  const erori = {};

  /* Toate erorile deodata, nu prima. Un formular care arata cate una pe
     rand se completeaza de trei ori, iar oaspetele e in fata usii. */
  for (const cheie of campuriLipsa(date)) {
    const c = CAMPURI.find((x) => x.cheie === cheie);
    erori[cheie] = `${c.eticheta} lipsește.`;
  }

  const d = date?.dataNasterii;
  if (!gol(d)) {
    const nasterea = new Date(d);
    if (Number.isNaN(nasterea.getTime())) {
      erori.dataNasterii = "Data nașterii nu e o dată validă.";
    } else if (nasterea > new Date()) {
      erori.dataNasterii = "Data nașterii nu poate fi în viitor.";
    } else {
      const ani = (Date.now() - nasterea.getTime()) / (365.2425 * 24 * 3600 * 1000);
      /* Peste 120 de ani inseamna aproape sigur o cifra gresita la an, nu
         un oaspete centenar. Mesajul spune ce sa verifice, nu ca a gresit. */
      if (ani > ANI_MAXIM) erori.dataNasterii = "Verifică anul nașterii.";
    }
  }

  const tip = date?.actTip;
  if (!gol(tip) && !ACT_TIPURI.some((t) => t.cheie === tip)) {
    erori.actTip = "Alege un tip de act din listă.";
  }

  return { ok: Object.keys(erori).length === 0, erori };
}
```

- [ ] **Pasul 4: Rulează testele și verifică-le că trec**

Rulează: `npx vitest run src/fisa.test.js`
Așteptat: TREC toate.

- [ ] **Pasul 5: Rulează suita întreagă și linterul**

Rulează: `npx vitest run && npx oxlint src/lib/fisa.js src/fisa.test.js`
Așteptat: toate testele trec, niciun avertisment nou.

- [ ] **Pasul 6: Commit**

```bash
git add src/lib/fisa.js src/fisa.test.js
git commit -m "Campurile fisei de cazare si validarea lor"
```

---

### Sarcina 3: Semnătura — puncte de pe pânză în traseu SVG

**Fișiere:**
- Creează: `src/lib/semnatura.js`
- Creează: `src/semnatura.test.js`

**Interfețe:**
- Produce: `traseuSvg(linii) -> string`, `esteGoala(linii) -> boolean`,
  `LATIME_PANZA = 600`, `INALTIME_PANZA = 200`.
- `linii` e `Array<Array<{x: number, y: number}>>` — o listă de trasee, câte
  unul per atingere neîntreruptă.
- Consumă: nimic.

- [ ] **Pasul 1: Scrie testele care pică**

Creează `src/semnatura.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { traseuSvg, esteGoala, LATIME_PANZA } from "./lib/semnatura.js";

describe("traseul semnaturii", () => {
  it("o linie devine M urmat de L-uri", () => {
    const d = traseuSvg([[{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }]]);
    expect(d).toBe("M0 0L10 5L20 0");
  });

  it("doua linii separate raman separate", () => {
    // Semnatura cu litera taiata: doua atingeri, doua bucati de traseu.
    const d = traseuSvg([[{ x: 0, y: 0 }, { x: 5, y: 5 }],
                         [{ x: 9, y: 1 }, { x: 2, y: 8 }]]);
    expect(d).toBe("M0 0L5 5M9 1L2 8");
  });

  it("rotunjeste la o zecimala", () => {
    /* Coordonatele vin din getBoundingClientRect si au 8 zecimale. La ~400
       de puncte, zecimalele alea sunt kilobytes care nu schimba nimic
       vizibil. */
    const d = traseuSvg([[{ x: 1.23456, y: 7.89012 }, { x: 2, y: 3 }]]);
    expect(d).toBe("M1.2 7.9L2 3");
  });

  it("arunca punctele prea apropiate", () => {
    // Degetul tinut pe loc trimite zeci de evenimente in acelasi pixel.
    const d = traseuSvg([[{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }, { x: 30, y: 30 }]]);
    expect(d).toBe("M0 0L30 30");
  });

  it("pastreaza primul punct al fiecarei linii, oricat de scurta", () => {
    // Un punct pe „i" e o singura atingere. Aruncat, semnatura se schimba.
    const d = traseuSvg([[{ x: 4, y: 4 }]]);
    expect(d).toBe("M4 4");
  });

  it("nu se sufoca pe intrari lipsa", () => {
    expect(traseuSvg([])).toBe("");
    expect(traseuSvg(null)).toBe("");
    expect(traseuSvg([[]])).toBe("");
  });
});

describe("panza goala", () => {
  it("fara nicio linie e goala", () => {
    expect(esteGoala([])).toBe(true);
    expect(esteGoala(null)).toBe(true);
  });

  it("o singura atingere scurta nu e semnatura", () => {
    /* Cineva care atinge din greseala panza n-a semnat. Fara pragul asta,
       butonul „Semnez" s-ar debloca dintr-un scroll. */
    expect(esteGoala([[{ x: 5, y: 5 }, { x: 6, y: 6 }]])).toBe(true);
  });

  it("un traseu de lungime rezonabila e semnatura", () => {
    const linie = Array.from({ length: 40 }, (_, i) => ({ x: i * 5, y: 10 }));
    expect(esteGoala([linie])).toBe(false);
  });

  it("panza are latimea declarata", () => {
    expect(LATIME_PANZA).toBeGreaterThan(0);
  });
});
```

- [ ] **Pasul 2: Rulează testele și verifică-le că pică**

Rulează: `npx vitest run src/semnatura.test.js`
Așteptat: PICĂ, cu „Failed to resolve import ./lib/semnatura.js".

- [ ] **Pasul 3: Scrie modulul**

Creează `src/lib/semnatura.js`:

```javascript
/* Semnatura, ca traseu vectorial.
 *
 * DE CE SVG SI NU POZA. Trei motive, in ordinea importantei:
 *   1. sta in randul din baza, deci intra in acelasi backup ca restul
 *      fisei; o poza in Storage ar fi al doilea loc de salvat, iar
 *      backup-ul proiectului e inca pe planul gratuit, cu zero copii;
 *   2. fisa se TIPARESTE la A4, iar un traseu se tipareste curat la orice
 *      marime, spre deosebire de un bitmap de 600 de pixeli latime;
 *   3. ~3 KB in loc de ~25.
 *
 * Coordonatele sunt in sistemul panzei (600x200), nu in pixeli de ecran:
 * altfel aceeasi semnatura ar iesi de alta marime de pe fiecare telefon.
 */

export const LATIME_PANZA = 600;
export const INALTIME_PANZA = 200;

/* Sub doi pixeli intre doua puncte, al doilea nu adauga nimic vizibil.
   Degetul tinut pe loc trimite zeci de evenimente in acelasi loc, iar la
   ~400 de puncte diferenta se vede in marimea randului, nu pe ecran. */
const PRAG_DISTANTA = 2;

/* Sub atat, n-a semnat nimeni — a atins panza din greseala sau a incercat
   sa deruleze pagina. Masurat ca lungime totala a traseului, nu ca numar
   de puncte: un deget lent trimite multe puncte pe o distanta mica. */
const LUNGIME_MINIMA = 60;

const r1 = (n) => Math.round(n * 10) / 10;

export function traseuSvg(linii) {
  if (!Array.isArray(linii)) return "";
  return linii.map((linie) => {
    if (!Array.isArray(linie) || linie.length === 0) return "";
    /* Primul punct se pastreaza mereu, oricat de scurta e linia: un punct
       pe „i" e o singura atingere, iar aruncat ar schimba semnatura. */
    const pastrate = [linie[0]];
    for (const p of linie.slice(1)) {
      const ultim = pastrate[pastrate.length - 1];
      if (Math.hypot(p.x - ultim.x, p.y - ultim.y) >= PRAG_DISTANTA) pastrate.push(p);
    }
    return pastrate
      .map((p, i) => `${i === 0 ? "M" : "L"}${r1(p.x)} ${r1(p.y)}`)
      .join("");
  }).join("");
}

export function esteGoala(linii) {
  if (!Array.isArray(linii) || linii.length === 0) return true;
  let lungime = 0;
  for (const linie of linii) {
    if (!Array.isArray(linie)) continue;
    for (let i = 1; i < linie.length; i++) {
      lungime += Math.hypot(linie[i].x - linie[i - 1].x, linie[i].y - linie[i - 1].y);
    }
  }
  return lungime < LUNGIME_MINIMA;
}
```

- [ ] **Pasul 4: Rulează testele și verifică-le că trec**

Rulează: `npx vitest run src/semnatura.test.js`
Așteptat: TREC toate.

- [ ] **Pasul 5: Commit**

```bash
git add src/lib/semnatura.js src/semnatura.test.js
git commit -m "Semnatura ca traseu SVG, nu ca poza"
```

---

### Sarcina 4: Funcția de precompletare

**Fișiere:**
- Modifică: `schema.sql`
- Modifică: `tests/integration/fisa-cazare.integration.test.js`

**Interfețe:**
- Produce: `guest_fisa_precompletare(p_cod text) returns jsonb`. Întoarce
  `{ok: true, gata: false, date: {nume, prenume, adresa, localitate, tara}}`
  cât timp fișa lipsește; `{ok: true, gata: true}` după ce e semnată;
  `{ok: false, motiv: <motivul din guest_poarta>}` altfel.
- Consumă: `guest_poarta(text)` din sarcina 0 (există deja),
  `fise_cazare` din sarcina 1.

- [ ] **Pasul 1: Adaugă testul de refuz**

Adaugă în `tests/integration/fisa-cazare.integration.test.js`, în același
`describe`:

```javascript
  it("precompletarea refuza un cod inventat", async () => {
    /* Cinci caractere inseamna 916 milioane de variante, iar plafoanele din
       guest_poarta sunt lacatul. Aici se verifica doar ca functia nu
       raspunde cu date la un cod care nu exista. */
    const { data } = await anon.rpc("guest_fisa_precompletare", { p_cod: "zzzzz" });
    expect(data?.ok).not.toBe(true);
    expect(data?.date).toBeUndefined();
  });

  it("precompletarea nu intoarce niciodata campuri sensibile", async () => {
    /* Chiar si pe drumul fericit, functia n-are voie sa scoata actul de
       identitate sau data nasterii — docs/fisa-cazare.md 3. Verificat pe
       forma raspunsului, cu un cod invalid: daca vreodata cineva adauga
       campurile in SELECT, testul de mai jos ramane verde si NU e de
       ajuns singur. Perechea lui e verificarea manuala din pasul 4. */
    const { data } = await anon.rpc("guest_fisa_precompletare", { p_cod: "zzzzz" });
    const text = JSON.stringify(data || {});
    for (const interzis of ["act_numarul", "act_seria", "data_nasterii",
                            "locul_nasterii", "semnatura_svg"]) {
      expect(text).not.toContain(interzis);
    }
  });
```

- [ ] **Pasul 2: Rulează și verifică-le că pică**

Rulează: `npm run test:integration -- fisa-cazare`
Așteptat: PICĂ — funcția nu există încă, `data` e `null`, deci prima
așteptare trece dar a doua e ambiguă. Notează asta; după migrație
răspunsul devine real.

- [ ] **Pasul 3: Aplică migrația**

Cu `apply_migration`, nume `fisa_cazare_precompletare`:

```sql
-- Ce vede oaspetele inainte sa completeze fisa.
--
-- TACE DE INDATA CE FISA E SEMNATA. Ca sa precompleteze, functia trebuie
-- sa intoarca numele si adresa din `guests` — adica un cod scurs le-ar
-- putea citi. Ingustam fereastra in loc s-o lasam deschisa: dupa semnare
-- raspunsul e doar „gata", fara nimic din continut. In practica fereastra
-- tine cateva minute, de la check-in pana la completare.
--
-- Ce NU intoarce, niciodata: data nasterii, locul nasterii, actul de
-- identitate, semnatura. Sunt exact campurile marcate `sensibil` in
-- src/lib/fisa.js si motivul e in docs/fisa-cazare.md 3.
create or replace function guest_fisa_precompletare(p_cod text)
returns jsonb language plpgsql volatile security definer
set search_path = public as $$
declare
  v_p     record;
  v_g     guests;
  v_gata  boolean;
begin
  select * into v_p from guest_poarta(p_cod);
  if v_p.motiv <> 'ok' then
    return jsonb_build_object('ok', false, 'motiv', v_p.motiv);
  end if;

  select exists (
    select 1 from fise_cazare
    where reservation_id = (v_p.rezervare).id
      and ordine = 1 and anulata_la is null
  ) into v_gata;

  if v_gata then
    return jsonb_build_object('ok', true, 'gata', true);
  end if;

  select * into v_g from guests where id = (v_p.rezervare).guest_id;

  return jsonb_build_object(
    'ok', true,
    'gata', false,
    'date', jsonb_build_object(
      'nume',       coalesce(v_g.last_name, ''),
      'prenume',    coalesce(v_g.first_name, ''),
      'adresa',     coalesce(v_g.address, ''),
      'localitate', coalesce(v_g.city, ''),
      'tara',       coalesce(v_g.country, '')
    ));
end $$;

revoke execute on function guest_fisa_precompletare(text)
  from public, anon, authenticated;
grant  execute on function guest_fisa_precompletare(text) to anon, service_role;
```

- [ ] **Pasul 4: Verifică manual drumul fericit, cu tranzacție anulată**

Cu `execute_sql`. Ia un `guest_code` real al unei rezervări **cazate**, cheamă
funcția și citește răspunsul:

```sql
begin;
select guest_fisa_precompletare(
  (select guest_code from reservations where status = 'checkedin' limit 1));
rollback;
```

Așteptat: `ok: true`, `gata: false`, iar `date` conține exact cele cinci
chei — `nume`, `prenume`, `adresa`, `localitate`, `tara`. **Dacă apare orice
altceva, oprește-te**: e fix eșecul pe care testul de la pasul 1 nu-l poate
prinde singur.

- [ ] **Pasul 5: Rulează testele de integrare**

Rulează: `npm run test:integration -- fisa-cazare`
Așteptat: TREC toate cinci.

- [ ] **Pasul 6: Oglindește în `schema.sql` și commit**

```bash
git add schema.sql tests/integration/fisa-cazare.integration.test.js
git commit -m "Precompletarea fisei, care tace dupa semnare"
```

---

### Sarcina 5: Funcția de scriere

**Fișiere:**
- Modifică: `schema.sql`
- Modifică: `tests/integration/fisa-cazare.integration.test.js`

**Interfețe:**
- Produce: `guest_fisa_semneaza(p_cod text, p_date jsonb) returns jsonb`.
  Întoarce `{ok: true}` sau `{ok: false, motiv: text}`. Nu întoarce
  niciodată nimic din ce a scris.
- `p_date` are cheile: `nume, prenume, dataNasterii, loculNasterii,
  nationalitate, tara, adresa, localitate, scopul, actTip, actSeria,
  actNumarul, semnaturaSvg, sablonVersiune`.

- [ ] **Pasul 1: Adaugă testele de refuz**

```javascript
  it("scrierea refuza un cod inventat", async () => {
    const { data } = await anon.rpc("guest_fisa_semneaza", {
      p_cod: "zzzzz",
      p_date: { nume: "X", prenume: "Y" },
    });
    expect(data?.ok).not.toBe(true);
  });

  it("scrierea nu intoarce ce a scris", async () => {
    /* Chiar si la succes, raspunsul are doar `ok`. Un raspuns care ar
       oglindi datele ar fi o cale de citire pe usa din dos. */
    const { data } = await anon.rpc("guest_fisa_semneaza", {
      p_cod: "zzzzz",
      p_date: { nume: "Popescu", actNumarul: "123456" },
    });
    expect(JSON.stringify(data || {})).not.toContain("123456");
  });
```

- [ ] **Pasul 2: Rulează și verifică-le că pică**

Rulează: `npm run test:integration -- fisa-cazare`
Așteptat: PICĂ pentru funcția inexistentă.

- [ ] **Pasul 3: Aplică migrația**

Cu `apply_migration`, nume `fisa_cazare_semnare`:

```sql
-- Scrierea fisei, din link public.
--
-- NU INTOARCE NIMIC DIN CE A SCRIS. Nici la succes. Un raspuns care ar
-- oglinda datele ar fi o cale de citire pe usa din dos, exact ce inchide
-- docs/fisa-cazare.md 3.
--
-- A doua scriere pe aceeasi (rezervare, ordine) e oprita de indexul
-- partial `fise_cazare_activa`, nu de o verificare scrisa aici: doua cereri
-- venite in aceeasi clipa ar fi trecut amandoua de un `if exists`, iar
-- indexul nu se poate pacali asa.
create or replace function guest_fisa_semneaza(p_cod text, p_date jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public as $$
declare
  v_p  record;
  v_ip text;
begin
  select * into v_p from guest_poarta(p_cod);
  if v_p.motiv <> 'ok' then
    return jsonb_build_object('ok', false, 'motiv', v_p.motiv);
  end if;

  begin
    v_ip := nullif(split_part(coalesce(
      current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''
    ), ',', 1), '');
  exception when others then v_ip := null;
  end;

  begin
    insert into fise_cazare (
      id, reservation_id, ordine, guest_id,
      nume, prenume, data_nasterii, locul_nasterii,
      nationalitate, tara, adresa, localitate, scopul,
      act_tip, act_seria, act_numarul,
      semnatura_svg, semnat_ip, semnat_agent, sablon_versiune)
    values (
      'fc-' || encode(extensions.gen_random_bytes(8), 'hex'),
      (v_p.rezervare).id, 1, (v_p.rezervare).guest_id,
      p_date ->> 'nume', p_date ->> 'prenume',
      (p_date ->> 'dataNasterii')::date, p_date ->> 'loculNasterii',
      p_date ->> 'nationalitate', p_date ->> 'tara',
      p_date ->> 'adresa', p_date ->> 'localitate', p_date ->> 'scopul',
      p_date ->> 'actTip', nullif(p_date ->> 'actSeria', ''),
      p_date ->> 'actNumarul',
      p_date ->> 'semnaturaSvg', v_ip,
      left(coalesce(current_setting('request.headers', true)::json
           ->> 'user-agent', ''), 300),
      coalesce(p_date ->> 'sablonVersiune', 'necunoscuta'));
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'motiv', 'deja-completata');
    when not_null_violation or check_violation or invalid_text_representation then
      -- Mesajul nu spune CE camp: cine trimite date stricate din afara
      -- formularului n-are de ce sa afle forma exacta a tabelului.
      return jsonb_build_object('ok', false, 'motiv', 'date-incomplete');
  end;

  return jsonb_build_object('ok', true);
end $$;

revoke execute on function guest_fisa_semneaza(text, jsonb)
  from public, anon, authenticated;
grant  execute on function guest_fisa_semneaza(text, jsonb) to anon, service_role;
```

- [ ] **Pasul 4: Verifică drumul fericit și dubla scriere, cu tranzacție anulată**

```sql
begin;
select guest_fisa_semneaza(
  (select guest_code from reservations where status = 'checkedin' limit 1),
  '{"nume":"Popescu","prenume":"Ion","dataNasterii":"1980-05-14",
    "loculNasterii":"Vaslui","nationalitate":"română","tara":"România",
    "adresa":"Str. Test 1","localitate":"Vaslui","scopul":"turism",
    "actTip":"ci","actSeria":"VS","actNumarul":"123456",
    "semnaturaSvg":"M0 0L10 10","sablonVersiune":"fisa-2026-09"}'::jsonb);
-- A doua oara, acelasi cod: trebuie sa intoarca `deja-completata`.
select guest_fisa_semneaza(
  (select guest_code from reservations where status = 'checkedin' limit 1),
  '{"nume":"Altul","prenume":"Altul","dataNasterii":"1990-01-01",
    "loculNasterii":"X","nationalitate":"x","tara":"x","adresa":"x",
    "localitate":"x","scopul":"x","actTip":"ci","actNumarul":"9",
    "semnaturaSvg":"M0 0L1 1","sablonVersiune":"fisa-2026-09"}'::jsonb);
rollback;
```

Așteptat: primul `{"ok": true}`, al doilea `{"ok": false, "motiv":
"deja-completata"}`. Scrie rezultatul în spec, la §3.

- [ ] **Pasul 5: Rulează testele și fă commit**

```bash
npm run test:integration -- fisa-cazare
git add schema.sql tests/integration/fisa-cazare.integration.test.js docs/fisa-cazare.md
git commit -m "Scrierea fisei din link public, o singura data"
```

---

### Sarcina 6: Cele două apeluri din guest app

**Fișiere:**
- Modifică: `src/guest/api.js:37-39`

**Interfețe:**
- Produce: `citesteFisa(cod)` și `trimiteFisa(cod, date)`, pe tiparul
  funcțiilor existente din fișier.
- Consumă: funcțiile SQL din sarcinile 4 și 5.

- [ ] **Pasul 1: Adaugă cele două apeluri**

În `src/guest/api.js`, după linia 39:

```javascript
/* Fisa de cazare. Doua apeluri, pe acelasi `rpc` ca restul.
 *
 * `citesteFisa` intoarce `{ok, gata, date}` — `gata: true` inseamna ca fisa
 * e deja semnata SI ca nu mai vine nimic din continutul ei. Nu e o
 * scapare, e regula: docs/fisa-cazare.md 3. */
export const citesteFisa = (cod) => rpc("guest_fisa_precompletare", { p_cod: cod });
export const trimiteFisa = (cod, date) =>
  rpc("guest_fisa_semneaza", { p_cod: cod, p_date: date });
```

- [ ] **Pasul 2: Verifică build-ul**

Rulează: `npm run build:guest`
Așteptat: build curat.

- [ ] **Pasul 3: Commit**

```bash
git add src/guest/api.js
git commit -m "Cele doua apeluri ale fisei, in api-ul guest app-ului"
```

---

### Sarcina 7: Pânza de semnat

**Depinde de răspunsul avocatului** (spec §6). Nu porni fără el.

**Fișiere:**
- Creează: `src/guest/Semnatura.jsx`
- Modifică: `src/guest/styles.js`
- Modifică: `src/guest-stiluri.test.js:66`

**Interfețe:**
- Produce: `<Semnatura valoare={linii} onSchimbare={(linii) => {}} />`, unde
  `linii` e forma cerută de `traseuSvg` din sarcina 3.
- Consumă: `LATIME_PANZA`, `INALTIME_PANZA`, `esteGoala` din
  `src/lib/semnatura.js`.

- [ ] **Pasul 1: Scrie componenta**

Creează `src/guest/Semnatura.jsx`:

```jsx
/* Panza de semnat.
 *
 * Pointer events, nu touch/mouse separat: acelasi cod pentru deget, stylus
 * si mouse, iar `setPointerCapture` tine linia si daca degetul iese din
 * panza — fara el, o semnatura care depaseste marginea se rupe in doua.
 *
 * `touch-action: none` in stiluri NU e optional: fara el, browserul
 * interpreteaza tragerea ca derulare a paginii si nu ajunge niciun punct
 * la componenta.
 */
import { useRef, useState } from "react";
import { LATIME_PANZA, INALTIME_PANZA } from "../lib/semnatura.js";

export default function Semnatura({ valoare, onSchimbare }) {
  const svgRef = useRef(null);
  const [deseneaza, setDeseneaza] = useState(false);
  const linii = Array.isArray(valoare) ? valoare : [];

  /* Coordonatele se traduc in sistemul panzei (600x200), nu se iau in
     pixeli de ecran: altfel aceeasi semnatura ar iesi de alta marime de pe
     fiecare telefon, si ar arata altfel pe fisa tiparita. */
  const punct = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * LATIME_PANZA,
      y: ((e.clientY - r.top) / r.height) * INALTIME_PANZA,
    };
  };

  const incepe = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDeseneaza(true);
    onSchimbare([...linii, [punct(e)]]);
  };

  const continua = (e) => {
    if (!deseneaza) return;
    const ultima = linii[linii.length - 1] || [];
    onSchimbare([...linii.slice(0, -1), [...ultima, punct(e)]]);
  };

  const termina = () => setDeseneaza(false);

  return (
    <div className="g-semnatura">
      <svg ref={svgRef} className="g-semnatura-panza"
        viewBox={`0 0 ${LATIME_PANZA} ${INALTIME_PANZA}`}
        onPointerDown={incepe} onPointerMove={continua}
        onPointerUp={termina} onPointerCancel={termina}
        role="img" aria-label="Zona de semnătură">
        {linii.map((linie, i) => (
          <polyline key={i} className="g-semnatura-linie"
            points={linie.map((p) => `${p.x},${p.y}`).join(" ")} />
        ))}
      </svg>
      <div className="g-semnatura-jos">
        <span>Semnează cu degetul</span>
        <button type="button" className="g-legatura"
          onClick={() => onSchimbare([])}>Șterge</button>
      </div>
    </div>
  );
}
```

- [ ] **Pasul 2: Adaugă stilurile**

În `src/guest/styles.js`, lângă celelalte reguli de formular:

```css
/* `touch-action:none` NU e podoaba: fara el browserul ia tragerea drept
   derulare a paginii si niciun punct nu ajunge la componenta. Prins pe
   telefon, unde panza parea complet moarta. */
.g-semnatura{ margin:10px 0 0; }
.g-semnatura-panza{
  display:block; width:100%; height:auto; aspect-ratio:3/1;
  background:var(--g-card); border:1px solid var(--g-line);
  border-radius:10px; touch-action:none; cursor:crosshair;
}
.g-semnatura-linie{
  fill:none; stroke:var(--g-text); stroke-width:3;
  stroke-linecap:round; stroke-linejoin:round;
}
.g-semnatura-jos{
  display:flex; justify-content:space-between; align-items:center;
  margin-top:6px; font-size:12.5px; color:var(--g-muted);
}
```

- [ ] **Pasul 3: Adaugă regulile în testul de stiluri**

În `src/guest-stiluri.test.js`, în lista de la linia 66, adaugă
`".g-semnatura"` și `".g-semnatura-panza"`.

- [ ] **Pasul 4: Rulează testele și build-ul**

Rulează: `npx vitest run && npm run build:guest`
Așteptat: toate trec, build curat.

- [ ] **Pasul 5: Verifică pânza în browser**

Pornește `dev:guest`, apoi — fiindcă pagina cere un cod de sejur real —
folosește tiparul cu `fetch` înlocuit local, cel din verificarea ferestrei
„Important": încarcă pagina fără fragment, pune un `window.fetch` care
răspunde cu date inventate, apoi setează `location.hash`. Niciun apel nu
pleacă spre Supabase și niciun cod real nu apare nicăieri.

Verifică: linia urmează degetul; iese din panză și revine fără să se rupă;
„Șterge" golește; pagina NU derulează în timpul desenării.

- [ ] **Pasul 6: Commit**

```bash
git add src/guest/Semnatura.jsx src/guest/styles.js src/guest-stiluri.test.js
git commit -m "Panza de semnat din pagina oaspetelui"
```

---

### Sarcina 8: Fereastra de completare

**Fișiere:**
- Creează: `src/guest/Fisa.jsx`
- Modifică: `src/guest/App.jsx` (în `App()`, lângă celelalte `useState`)
- Modifică: `src/guest/styles.js`
- Modifică: `src/guest-stiluri.test.js`

**Interfețe:**
- Consumă: `CAMPURI`, `ACT_TIPURI`, `valideazaFisa`, `SABLON_VERSIUNE` din
  `src/lib/fisa.js`; `traseuSvg`, `esteGoala` din `src/lib/semnatura.js`;
  `citesteFisa`, `trimiteFisa` din `src/guest/api.js`; `<Semnatura>` din
  sarcina 7.
- Produce: `<Fisa cod={cod} onGata={() => {}} />`.

- [ ] **Pasul 1: Scrie componenta**

Creează `src/guest/Fisa.jsx`:

```jsx
/* Fisa de cazare, completata de oaspete.
 *
 * CE RAMANE LA VEDERE IN SPATELE FERESTREI: usa, wi-fi-ul si numarul
 * asistentei (docs/fisa-cazare.md 0). Butonul de deschidere e IN guest
 * app, iar un oaspete ajuns la miezul noptii cu semnal prost, blocat de un
 * formular, n-ar mai deschide usa de pe telefon. De aceea fereastra nu e
 * un ecran care inlocuieste pagina, ci un panou peste ea.
 *
 * Campurile marcate `sensibil` in lib/fisa.js pornesc GOALE chiar daca
 * oaspetele a mai stat la noi. Nu e o scapare a precompletarii: sunt exact
 * campurile pe care am hotarat sa nu le citim inapoi.
 */
import { useEffect, useState } from "react";
import { CAMPURI, ACT_TIPURI, valideazaFisa, SABLON_VERSIUNE } from "../lib/fisa.js";
import { traseuSvg, esteGoala } from "../lib/semnatura.js";
import { citesteFisa, trimiteFisa } from "./api.js";
import Semnatura from "./Semnatura.jsx";

export default function Fisa({ cod, onGata }) {
  const [date, setDate] = useState({});
  const [linii, setLinii] = useState([]);
  const [erori, setErori] = useState({});
  const [stare, setStare] = useState("incarca");
  const [mesaj, setMesaj] = useState("");

  useEffect(() => {
    let viu = true;
    citesteFisa(cod)
      .then((r) => {
        if (!viu) return;
        if (r?.gata) { onGata(); return; }
        /* Precompletarea aduce doar campurile nesensibile — vezi
           guest_fisa_precompletare. Restul raman goale, deliberat. */
        setDate(r?.date || {});
        setStare("gata");
      })
      .catch(() => { if (viu) setStare("gata"); });
    return () => { viu = false; };
  }, [cod, onGata]);

  const pune = (cheie, v) => setDate((d) => ({ ...d, [cheie]: v }));

  async function trimite() {
    const v = valideazaFisa(date);
    const toate = { ...v.erori };
    if (esteGoala(linii)) toate.semnatura = "Semnează în chenarul de mai sus.";
    setErori(toate);
    if (Object.keys(toate).length > 0) return;

    setStare("trimit");
    const r = await trimiteFisa(cod, {
      ...date,
      semnaturaSvg: traseuSvg(linii),
      sablonVersiune: SABLON_VERSIUNE,
    });
    if (r?.ok) { onGata(); return; }
    setStare("gata");
    setMesaj(r?.motiv === "deja-completata"
      ? "Fișa e deja completată."
      : "Nu am putut trimite fișa. Mai încearcă o dată.");
  }

  if (stare === "incarca") return null;

  return (
    <div className="g-fisa-fundal" role="dialog" aria-modal="true"
      aria-labelledby="fisa-titlu">
      <div className="g-fisa">
        <h2 id="fisa-titlu">Fișa de cazare</h2>
        <p className="g-fisa-intro">
          E obligatorie la cazare. O completezi o dată, aici.
        </p>

        {CAMPURI.map((c) => (
          <label key={c.cheie} className="g-camp">
            <span className="g-camp-eticheta">
              {c.eticheta}{!c.obligatoriu && <em> (dacă are)</em>}
            </span>
            {c.tip === "alegere" ? (
              <select value={date[c.cheie] || ""}
                onChange={(e) => pune(c.cheie, e.target.value)}>
                <option value="">Alege…</option>
                {ACT_TIPURI.map((t) => (
                  <option key={t.cheie} value={t.cheie}>{t.eticheta}</option>
                ))}
              </select>
            ) : (
              <input type={c.tip === "date" ? "date" : "text"}
                value={date[c.cheie] || ""}
                onChange={(e) => pune(c.cheie, e.target.value)} />
            )}
            {erori[c.cheie] && <span className="g-camp-eroare">{erori[c.cheie]}</span>}
          </label>
        ))}

        <Semnatura valoare={linii} onSchimbare={setLinii} />
        {erori.semnatura && <span className="g-camp-eroare">{erori.semnatura}</span>}

        {mesaj && <p className="g-fisa-mesaj" role="alert">{mesaj}</p>}

        <button type="button" className="g-usa" disabled={stare === "trimit"}
          onClick={trimite}>
          {stare === "trimit" ? "Trimit…" : "Semnez și trimit"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Pasul 2: Ridică fereastra din `App.jsx`**

În `src/guest/App.jsx`, în `App()`, lângă celelalte `useState`:

```jsx
  /* Fisa se cere o singura data per sejur. `null` = inca nu stim, true =
     completata. Cat timp nu stim, fereastra nu apare — un panou care
     clipeste la fiecare incarcare ar fi mai rau decat unul care intarzie
     o clipa. */
  const [fisaGata, setFisaGata] = useState(null);

  /* useCallback, si NU o functie scrisa in JSX. `onGata` intra in lista de
     dependente a efectului din Fisa.jsx; scrisa inline, ar fi alta functie
     la fiecare randare a lui App — iar App se re-randeaza de fiecare data
     cand oaspetele deschide un panou. Rezultatul ar fi fost o cerere noua
     catre baza la fiecare apasare pe „Wi-Fi". */
  const fisaCompletata = useCallback(() => setFisaGata(true), []);
```

Adaugă `useCallback` la importul din React, de pe prima linie a fișierului.

În `return`-ul componentei, imediat după `<div className="g-pagina">`:

```jsx
      {stare === "gata" && fisaGata !== true && (
        <Fisa cod={cod} onGata={fisaCompletata} />
      )}
```

plus importul componentei, lângă celelalte:

```jsx
import Fisa from "./Fisa.jsx";
```

- [ ] **Pasul 3: Adaugă stilurile**

În `src/guest/styles.js`:

```css
/* Fundalul acopera pagina, dar NU e opac: docs/fisa-cazare.md 0 cere ca
   usa, wi-fi-ul si numarul asistentei sa ramana la vedere. Panoul se
   opreste inainte de marginea de jos, iar fundalul lasa sa se vada ce e
   dedesubt. */
.g-fisa-fundal{
  position:fixed; inset:0; z-index:40; overflow-y:auto;
  background:rgba(34,34,31,.55); padding:16px;
  display:flex; align-items:flex-start; justify-content:center;
}
.g-fisa{
  width:100%; max-width:480px; margin:auto;
  background:var(--g-card); border-radius:var(--g-radius);
  padding:20px 18px calc(20px + env(safe-area-inset-bottom));
}
.g-fisa h2{ margin:0 0 4px; }
.g-fisa-intro{ margin:0 0 14px; font-size:13.5px; color:var(--g-muted); }
.g-camp{ display:block; margin-bottom:11px; }
.g-camp-eticheta{ display:block; font-size:13px; margin-bottom:4px; }
.g-camp-eticheta em{ color:var(--g-faint); font-style:normal; }
.g-camp input, .g-camp select{
  width:100%; font:inherit; font-size:16px;   /* 16px: sub atat, iOS
     mareste pagina la focus si oaspetele ramane cu ea marita */
  padding:9px 11px; border:1px solid var(--g-line); border-radius:9px;
  background:#fff; color:var(--g-text);
}
.g-camp-eroare{ display:block; margin-top:4px; font-size:12.5px; color:#a13b2f; }
.g-fisa-mesaj{ margin:10px 0 0; font-size:13.5px; color:#a13b2f; }
```

- [ ] **Pasul 4: Adaugă regulile în testul de stiluri**

În `src/guest-stiluri.test.js`, la lista de la linia 66, adaugă
`".g-fisa"`, `".g-fisa-fundal"` și `".g-camp"`.

- [ ] **Pasul 5: Rulează testele și build-ul**

Rulează: `npx vitest run && npm run build:guest && npx oxlint src/guest/`
Așteptat: toate trec, build curat, niciun avertisment nou.

- [ ] **Pasul 6: Verifică fereastra în browser**

Cu același tipar de `fetch` înlocuit local. Adaugă în stub și răspunsurile
pentru `guest_fisa_precompletare` (`{ok:true, gata:false, date:{...}}`) și
`guest_fisa_semneaza` (`{ok:true}`).

Verifică, pe ecran de telefon (375px):
- fereastra apare peste pagină, iar butonul ușii **rămâne accesibil**;
- câmpurile sensibile pornesc goale, cele nesensibile precompletate;
- „Semnez și trimit" cu câmpuri goale arată **toate** erorile deodată, nu una;
- semnătura goală dă eroarea ei;
- după un răspuns `{ok:true}`, fereastra dispare și nu revine.

- [ ] **Pasul 7: Commit**

```bash
git add src/guest/Fisa.jsx src/guest/App.jsx src/guest/styles.js src/guest-stiluri.test.js
git commit -m "Fereastra fisei de cazare in pagina oaspetelui"
```

---

## După plan

Rămân, cu planurile lor:

- **Congelarea documentului** (spec §4, B3) — recepția randează fișa
  semnată cu `ArrivalSheet` și `generatePdfBlob` și încarcă PDF-ul în
  Storage.
- **Ecranele de recepție** (spec §5) — indicatorul pe rezervare,
  completarea în locul oaspetelui, anularea.

Al doilea e mai urgent decât pare: din prima zi în care un oaspete nu poate
folosi linkul, recepția are nevoie de o cale. Merită făcut înaintea
congelării.
