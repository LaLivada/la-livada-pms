/* Nomenclatoare comune: județe și țări.
 *
 * Copiate din pms-app.jsx ca motorul de rezervări să nu importe nimic din
 * aplicația de recepție — sunt două bundle-uri separate, iar un import ar
 * trage în pachetul public cod care n-are ce căuta acolo.
 *
 * Dacă lista se schimbă în PMS, se schimbă și aici.
 */
export const JUDETE = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani", "Brăila", "Brașov",
  "București", "Buzău", "Călărași", "Caraș-Severin", "Cluj", "Constanța", "Covasna", "Dâmbovița",
  "Dolj", "Galați", "Giurgiu", "Gorj", "Harghita", "Hunedoara", "Ialomița", "Iași", "Ilfov",
  "Maramureș", "Mehedinți", "Mureș", "Neamț", "Olt", "Prahova", "Sălaj", "Satu Mare", "Sibiu",
  "Suceava", "Teleorman", "Timiș", "Tulcea", "Vâlcea", "Vaslui", "Vrancea",
];

/* Prefixele telefonice oferite in lista.
 *
 * NU e lista completa a lumii: sunt tarile din care chiar vin oaspeti —
 * Romania, Moldova, Uniunea Europeana si cateva destinatii mari — plus o
 * optiune de prefix scris de mana, ca sa nu ramana nimeni blocat. O lista
 * de 190 de coduri scrisa manual ar fi adus mai multe greseli decat
 * acoperire, iar un prefix gresit inseamna un oaspete pe care receptia
 * nu-l poate suna.
 *
 * Statele Unite si Canada impart codul +1, deci sunt o singura intrare:
 * doua optiuni cu aceeasi valoare intr-un <select> nu pot fi deosebite. */
export const PREFIXE_TELEFON = [
  { tara: "România", cod: "+40" },
  { tara: "Republica Moldova", cod: "+373" },
  { tara: "Africa de Sud", cod: "+27" },
  { tara: "Australia", cod: "+61" },
  { tara: "Austria", cod: "+43" },
  { tara: "Belgia", cod: "+32" },
  { tara: "Brazilia", cod: "+55" },
  { tara: "Bulgaria", cod: "+359" },
  { tara: "Canada / SUA", cod: "+1" },
  { tara: "Cehia", cod: "+420" },
  { tara: "China", cod: "+86" },
  { tara: "Cipru", cod: "+357" },
  { tara: "Croația", cod: "+385" },
  { tara: "Danemarca", cod: "+45" },
  { tara: "Elveția", cod: "+41" },
  { tara: "Emiratele Arabe Unite", cod: "+971" },
  { tara: "Estonia", cod: "+372" },
  { tara: "Finlanda", cod: "+358" },
  { tara: "Franța", cod: "+33" },
  { tara: "Germania", cod: "+49" },
  { tara: "Grecia", cod: "+30" },
  { tara: "India", cod: "+91" },
  { tara: "Irlanda", cod: "+353" },
  { tara: "Israel", cod: "+972" },
  { tara: "Italia", cod: "+39" },
  { tara: "Japonia", cod: "+81" },
  { tara: "Letonia", cod: "+371" },
  { tara: "Lituania", cod: "+370" },
  { tara: "Luxemburg", cod: "+352" },
  { tara: "Malta", cod: "+356" },
  { tara: "Norvegia", cod: "+47" },
  { tara: "Olanda", cod: "+31" },
  { tara: "Polonia", cod: "+48" },
  { tara: "Portugalia", cod: "+351" },
  { tara: "Regatul Unit", cod: "+44" },
  { tara: "Rusia", cod: "+7" },
  { tara: "Serbia", cod: "+381" },
  { tara: "Slovacia", cod: "+421" },
  { tara: "Slovenia", cod: "+386" },
  { tara: "Spania", cod: "+34" },
  { tara: "Suedia", cod: "+46" },
  { tara: "Turcia", cod: "+90" },
  { tara: "Ucraina", cod: "+380" },
  { tara: "Ungaria", cod: "+36" },
];

