import fs from "fs";
const p = "src/pms-app.jsx";
let s = fs.readFileSync(p, "utf8");

const start = s.indexOf("function Login({ users, onLogin }) {");
if (start === -1) { console.error("Nu am gasit Login."); process.exit(1); }
let i = s.indexOf("\n}", start);
if (i === -1) { console.error("Nu am gasit finalul."); process.exit(1); }
const end = i + 2;

const nou = `function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(), password,
      });
      if (authErr) throw authErr;
      const { data: st, error: stErr } = await supabase
        .from("staff").select("name, role").eq("user_id", data.user.id).maybeSingle();
      if (stErr) throw stErr;
      if (!st) {
        await supabase.auth.signOut();
        throw new Error("Contul nu are drepturi in aplicatie.");
      }
      onLogin({ id: data.user.id, name: st.name, role: st.role });
    } catch (e) {
      setError(e?.message || "Autentificare esuata.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="mark"><DoorOpen size={18} /></div>
          <div>
            <h1>La Livada PMS</h1>
            <p>Autentifica-te pentru a continua</p>
          </div>
        </div>
        <label className="field">
          <span className="fl">Email</span>
          <input type="email" value={email} autoComplete="username"
            onChange={(e) => { setEmail(e.target.value); setError(""); }} />
        </label>
        <label className="field">
          <span className="fl">Parola</span>
          <input type="password" value={password} autoComplete="current-password"
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        <button className="btn btn-primary" onClick={submit}
          disabled={busy || !email.trim() || !password}>
          <ShieldCheck size={15} /> {busy ? "Se verifica..." : "Intra in cont"}
        </button>
        {error && <div className="error-text" role="alert">{error}</div>}
      </div>
    </div>
  );
}
`;

s = s.slice(0, start) + nou + s.slice(end);
s = s.replace("<Login users={core.users} onLogin={setCurrentUser} />", "<Login onLogin={setCurrentUser} />");
s = s.replace("onLogout={() => setCurrentUser(null)}",
  "onLogout={async () => { await supabase.auth.signOut(); setCurrentUser(null); }}");

fs.writeFileSync(p, s, "utf8");
console.log("Gata.");
