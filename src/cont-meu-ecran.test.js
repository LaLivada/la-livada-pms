/* „Useri și drepturi" randat cu componenta reala: contul propriu sta sus,
 * pentru oricine (parola, drepturi, iesirea din cont), iar lista echipei
 * doar pentru admin. Ce s-ar strica tacut: o camerista ramasa fara buton de
 * iesire (butonul de cont din antet nu mai exista), sau lista echipei ceruta
 * bazei de un cont pe care RLS il refuza — ecranul ar arata o eroare in loc
 * de contul lui.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

vi.mock("./supabase.js", () => ({ supabase: {} }));
const listeazaPersonal = vi.fn();
vi.mock("./data/personal.js", () => ({
  listeazaPersonal: (...a) => listeazaPersonal(...a),
  sesiuneCurenta: vi.fn(), autentifica: vi.fn(), deconecteaza: vi.fn(), schimbaParola: vi.fn(),
  laSchimbareSesiune: vi.fn(), membruPersonal: vi.fn(), adaugaMembru: vi.fn(), actualizeazaMembru: vi.fn(),
  stergeMembru: vi.fn(), permisiunileMele: vi.fn(), personalCuPermisiuni: vi.fn(),
  acordaPermisiune: vi.fn(), retragePermisiune: vi.fn(),
}));

const { UsersView } = await import("./features/setari.jsx");

const montate = [];
async function deschide(user, onLogout = () => {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  montate.push({ root, host });
  await act(async () => { root.render(React.createElement(UsersView, { user, onLogout })); });
  return host;
}
afterEach(async () => {
  await act(async () => { montate.forEach(({ root }) => root.unmount()); });
  montate.forEach(({ host }) => host.remove());
  montate.length = 0;
  listeazaPersonal.mockReset();
});
const butoane = (host) => [...host.querySelectorAll("button")].map((b) => b.textContent.trim());
const apasa = async (host, text) => {
  const b = [...host.querySelectorAll("button")].find((x) => x.textContent.trim() === text);
  await act(async () => { b.click(); });
};

describe("Useri și drepturi", () => {
  it("camerista: contul ei, cu iesirea din cont; lista echipei nici nu e ceruta", async () => {
    const onLogout = vi.fn();
    const host = await deschide({ id: "u2", name: "Ana Pop", role: "housekeeping" }, onLogout);
    expect(host.querySelector(".cont-meu .pname").textContent).toBe("Ana Pop");
    expect(host.querySelector(".cont-meu .role-tag").textContent).toBe("Cameristă");
    expect(butoane(host).slice(0, 2)).toEqual(["Schimbă parola", "Ieși din cont"]);
    expect(butoane(host)).toEqual(expect.arrayContaining(["Nouă", "Actuală", "Ca sistemul", "Deschis", "Întunecat"]));
    expect(butoane(host)).not.toContain("User nou");
    expect(listeazaPersonal).not.toHaveBeenCalled();
    await apasa(host, "Ieși din cont");
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("formularul de parola e pliat si se desface din buton", async () => {
    const host = await deschide({ id: "u3", name: "Ion Radu", role: "receptionist" });
    expect(host.querySelectorAll('input[type="password"]').length).toBe(0);
    await apasa(host, "Schimbă parola");
    expect(host.querySelectorAll('input[type="password"]').length).toBe(2);
    expect(butoane(host)).toContain("Salvează parola");
  });

  it("admin: contul lui sus, echipa dedesubt, cu „User nou”", async () => {
    listeazaPersonal.mockResolvedValue([
      { user_id: "u1", name: "Ovidiu", role: "admin" },
      { user_id: "u2", name: "Ana Pop", role: "housekeeping" },
    ]);
    const host = await deschide({ id: "u1", name: "Ovidiu", role: "admin" });
    expect(listeazaPersonal).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".cont-meu .pname").textContent).toBe("Ovidiu");
    expect([...host.querySelectorAll(".list-row .primary")].map((e) => e.textContent)).toEqual(["Ovidiu", "Ana Pop"]);
    expect(butoane(host).slice(0, 2)).toEqual(["Schimbă parola", "Ieși din cont"]);
    expect(butoane(host)).toContain("User nou");
    const pozitie = host.querySelector(".cont-meu").compareDocumentPosition(host.querySelector(".list-row"));
    expect(pozitie & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
