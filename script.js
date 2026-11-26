/* ---- 1. Paste your Firebase web app config here (Project settings > Your apps) ---- */
const firebaseConfig = {
  apiKey: "AIzaSyCuwwqLUV34AeKR9YJRt44aoSeQYSoHDQs",
  authDomain: "leave-computation.firebaseapp.com",
  projectId: "leave-computation",
  storageBucket: "leave-computation.firebasestorage.app",
  messagingSenderId: "701888959391",
  appId: "1:701888959391:web:4a8e8c93ee863b0c50a3aa"
};
const ALLOWED_DOMAIN = "cbsua.edu.ph";
const SUPER_ADMIN = "hris.hr@cbsua.edu.ph";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.firestore(), col = db.collection("leaveCards"), admins = db.collection("admins");
const $ = id => document.getElementById(id);
const MONTHS = ["Jan.","Feb.","Mar.","Apr.","May","June","July","Aug.","Sept.","Oct.","Nov.","Dec."];
const F = ["month","range","vEarn","vAbsW","vBal","vAbsWo","sEarn","sAbsW","sBal","sAbsWo","action"];
let curId = null, all = [], user = null, isAdmin = false, isSuper = false;

/* ---- auth & roles ---- */
$("in").onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider().setCustomParameters({hd: ALLOWED_DOMAIN})).catch(e => $("err").textContent = e.message);
$("out").onclick = () => auth.signOut();
auth.onAuthStateChanged(async u => {
  if (u && !(u.email || "").toLowerCase().endsWith("@" + ALLOWED_DOMAIN)) {
    $("err").textContent = "Use your CBSUA Institutional Email assigned to you.";
    return auth.signOut();
  }
  user = u; isAdmin = isSuper = false;
  if (u) {
    const em = u.email.toLowerCase();
    isSuper = em === SUPER_ADMIN;
    try { isAdmin = isSuper || (await admins.doc(em).get()).exists; } catch (e) {}
  }
  $("login").hidden = !!u; $("app").hidden = !u; $("out").hidden = !u;
  $("who").textContent = u ? u.email : "";
  if (u) { $("role").textContent = isAdmin ? (isSuper ? "SUPER ADMIN" : "ADMIN") : "VIEW ONLY"; applyRole();
    if (!isAdmin) $("name").value = u.displayName || u.email;   // show the signed-in name right away
    await loadList();
    if (!isAdmin && all.length) { curId = all[0].id; fill(all[0]); render(); }
    else { newCard(); if (!isAdmin) $("name").value = u.displayName || u.email; } }
});
function applyRole() {
  document.body.classList.toggle("viewer", !isAdmin);
  document.querySelectorAll("#app .card input, #app .card select").forEach(e => e.disabled = !isAdmin);
  ["save","fill12","row","del","new"].forEach(id => $(id).hidden = !isAdmin);
  $("navadm").hidden = !isSuper;
  if (!isSuper) showView("cards");
  document.querySelectorAll(".np button").forEach(b => b.hidden = !isAdmin);
}

