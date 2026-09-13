create table fise_cazare (
  id              text primary key,
  reservation_id  text not null references reservations(id) on delete cascade,
  -- 1 = titularul. Coloana exista de la inceput ca insotitorii sa nu ceara
  -- o migratie de date mai tarziu; prima versiune scrie numai 1.
  ordine          smallint not null default 1,
  guest_id        text references guests(id),

  nume            text not null,
  prenume         text not null,
  data_nasterii   date not null,
  locul_nasterii  text not null,
  -- Doua campuri, nu unul. Coala tiparita scrie `guests.country` si la
  -- „Nationalitate" si la „Tara" (src/features/documente.jsx), deci un
  -- roman cu domiciliul in Germania iese cu „Germania" la nationalitate.
  -- Pe hartie trecea neobservat fiindca receptionerul corecta cu pixul;
  -- intr-un formular completat de oaspete, greseala se salveaza.
  nationalitate   text not null,
  tara            text not null,
  adresa          text not null,
  localitate      text not null,
  scopul          text not null,

  act_tip         text not null check (act_tip in ('ci','pasaport','permis')),
  act_seria       text,
  act_numarul     text not null,

  -- Semnatura oaspetelui SAU numele celui de la receptie care a completat
  -- fisa in locul lui. Un om de optzeci de ani fara smartphone tot trebuie
  -- cazat legal.
  semnatura_svg   text,
  completata_de   text,
  semnat_la       timestamptz not null default now(),
  semnat_ip       text,
  semnat_agent    text,
  -- Versiunea colii cu care s-a randat fisa. Vezi docs/fisa-cazare.md 4:
  -- pana se scrie congelarea in Storage, imuabilitatea randului plus
  -- versiunea asta sunt ce face documentul reproductibil.
  sablon_versiune text not null,

  anulata_la      timestamptz,
  anulata_de      text,
  anulata_motiv   text,

  -- `<>` pe doua teste de null inseamna EXACT UNA. O fisa fara niciun autor
  -- n-ar avea valoare; una cu amandoi ar spune doua povesti despre cine a
  -- completat-o.
  constraint fisa_are_un_autor check (
    (semnatura_svg is not null) <> (completata_de is not null))
);

-- Index partial, nu cheie unica: o fisa anulata trebuie sa lase loc alteia
-- pe acelasi (rezervare, ordine). Cu o cheie obisnuita, prima greseala ar
-- fi blocat locul pentru totdeauna.
create unique index fise_cazare_activa
  on fise_cazare (reservation_id, ordine) where anulata_la is null;
create index fise_cazare_rezervare on fise_cazare (reservation_id);

alter table fise_cazare enable row level security;

-- Nicio politica. Accesul trece exclusiv prin functiile security definer
-- din docs/fisa-cazare-plan.md, sarcinile 4 si 5, care ocolesc RLS pentru
-- propriile query-uri. Acelasi tipar ca la guest_code_attempts.
revoke all on table fise_cazare from public, anon, authenticated;