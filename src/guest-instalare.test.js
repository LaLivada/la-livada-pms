/* Adaugarea pe ecranul principal.
 *
 * Testat aici, nu in browser: ramura de iPhone se alege dupa user-agent, iar
 * intr-un browser real nu poate fi falsificat din afara paginii — orice
 * incercare ramane in „isolated world"-ul uneltei, in timp ce aplicatia
 * citeste navigatorul adevarat si merge pe cealalta ramura.
 *
 * Fiecare test isi importa modulul din nou (`resetModules`), fiindca
 * evenimentul prins de la Chrome e stare de modul, nu de componenta. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const UA_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36";

const original = {};

/* jsdom tine userAgent/platform pe prototip, cu getter; defineProperty pe
   instanta le acopera si se poate da inapoi la loc. */
function pune(nume, valoare) {
  if (!(nume in original)) {
    original[nume] = Object.getOwnPropertyDescriptor(window.navigator, nume);
  }
  Object.defineProperty(window.navigator, nume, {
    value: valoare, configurable: true, writable: true,
  });
}

beforeEach(() => {
  vi.resetModules();
  document.head.querySelectorAll('link[rel="manifest"]').forEach((l) => l.remove());
});

afterEach(() => {
  for (const [nume, desc] of Object.entries(original)) {
    if (desc) Object.defineProperty(window.navigator, nume, desc);
    else delete window.navigator[nume];
    delete original[nume];
  }
});

describe("recunoasterea sistemului", () => {
  it("vede iPhone-ul", async () => {
    pune("userAgent", UA_IPHONE);
    const { esteIOS } = await import("./guest/instalare.js");
    expect(esteIOS()).toBe(true);
  });

  it("vede si iPad-ul care se da drept Mac", async () => {
    pune("userAgent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15");
    pune("platform", "MacIntel");
    pune("maxTouchPoints", 5);
    const { esteIOS } = await import("./guest/instalare.js");
    expect(esteIOS()).toBe(true);
  });

  it("nu confunda un Mac adevarat cu un iPad", async () => {
    pune("userAgent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15");
    pune("platform", "MacIntel");
    pune("maxTouchPoints", 0);
    const { esteIOS } = await import("./guest/instalare.js");
    expect(esteIOS()).toBe(false);
  });

  it("Android-ul merge pe cealalta ramura", async () => {
    pune("userAgent", UA_ANDROID);
    pune("platform", "Linux armv8l");
    const { esteIOS } = await import("./guest/instalare.js");
    expect(esteIOS()).toBe(false);
  });
});

describe("pagina deja pusa pe ecran", () => {
  it("fara semne, butonul ramane la vedere", async () => {
    const { esteInstalata } = await import("./guest/instalare.js");
    expect(esteInstalata()).toBe(false);
  });

  it("iOS o anunta prin navigator.standalone", async () => {
    pune("standalone", true);
    const { esteInstalata } = await import("./guest/instalare.js");
    expect(esteInstalata()).toBe(true);
  });

  it("Android o anunta prin display-mode", async () => {
    window.matchMedia = (q) => ({ matches: q.includes("standalone") });
    const { esteInstalata } = await import("./guest/instalare.js");
    expect(esteInstalata()).toBe(true);
    delete window.matchMedia;
  });
});

describe("manifestul scris la rulare", () => {
  let blobul;

  beforeEach(() => {
    blobul = null;
    URL.createObjectURL = (b) => { blobul = b; return "blob:test/manifest"; };
  });

  const citeste = async () => JSON.parse(await blobul.text());

  it("pastreaza codul sejurului in start_url", async () => {
    window.location.hash = "#Ajh6k";
    const { pregatesteManifestul } = await import("./guest/instalare.js");
    pregatesteManifestul();

    const m = await citeste();
    // Fara fragment, iconul de pe ecran ar deschide un „link invalid".
    expect(m.start_url).toBe(window.location.href);
    expect(m.start_url).toContain("#Ajh6k");
    expect(m.scope).toBe(`${window.location.origin}/`);
  });

  it("da adrese absolute pentru iconite", async () => {
    const { pregatesteManifestul } = await import("./guest/instalare.js");
    pregatesteManifestul();

    const m = await citeste();
    const marimi = m.icons.map((i) => i.sizes);
    // Chrome cere una de cel putin 192 si una de cel putin 512.
    expect(marimi).toContain("192x192");
    expect(marimi).toContain("512x512");
    for (const i of m.icons) {
      // Baza de rezolvare e adresa blobului, deci relativele n-ar merge.
      expect(i.src.startsWith(window.location.origin)).toBe(true);
    }
    expect(m.display).toBe("standalone");
  });

  it("nu adauga un al doilea link daca e chemat de doua ori", async () => {
    const { pregatesteManifestul } = await import("./guest/instalare.js");
    pregatesteManifestul();
    pregatesteManifestul();
    expect(document.head.querySelectorAll('link[rel="manifest"]').length).toBe(1);
  });
});

describe("dialogul de instalare de pe Android", () => {
  function evenimentFals(outcome) {
    const e = new Event("beforeinstallprompt");
    e.preventDefault = vi.fn();
    e.prompt = vi.fn();
    e.userChoice = Promise.resolve({ outcome });
    return e;
  }

  it("fara eveniment, nu are ce chema", async () => {
    const { promptDisponibil, cheamaPrompt } = await import("./guest/instalare.js");
    expect(promptDisponibil()).toBe(false);
    expect(await cheamaPrompt()).toBe("indisponibil");
  });

  it("prinde evenimentul, il opreste si anunta abonatii", async () => {
    const mod = await import("./guest/instalare.js");
    const abonat = vi.fn();
    mod.asculta(abonat);

    const e = evenimentFals("accepted");
    window.dispatchEvent(e);

    // Fara preventDefault, Chrome isi arata singur bannerul.
    expect(e.preventDefault).toHaveBeenCalled();
    expect(mod.promptDisponibil()).toBe(true);
    expect(abonat).toHaveBeenCalled();
  });

  it("cheama dialogul o singura data si intoarce raspunsul", async () => {
    const mod = await import("./guest/instalare.js");
    const e = evenimentFals("accepted");
    window.dispatchEvent(e);

    expect(await mod.cheamaPrompt()).toBe("accepted");
    expect(e.prompt).toHaveBeenCalledTimes(1);
    // Evenimentul e de unica folosinta: a doua apasare cade pe instructiuni.
    expect(mod.promptDisponibil()).toBe(false);
    expect(await mod.cheamaPrompt()).toBe("indisponibil");
    expect(e.prompt).toHaveBeenCalledTimes(1);
  });

  it("un refuz nu ascunde butonul", async () => {
    const mod = await import("./guest/instalare.js");
    window.dispatchEvent(evenimentFals("dismissed"));
    expect(await mod.cheamaPrompt()).toBe("dismissed");
  });

  it("dupa instalare nu mai are ce oferi", async () => {
    const mod = await import("./guest/instalare.js");
    window.dispatchEvent(evenimentFals("accepted"));
    expect(mod.promptDisponibil()).toBe(true);

    const abonat = vi.fn();
    mod.asculta(abonat);
    window.dispatchEvent(new Event("appinstalled"));

    expect(mod.promptDisponibil()).toBe(false);
    expect(abonat).toHaveBeenCalled();
  });
});
