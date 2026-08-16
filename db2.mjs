import fs from "fs";
const p = "src/pms-app.jsx";
let s = fs.readFileSync(p, "utf8");
const orig = s;

// --- Inlocuieste blocul de incarcare din useEffect ---
const a1 = "        let c = await loadShared(K.core, null);";
const a2 = "      } catch (err) {\n        console.error(\"PMS init failed\", err);";
const i1 = s.indexOf(a1), i2 = s.indexOf(a2);
if (i1 === -1 || i2 === -1) { console.error("Nu am gasit blocul de incarcare"); process.exit(1); }

const nou = `        const db = await loadAll();
        // Setarile care nu au tabel propriu (useri, ore check-in etc.)
        // raman in app_state; restul vine acum din tabele reale.
        const settings = (await loadShared(K.core, null)) || {};
        const c = repairCore({
          ...settings,
          rooms: db.rooms,
          guests: db.guests,
          rates: db.rates,
        });
        const r = db.reservations;
        const gr = db.groups.filter((g) => r.some((x) => x.groupId === g.id));
        const bl = db.blocks;

        let h = await loadShared(K.hk, null);
        if (!h || typeof h !== "object" || Array.isArray(h)) {
          h = {};
          c.rooms.forEach((rm) => { h[rm.id] = { status: "clean", updatedAt: new Date().toISOString() }; });
          await saveShared(K.hk, h);
        }
        let lg = await loadShared(K.log, []);
        if (!Array.isArray(lg)) lg = [];
        if (!alive) return;
        audit.entries = lg; audit.setEntries = setLogEntries;
        setCore(c); setReservations(r); setHousekeeping(h);
        setGroups(gr); setBlocks(bl); setLogEntries(lg);
`;
s = s.slice(0, i1) + nou + s.slice(i2);

// --- Inlocuieste functiile de scriere ---
const vechi = `  const updateCore = useCallback(async (next) => { setCore(next); await saveShared(K.core, next); }, []);
  const updateReservations = useCallback(async (next) => { setReservations(next); await saveShared(K.res, next); }, []);
  const updateHousekeeping = useCallback(async (next) => { setHousekeeping(next); await saveShared(K.hk, next); }, []);
  const updateGroups = useCallback(async (next) => { setGroups(next); await saveShared(K.groups, next); }, []);
  const updateBlocks = useCallback(async (next) => { setBlocks(next); await saveShared(K.blocks, next); }, []);`;

if (!s.includes(vechi)) { console.error("Nu am gasit functiile de scriere"); process.exit(1); }

const noiFn = `  /* Fiecare functie trimite doar randurile schimbate. Starea locala
     se actualizeaza imediat, iar daca scrierea esueaza (de ex. camera
     tocmai a fost ocupata de altcineva) eroarea ajunge la utilizator
     si datele se reincarca din baza. */
  const coreRef = useRef(core);
  useEffect(() => { coreRef.current = core; }, [core]);
  const resRef = useRef(reservations);
  useEffect(() => { resRef.current = reservations; }, [reservations]);
  const grRef = useRef(groups);
  useEffect(() => { grRef.current = groups; }, [groups]);
  const blRef = useRef(blocks);
  useEffect(() => { blRef.current = blocks; }, [blocks]);

  const raporteazaEroare = useCallback((e) => {
    const m = e?.message || "";
    toaster.show(
      m.includes("fara_suprapunere") || m.includes("exclusion")
        ? "Camera este deja ocupata in acea perioada."
        : "Salvarea a esuat: " + m,
      { tone: "danger" }
    );
    setReloadKey((k) => k + 1);
  }, []);

  const updateCore = useCallback(async (next) => {
    const before = coreRef.current;
    setCore(next);
    try {
      await syncTable("rooms", before.rooms, next.rooms, snakeRoom);
      await syncTable("guests", before.guests, next.guests, snakeGuest);
      const { rooms, guests, rates, ...settings } = next;
      await saveShared(K.core, settings);
    } catch (e) { raporteazaEroare(e); }
  }, [raporteazaEroare]);

  const updateReservations = useCallback(async (next) => {
    const before = resRef.current;
    setReservations(next);
    try { await syncTable("reservations", before, next, snakeRes); }
    catch (e) { raporteazaEroare(e); }
  }, [raporteazaEroare]);

  const updateGroups = useCallback(async (next) => {
    const before = grRef.current;
    setGroups(next);
    try { await syncTable("res_groups", before, next, snakeGroup); }
    catch (e) { raporteazaEroare(e); }
  }, [raporteazaEroare]);

  const updateBlocks = useCallback(async (next) => {
    const before = blRef.current;
    setBlocks(next);
    try {
      await syncTable("reservations", before, next, (b) => ({
        id: b.id, room_id: b.roomId,
        checkin: new Date(b.start).toISOString(),
        checkout: new Date(b.end).toISOString(),
        status: "confirmed", source: "blocaj", notes: b.reason || null,
      }));
    } catch (e) { raporteazaEroare(e); }
  }, [raporteazaEroare]);

  const updateHousekeeping = useCallback(async (next) => {
    setHousekeeping(next); await saveShared(K.hk, next);
  }, []);`;

s = s.replace(vechi, noiFn);

fs.writeFileSync(p, s, "utf8");
console.log(s === orig ? "NIMIC schimbat" : "Etapa 2 gata.");
