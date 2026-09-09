/* Cele trei reguli automate de relee — logica pura din
 * supabase/functions/device-provider/reguli-automate.ts, testata direct
 * (fara retea, fara Deno), la fel ca src/shelly.test.js.
 */
import { describe, it, expect } from "vitest";
import {
  dataLocala, oraLocala, ziUrmatoare,
  cazatAcum, sejurActiv, sejurCurandSauMaine,
  ocupatRecentLegionela, legionelaDorit, boilerDorit,
  calculeazaRasaritApus, esteNoapte, urmatoareaTranzitie, luminiDorite,
} from "../supabase/functions/device-provider/reguli-automate.ts";

describe("timp local — Intl, nu offset fix", () => {
  it("dataLocala si oraLocala citesc corect fusul Europei/Bucuresti", () => {
    // 31 dec 2026, 23:30 UTC = 1 ian 2027, 01:30 ora Romaniei (EET, +2 iarna).
    const d = new Date(Date.UTC(2026, 11, 31, 23, 30));
    expect(dataLocala(d)).toBe("2027-01-01");
    expect(oraLocala(d)).toBe(1);
  });

  it("trece corect peste schimbarea orei de vara (fara ajustare manuala)", () => {
    // 15 iulie 2026, 09:00 UTC = 12:00 ora Romaniei (EEST, +3 vara).
    const d = new Date(Date.UTC(2026, 6, 15, 9, 0));
    expect(oraLocala(d)).toBe(12);
  });

  it("ziUrmatoare trece corect granita de luna", () => {
    expect(ziUrmatoare("2026-01-31")).toBe("2026-02-01");
  });
});

describe("cazatAcum — dubleaza src/lib/tranzitii.js", () => {
  it("nu e cazat inainte de ora sosirii, desi statusul e deja checkedin", () => {
    const r = { status: "checkedin", checkin: "2026-09-11T14:00:00Z", checkout: "2026-09-13T11:00:00Z" };
    expect(cazatAcum(r, new Date("2026-09-08T10:00:00Z"))).toBe(false);
    expect(cazatAcum(r, new Date("2026-09-11T14:00:01Z"))).toBe(true);
  });

  it("un status confirmed nu conteaza niciodata drept cazat", () => {
    const r = { status: "confirmed", checkin: "2026-09-08T14:00:00Z", checkout: "2026-09-13T11:00:00Z" };
    expect(cazatAcum(r, new Date("2026-09-09T00:00:00Z"))).toBe(false);
  });
});

