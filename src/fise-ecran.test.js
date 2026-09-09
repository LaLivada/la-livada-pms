/* Un test de RANDARE, singurul din repo, si cu motiv.
 *
 * Restul testelor de aici sunt pe logica pura, fiindca acolo sta ce se poate
 * strica in tacere. Ecranul „Fise" e altceva: l-am scris fara sa-l pot
 * deschide vreodata — aplicatia cere autentificare, iar eu nu introduc
 * parole. Fara testul asta, singura dovada ca nu crapa ar fi ca a compilat.
 *
 * Deci nu verifica cum ARATA (aia se vede cu ochii, si o face Ovidiu), ci
 * doar ca se randeaza fara sa arunce, cu datele in forma reala intoarsa de
 * `fise_cazare_lista` — coloanele au fost citite din endpoint, nu ghicite.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

/* Stratul de date si clientul Supabase, inlocuite: testul nu are voie sa
   atinga reteaua. `../supabase.js` ar cere si cheile din .env la import. */
vi.mock("./supabase.js", () => ({ supabase: {} }));

const toateFisele = vi.fn();
const fisaIntreaga = vi.fn();
vi.mock("./data/fise.js", () => ({
  toateFisele: (...a) => toateFisele(...a),
  fisaIntreaga: (...a) => fisaIntreaga(...a),
  fisaActiva: vi.fn(), fisePentruRezervare: vi.fn(), rezervariCuFisa: vi.fn(),
  areFisaActiva: vi.fn(), scrieFisa: vi.fn(), anuleaza: vi.fn(),
}));

const { FiseView } = await import("./features/fise.jsx");

/* Forma exacta a randului din `fise_cazare_lista` — fara `semnatura_svg`,
   cu `are_semnatura` in loc. */
const FISA = {
  id: "fc-1", reservation_id: "rez-1", ordine: 1,
  nume: "Grumeza", prenume: "Razvan",
  semnat_la: "2026-09-08T07:21:28Z", completata_de: null,
  anulata_la: null, anulata_de: null, anulata_motiv: null,
  fara_semnatura_motiv: null, are_semnatura: true,
};
const CORE = { rooms: [{ id: "r1001", name: "1001", type: "tiny" }] };
const REZ = [{ id: "rez-1", roomId: "r1001", checkin: "2026-09-09T11:00:00Z", checkout: "2026-09-10T08:00:00Z" }];

async function randeaza(fise) {
  toateFisele.mockResolvedValue(fise);
  const gazda = document.createElement("div");
  document.body.appendChild(gazda);
  await act(async () => {
    createRoot(gazda).render(React.createElement(FiseView, { core: CORE, reservations: REZ }));
  });
  return gazda;
}

describe("FiseView", () => {
  beforeEach(() => { vi.clearAllMocks(); document.body.replaceChildren(); });

  it("arata fisa cu numele, camera si perioada rezervarii ei", async () => {
    const g = await randeaza([FISA]);
    expect(g.textContent).toContain("Grumeza Razvan");
    expect(g.textContent).toContain("1001");
    expect(g.textContent).toContain("1 fișe");
  });

  it("da butonul de anulare doar pe fisele inca active", async () => {
    const activa = await randeaza([FISA]);
    expect(activa.textContent).toContain("Anulează");

    const g = await randeaza([{
      ...FISA, anulata_la: "2026-09-09T06:00:00Z",
      anulata_de: "Ovidiu", anulata_motiv: "serie greșită",
    }]);
    /* Anulata ramane in lista — un document legal care dispare fara urma e
       mai rau decat unul gresit — dar fara buton: triggerul din baza refuza
       a doua anulare, deci butonul ar fi dat doar eroare. */
    expect(g.textContent).toContain("Grumeza Razvan");
    expect(g.textContent).toContain("serie greșită");
    expect(g.textContent).not.toContain("Anulează");
  });

  it("spune cand lipseste semnatura, cu motivul", async () => {
    const g = await randeaza([{
      ...FISA, are_semnatura: false, completata_de: "Razvan",
      fara_semnatura_motiv: "oaspete fără telefon",
    }]);
    expect(g.textContent).toContain("Fără semnătură");
    expect(g.textContent).toContain("oaspete fără telefon");
    expect(g.textContent).toContain("de Razvan");
  });

  it("nu crapa pe o fisa a carei rezervare nu e in felia incarcata", async () => {
    const g = await randeaza([{ ...FISA, reservation_id: "rez-necunoscuta" }]);
    expect(g.textContent).toContain("Grumeza Razvan");
    expect(g.textContent).toContain("rezervare care nu mai e pe ecran");
  });

  it("arata starea goala cand nu exista nicio fisa", async () => {
    const g = await randeaza([]);
    expect(g.textContent).toContain("Nicio fișă");
  });
});
