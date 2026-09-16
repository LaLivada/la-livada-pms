-- Cererile de retragere din contract trimise din formularul de pe
-- rezervari.lalivada.ro/retragere/ (art. 11^1 din OUG 34/2014: consumatorul
-- trebuie să aibă o cale online, clară, de a-și exercita dreptul).
--
-- Rândul se scrie ÎNAINTE să plece emailul către recepție, ca cererea să nu
-- depindă de un serviciu de email: pe lalivada.ro două cereri s-au pierdut
-- așa, între serverul de poștă și căsuță. Aici cererea există din clipa în
-- care omul a apăsat „Trimite”, iar emailul e doar înștiințarea.
--
-- Scrie în ea doar funcția edge `retragere`, cu cheia de serviciu. Niciun rol
-- din browser nu o vede: RLS pornit fără politici, drepturile luate explicit
-- (inclusiv de la `authenticated` — vezi memoria despre default privileges).
create table public.cereri_retragere (
  id            bigint generated always as identity primary key,
  creat_la      timestamptz not null default now(),
  nume          text not null,
  email         text not null,
  rezervare     text,
  sosire        date,
  mesaj         text not null,
  email_trimis  boolean not null default false,
  ip            text
);

comment on table public.cereri_retragere is
  'Cereri de retragere din contract trimise din formularul public de pe rezervari.lalivada.ro. Scrise doar de funcția edge retragere.';

alter table public.cereri_retragere enable row level security;
revoke all on public.cereri_retragere from public, anon, authenticated;

create index cereri_retragere_email_creat_idx on public.cereri_retragere (email, creat_la desc);
