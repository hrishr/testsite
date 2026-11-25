/* ---- 1. Paste your Firebase web app config here (Project settings > Your apps) ---- */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID"
};
const ALLOWED_DOMAIN = "cbsua.edu.ph";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.firestore(), col = db.collection("leaveCards");
const $ = id => document.getElementById(id);
const MONTHS = [["Jan.",31],["Feb.",28],["Mar.",31],["Apr.",30],["May",31],["June",30],["July",31],["Aug.",31],["Sept.",30],["Oct.",31],["Nov.",30],["Dec.",31]];
const F = ["period","part","vEarn","vAbsW","vBal","vAbsWo","sEarn","sAbsW","sBal","sAbsWo","action"];
let curId = null, all = [], user = null;

/* ---- auth ---- */
$("in").onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider().setCustomParameters({hd: ALLOWED_DOMAIN})).catch(e => $("err").textContent = e.message);
$("out").onclick = () => auth.signOut();
auth.onAuthStateChanged(u => {
  if (u && !(u.email || "").toLowerCase().endsWith("@" + ALLOWED_DOMAIN)) {
    $("err").textContent = "Use your CBSUA Institutional Email assigned to you.";
    return auth.signOut();
  }
  user = u;
  $("login").hidden = !!u; $("app").hidden = !u; $("out").hidden = !u;
  $("who").textContent = u ? u.email : "";
  if (u) { loadList(); newCard(); }
});

/* ---- table ---- */
const n = v => parseFloat(v) || 0, f3 = v => (Math.round(v * 1000) / 1000).toFixed(3);
function addRow(d = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = F.map(k => `<td><input data-k="${k}" value="${(d[k] ?? "").toString().replace(/"/g, "&quot;")}" ${/Bal$/.test(k) ? 'class="bal"' : ""}></td>`).join("") +
    `<td class="np"><button title="Delete row">&times;</button></td>`;
  tr.querySelector("button").onclick = () => { tr.remove(); calc(); };
  tr.addEventListener("input", e => { if (!/Bal$/.test(e.target.dataset.k)) calc(); });
  $("rows").appendChild(tr);
}
function calc() { // balance = previous balance + earned - absence with pay
  let pv = null, ps = null;
  [...$("rows").rows].forEach((tr, i) => {
    const g = k => tr.querySelector(`[data-k="${k}"]`);
    const run = (prev, e, a, b) => {
      const hasData = g(e).value !== "" || g(a).value !== "";
      if (i === 0 && !hasData) return n(g(b).value);        // forwarded balance typed manually
      if (prev === null) prev = n(g(b).value);
      if (!hasData && g(b).value === "") return prev;
      const v = prev + n(g(e).value) - n(g(a).value);
      g(b).value = f3(v); return v;
    };
    pv = run(pv, "vEarn", "vAbsW", "vBal");
    ps = run(ps, "sEarn", "sAbsW", "sBal");
  });
}
$("row").onclick = () => addRow();
$("year").onclick = () => {
  const y = new Date().getFullYear();
  MONTHS.forEach(([m, d], i) => addRow({period: `${m} 1-${i === 1 && y % 4 === 0 ? 29 : d}`, vEarn: "1.250", sEarn: "1.250"}));
  calc();
};
$("print").onclick = () => window.print();

/* ---- records ---- */
function data() {
  return {
    name: $("name").value.trim(), division: $("div").value.trim(), firstDay: $("first").value,
    rows: [...$("rows").rows].map(tr => Object.fromEntries(F.map(k => [k, tr.querySelector(`[data-k="${k}"]`).value]))),
    updatedBy: user.email, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
}
function fill(c) {
  $("name").value = c.name || ""; $("div").value = c.division || ""; $("first").value = c.firstDay || "";
  $("rows").innerHTML = ""; (c.rows || []).forEach(addRow); calc();
}
function newCard() { curId = null; fill({}); addRow(); document.querySelectorAll("#cards li").forEach(l => l.classList.remove("on")); }
$("new").onclick = newCard;
function flash(t) { $("msg").textContent = t; setTimeout(() => $("msg").textContent = "", 3000); }

$("save").onclick = async () => {
  const d = data();
  if (!d.name) return flash("Enter the employee name first.");
  try {
    if (curId) await col.doc(curId).set(d, {merge: true});
    else { const r = await col.add({...d, createdBy: user.email}); curId = r.id; }
    flash("Saved."); loadList();
  } catch (e) { flash("Error: " + e.message); }
};
$("del").onclick = async () => {
  if (!curId || !confirm("Delete this leave card permanently?")) return;
  await col.doc(curId).delete(); newCard(); loadList(); flash("Deleted.");
};
async function loadList() {
  const s = await col.orderBy("name").get();
  all = s.docs.map(d => ({id: d.id, ...d.data()})); render();
}
function render() {
  const q = $("q").value.toLowerCase();
  $("cards").innerHTML = "";
  all.filter(c => (c.name + c.division).toLowerCase().includes(q)).forEach(c => {
    const li = document.createElement("li");
    li.className = c.id === curId ? "on" : "";
    li.innerHTML = `${c.name}<small>${c.division || ""}</small>`;
    li.onclick = () => { curId = c.id; fill(c); render(); };
    $("cards").appendChild(li);
  });
}
$("q").oninput = render;
