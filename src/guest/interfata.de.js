/* Textele de interfata in germana, traduse si aprobate 19 septembrie 2026.
 * Aceeasi forma ca in interfata.ro.js — verificat de
 * continut-forme.test.js. */
export const TEXTE = {
  acces: {
    eticheta: "Zimmerzugang",
    deschideUsa: "Tür öffnen",
    sauTasteaza: "Oder Code an der Tür eingeben",
    valabilPana: "Gültig bis",
    codLipsa: "Der Code ist noch nicht bereit. Laden Sie die Seite in ein paar Minuten neu oder rufen Sie uns an — in der Zwischenzeit können Sie mit dem obigen Button eintreten.",
  },
  refuzuri: {
    incearcaDinNou: "Erneut versuchen",
    sunaRecetia: "Rezeption anrufen",
    neinceput: { titlu: "Ihr Aufenthalt hat noch nicht begonnen", text: "Die Seite öffnet sich automatisch bei der Anreise. Der Zugangscode erscheint hier direkt nach dem Check-in." },
    incheiat: { titlu: "Ihr Aufenthalt ist beendet", text: "Der Link ist mit Ihrer Abreise abgelaufen. Vielen Dank, dass Sie bei uns waren." },
    anulat: { titlu: "Die Reservierung ist nicht mehr aktiv", text: "Falls dies ein Irrtum ist, rufen Sie uns an, und wir klären es sofort." },
    necunoscut: { titlu: "Der Link funktioniert nicht", text: "Prüfen Sie, ob Sie ihn vollständig geöffnet haben, genau wie erhalten. Falls es weiterhin nicht funktioniert, rufen Sie uns an." },
    "prea-multe": { titlu: "Zu viele Versuche", text: "Warten Sie ein paar Minuten und versuchen Sie es erneut. Falls Sie es eilig haben, rufen Sie uns an." },
    lipsa: { titlu: "Unvollständiger Link", text: "Die Adresse enthält nicht den Aufenthaltscode. Öffnen Sie den vollständigen Link, genau wie erhalten." },
    eroare: { titlu: "Etwas ist schiefgelaufen", text: "Wir konnten die Daten nicht laden. Versuchen Sie es erneut; falls es weiterhin nicht funktioniert, rufen Sie uns an." },
    timeout: { titlu: "Der Server hat nicht geantwortet", text: "Das liegt nicht am Link: Der Server hat nicht rechtzeitig geantwortet. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut; falls Sie vor der Tür stehen, rufen Sie uns an." },
  },
  instalare: {
    pasiIos: [
      { inainte: "Tippen Sie auf ", tare: "Teilen", dupa: " — das Quadrat mit dem Pfeil nach oben, in der unteren Leiste." },
      { inainte: "Scrollen Sie und wählen Sie ", tare: "Zum Home-Bildschirm", dupa: "." },
      { inainte: "Bestätigen Sie mit ", tare: "Hinzufügen", dupa: ", oben rechts." },
    ],
    pasiAndroid: [
      { inainte: "Tippen Sie auf ", tare: "⋮", dupa: " oben rechts." },
      { inainte: "Wählen Sie ", tare: "Zum Startbildschirm hinzufügen", dupa: " oder ", tare2: "App installieren", dupa2: "." },
      { inainte: "Bestätigen Sie mit ", tare: "Hinzufügen", dupa: "." },
    ],
    pasiWifiIos: [
      { inainte: "Öffnen Sie ", tare: "Einstellungen", dupa: " → ", tare2: "WLAN", dupa2: "." },
      { inainte: "Wählen Sie ", dupa: " aus der Liste." }, // `tare` = WIFI.retea, injectat in App.jsx
      { text: "Fertig — das Netzwerk erfordert kein Passwort." },
    ],
    pasiWifiAndroid: [
      { inainte: "Ziehen Sie die obere Leiste nach unten und halten Sie ", tare: "WLAN", dupa: " gedrückt." },
      { inainte: "Wählen Sie ", dupa: " aus der Liste." },
      { text: "Fertig — das Netzwerk erfordert kein Passwort." },
    ],
  },
  fisa: {
    titluFereastra: "Anmeldeformular",
    intro: "Beim Check-in erforderlich, einmal pro Aufenthalt.",
    ajutor: { inainte: "Das Netzwerk ", mijloc: ", ohne Passwort. Falls Sie nicht weiterkommen, rufen Sie ", dupa: " an unter" },
    campEtichete: {
      nume: "Nachname", prenume: "Vorname", dataNasterii: "Geburtsdatum",
      loculNasterii: "Geburtsort", nationalitate: "Staatsangehörigkeit",
      tara: "Wohnsitzland", adresa: "Adresse", localitate: "Stadt",
      scopul: "Reisezweck", actTip: "Ausweisart",
      actSeria: "Serie", actNumarul: "Nummer",
    },
    actTipEtichete: { ci: "Personalausweis", pasaport: "Reisepass", permis: "Aufenthaltstitel" },
    dacaAre: "(falls vorhanden)",
    dataZiua: "Tag", dataLuna: "Monat", dataAnul: "Jahr",
    eroriCamp: {
      LIPSA: (eticheta) => `${eticheta} fehlt.`,
      DATA_INVALIDA: "Das Geburtsdatum ist kein gültiges Datum.",
      DATA_VIITOR: "Das Geburtsdatum darf nicht in der Zukunft liegen.",
      AN_SUSPECT: "Überprüfen Sie das Geburtsjahr.",
      ACT_NECUNOSCUT: "Wählen Sie eine Ausweisart aus der Liste.",
    },
    eroareSemnatura: "Unterschreiben Sie im Feld oben.",
    dejaCompletata: "Das Formular wurde bereits übermittelt.",
    eroareTrimitere: "Das Formular konnte nicht übermittelt werden. Bitte versuchen Sie es erneut.",
    trimite: "Unterschreiben und senden",
    trimitAcum: "Wird gesendet…",
    seIncarca: "Wird geladen…",
  },
};
