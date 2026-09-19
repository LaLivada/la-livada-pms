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
import * as regulamentRo from "./regulament.ro.js";
import * as regulamentEn from "./regulament.en.js";
import * as regulamentFr from "./regulament.fr.js";
import * as regulamentIt from "./regulament.it.js";
import * as regulamentDe from "./regulament.de.js";
import * as regulamentRu from "./regulament.ru.js";
import * as regulamentUk from "./regulament.uk.js";
import * as atractiiTextRo from "./atractii-text.ro.js";
import * as atractiiTextEn from "./atractii-text.en.js";
import * as atractiiTextFr from "./atractii-text.fr.js";
import * as atractiiTextIt from "./atractii-text.it.js";
import * as atractiiTextDe from "./atractii-text.de.js";
import * as atractiiTextRu from "./atractii-text.ru.js";
import * as atractiiTextUk from "./atractii-text.uk.js";

/* Compara forma (cheile, recursiv), nu continutul — o traducere e altfel
 * ca text, dar trebuie sa aiba EXACT aceleasi chei ca sursa romana. Un
 * camp uitat la o traducere ar lasa oaspetele cu un "undefined" pe ecran,
 * neobservat de niciun test care doar verifica ca fisierul exista. */
function chei(obiect, prefix = "") {
  if (Array.isArray(obiect)) {
    // Lungimea intra in comparatie ca o cheie in plus: doar primul element
    // n-ar fi prins o traducere care a pierdut sau a adaugat un rand (o
    // regula lipsa din REGULAMENT, o atractie in plus).
    const cheileElementelor = obiect.length > 0 ? chei(obiect[0], `${prefix}[]`) : [`${prefix}[]`];
    return [`${prefix}[].lungime=${obiect.length}`, ...cheileElementelor];
  }
  if (obiect && typeof obiect === "object") {
    return Object.keys(obiect).sort()
      .flatMap((k) => chei(obiect[k], prefix ? `${prefix}.${k}` : k));
  }
  // Tipul intra in cheie: o traducere care a inlocuit o functie parametrizata
  // (ex. eroriCamp.LIPSA) cu un sir simplu ar fi trecut neobservata altfel,
  // fiindca ambele sunt frunze fara sub-chei proprii.
  return [`${prefix}:${typeof obiect}`];
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

  const cheieRegulamentSursa = chei(regulamentRo);
  const regulamentPeLimba = {
    en: regulamentEn, fr: regulamentFr, it: regulamentIt,
    de: regulamentDe, ru: regulamentRu, uk: regulamentUk,
  };
  for (const [cod, modul] of Object.entries(regulamentPeLimba)) {
    it(`regulament.${cod}.js are exact cheile din regulament.ro.js`, () => {
      expect(chei(modul)).toEqual(cheieRegulamentSursa);
    });
  }

  const cheieAtractiiTextSursa = chei(atractiiTextRo);
  const atractiiTextPeLimba = {
    en: atractiiTextEn, fr: atractiiTextFr, it: atractiiTextIt,
    de: atractiiTextDe, ru: atractiiTextRu, uk: atractiiTextUk,
  };
  for (const [cod, modul] of Object.entries(atractiiTextPeLimba)) {
    it(`atractii-text.${cod}.js are exact cheile din atractii-text.ro.js`, () => {
      expect(chei(modul)).toEqual(cheieAtractiiTextSursa);
    });
  }
});
