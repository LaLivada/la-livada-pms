import { describe, it, expect } from "vitest";
import * as ro from "./continut.ro.js";
import * as en from "./continut.en.js";
import * as fr from "./continut.fr.js";
// Alias `itModul`, nu `it`: numele scurt s-ar fi ciocnit cu `it` din vitest,
// importat mai sus — vitest ridica "Identifier `it` has already been
// declared" la parsare, inainte sa apuce sa ruleze vreun test.
import * as itModul from "./continut.it.js";
import * as de from "./continut.de.js";
import * as ru from "./continut.ru.js";
import * as uk from "./continut.uk.js";
import * as interfataRo from "./interfata.ro.js";
import * as interfataEn from "./interfata.en.js";
import * as interfataFr from "./interfata.fr.js";
import * as interfataIt from "./interfata.it.js";
import * as interfataDe from "./interfata.de.js";
import * as interfataRu from "./interfata.ru.js";
import * as interfataUk from "./interfata.uk.js";

/* Compara forma (cheile, recursiv), nu continutul — o traducere e altfel
 * ca text, dar trebuie sa aiba EXACT aceleasi chei ca sursa romana. Un
 * camp uitat la o traducere ar lasa oaspetele cu un "undefined" pe ecran,
 * neobservat de niciun test care doar verifica ca fisierul exista. */
function chei(obiect, prefix = "") {
  if (Array.isArray(obiect)) {
    return obiect.length > 0 ? chei(obiect[0], `${prefix}[]`) : [`${prefix}[]`];
  }
  if (obiect && typeof obiect === "object") {
    return Object.keys(obiect).sort()
      .flatMap((k) => chei(obiect[k], prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

describe("forma comuna a continutului pe limbi", () => {
  const modulePeLimba = { en, fr, it: itModul, de, ru, uk };
  const cheieSursa = chei(ro);

  for (const [cod, modul] of Object.entries(modulePeLimba)) {
    it(`continut.${cod}.js are exact cheile din continut.ro.js`, () => {
      expect(chei(modul)).toEqual(cheieSursa);
    });
  }

  const cheieInterfataSursa = chei(interfataRo);
  const interfataPeLimba = {
    en: interfataEn, fr: interfataFr, it: interfataIt,
    de: interfataDe, ru: interfataRu, uk: interfataUk,
  };
  for (const [cod, modul] of Object.entries(interfataPeLimba)) {
    it(`interfata.${cod}.js are exact cheile din interfata.ro.js`, () => {
      expect(chei(modul)).toEqual(cheieInterfataSursa);
    });
  }
});
