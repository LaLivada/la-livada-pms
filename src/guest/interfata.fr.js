/* Textele de interfata in franceza, traduse si aprobate 19 septembrie 2026.
 * Aceeasi forma ca in interfata.ro.js — verificat de
 * continut-forme.test.js. */
export const TEXTE = {
  acces: {
    eticheta: "Accès à la chambre",
    deschideUsa: "Ouvrir la porte",
    sauTasteaza: "Ou tapez le code sur la porte",
    valabilPana: "Valable jusqu'au",
    codLipsa: "Le code n'est pas encore prêt. Rechargez la page dans quelques minutes ou appelez-nous — en attendant, vous pouvez entrer avec le bouton ci-dessus.",
  },
  refuzuri: {
    incearcaDinNou: "Réessayer",
    sunaRecetia: "Appeler la réception",
    neinceput: { titlu: "Votre séjour n'a pas encore commencé", text: "La page s'ouvre automatiquement à votre arrivée. Le code d'accès apparaît ici juste après l'enregistrement." },
    incheiat: { titlu: "Votre séjour est terminé", text: "Le lien a expiré à votre départ. Merci d'avoir séjourné chez nous." },
    anulat: { titlu: "La réservation n'est plus active", text: "S'il s'agit d'une erreur, appelez-nous et nous réglerons cela immédiatement." },
    necunoscut: { titlu: "Le lien ne fonctionne pas", text: "Vérifiez que vous l'avez ouvert en entier, tel que vous l'avez reçu. Si cela ne fonctionne toujours pas, appelez-nous." },
    "prea-multe": { titlu: "Trop de tentatives", text: "Attendez quelques minutes et réessayez. Si vous êtes pressé, appelez-nous." },
    lipsa: { titlu: "Lien incomplet", text: "L'adresse ne contient pas le code du séjour. Ouvrez le lien complet, tel que vous l'avez reçu." },
    eroare: { titlu: "Un problème est survenu", text: "Nous n'avons pas pu charger les données. Réessayez ; si cela ne fonctionne toujours pas, appelez-nous." },
    timeout: { titlu: "Le serveur n'a pas répondu", text: "Ce n'est pas la faute du lien : le serveur n'a pas répondu à temps. Vérifiez votre connexion et réessayez ; si vous êtes devant la porte, appelez-nous." },
  },
  instalare: {
    pasiIos: [
      { inainte: "Appuyez sur ", tare: "Partager", dupa: " — le carré avec la flèche vers le haut, dans la barre du bas." },
      { inainte: "Faites défiler et choisissez ", tare: "Sur l'écran d'accueil", dupa: "." },
      { inainte: "Confirmez avec ", tare: "Ajouter", dupa: ", en haut à droite." },
    ],
    pasiAndroid: [
      { inainte: "Appuyez sur ", tare: "⋮", dupa: " en haut à droite." },
      { inainte: "Choisissez ", tare: "Ajouter à l'écran d'accueil", dupa: " ou ", tare2: "Installer l'application", dupa2: "." },
      { inainte: "Confirmez avec ", tare: "Ajouter", dupa: "." },
    ],
    pasiWifiIos: [
      { inainte: "Ouvrez ", tare: "Réglages", dupa: " → ", tare2: "Wi-Fi", dupa2: "." },
      { inainte: "Choisissez ", dupa: " dans la liste." }, // `tare` = WIFI.retea, injectat in App.jsx
      { text: "C'est fait — le réseau ne demande pas de mot de passe." },
    ],
    pasiWifiAndroid: [
      { inainte: "Tirez la barre du haut vers le bas et appuyez longuement sur ", tare: "Wi-Fi", dupa: "." },
      { inainte: "Choisissez ", dupa: " dans la liste." },
      { text: "C'est fait — le réseau ne demande pas de mot de passe." },
    ],
  },
  fisa: {
    titluFereastra: "Fiche d'enregistrement",
    intro: "Obligatoire à l'arrivée, une seule fois par séjour.",
    ajutor: { inainte: "Le réseau ", mijloc: ", sans mot de passe. Si vous êtes bloqué, appelez ", dupa: " au" },
    campEtichete: {
      nume: "Nom", prenume: "Prénom", dataNasterii: "Date de naissance",
      loculNasterii: "Lieu de naissance", nationalitate: "Nationalité",
      tara: "Pays de résidence", adresa: "Adresse", localitate: "Ville",
      scopul: "Motif du voyage", actTip: "Type de pièce d'identité",
      actSeria: "Série", actNumarul: "Numéro",
    },
    actTipEtichete: { ci: "Carte d'identité", pasaport: "Passeport", permis: "Permis de séjour" },
    dacaAre: "(le cas échéant)",
    dataZiua: "Jour", dataLuna: "Mois", dataAnul: "Année",
    eroriCamp: {
      LIPSA: (eticheta) => `${eticheta} manque.`,
      DATA_INVALIDA: "La date de naissance n'est pas une date valide.",
      DATA_VIITOR: "La date de naissance ne peut pas être dans le futur.",
      AN_SUSPECT: "Vérifiez l'année de naissance.",
      ACT_NECUNOSCUT: "Choisissez un type de pièce dans la liste.",
    },
    eroareSemnatura: "Signez dans le cadre ci-dessus.",
    dejaCompletata: "La fiche a déjà été soumise.",
    eroareTrimitere: "Impossible d'envoyer la fiche. Réessayez.",
    trimite: "Signer et envoyer",
    trimitAcum: "Envoi…",
    seIncarca: "Chargement…",
  },
};
