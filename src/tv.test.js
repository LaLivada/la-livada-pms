/* Mesajele de bun venit de pe televizoarele din camere (lib/tv.js).
 *
 * Ce se verifica aici e exact ce nu se vede pana nu ajunge pe un ecran din
 * camera: cine e salutat la o rezervare de grup, ce se intampla cu randul de
 * Wi-Fi cat timp reteaua nu e configurata, si cand dispare mesajul.
 */
import { describe, it, expect } from "vitest";
import {
  limbaOaspete, randeazaMesajTv, faraDiacritice, curataRand, taieLa, numeScurt,
  numePeTv, mesajBunVenit, decideActiuneTv, taceLaCheckin,
  SABLOANE_IMPLICITE, LUNGIME_MAXIMA,
} from "./lib/tv.js";

const SETARI = {
  hotelName: "Complex La Livada",
  supportPhone: "+40 725 259 999",
};

const CAZARE = {
  status: "checkedin",
  roomId: "r1003",
  checkin: "2026-09-18T14:00:00+03:00",
  checkout: "2026-09-21T11:00:00+03:00",
};

describe("limba mesajului", () => {
  it("romana pentru Romania si Moldova, oricum ar fi scrisa tara", () => {
    for (const t of ["RO", "ro", "România", "Romania", "MD", "Moldova"]) {
      expect(limbaOaspete(t)).toBe("ro");
    }
  });

  it("engleza pentru restul lumii", () => {
    for (const t of ["IT", "Germania", "France", "United Kingdom"]) {
      expect(limbaOaspete(t)).toBe("en");
    }
  });

  it("fara tara ramane romana, nu engleza", () => {
    // Ocupantul unui grup n-are camp de tara. Un „Welcome" pe televizorul
    // unui oaspete din Vaslui ar fi gresit mai des decat corect.
    expect(limbaOaspete(null)).toBe("ro");
    expect(limbaOaspete("")).toBe("ro");
    expect(limbaOaspete("   ")).toBe("ro");
  });
});

describe("randarea sablonului", () => {
  it("inlocuieste cheile si lasa textul curat", () => {
    const text = randeazaMesajTv("Bun venit, {{guest_name}}!\nCamera {{room_number}}",
      { guest_name: "Ana", room_number: "1003" });
    expect(text).toBe("Bun venit, Ana!\nCamera 1003");
  });

  it("taie bucata ramasa fara valoare, nu tot randul", () => {
    // Cat timp reteaua nu e scrisa in setari, „Camera 1003 · Wi-Fi:" trebuie
    // sa ajunga pe ecran ca „Camera 1003", nu ciunt.
    const text = randeazaMesajTv("Camera {{room_number}} · Wi-Fi: {{wifi_name}}",
      { room_number: "1003" });
    expect(text).toBe("Camera 1003");
  });

  it("scoate randul ramas complet gol", () => {
    const text = randeazaMesajTv("Bun venit!\n{{lipseste}}\nCamera 1003", {});
    expect(text).toBe("Bun venit!\nCamera 1003");
  });

  it("o cheie necunoscuta nu ajunge ca atare pe ecran", () => {
    expect(randeazaMesajTv("A {{necunoscut}} B", {})).toBe("A  B");
  });

  it("nu trece de plafonul de randuri", () => {
    const text = randeazaMesajTv("1\n2\n3\n4\n5\n6\n7\n8", {}, { randuri: 3 });
    expect(text.split("\n")).toHaveLength(3);
  });

  it("scoate diacriticele doar cand i se cere", () => {
    const valori = { guest_name: "Ștefan Țăranu" };
    expect(randeazaMesajTv("Bun venit, {{guest_name}}", valori))
      .toBe("Bun venit, Ștefan Țăranu");
    expect(randeazaMesajTv("Bun venit, {{guest_name}}", valori, { scoateDiacritice: true }))
      .toBe("Bun venit, Stefan Taranu");
  });
});

describe("taierea la plafon", () => {
  it("taie pe cuvant si pune punctele de suspensie", () => {
    const text = taieLa("Bun venit la Complex La Livada", 20);
    expect(text.length).toBeLessThanOrEqual(20);
    expect(text.endsWith("…")).toBe(true);
    expect(text).toBe("Bun venit la…");
  });

  it("lasa in pace un text care incape", () => {
    expect(taieLa("Bun venit", 20)).toBe("Bun venit");
  });

  it("taie si un cuvant singur mai lung decat plafonul", () => {
    // Fara asta, un nume fara spatii ar scapa intreg de plafon.
    expect(taieLa("Aaaaaaaaaaaaaaaaaaaaaa", 10)).toHaveLength(10);
  });
});