/* ---- table ---- */
const n = v => parseFloat(v) || 0, f3 = v => (Math.round(v * 1000) / 1000).toFixed(3);
const days = (m, y) => [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];
const earnedFor = (r, mi) => { // Table II: days x 1.25 / 30; a whole month = 1.250; day 31 earns nothing
  const m = /(\d+)\s*-\s*(\d+)/.exec(r || ""); if (!m) return "";
  let a = +m[1]; const b = +m[2], y = n($("yr").value) || new Date().getFullYear();
  const [sy, sm, sd] = ($("first").value || "").split("-").map(Number);
  if (sy === y && sm - 1 === mi) a = Math.max(a, sd);          // started mid-month: days before are not counted
  if (mi >= 0 && a === 1 && b >= days(mi, y)) return "1.250";
  const d = Math.min(b, 30) - a + 1; // day 31 earns nothing
  return f3(Math.max(d, 0) * 1.25 / 30);
};
const setEarned = (tr, r) => { const e = earnedFor(r, MONTHS.indexOf(tr.querySelector('[data-k="month"]').value)); if (e) ["vEarn", "sEarn"].forEach(k => tr.querySelector(`[data-k="${k}"]`).value = e); };
const rangeFor = m => { // the first month of a new employee starts on the 1st day of service
  const y = n($("yr").value) || new Date().getFullYear(), [sy, sm, sd] = ($("first").value || "").split("-").map(Number);
  return sy === y && sm - 1 === m ? `${sd}-${days(m, y)}` : `1-${days(m, y)}`;
};
function addRow(d = {}) {
  const tr = document.createElement("tr"), esc = v => (v ?? "").toString().replace(/"/g, "&quot;");
  const opts = '<option value="">-- Month --</option>' + MONTHS.map(m => `<option${d.month === m ? " selected" : ""}>${m}</option>`).join("");
  tr.innerHTML = `<td><select data-k="month">${opts}</select><input data-k="range" value="${esc(d.range)}" placeholder="1-31"></td>` +
    F.slice(1).map(k => `<td><input data-k="${k}" value="${esc(d[k])}" ${/Bal$/.test(k) ? 'class="bal"' : ""}></td>`).join("") +
    `<td class="np"><button title="Delete row">&times;</button></td>`;
  tr.querySelector("button").onclick = () => { tr.remove(); calc(); };
  tr.querySelector("select").onchange = e => { const i = MONTHS.indexOf(e.target.value), r = i < 0 ? "" : rangeFor(i); tr.querySelector('[data-k="range"]').value = r; setEarned(tr, r); calc(); };
  tr.addEventListener("input", e => { const k = e.target.dataset.k; if (k === "range") setEarned(tr, e.target.value); if (!/Bal$/.test(k)) calc(); });
  $("rows").appendChild(tr);
}
function calc() { // balance = previous balance + earned - absence with pay
  let pv = null, ps = null;
  [...$("rows").rows].forEach((tr, i) => {
    const g = k => tr.querySelector(`[data-k="${k}"]`);
    const run = (prev, e, a, b) => {
      const hasData = g(e).value !== "" || g(a).value !== "";
      if (i === 0 && !hasData) return n(g(b).value);
      if (prev === null) prev = 0;
      if (!hasData && g(b).value === "") return prev;
      const v = prev + n(g(e).value) - n(g(a).value);
      g(b).value = f3(v); return v;
    };
    pv = run(pv, "vEarn", "vAbsW", "vBal");
    ps = run(ps, "sEarn", "sAbsW", "sBal");
  });
}
function applyStart() { // rows before the start month are dropped; the start month begins on the day of service
  const [sy, sm] = ($("first").value || "").split("-").map(Number);
  if (!sy || sy !== n($("yr").value)) return;
  [...$("rows").rows].forEach(tr => {
    const i = MONTHS.indexOf(tr.querySelector('[data-k="month"]').value);
    if (i < 0) return;
    if (i < sm - 1) tr.remove();
    else if (i === sm - 1) { const r = rangeFor(i); tr.querySelector('[data-k="range"]').value = r; setEarned(tr, r); }
  });
  calc();
}
$("first").onchange = $("yr").onchange = applyStart;
$("row").onclick = () => { addRow(); applyRole(); };
$("fill12").onclick = () => {
  if (!$("yr").value) { $("yr").value = new Date().getFullYear(); }
  const [sy, sm] = ($("first").value || "").split("-").map(Number);
  MONTHS.forEach((m, i) => { if (sy === +$("yr").value && i < sm - 1) return; // no credits before the 1st day of service
    const r = rangeFor(i); addRow({month: m, range: r, vEarn: earnedFor(r, i), sEarn: earnedFor(r, i)}); });
  calc(); applyRole();
};
$("print").onclick = () => window.print();

/* ---- name matching: the card is found from the name on the employee's CBSUA Google account ---- */
const norm = t => (t || "").toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
function aliasesOf(full) { // "ABLAY, Atilano A." -> "Atilano Ablay", "Ablay Atilano", "Atilano A. Ablay", ... in 3 letter-cases
  if (!full.includes(",")) return [];
  const [sur, giv] = full.split(",").map(norm), g = giv.split(" ").filter(Boolean);
  const words = g.filter(w => w.length > 1), mi = g.filter(w => w.length === 1).join(" ");
  if (!sur || !words.length) return [];
  const firsts = [...new Set([words.join(" "), words[0]])], base = new Set();
  firsts.forEach(f => {
    base.add(`${f} ${sur}`); base.add(`${sur} ${f}`);
    if (mi) [mi, mi + "."].forEach(m => { base.add(`${f} ${m} ${sur}`); base.add(`${sur} ${f} ${m}`); });
  });
  const title = t => t.replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase());
  return [...new Set([...base].flatMap(t => [t, t.toUpperCase(), title(t)]))];
}
const myKey = () => user.displayName || "";

