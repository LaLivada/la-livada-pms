/* Protocol ca atribut (15 septembrie 2026): marcajul „nu se incaseaza"
 * ramane dupa check-in, cand starea nu mai e „protocol". Ce s-ar strica
 * tacut: un protocol cazat sa intre in venit; interfata sa trimita atributul
 * inapoi in baza si sa suprascrie ce a hotarat triggerul.
 */
import { describe, it, expect } from "vitest";
import { esteProtocol, isStatsEligible } from "./lib/availability.js";
import { camelRes, snakeRes } from "./data/mapari.js";

const rez = (extra) => ({ id: "r1", roomId: "t1", checkin: "2026-09-15T11:00:00Z", checkout: "2026-09-17T08:00:00Z", status: "confirmed", ...extra });

describe("esteProtocol", () => {
  it("dupa stare inainte de sosire, dupa atribut dupa check-in", () => {
    expect(esteProtocol(rez({ status: "protocol" }))).toBe(true);
    expect(esteProtocol(rez({ status: "checkedin", protocol: true }))).toBe(true);
    expect(esteProtocol(rez({ status: "checkedout", protocol: true }))).toBe(true);
    expect(esteProtocol(rez({ status: "checkedin" }))).toBe(false);
    expect(esteProtocol(rez({ status: "confirmed", protocol: false }))).toBe(false);
  });

  it("un protocol cazat nu intra in cifrele de business", () => {
    expect(isStatsEligible(rez({ status: "checkedin", protocol: true }))).toBe(false);
    expect(isStatsEligible(rez({ status: "checkedin" }))).toBe(true);
  });
});

describe("maparea cu baza", () => {
  const rand = { id: "r1", room_id: "t1", checkin: "2026-09-15T11:00:00Z", checkout: "2026-09-17T08:00:00Z" };
  it("camelRes citeste atributul, si il deduce din stare pentru randuri de dinaintea coloanei", () => {
    expect(camelRes({ ...rand, status: "checkedin", protocol: true }).protocol).toBe(true);
    expect(camelRes({ ...rand, status: "protocol" }).protocol).toBe(true);
    expect(camelRes({ ...rand, status: "confirmed", protocol: false }).protocol).toBe(false);
  });
  it("snakeRes nu trimite atributul inapoi — e al triggerului", () => {
    expect(snakeRes(camelRes({ ...rand, status: "checkedin", protocol: true }))).not.toHaveProperty("protocol");
  });
});
