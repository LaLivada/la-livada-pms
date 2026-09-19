/* Continutul editorial in engleza, tradus si aprobat 19 septembrie 2026.
 * Aceeasi forma (aceleasi chei) ca in continut.ro.js — verificat de
 * continut-forme.test.js. REGULAMENT si ATRACTII_TEXT nu mai sunt aici
 * din Task 7 — traiesc separat, in regulament.<lang>.js si
 * atractii-text.<lang>.js, incarcate lenes din continut-mare.js. */

export const asistentaRaspuns = "replies within a few minutes";

export const BUN_VENIT = {
  intro: "We're glad you're here and wish you a pleasant stay.",
  puncte: [
    {
      titlu: "Free Wi-Fi",
      inainte: "The network ",
      dupa: ", no password.",
      actiune: "wifi",
    },
    {
      titlu: "Save the page to your phone",
      text: "The code and the door button stay within reach for your whole stay.",
      actiune: "instalare",
    },
  ],
};

export const IMPORTANT = [
  { titlu: "Smoking", text: "Prohibited in the room and indoor areas — allowed outside. Smoking in the room incurs a 500 RON charge." },
  { titlu: "Quiet hours", text: "Please keep quiet between 10:00 PM and 8:00 AM." },
  { titlu: "Pets", text: "Welcome, with a 50 RON fee per stay." },
  { titlu: "Parking", text: "Free on-site, at the car owner's own risk." },
];

export const ACCES_CAMERE_DESCRIERI = [
  { fisier: "1-intrarea.jpg", descriere: "Enter through the parking lot on the right and follow the direction of travel." },
  { fisier: "2-aleea.jpg",    descriere: "At this sign, keep going straight ahead." },
  { fisier: "3-parcarea.jpg", descriere: "You've arrived at the parking lot." },
  { fisier: "4-poteca.jpg",   descriere: "Access to the rooms is via the path on the right, past the Grand'Or Ballroom." },
];
