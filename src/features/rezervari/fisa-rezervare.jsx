/* REZERVARI / FISA DE REZERVARE — fereastra de creare si editare, in sectiuni
 * pliabile (Oaspete · Sejur · Pret · Note · Acces), plus fereastra orelor de
 * sosire si plecare.
 *
 * Desprins din features/rezervari.jsx (faza 4, D1 din docs/audit-2026-09.md):
 * acelasi cod, aceleasi nume exportate, fara schimbare de comportament.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { DoorOpen, Plus, X, Search, Check, Trash2, UsersRound, LogIn, Printer, ArrowRight, Wrench, Clock } from "lucide-react";
import { uid } from "../../lib/uid.js";
import { audit } from "../../lib/audit.js";
import { guestFullName } from "../../lib/nume.js";
import { nightsBetween, rangesOverlap, validateStay, isLive } from "../../lib/availability.js";
import { adaugaZile, momentLocal, adaugaZileLaData, laOraLocala } from "../../lib/timp.js";
import { SectiunePliabila } from "../../ui/sectiune.jsx";
import {
  sectiuniImplicite, TOATE_DESCHISE, rezumatOaspete, rezumatSejur, rezumatPret, rezumatNote,
  rezumatAcces, rezumatFisa,
} from "../../lib/fisa-sectiuni.js";
import { liveReservationTotalOnline, diferentaDePret } from "../../lib/pricing.js";
import { splitEvenly } from "../../lib/money.js";
import { canCheckIn, canCheckOut, ZILE_CHECKIN_DEVREME, STATUSURI_CAZABILE } from "../../lib/tranzitii.js";
import { fmtMoney, fmtDate, fmtDateTime, toLocalInputValue, withNewDate, initials, validatePrice } from "../../lib/format.js";
import { ROOM_TYPE, STATUS_LABEL, CREATE_STATUSES, EDIT_STATUSES, SOURCES, DEFAULT_TAGS } from "../../lib/constante.js";
import { Dialog, toaster, useModalLock, useAduInVizor, useIntarziat, OccupantStepper } from "../../ui/primitive.jsx";
import { useInterfata } from "../../ui/interfata.jsx";
import { cautaOaspeti, MIN_LITERE_CAUTARE } from "../../data/oaspeti.js";
import * as dateFise from "../../data/fise.js";
import { ORA_SOSIRE_IMPLICITA, ORA_PLECARE_IMPLICITA } from "../../lib/acces.js";
import { SectiuneAcces, cheamaAcces, reconciliazaAcces } from "../acces.jsx";
import { reconciliazaTv } from "../tv-mesaje.js";
import { SectiuneFisa } from "../fise.jsx";
import { FolioPanel, BillingCustomerModal, billingCustomerLabel } from "../facturare.jsx";
import { GuestModal, ContactQuickActions, emptyGuest } from "../clienti.jsx";
import { ArrivalForm } from "../documente.jsx";
import { GroupEditor, GroupPrint } from "../grupuri.jsx";

/* Ora locala dintr-o valoare de <input type="datetime-local"> ("2026-09-04T14:00"). */
const oraDin = (v) => Number(String(v).slice(11, 13));

/* Orele unei cazari anume — sosire si plecare.
 *
 * DE CE O FEREASTRA SEPARATA, nu doua campuri langa date. Orele nu se ating
 * aproape niciodata: 14:00 → 11:00 e regula casei, iar randul de date ar fi
 * devenit de doua ori mai incarcat pentru un caz rar. Aici mai incape si
 * avertismentul care conteaza — ca se schimba fereastra codului de acces —
 * imposibil de scris lizibil intr-o eticheta de camp.
 *
 * Nu salveaza singura. Intoarce valorile in formularul de deasupra, iar
 * salvarea trece prin acelasi drum ca orice alta modificare de rezervare —
 * inclusiv prin `decideActiuneAcces`, care vede perioada schimbata si cere
 * refacerea codului. Asa nu exista o a doua cale de scriere care sa poata
 * uita de cod. */
function OreCazareModal({ checkin, checkout, onClose, onSave }) {
  const [ora1, setOra1] = useState(checkin.slice(11, 16));
  const [ora2, setOra2] = useState(checkout.slice(11, 16));
  useModalLock();

  const valid = /^\d{2}:\d{2}$/.test(ora1) && /^\d{2}:\d{2}$/.test(ora2);
  const schimbat = ora1 !== checkin.slice(11, 16) || ora2 !== checkout.slice(11, 16);

  return (
    <Dialog title="Orele cazării" onClose={onClose}>
      <div className="field-row">
        <label className="field">
          <span className="fl">Sosire</span>
          <input type="time" value={ora1} onChange={(e) => setOra1(e.target.value)} step="300" />
        </label>
        <label className="field">
          <span className="fl">Plecare</span>
          <input type="time" value={ora2} onChange={(e) => setOra2(e.target.value)} step="300" />
        </label>
      </div>

      <p className="text-secundar mt-10">
        Codul de acces urmează exact aceste ore: merge de la ora de sosire
        până la cea de plecare, plus minutele de grație din Setări.
        {schimbat && " Dacă există deja un cod, acesta rămâne același — doar valabilitatea lui pe yală se actualizează la salvare."}
      </p>

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Anulează</button>
        <button className="btn btn-primary btn-lat" disabled={!valid}
          onClick={() => onSave(checkin.slice(0, 11) + ora1, checkout.slice(0, 11) + ora2)}>
          Salvează orele
        </button>
      </div>
    </Dialog>
  );
}

/* Eroarea de validare sub campul de care tine (interfata noua): ghidul cere
   eroarea langa camp, nu doar un rand sus in fereastra. Un singur mesaj o
   data, deci un singur ref, adus in vizor de ReservationModal. */
function EroareCamp({ eroare, camp, noua, refEroare }) {
  if (!noua || !eroare || eroare.camp !== camp) return null;
  return <div ref={refEroare} className="error-text eroare-camp" role="alert">{eroare.text}</div>;
}