describe("regula 3 — preincalzire boiler", () => {
  const rez = (over) => ({ status: "checkedin", checkin: "2026-09-10T16:00:00Z", checkout: "2026-09-12T11:00:00Z", ...over });

  it("porneste exact cu 4 ore inainte de checkin, nu mai devreme", () => {
    const r = rez();
    expect(sejurActiv([r], new Date("2026-09-10T11:59:00Z"))).toBe(false);
    expect(sejurActiv([r], new Date("2026-09-10T12:00:01Z"))).toBe(true);
  });

  it("ramane activ pe toata durata sejurului, pana la checkout", () => {
    const r = rez();
    expect(sejurActiv([r], new Date("2026-09-11T08:00:00Z"))).toBe(true);
    expect(sejurActiv([r], new Date("2026-09-12T10:59:00Z"))).toBe(true);
    expect(sejurActiv([r], new Date("2026-09-12T11:00:01Z"))).toBe(false);
  });

  it("o rezervare confirmed (necazata inca) nu declanseaza preincalzirea", () => {
    const r = rez({ status: "confirmed" });
    expect(sejurActiv([r], new Date("2026-09-10T15:00:00Z"))).toBe(false);
  });

  it("sejurCurandSauMaine: adevarat daca o alta rezervare checkedin vine maine", () => {
    const azi = rez({ checkin: "2026-09-10T16:00:00Z", checkout: "2026-09-11T10:00:00Z" });
    const maine = rez({ checkin: "2026-09-12T18:00:00Z", checkout: "2026-09-14T11:00:00Z" });
    // Golul dintre 10:00 (checkout azi) si 14:00 (inceputul ferestrei de 4h a lui maine)
    // nu e acoperit de sejurActiv, dar puntea trebuie sa-l vada.
    expect(sejurCurandSauMaine([azi, maine], new Date("2026-09-11T12:00:00Z"))).toBe(true);
  });

  it("boilerDorit: nu se opreste daca a doua zi mai vine cineva pe cealalta camera a perechii", () => {
    const plecat = rez({ checkin: "2026-09-10T16:00:00Z", checkout: "2026-09-11T10:00:00Z" });
    const vineMaine = rez({ checkin: "2026-09-12T20:00:00Z", checkout: "2026-09-15T11:00:00Z" });
    const acum = new Date("2026-09-11T15:00:00Z"); // gol de dupa checkout, inainte de fereastra de 4h a lui vineMaine
    const cuBoilerulPornit = boilerDorit({
      rezervari: [plecat, vineMaine], acum, curentPornit: true, ultimaRulareLegionela: null,
    });
    expect(cuBoilerulPornit.pornit).toBe(true);
  });

  it("boilerDorit: se opreste cand nu exista nicio rezervare azi sau maine", () => {
    const plecatDeMult = rez({ checkin: "2026-08-01T16:00:00Z", checkout: "2026-08-03T10:00:00Z" });
    const acum = new Date("2026-09-11T15:00:00Z");
    const rezultat = boilerDorit({
      rezervari: [plecatDeMult], acum, curentPornit: true, ultimaRulareLegionela: null,
    });
    expect(rezultat.pornit).toBe(false);
  });

  it("boilerDorit: puntea nu porneste un boiler oprit inainte de fereastra de 4h", () => {
    const vineMaine = rez({ checkin: "2026-09-12T20:00:00Z", checkout: "2026-09-15T11:00:00Z" });
    const acum = new Date("2026-09-11T15:00:00Z"); // "maine" pt. vineMaine, dar la >4h de checkin-ul lui
    const rezultat = boilerDorit({
      rezervari: [vineMaine], acum, curentPornit: false, ultimaRulareLegionela: null,
    });
    expect(rezultat.pornit).toBe(false);
  });
});

describe("regula 1 — anti-legionela", () => {
  it("ocupatRecentLegionela vede o sedere reala (checkedout) in ultimele 10 zile", () => {
    const r = { status: "checkedout", checkin: "2026-09-01T14:00:00Z", checkout: "2026-09-03T11:00:00Z" };
    expect(ocupatRecentLegionela([r], new Date("2026-09-10T12:00:00Z"))).toBe(true);
    expect(ocupatRecentLegionela([r], new Date("2026-09-20T12:00:00Z"))).toBe(false);
  });

  it("o rezervare confirmed viitoare nu conteaza ca ocupare recenta", () => {
    const r = { status: "confirmed", checkin: "2026-09-15T14:00:00Z", checkout: "2026-09-17T11:00:00Z" };
    expect(ocupatRecentLegionela([r], new Date("2026-09-11T12:00:00Z"))).toBe(false);
  });

  it("nu porneste in afara ferestrei 11-14, chiar daca e momentul ciclului", () => {
    expect(legionelaDorit({
      rezervari: [], acum: new Date("2026-09-10T07:59:00Z"), ultimaRulare: null,
    })).toBe(false);
  });

  it("porneste in fereastra, daca a trecut ciclul si nu e nimeni de 10 zile", () => {
    expect(legionelaDorit({
      rezervari: [], acum: new Date("2026-09-10T10:00:00Z"), ultimaRulare: "2026-08-20",
    })).toBe(true);
  });

  it("nu porneste daca a fost cineva cazat in ultimele 10 zile", () => {
    const r = { status: "checkedin", checkin: "2026-09-05T14:00:00Z", checkout: "2026-09-07T11:00:00Z" };
    expect(legionelaDorit({
      rezervari: [r], acum: new Date("2026-09-10T10:00:00Z"), ultimaRulare: null,
    })).toBe(false);
  });

  it("nu se opreste la al doilea tick din aceeasi fereastra, desi cadenta de 10 zile pare implinita", () => {
    // last_run_on tocmai scris "azi" de primul tick (11:00) -- al doilea
    // tick (11:10) NU trebuie sa vada asta ca "abia a rulat, mai asteapta".
    const azi = dataLocala(new Date("2026-09-10T10:10:00Z"));
    expect(legionelaDorit({
      rezervari: [], acum: new Date("2026-09-10T10:10:00Z"), ultimaRulare: azi,
    })).toBe(true);
  });

  it("nu porneste a doua zi, inainte sa treaca cele 10 zile", () => {
    expect(legionelaDorit({
      rezervari: [], acum: new Date("2026-09-11T10:00:00Z"), ultimaRulare: "2026-09-10",
    })).toBe(false);
  });
});

