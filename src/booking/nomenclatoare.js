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

/* Fiecare țară ține și codul ISO 3166-1 alpha-2, ca eticheta din <select>
   să poată fi localizată la afișare (Intl.DisplayNames) fără traducere de
   mână a ~195 de nume × 6 limbi. VALOAREA trimisă la server rămâne mereu
   numele românesc (`ro`) — vezi `numeTara()` mai jos — deci nimic din
   backend sau din regula „judetNecesar" nu se schimbă odată cu limba. */
export const TARI = [
  { ro: "România", iso: "RO" }, { ro: "Republica Moldova", iso: "MD" },
  { ro: "Afganistan", iso: "AF" }, { ro: "Africa de Sud", iso: "ZA" },
  { ro: "Albania", iso: "AL" }, { ro: "Algeria", iso: "DZ" }, { ro: "Andorra", iso: "AD" },
  { ro: "Angola", iso: "AO" }, { ro: "Antigua și Barbuda", iso: "AG" },
  { ro: "Arabia Saudită", iso: "SA" }, { ro: "Argentina", iso: "AR" },
  { ro: "Armenia", iso: "AM" }, { ro: "Australia", iso: "AU" }, { ro: "Austria", iso: "AT" },
  { ro: "Azerbaidjan", iso: "AZ" }, { ro: "Bahamas", iso: "BS" }, { ro: "Bahrain", iso: "BH" },
  { ro: "Bangladesh", iso: "BD" }, { ro: "Barbados", iso: "BB" }, { ro: "Belarus", iso: "BY" },
  { ro: "Belgia", iso: "BE" }, { ro: "Belize", iso: "BZ" }, { ro: "Benin", iso: "BJ" },
  { ro: "Bhutan", iso: "BT" }, { ro: "Bolivia", iso: "BO" },
  { ro: "Bosnia și Herțegovina", iso: "BA" }, { ro: "Botswana", iso: "BW" },
  { ro: "Brazilia", iso: "BR" }, { ro: "Brunei", iso: "BN" }, { ro: "Bulgaria", iso: "BG" },
  { ro: "Burkina Faso", iso: "BF" }, { ro: "Burundi", iso: "BI" }, { ro: "Cambodgia", iso: "KH" },
  { ro: "Camerun", iso: "CM" }, { ro: "Canada", iso: "CA" }, { ro: "Capul Verde", iso: "CV" },
  { ro: "Cehia", iso: "CZ" }, { ro: "Chile", iso: "CL" }, { ro: "China", iso: "CN" },
  { ro: "Cipru", iso: "CY" }, { ro: "Columbia", iso: "CO" }, { ro: "Comore", iso: "KM" },
  { ro: "Congo", iso: "CG" }, { ro: "Coreea de Nord", iso: "KP" },
  { ro: "Coreea de Sud", iso: "KR" }, { ro: "Costa Rica", iso: "CR" },
  { ro: "Coasta de Fildeș", iso: "CI" }, { ro: "Croația", iso: "HR" }, { ro: "Cuba", iso: "CU" },
  { ro: "Danemarca", iso: "DK" }, { ro: "Djibouti", iso: "DJ" }, { ro: "Dominica", iso: "DM" },
  { ro: "Ecuador", iso: "EC" }, { ro: "Egipt", iso: "EG" }, { ro: "El Salvador", iso: "SV" },
  { ro: "Elveția", iso: "CH" }, { ro: "Emiratele Arabe Unite", iso: "AE" },
  { ro: "Eritreea", iso: "ER" }, { ro: "Estonia", iso: "EE" }, { ro: "Eswatini", iso: "SZ" },
  { ro: "Etiopia", iso: "ET" }, { ro: "Fiji", iso: "FJ" }, { ro: "Filipine", iso: "PH" },
  { ro: "Finlanda", iso: "FI" }, { ro: "Franța", iso: "FR" }, { ro: "Gabon", iso: "GA" },
  { ro: "Gambia", iso: "GM" }, { ro: "Georgia", iso: "GE" }, { ro: "Germania", iso: "DE" },
  { ro: "Ghana", iso: "GH" }, { ro: "Grecia", iso: "GR" }, { ro: "Grenada", iso: "GD" },
  { ro: "Guatemala", iso: "GT" }, { ro: "Guineea", iso: "GN" },
  { ro: "Guineea-Bissau", iso: "GW" }, { ro: "Guineea Ecuatorială", iso: "GQ" },
  { ro: "Guyana", iso: "GY" }, { ro: "Haiti", iso: "HT" }, { ro: "Honduras", iso: "HN" },
  { ro: "India", iso: "IN" }, { ro: "Indonezia", iso: "ID" }, { ro: "Irak", iso: "IQ" },
  { ro: "Iran", iso: "IR" }, { ro: "Irlanda", iso: "IE" }, { ro: "Islanda", iso: "IS" },
  { ro: "Israel", iso: "IL" }, { ro: "Italia", iso: "IT" }, { ro: "Jamaica", iso: "JM" },
  { ro: "Japonia", iso: "JP" }, { ro: "Iordania", iso: "JO" }, { ro: "Kazahstan", iso: "KZ" },
  { ro: "Kenya", iso: "KE" }, { ro: "Kirgizstan", iso: "KG" }, { ro: "Kiribati", iso: "KI" },
  { ro: "Kosovo", iso: "XK" }, { ro: "Kuweit", iso: "KW" }, { ro: "Laos", iso: "LA" },
  { ro: "Lesotho", iso: "LS" }, { ro: "Letonia", iso: "LV" }, { ro: "Liban", iso: "LB" },
  { ro: "Liberia", iso: "LR" }, { ro: "Libia", iso: "LY" }, { ro: "Liechtenstein", iso: "LI" },
  { ro: "Lituania", iso: "LT" }, { ro: "Luxemburg", iso: "LU" },
  { ro: "Macedonia de Nord", iso: "MK" }, { ro: "Madagascar", iso: "MG" },
  { ro: "Malaezia", iso: "MY" }, { ro: "Malawi", iso: "MW" }, { ro: "Maldive", iso: "MV" },
  { ro: "Mali", iso: "ML" }, { ro: "Malta", iso: "MT" }, { ro: "Maroc", iso: "MA" },
  { ro: "Insulele Marshall", iso: "MH" }, { ro: "Mauritania", iso: "MR" },
  { ro: "Mauritius", iso: "MU" }, { ro: "Mexic", iso: "MX" }, { ro: "Micronezia", iso: "FM" },
  { ro: "Monaco", iso: "MC" }, { ro: "Mongolia", iso: "MN" }, { ro: "Muntenegru", iso: "ME" },
  { ro: "Mozambic", iso: "MZ" }, { ro: "Myanmar", iso: "MM" }, { ro: "Namibia", iso: "NA" },
  { ro: "Nauru", iso: "NR" }, { ro: "Nepal", iso: "NP" }, { ro: "Nicaragua", iso: "NI" },
  { ro: "Niger", iso: "NE" }, { ro: "Nigeria", iso: "NG" }, { ro: "Norvegia", iso: "NO" },
  { ro: "Noua Zeelandă", iso: "NZ" }, { ro: "Olanda", iso: "NL" }, { ro: "Oman", iso: "OM" },
  { ro: "Pakistan", iso: "PK" }, { ro: "Palau", iso: "PW" }, { ro: "Palestina", iso: "PS" },
  { ro: "Panama", iso: "PA" }, { ro: "Papua Noua Guinee", iso: "PG" },
  { ro: "Paraguay", iso: "PY" }, { ro: "Peru", iso: "PE" }, { ro: "Polonia", iso: "PL" },
  { ro: "Portugalia", iso: "PT" }, { ro: "Qatar", iso: "QA" }, { ro: "Regatul Unit", iso: "GB" },
  { ro: "Republica Centrafricană", iso: "CF" }, { ro: "Republica Dominicană", iso: "DO" },
  { ro: "Republica Democrată Congo", iso: "CD" }, { ro: "Ruanda", iso: "RW" },
  { ro: "Rusia", iso: "RU" }, { ro: "Saint Kitts și Nevis", iso: "KN" },
  { ro: "Saint Lucia", iso: "LC" }, { ro: "Saint Vincent și Grenadinele", iso: "VC" },
  { ro: "Samoa", iso: "WS" }, { ro: "San Marino", iso: "SM" },
  { ro: "São Tomé și Príncipe", iso: "ST" }, { ro: "Senegal", iso: "SN" },
  { ro: "Serbia", iso: "RS" }, { ro: "Seychelles", iso: "SC" }, { ro: "Sierra Leone", iso: "SL" },
  { ro: "Singapore", iso: "SG" }, { ro: "Siria", iso: "SY" }, { ro: "Slovacia", iso: "SK" },
  { ro: "Slovenia", iso: "SI" }, { ro: "Insulele Solomon", iso: "SB" },
  { ro: "Somalia", iso: "SO" }, { ro: "Spania", iso: "ES" }, { ro: "Sri Lanka", iso: "LK" },
  { ro: "Statele Unite ale Americii", iso: "US" }, { ro: "Sudan", iso: "SD" },
  { ro: "Sudanul de Sud", iso: "SS" }, { ro: "Suedia", iso: "SE" }, { ro: "Surinam", iso: "SR" },
  { ro: "Tadjikistan", iso: "TJ" }, { ro: "Tanzania", iso: "TZ" }, { ro: "Thailanda", iso: "TH" },
  { ro: "Timorul de Est", iso: "TL" }, { ro: "Togo", iso: "TG" }, { ro: "Tonga", iso: "TO" },
  { ro: "Trinidad și Tobago", iso: "TT" }, { ro: "Tunisia", iso: "TN" },
  { ro: "Turcia", iso: "TR" }, { ro: "Turkmenistan", iso: "TM" }, { ro: "Tuvalu", iso: "TV" },
  { ro: "Ucraina", iso: "UA" }, { ro: "Uganda", iso: "UG" }, { ro: "Ungaria", iso: "HU" },
  { ro: "Uruguay", iso: "UY" }, { ro: "Uzbekistan", iso: "UZ" }, { ro: "Vanuatu", iso: "VU" },
  { ro: "Vatican", iso: "VA" }, { ro: "Venezuela", iso: "VE" }, { ro: "Vietnam", iso: "VN" },
  { ro: "Yemen", iso: "YE" }, { ro: "Zambia", iso: "ZM" }, { ro: "Zimbabwe", iso: "ZW" },
];

/* Numele afișat pentru o intrare din TARI, în limba curentă a site-ului.
   Valoarea trimisă la server (state-ul `tara`/`firma.judet` etc.) rămâne
   mereu `intrare.ro` — doar eticheta din <option> se schimbă. Pe o limbă
   fără resurse de regiune (rar, dar posibil într-un motor JS mai vechi),
   Intl.DisplayNames poate arunca sau întoarce chiar codul ISO — în ambele
   cazuri cădem pe numele românesc, mai bine decât un cod gol pe ecran. */
const cacheDisplayNames = new Map();
export function numeTara(intrare, limba) {
  if (!intrare) return "";
  if (limba === "ro") return intrare.ro;
  try {
    let dn = cacheDisplayNames.get(limba);
    if (!dn) {
      dn = new Intl.DisplayNames([limba], { type: "region" });
      cacheDisplayNames.set(limba, dn);
    }
    const nume = dn.of(intrare.iso);
    return nume && nume !== intrare.iso ? nume : intrare.ro;
  } catch {
    return intrare.ro;
  }
}
