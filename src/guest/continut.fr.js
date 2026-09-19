/* Continutul editorial in franceza, tradus si aprobat 19 septembrie 2026.
 * Aceeasi forma (aceleasi chei) ca in continut.ro.js — verificat de
 * continut-forme.test.js. REGULAMENT si ATRACTII_TEXT nu mai sunt aici
 * din Task 7 — traiesc separat, in regulament.<lang>.js si
 * atractii-text.<lang>.js, incarcate lenes din continut-mare.js. */

export const asistentaRaspuns = "répond en quelques minutes";

export const BUN_VENIT = {
  intro: "Nous sommes ravis de vous accueillir et vous souhaitons un agréable séjour.",
  puncte: [
    {
      titlu: "Wi-Fi gratuit",
      inainte: "Le réseau ",
      dupa: ", sans mot de passe.",
      actiune: "wifi",
    },
    {
      titlu: "Enregistrez la page sur votre téléphone",
      text: "Le code et le bouton d'ouverture restent à portée de main pendant tout votre séjour.",
      actiune: "instalare",
    },
  ],
};

export const IMPORTANT = [
  { titlu: "Tabac", text: "Interdit dans la chambre et dans les espaces intérieurs — autorisé à l'extérieur. Fumer dans la chambre entraîne des frais de 500 lei." },
  { titlu: "Calme", text: "Merci de respecter le calme entre 22h00 et 8h00." },
  { titlu: "Animaux", text: "Bienvenus, moyennant des frais de 50 lei par séjour." },
  { titlu: "Parking", text: "Gratuit sur place, sous la responsabilité du propriétaire du véhicule." },
];

export const ACCES_CAMERE_DESCRIERI = [
  { fisier: "1-intrarea.jpg", descriere: "Entrez par le parking à droite et suivez le sens de la circulation." },
  { fisier: "2-aleea.jpg",    descriere: "À ce panneau, continuez tout droit." },
  { fisier: "3-parcarea.jpg", descriere: "Vous êtes arrivé au parking." },
  { fisier: "4-poteca.jpg",   descriere: "L'accès aux chambres se fait par l'allée de droite, devant le Grand'Or Ballroom." },
];
