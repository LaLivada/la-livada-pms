/* Textele de interfata ale paginii oaspetelui — butoane, etichete, mesaje
 * de eroare, tot ce e scris direct in JSX si NU vine din continut.js.
 * Aceeasi forma trebuie sa existe si in interfata.en.js, .fr.js, .it.js,
 * .de.js, .ru.js, .uk.js — verificat de continut-forme.test.js. */
export const TEXTE = {
  acces: {
    eticheta: "Acces cameră",
    deschideUsa: "Deschide ușa",
    sauTasteaza: "Sau tastează codul pe ușă",
    valabilPana: "Valabil până",
    codLipsa: "Codul nu e încă pregătit. Reîncarcă pagina în câteva minute sau sună-ne — între timp, poți intra cu butonul de mai sus.",
  },
  refuzuri: {
    incearcaDinNou: "Încearcă din nou",
    sunaRecetia: "Sună recepția",
    neinceput: { titlu: "Sejurul n-a început încă", text: "Pagina se deschide singură când te cazezi. Codul de acces apare aici imediat după check-in." },
    incheiat: { titlu: "Sejurul s-a încheiat", text: "Linkul a expirat odată cu plecarea. Îți mulțumim că ai stat la noi." },
    anulat: { titlu: "Rezervarea nu mai este activă", text: "Dacă e o greșeală, sună-ne și o lămurim pe loc." },
    necunoscut: { titlu: "Linkul nu funcționează", text: "Verifică dacă l-ai deschis întreg, așa cum l-ai primit. Dacă tot nu merge, sună-ne." },
    "prea-multe": { titlu: "Prea multe încercări", text: "Așteaptă câteva minute și încearcă din nou. Dacă te grăbești, sună-ne." },
    lipsa: { titlu: "Link incomplet", text: "Adresa nu conține codul sejurului. Deschide linkul întreg, așa cum l-ai primit." },
    eroare: { titlu: "Ceva n-a mers", text: "N-am putut încărca datele. Încearcă din nou; dacă tot nu merge, sună-ne." },
    timeout: { titlu: "Serverul n-a răspuns", text: "Nu e vina linkului: serverul n-a răspuns la timp. Verifică internetul și încearcă din nou; dacă ești în fața ușii, sună-ne." },
  },
  instalare: {
    pasiIos: [
      { inainte: "Apasă ", tare: "Partajare", dupa: " — pătratul cu săgeata în sus, în bara de jos." },
      { inainte: "Derulează și alege ", tare: "Adaugă la ecranul principal", dupa: "." },
      { inainte: "Confirmă cu ", tare: "Adaugă", dupa: ", sus în dreapta." },
    ],
    pasiAndroid: [
      { inainte: "Apasă ", tare: "⋮", dupa: " în colțul din dreapta sus." },
      { inainte: "Alege ", tare: "Adaugă la ecranul principal", dupa: " sau ", tare2: "Instalează aplicația", dupa2: "." },
      { inainte: "Confirmă cu ", tare: "Adaugă", dupa: "." },
    ],
    pasiWifiIos: [
      { inainte: "Deschide ", tare: "Setări", dupa: " → ", tare2: "Wi-Fi", dupa2: "." },
      { inainte: "Alege ", dupa: " din listă." }, // `tare` = WIFI.retea, injectat in App.jsx
      { text: "Gata — rețeaua nu cere parolă." },
    ],
    pasiWifiAndroid: [
      { inainte: "Trage în jos bara de sus și ține apăsat pe ", tare: "Wi-Fi", dupa: "." },
      { inainte: "Alege ", dupa: " din listă." },
      { text: "Gata — rețeaua nu cere parolă." },
    ],
  },
  fisa: {
    titluFereastra: "Fișă de cazare",
    intro: "E obligatorie la cazare, o singură dată pe sejur.",
    ajutor: { inainte: "Rețeaua ", mijloc: ", fără parolă. Dacă te împotmolești, sună-l pe ", dupa: " la" },
    campEtichete: {
      nume: "Nume", prenume: "Prenume", dataNasterii: "Data nașterii",
      loculNasterii: "Locul nașterii", nationalitate: "Naționalitate",
      tara: "Țara de domiciliu", adresa: "Adresa", localitate: "Localitatea",
      scopul: "Scopul călătoriei", actTip: "Act de identitate",
      actSeria: "Seria", actNumarul: "Numărul",
    },
    actTipEtichete: { ci: "Carte de identitate", pasaport: "Pașaport", permis: "Permis de ședere" },
    dacaAre: "(dacă are)",
    dataZiua: "Ziua", dataLuna: "Luna", dataAnul: "Anul",
    eroriCamp: {
      LIPSA: (eticheta) => `${eticheta} lipsește.`,
      DATA_INVALIDA: "Data nașterii nu e o dată validă.",
      DATA_VIITOR: "Data nașterii nu poate fi în viitor.",
      AN_SUSPECT: "Verifică anul nașterii.",
      ACT_NECUNOSCUT: "Alege un tip de act din listă.",
    },
    eroareSemnatura: "Semnează în chenarul de mai sus.",
    dejaCompletata: "Fișa e deja completată.",
    eroareTrimitere: "Nu am putut trimite fișa. Mai încearcă o dată.",
    trimite: "Semnez și trimit",
    trimitAcum: "Trimit…",
    seIncarca: "Se încarcă…",
  },
};
