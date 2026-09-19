/* Dicționarul românesc — sursa de-adevăr pentru chei. Orice cheie lipsă
   din celelalte limbi cade înapoi aici (vezi context.jsx). */
export default {
  pasi: {
    perioada: "Perioada",
    camerele: "Camerele",
    datele: "Datele tale",
    gata: "Gata",
  },

  cuvinte: {
    noapte: { one: "noapte", other: "nopți" },
    adult: { one: "adult", other: "adulți" },
    copil: { one: "copil", other: "copii" },
    camera: { one: "cameră", other: "camere" },
    persoana: { one: "persoană", other: "persoane" },
    minut: { one: "minut", few: "minute", many: "minute", other: "minute" },
  },

  tipCamera: {
    mixt: "Camere mixte",
  },

  cautare: {
    titlu: "Verifică disponibilitatea",
    subtitluPerioada: "{{nopti}} {{cuvantNopti}} · sosire de la ora 14, plecare până la 11",
    subtitluGol: "Alege perioada sejurului",
    nopti: "Nopți",
    adulti: "Adulți",
    copii: "Copii",
    verificand: "Verific disponibilitatea…",
    cautaCamere: "Caută camere",
  },

  schelet: {
    incarcaRezervare: "Se încarcă rezervarea…",
    verificaDisponibilitate: "Verific disponibilitatea…",
  },

  rezultate: {
    titlu: "Camere disponibile",
    subtitlu: "{{sosire}} → {{plecare}} · {{adulti}} {{cuvantAdulti}}",
    subtitluCuCopii: "{{sosire}} → {{plecare}} · {{adulti}} {{cuvantAdulti}} · {{copii}} {{cuvantCopii}}",
    nimicLiber: "Nicio cameră liberă în perioada aleasă.",
    nimicLiberSfat: "Încearcă alte date sau sună-ne — poate găsim o soluție.",
    persoane: "{{n}} {{cuvantPersoane}}",
    totalPerioada: "{{n}} {{cuvantNopti}}, total",
    totalEstimat: "Total estimat",
    alegeVarianta: "Alege o variantă",
    continua: "Continuă",
    fotografii: "Fotografii",
  },

  date: {
    titlu: "Datele tale",
    subtitlu: "Îți trimitem confirmarea și te contactăm doar pentru rezervare.",
    perioada: "Perioada",
    nume: "Nume",
    prenume: "Prenume",
    telefon: "Telefon",
    prefixInternational: "Prefix internațional",
    altPrefix: "Alt prefix…",
    prefixulTarii: "Prefixul țării",
    numarulDeTelefon: "Numărul de telefon",
    email: "Email",
    emailPlaceholder: "pentru confirmare rezervare",
    localitate: "Localitate",
    judet: "Județ",
    tara: "Țara",
    obligatoriiCuJudet: "Toate câmpurile de mai sus sunt obligatorii.",
    obligatoriiFaraJudet: "Toate câmpurile de mai sus sunt obligatorii, în afară de județ.",
    cerinteSpeciale: "Cerințe speciale",
    cerinteSpecialePlaceholder: "ex. sosire după ora 22, pat suplimentar",
    inapoi: "Înapoi",
    trimite: "Trimite rezervarea",
    seTrimite: "Se trimite…",
  },

  firma: {
    bifa: "Facturare pe societate",
    denumire: "Denumire firmă",
    cui: "CUI",
    cuiPlaceholder: "ex. RO12345678",
    regCom: "Nr. Reg. Com. (opțional)",
    regComPlaceholder: "ex. J1/23/2020",
    adresa: "Adresă sediu",
    oras: "Oraș",
    judet: "Județ",
  },

  plata: {
    card: "Plătește cu cardul",
    cardDescriere: "Sigur, prin NETOPIA. Te trimite direct la plată.",
    cash: "cash la sosire",
    transfer: "transfer bancar",
  },

  confirmare: {
    titluAnulata: "Rezervarea a fost anulată",
    titluMaiEUnPas: "Mai e un pas",
    titluExpirata: "Rezervarea nu a mai fost confirmată",
    titluInregistrata: "Rezervarea e înregistrată",
    noteazaNumarul: "Notează numărul — îl folosim când ne suni.",
    peNumele: "Pe numele",
    perioada: "Perioada",
    camere: "Camere",
    total: "Total",

    anulataMesaj: "Camerele au fost eliberate. Dacă a fost o greșeală, sună-ne — putem verifica dacă mai sunt disponibile.",
    anulataRambursare: "Vei primi înapoi {{suma}} pe cardul folosit — se face manual, în câteva zile lucrătoare.",

    cardEsuatTitlu: "Plata cu cardul nu a trecut.",
    cardEsuatDetalii: "Banca nu a autorizat plata — nu s-a reținut nimic. Ținem camerele {{minute}}, deci poți încerca din nou, cu același card sau cu altul.",
    incearcaPlataDinNou: "Încearcă plata din nou",
    sePregatestePlata: "Se pregătește plata…",

    verificamPlataTitlu: "Verificăm plata cu NETOPIA.",
    verificamPlataDetalii: "Dacă ai fost adus înapoi de pe pagina de plată, confirmarea poate dura câteva secunde. Reîmprospătează pagina dacă nu se actualizează singură.",

    emailTrimisTitlu: "Ți-am trimis un email la {{email}}.",
    adresaData: "adresa dată",
    emailTrimisDetalii: "Apasă butonul din mesaj ca rezervarea să devină fermă. Ținem camerele {{minute}}; dacă nu confirmi, se eliberează singure și poți relua căutarea oricând. Verifică și în Spam.",

    expirataMesaj: "Confirmarea a venit prea târziu și camerele s-au eliberat. Nu s-a reținut nimic — caută din nou perioada dorită sau sună-ne și îți facem rezervarea pe loc.",

    cardConfirmatTitlu: "Am primit plata — rezervarea e confirmată.",
    cardConfirmatDetalii: "Ți-am trimis și un email de confirmare. Te așteptăm!",

    implicitMesaj: "Te contactăm telefonic pentru confirmare. Plata se face la sosire.",

    sigurAnulezi: "Sigur anulezi rezervarea?",
    anulareDetaliiInainte: "Camerele se eliberează imediat și s-ar putea să nu mai fie disponibile dacă te răzgândești. Conform ",
    politiciiDeAnulare: "politicii de anulare",
    anulareDetaliiDupa: ", contravaloarea primei nopți de cazare se încasează integral.",
    pastrezRezervarea: "Nu, păstrez rezervarea",
    seAnuleaza: "Se anulează…",
    daAnuleaza: "Da, anulează",
    anuleazaRezervarea: "Anulează rezervarea",

    linkRevedereInainte: "Poți revedea sau anula rezervarea oricând la ",
    acestLink: "acest link",
    linkRevedereDupa: " — păstrează-l. Ți l-am trimis și pe email.",
  },

  countdown: {
    putin: "un timp scurt",
    unMinut: "încă un minut",
    inca: "încă {{m}} {{cuvant}}",
  },

  eroare: {
    camaraOcupata: "Între timp camera s-a ocupat. Am actualizat disponibilitatea — alege din nou sau schimbă datele.",
    reluarePlataImposibila: "Nu mai putem relua plata din această pagină (ai deschis-o din alt tab sau de pe alt dispozitiv). Sună-ne și o rezolvăm pe loc.",
    rezervareaNuAFostGasita: "Rezervarea nu a fost găsită.",
  },

  /* Antetul static al paginii principale (booking/index.html) — în afara
     motorului React, dar tot parte din pagina de rezervări. Aplicat de
     booking/limba-selector.js, o singură dată la încărcare. */
  landing: {
    titlu: "Cazare Tiny houses",
    lede: "Complex LA LIVADA - Vaslui",
    galerieLabel: "Galerie",
    galerieTitlu: "Casele, aleea și camerele",
  },

  calendar: {
    lunaAnterioara: "Luna anterioară",
    lunaUrmatoare: "Luna următoare",
    alegeZiuaPlecarii: "Alege și ziua plecării.",
    apasaPentruAltaPerioada: "Apasă o zi ca să alegi altă perioadă.",
    apasaSosireaApoiPlecarea: "Apasă ziua sosirii, apoi pe cea a plecării.",
  },
};
