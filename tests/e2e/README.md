# Teste end-to-end

Parcurg fluxul complet prin interfață, ca un utilizator real:
autentificare → client → rezervare → check-in → folio → factură →
încasare → check-out.

Sunt singurele teste care verifică faptul că straturile chiar se leagă
între ele. Testele unitare și cele de proprietate (`npm test`) verifică
bucăți de logică; cele de integrare (`npm run test:integration`) verifică
regulile de acces din bază.

## De ce nu rulează pe producție

Fluxul emite o factură. Emiterea consumă un număr din seria de facturare,
iar acel număr **nu se mai poate elibera**:

- numerotarea trebuie să rămână strict secvențială, fără goluri;
- o factură emisă nu poate fi ștearsă — nu există politică de `delete` pe
  `invoices`, intenționat (vezi `schema.sql`);
- singura corecție e stornarea, care consumă încă un număr.

Deci o singură rulare greșită lasă în contabilitate două documente
fiscale fantomă, permanent. De aceea testele refuză să pornească dacă
`VITE_SUPABASE_URL` arată către proiectul de producție.

Verificarea stă în `protectie-productie.js`. Poate fi ocolită cu
`E2E_PERMITE_PRODUCTIE=da-stiu-ce-fac`, dar nu există niciun motiv bun
pentru asta.

## Ce poate rula oricine, fără configurare

```bash
npm run test:e2e
```

Testele din blocul „Verificări fără scriere" nu ating baza de date și
rulează întotdeauna: randarea ecranului de autentificare, traducerea
mesajului de eroare la credențiale greșite, absența scroll-ului
orizontal pe ecran de telefon. Restul se sar, cu motivul afișat.

## Configurarea pentru fluxul complet

Ai nevoie de un proiect Supabase **separat** de producție. Două
variante:

**a) Un branch Supabase** (efemer, se șterge după)
```bash
supabase branches create e2e
```

**b) Un proiect nou**, pe care rulezi `schema.sql` de la zero — util și
ca test că fișierul chiar reconstruiește tot.

Apoi creezi în el un cont de admin (Dashboard → Authentication → Add
user) și un rând corespunzător în tabelul `staff` cu `role = 'admin'`.

Variabilele necesare:

```bash
VITE_SUPABASE_URL=https://<proiectul-de-test>.supabase.co
VITE_SUPABASE_ANON_KEY=<cheia publicabilă a proiectului de test>
E2E_EMAIL=<contul de test>
E2E_PASSWORD=<parola contului de test>
```

Nu le pune în `.env` (acela e pentru dezvoltare, cu proiectul real).
Folosește un fișier separat, negestionat de git:

```bash
# PowerShell
$env:E2E_EMAIL="..."; $env:E2E_PASSWORD="..."; npm run test:e2e
```

## Datele lăsate în urmă

Fiecare rulare marchează ce creează cu `E2E-TEST` în nume (vezi
`numeUnic`). Dacă o rulare se întrerupe la mijloc, datele rămân — se
găsesc căutând după acel marcaj și se șterg din interfață sau din SQL
Editor. Pe o bază de test, cel mai simplu e s-o refaci de la zero.

## Selectorii

Testele caută elementele după rol și text vizibil (`getByRole`,
`getByPlaceholder`), nu după clase CSS. Un test care se agață de clase se
strică la prima schimbare de stil, deși aplicația funcționează perfect.
Când un test pică pentru că nu găsește un element, verifică întâi dacă
s-a schimbat textul din interfață.