export const PREFIX_IMPLICIT = "+40";

/* Numarul asa cum ajunge in PMS: prefix, spatiu, restul cifrelor.
 *
 * Zeroul de la inceput se taie, fiindca romanii scriu „0722…" iar
 * „+40 0722…" nu se poate forma. Exceptia e Italia, singura tara din
 * lista care pastreaza zeroul si in forma internationala (+39 06…) —
 * acolo taierea ar strica numarul, deci nu se taie. */
export function telefonInternational(prefix, numar) {
  const cifre = String(numar || "").replace(/\D/g, "");
  const fara0 = prefix === "+39" ? cifre : cifre.replace(/^0+/, "");
  return fara0 ? `${String(prefix || "").trim()} ${fara0}` : "";
}

export const TARI = [
  "România", "Republica Moldova", "Afganistan", "Africa de Sud", "Albania", "Algeria", "Andorra",
  "Angola", "Antigua și Barbuda", "Arabia Saudită", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaidjan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgia", "Belize",
  "Benin", "Bhutan", "Bolivia", "Bosnia și Herțegovina", "Botswana", "Brazilia", "Brunei",
  "Bulgaria", "Burkina Faso", "Burundi", "Cambodgia", "Camerun", "Canada", "Capul Verde", "Cehia",
  "Chile", "China", "Cipru", "Columbia", "Comore", "Congo", "Coreea de Nord", "Coreea de Sud",
  "Costa Rica", "Coasta de Fildeș", "Croația", "Cuba", "Danemarca", "Djibouti", "Dominica",
  "Ecuador", "Egipt", "El Salvador", "Elveția", "Emiratele Arabe Unite", "Eritreea", "Estonia",
  "Eswatini", "Etiopia", "Fiji", "Filipine", "Finlanda", "Franța", "Gabon", "Gambia", "Georgia",
  "Germania", "Ghana", "Grecia", "Grenada", "Guatemala", "Guineea", "Guineea-Bissau",
  "Guineea Ecuatorială", "Guyana", "Haiti", "Honduras", "India", "Indonezia", "Irak", "Iran",
  "Irlanda", "Islanda", "Israel", "Italia", "Jamaica", "Japonia", "Iordania", "Kazahstan", "Kenya",
  "Kirgizstan", "Kiribati", "Kosovo", "Kuweit", "Laos", "Lesotho", "Letonia", "Liban", "Liberia",
  "Libia", "Liechtenstein", "Lituania", "Luxemburg", "Macedonia de Nord", "Madagascar", "Malaezia",
  "Malawi", "Maldive", "Mali", "Malta", "Maroc", "Insulele Marshall", "Mauritania", "Mauritius",
  "Mexic", "Micronezia", "Monaco", "Mongolia", "Muntenegru", "Mozambic", "Myanmar", "Namibia",
  "Nauru", "Nepal", "Nicaragua", "Niger", "Nigeria", "Norvegia", "Noua Zeelandă", "Olanda", "Oman",
  "Pakistan", "Palau", "Palestina", "Panama", "Papua Noua Guinee", "Paraguay", "Peru", "Polonia",
  "Portugalia", "Qatar", "Regatul Unit", "Republica Centrafricană", "Republica Dominicană",
  "Republica Democrată Congo", "Ruanda", "Rusia", "Saint Kitts și Nevis", "Saint Lucia",
  "Saint Vincent și Grenadinele", "Samoa", "San Marino", "São Tomé și Príncipe", "Senegal",
  "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Siria", "Slovacia", "Slovenia",
  "Insulele Solomon", "Somalia", "Spania", "Sri Lanka", "Statele Unite ale Americii", "Sudan",
  "Sudanul de Sud", "Suedia", "Surinam", "Tadjikistan", "Tanzania", "Thailanda", "Timorul de Est",
  "Togo", "Tonga", "Trinidad și Tobago", "Tunisia", "Turcia", "Turkmenistan", "Tuvalu", "Ucraina",
  "Uganda", "Ungaria", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican", "Venezuela", "Vietnam",
  "Yemen", "Zambia", "Zimbabwe",
];
