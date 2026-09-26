/* ACCES ELECTRONIC LA CAMERE — codurile de yala.
 *
 * Tot ce atinge yalele trece prin Edge Function-ul `access-provider`, niciodata
 * direct prin TTLock din browser: acolo ar trebui sa stea parola contului care
 * administreaza toate yalele.
 *
 * cheamaAcces nu arunca NICIODATA. Un check-in n-are voie sa cada fiindca o
 * yala n-a raspuns — oaspetele e la receptie, iar rezervarea conteaza mai mult
 * decat codul, care se poate regenera.
 */

import React, { useState, useEffect, useCallback } from "react";
import { Mail, MessageCircle, RefreshCw } from "lucide-react";
import { cheamaFunctie } from "../data/functii-edge.js";
import * as dateAcces from "../data/acces.js";
import { audit } from "../lib/audit.js";
import { mesajEroare } from "../lib/errors.js";
import { fmtDateTime } from "../lib/format.js";
import { loadShared, K } from "../data/stare-partajata.js";
import {
  decideActiuneAcces, randeazaSablon, SABLON_IMPLICIT, linkOaspete, dataMesaj,
  destinatarWhatsapp, NUME_HOTEL_IMPLICIT, TELEFON_ASISTENTA,
} from "../lib/acces.js";
import { toaster } from "../ui/primitive.jsx";

export const cheamaAcces = (action, payload = {}) =>
  cheamaFunctie("access-provider", "acces", { action, ...payload });

/* Aduce codul de acces la zi după ce o rezervare s-a modificat.
 *
 * Trei situații în care codul vechi nu mai are voie să rămână valabil:
 *   · perioada s-a schimbat — altfel ar deschide ușa mai mult sau mai
 *     puțin decât ține rezervarea;
 *   · camera s-a schimbat — altfel oaspetele mutat ar putea intra în
 *     continuare în camera veche, unde între timp poate sta altcineva;
 *   · rezervarea a fost anulată sau marcată no-show.
 *
 * Nu decidem noi ce se întâmplă la furnizor: `issue` din funcția edge
 * recalculează perioada din rezervare și decide singur ce face cu codul
 * vechi (`actiuneCodExistent` din lib/acces.js) — dacă doar orele s-au
 * schimbat, camera fiind aceeași, codul (PIN-ul) RĂMÂNE, doar fereastra lui
 * de valabilitate se mută pe yală; abia la schimbare de cameră se șterge
 * codul vechi și se creează altul. Aici doar recunoaștem CÂND trebuie
 * chemat, și citim din răspuns (`r.reused`) ce s-a întâmplat, ca mesajul
 * spre recepție să spună adevărul.
 *
 * Ca peste tot în integrarea asta, eșecul nu răstoarnă salvarea: rezervarea
 * e deja modificată, iar recepția primește un avertisment cu ce a rămas de
 * făcut. Un cod nesincronizat e o problemă; o rezervare pierdută e alta,
 * mai mare. */

export async function reconciliazaAcces(inainte, dupa, core) {
  if (!inainte || !dupa) return;

  const camera = core.rooms.find((r) => r.id === dupa.roomId);
  const actiune = decideActiuneAcces(inainte, dupa);
  if (!actiune) return;
  const anulata = actiune === "revoke";

  /* Un cod există doar după check-in. Fără el nu e nimic de sincronizat —
     iar la anulare nu vrem să chemăm furnizorul degeaba. */
  let areCod = false;
  try { areCod = await dateAcces.existaCodActiv(dupa.id); }
  catch (e) { console.error("verificare cod acces", e); return; }
  if (!areCod) return;

  if (anulata) {
    const r = await cheamaAcces("revoke", { reservationId: dupa.id });
    await audit.push(r?.ok ? "Cod acces revocat" : "Revocare cod eșuată",
      `${camera?.name || dupa.roomId}`, { roomId: dupa.roomId, reservationId: dupa.id });
    if (!r?.ok) {
      toaster.show(
        "Rezervarea e anulată, dar codul de acces NU a putut fi șters de pe yală. Verifică în TTHOTEL.",
        { tone: "danger" });
    }
    return;
  }

  const r = await cheamaAcces("issue", { reservationId: dupa.id });
  /* `r.reused`: acelasi PIN, doar fereastra lui pe yala s-a mutat (cazul
     „doar orele s-au schimbat"). Fara distinctia asta, mesajul ar spune
     „oaspetele are alt cod" si la o simpla mutare de ora — o minciuna care
     ar trimite receptia sa retrimita degeaba un cod care n-a plecat nicaieri. */
  await audit.push(
    r?.ok ? (r.reused ? "Cod acces: valabilitate actualizată" : "Cod acces actualizat") : "Actualizare cod eșuată",
    `${camera?.name || dupa.roomId}${inainte.roomId !== dupa.roomId ? " · cameră schimbată" : " · perioadă schimbată"}`,
    { roomId: dupa.roomId, reservationId: dupa.id });
  if (r?.ok) {
    toaster.show(
      r.reused
        ? "Perioada codului de acces a fost actualizată pe yală — oaspetele păstrează același cod."
        : "Codul de acces a fost actualizat — oaspetele are alt cod.",
      { tone: "ok" });
  } else {
    toaster.show(
      "Rezervarea e salvată, dar codul de acces nu a putut fi actualizat. Regenerează-l din rezervare.",
      { tone: "danger" });
  }
}

