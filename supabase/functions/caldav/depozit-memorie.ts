/* Depozitul in memorie al serverului CalDAV — pentru teste
 * (src/caldav-servitor.test.js). Oglindeste ce face baza in productie
 * (index.ts): etag din continut, ctag-ul calendarului creste la fiecare
 * scriere, stergerea lasa o „piatra de mormant" cu sync_seq-ul ei. */
import type { Calendar, Depozit, FiltruObiecte, Obiect } from "./servitor.ts";
import type { RezumatObiect } from "./ics.ts";

function hash(text: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export class DepozitMemorie implements Depozit {
  calendareLista: Calendar[];
  obiecteLista: Obiect[] = [];
  private nr = 0;

  constructor(calendare: Array<Partial<Calendar> & { slug: string; nume: string }>) {
    this.calendareLista = calendare.map((c, i) => ({ id: c.id ?? `cal-${i + 1}`, slug: c.slug, nume: c.nume, culoare: c.culoare ?? null, ordine: c.ordine ?? i, ctag: c.ctag ?? 1 }));
  }

  async calendare() { return [...this.calendareLista].sort((a, b) => a.ordine - b.ordine); }
  async calendarDupaSlug(slug: string) { return this.calendareLista.find((c) => c.slug === slug) ?? null; }

  async obiecte(calendarId: string, f: FiltruObiecte) {
    return this.obiecteLista.filter((o) => {
      if (o.calendarId !== calendarId) return false;
      if (f.dupaSync != null) { if (o.syncSeq <= f.dupaSync) return false; }
      else if (o.sters) return false;
      if (f.hrefuri && !f.hrefuri.includes(o.href)) return false;
      if (f.interval && !o.recurent && o.incepe && o.seTermina) {
        if (new Date(o.incepe) > f.interval.end || new Date(o.seTermina) < f.interval.start) return false;
      }
      return true;
    });
  }

  async obiect(calendarId: string, href: string) {
    return this.obiecteLista.find((o) => o.calendarId === calendarId && o.href === href && !o.sters) ?? null;
  }

  async obiectDupaUid(calendarId: string, uid: string) {
    return this.obiecteLista.find((o) => o.calendarId === calendarId && o.uid === uid && !o.sters) ?? null;
  }

  private bump(calendarId: string): number {
    const cal = this.calendareLista.find((c) => c.id === calendarId)!;
    cal.ctag += 1;
    return cal.ctag;
  }

  async scrieObiect(calendarId: string, href: string, ics: string, r: RezumatObiect) {
    const seq = this.bump(calendarId);
    const campuri = {
      uid: r.uid, etag: hash(ics), ics, sters: false, syncSeq: seq, actualizatLa: new Date().toISOString(),
      incepe: r.incepe?.toISOString() ?? null, seTermina: r.seTermina?.toISOString() ?? null, recurent: r.recurent,
    };
    const existent = this.obiecteLista.find((o) => o.calendarId === calendarId && o.href === href);
    if (existent) { Object.assign(existent, campuri); return existent; }
    const nou: Obiect = { id: `ob-${++this.nr}`, calendarId, href, ...campuri };
    this.obiecteLista.push(nou);
    return nou;
  }

  async stergeObiect(calendarId: string, href: string) {
    const o = this.obiecteLista.find((x) => x.calendarId === calendarId && x.href === href && !x.sters);
    if (!o) return false;
    o.sters = true;
    o.syncSeq = this.bump(calendarId);
    o.actualizatLa = new Date().toISOString();
    return true;
  }

  async actualizeazaCalendar(calendarId: string, campuri: { nume?: string; culoare?: string; ordine?: number }) {
    const cal = this.calendareLista.find((c) => c.id === calendarId)!;
    Object.assign(cal, campuri);
    return cal;
  }
}
