/* Nomenclatoare si etichete fixe.
 *
 * Date pure, fara logica: ce statusuri exista, cum se numesc in romana, ce
 * clasa CSS primesc, ce judete si tari se pot alege. Stau separat fiindca
 * sunt folosite din aproape toate ecranele si nu depind de nimic — un modul
 * de aici nu poate crea import circular, oricine l-ar importa.
 */


export const ROOM_TYPE = {
  tiny: { label: "Tiny house", short: "Tiny" },
  loft: { label: "Loft", short: "Loft" },
};

export const STATUS_LABEL = {
  pending: "Cerere", confirmed: "Confirmată", protocol: "Protocol", checkedin: "Checked-in",
  checkedout: "Checked-out", noshow: "No-show", cancelled: "Anulată",
};

export const STATUS_GLYPH = {
  pending: "?", confirmed: "●", protocol: "§", checkedin: "▶", checkedout: "✓", noshow: "!", cancelled: "✕",
};

export const STATUS_CLASS = {
  pending: "st-pending", confirmed: "st-confirmed", protocol: "st-protocol", checkedin: "st-checkedin",
  checkedout: "st-checkedout", noshow: "st-noshow", cancelled: "st-cancelled",
};

/* La creare, o rezervare poate porni doar in una din aceste 3 stari.
   La editare, statusul revine la cel operational clasic — Cerere si
   Protocol sunt doar puncte de intrare, nu stari intre care se comuta
   liber ulterior (vezi ReservationModal). */

export const CREATE_STATUSES = ["pending", "confirmed", "protocol"];

export const EDIT_STATUSES = ["confirmed", "checkedin", "checkedout", "noshow", "cancelled"];

/* Rezervarile "protocol" ocupa camera normal, dar nu se incaseaza bani pe
   ele — nu trebuie sa apara in nicio statistica de venit/ocupare din
   Rapoarte sau din fisele de client; vezi ReportsView (sectiune separata
   pentru protocol) si ClientsView/GuestHistory. */

export const INVOICE_STATUS_LABEL = {
  draft: "Draft", issued: "Emisă", partially_paid: "Parțial plătită",
  paid: "Plătită", cancelled: "Anulată", credited: "Stornată",
};

export const INVOICE_STATUS_CLASS = {
  draft: "st-pending", issued: "st-confirmed", partially_paid: "st-noshow",
  paid: "st-checkedin", cancelled: "st-cancelled", credited: "st-protocol",
};

export const PAYMENT_METHOD_LABEL = {
  cash: "Numerar", card: "Card", bank_transfer: "Transfer bancar", other: "Altă metodă",
};

export const BILLING_PERMISSION_LABEL = {
  view_invoices: "Vede facturile",
  create_invoice: "Creează/editează draft",
  issue_invoice: "Emite factura",
  cancel_invoice: "Anulează factura",
  create_credit_note: "Stornează",
  record_payment: "Înregistrează plăți",
  export_accounting: "Exportă contabilitate",
  reexport_accounting: "Reexportă contabilitate",
};

export const BILLING_PERMISSION_KEYS = Object.keys(BILLING_PERMISSION_LABEL);

export const SOURCES = [
  { key: "direct", label: "Direct" },
  { key: "phone", label: "Telefon" },
  { key: "walkin", label: "Walk-in" },
  { key: "site", label: "Site propriu (online)" },
  { key: "booking", label: "Booking.com" },
  { key: "airbnb", label: "Airbnb" },
  { key: "other", label: "Altă agenție" },
];

export const sourceLabel = (k) => SOURCES.find((x) => x.key === k)?.label || "—";

export const DEFAULT_TAGS = [
  "VIP", "Client fidel", "Aniversare", "Sosire târzie",
  "Pat suplimentar", "Animal de companie", "Necesită factură",
];

export const ROLE_LABEL = { admin: "Admin", receptionist: "Recepționer", housekeeping: "Cameristă" };

/* Intl formatters are expensive to construct (far more than to use), and
   these run hundreds of times per render in lists, the calendar and
   reports — so build each one once at module level. */

export const JUDETE = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani", "Brăila", "Brașov",
  "București", "Buzău", "Călărași", "Caraș-Severin", "Cluj", "Constanța", "Covasna", "Dâmbovița",
  "Dolj", "Galați", "Giurgiu", "Gorj", "Harghita", "Hunedoara", "Ialomița", "Iași", "Ilfov",
  "Maramureș", "Mehedinți", "Mureș", "Neamț", "Olt", "Prahova", "Sălaj", "Satu Mare", "Sibiu",
  "Suceava", "Teleorman", "Timiș", "Tulcea", "Vâlcea", "Vaslui", "Vrancea",
];

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

/* Prefixe telefonice — cheile trebuie sa acopere fiecare tara din TARI.
   Ordinea afisata in selector vine din TARI (Romania prima, apoi
   Republica Moldova, apoi alfabetic), nu de aici. */