describe("regula 2 — lumini exterioare (rasarit/apus)", () => {
  const { lat, lon } = { lat: 46.6225253, lon: 27.7551750 }; // ACASA, Vaslui

  it("calculeaza rasarit/apus plauzibile pentru Vaslui, vara", () => {
    const { rasarit, apus } = calculeazaRasaritApus(lat, lon, new Date(Date.UTC(2026, 5, 21, 12)));
    expect(rasarit.getUTCHours()).toBeGreaterThanOrEqual(1);
    expect(rasarit.getUTCHours()).toBeLessThanOrEqual(4);
    expect(apus.getUTCHours()).toBeGreaterThanOrEqual(16);
    expect(apus.getUTCHours()).toBeLessThanOrEqual(18);
  });

  it("calculeaza rasarit/apus plauzibile pentru Vaslui, iarna", () => {
    const { rasarit, apus } = calculeazaRasaritApus(lat, lon, new Date(Date.UTC(2026, 11, 21, 12)));
    expect(rasarit.getUTCHours()).toBeGreaterThanOrEqual(4);
    expect(rasarit.getUTCHours()).toBeLessThanOrEqual(6);
    expect(apus.getUTCHours()).toBeGreaterThanOrEqual(14);
    expect(apus.getUTCHours()).toBeLessThanOrEqual(16);
  });

  it("esteNoapte: adevarat la miezul noptii, fals la amiaza", () => {
    expect(esteNoapte(new Date(Date.UTC(2026, 8, 10, 22, 0)))).toBe(true); // noapte, indiferent de sezon
    expect(esteNoapte(new Date(Date.UTC(2026, 8, 10, 10, 0)))).toBe(false); // ziua
  });

  it("urmatoareaTranzitie: seara devreme cere apusul de azi, nu rasaritul de maine", () => {
    const acum = new Date(Date.UTC(2026, 8, 10, 12, 0)); // amiaza
    const tranzitie = urmatoareaTranzitie(acum, lat, lon);
    expect(tranzitie.getTime()).toBeGreaterThan(acum.getTime());
    expect(tranzitie.getUTCHours()).toBeGreaterThanOrEqual(15); // apus, nu rasarit
  });

  it("luminiDorite: adevarat noaptea daca exista o camera cazata oriunde in pensiune", () => {
    const cazata = { status: "checkedin", checkin: "2026-09-09T14:00:00Z", checkout: "2026-09-12T11:00:00Z" };
    expect(luminiDorite([cazata], new Date(Date.UTC(2026, 8, 10, 20, 0)))).toBe(true);
  });

  it("luminiDorite: fals daca nu e nicio camera cazata, chiar noaptea", () => {
    expect(luminiDorite([], new Date(Date.UTC(2026, 8, 10, 20, 0)))).toBe(false);
  });

  it("luminiDorite: fals ziua, chiar daca o camera e cazata", () => {
    const cazata = { status: "checkedin", checkin: "2026-09-09T14:00:00Z", checkout: "2026-09-12T11:00:00Z" };
    expect(luminiDorite([cazata], new Date(Date.UTC(2026, 8, 10, 10, 0)))).toBe(false);
  });
});