describe("diacriticele", () => {
  it("scoate si virgula dedesubt, si sedila din fonturile vechi", () => {
    expect(faraDiacritice("ășțîâ ĂȘȚÎÂ")).toBe("astia ASTIA");
    // Variantele cu sedila (ş, ţ), cele din fonturile vechi, nu doar cele cu
    // virgula dedesubt.
    expect(faraDiacritice("Ştefan Ţăranu")).toBe("Stefan Taranu");
  });
});

describe("curatarea unui rand", () => {
  it("pastreaza bucatile cu valoare", () => {
    expect(curataRand("Camera 1003 · Wi-Fi: LaLivada")).toBe("Camera 1003 · Wi-Fi: LaLivada");
  });
  it("scoate eticheta ramasa fara valoare", () => {
    expect(curataRand("Camera 1003 · Wi-Fi:")).toBe("Camera 1003");
  });
});

describe("numele de pe ecran", () => {
  it("ocupantul are prioritate fata de titularul rezervarii", () => {
    // La un grup de zece camere, titularul e unul singur; pe ecrane trebuie
    // sa scrie cine doarme in camera.
    const nume = numePeTv(
      { occupantFirstName: "Ana", occupantLastName: "Pop" },
      { firstName: "Ion", lastName: "Popescu" });
    expect(nume).toBe("Ana Pop");
  });

  it("cade pe titular cand ocupantul nu e scris", () => {
    expect(numePeTv({}, { firstName: "Ion", lastName: "Popescu" })).toBe("Ion Popescu");
  });

  it("prenumele intai, nu ca in listare", () => {
    expect(numePeTv({}, { firstName: "Ion", lastName: "Popescu" })).toBe("Ion Popescu");
  });

  it("un nume prea lung ramane doar prenumele", () => {
    expect(numeScurt("Alexandru Vasilescu-Popescu")).toBe("Alexandru");
  });

  it("taie si prenumele, cand nici el nu incape", () => {
    const scurt = numeScurt("Alexandru-Constantin Vasilescu-Popescu");
    expect(scurt.length).toBeLessThanOrEqual(18);
    expect(scurt.startsWith("Alexandru")).toBe(true);
  });

  it("un nume scurt ramane intreg", () => {
    expect(numeScurt("Ana Pop")).toBe("Ana Pop");
  });
});

describe("mesajul de bun venit", () => {
  it("compune mesajul romanesc complet", () => {
    const { text, limba } = mesajBunVenit({
      rezervare: CAZARE,
      oaspete: { firstName: "Ana", lastName: "Pop", country: "România" },
      numeCamera: "1003",
      setari: SETARI,
    });
    expect(limba).toBe("ro");
    expect(text).toContain("Bun venit, Ana Pop!");
    expect(text).toContain("Camera 1003");
    expect(text).toContain("+40 725 259 999");
    expect(text.length).toBeLessThanOrEqual(LUNGIME_MAXIMA);
  });

  it("trece pe engleza pentru un oaspete strain", () => {
    const { text, limba } = mesajBunVenit({
      rezervare: CAZARE,
      oaspete: { firstName: "John", lastName: "Smith", country: "United Kingdom" },
      numeCamera: "1003",
      setari: SETARI,
    });
    expect(limba).toBe("en");
    expect(text).toContain("Welcome, John Smith!");
    expect(text).toContain("Room 1003");
  });

  it("fara niciun nume, salutul ramane general — nu «Bun venit, !»", () => {
    const { text } = mesajBunVenit({
      rezervare: { ...CAZARE }, oaspete: {}, numeCamera: "1003", setari: SETARI,
    });
    expect(text.startsWith("Bun venit!")).toBe(true);
    expect(text).not.toContain(", !");
  });

  it("un sablon din setari il inlocuieste pe cel implicit", () => {
    const { text } = mesajBunVenit({
      rezervare: CAZARE,
      oaspete: { firstName: "Ana", lastName: "Pop" },
      numeCamera: "1003",
      setari: { ...SETARI, templates: { ro: "Salut, {{guest_name}}! Plecare: {{checkout_date}}" } },
    });
    expect(text).toBe("Salut, Ana Pop! Plecare: 21 septembrie 2026");
  });

  it("limba fortata din setari bate tara oaspetelui", () => {
    const { limba } = mesajBunVenit({
      rezervare: CAZARE,
      oaspete: { firstName: "Ana", country: "România" },
      numeCamera: "1003",
      setari: { ...SETARI, limbaFortata: "en" },
    });
    expect(limba).toBe("en");
  });

  it("ora si ziua sunt in fusul hotelului, nu in cel al masinii", () => {
    // Testul ruleaza si cu TZ=America/New_York in CI (vezi ci.yml).
    const { text } = mesajBunVenit({
      rezervare: CAZARE,
      oaspete: { firstName: "Ana" },
      numeCamera: "1003",
      setari: { ...SETARI, templates: { ro: "{{checkout_date}}, ora {{checkout_time}}" } },
    });
    expect(text).toBe("21 septembrie 2026, ora 11:00");
  });

  it("nu trece de plafonul cerut in setari", () => {
    const { text } = mesajBunVenit({
      rezervare: CAZARE,
      oaspete: { firstName: "Ana", lastName: "Pop" },
      numeCamera: "1003",
      setari: { ...SETARI, maxLength: 40 },
    });
    expect(text.length).toBeLessThanOrEqual(40);
  });

  it("sabloanele implicite au aceleasi chei in ambele limbi", () => {
    const chei = (s) => (s.match(/\{\{\s*\w+\s*\}\}/g) || []).sort();
    expect(chei(SABLOANE_IMPLICITE.en)).toEqual(chei(SABLOANE_IMPLICITE.ro));
  });
});

