/* Fotografiile, împărțite pe tip de cazare.
 *
 * Sunt exact fișierele galeriei din subsolul paginii, deja optimizate în trei
 * lățimi (400 / 800 / originalul). Nu s-a adăugat nimic nou: cine derulează
 * până jos înainte să caute o cameră le are deja în cache, deci alegerea
 * tipului nu mai descarcă nimic.
 *
 * Împărțirea nu e după numele fișierului, ci după ce se vede în poză:
 * cele trei „cazare-camera/interior" sunt interioare — patul văzut de la
 * mezanin, camera privită de sus — deci sunt loft-ul. Restul sunt cadre
 * aeriene cu șirul de căsuțe, deci tiny house.
 *
 * Textele alternative sunt cele scrise pentru galeria din pagină, ca aceeași
 * poză să fie descrisă la fel peste tot.
 */

const F = (nume, alt) => ({ nume, alt });

export const FOTO_TIP = {
  loft: [
    F("cazare-interior-la-livada-vaslui",
      "Interiorul spațiului de cazare de la Complex La Livada"),
    F("cazare-camera-dubla-la-livada-vaslui",
      "Cameră dublă de cazare la Complex La Livada"),
    F("cazare-camera-la-livada-vaslui",
      "Cameră de cazare la Complex La Livada"),
  ],
  tiny: [
    F("cazare-tiny-houses-printre-copaci-la-livada-vaslui",
      "Casele tip tiny house, între copacii din livadă, cu sălile de evenimente în fundal"),
    F("cazare-tiny-houses-alee-seara-la-livada-vaslui",
      "Aleea dintre casele de cazare, luminată seara"),
    F("cazare-tiny-houses-acoperisuri-la-livada-vaslui",
      "Acoperișurile caselor de cazare, văzute de sus, cu terasele luminate între ele"),
    F("cazare-tiny-houses-panorama-la-livada-vaslui",
      "Casele de cazare de la Complex La Livada, în amurg, la marginea Vasluiului"),
    F("cazare-tiny-houses-aerian-complex-la-livada-vaslui",
      "Complexul La Livada văzut de sus noaptea, cu șirul caselor de cazare"),
  ],
};

/* Varianta „mixt" înseamnă camere din amândouă tipurile, deci se arată din
   fiecare. Întâi loft-ul: interiorul spune mai mult despre unde dormi decât
   un cadru aerian, iar prima poză e singura pe care o vede toată lumea. */
export function fotoPentru(tip) {
  if (tip === "mixt") return [...FOTO_TIP.loft, ...FOTO_TIP.tiny];
  return FOTO_TIP[tip] || [];
}
