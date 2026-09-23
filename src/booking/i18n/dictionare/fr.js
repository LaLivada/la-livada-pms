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
    titlu: "Hébergement à Vaslui – Tiny Houses & Lofts La Livada",
    lede: "14 tiny houses et 2 lofts dans l'enceinte du Complexe La Livada, à Muntenii de "
      + "Jos. Voyez ce qui est libre et réservez directement, sans intermédiaires.",
    galerieLabel: "Galerie",
    galerieTitlu: "Les maisons, l'allée et les chambres",
    seo: {
      aproape: {
        titlu: "Hébergement près de Vaslui, en réservation directe",
        p1: "Nous sommes sur la route DN24, à Muntenii de Jos, à la lisière de Vaslui du côté "
          + "de Bârlad. L'hébergement fait partie du Complexe La Livada, dans la même "
          + "enceinte que les salles de réception et le jardin, mais il se réserve aussi "
          + "séparément : pour une nuit de passage, un week-end ou un déplacement "
          + "professionnel dans le département de Vaslui.",
        p2: "C'est sur cette page que se fait la réservation. Les disponibilités ci-dessus "
          + "sont les vraies, issues de notre système de réception, et la réservation entre "
          + "directement dans le calendrier de la pension — sans plateformes intermédiaires "
          + "et sans commission ajoutée au prix. Vous recevez la confirmation par e-mail, "
          + "avec le numéro de réservation et un lien pour la consulter ou l'annuler.",
        link: "Découvrir le Complexe La Livada",
      },
      tiny: {
        titlu: "Les tiny houses La Livada",
        p1: "Les 14 tiny houses sont de petites maisons indépendantes, posées entre les "
          + "arbres du verger. Huit sont pour deux personnes ; six ont, en plus du lit "
          + "double, un lit superposé pour les enfants, donc deux adultes et un enfant y "
          + "logent.",
        p2: "Chaque maison a sa salle de bain, la climatisation et sa propre terrasse. Le "
          + "soir, l'allée entre les maisons est éclairée — vous la voyez dans la galerie "
          + "ci-dessus.",
        link: "En savoir plus sur l'hébergement La Livada",
      },
      loft: {
        titlu: "Les lofts La Livada",
        p1: "Les deux lofts sont pour deux personnes, avec le lit en mezzanine. Les "
          + "intérieurs de la galerie sont les leurs. On les choisit d'habitude en couple, ou "
          + "quand on reste plusieurs nuits et qu'on préfère une chambre à une petite maison.",
      },
      facilitati: {
        titlu: "Équipements",
        p1: "Dans chaque unité, sans exception : salle de bain privée, climatisation et "
          + "terrasse. On entre dans la chambre avec un code reçu à l'arrivée, donc sans "
          + "dépendre d'une réception à horaires.",
        p2: "Dans l'enceinte : parking gratuit, le jardin avec ses trois bassins à carpes "
          + "koï, les allées entre les maisons et les salles de réception du complexe.",
      },
      weekend: {
        titlu: "Hébergement pour un week-end, un passage ou un déplacement professionnel",
        p1: "La DN24 est la route entre Vaslui et Bârlad ; si vous êtes de passage, vous "
          + "pouvez réserver une seule nuit, avec arrivée à partir de 14 h et départ avant 11 "
          + "h. La voiture reste dans l'enceinte, le parking est gratuit.",
        p2: "Pour les déplacements professionnels, la facture est établie au nom de "
          + "l'entreprise : vous remplissez les données de facturation directement dans le "
          + "formulaire, à l'étape de vos coordonnées. Pour un week-end, choisissez les dates "
          + "et voyez sur-le-champ ce qui est libre ; si vous venez avec un enfant, cherchez "
          + "pour trois personnes — les maisons avec lit superposé sont celles qui logent "
          + "trois.",
        p3: "Si vous êtes invité à un événement organisé à La Livada, la chambre est à "
          + "quelques mètres de la salle — vous réservez de la même façon, ici, ou vous "
          + "demandez aux organisateurs s'ils ont déjà retenu des chambres pour les invités.",
      },
      inainte: {
        titlu: "Avant de réserver",
        p1: "L'arrivée se fait à partir de 14 h, le départ avant 11 h. Après l'envoi de la "
          + "réservation, vous voyez à l'écran le numéro de confirmation et recevez aussitôt "
          + "un e-mail avec les détails du séjour, le prix et le lien pour la consulter.",
        p2: "Le paiement se fait par carte, en ligne, via NETOPIA, ou à l'arrivée ou par "
          + "virement bancaire, selon votre choix dans le formulaire. En cas d'annulation, la "
          + "première nuit est facturée ; le reste est remboursé. Pour d'autres dates ou une "
          + "autre chambre, appelez-nous ou écrivez-nous avant d'annuler.",
        link: "Politique d'annulation",
      },
      unde: {
        titlu: "Où nous trouver",
        p1: "DN24, n° 743, Muntenii de Jos, département de Vaslui — à la lisière de Vaslui, "
          + "sur la route venant de Bârlad.",
        p2: "Le plan et l'itinéraire sont sur la page de contact du complexe.",
        link: "Page de contact",
      },
    },
    faq: {
      eticheta: "En bref",
      titlu: "Questions fréquentes",
      q1: "Où se trouve l'hébergement La Livada ?",
      a1: "Dans le Complexe La Livada, sur la DN24, n° 743, à Muntenii de Jos — à la "
        + "lisière de Vaslui, sur la route venant de Bârlad.",
      q2: "Combien d'unités d'hébergement y a-t-il ?",
      a2: "16, toutes dans la même enceinte : 14 tiny houses et 2 lofts. Chacune a une "
        + "salle de bain privée, la climatisation et une terrasse.",
      q3: "Puis-je réserver directement en ligne ?",
      a3: "Oui, depuis cette page. Choisissez les dates et le nombre de personnes, voyez ce "
        + "qui est libre et envoyez la réservation ; la confirmation arrive par e-mail, "
        + "avec un lien pour la consulter ou l'annuler.",
      q4: "La Livada propose-t-elle des tiny houses ?",
      a4: "Oui : 14 petites maisons indépendantes entre les arbres du verger — 8 pour deux "
        + "personnes et 6 pour deux personnes avec lit superposé pour un enfant.",
      q5: "Y a-t-il un hébergement pour les déplacements professionnels ?",
      a5: "Oui. Vous pouvez réserver une nuit ou plus, et la facture est établie au nom de "
        + "l'entreprise — les données de facturation se remplissent dans le formulaire, à "
        + "l'étape de vos coordonnées.",
      q6: "À quelle distance de Vaslui se trouve l'hébergement ?",
      a6: "Nous sommes à la lisière de la ville, à Muntenii de Jos, sur la DN24 — à "
        + "quelques mètres de l'entrée de Vaslui, du côté de Bârlad.",
      q7: "Quels sont les horaires d'arrivée et de départ ?",
      a7: "L'arrivée à partir de 14 h, le départ avant 11 h.",
      q8: "Y a-t-il un parking ?",
      a8: "Oui, le parking est gratuit, dans l'enceinte du complexe.",
      q9: "Que se passe-t-il si j'annule ?",
      a9: "Vous pouvez annuler à tout moment depuis le lien de l'e-mail. La première nuit "
        + "est facturée ; le reste est remboursé.",
      a9link: "Politique d'annulation",
    },
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