export function SectiuneAcces({ res, core }) {
  const camera = core.rooms.find((r) => r.id === res.roomId);
  /* undefined = încă se încarcă, null = nu există cod. Distincția
     contează: altfel s-ar vedea „fără cod" o clipă la fiecare deschidere. */
  const [cod, setCod] = useState(undefined);
  const [trimiteri, setTrimiteri] = useState([]);
  const [lucrez, setLucrez] = useState(false);
  const [eroare, setEroare] = useState("");
  /* Aceleasi setari pe care le citeste si functia edge — numele pensiunii
     si, daca i-l pune cineva vreodata, sablonul propriu. Se incarca o data,
     la deschiderea sectiunii, si nu la apasarea butonului: mesajul intra
     intr-un `href`, care trebuie sa fie gata inainte de clic. Facut la clic,
     ar fi cerut un `window.open` de dupa `await`, blocat ca fereastra
     nesolicitata in destule browsere. */
  const [setari, setSetari] = useState({});

  const incarca = useCallback(async () => {
    try {
      const { cod: c, trimiteri: t } = await dateAcces.codActivCuTrimiteri(res.id);
      setCod(c); setTrimiteri(t);
    } catch (e) {
      /* Inainte, esecul se pierdea tacit prin destructurare si sectiunea
         ramanea la nesfarsit pe "Se incarca...". */
      console.error("citire cod acces", e);
      setCod(null); setTrimiteri([]);
    }
  }, [res.id]);

  useEffect(() => { incarca(); }, [incarca]);
  useEffect(() => { loadShared(K.access, {}).then(setSetari); }, []);

  const genereaza = async () => {
    setEroare("");
    setLucrez(true);
    /* Dacă există deja un cod, butonul zice "Regenerează" — și chiar
       trebuie să dea unul nou, nu să întoarcă tot codul vechi doar fiindcă
       perioada n-a fost atinsă. */
    const r = await cheamaAcces("issue", { reservationId: res.id, force: Boolean(cod) });
    setLucrez(false);
    if (r?.ok) {
      await incarca();
      await audit.push(r.reused ? "Cod acces refolosit" : "Cod acces generat",
        `${camera?.name || res.roomId}`, { roomId: res.roomId, reservationId: res.id });
      toaster.show(r.reused ? "Codul exista deja." : "Cod de acces generat.", { tone: "ok" });
    } else {
      setEroare(r?.error || "Codul nu a putut fi generat.");
    }
  };

  if (!camera?.accessLockId) {
    return (
      <div className="field">
        <label>Acces cameră</label>
        <div className="text-secundar">
          Camera {camera?.name || res.roomId} nu are o yală asociată.
          Se configurează în Setări → Camere.
        </div>
      </div>
    );
  }

  const facutCheckIn = res.status === "checkedin" || res.status === "checkedout";
  /* Dupa check-out codul e sters (vezi doCheckOut) si nu se mai regenereaza:
     camera trece la urmatorul oaspete, iar un cod vechi inca valid ar
     deschide usa oricui il mai are, indiferent cine sta acum in camera. */
  const dupaCheckout = res.status === "checkedout";

  return (
    <div className="field">
      {/* Starea sta pe acelasi rand cu eticheta, scurt: pe telefon, o
          propozitie sub fiecare eticheta impingea folio-ul sub margine.
          Eticheta spune deja „acces", nota nu mai repeta. */}
      <div className="field-rand">
        <label>Acces cameră · {camera.name}</label>
        {cod === undefined && <span className="field-nota">Se încarcă…</span>}
        {cod === null && (
          <span className="field-nota">
            {dupaCheckout
              ? "Codul a fost șters la check-out."
              : facutCheckIn
                ? "Codul nu a fost generat."
                : "Codul se generează la check-in."}
          </span>
        )}
      </div>

      {cod && cod.provider === "simulare" && (
        <div className="error-text mb-6" role="alert">
          COD SIMULAT — nu deschide nicio ușă. Serviciul de acces e în modul de
          probă. Nu-l trimite oaspetelui.
        </div>
      )}

      {cod && (
        <div className="sumar-acces">
          <div className="mono acces-cod-mare">
            {cod.code}
          </div>
          <div className="text-secundar">
            Valabil de la <strong>{fmtDateTime(cod.valid_from)}</strong> · până la <strong>{fmtDateTime(cod.valid_until)}</strong>
          </div>
        </div>
      )}

      {eroare && (
        <div className="error-text" role="alert">
          {eroare}
        </div>
      )}

      {cod && trimiteri.length > 0 && (
        <div className="text-secundar mt-8">
          {trimiteri.slice(0, 4).map((t) => (
            <div key={t.id}>
              {t.channel === "email" ? "Email" : "WhatsApp"}:{" "}
              {t.status === "sent" ? "✓ trimis" : "✗ eșuat"}
              {t.sent_at ? ` · ${fmtDateTime(t.sent_at)}` : ""}
              {t.error_message ? ` · ${t.error_message}` : ""}
            </div>
          ))}
        </div>
      )}

      {(facutCheckIn || cod) && !dupaCheckout && (
        <div className="quick-actions acces-actions mt-8">
          <button className="btn btn-ghost" onClick={genereaza} disabled={lucrez}>
            <RefreshCw size={14} color="var(--accent)" />
            {lucrez ? "Lucrez…" : cod ? "Regenerează" : "Generează"}
          </button>

          {cod && cod.provider !== "simulare" && (
            <button className="btn btn-ghost" disabled={lucrez} onClick={async () => {
              setEroare("");
              setLucrez(true);
              const r = await cheamaAcces("send-email", { reservationId: res.id });
              setLucrez(false);
              await incarca();
              if (r?.ok) toaster.show(`Cod trimis pe email · ${r.recipient}`, { tone: "ok" });
              else setEroare(r?.error || "Emailul nu a putut fi trimis.");
            }}>
              <Mail size={14} color="#2563eb" />
              Email
            </button>
          )}

          {cod && cod.provider !== "simulare" && (() => {
            /* WhatsApp merge prin linkul wa.me: nu avem API oficial, iar o
               automatizare pe WhatsApp Web ar fi fragilă și împotriva
               regulilor lor. Recepționerul apasă trimite în aplicație.
               Consemnăm doar că mesajul a fost pregătit — nu putem confirma
               livrarea, și nu pretindem că o facem. */
            const oaspete = core.guests.find((g) => g.id === res.guestId);
            /* La grup, codul pleacă la OCUPANT când i s-a scris telefonul —
               vezi destinatarWhatsapp. Numele din salut vine de acolo, nu
               separat: altfel mesajul ar saluta titularul pe telefonul
               ocupantului. */
            const catre = destinatarWhatsapp(res, oaspete);
            const cifre = catre.cifre;
            if (!cifre) {
              return <span className="text-secundar acces-nota-centrata">
                Numărul de WhatsApp nu este disponibil.
              </span>;
            }
            /* Același șablon ca la email, din src/lib/acces.js — până pe
               7 septembrie 2026 textul era scris aici de mână și cele două
               apucaseră să se despartă. Randarea în browser e în regulă
               tocmai pentru că mesajul pleacă tot de aici: recepționerul îl
               vede în WhatsApp înainte să apese trimite.
               "whatsapp" e singurul loc care cere aldin — vezi
               ingroasaPeCanal în src/lib/acces.js: pe email (implicit)
               `**text**` devine text simplu, aici devine *text*, bold-ul
               nativ WhatsApp. */
            const text = randeazaSablon(setari.messageTemplate || SABLON_IMPLICIT, {
              guest_name:  catre.nume || "oaspete",
              hotel_name:  setari.hotelName || NUME_HOTEL_IMPLICIT,
              room_number: camera.name,
              access_code: cod.code,
              valid_from:  dataMesaj(cod.valid_from),
              valid_until: dataMesaj(cod.valid_until),
              guest_link:  linkOaspete(res.guestCode),
              support_phone: TELEFON_ASISTENTA,
            }, "whatsapp");
            return (
              <a className="btn btn-ghost" href={`https://wa.me/${cifre}?text=${encodeURIComponent(text)}`}
                target="_blank" rel="noopener noreferrer"
                /* Cui pleacă, scris explicit: la un grup, destinatarul nu mai
                   e cel din capul rezervării, iar recepția trebuie s-o poată
                   verifica înainte de a apăsa. */
                title={catre.esteOcupant
                  ? `Către ocupant${catre.nume ? ` · ${catre.nume}` : ""} · ${cifre}`
                  : `Către titular${catre.nume ? ` · ${catre.nume}` : ""} · ${cifre}`}
                onClick={() => {
                  cheamaAcces("log-whatsapp", { reservationId: res.id, recipient: cifre })
                    .then(() => incarca());
                }}>
                <MessageCircle size={14} color="#25D366" />
                WhatsApp
              </a>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* Doar-vizualizare pentru o rezervare existentă: detalii, acces yală și
   facturare — fără câmpurile de editare (cameră, date, client, status).
   `SectiuneAcces`/`FolioPanel` sunt aceleași componente folosite și în
   ReservationModal, nemodificate — doar reasamblate aici. */
