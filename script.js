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
  if (u) { const av = $("avatar"); av.style.backgroundImage = u.photoURL ? `url("${u.photoURL}")` : ""; av.textContent = u.photoURL ? "" : (u.displayName || u.email)[0].toUpperCase(); }
  if (u) { $("role").textContent = isAdmin ? (isSuper ? "SUPER ADMIN" : "ADMIN") : "VIEW ONLY"; applyRole(); appInit = false; curApp = null; showView("cards");
    if (!isAdmin) $("name").value = u.displayName || u.email;   // show the signed-in name right away
    await loadList();
    if (!isAdmin && all.length) { curId = all[0].id; fill(all[0]); render(); }
    else { newCard(); if (!isAdmin) $("name").value = u.displayName || u.email; } }
});
function applyRole() {
  document.body.classList.toggle("viewer", !isAdmin);
  $("main").classList.toggle("wide", !isAdmin || !$("adminView").hidden || !$("applyView").hidden);
  document.querySelectorAll("#app .card input, #app .card select").forEach(e => e.disabled = !isAdmin);
  ["save","fill12","row","del","new"].forEach(id => $(id).hidden = !isAdmin);
  $("navadm").hidden = !isSuper;
  const lbl = (id, t) => { $(id).querySelector(".lbl").textContent = t; $(id).querySelector(".tip").textContent = t; };
  lbl("navcards", isAdmin ? "Leave Cards" : "My Leave Card"); lbl("navapply", isAdmin ? "Leave Applications" : "Apply for Leave");
  $("newApp").hidden = isAdmin;
  if (!isSuper && !$("adminView").hidden) showView("cards");
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
let appInit = false;
function showView(v) { // sidebar views: cards / apply / admins
  if (v === "admins" && !isSuper) v = "cards";
  $("cardView").hidden = $("cardsPane").hidden = v !== "cards";
  $("adminView").hidden = v !== "admins"; $("applyView").hidden = v !== "apply";
  $("main").classList.toggle("wide", v !== "cards" || !isAdmin);
  [["navcards", "cards"], ["navapply", "apply"], ["navadm", "admins"]].forEach(([id, k]) => $(id).classList.toggle("on", v === k));
  if (v === "admins") loadAdmins();
  if (v === "apply") { loadApps(); if (!appInit) { appInit = true; newApp(); } }
}
$("navcards").onclick = () => showView("cards");
$("navadm").onclick = () => showView("admins");
$("navapply").onclick = () => showView("apply");
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

/* ---- sidebar collapse (remembered) ---- */
try { if (localStorage.getItem("sbCollapsed") === "1") $("sidebar").classList.add("collapsed"); } catch (e) {}
$("toggle").onclick = () => {
  const c = $("sidebar").classList.toggle("collapsed");
  try { localStorage.setItem("sbCollapsed", c ? "1" : "0"); } catch (e) {}
};

/* ---- Apply for Leave: CSC Form No. 6 (Revised 2020) ---- */
const appsCol = db.collection("leaveApplications");
let apps = [], curApp = null;
const TYPES = [["Vacation Leave","Sec. 51, Rule XVI, Omnibus Rules Implementing E.O. No. 292"],["Mandatory/Forced Leave","Sec. 25, Rule XVI, Omnibus Rules Implementing E.O. No. 292"],["Sick Leave","Sec. 43, Rule XVI, Omnibus Rules Implementing E.O. No. 292"],["Maternity Leave","R.A. No. 11210 / IRR issued by CSC, DOLE and SSS"],["Paternity Leave","R.A. No. 8187 / CSC MC No. 71, s. 1998, as amended"],["Special Privilege Leave","Sec. 21, Rule XVI, Omnibus Rules Implementing E.O. No. 292"],["Solo Parent Leave","RA No. 8972 / CSC MC No. 8, s. 2004"],["Study Leave","Sec. 68, Rule XVI, Omnibus Rules Implementing E.O. No. 292"],["10-Day VAWC Leave","RA No. 9262 / CSC MC No. 15, s. 2005"],["Rehabilitation Privilege","Sec. 55, Rule XVI, Omnibus Rules Implementing E.O. No. 292"],["Special Leave Benefits for Women","RA No. 9710 / CSC MC No. 25, s. 2010"],["Special Emergency (Calamity) Leave","CSC MC No. 2, s. 2012, as amended"],["Adoption Leave","R.A. No. 8552"]];
const tx = (name, ph = "") => `<input type="text" name="${name}" placeholder="${ph}">`;
const rd = (name, val, label = val, text = "") => `<label class="o"><input type="radio" name="${name}" value="${val}"><span>${label}</span>${text ? tx(text) : ""}</label>`;
function buildForm() {
  $("appFs").innerHTML = `
  <div class="hd"><img src="logo.png" alt=""><div><small>Republic of the Philippines</small><b>CENTRAL BICOL STATE UNIVERSITY OF AGRICULTURE</b><small>San Jose, Pili, Camarines Sur 4418 · www.cbsua.edu.ph · Trunkline: (054) 871-5531, 871-5533</small></div><i class="csf">Civil Service Form No. 6<br>Revised 2020</i></div>
  <h2>APPLICATION FOR LEAVE</h2>
  <div class="g c12"><div><b>1. OFFICE/DEPARTMENT</b>${tx("office")}</div><div><b>2. NAME</b><div class="nm"><span>(Last)${tx("last")}</span><span>(First)${tx("first")}</span><span>(Middle)${tx("middle")}</span></div></div></div>
  <div class="g c3"><div><b>3. DATE OF FILING</b><input type="date" name="filed"></div><div><b>4. POSITION</b>${tx("position")}</div><div><b>5. SALARY</b>${tx("salary")}</div></div>
  <div class="sec">6. DETAILS OF APPLICATION</div>
  <div class="g c2">
    <div><b>6.A TYPE OF LEAVE TO BE AVAILED OF</b>${TYPES.map(([t, c]) => rd("type", t, `${t} <small>(${c})</small>`)).join("")}${rd("type", "Others", "Others:", "typeOther")}</div>
    <div><b>6.B DETAILS OF LEAVE</b>
      <div class="sub">In case of Vacation/Special Privilege Leave:</div>${rd("place", "Within the Philippines")}${rd("place", "Abroad", "Abroad (Specify)", "abroad")}
      <div class="sub">In case of Sick Leave:</div>${rd("sick", "In Hospital", "In Hospital (Specify Illness)", "hospital")}${rd("sick", "Out Patient", "Out Patient (Specify Illness)", "outpatient")}
      <div class="sub">In case of Special Leave Benefits for Women:</div><label class="o"><span>(Specify Illness)</span>${tx("women")}</label>
      <div class="sub">In case of Study Leave:</div>${rd("study", "Completion of Master's Degree")}${rd("study", "BAR/Board Examination Review")}
      <div class="sub">Other purpose:</div>${rd("other", "Monetization of Leave Credits")}${rd("other", "Terminal Leave")}
    </div>
  </div>
  <div class="g c2">
    <div><b>6.C NUMBER OF WORKING DAYS APPLIED FOR</b><input type="number" step="0.5" min="0" name="days"><b class="mt">INCLUSIVE DATES</b>${tx("dates", "e.g. December 21-23, 28-29, 2026")}</div>
    <div><b>6.D COMMUTATION</b>${rd("comm", "Not Requested")}${rd("comm", "Requested")}<div class="sig"><span id="sigName"></span><small>(Signature of Applicant)</small></div></div>
  </div>
  <div class="sec">7. DETAILS OF ACTION ON APPLICATION</div>
  <div class="g c2">
    <div><b>7.A CERTIFICATION OF LEAVE CREDITS</b><div class="ln">As of <span class="u"></span></div>
      <table class="cr"><tr><th></th><th>Vacation Leave</th><th>Sick Leave</th></tr><tr><td><i>Total Earned</i></td><td></td><td></td></tr><tr><td><i>Less this application</i></td><td></td><td></td></tr><tr><td><i>Balance</i></td><td></td><td></td></tr></table>
      <div class="off"><span class="u"></span><small>(Authorized Officer)</small></div></div>
    <div><b>7.B RECOMMENDATION</b><label class="o"><input type="radio" disabled><span>For approval</span></label><label class="o"><input type="radio" disabled><span>For disapproval due to</span><span class="u grow"></span></label><div class="blank"></div><div class="off"><span class="u"></span><small>(Authorized Officer)</small></div></div>
  </div>
  <div class="g c2">
    <div><b>7.C APPROVED FOR:</b><div class="ln"><span class="u s"></span> days with pay</div><div class="ln"><span class="u s"></span> days without pay</div><div class="ln"><span class="u s"></span> others (Specify)</div></div>
    <div><b>7.D DISAPPROVED DUE TO:</b><div class="blank"></div></div>
  </div>
  <div class="off c"><span class="u"></span><small>(Authorized Official)</small></div>`;
}
buildForm();
const appForm = () => $("appForm");
const appFlash = t => { $("appMsg").textContent = t; setTimeout(() => $("appMsg").textContent = "", 5000); };
const sig = () => { const f = appForm().elements, m = (f.middle.value || "").trim(); $("sigName").textContent = [f.first.value.trim(), m ? m[0].toUpperCase() + "." : "", f.last.value.trim()].filter(Boolean).join(" ").toUpperCase(); };
appForm().addEventListener("input", sig);
function fillForm(d) { appForm().reset(); Object.entries(d).forEach(([k, v]) => { const el = appForm().elements[k]; if (el && v != null && typeof v !== "object") el.value = v; }); sig(); }
function guessName() { // from the employee's own leave card, otherwise from the Google account name
  const c = all.find(x => (x.name || "").includes(","));
  if (c) {
    const [sur, giv] = c.name.split(",").map(t => t.trim()), w = giv.split(/\s+/); let mid = "";
    if (w.length > 1 && w[w.length - 1].replace(".", "").length === 1) mid = w.pop().replace(".", "");
    return {last: sur, first: w.join(" "), middle: mid, office: c.division || ""};
  }
  const w = (user.displayName || "").split(/\s+/).filter(Boolean);
  return {last: w.length > 1 ? w.pop() : "", first: w.join(" "), middle: "", office: ""};
}
function newApp() {
  curApp = null; $("appFs").disabled = isAdmin; $("submitApp").hidden = isAdmin;
  fillForm(isAdmin ? {} : {...guessName(), filed: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)});
  renderApps();
}
function openApp(a) { curApp = a.id; fillForm(a); $("appFs").disabled = true; $("submitApp").hidden = true; renderApps(); }
$("newApp").onclick = newApp;
$("printApp").onclick = () => window.print();
function renderApps() {
  $("appList").innerHTML = ""; $("appList").hidden = !apps.length;
  apps.forEach(a => {
    const b = document.createElement("button");
    b.className = a.id === curApp ? "on" : "";
    b.textContent = `${isAdmin ? `${a.last}, ${a.first} · ` : ""}${a.type === "Others" ? (a.typeOther || "Others") : a.type} · ${a.dates} · ${a.status || "Pending"}`;
    b.onclick = () => openApp(a); $("appList").appendChild(b);
  });
}
async function loadApps() {
  try {
    const s = isAdmin ? await appsCol.orderBy("createdAt", "desc").get() : await appsCol.where("ownerEmail", "==", user.email).get();
    apps = s.docs.map(d => ({id: d.id, ...d.data()}));
    if (!isAdmin) apps.sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0));
  } catch (e) { apps = []; appFlash("Cannot load applications: " + e.message); }
  renderApps();
}
$("submitApp").onclick = async () => {
  const d = Object.fromEntries(new FormData(appForm()));
  const need = {office: "Office/Department", last: "Last name", first: "First name", filed: "Date of filing", position: "Position", salary: "Salary", type: "Type of leave", days: "Number of working days", dates: "Inclusive dates"};
  const miss = Object.keys(need).filter(k => !String(d[k] || "").trim()).map(k => need[k]);
  if (miss.length) return appFlash("Please complete: " + miss.join(", "));
  try {
    const ref = await appsCol.add({...d, ownerEmail: user.email, ownerName: user.displayName || "", status: "Pending", createdAt: firebase.firestore.FieldValue.serverTimestamp()});
    await loadApps(); const a = apps.find(x => x.id === ref.id); if (a) openApp(a);
    appFlash("Application submitted.");
  } catch (e) { appFlash("Error: " + e.message); }
};
