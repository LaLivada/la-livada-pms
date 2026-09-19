/* Textele de interfata in italiana, traduse si aprobate 19 septembrie 2026.
 * Aceeasi forma ca in interfata.ro.js — verificat de
 * continut-forme.test.js. */
export const TEXTE = {
  acces: {
    eticheta: "Accesso alla camera",
    deschideUsa: "Apri la porta",
    sauTasteaza: "Oppure digita il codice sulla porta",
    valabilPana: "Valido fino al",
    codLipsa: "Il codice non è ancora pronto. Ricarica la pagina tra qualche minuto o chiamaci — nel frattempo puoi entrare con il pulsante qui sopra.",
  },
  refuzuri: {
    incearcaDinNou: "Riprova",
    sunaRecetia: "Chiama la reception",
    neinceput: { titlu: "Il soggiorno non è ancora iniziato", text: "La pagina si apre da sola al check-in. Il codice di accesso appare qui subito dopo il check-in." },
    incheiat: { titlu: "Il soggiorno è terminato", text: "Il link è scaduto alla tua partenza. Grazie per aver soggiornato da noi." },
    anulat: { titlu: "La prenotazione non è più attiva", text: "Se si tratta di un errore, chiamaci e risolveremo subito." },
    necunoscut: { titlu: "Il link non funziona", text: "Controlla di averlo aperto per intero, così come lo hai ricevuto. Se continua a non funzionare, chiamaci." },
    "prea-multe": { titlu: "Troppi tentativi", text: "Attendi qualche minuto e riprova. Se hai fretta, chiamaci." },
    lipsa: { titlu: "Link incompleto", text: "L'indirizzo non contiene il codice del soggiorno. Apri il link completo, così come lo hai ricevuto." },
    eroare: { titlu: "Qualcosa è andato storto", text: "Non siamo riusciti a caricare i dati. Riprova; se continua a non funzionare, chiamaci." },
    timeout: { titlu: "Il server non ha risposto", text: "Non è colpa del link: il server non ha risposto in tempo. Controlla la connessione e riprova; se sei davanti alla porta, chiamaci." },
  },
  instalare: {
    pasiIos: [
      { inainte: "Tocca ", tare: "Condividi", dupa: " — il quadrato con la freccia verso l'alto, nella barra in basso." },
      { inainte: "Scorri e scegli ", tare: "Aggiungi alla schermata Home", dupa: "." },
      { inainte: "Conferma con ", tare: "Aggiungi", dupa: ", in alto a destra." },
    ],
    pasiAndroid: [
      { inainte: "Tocca ", tare: "⋮", dupa: " in alto a destra." },
      { inainte: "Scegli ", tare: "Aggiungi a schermata Home", dupa: " oppure ", tare2: "Installa app", dupa2: "." },
      { inainte: "Conferma con ", tare: "Aggiungi", dupa: "." },
    ],
    pasiWifiIos: [
      { inainte: "Apri ", tare: "Impostazioni", dupa: " → ", tare2: "Wi-Fi", dupa2: "." },
      { inainte: "Scegli ", dupa: " dalla lista." }, // `tare` = WIFI.retea, injectat in App.jsx
      { text: "Fatto — la rete non richiede una password." },
    ],
    pasiWifiAndroid: [
      { inainte: "Trascina in basso la barra in alto e tieni premuto su ", tare: "Wi-Fi", dupa: "." },
      { inainte: "Scegli ", dupa: " dalla lista." },
      { text: "Fatto — la rete non richiede una password." },
    ],
  },
  fisa: {
    titluFereastra: "Scheda di registrazione ospite",
    intro: "Obbligatoria al check-in, una sola volta a soggiorno.",
    ajutor: { inainte: "La rete ", mijloc: ", senza password. Se hai problemi, chiama ", dupa: " al" },
    campEtichete: {
      nume: "Cognome", prenume: "Nome", dataNasterii: "Data di nascita",
      loculNasterii: "Luogo di nascita", nationalitate: "Nazionalità",
      tara: "Paese di residenza", adresa: "Indirizzo", localitate: "Città",
      scopul: "Motivo del viaggio", actTip: "Tipo di documento",
      actSeria: "Serie", actNumarul: "Numero",
    },
    actTipEtichete: { ci: "Carta d'identità", pasaport: "Passaporto", permis: "Permesso di soggiorno" },
    dacaAre: "(se presente)",
    dataZiua: "Giorno", dataLuna: "Mese", dataAnul: "Anno",
    eroriCamp: {
      LIPSA: (eticheta) => `${eticheta} mancante.`,
      DATA_INVALIDA: "La data di nascita non è una data valida.",
      DATA_VIITOR: "La data di nascita non può essere nel futuro.",
      AN_SUSPECT: "Controlla l'anno di nascita.",
      ACT_NECUNOSCUT: "Scegli un tipo di documento dall'elenco.",
    },
    eroareSemnatura: "Firma nel riquadro sopra.",
    dejaCompletata: "La scheda è già stata inviata.",
    eroareTrimitere: "Impossibile inviare la scheda. Riprova.",
    trimite: "Firma e invia",
    trimitAcum: "Invio…",
    seIncarca: "Caricamento…",
  },
};
