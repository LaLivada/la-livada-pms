/* Continutul editorial in germana, tradus si aprobat 19 septembrie 2026.
 * Aceeasi forma (aceleasi chei) ca in continut.ro.js — verificat de
 * continut-forme.test.js. REGULAMENT si ATRACTII_TEXT nu mai sunt aici
 * din Task 7 — traiesc separat, in regulament.<lang>.js si
 * atractii-text.<lang>.js, incarcate lenes din continut-mare.js. */

export const asistentaRaspuns = "antwortet innerhalb weniger Minuten";

export const BUN_VENIT = {
  intro: "Wir freuen uns, dass Sie hier sind, und wünschen Ihnen einen angenehmen Aufenthalt.",
  puncte: [
    {
      titlu: "Kostenloses WLAN",
      inainte: "Das Netzwerk ",
      dupa: ", ohne Passwort.",
      actiune: "wifi",
    },
    {
      titlu: "Speichern Sie die Seite auf Ihrem Handy",
      text: "Der Code und die Türöffnungstaste bleiben während Ihres gesamten Aufenthalts griffbereit.",
      actiune: "instalare",
    },
  ],
};

export const IMPORTANT = [
  { titlu: "Rauchen", text: "Im Zimmer und in Innenräumen verboten — draußen erlaubt. Rauchen im Zimmer wird mit 500 Lei berechnet." },
  { titlu: "Ruhe", text: "Bitte halten Sie zwischen 22:00 und 8:00 Uhr Ruhe." },
  { titlu: "Haustiere", text: "Willkommen, gegen eine Gebühr von 50 Lei pro Aufenthalt." },
  { titlu: "Parken", text: "Kostenlos vor Ort, auf eigene Verantwortung des Fahrzeughalters." },
];

export const ACCES_CAMERE_DESCRIERI = [
  { fisier: "1-intrarea.jpg", descriere: "Fahren Sie durch den Parkplatz rechts ein und folgen Sie der Fahrtrichtung." },
  { fisier: "2-aleea.jpg",    descriere: "An diesem Schild geradeaus weiterfahren." },
  { fisier: "3-parcarea.jpg", descriere: "Sie haben den Parkplatz erreicht." },
  { fisier: "4-poteca.jpg",   descriere: "Der Zugang zu den Zimmern erfolgt über den Weg rechts, am Grand'Or Ballroom vorbei." },
];
