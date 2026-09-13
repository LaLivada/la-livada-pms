-- P1.1 — search_path fixat pe toate functiile. Critic pentru cele
-- security definer (next_invoice_number/next_receipt_number ruleaza cu
-- privilegii ridicate); pentru restul e igiena, dar e gratis si curata
-- complet categoria din linterul Supabase.
alter function next_invoice_number(text)                     set search_path = public;
alter function next_receipt_number(text)                     set search_path = public;
alter function recalc_invoice_payment_status()               set search_path = public;
alter function guard_invoice_update()                        set search_path = public;
alter function guard_invoice_item_link()                     set search_path = public;
alter function nightly_rate(text, date)                      set search_path = public;
alter function stay_total(text, timestamptz, timestamptz)    set search_path = public;
alter function available_rooms(timestamptz, timestamptz, int) set search_path = public;