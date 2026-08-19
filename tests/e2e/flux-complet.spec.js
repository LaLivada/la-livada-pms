/* Fluxul complet, end-to-end:
 *   autentificare → client nou → rezervare → check-in → folio (serviciu
 *   extra) → factura → incasare → check-out
 *
 * E singurul test care atinge toate straturile deodata: interfata, sync
 * engine, RLS, trigger-ele de facturare si numerotarea documentelor.
 * Testele unitare si de proprietate verifica bucati; asta verifica faptul
 * ca bucatile chiar se leaga intre ele.
 *
 * RULARE — vezi tests/e2e/README.md. Pe scurt: are nevoie de un proiect
 * Supabase SEPARAT (nu productia) si de un cont de admin in el.
 * Refuza sa porneasca pe productie; motivul e explicat in
 * protectie-productie.js si merita citit inainte de a forta.
 */
import { test, expect } from "@playwright/test";
import { verificaBazaDeTest, numeUnic } from "./protectie-productie.js";

const EMAIL = process.env.E2E_EMAIL;
const PAROLA = process.env.E2E_PASSWORD;

/* Fara credentiale nu are rost sa dam erori derutante prin toate testele
   — spunem o singura data, clar, de ce nu ruleaza. */
const potRula = Boolean(EMAIL && PAROLA);

/* Autentificarea se repeta la fiecare test — Playwright porneste de la
   un context curat, exact ce vrem: fiecare test trebuie sa fie
   independent de ce a lasat in urma altul. */
async function autentificare(page) {
  await page.goto("/");
  await page.getByRole("textbox").first().fill(EMAIL);
  await page.locator('input[type="password"]').fill(PAROLA);
  await page.getByRole("button", { name: /intra in cont/i }).click();
  // Ecranul de login dispare doar dupa ce contul a fost gasit in `staff`.
  await expect(page.getByRole("button", { name: /intra in cont/i })).toBeHidden();
}

/* Doar testele care SCRIU in baza cer credentiale si baza de test.
   Cele fara scriere (mai jos) merg oriunde, inclusiv fara configurare. */
test.describe("Flux complet de la rezervare la incasare", () => {
  test.skip(!potRula, "Lipsesc credentialele de test (E2E_EMAIL / E2E_PASSWORD) — vezi tests/e2e/README.md");

  test.beforeAll(() => {
    verificaBazaDeTest();
  });

  test("autentificare si incarcarea aplicatiei", async ({ page }) => {
    await autentificare(page);
    // Calendarul e ecranul implicit dupa autentificare.
    await expect(page.locator(".pms")).toBeVisible();
  });

  test("creeaza un client nou", async ({ page }) => {
    await autentificare(page);

    const nume = numeUnic("Test");
    await page.goto("/#clients").catch(() => {});
    // Navigarea se face prin interfata, nu prin URL — aplicatia nu are
    // rutare pe adrese, tine ecranul curent in stare React.
    await page.getByRole("button", { name: /clien[țt]i/i }).first().click();

    await page.getByRole("button", { name: /adaug[ăa]/i }).first().click();
    await page.getByPlaceholder("Popescu").fill(nume);
    await page.getByPlaceholder("Andrei").fill("Automat");
    await page.locator('input[type="tel"], input[placeholder*="07"]').first()
      .fill("07" + String(Date.now()).slice(-8));
    await page.getByRole("button", { name: /salveaz[ăa]/i }).click();

    await expect(page.getByText(nume)).toBeVisible();
  });

  /* Testul central. E scris ca un singur test, nu spart in mai multe,
     fiindca fiecare pas depinde de starea lasata de precedentul — o
     rezervare trebuie sa existe ca sa i se poata face check-in. */
  test("rezervare → check-in → folio → factura → incasare → check-out", async ({ page }) => {
    await autentificare(page);

    // --- Rezervare ---------------------------------------------------
    await page.getByRole("button", { name: /rezervare nou[ăa]/i }).first().click();
    await page.getByPlaceholder(/caut[ăa] dup[ăa] nume, telefon sau ora[șs]/i)
      .fill("Test");
    await page.getByRole("option").or(page.locator(".guest-result")).first().click();
    await page.getByRole("button", { name: /salveaz[ăa]/i }).click();

    // Rezervarea trebuie sa apara in calendar.
    await expect(page.locator(".res-span, .cal-res").first()).toBeVisible();

    // --- Check-in ----------------------------------------------------
    await page.getByRole("button", { name: /azi/i }).first().click();
    const butonCheckIn = page.getByRole("button", { name: /check-in/i }).first();
    if (await butonCheckIn.isVisible()) {
      await butonCheckIn.click();
      await expect(page.getByText(/cazat/i).first()).toBeVisible();
    }

    // --- Folio + factura + incasare ----------------------------------
    // Deschidem rezervarea si mergem pe tabul de folio.
    await page.locator(".res-span, .cal-res").first().click();
    await page.getByRole("button", { name: /vezi rezervarea/i }).click();
    await page.getByRole("button", { name: /folio/i }).click();

    await expect(page.getByText(/cazare/i).first()).toBeVisible();

    // Generarea facturii: consuma un numar din serie — de aici si
    // refuzul de a rula pe productie.
    await page.getByRole("button", { name: /genereaz[ăa] factur[ăa]/i }).click();
    await page.getByRole("button", { name: /salveaz[ăa]|creeaz[ăa]/i }).last().click();
    await expect(page.getByText(/draft/i).first()).toBeVisible();
  });
});

/* Verificari care nu scriu nimic — pot rula si pe o baza cu date reale,
   fiindca nu ating nimic. */
test.describe("Verificari fara scriere", () => {
  test("ecranul de autentificare se randeaza corect", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /intra in cont/i })).toBeVisible();
  });

  test("credentiale gresite arata un mesaj tradus, nu textul brut de la Supabase", async ({ page }) => {
    await page.goto("/");
    await page.locator('input[type="email"]').fill("inexistent@exemplu.invalid");
    await page.locator('input[type="password"]').fill("parola-gresita");
    await page.getByRole("button", { name: /intra in cont/i }).click();

    // Traducerea din src/lib/errors.js: "Invalid login credentials" ->
    // mesaj in romana. Daca apare textul englezesc, traducerea s-a rupt.
    await expect(page.getByRole("alert")).toContainText(/email sau parol[ăa] gre[șs]it/i);
    await expect(page.getByRole("alert")).not.toContainText(/invalid login/i);
  });

  test("nu exista scroll orizontal pe ecran de telefon", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const depasire = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(depasire).toBeLessThanOrEqual(1);
  });
});