export const PHONE_DIAL = {
  "România": "+40", "Republica Moldova": "+373", "Afganistan": "+93", "Africa de Sud": "+27",
  "Albania": "+355", "Algeria": "+213", "Andorra": "+376", "Angola": "+244",
  "Antigua și Barbuda": "+1268", "Arabia Saudită": "+966", "Argentina": "+54", "Armenia": "+374",
  "Australia": "+61", "Austria": "+43", "Azerbaidjan": "+994", "Bahamas": "+1242", "Bahrain": "+973",
  "Bangladesh": "+880", "Barbados": "+1246", "Belarus": "+375", "Belgia": "+32", "Belize": "+501",
  "Benin": "+229", "Bhutan": "+975", "Bolivia": "+591", "Bosnia și Herțegovina": "+387",
  "Botswana": "+267", "Brazilia": "+55", "Brunei": "+673", "Bulgaria": "+359", "Burkina Faso": "+226",
  "Burundi": "+257", "Cambodgia": "+855", "Camerun": "+237", "Canada": "+1", "Capul Verde": "+238",
  "Cehia": "+420", "Chile": "+56", "China": "+86", "Cipru": "+357", "Columbia": "+57",
  "Comore": "+269", "Congo": "+242", "Coreea de Nord": "+850", "Coreea de Sud": "+82",
  "Costa Rica": "+506", "Coasta de Fildeș": "+225", "Croația": "+385", "Cuba": "+53",
  "Danemarca": "+45", "Djibouti": "+253", "Dominica": "+1767", "Ecuador": "+593", "Egipt": "+20",
  "El Salvador": "+503", "Elveția": "+41", "Emiratele Arabe Unite": "+971", "Eritreea": "+291",
  "Estonia": "+372", "Eswatini": "+268", "Etiopia": "+251", "Fiji": "+679", "Filipine": "+63",
  "Finlanda": "+358", "Franța": "+33", "Gabon": "+241", "Gambia": "+220", "Georgia": "+995",
  "Germania": "+49", "Ghana": "+233", "Grecia": "+30", "Grenada": "+1473", "Guatemala": "+502",
  "Guineea": "+224", "Guineea-Bissau": "+245", "Guineea Ecuatorială": "+240", "Guyana": "+592",
  "Haiti": "+509", "Honduras": "+504", "India": "+91", "Indonezia": "+62", "Irak": "+964",
  "Iran": "+98", "Irlanda": "+353", "Islanda": "+354", "Israel": "+972", "Italia": "+39",
  "Jamaica": "+1876", "Japonia": "+81", "Iordania": "+962", "Kazahstan": "+7", "Kenya": "+254",
  "Kirgizstan": "+996", "Kiribati": "+686", "Kosovo": "+383", "Kuweit": "+965", "Laos": "+856",
  "Lesotho": "+266", "Letonia": "+371", "Liban": "+961", "Liberia": "+231", "Libia": "+218",
  "Liechtenstein": "+423", "Lituania": "+370", "Luxemburg": "+352", "Macedonia de Nord": "+389",
  "Madagascar": "+261", "Malaezia": "+60", "Malawi": "+265", "Maldive": "+960", "Mali": "+223",
  "Malta": "+356", "Maroc": "+212", "Insulele Marshall": "+692", "Mauritania": "+222",
  "Mauritius": "+230", "Mexic": "+52", "Micronezia": "+691", "Monaco": "+377", "Mongolia": "+976",
  "Muntenegru": "+382", "Mozambic": "+258", "Myanmar": "+95", "Namibia": "+264", "Nauru": "+674",
  "Nepal": "+977", "Nicaragua": "+505", "Niger": "+227", "Nigeria": "+234", "Norvegia": "+47",
  "Noua Zeelandă": "+64", "Olanda": "+31", "Oman": "+968", "Pakistan": "+92", "Palau": "+680",
  "Palestina": "+970", "Panama": "+507", "Papua Noua Guinee": "+675", "Paraguay": "+595",
  "Peru": "+51", "Polonia": "+48", "Portugalia": "+351", "Qatar": "+974", "Regatul Unit": "+44",
  "Republica Centrafricană": "+236", "Republica Dominicană": "+1809",
  "Republica Democrată Congo": "+243", "Ruanda": "+250", "Rusia": "+7",
  "Saint Kitts și Nevis": "+1869", "Saint Lucia": "+1758", "Saint Vincent și Grenadinele": "+1784",
  "Samoa": "+685", "San Marino": "+378", "São Tomé și Príncipe": "+239", "Senegal": "+221",
  "Serbia": "+381", "Seychelles": "+248", "Sierra Leone": "+232", "Singapore": "+65",
  "Siria": "+963", "Slovacia": "+421", "Slovenia": "+386", "Insulele Solomon": "+677",
  "Somalia": "+252", "Spania": "+34", "Sri Lanka": "+94", "Statele Unite ale Americii": "+1",
  "Sudan": "+249", "Sudanul de Sud": "+211", "Suedia": "+46", "Surinam": "+597",
  "Tadjikistan": "+992", "Tanzania": "+255", "Thailanda": "+66", "Timorul de Est": "+670",
  "Togo": "+228", "Tonga": "+676", "Trinidad și Tobago": "+1868", "Tunisia": "+216", "Turcia": "+90",
  "Turkmenistan": "+993", "Tuvalu": "+688", "Ucraina": "+380", "Uganda": "+256", "Ungaria": "+36",
  "Uruguay": "+598", "Uzbekistan": "+998", "Vanuatu": "+678", "Vatican": "+379", "Venezuela": "+58",
  "Vietnam": "+84", "Yemen": "+967", "Zambia": "+260", "Zimbabwe": "+263",
};
/* Ordinea vine din TARI — România prima, apoi Republica Moldova, apoi
   alfabetic — asa ca majoritatea clientilor (romani) gasesc prefixul
   fara sa caute. */

export const DIAL_LIST = TARI.map((t) => ({ country: t, dial: PHONE_DIAL[t] })).filter((d) => d.dial);

/* Desparte un numar deja salvat in prefix+rest — daca nu incepe cu "+"
   e tratat ca un numar romanesc vechi (fara prefix), ca sa nu se piarda
   nimic la editarea unei fise existente. Un asemenea numar vechi incepe
   de obicei cu 0 (format local, "0722 111 222") — il scoatem la despartire,
   ca afisarea sa arate exact ce ar trebui tastat acum, cu prefixul deja
   ales: altfel validarea nou-adaugata ("nu pune 0 dupa prefix") ar
   respinge o fisa veche neschimbata, doar redeschisa pentru editare. */
