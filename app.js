/* Daily Grid: a daily puzzle hub.
 * Plain JavaScript, no build step. All state lives in localStorage:
 *   games2 – the user's game list (order matters)
 *   hist   – { "YYYY-MM-DD": [gameId, ...] } games completed on each day
 *   tot    – { "YYYY-MM-DD": n } how many games were on the list that day (for weekly history)
 *   best   – longest streak seen
 */
(() => {
"use strict";

/* ---------- Data ---------- */
const CATS = [["nyt","New York Times"],["wordle","Wordle variants"],["word","Word"],["geo","Geography"],["trivia","Trivia"],["logic","Numbers & logic"],["other","Other"]];
const CAT = Object.fromEntries(CATS);
const NYT = "https://www.nytimes.com/";
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "game";

const DEFAULT_GAMES = [
  ["Wordle", NYT+"games/wordle/index.html","nyt","New York Times"],
  ["Connections", NYT+"games/connections","nyt","New York Times"],
  ["Strands", NYT+"games/strands","nyt","New York Times"],
  ["The Mini", NYT+"crosswords/game/mini","nyt","New York Times"],
  ["Spelling Bee", NYT+"puzzles/spelling-bee","nyt","New York Times"],
  ["Letter Boxed", NYT+"puzzles/letter-boxed","nyt","New York Times"],
  ["Crossword", NYT+"crosswords/game/daily","nyt","New York Times"],
  ["Sudoku", NYT+"puzzles/sudoku","nyt","New York Times"],
  ["Tiles", NYT+"puzzles/tiles","nyt","New York Times"],
  ["Pips", NYT+"games/pips","nyt","New York Times"],
  ["Sports Connections", NYT+"athletic/connections-sports-edition/","nyt","The Athletic"],
  ["Dordle","https://zaratustra.itch.io/dordle","wordle","Zaratustra"],
  ["Quordle","https://www.merriam-webster.com/games/quordle/","wordle","Merriam-Webster"],
  ["Octordle","https://www.britannica.com/games/octordle/","wordle","Britannica"],
  ["Duetle","","wordle",""],
  ["Waffle","https://wafflegame.net/daily","word","Independent"],
  ["Contexto","https://contexto.me/","word","Independent"],
  ["Dartle","","word",""],
  ["Worldle","https://worldlegame.io/","geo","Independent"],
  ["Globle","https://globle-game.com/","geo","Independent"],
  ["Krillion","https://krillion.io/","trivia","Independent"],
  ["Framed","https://framed.wtf/","trivia","Independent"],
  ["Nerdle","https://www.nerdlegame.com/","logic","Independent"],
].map(([name,url,cat,pub]) => ({ id: slug(name), name, url, cat, pub, fav: false }));

const ICON = {
  check:'<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  arrow:'<svg class="arr" viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg>',
  star:'<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
  starSmall:'<svg class="star" viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
  grip:'<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  x:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

/* ---------- Storage helpers (localStorage can throw in private mode) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem("dg:"+k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("dg:"+k, JSON.stringify(v)); } catch {} },
};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dayKey = (d = new Date()) => d.toLocaleDateString("en-CA"); // local YYYY-MM-DD
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- State ---------- */
let games = store.get("games2", null) || clone(DEFAULT_GAMES);
let hist  = store.get("hist", {});
let tot   = store.get("tot", {});
let best  = store.get("best", 0);
let filter = "all", editing = false, editId = null, today = dayKey(), weekOffset = 0, undoFn = null;

const doneSet = () => new Set(hist[today] || []);
const save = () => { store.set("games2", games); store.set("hist", hist); store.set("tot", tot); store.set("best", best); };

/* A streak is the number of consecutive days (ending today, or yesterday if
   today hasn't been started yet) with at least one game completed. */
function streak() {
  let n = 0; const d = new Date();
  if (!(hist[dayKey(d)] || []).length) d.setDate(d.getDate() - 1);
  while ((hist[dayKey(d)] || []).length) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const greeting = () => { const h = new Date().getHours(); return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const initial = n => (n.replace(/^the\s+/i, "")[0] || "?").toUpperCase();

/* ---------- Actions ---------- */
function toggle(id, row) {
  const s = doneSet(), was = s.has(id);
  was ? s.delete(id) : s.add(id);
  hist[today] = [...s]; tot[today] = games.length;
  if (!s.size) { delete hist[today]; delete tot[today]; }
  best = Math.max(best, streak()); save();
  // Update just this row so the list doesn't jump around, then refresh the header.
  row.classList.toggle("done", !was);
  row.querySelector(".ck").setAttribute("aria-checked", !was);
  renderHeader(); renderCounts();
  if (!was && s.size === games.length) toast("Every puzzle solved. See you tomorrow.");
}

function toast(msg, label, fn) {
  $("tmsg").textContent = msg; $("tact").textContent = label || ""; undoFn = fn || null;
  $("toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.remove("show"), fn ? 5000 : 2400);
}
$("tact").onclick = () => { if (undoFn) undoFn(); undoFn = null; $("toast").classList.remove("show"); };

/* ---------- Rendering ---------- */
function renderHeader() {
  const s = doneSet(), total = games.length, done = games.filter(g => s.has(g.id)).length;
  const st = streak(), b = Math.max(best, st), hi = greeting();
  $("date").textContent = new Date().toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" });
  $("best").textContent = b > 1 ? `Best run ${b} days` : "";
  $("greet").innerHTML = !total ? `${hi}.<br><em>Your page is empty.</em>`
    : done === total ? `${hi}.<br><em>All ${total} solved.</em>`
    : done ? `${hi}.<br><em>${total - done} still to play.</em>`
    : `${hi}.<br><em>${total} puzzles today.</em>`;
  $("segs").innerHTML = games.map((_, i) => `<i class="${i < done ? "on" : ""}"></i>`).join("");
  $("count").innerHTML = `<b>${done}</b> of ${total} solved`;
  $("streak").textContent = st ? `${st}-day streak` : "No streak yet";
  renderWeek();
}

/* Weekly history: Monday–Sunday, each day shows how much of that day's list was finished. */
function renderWeek() {
  const now = new Date(); now.setHours(0,0,0,0);
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
  let played = 0, solved = 0, cells = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const k = dayKey(d), n = (hist[k] || []).length, t = tot[k] || games.length || 1;
    const future = d > now, isToday = d.getTime() === now.getTime();
    if (n) { played++; solved += n; }
    const pct = Math.min(100, Math.round(n / t * 100));
    cells += `<div class="day${future ? " future" : ""}${isToday ? " today" : ""}" title="${esc(d.toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"}))}: ${n} solved">
      <span>${d.toLocaleDateString(undefined,{weekday:"narrow"})}</span>
      <div class="sq" role="img" aria-label="${n} solved"><i style="height:${pct}%"></i></div>
      <b class="num">${future ? "" : n}</b></div>`;
  }
  const sun = new Date(monday); sun.setDate(monday.getDate() + 6);
  const fmt = d => d.toLocaleDateString(undefined, { month:"short", day:"numeric" });
  $("days").innerHTML = cells;
  $("wkTitle").textContent = weekOffset === 0 ? "This week" : weekOffset === -1 ? "Last week" : "Week of";
  $("wkRange").textContent = `${fmt(monday)} – ${fmt(sun)}`;
  $("wkSum").textContent = played ? `Played ${played} of 7 days · ${solved} puzzles solved` : weekOffset ? "No puzzles that week." : "Nothing played yet this week.";
  $("wkNext").disabled = weekOffset >= 0;
}

function renderCounts() {
  const s = doneSet();
  const c = { all: games.length, todo: games.filter(g => !s.has(g.id)).length, done: games.filter(g => s.has(g.id)).length, fav: games.filter(g => g.fav).length };
  $("filters").innerHTML = [["all","All"],["todo","To do"],["done","Done"],["fav","Starred"]].map(([k,l]) =>
    `<button data-filter="${k}" aria-pressed="${k === filter}">${l}<small class="num">${c[k]}</small></button>`).join("");
  document.querySelectorAll("section[data-ids]").forEach(sec => {
    const ids = JSON.parse(sec.dataset.ids), n = ids.filter(i => s.has(i)).length;
    sec.querySelector(".sh span").textContent = `${n} of ${ids.length}`;
  });
}

function rowHTML(g, s) {
  const done = s.has(g.id), color = `--c:var(--c-${CAT[g.cat] ? g.cat : "other"})`, id = esc(g.id);
  const meta = !g.url ? `<span class="warn">Add a link in Edit</span>`
    : g.pub && g.pub !== CAT[g.cat] ? `<span>${esc(g.pub)}</span>` : "";
  if (editing) return `<li class="row" data-id="${id}" style="${color}">
    <button class="ib" data-star="${id}" aria-pressed="${g.fav}" aria-label="Star ${esc(g.name)}">${ICON.star}</button>
    <div class="mark" aria-hidden="true">${esc(initial(g.name))}</div>
    <button class="go" data-edit="${id}" style="text-align:left"><div class="nm"><b>${esc(g.name)}</b>${meta}</div></button>
    <button class="ib del" data-del="${id}" aria-label="Remove ${esc(g.name)}">${ICON.x}</button>
    <button class="handle" data-handle="${id}" aria-label="Reorder ${esc(g.name)}. Use arrow keys to move.">${ICON.grip}</button></li>`;
  const href = g.url || `https://www.google.com/search?q=${encodeURIComponent(g.name + " daily game")}`;
  return `<li class="row${done ? " done" : ""}" data-id="${id}" style="${color}">
    <button class="ck" role="checkbox" aria-checked="${done}" data-ck="${id}" aria-label="${esc(g.name)} solved"><span class="box">${ICON.check}</span></button>
    <div class="mark" aria-hidden="true">${esc(initial(g.name))}</div>
    <a class="go" href="${esc(href)}" target="_blank" rel="noopener"><div class="nm"><b>${esc(g.name)}${g.fav ? ICON.starSmall : ""}</b>${meta}</div>${ICON.arrow}</a></li>`;
}

function render() {
  renderHeader();
  const s = doneSet(), q = $("q").value.trim().toLowerCase();
  const matches = g => (!q || (g.name + " " + (g.pub || "")).toLowerCase().includes(q)) &&
    (editing || filter === "all" || (filter === "todo" && !s.has(g.id)) || (filter === "done" && s.has(g.id)) || (filter === "fav" && g.fav));
  const catOf = g => CAT[g.cat] ? g.cat : "other";

  const groups = [];
  const favs = games.filter(g => g.fav && matches(g));
  if (!editing && favs.length && filter !== "fav") groups.push(["fav", "Starred", favs]);
  for (const [k, label] of CATS) {
    const gs = games.filter(g => catOf(g) === k && matches(g) && (editing || filter === "fav" || !g.fav));
    if (gs.length) groups.push([k, label, gs]);
  }

  $("list").innerHTML = groups.length ? groups.map(([k, label, gs]) => `
    <section data-ids='${esc(JSON.stringify(gs.map(g => g.id)))}'>
      <div class="sh" style="--c:${k === "fav" ? "var(--accent)" : `var(--c-${k})`}"><i class="tick"></i><h2>${esc(label)}</h2><span class="num"></span></div>
      <ul>${gs.map(g => rowHTML(g, s)).join("")}</ul>
    </section>`).join("")
    : `<div class="empty"><p>${q ? "Nothing by that name." : filter === "done" ? "Nothing solved yet." : filter === "fav" ? "No starred games." : filter === "todo" ? "You’re all caught up." : "No games yet."}</p>${
        q ? "Try another search, or add it with +." : filter === "fav" ? "Tap Edit, then the star beside a game." : filter === "todo" ? "Come back tomorrow for a fresh page." : ""}</div>`;
  renderCounts();
  $("editnote").hidden = $("dz").hidden = !editing;
}

/* ---------- Drag to reorder (edit mode) ----------
   Pointer events cover mouse, touch and pen. While dragging, the row is moved
   in the DOM as the pointer crosses a neighbour's midpoint; on release the new
   order is written back into `games`. Rows only reorder within their section. */
function commitOrder(ul) {
  const ids = [...ul.children].map(li => li.dataset.id);
  const slots = games.map((g, i) => ids.includes(g.id) ? i : -1).filter(i => i >= 0);
  const byId = Object.fromEntries(games.map(g => [g.id, g]));
  slots.forEach((slot, k) => { games[slot] = byId[ids[k]]; });
  save();
}
function startDrag(e, handle) {
  const li = handle.closest("li"), ul = li.parentElement;
  e.preventDefault();
  li.classList.add("dragging"); document.body.classList.add("is-dragging");
  let raf = 0, lastY = e.clientY;
  const step = () => {
    const before = [...ul.children].find(s => s !== li && lastY < s.getBoundingClientRect().top + s.offsetHeight / 2) || null;
    if (before !== li.nextElementSibling && before !== li) ul.insertBefore(li, before);
    if (lastY < 90) scrollBy(0, -10); else if (lastY > innerHeight - 130) scrollBy(0, 10);
    raf = requestAnimationFrame(step);
  };
  const move = ev => { lastY = ev.clientY; };
  const end = () => {
    cancelAnimationFrame(raf);
    removeEventListener("pointermove", move); removeEventListener("pointerup", end); removeEventListener("pointercancel", end);
    li.classList.remove("dragging"); document.body.classList.remove("is-dragging");
    commitOrder(ul);
  };
  addEventListener("pointermove", move); addEventListener("pointerup", end); addEventListener("pointercancel", end);
  raf = requestAnimationFrame(step);
}
$("list").addEventListener("pointerdown", e => {
  const h = e.target.closest("[data-handle]");
  if (h && (e.button === 0 || e.pointerType !== "mouse")) startDrag(e, h);
});
// Keyboard reordering for accessibility: focus a handle and press ↑ / ↓.
$("list").addEventListener("keydown", e => {
  const h = e.target.closest("[data-handle]");
  if (!h || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
  e.preventDefault();
  const li = h.closest("li"), ul = li.parentElement;
  if (e.key === "ArrowUp" && li.previousElementSibling) ul.insertBefore(li, li.previousElementSibling);
  if (e.key === "ArrowDown" && li.nextElementSibling) ul.insertBefore(li.nextElementSibling, li);
  commitOrder(ul); h.focus();
});

/* ---------- Add / edit sheet ---------- */
function openSheet(g) {
  editId = g ? g.id : null;
  $("dlgTitle").textContent = g ? "Edit game" : "Add a game"; $("err").textContent = "";
  $("fName").value = g?.name || ""; $("fUrl").value = g?.url || ""; $("fPub").value = g?.pub || ""; $("fCat").value = g?.cat || "other";
  try { $("dlg").showModal(); } catch { $("dlg").setAttribute("open", ""); }
  setTimeout(() => (g && !g.url ? $("fUrl") : $("fName")).focus(), 30);
}
$("fCat").innerHTML = CATS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
$("cancel").onclick = () => $("dlg").close();
$("dlg").addEventListener("click", e => { if (e.target === $("dlg")) $("dlg").close(); });
$("form").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("fName").value.trim(), pub = $("fPub").value.trim(), cat = $("fCat").value;
  let url = $("fUrl").value.trim();
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  if (!name) { $("err").textContent = "Give the game a name."; return; }
  try { new URL(url); } catch { $("err").textContent = "Paste the game’s web address."; return; }
  if (editId) Object.assign(games.find(g => g.id === editId), { name, url, pub, cat });
  else {
    let id = slug(name), n = 2;
    while (games.some(g => g.id === id)) id = slug(name) + "-" + n++;
    games.push({ id, name, url, pub, cat, fav: false });
  }
  save(); $("dlg").close(); render(); toast(editId ? "Saved" : `Added ${name}`);
});

/* ---------- Event wiring ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return; const d = t.dataset;
  if (d.ck) toggle(d.ck, t.closest(".row"));
  else if (d.filter) { filter = d.filter; render(); }
  else if (d.star) { const g = games.find(x => x.id === d.star); g.fav = !g.fav; t.setAttribute("aria-pressed", g.fav); save(); renderCounts(); }
  else if (d.edit) openSheet(games.find(x => x.id === d.edit));
  else if (d.del) {
    const i = games.findIndex(x => x.id === d.del), g = games[i];
    games.splice(i, 1); save(); render();
    toast(`Removed ${g.name}`, "Undo", () => { games.splice(i, 0, g); save(); render(); });
  }
});
$("q").addEventListener("input", render);
$("addBtn").onclick = () => openSheet(null);
$("editBtn").onclick = () => {
  editing = !editing;
  $("editBtn").setAttribute("aria-pressed", editing); $("editBtn").textContent = editing ? "Done" : "Edit";
  render();
};
$("wkPrev").onclick = () => { weekOffset--; renderWeek(); };
$("wkNext").onclick = () => { if (weekOffset < 0) { weekOffset++; renderWeek(); } };
$("share").onclick = async () => {
  const s = doneSet(), done = games.filter(g => s.has(g.id)).length, st = streak();
  const text = `Daily Grid · ${new Date().toLocaleDateString(undefined,{month:"short",day:"numeric"})}\n${games.map(g => s.has(g.id) ? "■" : "□").join("")}\n${done}/${games.length} solved${st ? ` · ${st}-day streak` : ""}`;
  try { await navigator.clipboard.writeText(text); toast("Results copied"); } catch { toast("Couldn’t copy in this view"); }
};
$("resetDay").onclick = () => {
  const prev = hist[today], prevT = tot[today];
  delete hist[today]; delete tot[today]; save(); render();
  toast("Today cleared", "Undo", () => { if (prev) { hist[today] = prev; tot[today] = prevT; } save(); render(); });
};
$("resetAll").onclick = () => {
  const prev = games; games = clone(DEFAULT_GAMES); save(); render();
  toast("Defaults restored", "Undo", () => { games = prev; save(); render(); });
};

// Start a fresh day at midnight, or when the app is reopened on a new day.
const rollover = () => { const k = dayKey(); if (k !== today) { today = k; render(); } };
setInterval(rollover, 60000);
document.addEventListener("visibilitychange", rollover);

// Offline support when served over HTTPS (e.g. GitHub Pages).
if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

render();
})();
