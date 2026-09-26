/* Ce i se spune receptiei cand televizorul n-a primit mesajul, dupa o
 * operatiune care S-A salvat (check-in, check-out, editarea rezervarii).
 *
 * 25-26 septembrie 2026: functia tv-provider nu fusese publicata niciodata,
 * iar dupa fiecare check-in receptia vedea un toast ROSU — „Mesajul de bun
 * venit n-a ajuns pe televizor · 1003. Nu am putut contacta serviciul de
 * televizoare. Verifică conexiunea și încearcă din nou." Receptionerul a
 * inteles ca rezervarile nu se salvasera, desi erau toate in baza. Doua
 * greseli in acelasi mesaj: culoarea de eroare pentru o operatiune reusita
 * si vina pusa pe conexiunea lui, cand de fapt lipsea serviciul.
 *
 * Testul merge prin `cheamaTv` real; doar clientul Supabase e inlocuit, deci
 * se verifica exact ce ajunge pe ecran pentru raspunsul pe care il da
 * biblioteca atunci cand functia edge nu poate fi contactata.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./supabase.js", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("./lib/audit.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, audit: { ...original.audit, push: vi.fn(async () => {}) } };
});

const { supabase } = await import("./supabase.js");
const { bunVenitLaCheckin, stergeMesajLaCheckout, reconciliazaTv } = await import("./features/tv-mesaje.js");
const { toaster } = await import("./ui/primitive.jsx");

const CORE = { rooms: [{ id: "r1003", name: "1003" }, { id: "r1004", name: "1004" }] };

const cazare = (over = {}) => ({
  id: "r-1", roomId: "r1003", guestId: "g1", status: "checkedin",
  checkin: "2026-09-25T11:00:00.000Z", checkout: "2026-09-27T08:00:00.000Z",
  occupantFirstName: "Ana", occupantLastName: "Pop", ...over,
});

/* Ce intoarce supabase-js cand cererea nu pleaca deloc: functie inexistenta
   (preflight 404, deci CORS), server cazut sau retea cazuta arata la fel
   din browser — `FunctionsFetchError`, cu eroarea lui fetch in `context`. */
function nuPoateFiContactat() {
  const e = new Error("Failed to send a request to the Edge Function");
  e.name = "FunctionsFetchError";
  e.context = new TypeError("Failed to fetch");
  return { data: null, error: e };
}

/* Functia a raspuns, dar cu eroare (non-2xx): corpul are mesajul nostru. */
function raspunsCuEroare(mesaj) {
  const e = new Error("Edge Function returned a non-2xx status code");
  e.name = "FunctionsHttpError";
  e.context = { json: async () => ({ ok: false, error: mesaj }) };
  return { data: null, error: e };
}

const toasturi = () => toaster.push.mock.calls.map(([t]) => t);

beforeEach(() => {
  vi.clearAllMocks();
  /* `toaster.show` tace cat timp nu e montat ToastHost; aici ii punem noi
     capatul, ca sa vedem ce i s-ar fi aratat receptiei. */
  toaster.push = vi.fn();
});
afterEach(() => {
  toaster.push = null;
  vi.restoreAllMocks();
});

describe("check-in reusit, televizorul fara mesaj", () => {
  it("spune ca check-in-ul e salvat, ca avertisment, nu ca eroare", async () => {
    supabase.functions.invoke.mockResolvedValue(nuPoateFiContactat());
    await bunVenitLaCheckin(cazare(), CORE);

    const [t] = toasturi();
    expect(toasturi()).toHaveLength(1);
    expect(t.tone).toBe("warn");
    expect(t.message).toMatch(/^Check-in-ul e salvat\./);
    expect(t.message).toContain("1003");
  });

  it("online, nu da vina pe conexiunea receptiei cand serviciul nu raspunde", async () => {
    supabase.functions.invoke.mockResolvedValue(nuPoateFiContactat());
    await bunVenitLaCheckin(cazare(), CORE);

    const [t] = toasturi();
    expect(t.message).not.toMatch(/conexiun/i);
    expect(t.message).toContain("Serviciul de televizoare nu a răspuns.");
  });

  it("offline, spune ca lipseste internetul", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    supabase.functions.invoke.mockResolvedValue(nuPoateFiContactat());
    await bunVenitLaCheckin(cazare(), CORE);

    const [t] = toasturi();
    expect(t.tone).toBe("warn");
    expect(t.message).toMatch(/^Check-in-ul e salvat\./);
    expect(t.message).toMatch(/internet/i);
  });

  it("pastreaza motivul dat de functie, tot ca avertisment", async () => {
    supabase.functions.invoke.mockResolvedValue(
      raspunsCuEroare("Integrarea LYNK nu e configurată. Lipsesc secretele: LYNK_API_BASE."));
    await bunVenitLaCheckin(cazare(), CORE);

    const [t] = toasturi();
    expect(t.tone).toBe("warn");
    expect(t.message).toMatch(/^Check-in-ul e salvat\./);
    expect(t.message).toContain("Lipsesc secretele: LYNK_API_BASE.");
  });

  it("control: o camera fara televizor nu aduce niciun toast", async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true, fara: true, trimise: 0 }, error: null });
    await bunVenitLaCheckin(cazare(), CORE);
    expect(toasturi()).toHaveLength(0);
  });
});

describe("check-out reusit, mesajul ramas pe ecran", () => {
  it("spune ca check-out-ul e salvat, ca avertisment", async () => {
    supabase.functions.invoke.mockResolvedValue(nuPoateFiContactat());
    await stergeMesajLaCheckout(cazare({ status: "checkedout" }), CORE);

    const [t] = toasturi();
    expect(toasturi()).toHaveLength(1);
    expect(t.tone).toBe("warn");
    expect(t.message).toMatch(/^Check-out-ul e salvat\./);
    expect(t.message).toContain("1003");
  });
});

describe("rezervare salvata, televizorul neactualizat", () => {
  it("ocupant schimbat: spune ca rezervarea e salvata, ca avertisment", async () => {
    supabase.functions.invoke.mockResolvedValue(nuPoateFiContactat());
    await reconciliazaTv(cazare(), cazare({ occupantFirstName: "Ioana" }), CORE);

    const [t] = toasturi();
    expect(toasturi()).toHaveLength(1);
    expect(t.tone).toBe("warn");
    expect(t.message).toMatch(/^Rezervarea e salvată\./);
    expect(t.message).not.toMatch(/conexiun/i);
  });

  it("plecare din cazare: mesajul ramas e avertisment, nu eroare", async () => {
    supabase.functions.invoke.mockResolvedValue(nuPoateFiContactat());
    await reconciliazaTv(cazare(), cazare({ status: "cancelled" }), CORE);

    const [t] = toasturi();
    expect(toasturi()).toHaveLength(1);
    expect(t.tone).toBe("warn");
    expect(t.message).toMatch(/^Rezervarea e salvată\./);
  });

  it("camera schimbata: ambele esecuri sunt avertismente, cu camera fiecaruia", async () => {
    supabase.functions.invoke.mockResolvedValue(nuPoateFiContactat());
    await reconciliazaTv(cazare(), cazare({ roomId: "r1004" }), CORE);

    const t = toasturi();
    expect(t).toHaveLength(2);
    expect(t.every((x) => x.tone === "warn")).toBe(true);
    expect(t[0].message).toMatch(/^Rezervarea e salvată\./);
    expect(t[0].message).toContain("1003");
    expect(t[1].message).toContain("1004");
  });
});
