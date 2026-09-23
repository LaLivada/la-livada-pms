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
    titlu: "Cazare în Vaslui – Tiny Houses & Lofturi La Livada",
    lede: "14 tiny houses și 2 lofturi în curtea Complexului La Livada, la Muntenii de Jos. "
      + "Vezi ce e liber și rezervă direct, fără intermediari.",
    galerieLabel: "Galerie",
    galerieTitlu: "Casele, aleea și camerele",
    /* Capitolele de sub galerie și întrebările frecvente de pe prima pagină
       (booking/index.html): aceleași chei în toate cele 7 limbi; textul
       românesc de aici e cel din HTML, cuvânt cu cuvânt — src/booking-seo.test.js
       le compară. Faptele: 8 tiny houses de 2 locuri și 6 de 3 (tabela rooms),
       2 lofturi, parcare gratuită (Ovidiu, 23 septembrie 2026). */
    seo: {
      aproape: {
        titlu: "Cazare aproape de Vaslui, cu rezervare directă",
        p1: "Suntem pe DN24, la Muntenii de Jos, la marginea Vasluiului dinspre Bârlad. "
          + "Cazarea face parte din Complexul La Livada, în aceeași curte cu sălile de "
          + "evenimente și cu grădina, dar se rezervă și separat: pentru o noapte în trecere, "
          + "un weekend sau o deplasare de lucru în județul Vaslui.",
        p2: "Pagina asta e locul în care se face rezervarea. Disponibilitatea de mai sus e "
          + "cea reală, din sistemul nostru de recepție, iar rezervarea intră direct în "
          + "calendarul pensiunii — fără platforme intermediare și fără comision adăugat la "
          + "preț. Primești confirmarea pe email, cu numărul rezervării și un link din care o "
          + "poți revedea sau anula.",
        link: "Descoperă Complex La Livada",
      },
      tiny: {
        titlu: "Tiny houses La Livada",
        p1: "Cele 14 tiny houses sunt case mici, de sine stătătoare, așezate printre pomii "
          + "din livadă. Opt sunt pentru două persoane; șase au, pe lângă patul dublu, un pat "
          + "etajat pentru copii, deci încap doi adulți și un copil.",
        p2: "Fiecare casă are baie proprie, aer condiționat și terasa ei. Seara, aleea dintre "
          + "case e luminată — o vezi în galeria de mai sus.",
        link: "Mai multe despre cazarea La Livada",
      },
      loft: {
        titlu: "Lofturile La Livada",
        p1: "Cele două lofturi sunt pentru două persoane, cu patul la mezanin. Interioarele "
          + "din galerie sunt ale lor. Le alegi de obicei în cuplu, sau când stai mai multe "
          + "nopți și preferi o cameră în locul unei căsuțe.",
      },
      facilitati: {
        titlu: "Facilități",
        p1: "În fiecare unitate, fără excepție: baie proprie, aer condiționat și terasă. În "
          + "cameră intri cu un cod primit la sosire, deci nu depinzi de o recepție cu "
          + "program.",
        p2: "În curte: parcare gratuită, grădina cu cele trei lacuri cu pești koi, aleile "
          + "dintre case și sălile de evenimente ale complexului.",
      },
      weekend: {
        titlu: "Cazare pentru weekend, tranzit sau deplasări de serviciu",
        p1: "DN24 e drumul dintre Vaslui și Bârlad; dacă ești în trecere, poți rezerva o "
          + "singură noapte, cu sosire de la ora 14 și plecare până la 11. Mașina o lași în "
          + "curte, parcarea e gratuită.",
        p2: "Pentru deplasări de serviciu, factura se emite pe firmă: completezi datele de "
          + "facturare direct în formular, la pasul cu datele tale. Pentru weekend, alegi "
          + "datele și vezi pe loc ce e liber; dacă veniți cu un copil, caută pentru trei "
          + "persoane — casele cu pat etajat sunt cele în care încap trei.",
        p3: "Dacă ești invitat la un eveniment organizat la La Livada, camera e la câțiva "
          + "metri de sală — rezervi la fel, de aici, sau întrebi organizatorii dacă au "
          + "reținut deja camere pentru invitați.",
      },
      inainte: {
        titlu: "Înainte să rezervi",
        p1: "Sosirea e de la ora 14, plecarea până la ora 11. După ce trimiți rezervarea, "
          + "vezi pe ecran numărul de confirmare și primești imediat un email cu datele "
          + "sejurului, prețul și linkul de revedere.",
        p2: "Plata se face cu cardul, online, prin NETOPIA, ori la sosire sau prin transfer "
          + "bancar, cum alegi în formular. La anulare se încasează contravaloarea primei "
          + "nopți; restul se restituie. Pentru alte date sau altă cameră, sună-ne sau "
          + "scrie-ne înainte să anulezi.",
        link: "Politica de anulare",
      },
      unde: {
        titlu: "Unde ne găsești",
        p1: "DN24, nr. 743, Muntenii de Jos, județul Vaslui — la marginea Vasluiului, pe "
          + "drumul dinspre Bârlad.",
        p2: "Harta și indicațiile de drum sunt pe pagina de contact a complexului.",
        link: "Pagina de contact",
      },
    },
    faq: {
      eticheta: "Pe scurt",
      titlu: "Întrebări frecvente",
      q1: "Unde este situată cazarea La Livada?",
      a1: "În Complexul La Livada, pe DN24, nr. 743, la Muntenii de Jos — la marginea "
        + "Vasluiului, pe drumul dinspre Bârlad.",
      q2: "Câte unități de cazare sunt disponibile?",
      a2: "16, toate în aceeași curte: 14 tiny houses și 2 lofturi. Fiecare are baie "
        + "proprie, aer condiționat și terasă.",
      q3: "Pot rezerva direct online?",
      a3: "Da, de pe pagina asta. Alegi datele și numărul de persoane, vezi ce e liber și "
        + "trimiți rezervarea; confirmarea vine pe email, cu un link din care o poți "
        + "revedea sau anula.",
      q4: "La Livada oferă tiny houses?",
      a4: "Da: 14 case mici, de sine stătătoare, printre pomii din livadă — 8 pentru două "
        + "persoane și 6 pentru două persoane cu pat etajat pentru un copil.",
      q5: "Există cazare pentru deplasări de serviciu?",
      a5: "Da. Poți rezerva o noapte sau mai multe, iar factura se emite pe firmă — datele "
        + "de facturare se completează în formular, la pasul cu datele tale.",
      q6: "Cât de departe este cazarea de Vaslui?",
      a6: "Suntem la marginea orașului, la Muntenii de Jos, pe DN24 — la câțiva metri de "
        + "intrarea în Vaslui, pe partea dinspre Bârlad.",
      q7: "Care sunt orele de sosire și de plecare?",
      a7: "Sosirea e de la ora 14, plecarea până la ora 11.",
      q8: "Există parcare?",
      a8: "Da, parcarea e gratuită, în curtea complexului.",
      q9: "Ce se întâmplă dacă anulez?",
      a9: "Poți anula oricând din linkul din email. Se încasează contravaloarea primei "
        + "nopți; restul se restituie.",
      a9link: "Politica de anulare",
    },
  },

  /* Antetul și subsolul statice (booking/_antet.html, booking/_subsol.html)
     — injectate identic pe fiecare pagină, traduse la încărcare de
     booking/limba-selector.js. Numele sălilor/spațiilor de pe lalivada.ro
     (Sera, Magnifique, Grand'Or Ballroom, PRIVÉ) sunt nume proprii și NU
     apar aici — rămân netraduse direct în HTML. */
  antet: {
    ariaMarca: "Rezervări La Livadă — pagina de start",
    ariaAlegeLimba: "Alege limba",
    ariaDeschideMeniul: "Deschide meniul",
    ariaPrincipal: "Principal",
    ariaTotSitul: "Tot site-ul",
    nav: { sali: "Sălile", nunti: "Nunți", experienta: "Experiența", galerie: "Galerie", contact: "Contact" },
    cta: "Verifică disponibilitatea",
    grup1: { nume: "Prima pagină", kicker: "Cazare La Livadă" },
    grup2: { nume: "Sălile", kicker: "Patru spații", toate: "Toate spațiile" },
    grup3: {
      nume: "Evenimente", kicker: "Ce sărbătorim aici",
      nunti: "Nunți", cununii: "Cununii în aer liber", botezuri: "Botezuri", corporate: "Evenimente corporate",
    },
    grup4: {
      nume: "Experiența", kicker: "Cum se petrece ziua",
      experienta: "Experiența La Livadă", meniu: "Meniul și oferta", cazare: "Cazare", nuntaProba: "Nunta de Probă",
    },
    grup5: { nume: "Galerie", kicker: "Cum arată, de fapt" },
  },

  subsol: {
    seo: "Cazare în Vaslui, în curtea Complexului La Livadă: 16 unități — două loft-uri și "
      + "paisprezece camere în case tip tiny house, fiecare cu baie proprie, aer condiționat "
      + "și terasă. Suntem pe DN24, în Muntenii de Jos, la câțiva metri de intrarea în "
      + "Vaslui — cazare deopotrivă pentru invitații la evenimente, cât și pentru o oprire "
      + "de weekend ori o deplasare de lucru în județul Vaslui. Rezervarea se face direct "
      + "aici, fără intermediari.",
    col1: { titlu: "Sălile" },
    col2: {
      titlu: "Evenimente",
      nunti: "Nunți", botezuri: "Botezuri", cununii: "Cununii în aer liber", corporate: "Evenimente corporate",
    },
    col3: { titlu: "Detalii", meniu: "Meniu și oferta", cazare: "Cazare", nuntaProba: "Nunta de Probă", galerie: "Galerie" },
    col4: { titlu: "Contact" },
    adresa: "DN24, nr. 743, Muntenii de Jos, jud. Vaslui",
    legal: {
      termeni: "Termeni și condiții", livrare: "Politica de livrare", anulare: "Politica de anulare",
      retragere: "Retragere din contract", confidentialitate: "Confidențialitate", cookies: "Cookies",
    },
  },

  calendar: {
    lunaAnterioara: "Luna anterioară",
    lunaUrmatoare: "Luna următoare",
    alegeZiuaPlecarii: "Alege și ziua plecării.",
    apasaPentruAltaPerioada: "Apasă o zi ca să alegi altă perioadă.",
    apasaSosireaApoiPlecarea: "Apasă ziua sosirii, apoi pe cea a plecării.",
  },
};