describe("ce se face dupa o modificare de rezervare", () => {
  const cazat = { ...CAZARE };

  it("check-in: mesaj nou", () => {
    expect(decideActiuneTv({ ...cazat, status: "confirmed" }, cazat)).toBe("welcome");
  });

  it("check-out: ecranul se curata", () => {
    expect(decideActiuneTv(cazat, { ...cazat, status: "checkedout" })).toBe("clear");
  });

  it("anulare si no-show curata si ele", () => {
    expect(decideActiuneTv(cazat, { ...cazat, status: "cancelled" })).toBe("clear");
    expect(decideActiuneTv(cazat, { ...cazat, status: "noshow" })).toBe("clear");
  });

  it("mutare in alta camera: se curata camera veche si se scrie in cea noua", () => {
    expect(decideActiuneTv(cazat, { ...cazat, roomId: "r1005" })).toBe("muta");
  });

  it("alt ocupant pe aceeasi camera: mesajul se rescrie", () => {
    expect(decideActiuneTv(cazat, { ...cazat, occupantFirstName: "Ana" })).toBe("welcome");
  });

  it("alta zi de plecare: mesajul se rescrie", () => {
    expect(decideActiuneTv(cazat, { ...cazat, checkout: "2026-09-22T11:00:00+03:00" })).toBe("welcome");
  });

  it("o rezervare neinceputa nu are ce mesaj sa schimbe", () => {
    const viitoare = { ...cazat, status: "confirmed" };
    expect(decideActiuneTv(viitoare, { ...viitoare, roomId: "r1005" })).toBe(null);
    expect(decideActiuneTv(viitoare, { ...viitoare, status: "cancelled" })).toBe(null);
  });

  it("o salvare fara schimbari care conteaza nu trimite nimic", () => {
    expect(decideActiuneTv(cazat, { ...cazat, notes: "alta nota" })).toBe(null);
  });
});

describe("ce se spune recepției pe calea automată", () => {
  it("spune doar ce s-a întâmplat cu adevărat", () => {
    expect(taceLaCheckin({ ok: true, trimise: 1 })).toBe(false);
    expect(taceLaCheckin({ ok: false, reason: "necazat", error: "…" })).toBe(false);
    // O eroare reală, fără motiv cunoscut, se spune: altfel un televizor care
    // chiar nu răspunde ar dispărea din vedere.
    expect(taceLaCheckin({ ok: false, error: "LYNK Cloud n-a răspuns în 8 secunde." })).toBe(false);
  });

  it("tace când nu e nimic de spus", () => {
    expect(taceLaCheckin(null)).toBe(true);
    expect(taceLaCheckin({ ok: true, fara: true, trimise: 0 })).toBe(true);
    expect(taceLaCheckin({ ok: true, inactiv: true, trimise: 0 })).toBe(true);
    expect(taceLaCheckin({ ok: true, trimise: 0 })).toBe(true);
  });

  it("tace și când n-are omul de la ghișeu ce face cu eroarea", () => {
    // Intervalul dintre publicarea frontendului (Vercel, la fiecare merge) și
    // cea a funcției edge (manuală): altfel fiecare check-in din intervalul
    // ăla ar fi arătat un avertisment roșu despre televizoare.
    expect(taceLaCheckin({ ok: false, reason: "nepublicat", error: "…" })).toBe(true);
    // Secretele LYNK lipsesc: treaba adminului. Aceeași alegere ca la yale,
    // unde doCheckOut tace deja pe „neconfigurat".
    expect(taceLaCheckin({ ok: false, reason: "neconfigurat", error: "…" })).toBe(true);
  });
});
