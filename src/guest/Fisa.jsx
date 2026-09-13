/* Fisa de cazare, completata de oaspete — intr-o fereastra, deschisa dintr-un
 * banner pe rand intreg de deasupra celor patru butoane.
 *
 * ASA STA DIN 13 SEPTEMBRIE 2026. Pana atunci era un card IN CURGEREA
 * paginii, care ascundea sectiunile de dedesubt pana la semnare — decizie
 * documentata in docs/fisa-cazare.md 0. Proprietarul a semnalat ca
 * ascunderea nu e o solutie buna: oaspetele nu vede ce urmeaza sa gaseasca pe
 * pagina, doar un formular, si pare ca restul lipseste. Vezi
 * docs/fisa-cazare.md 8 pentru schimbare.
 *
 * Fereastra e Fereastra.jsx, aceeasi folosita si de „Acces catre camere" si
 * de regulament — nu o reconstructie. Prima varianta a acestui fisier
 * incercase un panou fix peste pagina, tinut totusi „netransparent la clic"
 * ca butonul usii sa ramana apasabil prin el; verificat cu
 * `elementFromPoint`, raspundea o eticheta din formular — butonul se VEDEA,
 * dar nu se putea apasa. Fereastra.jsx e o fereastra MODALA adevarata, cu
 * fundal opac care inchide la clic, exact ca acces/regulament, si evita
 * capcana aia din start.
 *
 * `deschis` controleaza doar daca fereastra se ARATA. Componenta ramane
 * MONTATA de catre App.jsx cat timp fisa nu e cunoscuta drept completata,
 * indiferent de `deschis`: efectul de mai jos verifica in fundal, la
 * montare, daca fisa e deja gata (de pe alt telefon, sau de receptie) si
 * cheama `onGata` fara niciun clic — asa dispare bannerul singur, fara sa
 * oblige omul sa deschida fereastra doar ca sa afle ca era deja completata.
 *
 * Campurile marcate `sensibil` in lib/fisa.js pornesc GOALE chiar daca
 * oaspetele a mai stat la noi. Nu e o scapare a precompletarii: sunt exact
 * campurile pe care am hotarat sa nu le citim inapoi.
 */
import { useEffect, useRef, useState } from "react";
import { CAMPURI, ACT_TIPURI, valideazaFisa, SABLON_VERSIUNE,
         dataInParti, dataDinParti } from "../lib/fisa.js";
import { traseuSvg, esteGoala } from "../lib/semnatura.js";
import { citesteFisa, trimiteFisa } from "./api.js";
import { ASISTENTA, WIFI } from "./continut.js";
import Semnatura from "./Semnatura.jsx";
import Fereastra from "./Fereastra.jsx";

/* DATA NASTERII, IN TREI CASETE — nu `<input type="date">`.
 *
 * Calendarul nativ al telefonului porneste de la anul curent. Ca sa ajungi la
 * 1980 derulezi patruzeci de ani, stand in fata usii. Trei casete de cifre se
 * completeaza din tastatura numerica, fara nicio derulare.
 *
 * Ordinea e ZI-LUNA-AN, cum se scrie si cum se citeste in romana. Compunerea
 * in „AAAA-LL-ZZ" o face lib/fisa.js, ca sa fie aceeasi si aici, si la
 * receptie, si sa poata fi verificata de teste fara DOM.
 *
 * PARTILE STAU IN STARE LOCALA, iar in sus pleaca sirul compus. Altfel, cine
 * tasteaza prima cifra din zi ar vedea caseta golindu-se: din „1" nu se poate
 * compune nicio data, deci sirul de sus e vid, iar caseta l-ar arata. Starea
 * locala se seamana o singura data fiindca data nasterii nu se precompleteaza
 * NICIODATA — e camp sensibil — deci nimeni nu i-o schimba din afara.
 */
function DataNasterii({ valoare, eroare, onSchimbare }) {
  const [parti, setParti] = useState(() => dataInParti(valoare));
  const refZi = useRef(null);
  const refLuna = useRef(null);
  const refAn = useRef(null);

  const pune = (care, brut, maxim, urmator) => {
    /* Doar cifre. Pe telefon tastatura numerica mai scapa un separator, iar
       o virgula intrata in „zi" ar fi facut data nevalida fara ca omul sa
       vada de ce. */
    const v = String(brut).replace(/\D/g, "").slice(0, maxim);
    const noi = { ...parti, [care]: v };
    setParti(noi);
    onSchimbare(dataDinParti(noi));
    /* Saltul la caseta urmatoare la ultima cifra: altfel trei casete sunt
       mai multa munca decat una. */
    if (v.length === maxim && urmator?.current) urmator.current.focus();
  };

  /* Backspace pe o caseta goala se intoarce. Fara asta, cine greseste anul
     trebuie sa atinga ecranul ca sa se intoarca la luna. */
  const inapoi = (e, precedent) => {
    if (e.key === "Backspace" && e.currentTarget.value === "" && precedent?.current) {
      precedent.current.focus();
    }
  };

  const casete = [
    { cheie: "zi",   eticheta: "Ziua",  loc: "ZZ",   maxim: 2, ref: refZi,   urmator: refLuna, precedent: null,    autocomplete: "bday-day" },
    { cheie: "luna", eticheta: "Luna",  loc: "LL",   maxim: 2, ref: refLuna,  urmator: refAn,   precedent: refZi,   autocomplete: "bday-month" },
    { cheie: "an",   eticheta: "Anul",  loc: "AAAA", maxim: 4, ref: refAn,    urmator: null,    precedent: refLuna, autocomplete: "bday-year" },
  ];

  return (
    /* `div` cu `role="group"`, nu `label`: o eticheta se leaga de un singur
       camp, iar aici sunt trei. Asa cititorul de ecran anunta grupul, apoi
       fiecare caseta cu numele ei. */
    <div className="g-camp" role="group" aria-labelledby="fisa-nastere">
      <span className="g-camp-eticheta" id="fisa-nastere">Data nașterii</span>
      <div className="g-data">
        {casete.map((c) => (
          <input key={c.cheie} ref={c.ref}
            className={`g-data-caseta g-data-${c.cheie}`}
            inputMode="numeric" autoComplete={c.autocomplete}
            placeholder={c.loc} aria-label={c.eticheta}
            value={parti[c.cheie]}
            onKeyDown={(e) => inapoi(e, c.precedent)}
            onChange={(e) => pune(c.cheie, e.target.value, c.maxim, c.urmator)} />
        ))}
      </div>
      {eroare && <span className="g-camp-eroare">{eroare}</span>}
    </div>
  );
}

