export default {
  pasi: {
    perioada: "Période",
    camerele: "Chambres",
    datele: "Vos coordonnées",
    gata: "Terminé",
  },

  cuvinte: {
    noapte: { one: "nuit", other: "nuits" },
    adult: { one: "adulte", other: "adultes" },
    copil: { one: "enfant", other: "enfants" },
    camera: { one: "chambre", other: "chambres" },
    persoana: { one: "personne", other: "personnes" },
    minut: { one: "minute", other: "minutes" },
  },

  tipCamera: {
    mixt: "Chambres mixtes",
  },

  cautare: {
    titlu: "Vérifier la disponibilité",
    subtitluPerioada: "{{nopti}} {{cuvantNopti}} · arrivée à partir de 14h, départ jusqu'à 11h",
    subtitluGol: "Choisissez les dates de votre séjour",
    nopti: "Nuits",
    adulti: "Adultes",
    copii: "Enfants",
    verificand: "Vérification de la disponibilité…",
    cautaCamere: "Rechercher des chambres",
  },

  schelet: {
    incarcaRezervare: "Chargement de la réservation…",
    verificaDisponibilitate: "Vérification de la disponibilité…",
  },

  rezultate: {
    titlu: "Chambres disponibles",
    subtitlu: "{{sosire}} → {{plecare}} · {{adulti}} {{cuvantAdulti}}",
    subtitluCuCopii: "{{sosire}} → {{plecare}} · {{adulti}} {{cuvantAdulti}} · {{copii}} {{cuvantCopii}}",
    nimicLiber: "Aucune chambre disponible pour la période choisie.",
    nimicLiberSfat: "Essayez d'autres dates ou appelez-nous — nous trouverons peut-être une solution.",
    persoane: "{{n}} {{cuvantPersoane}}",
    totalPerioada: "{{n}} {{cuvantNopti}}, total",
    totalEstimat: "Total estimé",
    alegeVarianta: "Choisir une option",
    continua: "Continuer",
    fotografii: "Photos",
  },

  date: {
    titlu: "Vos coordonnées",
    subtitlu: "Nous vous envoyons la confirmation et ne vous contactons que pour la réservation.",
    perioada: "Période",
    nume: "Nom",
    prenume: "Prénom",
    telefon: "Téléphone",
    prefixInternational: "Indicatif international",
    altPrefix: "Autre indicatif…",
    prefixulTarii: "Indicatif du pays",
    numarulDeTelefon: "Numéro de téléphone",
    email: "Email",
    emailPlaceholder: "pour la confirmation de la réservation",
    localitate: "Ville",
    judet: "Département",
    tara: "Pays",
    obligatoriiCuJudet: "Tous les champs ci-dessus sont obligatoires.",
    obligatoriiFaraJudet: "Tous les champs ci-dessus sont obligatoires, sauf le département.",
    cerinteSpeciale: "Demandes particulières",
    cerinteSpecialePlaceholder: "ex. arrivée après 22h, lit supplémentaire",
    inapoi: "Retour",
    trimite: "Envoyer la réservation",
    seTrimite: "Envoi en cours…",
  },

  firma: {
    bifa: "Facturer à une société",
    denumire: "Raison sociale",
    cui: "N° TVA / SIRET",
    cuiPlaceholder: "ex. RO12345678",
    regCom: "N° Registre du commerce (facultatif)",
    regComPlaceholder: "ex. J1/23/2020",
    adresa: "Adresse du siège",
    oras: "Ville",
    judet: "Département",
  },

  plata: {
    card: "Payer par carte",
    cardDescriere: "En toute sécurité, via NETOPIA. Vous serez redirigé directement vers le paiement.",
    cash: "espèces à l'arrivée",
    transfer: "virement bancaire",
  },

  confirmare: {
    titluAnulata: "La réservation a été annulée",
    titluMaiEUnPas: "Encore une étape",
    titluExpirata: "La réservation n'a pas été confirmée à temps",
    titluInregistrata: "La réservation est enregistrée",
    noteazaNumarul: "Notez le numéro — nous l'utiliserons lorsque vous nous appellerez.",
    peNumele: "Au nom de",
    perioada: "Période",
    camere: "Chambres",
    total: "Total",

    anulataMesaj: "Les chambres ont été libérées. S'il s'agit d'une erreur, appelez-nous — nous pouvons vérifier si elles sont encore disponibles.",
    anulataRambursare: "Vous serez remboursé de {{suma}} sur la carte utilisée — cela se fait manuellement, sous quelques jours ouvrables.",

    cardEsuatTitlu: "Le paiement par carte n'a pas abouti.",
    cardEsuatDetalii: "La banque n'a pas autorisé le paiement — rien n'a été débité. Nous gardons les chambres {{minute}}, vous pouvez donc réessayer, avec la même carte ou une autre.",
    incearcaPlataDinNou: "Réessayer le paiement",
    sePregatestePlata: "Préparation du paiement…",

    verificamPlataTitlu: "Nous vérifions le paiement avec NETOPIA.",
    verificamPlataDetalii: "Si vous avez été redirigé depuis la page de paiement, la confirmation peut prendre quelques secondes. Actualisez la page si elle ne se met pas à jour d'elle-même.",

    emailTrimisTitlu: "Nous avons envoyé un email à {{email}}.",
    adresaData: "l'adresse indiquée",
    emailTrimisDetalii: "Cliquez sur le bouton du message pour confirmer définitivement la réservation. Nous gardons les chambres {{minute}} ; si vous ne confirmez pas, elles seront libérées automatiquement et vous pourrez relancer une recherche à tout moment. Vérifiez aussi vos courriers indésirables.",

    expirataMesaj: "La confirmation est arrivée trop tard et les chambres ont été libérées. Rien n'a été débité — recherchez à nouveau vos dates ou appelez-nous et nous ferons la réservation immédiatement.",

    cardConfirmatTitlu: "Nous avons reçu le paiement — la réservation est confirmée.",
    cardConfirmatDetalii: "Nous vous avons aussi envoyé un email de confirmation. Au plaisir de vous accueillir !",

    implicitMesaj: "Nous vous contacterons par téléphone pour confirmer. Le paiement se fait à l'arrivée.",

    sigurAnulezi: "Voulez-vous vraiment annuler la réservation ?",
    anulareDetaliiInainte: "Les chambres sont libérées immédiatement et pourraient ne plus être disponibles si vous changez d'avis. Conformément à la ",
    politiciiDeAnulare: "politique d'annulation",
    anulareDetaliiDupa: ", le montant intégral de la première nuit est encaissé.",
    pastrezRezervarea: "Non, je garde ma réservation",
    seAnuleaza: "Annulation en cours…",
    daAnuleaza: "Oui, annuler",
    anuleazaRezervarea: "Annuler la réservation",

    linkRevedereInainte: "Vous pouvez consulter ou annuler la réservation à tout moment à ",
    acestLink: "ce lien",
    linkRevedereDupa: " — conservez-le. Nous vous l'avons aussi envoyé par email.",
  },

  countdown: {
    putin: "un court instant",
    unMinut: "encore une minute",
    inca: "encore {{m}} {{cuvant}}",
  },

  eroare: {
    camaraOcupata: "La chambre vient d'être réservée par quelqu'un d'autre. Nous avons mis à jour la disponibilité — choisissez à nouveau ou changez vos dates.",
    reluarePlataImposibila: "Nous ne pouvons pas reprendre le paiement depuis cette page (vous l'avez ouverte dans un autre onglet ou sur un autre appareil). Appelez-nous et nous réglerons cela immédiatement.",
    rezervareaNuAFostGasita: "La réservation n'a pas été trouvée.",
  },

  landing: {
    titlu: "Hébergement Tiny Houses",
    lede: "Complexe LA LIVADA - Vaslui",
    galerieLabel: "Galerie",
    galerieTitlu: "Les maisons, l'allée et les chambres",
  },

  antet: {
    ariaMarca: "Réservations La Livada — page d'accueil",
    ariaAlegeLimba: "Choisir la langue",
    ariaDeschideMeniul: "Ouvrir le menu",
    ariaPrincipal: "Principal",
    ariaTotSitul: "Tout le site",
    nav: { sali: "Salles", nunti: "Mariages", experienta: "L'expérience", galerie: "Galerie", contact: "Contact" },
    cta: "Vérifier la disponibilité",
    grup1: { nume: "Accueil", kicker: "Séjours à La Livada" },
    grup2: { nume: "Salles", kicker: "Quatre espaces", toate: "Tous les espaces" },
    grup3: {
      nume: "Événements", kicker: "Ce que nous célébrons ici",
      nunti: "Mariages", cununii: "Cérémonies civiles en plein air", botezuri: "Baptêmes", corporate: "Événements d'entreprise",
    },
    grup4: {
      nume: "L'expérience", kicker: "Comment se déroule la journée",
      experienta: "L'expérience La Livada", meniu: "Menu et offre", cazare: "Hébergement", nuntaProba: "Mariage d'essai",
    },
    grup5: { nume: "Galerie", kicker: "À quoi ça ressemble vraiment" },
  },

  subsol: {
    seo: "Hébergement à Vaslui, dans la cour du Complexe La Livada : 16 unités — deux lofts et "
      + "quatorze chambres de type tiny house, chacune avec salle de bain privée, climatisation et "
      + "terrasse. Nous sommes sur la DN24, à Muntenii de Jos, à quelques minutes de l'entrée de "
      + "Vaslui — un hébergement aussi bien pour les invités d'événements que pour une escapade de "
      + "week-end ou un déplacement professionnel dans le département de Vaslui. La réservation se "
      + "fait directement ici, sans intermédiaire.",
    col1: { titlu: "Salles" },
    col2: {
      titlu: "Événements",
      nunti: "Mariages", botezuri: "Baptêmes", cununii: "Cérémonies civiles en plein air", corporate: "Événements d'entreprise",
    },
    col3: { titlu: "Détails", meniu: "Menu et offre", cazare: "Hébergement", nuntaProba: "Mariage d'essai", galerie: "Galerie" },
    col4: { titlu: "Contact" },
    adresa: "DN24, n° 743, Muntenii de Jos, département de Vaslui",
    legal: {
      termeni: "Conditions générales", livrare: "Politique de livraison", anulare: "Politique d'annulation",
      retragere: "Rétractation du contrat", confidentialitate: "Confidentialité", cookies: "Cookies",
    },
  },

  calendar: {
    lunaAnterioara: "Mois précédent",
    lunaUrmatoare: "Mois suivant",
    alegeZiuaPlecarii: "Choisissez maintenant le jour de départ.",
    apasaPentruAltaPerioada: "Appuyez sur un jour pour choisir une autre période.",
    apasaSosireaApoiPlecarea: "Appuyez sur le jour d'arrivée, puis sur celui de départ.",
  },
};
