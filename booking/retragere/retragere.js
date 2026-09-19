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

/* Textele proprii ale acestui script (butonul și starea trimiterii) —
   restul formularului e HTML static, tradus direct în fiecare
   booking/retragere/<limba>/index.html. Mesajele de VALIDARE pe câmp
   (`valideazaCerere`, din src/lib/retragere.js) rămân în română: sunt
   partajate cu funcția edge și traducerea lor ar depăși scopul paginii
   statice — un compromis documentat, nu o omisiune. Fallback pe engleză
   pentru orice `lang` nerecunoscut, ca pagina să nu rămână niciodată în
   română pentru cineva care nu o citește. */
const TEXTE = {
  ro: {
    verificaCampurile: "Verifică câmpurile marcate.",
    seTrimite: "Se trimite…",
    trimite: "Trimite cererea",
    trimisa: "Trimisă",
    nuAmPututTrimite: "Nu am putut trimite cererea. Încearcă din nou.",
    nuAmPututTrimiteConexiune: "Nu am putut trimite cererea. Verifică conexiunea și încearcă din nou.",
    nuAmPututTrimiteGeneric: "Nu am putut trimite cererea.",
    primit: (id) => `Am primit cererea ta${id ? ` (#${id})` : ""}. `,
    copiePe: (email) => `Ți-am trimis o copie la ${email}; îți confirmăm anularea pe email.`,
    confirmamPe: (email) => `Îți confirmăm anularea pe email, la ${email}.`,
  },
  en: {
    verificaCampurile: "Check the highlighted fields.",
    seTrimite: "Sending…",
    trimite: "Send the request",
    trimisa: "Sent",
    nuAmPututTrimite: "We couldn't send the request. Please try again.",
    nuAmPututTrimiteConexiune: "We couldn't send the request. Check your connection and try again.",
    nuAmPututTrimiteGeneric: "We couldn't send the request.",
    primit: (id) => `We received your request${id ? ` (#${id})` : ""}. `,
    copiePe: (email) => `We sent a copy to ${email}; we'll confirm the cancellation by email.`,
    confirmamPe: (email) => `We'll confirm the cancellation by email, at ${email}.`,
  },
  fr: {
    verificaCampurile: "Vérifiez les champs signalés.",
    seTrimite: "Envoi en cours…",
    trimite: "Envoyer la demande",
    trimisa: "Envoyée",
    nuAmPututTrimite: "Nous n'avons pas pu envoyer la demande. Réessayez.",
    nuAmPututTrimiteConexiune: "Nous n'avons pas pu envoyer la demande. Vérifiez votre connexion et réessayez.",
    nuAmPututTrimiteGeneric: "Nous n'avons pas pu envoyer la demande.",
    primit: (id) => `Nous avons reçu votre demande${id ? ` (#${id})` : ""}. `,
    copiePe: (email) => `Nous vous avons envoyé une copie à ${email} ; nous confirmerons l'annulation par email.`,
    confirmamPe: (email) => `Nous confirmerons l'annulation par email, à ${email}.`,
  },
  it: {
    verificaCampurile: "Controlla i campi segnalati.",
    seTrimite: "Invio in corso…",
    trimite: "Invia la richiesta",
    trimisa: "Inviata",
    nuAmPututTrimite: "Non siamo riusciti a inviare la richiesta. Riprova.",
    nuAmPututTrimiteConexiune: "Non siamo riusciti a inviare la richiesta. Controlla la connessione e riprova.",
    nuAmPututTrimiteGeneric: "Non siamo riusciti a inviare la richiesta.",
    primit: (id) => `Abbiamo ricevuto la tua richiesta${id ? ` (#${id})` : ""}. `,
    copiePe: (email) => `Ti abbiamo inviato una copia a ${email}; confermeremo la cancellazione via email.`,
    confirmamPe: (email) => `Confermeremo la cancellazione via email, a ${email}.`,
  },
  de: {
    verificaCampurile: "Bitte überprüfen Sie die markierten Felder.",
    seTrimite: "Wird gesendet…",
    trimite: "Anfrage senden",
    trimisa: "Gesendet",
    nuAmPututTrimite: "Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
    nuAmPututTrimiteConexiune: "Die Anfrage konnte nicht gesendet werden. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
    nuAmPututTrimiteGeneric: "Die Anfrage konnte nicht gesendet werden.",
    primit: (id) => `Wir haben Ihre Anfrage erhalten${id ? ` (#${id})` : ""}. `,
    copiePe: (email) => `Wir haben eine Kopie an ${email} gesendet; wir bestätigen die Stornierung per E-Mail.`,
    confirmamPe: (email) => `Wir bestätigen die Stornierung per E-Mail, an ${email}.`,
  },
  ru: {
    verificaCampurile: "Проверьте отмеченные поля.",
    seTrimite: "Отправка…",
    trimite: "Отправить запрос",
    trimisa: "Отправлено",
    nuAmPututTrimite: "Не удалось отправить запрос. Попробуйте ещё раз.",
    nuAmPututTrimiteConexiune: "Не удалось отправить запрос. Проверьте соединение и попробуйте ещё раз.",
    nuAmPututTrimiteGeneric: "Не удалось отправить запрос.",
    primit: (id) => `Мы получили ваш запрос${id ? ` (#${id})` : ""}. `,
    copiePe: (email) => `Мы отправили копию на ${email}; подтверждение отмены придёт на email.`,
    confirmamPe: (email) => `Подтверждение отмены придёт на email, на ${email}.`,
  },
  uk: {
    verificaCampurile: "Перевірте позначені поля.",
    seTrimite: "Надсилаємо…",
    trimite: "Надіслати запит",
    trimisa: "Надіслано",
    nuAmPututTrimite: "Не вдалося надіслати запит. Спробуйте ще раз.",
    nuAmPututTrimiteConexiune: "Не вдалося надіслати запит. Перевірте з'єднання і спробуйте ще раз.",
    nuAmPututTrimiteGeneric: "Не вдалося надіслати запит.",
    primit: (id) => `Ми отримали ваш запит${id ? ` (#${id})` : ""}. `,
    copiePe: (email) => `Ми надіслали копію на ${email}; підтвердження скасування надійде на email.`,
    confirmamPe: (email) => `Підтвердження скасування надійде на email, на ${email}.`,
  },
};
const t = TEXTE[document.documentElement.lang] || TEXTE.en;

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
      arataStare("eroare", t.verificaCampurile);
      form.querySelector("[aria-invalid]")?.focus();
      return;
    }

    buton.disabled = true;
    buton.textContent = t.seTrimite;
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
        throw new Error(corp.error || t.nuAmPututTrimite);
      }
      form.reset();
      form.elements.mesaj.value = mesajImplicit();
      arataStare("ok",
        t.primit(corp.id) + (corp.email ? t.copiePe(date.email) : t.confirmamPe(date.email)));
      buton.textContent = t.trimisa;
    } catch (e) {
      /* `retea` e pus de fetchCuTimeout la expirare; un TypeError e fetch-ul
         picat înainte de răspuns (conexiune căzută). Restul sunt verdictele
         serverului, cu mesajul lui — acela rămâne în română, vezi comentariul
         de la `TEXTE` mai sus. */
      const text = e?.retea ? MESAJ_TIMEOUT
        : e instanceof TypeError ? t.nuAmPututTrimiteConexiune
        : (e?.message || t.nuAmPututTrimiteGeneric);
      arataStare("eroare", text);
      buton.disabled = false;
      buton.textContent = t.trimite;
    }
  });
}
