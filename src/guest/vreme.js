/* Vremea de la complex, pentru coltul din dreapta sus al paginii.
 *
 * DE CE OPEN-METEO. E gratuit, nu cere cheie si raspunde cu CORS deschis,
 * deci merge dintr-o pagina statica fara niciun server intre. Alternativa
 * obisnuita — un widget gata facut, lipit ca <iframe> — ar fi adus reclame,
 * urmarire si un al doilea design in mijlocul paginii noastre.
 *
 * CE AFLA SERVICIUL DESPRE OASPETE: ca cineva a cerut vremea pentru
 * coordonatele complexului. Codul sejurului sta in fragmentul adresei, care
 * nu pleaca niciodata catre niciun server, deci nu are cum sa ajunga acolo.
 *
 * Daca cererea esueaza, blocul nu se afiseaza deloc. Un „—" in locul
 * temperaturii ar arata ca pagina e stricata, iar vremea e podoaba, nu
 * motivul pentru care s-a deschis pagina.
 */

/* Codurile WMO intoarse de Open-Meteo, grupate in sase stari. Gruparea e
   deliberat grosolana: „burniță slabă intermitentă" si „burniță deasă" nu
   schimba cu nimic ce face omul mai departe. */
const STARI = [
  { chei: [0],                              fel: "senin",    text: "senin" },
  { chei: [1, 2],                           fel: "parcial",  text: "parțial noros" },
  { chei: [3],                              fel: "innorat",  text: "înnorat" },
  { chei: [45, 48],                         fel: "ceata",    text: "ceață" },
  { chei: [51, 53, 55, 56, 57,
           61, 63, 65, 66, 67,
           80, 81, 82],                     fel: "ploaie",   text: "ploaie" },
  { chei: [71, 73, 75, 77, 85, 86],         fel: "ninsoare", text: "ninsoare" },
  { chei: [95, 96, 99],                     fel: "furtuna",  text: "furtună" },
];

export function stareaVremii(cod) {
  const s = STARI.find((x) => x.chei.includes(cod));
  return s || { fel: "innorat", text: "" };
}

export async function citesteVremea({ lat, lon }, semnal) {
  const adresa = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
    + "&current=temperature_2m,weather_code&timezone=Europe%2FBucharest";

  const raspuns = await fetch(adresa, { signal: semnal, referrerPolicy: "no-referrer" });
  if (!raspuns.ok) throw new Error(`Vremea a raspuns cu ${raspuns.status}.`);
  const d = await raspuns.json();

  const t = d?.current?.temperature_2m;
  if (typeof t !== "number") throw new Error("Raspuns fara temperatura.");

  return {
    /* Rotunjit la grad intreg: „21,3°" sugereaza o precizie pe care o
       prognoza n-o are, si oricum nimeni nu-si ia haina dupa zecimala. */
    grade: Math.round(t),
    ...stareaVremii(d?.current?.weather_code),
  };
}
