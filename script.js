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
  if (u) { $("role").textContent = isAdmin ? (isSuper ? "SUPER ADMIN" : "ADMIN") : "VIEW ONLY"; await loadList(); if (!isAdmin && all.length) { curId = all[0].id; fill(all[0]); render(); } else newCard(); }
});
function applyRole() {
  document.querySelectorAll("#app .card input, #app .card select").forEach(e => e.disabled = !isAdmin);
  ["save","fill12","row","del","new"].forEach(id => $(id).hidden = !isAdmin);
  $("adm").hidden = !isSuper;
  if (!isSuper) $("admin").hidden = true;
  document.querySelectorAll(".np button").forEach(b => b.hidden = !isAdmin);
}

/* ---- table ---- */
const n = v => parseFloat(v) || 0, f3 = v => (Math.round(v * 1000) / 1000).toFixed(3);
const days = (m, y) => [31, (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m];
const rangeFor = m => `1-${days(m, n($("yr").value) || new Date().getFullYear())}`;
function addRow(d = {}) {
  const tr = document.createElement("tr"), esc = v => (v ?? "").toString().replace(/"/g, "&quot;");
  const opts = '<option value="">-- Month --</option>' + MONTHS.map(m => `<option${d.month === m ? " selected" : ""}>${m}</option>`).join("");
  tr.innerHTML = `<td><select data-k="month">${opts}</select><input data-k="range" value="${esc(d.range)}" placeholder="1-31"></td>` +
    F.slice(1).map(k => `<td><input data-k="${k}" value="${esc(d[k])}" ${/Bal$/.test(k) ? 'class="bal"' : ""}></td>`).join("") +
    `<td class="np"><button title="Delete row">&times;</button></td>`;
  tr.querySelector("button").onclick = () => { tr.remove(); calc(); };
  tr.querySelector("select").onchange = e => { const i = MONTHS.indexOf(e.target.value); tr.querySelector('[data-k="range"]').value = i < 0 ? "" : rangeFor(i); };
  tr.addEventListener("input", e => { if (!/Bal$/.test(e.target.dataset.k)) calc(); });
  $("rows").appendChild(tr);
}
function calc() { // balance = previous balance + earned - absence with pay
  let pv = null, ps = null;
  [...$("rows").rows].forEach((tr, i) => {
    const g = k => tr.querySelector(`[data-k="${k}"]`);
    const run = (prev, e, a, b) => {
      const hasData = g(e).value !== "" || g(a).value !== "";
      if (i === 0 && !hasData) return n(g(b).value);
      if (prev === null) prev = n(g(b).value);
      if (!hasData && g(b).value === "") return prev;
      const v = prev + n(g(e).value) - n(g(a).value);
      g(b).value = f3(v); return v;
    };
    pv = run(pv, "vEarn", "vAbsW", "vBal");
    ps = run(ps, "sEarn", "sAbsW", "sBal");
  });
}
$("row").onclick = () => { addRow(); applyRole(); };
$("fill12").onclick = () => {
  if (!$("yr").value) { $("yr").value = new Date().getFullYear(); }
  MONTHS.forEach((m, i) => addRow({month: m, range: rangeFor(i), vEarn: "1.250", sEarn: "1.250"}));
  calc(); applyRole();
};
$("print").onclick = () => window.print();

/* ---- records ---- */
function data() {
  return {
    name: $("name").value.trim(), division: $("div").value.trim(), firstDay: $("first").value, year: $("yr").value, email: $("email").value.trim().toLowerCase(),
    rows: [...$("rows").rows].map(tr => Object.fromEntries(F.map(k => [k, tr.querySelector(`[data-k="${k}"]`).value]))),
    updatedBy: user.email, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
}
function fill(c) {
  $("name").value = c.name || ""; $("div").value = c.division || ""; $("first").value = c.firstDay || ""; $("yr").value = c.year || ""; $("email").value = c.email || "";
  $("rows").innerHTML = ""; (c.rows || []).forEach(addRow); calc(); applyRole();
}
function newCard() { curId = null; fill({}); if (isAdmin) { addRow(); applyRole(); } render(); }
$("new").onclick = newCard;
function flash(t) { $("msg").textContent = t; setTimeout(() => $("msg").textContent = "", 3000); }

$("save").onclick = async () => {
  if (!isAdmin) return;
  const d = data();
  if (!d.name) return flash("Enter the employee name first.");
  if (!d.email.endsWith("@" + ALLOWED_DOMAIN)) return flash("Enter the employee's @" + ALLOWED_DOMAIN + " email.");
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
async function loadList() {
  const s = isAdmin ? await col.orderBy("name").get() : await col.where("email", "==", user.email.toLowerCase()).get();
  all = s.docs.map(d => ({id: d.id, ...d.data()}));
  if (!isAdmin) all.sort((a, b) => n(b.year) - n(a.year)); // newest year first
  render();
}
function render() {
  const q = $("q").value.toLowerCase();
  $("cards").innerHTML = "";
  $("q").hidden = !isAdmin;
  $("ltitle").textContent = isAdmin ? "LEAVE CARDS" : "MY LEAVE CARD - SELECT YEAR";
  if (!isAdmin && !all.length) $("cards").innerHTML = "<li>No leave card is linked to your email yet.</li>";
  all.filter(c => !isAdmin || (c.name + c.division + c.email).toLowerCase().includes(q)).forEach(c => {
    const li = document.createElement("li");
    li.className = (isAdmin ? "" : "yr ") + (c.id === curId ? "on" : "");
    li.innerHTML = isAdmin ? `${c.name}<small>${c.division || ""}${c.year ? " · " + c.year : ""}</small>` : `${c.year || "No year"}`;
    li.onclick = () => { curId = c.id; fill(c); render(); };
    $("cards").appendChild(li);
  });
}
$("q").oninput = render;

/* ---- admin management (super admin only) ---- */
$("adm").onclick = () => { $("admin").hidden = !$("admin").hidden; if (!$("admin").hidden) loadAdmins(); };
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
  if (!em.endsWith("@" + ALLOWED_DOMAIN)) return flash("Use an @" + ALLOWED_DOMAIN + " email.");
  await admins.doc(em).set({addedBy: user.email, addedAt: firebase.firestore.FieldValue.serverTimestamp()});
  $("aemail").value = ""; loadAdmins();
};