export function ReservationModal({ data, core, updateCore, reservations, updateReservations, groups, updateGroups, blocks, updateBlocks, stergeRezervari, stergeGrupuri, adaugaOaspetiInCache, salveazaOaspete, onClose }) {
  useModalLock();
  const editing = data.reservation;
  const [mode, setMode] = useState(data.mode || "single");
  const [roomId, setRoomId] = useState(editing?.roomId || data.defaultRoomId || core.rooms[0]?.id || "");
  const [roomIds, setRoomIds] = useState(data.defaultRoomId ? [data.defaultRoomId] : []);
  const [groupName, setGroupName] = useState("");
  const [guestId, setGuestId] = useState(editing?.guestId || "");
  const [guestQuery, setGuestQuery] = useState("");
  const [guestFormSeed, setGuestFormSeed] = useState(null);
  const [billingCustomerId, setBillingCustomerId] = useState(editing?.billingCustomerId || "");
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [checkin, setCheckin] = useState(
    editing ? toLocalInputValue(editing.checkin) :
    /* 14:00, nu 15:00 ca pana pe 4 septembrie 2026: ora de sosire e acum si
       ora de la care merge codul de acces (vezi inceputCod in lib/acces.js),
       iar regula casei e „din ziua cazarii, de la 14:00". */
    toLocalInputValue(laOraLocala(data.defaultDate ? new Date(data.defaultDate) : new Date(), ORA_SOSIRE_IMPLICITA, 0))
  );
  const [checkout, setCheckout] = useState(
    editing ? toLocalInputValue(editing.checkout) :
    toLocalInputValue(laOraLocala(adaugaZile(data.defaultDate ? new Date(data.defaultDate) : new Date(), 1), ORA_PLECARE_IMPLICITA, 0))
  );
  const [oreModal, setOreModal] = useState(false);
  /* "Salvează orele" din popup-ul mic scria pana acum DOAR starea locala
     (checkin/checkout) — omul credea ca a salvat (butonul chiar zice
     "Salveaza"), inchidea fisa fara sa mai apese si marele "Salveaza" de
     jos, si ora noua nu ajungea niciodata in baza. Confirmat direct: nicio
     scriere pe reservations in jurnalul serverului cat timp raportul spunea
     "tot nu se modifica" — cererea nu pleca deloc din browser.
     Acum, la o rezervare EXISTENTA, popup-ul chiar salveaza: seteaza ora,
     apoi cere un salveaza() real la urmatorul randare, cand `checkin`/
     `checkout` chiar reflecta valoarea noua — un setState nu se vede in
     aceeasi inchidere (acelasi motiv pentru care butoanele de check-in/out
     dau `statusNou` explicit lui saveInner, mai jos). */
  const salveazaOreleRef = useRef(false);
  useEffect(() => {
    if (!salveazaOreleRef.current) return;
    salveazaOreleRef.current = false;
    save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkin, checkout]);
  /* "edit" deschide grupul, "print" lista de cazare — acelasi tipar ca in
     GroupsView si in „Vezi rezervarea". */
  const [grupModal, setGrupModal] = useState(null);
  const [status, setStatus] = useState(editing?.status || "confirmed");
  /* La creare: doar Cerere/Confirmata/Protocol. La editare: starile
     operationale clasice — plus statusul curent, daca a ramas pe
     Cerere/Protocol si n-a fost inca trecut mai departe, ca sa nu
     dispara din select fara sa fi fost ales explicit altceva. */
  const statusOptions = !editing
    ? CREATE_STATUSES
    : EDIT_STATUSES.includes(editing.status) ? EDIT_STATUSES : [editing.status, ...EDIT_STATUSES];
  const [priceOverride, setPriceOverride] = useState(editing?.priceOverride ?? "");
  const [adults, setAdults] = useState(editing?.adults ?? 2);
  const [children, setChildren] = useState(editing?.children ?? 0);
  const [source, setSource] = useState(editing?.source || "direct");
  const [tags, setTags] = useState(editing?.tags || []);
  const [newTag, setNewTag] = useState("");
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [showArrival, setShowArrival] = useState(false);
  const [notes, setNotes] = useState(editing?.notes || "");
  /* Ocupantul: cine doarme efectiv in camera, cand nu e acelasi cu clientul
     din capul rezervarii. Se putea scrie doar din Grupuri → editeaza grupul,
     desi telefonul lui decide unde pleaca codul de acces pe WhatsApp (vezi
     destinatarWhatsapp din lib/acces.js). Aceleasi trei campuri ca acolo, in
     aceeasi ordine — altfel aceeasi persoana ar fi introdusa diferit din
     doua ecrane. */
  const [occupantLastName, setOccupantLastName] = useState(editing?.occupantLastName || "");
  const [occupantFirstName, setOccupantFirstName] = useState(editing?.occupantFirstName || "");
  const [occupantPhone, setOccupantPhone] = useState(editing?.occupantPhone || "");
  /* Eroarea de validare: textul si campul de care tine. Interfata noua o
     arata sub camp (EroareCamp) si il aduce in vizor; cea actuala, sus in
     fereastra, ca pana acum. */
  const [eroare, setEroare] = useState(null);
  const setError = (text, camp = null) => setEroare(text ? { text, camp } : null);
  const error = eroare?.text || "";
  const { noua } = useInterfata();
  const refEroare = useRef(null);
  useEffect(() => {
    if (noua && eroare?.camp) refEroare.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [noua, eroare]);
  /* Sectiunile pliabile (faza 3, C4, lib/fisa-sectiuni.js): la o rezervare
     noua sunt deschise cele de completat (oaspete, sejur, pret); la editare
     toate stau pliate, cu rezumatul in cap — desfaci ce ai de schimbat. O
     eroare de validare le desface pe toate, ca sa se vada campul cu pricina. */
  const [sectiuni, setSectiuni] = useState(() => sectiuniImplicite({ editing: !!editing }));
  const comuta = (cheie) => setSectiuni((s) => ({ ...s, [cheie]: !s[cheie] }));
  useEffect(() => { if (error) setSectiuni(TOATE_DESCHISE); }, [error]);
  const numeCamera = (id) => core.rooms.find((r) => r.id === id)?.name || "";
  /* Blocheaza butoanele cat timp scrierea e in curs: un dublu-click putea
     altfel trimite doua scrieri suprapuse (a doua cu o stampila deja
     depasita) sau sterge de doua ori. Acelasi tipar exista deja la plati
     si la anulare/stornare. */
  const [saving, setSaving] = useState(false);
  const guests = core.guests;
  /* Cu tastatura deschisa pe telefon, lista de rezultate cadea sub
     marginea modalului: scriai si nu vedeai ce a gasit. */
  const refRezultateClient = useAduInVizor(Boolean(guestQuery.trim()));
  /* Cautarea are doua trepte. Cache-ul local (core.guests — oaspetii din
     fereastra de rezervari, nu toti) raspunde la fiecare tasta. Serverul
     (cauta_oaspeti, indexuri trigram) e intrebat de la 3 caractere, dupa
     250 ms de pauza, iar ce gaseste intra in cache — de unde filtrul local
     de mai jos il arata la fel ca pe restul. Un client de acum trei ani apare
     deci la o clipa dupa ce te-ai oprit din scris. */
  const textCautare = guestQuery.trim();
  const textIntarziat = useIntarziat(textCautare);
  const [cautareServer, setCautareServer] = useState({ text: "", inCurs: false, eroare: false });
  useEffect(() => {
    if (textIntarziat.length < MIN_LITERE_CAUTARE || !adaugaOaspetiInCache) return;
    let activ = true;
    setCautareServer({ text: textIntarziat, inCurs: true, eroare: false });
    cautaOaspeti(textIntarziat).then((gasiti) => {
      if (!activ) return;
      adaugaOaspetiInCache(gasiti);
      setCautareServer({ text: textIntarziat, inCurs: false, eroare: false });
    }).catch((e) => {
      if (!activ) return;
      console.warn("Cautarea de oaspeti pe server a esuat", e);
      setCautareServer({ text: textIntarziat, inCurs: false, eroare: true });
    });
    return () => { activ = false; };
  }, [textIntarziat, adaugaOaspetiInCache]);
  /* Serverul n-a raspuns inca pentru ce e scris acum: pauza nu s-a scurs,
     cererea e pe drum sau nici n-a plecat. Cat timp e asa, „niciun client"
     nu se afirma — ar oferi „Adauga client nou" pentru cineva care exista. */
  const cautareServerInCurs = textCautare.length >= MIN_LITERE_CAUTARE && Boolean(adaugaOaspetiInCache)
    && (textIntarziat !== textCautare || cautareServer.text !== textIntarziat || cautareServer.inCurs);
  const cautareServerEsuata = textCautare.length >= MIN_LITERE_CAUTARE && cautareServer.text === textIntarziat && cautareServer.eroare;

  const isGroup = !editing && mode === "group";
  const isBlock = !editing && mode === "block";
  /* Cat timp e grup, adultii/copiii se aplica identic pe fiecare camera
     selectata — capacitatea folosita e cea mai mica dintre camerele alese,
     ca nicio camera sa nu ramana peste propria capacitate. */
  const maxOccupancy = isGroup
    ? (roomIds.length ? Math.min(...roomIds.map((id) => core.rooms.find((r) => r.id === id)?.capacity || 20)) : 20)
    : (core.rooms.find((r) => r.id === roomId)?.capacity || 20);
  /* Daca nimic ce afecteaza pretul (camera/data/ocupare) nu s-a schimbat
     fata de rezervarea existenta, previzualizarea si salvarea folosesc
     pretul deja inghetat, nu un recalcul cu tarifele curente. */
  const priceAffectingChanged = !editing
    || editing.roomId !== roomId
    || new Date(editing.checkin).getTime() !== momentLocal(checkin).getTime()
    || new Date(editing.checkout).getTime() !== momentLocal(checkout).getTime()
    || (editing.adults ?? 2) !== (Number(adults) || 1)
    || (editing.children ?? 0) !== (Number(children) || 0);
  const editingGroup = editing?.groupId ? groups.find((g) => g.id === editing.groupId) : null;
  const selectedGuest = guests.find((g) => g.id === guestId) || null;
  const matchingGuests = (() => {
    const t = guestQuery.trim().toLowerCase();
    if (!t) return [];
    return guests.filter((g) =>
      guestFullName(g).toLowerCase().includes(t) ||
      (g.phone || "").replace(/\s/g, "").includes(t.replace(/\s/g, "")) ||
      (g.city || "").toLowerCase().includes(t)
    );
  })();

  const startAddGuest = () => {
    const parts = guestQuery.trim().split(/\s+/);
    setGuestFormSeed({ ...emptyGuest(), lastName: parts[0] || "", firstName: parts.slice(1).join(" ") });
    setError("");
  };

  const saveNewGuest = async (guest) => {
    if (core.guests.some((g) => g.id === guest.id)) { setGuestId(guest.id); setGuestQuery(""); setGuestFormSeed(null); return; }
    /* Un rand, direct in baza, nu prin updateCore (care ignora `guests` —
       vezi nota de acolo). Daca scrierea esueaza, formularul ramane deschis. */
    const salvat = salveazaOaspete ? await salveazaOaspete(guest) : null;
    if (!salvat) return;
    await audit.push("Client adăugat", guestFullName(salvat));
    setGuestId(salvat.id);
    setGuestQuery("");
    setGuestFormSeed(null);
  };

  const saveNewBillingCustomer = async (customer) => {
    if ((core.billingCustomers || []).some((c) => c.id === customer.id)) { setBillingCustomerId(customer.id); setBillingModalOpen(false); return; }
    await updateCore({ ...core, billingCustomers: [...(core.billingCustomers || []), customer] });
    await audit.push("Client de facturare adăugat", billingCustomerLabel(customer));
    setBillingCustomerId(customer.id);
    setBillingModalOpen(false);
  };

  /* A tag typed here joins the shared list, so it is reusable next time. */
  const commitNewTag = async () => {
    const t = newTag.trim();
    if (!t) { setNewTagOpen(false); return; }
    const list = core.tags || DEFAULT_TAGS;
    if (!list.some((x) => x.toLowerCase() === t.toLowerCase())) {
      await updateCore({ ...core, tags: [...list, t] });
      await audit.push("Etichetă adăugată", t);
    }
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setNewTag(""); setNewTagOpen(false);
  };

  const previewTotal = (() => {
    if (priceOverride !== "") {
      return Math.max(0, Number(priceOverride) || 0);
    }
    if (!isGroup && editing && !priceAffectingChanged && editing.bookedPrice != null) {
      return Number(editing.bookedPrice) || 0;
    }
    const ids = isGroup ? roomIds : [roomId];
    return ids.reduce((sum, rid) =>
      sum + liveReservationTotalOnline({ roomId: rid, checkin, checkout, adults, children, source }, core, reservations), 0);
  })();

  /* One pass over reservations and blocks per date change, rather than a
     scan per room on every render of the form. */
  const busyRooms = useMemo(() => {
    const ci = momentLocal(checkin), co = momentLocal(checkout);
    const set = new Set();
    if (isNaN(ci.getTime()) || isNaN(co.getTime())) return set;
    for (const r of reservations) {
      if (!isLive(r) || r.id === editing?.id) continue;
      if (rangesOverlap(ci, co, r.checkin, r.checkout)) set.add(r.roomId);
    }
    for (const b of blocks || []) {
      if (rangesOverlap(ci, co, b.start, b.end)) set.add(b.roomId);
    }
    return set;
  }, [checkin, checkout, reservations, blocks, editing?.id]);

  const conflictsFor = (ids) => ids.filter((rid) => busyRooms.has(rid));

  /* Corpul propriu-zis ramane neschimbat; `save`/`remove` de mai jos doar
     il imbraca in blocajul anti-dublu-click. */
  const saveInner = async (statusNou) => {
    /* Statusul efectiv al acestei salvari. Butoanele de check-in/out il dau
       explicit, ca sa nu depinda de un setState care nu s-a aplicat inca. */
    const statusFinal = statusNou || status;
    if (isBlock) {
      if (roomIds.length < 1) { setError("Selectează cel puțin o cameră de blocat.", "camere"); return; }
      const dv = validateStay(checkin, checkout);
      if (dv) { setError(dv.replace("check-in", "început").replace("check-out", "sfârșit"), "date"); return; }
      const busy = conflictsFor(roomIds);
      if (busy.length) {
        const names = busy.map((id) => core.rooms.find((r) => r.id === id)?.name).join(", ");
        setError(`Ocupate în acest interval: ${names}`, "camere"); return;
      }
      const newBlocks = roomIds.map((rid) => ({
        id: uid(), roomId: rid,
        start: momentLocal(checkin).toISOString(), end: momentLocal(checkout).toISOString(),
        reason: blockReason.trim() || "Mentenanță", createdAt: new Date().toISOString(),
      }));
      await updateBlocks([...(blocks || []), ...newBlocks]);
      await audit.push("Camere blocate",
        `${roomIds.map((id) => core.rooms.find((r) => r.id === id)?.name).join(", ")} · ${fmtDate(checkin)} → ${fmtDate(checkout)} · ${blockReason.trim() || "Mentenanță"}`);
      onClose();
      return;
    }

    if (!guestId) {
      setError(isGroup ? "Alege clientul principal al grupului." : "Caută și alege un client, sau adaugă unul nou.", "client");
      return;
    }
    const dateErr = validateStay(checkin, checkout);
    if (dateErr) { setError(dateErr, "date"); return; }
    const priceErr = validatePrice(priceOverride);
    if (priceErr) { setError(priceErr, "pret"); return; }
    if (!Number.isFinite(Number(adults)) || Number(adults) < 1) { setError("Numărul de adulți trebuie să fie cel puțin 1.", "ocupare"); return; }
    if (!Number.isFinite(Number(children)) || Number(children) < 0) { setError("Numărul de copii nu poate fi negativ.", "ocupare"); return; }
    /* Adulti/copii se clampeaza reactiv doar cand se modifica direct acele
       campuri — schimbarea camerei (sau a camerelor de grup) dupa aceea nu
       le reajusteaza, asa ca ocuparea trebuie reverificata explicit aici. */
    if (Number(adults) + Number(children) > maxOccupancy) {
      setError(`Ocuparea aleasă (${Number(adults) + Number(children)}) depășește capacitatea ${isGroup ? "camerelor selectate" : "camerei selectate"} (${maxOccupancy}).`, "ocupare");
      return;
    }

    /* Fara asta, dropdownul de status ar putea trece rezervarea in
       "checked-in" la orice data, ocolind regula pe care butoanele o
       respecta. Se blocheaza doar TRECEREA in checked-in — un sejur deja
       inceput ramane valid.
       Regula vine din canCheckIn (lib/tranzitii.js), nu e rescrisa aici:
       verificam data din FORMULAR (posibil modificata acum), cu statusul
       "confirmed" pe care rezervarea trebuie sa-l aiba ca sa poata fi
       cazata. */
    if (statusFinal === "checkedin" && editing?.status !== "checkedin"
      && !canCheckIn({ status: "confirmed", checkin })) {
      setError(`Check-in-ul se poate face cu cel mult ${ZILE_CHECKIN_DEVREME} zile înainte de sosire.`, "status");
      return;
    }

    if (isGroup) {
      if (roomIds.length < 1) { setError("Selectează cel puțin o cameră pentru grup.", "camere"); return; }
      if (!groupName.trim()) { setError("Dă un nume grupului.", "numeGrup"); return; }
      const busy = conflictsFor(roomIds);
      if (busy.length) {
        const names = busy.map((id) => core.rooms.find((r) => r.id === id)?.name).join(", ");
        setError(`Ocupate în acest interval: ${names}`, "camere"); return;
      }
      const groupId = uid();
      const group = {
        id: groupId, name: groupName.trim(), mainGuestId: guestId,
        createdAt: new Date().toISOString(), notes,
      };
      /* Pretul manual pe grup e TOTALUL sejurului, deci se imparte intre
         camere, nu se copiaza pe fiecare. splitEvenly imparte la nivel de
         ban (nu de leu, ca inainte) si distribuie restul, astfel incat
         sumele pe camere sa dea exact cat s-a tastat. */
      const groupTotal = priceOverride === "" ? null : Math.max(0, Number(priceOverride) || 0);
      const coteGrup = groupTotal != null ? splitEvenly(groupTotal, roomIds.length) : null;
      const newRes = roomIds.map((rid, idx) => {
        const base = {
          id: uid(), roomId: rid, guestId, groupId,
          checkin: momentLocal(checkin).toISOString(), checkout: momentLocal(checkout).toISOString(),
          status: statusFinal, notes,
          adults: Number(adults) || 1, children: Number(children) || 0, source,
          tags: [...tags], messages: [], billingCustomerId: billingCustomerId || null,
        };
        return coteGrup == null
          ? { ...base, priceOverride: null, bookedPrice: liveReservationTotalOnline(base, core, reservations) }
          : { ...base, priceOverride: coteGrup[idx], bookedPrice: null };
      });
      /* Fara verificarile astea, o scriere respinsa de baza (drepturi,
         suprapunere) trecea neobservata aici: eroarea aparea intr-un toast,
         dar imediat sub el se scria „Grup creat" si fereastra se inchidea.
         Recepția ramanea convinsa ca are camerele blocate. */
      if (!await updateGroups([...groups, group])) return;
      if (!await updateReservations([...reservations, ...newRes])) return;
      await audit.push("Grup creat",
        `${group.name} · ${roomIds.length} camere · ${fmtDate(checkin)} → ${fmtDate(checkout)}`);
      onClose();
      return;
    }

    if (conflictsFor([roomId]).length) { setError("Camera este deja rezervată în acest interval.", "camere"); return; }

    /* Spread `editing` first so fields this form doesn't expose — the
       per-room occupant name/phone on group rooms above all — survive a
       save instead of being silently dropped by a from-scratch rebuild. */
    const recordBase = {
      ...(editing || {}),
      id: editing?.id || uid(), roomId, guestId, groupId: editing?.groupId || null,
      checkin: momentLocal(checkin).toISOString(), checkout: momentLocal(checkout).toISOString(),
      status: statusFinal, notes,
      adults: Number(adults) || 1, children: Number(children) || 0, source, tags: [...tags],
      messages: editing?.messages || [], billingCustomerId: billingCustomerId || null,
      /* Scrise explicit, DUPA spread-ul lui `editing`: acum formularul le
         expune, deci ele sunt adevarul, nu valoarea veche din rezervare —
         altfel stergerea unui ocupant din formular n-ar avea niciun efect. */
      occupantLastName: occupantLastName.trim(),
      occupantFirstName: occupantFirstName.trim(),
      occupantPhone: occupantPhone.trim(),
      /* `occupantName` e campul COMPUS pe care il citeste `lib/nume.js` in
         calendar, liste si fise. Nu se salveaza in baza (camelRes il
         recalculeaza la citire), dar randul ramane in starea locala pana la
         urmatoarea incarcare — fara linia asta, numele vechi ar continua sa
         apara pe ecran dupa salvare. Aceeasi compunere ca in grupuri.jsx. */
      occupantName: [occupantLastName.trim(), occupantFirstName.trim()]
        .filter(Boolean).join(" "),
    };
    /* Pretul manual e mereu explicit. Cel "auto" ramane inghetat in
       bookedPrice pana cand ceva ce chiar afecteaza pretul se schimba
       (data, camera, ocupare) — un simplu re-salvare (ex. doar o nota
       modificata) sau un tarif schimbat ulterior nu il ating.
       priceAffectingChanged e calculat mai sus, langa previewTotal. */
    const record = priceOverride === ""
      ? {
          ...recordBase, priceOverride: null,
          bookedPrice: priceAffectingChanged || editing?.bookedPrice == null
            ? liveReservationTotalOnline(recordBase, core, reservations) : editing.bookedPrice,
        }
      : { ...recordBase, priceOverride: Number(priceOverride), bookedPrice: null };
    const nextRes = editing ? reservations.map((r) => (r.id === editing.id ? record : r)) : [...reservations, record];

    /* Scrierea poate fi respinsa de baza — drepturi, suprapunere, conflict
       de versiune. Daca a fost, ne oprim aici: mesajul de eroare l-a dat
       deja `raporteazaEroare`, iar un „Rezervare creată" pe deasupra ar
       spune exact pe dos fata de ce s-a intamplat.

       `updateReservations` intoarce `null` (nu doar `false`) cand refuzul a
       fost din cauza unei modificari concurente (altcineva a scris intre
       timp — de ex. chiar un check-in facut cat timp fisa asta era
       deschisa): in cazul asta formularul inchide, fiindca `editing` a
       ramas la stampila veche si orice reincercare cu aceleasi date ar fi
       respinsa identic — trebuie redeschisa rezervarea, cu datele proaspete.
       La o eroare obisnuita (retea, validare) fereastra ramane deschisa, cu
       datele in ea, ca omul sa poata reincerca direct. */
    const scrisaCuSucces = await updateReservations(nextRes);
    if (scrisaCuSucces === null) { onClose(); return; }
    if (!scrisaCuSucces) return;
    const who = guestFullName(core.guests.find((g) => g.id === guestId)) || "Fără nume";
    const rn = core.rooms.find((r) => r.id === roomId)?.name;
    /* Pretul, cu vechea si noua valoare, cand chiar s-a schimbat. Jurnalul
       spunea doar „Rezervare modificată" — adevarat, dar inutil exact in
       cazul in care cineva s-ar uita inapoi sa vada de ce s-a incasat mai
       putin. Restul campurilor raman nedetaliate: pretul e singurul cerut
       urmarit (decis pe 9 septembrie 2026). Formula sta in pricing.js,
       fiindca si ecranul de grup scrie acelasi lucru. */
    const pret = editing ? diferentaDePret(editing, record, core) : "";
    await audit.push(editing ? "Rezervare modificată" : "Rezervare creată",
      `${who} · ${rn} · ${fmtDate(checkin)} → ${fmtDate(checkout)}${pret}`, { roomId: record.roomId, reservationId: record.id });
    /* După salvare, nu înainte: dacă sincronizarea yalei cade, rezervarea
       rămâne modificată. Vezi comentariul de la reconciliazaAcces. */
    if (editing) {
      try { await reconciliazaAcces(editing, record, core); }
      catch (e) { console.error("Sincronizare acces", e); }
      /* Și televizorul: o cameră schimbată sau un ocupant rescris lasă altfel
         numele vechi pe ecranul din cameră. Separat de acces, ca o cădere a
         yalelor să nu împiedice corectarea mesajului, și invers. */
      try { await reconciliazaTv(editing, record, core); }
      catch (e) { console.error("Sincronizare televizor", e); }
    }
    toaster.show(editing ? "Rezervare actualizată" : `Rezervare creată · ${rn}`, { tone: "ok" });
    onClose();
  };

  /* `statusNou` vine de la butoanele "Marchează check-in/out", care salveaza
     pe loc. Nu ne putem baza pe setStatus + save in aceeasi apasare: setarea
     de state nu se vede in `status` decat la urmatorul render, deci salvarea
     ar folosi valoarea veche. */
  const save = async (statusNou) => {
    if (saving) return;
    setSaving(true);
    try { await saveInner(typeof statusNou === "string" ? statusNou : undefined); }
    finally { setSaving(false); }
  };

  const removeInner = async () => {
    /* Fișa semnată blochează ștergerea — și e mai bine să afli asta ÎNAINTE
       de a-i revoca oaspetelui codul de ușă. `on delete cascade` duce
       ștergerea rezervării până la fișă, iar acolo `fise_cazare_imuabila` o
       refuză: un document legal nu se șterge, se anulează.

       S-a întâmplat pe 9 septembrie 2026, camera 1001: codul a fost revocat
       de pe yală, baza a refuzat ștergerea, iar oaspetele a rămas cu o ușă
       moartă pentru o ștergere care nu avusese loc. */
    try {
      if (await dateFise.areFisaActiva(editing.id)) {
        /* NU „anuleaza fisa si apoi sterge" — asta scria aici prima data, si
           e fals: triggerul `fise_cazare_imuabila` refuza ORICE stergere de
           fisa, anulata sau nu (verificat, cu tranzactie anulata). Deci o
           rezervare cu fisa nu se sterge niciodata, si nici n-ar trebui —
           fisa e document legal, iar `on delete cascade` ar duce-o cu ea.
           Drumul corect e statusul „Anulată": elibereaza camera, dispare de
           pe calendar, pastreaza evidenta. */
        toaster.show(
          "Rezervarea are fișă de cazare, deci nu poate fi ștearsă — nici după "
          + "ce anulezi fișa. Pune-i statusul pe „Anulată”: eliberează camera "
          + "și dispare de pe calendar, dar rămâne în evidență.",
          { tone: "danger" });
        return;
      }
    } catch (e) {
      /* Dacă verificarea n-a mers, mergem mai departe: baza refuză oricum, iar
         compensarea de mai jos repune codul. */
      console.error("verificare fișă la ștergere", e);
    }

    /* Revocarea ÎNAINTE de ștergere, nu după: odată rândul dispărut,
       funcția edge nu mai are ce căuta, iar `on delete cascade` șterge și
       codul din access_codes. Fără pasul ăsta ar rămâne un cod activ pe
       yală despre care nu mai există nicio urmă nicăieri — cazul cel mai
       urât, fiindcă nimeni n-ar mai ști nici măcar că trebuie căutat. */
    let revocat = false;
    try {
      const rev = await cheamaAcces("revoke", { reservationId: editing.id });
      revocat = rev?.ok === true;
      if (rev && rev.ok === false && rev.reason !== "neconfigurat") {
        toaster.show(
          "Atenție: codul de acces nu a putut fi șters de pe yală. Verifică în TTHOTEL înainte de a șterge rezervarea.",
          { tone: "danger" });
      }
    } catch (e) { console.error("Revocare acces la ștergere", e); }

    const nextRes = reservations.filter((r) => r.id !== editing.id);
    /* Dacă baza a refuzat ștergerea, tot ce urmează ar minți: toastul ar
       spune „a fost ștearsă", jurnalul la fel, iar rezervarea ar reapărea la
       prima reîncărcare. Mesajul de eroare l-a dat deja `raporteazaEroare`.
       Ștergerea e un apel explicit, nu o listă fără rândul ăsta — vezi
       stergeRezervari în pms-app.jsx. */
    if (!await stergeRezervari([editing.id])) {
      /* Compensare: codul a fost revocat pentru o ștergere care n-a avut loc.
         Îl punem la loc — altfel oaspetele rămâne blocat afară. Codul NOU
         diferă de cel trimis, deci recepția trebuie să-l retrimită; toastul
         o spune, fiindcă altfel e o schimbare tăcută pe care o descoperă
         oaspetele, în fața ușii. */
      if (revocat) {
        const reemis = await cheamaAcces("issue", { reservationId: editing.id });
        toaster.show(reemis?.ok
          ? "Ștergerea a eșuat. Codul de acces fusese revocat, așa că am generat altul — retrimite-l oaspetelui."
          : "Ștergerea a eșuat, iar codul de acces rămâne revocat. Generează-l din nou din rezervare.",
          { tone: "danger" });
        await audit.push(reemis?.ok ? "Cod acces repus după ștergere eșuată" : "Cod acces rămas revocat",
          `${core.rooms.find((r) => r.id === editing.roomId)?.name || editing.roomId}`, { roomId: editing.roomId, reservationId: editing.id });
      }
      return;
    }

    // A group with no reservations left would linger as an orphan.
    if (editing.groupId && !nextRes.some((r) => r.groupId === editing.groupId)) {
      const g = (groups || []).find((x) => x.id === editing.groupId);
      await stergeGrupuri([editing.groupId]);
      if (g) await audit.push("Grup închis", `${g.name} · nu mai are rezervări`);
    }

    const who = guestFullName(core.guests.find((g) => g.id === editing.guestId)) || "Fără nume";
    const rn = core.rooms.find((r) => r.id === editing.roomId)?.name;
    await audit.push("Rezervare ștearsă", `${who} · ${rn} · ${fmtDate(editing.checkin)}`, { roomId: editing.roomId });
    const beforeRes = reservations, beforeGroups = groups;
    toaster.show(`Rezervarea ${who} · ${rn} a fost ștearsă`, {
      tone: "danger",
      onUndo: async () => {
        await updateReservations(beforeRes);
        await updateGroups(beforeGroups);
        await audit.push("Ștergere anulată", `${who} · ${rn}`, { roomId: editing.roomId, reservationId: editing.id });
      },
    });
    onClose();
  };

  const remove = async () => {
    if (saving) return;
    setSaving(true);
    try { await removeInner(); } finally { setSaving(false); }
  };

  return (
    <Dialog
      onClose={onClose}
      title={editing ? "Editează rezervarea" : isGroup ? "Rezervare de grup" : isBlock ? "Blocaj cameră" : "Rezervare nouă"}
    >

        {editing && (
          <div className="fisa-rezumat">
            {rezumatFisa({
              nume: guestFullName(selectedGuest) || editing.occupantName, camera: numeCamera(roomId),
              checkin, checkout, total: previewTotal, status,
            })}
          </div>
        )}

        {!editing && (
          <div className="mode-switch">
            <button className={mode === "single" ? "on" : ""} onClick={() => { setMode("single"); setError(""); }}>
              <DoorOpen size={14} /> O cameră
            </button>
            <button className={mode === "group" ? "on" : ""} onClick={() => { setMode("group"); setError(""); }}>
              <UsersRound size={14} /> Grup
            </button>
            <button className={mode === "block" ? "on" : ""} onClick={() => { setMode("block"); setError(""); }}>
              <Wrench size={14} /> Blocaj
            </button>
          </div>
        )}

        {/* Acelasi banner ca in fereastra de vizualizare, dar acolo era link
            si aici nu — desi tocmai de aici, din editare, ai mai des nevoie
            sa treci la grup. Deschide editorul de grup peste formular. */}
        {editingGroup && (
          <button type="button" className="group-banner group-banner-link"
            onClick={() => setGrupModal("edit")}>
            <UsersRound size={15} />
            <span>Face parte din grupul <strong>{editingGroup.name}</strong></span>
          </button>
        )}

        <SectiunePliabila id="fisa-sejur" titlu="Sejur" deschis={sectiuni.sejur} onComuta={() => comuta("sejur")}
          rezumat={rezumatSejur({
            camere: (isGroup || isBlock ? roomIds : [roomId]).map(numeCamera),
            checkin, checkout, status: isBlock ? "" : status,
          })}>
        {isGroup || isBlock ? (
          <>
            {isGroup && <label className="field">
              <span className="fl">Nume grup *</span>
              <input value={groupName} onChange={(e) => { setGroupName(e.target.value); setError(""); }}
                placeholder="ex. Familia Popescu · Nuntă Ionescu" />
            </label>}
            <EroareCamp eroare={eroare} camp="numeGrup" noua={noua} refEroare={refEroare} />

            {isBlock && <label className="field">
              <span className="fl">Motiv</span>
              <input value={blockReason} onChange={(e) => { setBlockReason(e.target.value); setError(""); }}
                placeholder="ex. Zugrăvit · reparație boiler" />
            </label>}
            <div className="field">
              <label>{isBlock ? "Camere blocate" : "Camere"} * ({roomIds.length} selectate)</label>
              <div className="room-picker">
                {["tiny", "loft"].map((t) => {
                  const list = core.rooms.filter((r) => r.type === t);
                  if (!list.length) return null;
                  const freeRooms = list.filter((r) => !busyRooms.has(r.id));
                  const allOn = freeRooms.length > 0 && freeRooms.every((r) => roomIds.includes(r.id));
                  return (
                    <div key={t} className="room-picker-group">
                      <div className="room-picker-head">
                        {ROOM_TYPE[t].label}
                        <button className="link-btn" onClick={() => {
                          const free = freeRooms.map((r) => r.id);
                          setRoomIds((prev) => allOn
                            ? prev.filter((id) => !list.some((r) => r.id === id))
                            : [...new Set([...prev, ...free])]);
                          setError("");
                        }}>{allOn ? "Deselectează" : "Toate libere"}</button>
                      </div>
                      <div className="room-chips">
                        {list.map((r) => {
                          const on = roomIds.includes(r.id);
                          const busy = busyRooms.has(r.id);
                          return (
                            <button
                              key={r.id}
                              className={"room-chip" + (on ? " on" : "") + (busy ? " busy" : "")}
                              title={busy ? "Ocupată sau blocată în acest interval" : ""}
                              onClick={() => {
                                setRoomIds((prev) => on ? prev.filter((id) => id !== r.id) : [...prev, r.id]);
                                setError("");
                              }}
                            >
                              {r.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <label className="field">
            <span className="fl">Cameră</span>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              {core.rooms.map((r) => {
                const busy = busyRooms.has(r.id);
                return (
                  <option key={r.id} value={r.id} disabled={busy && r.id !== editing?.roomId}>
                    {r.name} — {ROOM_TYPE[r.type]?.label || ""}{busy && r.id !== editing?.roomId ? " · ocupată" : ""}
                  </option>
                );
              })}
            </select>
          </label>
        )}

        <EroareCamp eroare={eroare} camp="camere" noua={noua} refEroare={refEroare} />
        <div className="field-row field-row-dates">
          <label className="field">
            <span className="fl">{isBlock ? "De la" : "Check-in"}</span>
            <input type="date" value={checkin.slice(0, 10)} onChange={(e) => setCheckin(withNewDate(checkin, e.target.value))} />
          </label>
          <label className="field">
            <span className="fl">Zile</span>
            <select
              value={Math.min(30, Math.max(1, nightsBetween(checkin, checkout)))}
              onChange={(e) => {
                const n = Number(e.target.value);
                setCheckout(withNewDate(checkout, adaugaZileLaData(checkin.slice(0, 10), n)));
              }}
            >
              {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="fl">{isBlock ? "Până la" : "Check-out"}</span>
            <input type="date" value={checkout.slice(0, 10)} onChange={(e) => setCheckout(withNewDate(checkout, e.target.value))} />
          </label>
        </div>

        <EroareCamp eroare={eroare} camp="date" noua={noua} refEroare={refEroare} />

        {/* Orele stau langa date, in sectiunea Sejur (pana in faza 3, C4,
            stateau deasupra sectiunii de acces, langa butoanele pe care le
            influenteaza; acum sectiunea Acces e la un clic distanta, iar
            data si ora tin impreuna). Nu apar la blocaje: un blocaj de
            mentenanta n-are cod de acces, deci ora lui nu deschide nicio usa. */}
        {!isBlock && (
          <div className="field mb-4">
            <button type="button" className="btn btn-ghost btn-lat"
              onClick={() => setOreModal(true)}>
              <Clock size={14} /> Orele cazării · {checkin.slice(11, 16)} → {checkout.slice(11, 16)}
            </button>
            {editing && (oraDin(checkin) !== ORA_SOSIRE_IMPLICITA || oraDin(checkout) !== ORA_PLECARE_IMPLICITA) && (
              <div className="text-secundar mt-6">
                Ore diferite de cele obișnuite ({ORA_SOSIRE_IMPLICITA}:00 → {ORA_PLECARE_IMPLICITA}:00).
                Codul de acces urmează orele de aici.
              </div>
            )}
          </div>
        )}

        {!isBlock && (
          <label className="field">
            <span className="fl">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOptions.map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
            </select>
          </label>
        )}

        <EroareCamp eroare={eroare} camp="status" noua={noua} refEroare={refEroare} />
        {!isBlock && (
          <label className="field">
            <span className="fl">Sursa rezervării</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((sc) => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
            </select>
          </label>
        )}

        </SectiunePliabila>

        {!isBlock && <SectiunePliabila id="fisa-oaspete" titlu="Oaspete" deschis={sectiuni.oaspete} onComuta={() => comuta("oaspete")}
          rezumat={rezumatOaspete({
            nume: guestFullName(selectedGuest),
            ocupant: [occupantLastName, occupantFirstName].filter(Boolean).join(" "),
            adults, children, grup: isGroup,
          })}>
        <div className="field">
          <label>{isGroup ? "Client principal *" : "Client *"}</label>
          {selectedGuest ? (
            <div className="guest-chip">
              <div className="guest-chip-av">{initials(guestFullName(selectedGuest))}</div>
              <div className="guest-chip-body">
                <div className="gname">{guestFullName(selectedGuest)}</div>
                <div className="gmeta">{[selectedGuest.phone, selectedGuest.city].filter(Boolean).join(" · ") || "Fără date de contact"}</div>
              </div>
              <ContactQuickActions guest={selectedGuest} />
              <button className="icon-btn" onClick={() => { setGuestId(""); setGuestQuery(""); }} aria-label="Schimbă clientul">
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="guest-search">
              <div className="search-box fisar-guest-search">
                <Search size={15} color="var(--text-muted)" />
                <input
                  value={guestQuery}
                  onChange={(e) => { setGuestQuery(e.target.value); setError(""); }}
                  placeholder="Caută după nume, telefon sau oraș"
                />
              </div>
              <EroareCamp eroare={eroare} camp="client" noua={noua} refEroare={refEroare} />
              {guestQuery.trim() && (
                matchingGuests.length > 0 ? (
                  <div className="guest-results" ref={refRezultateClient}>
                    {matchingGuests.slice(0, 6).map((g) => (
                      <button key={g.id} className="guest-result" onClick={() => { setGuestId(g.id); setGuestQuery(""); }}>
                        <div className="guest-chip-av">{initials(guestFullName(g))}</div>
                        <div>
                          <div className="gname">{guestFullName(g)}</div>
                          <div className="gmeta">{[g.phone, g.city].filter(Boolean).join(" · ")}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : cautareServerInCurs ? (
                  <div className="guest-none" ref={refRezultateClient}>
                    <div>Caut în baza de date…</div>
                  </div>
                ) : (
                  <div className="guest-none" ref={refRezultateClient}>
                    <div>Niciun client cu „{guestQuery.trim()}”.</div>
                    {cautareServerEsuata && (
                      <div className="note mt-6">
                        Căutarea în baza de date a eșuat — se văd doar clienții deja încărcați.
                      </div>
                    )}
                    <button className="btn btn-primary btn-lat mt-10" onClick={startAddGuest}>
                      <Plus size={15} /> Adaugă client nou
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Ocupantul, sub client: cine doarme efectiv in camera, cand nu e
            acelasi cu cel care a rezervat. Telefonul lui decide unde pleaca
            codul de acces pe WhatsApp (vezi destinatarWhatsapp).
            Nu apare la CREAREA unui grup: acolo ocupantii sunt per camera si
            se completeaza dupa creare, din Grupuri → editeaza grupul (vezi
            nota de mai jos). La editarea unei rezervari din grup, `isGroup` e
            fals, deci campul apare — exact unde e nevoie de el. */}
        {!isBlock && !isGroup && (
          <div className="field">
            <label>Ocupant</label>
            <div className="field-row field-row-3col">
              <input
                value={occupantLastName} placeholder="Nume"
                aria-label="Numele ocupantului"
                onChange={(e) => setOccupantLastName(e.target.value)}
              />
              <input
                value={occupantFirstName} placeholder="Prenume"
                aria-label="Prenumele ocupantului"
                onChange={(e) => setOccupantFirstName(e.target.value)}
              />
              <input
                value={occupantPhone} placeholder="Telefon" type="tel" inputMode="tel"
                aria-label="Telefonul ocupantului"
                onChange={(e) => setOccupantPhone(e.target.value)}
              />
            </div>
            <div className="text-secundar mt-6">
              Completează doar dacă în cameră stă altcineva decât clientul.
              Codul de acces pleacă pe WhatsApp la acest număr.
            </div>
          </div>
        )}

        {!isBlock && (
          <div className="field-row field-row-2col">
            <div className="field">
              <span className="fl">Adulți{isGroup ? " (per cameră)" : ""}</span>
              <OccupantStepper label="Adulți" value={adults} otherValue={children} capacity={maxOccupancy} min={1} onChange={setAdults} />
            </div>
            <div className="field">
              <span className="fl">Copii{isGroup ? " (per cameră)" : ""}</span>
              <OccupantStepper label="Copii" value={children} otherValue={adults} capacity={maxOccupancy} min={0} onChange={setChildren} />
            </div>
          </div>
        )}
        <EroareCamp eroare={eroare} camp="ocupare" noua={noua} refEroare={refEroare} />
        {!isBlock && (
          <div className="note mt-neg6">
            Maxim {maxOccupancy} {maxOccupancy === 1 ? "persoană" : "persoane"} pentru {isGroup ? "camerele selectate" : "camera selectată"}.
          </div>
        )}
        {isGroup && (
          <div className="note">
            Numărul de adulți/copii, etichetele și notele de mai jos se aplică identic pe fiecare
            cameră a grupului. Ocupanții și prețul pot fi ajustați individual după creare, din Grupuri → editează grupul.
          </div>
        )}
        </SectiunePliabila>}

        {grupModal === "edit" && editingGroup && (
          <GroupEditor
            group={editingGroup} core={core} updateCore={updateCore}
            groups={groups} updateGroups={updateGroups}
            reservations={reservations} updateReservations={updateReservations} blocks={blocks}
            stergeRezervari={stergeRezervari} stergeGrupuri={stergeGrupuri}
            onClose={() => setGrupModal(null)}
            onPrint={() => setGrupModal("print")}
          />
        )}

        {grupModal === "print" && editingGroup && (
          <GroupPrint
            group={editingGroup} core={core} reservations={reservations}
            onClose={() => setGrupModal(null)}
          />
        )}

        {!isBlock && <SectiunePliabila id="fisa-pret" titlu="Preț" deschis={sectiuni.pret} onComuta={() => comuta("pret")}
          rezumat={rezumatPret({ total: previewTotal, manual: priceOverride !== "" && priceOverride !== null })}>
        <div className="price-box">
          <div className="pb-info">
            <div className="price-label">
              {nightsBetween(checkin, checkout)} nopți{isGroup && roomIds.length ? ` × ${roomIds.length} camere` : ""}
            </div>
            <div className="price-value">{fmtMoney(previewTotal)}</div>
          </div>
          <div className="pb-manual">
            <label htmlFor="manual-price">Preț manual{isGroup ? " (total grup)" : ""}</label>
            <input id="manual-price" type="number" min="0" step="1" placeholder="auto" value={priceOverride}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || (Number(v) >= 0 && Number.isFinite(Number(v)))) { setPriceOverride(v); setError(""); }
              }} />
          </div>
        </div>

        <EroareCamp eroare={eroare} camp="pret" noua={noua} refEroare={refEroare} />
        {!isBlock && editing && (
          <FolioPanel reservation={editing} core={core} updateCore={updateCore}
            billingCustomerId={billingCustomerId} setBillingCustomerId={setBillingCustomerId}
            onNewBillingCustomer={() => setBillingModalOpen(true)} />
        )}

        </SectiunePliabila>}

        <SectiunePliabila id="fisa-note" titlu="Note" deschis={sectiuni.note} onComuta={() => comuta("note")}
          rezumat={rezumatNote({ tags, notes, mesaje: editing?.messages?.length || 0 })}>
        {!isBlock && (
          <div className="field">
            <label>Etichete</label>
            <div className="tag-picker">
              {(core.tags || DEFAULT_TAGS).map((t) => (
                <button key={t}
                  className={"tag-chip" + (tags.includes(t) ? " on" : "")}
                  onClick={() => setTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                >{t}</button>
              ))}
              {newTagOpen ? (
                <span className="tag-new">
                  <input
                    autoFocus
                    value={newTag}
                    placeholder="Etichetă nouă"
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitNewTag(); }
                      if (e.key === "Escape") { e.preventDefault(); setNewTagOpen(false); setNewTag(""); }
                    }}
                  />
                  <button className="icon-btn" onClick={commitNewTag} aria-label="Adaugă eticheta">
                    <Check size={14} />
                  </button>
                </span>
              ) : (
                <button className="tag-chip tag-add" onClick={() => setNewTagOpen(true)}>
                  <Plus size={13} /> Etichetă
                </button>
              )}
            </div>
          </div>
        )}

        <label className="field">
          <span className="fl">Note</span>
          <textarea rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observații interne" />
        </label>

        {editing?.messages?.length > 0 && (
          <div className="field">
            <label>Mesaje ({editing.messages.length})</label>
            <div className="msg-list mt-0">
              {[...editing.messages].reverse().map((m) => (
                <div className="msg-item" key={m.id}>
                  <div className="msg-text">{m.text}</div>
                  <div className="msg-meta">{m.author} · {fmtDateTime(m.ts)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        </SectiunePliabila>

        {oreModal && (
          <OreCazareModal
            checkin={checkin} checkout={checkout}
            onClose={() => setOreModal(false)}
            onSave={(ci, co) => {
              setCheckin(ci); setCheckout(co); setOreModal(false);
              /* Doar la o rezervare existenta: la creare, "Salveaza orele"
                 tot n-are ce sa trimita inca (nu exista client/camera
                 confirmate), formularul intreg se trimite abia la
                 "Salveaza" de jos, ca pana acum. */
              if (editing) salveazaOreleRef.current = true;
            }}
          />
        )}

        {editing && !isBlock && (
          <SectiunePliabila id="fisa-acces" titlu="Acces și fișă de cazare" deschis={sectiuni.acces} onComuta={() => comuta("acces")}
            rezumat={rezumatAcces({ checkin, checkout })}>
            <SectiuneAcces res={editing} core={core} />
            <SectiuneFisa res={editing} core={core} />
          </SectiunePliabila>
        )}

        {error && (!noua || !eroare?.camp) && <div className="error-text mb-10" role="alert">{error}</div>}

        {editing && (
          <div className="quick-actions">
            <button className="btn btn-ghost" onClick={() => setShowArrival(true)}>
              <Printer size={14} /> Fișa de sosire
            </button>
            {/* Aceeasi regula canCheckIn ca in panoul din calendar: cu pana
                la ZILE_CHECKIN_DEVREME zile inainte de sosire.
                Butonul SALVEAZA pe loc, nu doar schimba dropdownul de status:
                inainte apela setStatus si atat, iar dropdownul fiind derulat
                sus, in afara ecranului, parea ca apasarea nu face nimic. */}
            {canCheckIn(editing) && (
              <button className="btn btn-ghost" disabled={saving}
                onClick={() => { setStatus("checkedin"); save("checkedin"); }}>
                <LogIn size={14} /> Marchează check-in
              </button>
            )}
            {STATUSURI_CAZABILE.includes(editing.status) && !canCheckIn(editing) && (
              <span className="quick-hint">
                {new Date(editing.checkin) > new Date()
                  ? `Check-in disponibil cu ${ZILE_CHECKIN_DEVREME} zile înainte de sosire (${fmtDate(editing.checkin)})`
                  : "Sosirea era într-o zi trecută — corectează data de check-in."}
              </span>
            )}
            {canCheckOut(editing) && (
              <button className="btn btn-ghost" disabled={saving}
                onClick={() => { setStatus("checkedout"); save("checkedout"); }}>
                Marchează check-out <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}

        <div className="modal-actions">
          {editing && (
            <button className="btn btn-danger" onClick={remove} disabled={saving}>
              <Trash2 size={14} /> Șterge
            </button>
          )}
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Anulează</button>
          {/* `() => save()`, nu `save`: altfel React ar trimite evenimentul de
              click drept prim argument, adica drept status. */}
          <button className="btn btn-primary btn-lat" onClick={() => save()} disabled={saving}>
            <Check size={15} /> {saving ? "Se salvează..." : "Salvează"}
          </button>
        </div>

      {showArrival && editing && (
        <div onClick={(e) => e.stopPropagation()}>
          <ArrivalForm res={editing} core={core} groups={groups} onClose={() => setShowArrival(false)} />
        </div>
      )}

      {guestFormSeed && (
        <div onClick={(e) => e.stopPropagation()}>
          <GuestModal
            guest={guestFormSeed}
            onSave={saveNewGuest}
            onClose={() => setGuestFormSeed(null)}
          />
        </div>
      )}

      {billingModalOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <BillingCustomerModal
            seedFromGuest={selectedGuest}
            existingCustomers={core.billingCustomers || []}
            onSave={saveNewBillingCustomer}
            onClose={() => setBillingModalOpen(false)}
          />
        </div>
      )}
    </Dialog>
  );
}
