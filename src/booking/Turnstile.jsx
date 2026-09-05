/* Widgetul Cloudflare Turnstile.
 *
 * Există doar dacă e configurată cheia publică (VITE_TURNSTILE_SITE_KEY).
 * Fără ea, componenta nu randează nimic și formularul merge exact ca
 * înainte — pagina poate fi livrată înainte ca cineva să facă contul
 * Cloudflare, fără să se oprească rezervările între timp.
 *
 * Jetonul obținut aici NU e o dovadă în sine: e verificat de funcția edge
 * cu cheia secretă, la server. Aici e doar culegerea lui.
 *
 * Nu blocăm butonul de trimis în lipsa jetonului. Un blocant de reclame
 * sau o rețea care taie domeniul Cloudflare ar lăsa oaspetele cu un buton
 * mort și fără explicație; așa, cererea pleacă și serverul răspunde cu un
 * mesaj care spune ce s-a întâmplat.
 */
import { useEffect, useRef } from "react";

const CHEIE_SITE = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const turnstileConfigurat = Boolean(CHEIE_SITE);

/* Un singur script per pagină, oricâte widgeturi. Promisiunea e păstrată
   ca să nu pornească două încărcări la o montare dublă (StrictMode). */
let incarcare = null;
function incarcaScript() {
  if (window.turnstile) return Promise.resolve();
  if (incarcare) return incarcare;
  incarcare = new Promise((rezolva, respinge) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.defer = true;
    s.onload = rezolva;
    s.onerror = () => respinge(new Error("Turnstile nu s-a încărcat."));
    document.head.appendChild(s);
  });
  return incarcare;
}

export function Turnstile({ onJeton }) {
  const gazda = useRef(null);
  const idWidget = useRef(null);
  /* Callback-ul stă într-un ref: altfel ar fi în lista de dependențe, iar
     o funcție recreată la fiecare randare ar reface widgetul la fiecare
     tastă apăsată în formular. */
  const trimiteJeton = useRef(onJeton);
  trimiteJeton.current = onJeton;

  useEffect(() => {
    if (!CHEIE_SITE) return undefined;
    let anulat = false;

    incarcaScript()
      .then(() => {
        if (anulat || !gazda.current || idWidget.current !== null) return;
        idWidget.current = window.turnstile.render(gazda.current, {
          sitekey: CHEIE_SITE,
          language: "ro",
          callback: (j) => trimiteJeton.current(j),
          // Jetonul e valabil câteva minute. Dacă expiră cât timp omul
          // completează formularul, îl aruncăm și widgetul îl reface.
          "expired-callback": () => trimiteJeton.current(""),
          "error-callback": () => trimiteJeton.current(""),
        });
      })
      .catch(() => trimiteJeton.current(""));

    return () => {
      anulat = true;
      if (idWidget.current !== null) {
        window.turnstile?.remove(idWidget.current);
        idWidget.current = null;
      }
    };
  }, []);

  if (!CHEIE_SITE) return null;
  return <div ref={gazda} className="ldv-turnstile" />;
}
