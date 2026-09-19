/* Textele de interfata in engleza, traduse si aprobate 19 septembrie 2026.
 * Aceeasi forma ca in interfata.ro.js — verificat de
 * continut-forme.test.js. */
export const TEXTE = {
  acces: {
    eticheta: "Room access",
    deschideUsa: "Open the door",
    sauTasteaza: "Or type the code on the door",
    valabilPana: "Valid until",
    codLipsa: "The code isn't ready yet. Reload the page in a few minutes or call us — meanwhile, you can enter with the button above.",
  },
  refuzuri: {
    incearcaDinNou: "Try again",
    sunaRecetia: "Call reception",
    neinceput: { titlu: "Your stay hasn't started yet", text: "The page opens on its own when you check in. The access code appears here right after check-in." },
    incheiat: { titlu: "Your stay has ended", text: "The link expired when you left. Thank you for staying with us." },
    anulat: { titlu: "Reservation is no longer active", text: "If this is a mistake, call us and we'll sort it out right away." },
    necunoscut: { titlu: "Link isn't working", text: "Check that you opened it in full, exactly as you received it. If it still doesn't work, call us." },
    "prea-multe": { titlu: "Too many attempts", text: "Wait a few minutes and try again. If you're in a hurry, call us." },
    lipsa: { titlu: "Incomplete link", text: "The address is missing the stay's code. Open the full link, exactly as you received it." },
    eroare: { titlu: "Something went wrong", text: "We couldn't load the data. Try again; if it still doesn't work, call us." },
    timeout: { titlu: "Server didn't respond", text: "It's not the link's fault: the server didn't respond in time. Check your internet and try again; if you're at the door, call us." },
  },
  instalare: {
    pasiIos: [
      { inainte: "Tap ", tare: "Share", dupa: " — the square with the arrow pointing up, in the bottom bar." },
      { inainte: "Scroll down and choose ", tare: "Add to Home Screen", dupa: "." },
      { inainte: "Confirm with ", tare: "Add", dupa: ", top right." },
    ],
    pasiAndroid: [
      { inainte: "Tap ", tare: "⋮", dupa: " in the top-right corner." },
      { inainte: "Choose ", tare: "Add to Home screen", dupa: " or ", tare2: "Install app", dupa2: "." },
      { inainte: "Confirm with ", tare: "Add", dupa: "." },
    ],
    pasiWifiIos: [
      { inainte: "Open ", tare: "Settings", dupa: " → ", tare2: "Wi-Fi", dupa2: "." },
      { inainte: "Choose ", dupa: " from the list." }, // `tare` = WIFI.retea, injectat in App.jsx
      { text: "Done — the network doesn't ask for a password." },
    ],
    pasiWifiAndroid: [
      { inainte: "Pull down the top bar and press and hold ", tare: "Wi-Fi", dupa: "." },
      { inainte: "Choose ", dupa: " from the list." },
      { text: "Done — the network doesn't ask for a password." },
    ],
  },
  fisa: {
    titluFereastra: "Guest registration form",
    intro: "Required at check-in, once per stay.",
    ajutor: { inainte: "The network ", mijloc: ", no password. If you get stuck, call ", dupa: " at" },
    campEtichete: {
      nume: "Last name", prenume: "First name", dataNasterii: "Date of birth",
      loculNasterii: "Place of birth", nationalitate: "Nationality",
      tara: "Country of residence", adresa: "Address", localitate: "City",
      scopul: "Purpose of trip", actTip: "ID type",
      actSeria: "Series", actNumarul: "Number",
    },
    actTipEtichete: { ci: "ID card", pasaport: "Passport", permis: "Residence permit" },
    dacaAre: "(if applicable)",
    dataZiua: "Day", dataLuna: "Month", dataAnul: "Year",
    eroriCamp: {
      LIPSA: (eticheta) => `${eticheta} is missing.`,
      DATA_INVALIDA: "Date of birth isn't a valid date.",
      DATA_VIITOR: "Date of birth can't be in the future.",
      AN_SUSPECT: "Check the birth year.",
      ACT_NECUNOSCUT: "Choose an ID type from the list.",
    },
    eroareSemnatura: "Sign in the box above.",
    dejaCompletata: "The form has already been submitted.",
    eroareTrimitere: "Couldn't submit the form. Please try again.",
    trimite: "Sign and submit",
    trimitAcum: "Submitting…",
    seIncarca: "Loading…",
  },
};