export default function Fisa({ cod, onGata, deschis, onInchide }) {
  const [date, setDate] = useState({});
  const [linii, setLinii] = useState([]);
  const [erori, setErori] = useState({});
  const [stare, setStare] = useState("incarca");
  const [mesaj, setMesaj] = useState("");

  useEffect(() => {
    let viu = true;
    citesteFisa(cod)
      .then((r) => {
        if (!viu) return;
        if (r?.gata) { onGata(); return; }
        /* Precompletarea aduce doar campurile nesensibile — vezi
           guest_fisa_precompletare. Restul raman goale, deliberat. */
        setDate(r?.date || {});
        setStare("gata");
      })
      /* Fisa nu se poate incarca: aratam formularul gol, nu un ecran de
         eroare. Oaspetele poate completa tot de mana, iar scrierea are
         propriul drum de esec. Un refuz aici l-ar fi lasat blocat. */
      .catch(() => { if (viu) setStare("gata"); });
    return () => { viu = false; };
  }, [cod, onGata]);

  const pune = (cheie, v) => setDate((d) => ({ ...d, [cheie]: v }));

  async function trimite() {
    const v = valideazaFisa(date);
    const toate = { ...v.erori };
    if (esteGoala(linii)) toate.semnatura = "Semnează în chenarul de mai sus.";
    setErori(toate);
    if (Object.keys(toate).length > 0) return;

    setStare("trimit");
    const r = await trimiteFisa(cod, {
      ...date,
      semnaturaSvg: traseuSvg(linii),
      sablonVersiune: SABLON_VERSIUNE,
    });
    if (r?.ok) { onGata(); return; }
    setStare("gata");
    setMesaj(r?.motiv === "deja-completata"
      ? "Fișa e deja completată."
      : "Nu am putut trimite fișa. Mai încearcă o dată.");
  }

  /* Componenta ramane montata (efectul de mai sus tot ruleaza) chiar cand nu
     e nimic de aratat: fereastra inchisa, sau datele inca in drum de la
     server. In ambele cazuri nu randeaza nimic — `deschis` decide doar daca
     merita deschisa fereastra din jur. */
  if (!deschis) return null;

  return (
    <Fereastra titlu="Fișă de cazare" onInchide={onInchide}>
      {stare === "incarca" ? (
        <p className="g-gol">Se încarcă…</p>
      ) : (
        <>
          <p className="g-fisa-intro">
            E obligatorie la cazare, o singură dată pe sejur.
          </p>

          {/* Wi-fi-ul si asistenta stau AICI si dupa mutarea in fereastra:
              cine apasa bannerul inainte sa deschida „Bun venit" tot are
              nevoie de retea ca sa trimita formularul, si de un numar la
              indemana daca se impotmoleste. */}
          <p className="g-fisa-ajutor">
            Rețeaua <strong>{WIFI.retea}</strong>, fără parolă. Dacă te
            împotmolești, sună-l pe {ASISTENTA.nume} la{" "}
            <a href={`tel:${ASISTENTA.telefon}`}>{ASISTENTA.scris}</a>.
          </p>

          {CAMPURI.map((c) => (c.tip === "date" ? (
            <DataNasterii key={c.cheie} valoare={date[c.cheie]} eroare={erori[c.cheie]}
              onSchimbare={(v) => pune(c.cheie, v)} />
          ) : (
            <label key={c.cheie} className="g-camp">
              <span className="g-camp-eticheta">
                {c.eticheta}{!c.obligatoriu && <em> (dacă are)</em>}
              </span>
              {c.tip === "alegere" ? (
                <select value={date[c.cheie] || ""}
                  onChange={(e) => pune(c.cheie, e.target.value)}>
                  <option value="">Alege…</option>
                  {ACT_TIPURI.map((t) => (
                    <option key={t.cheie} value={t.cheie}>{t.eticheta}</option>
                  ))}
                </select>
              ) : (
                <input type={c.tip === "date" ? "date" : "text"}
                  value={date[c.cheie] || ""}
                  onChange={(e) => pune(c.cheie, e.target.value)} />
              )}
              {erori[c.cheie] && <span className="g-camp-eroare">{erori[c.cheie]}</span>}
            </label>
          )))}

          <Semnatura valoare={linii} onSchimbare={setLinii} />
          {erori.semnatura && <span className="g-camp-eroare">{erori.semnatura}</span>}

          {mesaj && <p className="g-fisa-mesaj" role="alert">{mesaj}</p>}

          <button type="button" className="g-fisa-trimit" disabled={stare === "trimit"}
            onClick={trimite}>
            {stare === "trimit" ? "Trimit…" : "Semnez și trimit"}
          </button>
        </>
      )}
    </Fereastra>
  );
}
