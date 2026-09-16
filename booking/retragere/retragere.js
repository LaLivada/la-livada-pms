/* Formularul de retragere din contract (retragere/index.html).
 *
 * Validează în browser cu aceleași reguli ca funcția edge — ca omul să vadă
 * ce lipsește înainte să plece ceva pe rețea — apoi trimite cererea la
 * /functions/v1/retragere. Fără React: e o pagină de text cu un formular.
 *
 * Cheia de mai jos e cea publicabilă (anon), aceeași ca în src/booking/api.js;
 * nu e un secret, singurul acces pe care îl dă e apelarea funcției. */
import { valideazaCerere, mesajImplicit } from "../../src/lib/retragere.js";
import { fetchCuTimeout, MESAJ_TIMEOUT } from "../../src/lib/retea.js";

const URL_BAZA = import.meta.env.VITE_SUPABASE_URL;
const CHEIE = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* Ca la crearea rezervării: funcția pornită la rece plus două emailuri
   cer mai mult decât un apel obișnuit. */
const TIMEOUT_MS = 20_000;

const form = document.getElementById("cerere");
const stare = document.getElementById("cerere-stare");
const buton = document.getElementById("cerere-trimite");

if (form && stare && buton) {
  form.elements.mesaj.value = mesajImplicit();

  /* Numărul rezervării și data sosirii pot veni din linkul din email
     (?rezervare=…&sosire=…), ca omul să nu le mai caute. */
  const params = new URLSearchParams(location.search);
  for (const camp of ["rezervare", "sosire"]) {
    const v = params.get(camp);
    if (v && form.elements[camp]) form.elements[camp].value = v.slice(0, 40);
  }

  function arataErori(erori) {
    for (const el of form.querySelectorAll("[data-eroare]")) {
      const camp = el.dataset.eroare;
      el.textContent = erori[camp] || "";
      const intrare = form.elements[camp];
      if (intrare) {
        if (erori[camp]) intrare.setAttribute("aria-invalid", "true");
        else intrare.removeAttribute("aria-invalid");
      }
    }
  }

  function arataStare(tip, text) {
    stare.dataset.tip = tip;
    stare.textContent = text;
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const brute = Object.fromEntries(new FormData(form).entries());
    const { valid, erori, date } = valideazaCerere(brute);
    arataErori(erori);
    if (!valid) {
      arataStare("eroare", "Verifică câmpurile marcate.");
      form.querySelector("[aria-invalid]")?.focus();
      return;
    }

    buton.disabled = true;
    buton.textContent = "Se trimite…";
    arataStare("", "");
    try {
      const r = await fetchCuTimeout(`${URL_BAZA}/functions/v1/retragere`, {
        method: "POST",
        headers: {
          apikey: CHEIE,
          Authorization: `Bearer ${CHEIE}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...date, website: brute.website || "" }),
      }, TIMEOUT_MS);
      const corp = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (corp.erori) arataErori(corp.erori);
        throw new Error(corp.error || "Nu am putut trimite cererea. Încearcă din nou.");
      }
      form.reset();
      form.elements.mesaj.value = mesajImplicit();
      arataStare("ok",
        `Am primit cererea ta${corp.id ? ` (#${corp.id})` : ""}. ` +
        (corp.email
          ? `Ți-am trimis o copie la ${date.email}; îți confirmăm anularea pe email.`
          : `Îți confirmăm anularea pe email, la ${date.email}.`));
      buton.textContent = "Trimisă";
    } catch (e) {
      /* `retea` e pus de fetchCuTimeout la expirare; un TypeError e fetch-ul
         picat înainte de răspuns (conexiune căzută). Restul sunt verdictele
         serverului, cu mesajul lui. */
      const text = e?.retea ? MESAJ_TIMEOUT
        : e instanceof TypeError ? "Nu am putut trimite cererea. Verifică conexiunea și încearcă din nou."
        : (e?.message || "Nu am putut trimite cererea.");
      arataStare("eroare", text);
      buton.disabled = false;
      buton.textContent = "Trimite cererea";
    }
  });
}
