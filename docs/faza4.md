# Faza 4 — igienă continuă

Continuarea planului din `docs/audit-2026-09.md` (§3 D, §4 Faza 4). Auditul
o vede „în paralel, câte puțin": nu o fază cu termen, ci lucruri de făcut
când se atinge oricum fișierul. Aici stau **designul** ales pentru fiecare
punct și **starea** implementării.

| # | Punct din audit | Stare |
|---|---|---|
| 1 | D3 — README real | **făcut**, 14 septembrie 2026 (§1) |
| 2 | D4 — index pentru `docs/` | **făcut**, 14 septembrie 2026 (§2) |
| 3 | D6 — `@ts-check` + JSDoc pe `src/lib/` și `src/data/` | de făcut |
| 4 | D1 — spargerea fișierelor mari (`rezervari.jsx`, `facturare.jsx`) | de făcut, câte unul |
| 5 | D2 — stilurile inline → clase | de făcut, treptat |

D5 (comentariile lungi) nu e o sarcină, e o regulă de păstrat; e scrisă acum
și în README, la „Convenții".

---

## 1. README real (D3)

### 1.1 Ce era

Template-ul Vite („React + Vite", cele două pluginuri oficiale). Nimic
despre proiect: cine vine după trebuia să deducă din `package.json` și din
configurile Vite că sunt trei aplicații.

### 1.2 Ce e acum

`README.md`: cele trei aplicații (adresă, intrare, build), împărțirea
codului (`lib`/`data`/`features`/`ui`, schema și migrațiile, funcțiile edge,
scripturile, testele), comenzile, ce face CI-ul și backup-ul, variabilele de
mediu (numele și rolul, niciodată valorile) și convențiile care nu se văd
din cod. Fiecare afirmație vine din repo-ul de azi: `package.json`,
configurile Vite, workflow-urile, `grep` pe `import.meta.env` și
`Deno.env.get`, capul fiecărei funcții edge.

### 1.3 Ce NU s-a schimbat

- Nimic în cod. Convențiile scrise sunt cele deja practicate, nu reguli noi.

---

## 2. Indexul documentației (D4)

### 2.1 Ce era

Unsprezece documente bune, cu date și verdicte, dar fără intrare: ca să
afli ce există trebuia să le deschizi pe rând.

### 2.2 Ce e acum

`docs/README.md`: o linie pe document — ce e, când a fost scris, ce a rămas
din el (închis, implementat, doar plan). Documentele noi se adaugă acolo în
același commit; `README.md` trimite la el.

### 2.3 Ce NU s-a schimbat

- Documentele în sine. Cele două PDF-uri din `docs/` nu sunt în git și nu
  apar în index.