/* ---- records ---- */
function data() {
  return {
    name: $("name").value.trim(), division: $("div").value.trim(), firstDay: $("first").value, year: $("yr").value, aliases: aliasesOf($("name").value),
    rows: [...$("rows").rows].map(tr => Object.fromEntries(F.map(k => [k, tr.querySelector(`[data-k="${k}"]`).value]))),
    updatedBy: user.email, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
}
function fill(c) {
  $("name").value = c.name || ""; $("div").value = c.division || ""; $("first").value = c.firstDay || ""; $("yr").value = c.year || "";
  $("rows").innerHTML = ""; (c.rows || []).forEach(addRow); calc(); applyRole();
}
function newCard() { curId = null; fill({}); if (isAdmin) { addRow(); applyRole(); } render(); }
$("new").onclick = newCard;
function flash(t) { $("msg").textContent = t; setTimeout(() => $("msg").textContent = "", 3000); }

$("save").onclick = async () => {
  if (!isAdmin) return;
  applyStart();
  const d = data();
  if (!d.name) return flash("Enter the employee name first.");
  if (!d.aliases.length) return flash("Write the name as SURNAME, Given name M.");
  try {
    if (curId) await col.doc(curId).set(d, {merge: true});
    else { const r = await col.add({...d, createdBy: user.email}); curId = r.id; }
    flash("Saved."); loadList();
  } catch (e) { flash("Error: " + e.message); }
};
$("del").onclick = async () => {
  if (!isAdmin || !curId || !confirm("Delete this leave card permanently?")) return;
  await col.doc(curId).delete(); newCard(); loadList(); flash("Deleted.");
};
let loadErr = "";
async function loadList() {
  loadErr = "";
  try {
    const s = isAdmin ? await col.orderBy("name").get() : await col.where("aliases", "array-contains", myKey()).get();
    all = s.docs.map(d => ({id: d.id, ...d.data()}));
    if (isAdmin) all.forEach(c => { // refresh name matching for cards saved before it existed
      const a = aliasesOf(c.name || "");
      if (a.length && JSON.stringify(a) !== JSON.stringify(c.aliases || [])) { c.aliases = a; col.doc(c.id).update({aliases: a}).catch(() => {}); }
    });
    if (!isAdmin) all.sort((a, b) => n(b.year) - n(a.year)); // newest year first
  } catch (e) { all = []; loadErr = e.message; }
  render();
}
function render() {
  if (!isAdmin) { // employees: only year buttons above their own card
    $("years").hidden = false;
    $("years").innerHTML = all.length ? "" : `<span class="vmsg">${loadErr ? "Cannot load your leave card: " + loadErr : "No leave card found for the name on your account (" + (user.displayName || user.email) + "). Please inform HRMDO."}</span>`;
    all.forEach(c => {
      const b = document.createElement("button");
      b.textContent = c.year || "No year"; b.className = c.id === curId ? "on" : "";
      b.onclick = () => { curId = c.id; fill(c); render(); };
      $("years").appendChild(b);
    });
    return;
  }
  $("years").hidden = true;
  const q = $("q").value.toLowerCase();
  $("cards").innerHTML = "";
  all.filter(c => (c.name + c.division).toLowerCase().includes(q)).forEach(c => {
    const li = document.createElement("li");
    li.className = c.id === curId ? "on" : "";
    li.innerHTML = `${c.name}<small>${c.division || ""}${c.year ? " · " + c.year : ""}</small>`;
    li.onclick = () => { curId = c.id; fill(c); render(); };
    $("cards").appendChild(li);
  });
}
$("q").oninput = render;

/* ---- admin management (super admin only) ---- */
function showView(v) { // sidebar: Leave Cards / Manage Admin Roles
  const adm = v === "admins" && isSuper;
  $("cardView").hidden = adm; $("cardsPane").hidden = adm; $("adminView").hidden = !adm;
  $("navcards").classList.toggle("on", !adm); $("navadm").classList.toggle("on", adm);
  if (adm) loadAdmins();
}
$("navcards").onclick = () => showView("cards");
$("navadm").onclick = () => showView("admins");
async function loadAdmins() {
  const s = await admins.get();
  $("alist").innerHTML = `<li><span>${SUPER_ADMIN} <small>(super admin)</small></span></li>`;
  s.docs.forEach(d => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${d.id}</span><button>Remove</button>`;
    li.querySelector("button").onclick = async () => { if (confirm("Remove " + d.id + " as admin?")) { await admins.doc(d.id).delete(); loadAdmins(); } };
    $("alist").appendChild(li);
  });
}
$("aadd").onclick = async () => {
  const em = $("aemail").value.trim().toLowerCase();
  $("amsg").textContent = "";
  if (!em.endsWith("@" + ALLOWED_DOMAIN)) return $("amsg").textContent = "Use an @" + ALLOWED_DOMAIN + " email.";
  await admins.doc(em).set({addedBy: user.email, addedAt: firebase.firestore.FieldValue.serverTimestamp()});
  $("aemail").value = ""; loadAdmins();
};
