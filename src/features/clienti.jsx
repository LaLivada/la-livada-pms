/* CLIENTI — oaspeti, firme, istoricul lor de sejururi.
 *
 * Include si selectorul de prefix telefonic: PHONE_DIAL tine indicativele,
 * iar splitPhone/joinPhone desfac si refac numarul in jurul lor. Regula
 * gasita in productie (un 0 tastat dupa ce prefixul era deja ales) traieste
 * in lib/validation.js, testata — aici e doar interfata din jurul ei.
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Plus, X, Search, Check, Trash2, Pencil, History, Users, UsersRound, Phone, MessageCircle, Banknote, UserCheck, ArrowRight, ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { supabase } from "../supabase.js";
import { uid } from "../lib/uid.js";
import { mesajEroare } from "../lib/errors.js";
import * as dateFacturare from "../data/facturare.js";
import { audit, isAdmin } from "../lib/audit.js";
import { guestFullName, occupantName } from "../lib/nume.js";
import { nightsBetween, isLive, isStatsEligible } from "../lib/availability.js";
import { reservationTotal } from "../lib/pricing.js";
import { validatePhone, validateEmail } from "../lib/validation.js";
import { fmtMoney, fmtDate, fmtDateFull, initials } from "../lib/format.js";
import { JUDETE, TARI, PHONE_DIAL, DIAL_LIST, STATUS_LABEL, ROOM_TYPE, GUEST_HISTORY_PAGE_SIZE, INVOICE_STATUS_LABEL, INVOICE_STATUS_CLASS, sourceLabel } from "../lib/constante.js";
import { Dialog, toaster, usePaginare, Paginare, useModalLock, Stat } from "../ui/primitive.jsx";
import { GroupsView } from "./grupuri.jsx";
import { billingCustomerLabel, BillingCustomerModal } from "./facturare.jsx";

export function ClientsView({ core, updateCore, groups, updateGroups, reservations, updateReservations, blocks, onNewGroup }) {
  const [historyGuest, setHistoryGuest] = useState(null);
  const [tab, setTab] = useState("guests");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null); // { guest | null }
  /* Butonul "Firmă nouă" sta in antetul comun al tab-urilor, dar
     formularul apartine listei de firme — starea trece de aici acolo. */
  const [firmModal, setFirmModal] = useState(null);

  const filtered = core.guests.filter((g) => {
    const t = q.toLowerCase();
    return guestFullName(g).toLowerCase().includes(t) ||
      (g.phone || "").includes(q) ||
      (g.city || "").toLowerCase().includes(t);
  });

  const save = async (guest) => {
    const exists = core.guests.some((g) => g.id === guest.id);
    const next = exists ? core.guests.map((g) => (g.id === guest.id ? guest : g)) : [...core.guests, guest];
    await updateCore({ ...core, guests: next });
    await audit.push(exists ? "Client modificat" : "Client adăugat", guestFullName(guest));
    setModal(null);
  };
  const remove = async (id) => {
    const g = core.guests.find((x) => x.id === id);
    const hasReservations = reservations.some((r) => r.guestId === id);
    const isGroupMain = groups.some((gr) => gr.mainGuestId === id);
    if (hasReservations || isGroupMain) {
      toaster.show(
        `${guestFullName(g)} are rezervări asociate și nu poate fi șters. Anulează sau șterge întâi rezervările.`,
        { tone: "danger" }
      );
      return;
    }
    const before = core.guests;
    await updateCore({ ...core, guests: core.guests.filter((x) => x.id !== id) });
    await audit.push("Client șters", guestFullName(g));
    toaster.show(`${guestFullName(g)} a fost șters`, {
      tone: "danger",
      onUndo: async () => {
        await updateCore({ ...core, guests: before });
        await audit.push("Ștergere anulată", guestFullName(g));
      },
    });
  };

  const paginare = usePaginare(filtered);
  const firmCount = (core.billingCustomers || []).filter((c) => c.kind === "company").length;

  const header = (
    <div className="tabs-bar">
      <SubTabs tab={tab} setTab={setTab} groupCount={groups.length}
        guestCount={core.guests.length} firmCount={firmCount} />
      <div className="tabs-actions">
        {tab === "groups" ? (
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={onNewGroup}>
            <UsersRound size={15} /> Grup nou
          </button>
        ) : tab === "firms" ? (
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setFirmModal({ customer: null })}>
            <Plus size={15} /> Firmă nouă
          </button>
        ) : (
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={() => setModal({ guest: null })}>
            <Plus size={15} /> Client nou
          </button>
        )}
      </div>
    </div>
  );

  if (tab === "groups") {
    return (
      <div>
        {header}
        <GroupsView core={core} groups={groups} updateGroups={updateGroups}
          reservations={reservations} updateReservations={updateReservations} blocks={blocks} />
      </div>
    );
  }

  if (tab === "firms") {
    return (
      <div>
        {header}
        <FirmsView core={core} updateCore={updateCore} reservations={reservations}
          modalExtern={firmModal} inchideModalExtern={() => setFirmModal(null)} />
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="toolbar">
        <div className="search-box">
          <Search size={15} color="var(--text-muted)" />
          <input placeholder="Caută după nume sau telefon" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="badge-count">{filtered.length} clienți</span>
      </div>

      <div className="panel">
        {filtered.length === 0 ? (
          <div className="empty-state"><Users size={26} /><h4>Niciun client</h4><p>Adaugă primul client.</p></div>
        ) : paginare.feliate.map((g) => (
          <div className="list-row" key={g.id}>
            <div
              role="button" tabIndex={0} style={{ cursor: "pointer" }}
              onClick={() => setHistoryGuest(g)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setHistoryGuest(g); } }}
            >
              <div className="primary">{guestFullName(g)}</div>
              <div className="secondary">
                {[g.phone, g.email, [g.city, g.county].filter(Boolean).join(", "), g.country !== "România" ? g.country : null]
                  .filter(Boolean).join(" · ")}
              </div>
              {(() => {
                const stays = reservations.filter((r) => r.guestId === g.id && isLive(r));
                if (!stays.length) return null;
                const nights = stays.reduce((n, r) => n + nightsBetween(r.checkin, r.checkout), 0);
                // Protocol nu se incaseaza — nu intra in suma "incasati".
                const spent = stays.filter(isStatsEligible).reduce((v, r) => v + reservationTotal(r, core), 0);
                return <div className="secondary" style={{ marginTop: 3 }}>
                  <strong>{stays.length}</strong> sejururi · {nights} nopți · {fmtMoney(spent)} încasați
                </div>;
              })()}
            </div>
            <div className="row-actions">
              <button className="icon-btn" title="Istoric sejururi" aria-label={`Istoric sejururi ${guestFullName(g)}`} onClick={() => setHistoryGuest(g)}>
                <History size={14} />
              </button>
              <button className="icon-btn" onClick={() => setModal({ guest: g })} aria-label={`Editează ${guestFullName(g)}`}><Pencil size={14} /></button>
              {/* Doar adminul poate șterge — recepția editează și adaugă,
                  nu curăță fișe. Oglindește politica RLS "sterge oaspeti";
                  butonul ascuns evită un eșec confuz în loc de unul clar. */}
              {isAdmin() && (
                <button className="icon-btn" onClick={() => remove(g.id)} aria-label={`Șterge ${guestFullName(g)}`}><Trash2 size={14} /></button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Paginare stare={paginare} eticheta="clienți" />

      {modal && <GuestModal guest={modal.guest} onSave={save} onClose={() => setModal(null)} />}
      {historyGuest && (
        <GuestHistory guest={historyGuest} core={core} reservations={reservations} onClose={() => setHistoryGuest(null)} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   FIRME — clientii de facturare de tip companie.
   Traiesc in `billing_customers`, acelasi tabel cu persoanele fizice
   catre care se factureaza; aici se vad doar cele cu kind='company'.
   Se creau pana acum doar din interiorul unei rezervari, deci nu exista
   niciun loc unde sa fie vazute toate la un loc, editate sau sterse.
----------------------------------------------------------------*/

export function FirmsView({ core, updateCore, reservations, modalExtern, inchideModalExtern }) {
  const [q, setQ] = useState("");
  const [modalIntern, setModalIntern] = useState(null); // { customer } | null
  const [istoric, setIstoric] = useState(null);         // firma pentru care aratam istoricul

  /* Formularul se poate deschide din doua locuri: butonul "Firmă nouă"
     din antetul tab-urilor (care traieste in ClientsView) si creionul de
     pe fiecare rand. */
  const modal = modalIntern || modalExtern;
  const setModal = (v) => { setModalIntern(v); if (!v) inchideModalExtern?.(); };

  const firme = (core.billingCustomers || []).filter((c) => c.kind === "company");
  const filtrate = firme.filter((c) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return [c.companyName, c.cui, c.regCom, c.city, c.contactName, c.email, c.phone]
      .filter(Boolean).join(" ").toLowerCase().includes(t);
  });

  const paginare = usePaginare(filtrate);

  const save = async (customer) => {
    const exista = (core.billingCustomers || []).some((c) => c.id === customer.id);
    const next = exista
      ? core.billingCustomers.map((c) => (c.id === customer.id ? customer : c))
      : [...(core.billingCustomers || []), customer];
    await updateCore({ ...core, billingCustomers: next });
    await audit.push(exista ? "Firmă modificată" : "Firmă adăugată", billingCustomerLabel(customer));
    setModal(null);
  };

  /* Stergerea e blocata daca firma e folosita undeva. Baza refuza oricum
     (invoices.billing_customer_id are on delete restrict), dar un mesaj
     clar e mai util decat o eroare de constrangere. */
  const remove = async (firma) => {
    const areRezervari = reservations.some((r) => r.billingCustomerId === firma.id);
    if (areRezervari) {
      toaster.show(
        `${billingCustomerLabel(firma)} e folosită pe rezervări și nu poate fi ștearsă. Schimbă întâi clientul de facturare pe acele rezervări.`,
        { tone: "danger" });
      return;
    }
    const { count, error } = await supabase
      .from("invoices").select("id", { count: "exact", head: true }).eq("billing_customer_id", firma.id);
    if (error) { toaster.show(mesajEroare(error, "Nu am putut verifica facturile firmei"), { tone: "danger" }); return; }
    if (count > 0) {
      toaster.show(
        `${billingCustomerLabel(firma)} are ${count} ${count === 1 ? "factură emisă" : "facturi emise"} și nu poate fi ștearsă — facturile trebuie păstrate.`,
        { tone: "danger" });
      return;
    }

    const before = core.billingCustomers;
    await updateCore({ ...core, billingCustomers: firme.length
      ? core.billingCustomers.filter((c) => c.id !== firma.id) : [] });
    await audit.push("Firmă ștearsă", billingCustomerLabel(firma));
    toaster.show(`${billingCustomerLabel(firma)} a fost ștearsă`, {
      tone: "danger",
      onUndo: async () => {
        await updateCore({ ...core, billingCustomers: before });
        await audit.push("Ștergere anulată", billingCustomerLabel(firma));
      },
    });
  };

  return (
    <div>
      <div className="toolbar">
        <div className="search-box">
          <Search size={15} color="var(--text-muted)" />
          <input placeholder="Caută după denumire, CUI sau oraș" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Caută firme" />
        </div>
        <span className="badge-count">{filtrate.length} {filtrate.length === 1 ? "firmă" : "firme"}</span>
      </div>

      <div className="panel">
        {filtrate.length === 0 ? (
          <div className="empty-state">
            <Receipt size={26} />
            <h4>{firme.length ? "Nicio firmă găsită" : "Nicio firmă"}</h4>
            <p>{firme.length
              ? "Încearcă alt termen de căutare."
              : "Firmele se adaugă de aici sau direct dintr-o rezervare, la „Facturare către”."}</p>
          </div>
        ) : paginare.feliate.map((c) => {
          const rezervari = reservations.filter((r) => r.billingCustomerId === c.id);
          return (
            <div className="list-row" key={c.id}>
              <div
                role="button" tabIndex={0} style={{ cursor: "pointer", minWidth: 0 }}
                onClick={() => setIstoric(c)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIstoric(c); } }}
              >
                <div className="primary">{c.companyName}</div>
                <div className="secondary">
                  {[c.cui ? `CUI ${c.cui}` : null, c.regCom, [c.city, c.county].filter(Boolean).join(", ")]
                    .filter(Boolean).join(" · ")}
                </div>
                {/* Persoana de contact si datele ei nu se mai afiseaza in
                    lista — se vad la editare si in istoric. Randul din
                    lista ramane pe ce identifica firma: denumire, CUI,
                    oras. */}
                {rezervari.length > 0 && (
                  <div className="secondary" style={{ marginTop: 3 }}>
                    <strong>{rezervari.length}</strong> {rezervari.length === 1 ? "rezervare" : "rezervări"} facturate către firmă
                  </div>
                )}
              </div>
              <div className="row-actions">
                <button className="icon-btn" title="Istoric" aria-label={`Istoric ${billingCustomerLabel(c)}`}
                  onClick={() => setIstoric(c)}><History size={14} /></button>
                <button className="icon-btn" aria-label={`Editează ${billingCustomerLabel(c)}`}
                  onClick={() => setModal({ customer: c })}><Pencil size={14} /></button>
                {/* Doar adminul poate șterge — vezi nota de la ștergerea
                    clienților mai sus. */}
                {isAdmin() && (
                  <button className="icon-btn" aria-label={`Șterge ${billingCustomerLabel(c)}`}
                    onClick={() => remove(c)}><Trash2 size={14} /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Paginare stare={paginare} eticheta={paginare.totalItems === 1 ? "firmă" : "firme"} />

      {modal && (
        <BillingCustomerModal
          customer={modal.customer}
          existingCustomers={core.billingCustomers || []}
          onSave={save}
          onClose={() => setModal(null)}
        />
      )}
      {istoric && (
        <FirmHistory firma={istoric} core={core} reservations={reservations} onClose={() => setIstoric(null)} />
      )}
    </div>
  );
}

/* Istoricul unei firme: rezervarile facturate catre ea si facturile
   emise pe numele ei. Facturile se citesc la deschidere — nu sunt in
   `core`, care tine doar ce e nevoie la pornirea aplicatiei. */

export function FirmHistory({ firma, core, reservations, onClose }) {
  useModalLock();
  const [facturi, setFacturi] = useState(null);
  const [eroare, setEroare] = useState("");

  useEffect(() => {
    let activ = true;
    (async () => {
      try {
        const data = await dateFacturare.facturiAleClientului(firma.id);
        if (!activ) return;
        setFacturi(data);
      } catch (e) {
        if (!activ) return;
        setEroare(mesajEroare(e, "Nu am putut încărca facturile"));
      }
    })();
    return () => { activ = false; };
  }, [firma.id]);

  const rezervari = reservations
    .filter((r) => r.billingCustomerId === firma.id)
    .sort((a, b) => new Date(b.checkin) - new Date(a.checkin));

  const totalFacturat = (facturi || []).reduce((s, f) => s + Number(f.total_amount), 0);
  const totalIncasat = (facturi || []).reduce((s, f) => s + Number(f.paid_amount), 0);

  return (
    <Dialog onClose={onClose} title={firma.companyName}>
      <div className="note" style={{ marginBottom: 14 }}>
        {[firma.cui ? `CUI ${firma.cui}` : null, firma.regCom,
          [firma.address, firma.city, firma.county, firma.country].filter(Boolean).join(", ")]
          .filter(Boolean).join(" · ")}
      </div>

      {facturi !== null && facturi.length > 0 && (
        <div className="stat-row" style={{ marginBottom: 14 }}>
          <Stat label="Facturi" value={facturi.length} />
          <Stat label="Total facturat" value={fmtMoney(totalFacturat)} />
          <Stat label="Încasat" value={fmtMoney(totalIncasat)} />
        </div>
      )}

      <label className="field"><span className="fl">Rezervări facturate către firmă</span></label>
      {rezervari.length === 0 ? (
        <div className="note">Nicio rezervare facturată către această firmă.</div>
      ) : (
        <div className="panel" style={{ marginBottom: 16 }}>
          {rezervari.map((r) => {
            const camera = core.rooms.find((x) => x.id === r.roomId);
            return (
              <div className="list-row" key={r.id}>
                <div style={{ minWidth: 0 }}>
                  <div className="primary">{occupantName(r, core, []) || guestFullName(core.guests.find((g) => g.id === r.guestId)) || "Fără nume"}</div>
                  <div className="secondary">
                    <span className="mono">{camera?.name || r.roomId}</span> · {fmtDate(r.checkin)} → {fmtDate(r.checkout)}
                  </div>
                </div>
                <span className="mono" style={{ fontWeight: 650 }}>{fmtMoney(reservationTotal(r, core))}</span>
              </div>
            );
          })}
        </div>
      )}

      <label className="field"><span className="fl">Facturi emise</span></label>
      {eroare ? (
        <div className="note" style={{ color: "var(--danger)" }}>{eroare}</div>
      ) : facturi === null ? (
        <div className="note">Se încarcă…</div>
      ) : facturi.length === 0 ? (
        <div className="note">Nicio factură emisă pe această firmă.</div>
      ) : (
        <div className="panel">
          {facturi.map((f) => (
            <div className="list-row" key={f.id}>
              <div style={{ minWidth: 0 }}>
                <div className="primary">
                  {f.series ? `${f.series} ${f.number}` : "Draft"}
                  <span className={"role-tag " + INVOICE_STATUS_CLASS[f.status]} style={{ marginLeft: 8 }}>
                    {INVOICE_STATUS_LABEL[f.status]}
                  </span>
                </div>
                <div className="secondary">{f.issue_date ? fmtDateFull(f.issue_date) : "neemisă"}</div>
              </div>
              <span className="mono" style={{ fontWeight: 650 }}>{fmtMoney(f.total_amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="modal-actions">
        <div className="grow" />
        <button className="btn btn-ghost" onClick={onClose}>Închide</button>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   GUEST FORM — shared by ClientsView and ReservationModal
----------------------------------------------------------------*/

export function splitPhone(phone) {
  const s = String(phone || "").trim();
  if (s.startsWith("+")) {
    const match = DIAL_LIST
      .filter((d) => s.startsWith(d.dial))
      .sort((a, b) => b.dial.length - a.dial.length)[0];
    if (match) return { dial: match.dial, local: s.slice(match.dial.length).trim() };
  }
  return { dial: "+40", local: s.replace(/^0/, "") };
}

export function joinPhone(dial, local) {
  const l = String(local || "").trim();
  return l ? `${dial} ${l}` : "";
}

export function PhoneDialPicker({ dial, onSelect }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const t = q.trim().toLowerCase();
  const filtered = t
    ? DIAL_LIST.filter((d) => d.country.toLowerCase().includes(t) || d.dial.includes(t))
    : DIAL_LIST;

  return (
    <div className="phone-dial-wrap" ref={ref}>
      <button type="button" className="phone-dial-btn" onClick={() => setOpen((v) => !v)}>
        <span className="mono">{dial}</span>
      </button>
      {open && (
        <div className="phone-dial-pop">
          <input
            autoFocus placeholder="Caută țara" value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="phone-dial-list">
            {filtered.length === 0 && <div className="phone-dial-empty">Nicio țară găsită.</div>}
            {filtered.map((d) => (
              <button
                type="button" key={d.country}
                className={"phone-dial-item" + (d.dial === dial ? " on" : "")}
                onClick={() => { onSelect(d.dial); setOpen(false); setQ(""); }}
              >
                <span>{d.country}</span>
                <span className="mono">{d.dial}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export const emptyGuest = () => ({
  lastName: "", firstName: "", phone: "", email: "",
  address: "", city: "", county: "Cluj", country: "România", notes: "", salutation: "",
});

/* Group rooms can each carry their own occupant, while the group's
   main client stays the billing contact. */

export function telHref(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

/* Mesaj WhatsApp predefinit, personalizat cu titlul (Dl/Dna) ales pe fisa
   clientului. Fara titlu salvat, mesajul sare peste formula de adresare
   ca sa nu sune ciudat ("Buna ziua Popescu Andrei" fara Domnule/Doamna). */

export function whatsappHref(guest) {
  const digits = String(guest?.phone || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  const formula = guest?.salutation === "Dl" ? "domnule "
    : guest?.salutation === "Dna" ? "doamnă " : "";
  const name = guestFullName(guest);
  const text = `Bună ziua ${formula}${name}, vă contactez de la recepția Complexului La Livada, `;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/* Perechea de iconite telefon/WhatsApp, refolosita in lista de clienti si
   in fereastra de rezervare. `onClick` optional opreste propagarea cand
   butoanele stau intr-un rand care are propriul click handler (ex. randul
   de client care deschide istoricul la click). */

export function ContactQuickActions({ guest, onClick }) {
  const tel = telHref(guest?.phone);
  const wa = whatsappHref(guest);
  if (!tel && !wa) return null;
  return (
    <span className="contact-quick" onClick={onClick}>
      {tel && (
        <a className="icon-btn tel" href={tel} title="Sună clientul" aria-label={`Sună ${guestFullName(guest)}`}>
          <Phone size={17} />
        </a>
      )}
      {wa && (
        <a className="icon-btn wa" href={wa} target="_blank" rel="noreferrer"
          title="Mesaj WhatsApp" aria-label={`Mesaj WhatsApp către ${guestFullName(guest)}`}>
          <MessageCircle size={17} />
        </a>
      )}
    </span>
  );
}

export const GuestFields = React.memo(function GuestFields({ value, onChange, invalid }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const err = (k) => (invalid?.has(k) ? " input-error" : "");
  const { dial, local } = splitPhone(value.phone);
  const phoneCheck = validatePhone(local, dial);
  const emailCheck = validateEmail(value.email);
  return (
    <>
      <div className="field-row field-row-2col">
        <label className="field">
          <select value={value.salutation} onChange={set("salutation")}>
            <option value="">Dl / Dnă</option>
            <option value="Dl">Domnul</option>
            <option value="Dna">Doamna</option>
          </select>
        </label>
        <div />
      </div>
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Nume *</span><input className={err("lastName")} value={value.lastName} onChange={set("lastName")} placeholder="Popescu" /></label>
        <label className="field"><span className="fl">Prenume *</span><input className={err("firstName")} value={value.firstName} onChange={set("firstName")} placeholder="Andrei" /></label>
      </div>
      <div className="field-row field-row-2col">
        <label className="field">
          <span className="fl">Telefon *</span>
          <div className="phone-input-row">
            <PhoneDialPicker dial={dial} onSelect={(d) => onChange({ ...value, phone: joinPhone(d, local) })} />
            <input className={err("phone") + (local && !phoneCheck.ok ? " input-error" : "")} value={local}
              onChange={(e) => onChange({ ...value, phone: joinPhone(dial, e.target.value) })}
              placeholder="722 111 222" />
          </div>
        </label>
        <label className="field">
          <span className="fl">Email</span>
          <input type="email" className={value.email && !emailCheck.ok ? "input-error" : ""}
            value={value.email} onChange={set("email")} placeholder="nume@exemplu.ro" />
        </label>
      </div>
      {local && !phoneCheck.ok && (
        <div className="note" style={{ marginTop: -6, marginBottom: 14 }}>{phoneCheck.message}</div>
      )}
      {value.email && !emailCheck.ok && (
        <div className="note" style={{ marginTop: -6, marginBottom: 14 }}>{emailCheck.message}</div>
      )}
      <div className="field-row field-row-2col">
        <label className="field"><span className="fl">Adresă</span><input value={value.address} onChange={set("address")} placeholder="Str. Exemplu nr. 10" /></label>
        <label className="field"><span className="fl">Oraș *</span><input className={err("city")} value={value.city} onChange={set("city")} /></label>
      </div>
      <div className="field-row field-row-2col">
        <div className="field">
          <label>Județ *</label>
          {value.country === "România" ? (
            <select className={err("county")} value={value.county} onChange={set("county")}>
              {JUDETE.map((j) => <option key={j} value={j}>{j}</option>)}
            </select>
          ) : (
            <input className={err("county")} value={value.county} onChange={set("county")} placeholder="Regiune" />
          )}
        </div>
        <label className="field">
          <span className="fl">Țară *</span>
          <select className={err("country")} value={value.country} onChange={set("country")}>
            {TARI.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
    </>
  );
});

export function GuestHistory({ guest, core, reservations, onClose }) {
  useModalLock();
  const [page, setPage] = useState(0);
  const stays = reservations
    .filter((r) => r.guestId === guest.id)
    .sort((a, b) => new Date(b.checkin) - new Date(a.checkin));
  const live = stays.filter(isLive);
  const nights = live.reduce((n, r) => n + nightsBetween(r.checkin, r.checkout), 0);
  // Protocol nu se incaseaza — nu intra in "Valoare".
  const spent = live.filter(isStatsEligible).reduce((v, r) => v + reservationTotal(r, core), 0);

  const pageCount = Math.max(1, Math.ceil(stays.length / GUEST_HISTORY_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStays = stays.slice(safePage * GUEST_HISTORY_PAGE_SIZE, (safePage + 1) * GUEST_HISTORY_PAGE_SIZE);

  const contactLine = [guest.city, guest.county].filter(Boolean).join(", ");

  return (
    <Dialog onClose={onClose} title={guestFullName(guest)}>

        <div className="guest-contact-info">
          {contactLine && <div>{contactLine}{guest.country && guest.country !== "România" ? ` · ${guest.country}` : ""}</div>}
          {guest.phone && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {guest.phone}
              <ContactQuickActions guest={guest} />
            </div>
          )}
          {guest.email && <div><a href={`mailto:${guest.email}`}>{guest.email}</a></div>}
        </div>

        <div className="stat-row" style={{ marginBottom: 14 }}>
          <Stat label="Sejururi" value={live.length} sub="valide" />
          <Stat label="Nopți" value={nights} sub="total" />
          <Stat label="Valoare" value={fmtMoney(spent)} sub="cumulat" />
          <Stat label="Ultimul" value={live[0] ? fmtDateFull(live[0].checkin) : "—"} sub="sosire" />
        </div>

        {stays.length === 0 ? (
          <div className="section-empty">Niciun sejur înregistrat.</div>
        ) : (
          <>
            <div className="panel">
              {pageStays.map((r) => (
                <div className="list-row" key={r.id}>
                  <div>
                    <div className="primary mono">{core.rooms.find((x) => x.id === r.roomId)?.name || "—"}</div>
                    <div className="secondary">
                      {fmtDateFull(r.checkin)} → {fmtDateFull(r.checkout)} · {nightsBetween(r.checkin, r.checkout)} nopți · {sourceLabel(r.source)}
                    </div>
                  </div>
                  <span className={"role-tag " + (r.status === "checkedout" ? "role-receptionist"
                    : isLive(r) ? "role-admin" : "role-housekeeping")}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
              ))}
            </div>
            {pageCount > 1 && (
              <div className="pager">
                <button className="btn btn-ghost" style={{ width: "auto" }} disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft size={15} /> Anterior
                </button>
                <span className="pager-info">Pagina {safePage + 1} din {pageCount}</span>
                <button className="btn btn-ghost" style={{ width: "auto" }} disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>
                  Următor <ChevronRight size={15} />
                </button>
              </div>
            )}
          </>
        )}
      </Dialog>
  );
}

export function SubTabs({ tab, setTab, guestCount, groupCount, firmCount }) {
  return (
    <div className="sub-tabs">
      <button className={tab === "guests" ? "on" : ""} onClick={() => setTab("guests")}>
        <Users size={14} /> Oaspeți <span className="tab-count">{guestCount}</span>
      </button>
      <button className={tab === "firms" ? "on" : ""} onClick={() => setTab("firms")}>
        <Receipt size={14} /> Firme <span className="tab-count">{firmCount}</span>
      </button>
      <button className={tab === "groups" ? "on" : ""} onClick={() => setTab("groups")}>
        <UsersRound size={14} /> Grupuri <span className="tab-count">{groupCount}</span>
      </button>
    </div>
  );
}

export function GuestModal({ guest, onSave, onClose }) {
  useModalLock();
  const [g, setG] = useState(() => ({ ...emptyGuest(), ...(guest || {}) }));
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(null);
  const [saving, setSaving] = useState(false);
  // Generat o singura data, nu la fiecare submit — altfel un dublu-tap pe
  // "Salveaza" (usor de facut pe mobil cat timp raspunsul serverului
  // intarzie) produce doua id-uri diferite, deci doi clienti locali
  // distincti adaugati optimist in core.guests inainte ca salvarea sa se
  // termine si dialogul sa se inchida — apar duplicate in cautare chiar
  // daca la final se salveaza un singur rand in baza de date.
  const idRef = useRef(guest?.id || uid());

  const REQUIRED = [
    ["lastName", "nume"], ["firstName", "prenume"], ["phone", "telefon"],
    ["city", "oraș"], ["county", "județ"], ["country", "țară"],
  ];

  const submit = async () => {
    if (saving) return;
    const missing = REQUIRED.filter(([k]) => !String(g[k] ?? "").trim());
    if (missing.length) {
      setInvalid(new Set(missing.map(([k]) => k)));
      setError(`Completează: ${missing.map(([, label]) => label).join(", ")}.`);
      return;
    }
    const { dial, local } = splitPhone(g.phone);
    const phoneCheck = validatePhone(local, dial);
    if (!phoneCheck.ok) {
      setInvalid(new Set(["phone"]));
      setError(phoneCheck.message);
      return;
    }
    const emailCheck = validateEmail(g.email);
    if (!emailCheck.ok) {
      setInvalid(new Set(["email"]));
      setError(emailCheck.message);
      return;
    }
    setInvalid(null);
    setSaving(true);
    const record = {
      ...g,
      id: idRef.current,
      lastName: g.lastName.trim(), firstName: g.firstName.trim(),
      phone: g.phone.trim(), email: g.email.trim(),
      address: g.address.trim(), city: g.city.trim(),
      county: g.county.trim(), country: g.country.trim(),
    };
    record.name = guestFullName(record);
    try {
      await onSave(record);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onClose={onClose} title={guest?.id ? "Editează client" : "Client nou"}>
        <GuestFields value={g} invalid={invalid} onChange={(v) => { setG(v); setError(""); setInvalid(null); }} />
        <label className="field"><span className="fl">Note</span><textarea rows={2} maxLength={2000} value={g.notes} onChange={(e) => setG({ ...g, notes: e.target.value })} /></label>
        {error && <div className="error-text" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="modal-actions">
          <div className="grow" />
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Anulează</button>
          <button className="btn btn-primary" style={{ width: "auto" }} onClick={submit} disabled={saving}>
            <Check size={15} /> {saving ? "Se salvează…" : "Salvează"}
          </button>
        </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------
   HOUSEKEEPING VIEW
----------------------------------------------------------------*/
