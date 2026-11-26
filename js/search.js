/* Recherche globale du header (touche « / » pour la focaliser). Complète le filtre de page déjà présent dans app.js. */
(() => {
const D = window.DP, bar = document.getElementById("searchbar"), input = bar.querySelector(".search-input");
const pop = D.h("div", { class: "cf-sres", role: "listbox", hidden: true }); document.body.appendChild(pop);
const cache = { repo: null, runs: [], files: [] };
let rows = [], sel = 0, projects = [];

async function load() {
  const repo = D.cur?.(); if (!(D.LS("fe_token") || D.S.proxy)) return;
  if (!projects.length) D.repos().then((r) => { projects = r; draw(); }).catch(() => {});
  if (!repo || cache.repo === repo) return;
  cache.repo = repo; cache.runs = []; cache.files = [];
  D.gh(`/repos/${repo}/actions/runs?per_page=30`).then((d) => { cache.runs = d.workflow_runs; draw(); }).catch(() => {});
  D.gh(`/repos/${repo}`).then((m) => D.gh(`/repos/${repo}/git/trees/${m.default_branch}?recursive=1`)).then((t) => { cache.files = t.tree.filter((x) => x.type === "blob"); draw(); }).catch(() => {});
}
const pages = () => [...document.querySelectorAll(".nav-item span")].map((s) => s.textContent.trim());

function build(q) {
  const f = (s) => s.toLowerCase().includes(q), out = [];
  const add = (group, list) => list.length && out.push({ group }, ...list.slice(0, 5));
  add("Pages", pages().filter(f).map((t) => ({ t, i: "corner-down-right", run: () => D.go(t) })));
  add("Projets", projects.filter((r) => f(r.full_name)).map((r) => ({ t: r.full_name, i: "folder-git-2", run: () => D.setProject(r.full_name) })));
  add("Déploiements", cache.runs.filter((r) => f(r.display_title + " " + r.head_sha + " " + r.head_branch)).map((r) => ({ t: r.display_title, s: r.head_sha.slice(0, 7), i: "rocket", run: () => window.open(r.html_url, "_blank", "noopener") })));
  add("Fichiers", cache.files.filter((x) => f(x.path)).map((x) => ({ t: x.path, i: "file", run: () => { D.S.path = x.path; D.go("Fichiers"); D.S.cur && D.render(D.S.cur); } })));
  return out;
}
function draw() {
  const q = input.value.trim().toLowerCase();
  if (!q || document.activeElement !== input) return (pop.hidden = true);
  const out = build(q); rows = out.filter((x) => !x.group); sel = Math.min(sel, Math.max(0, rows.length - 1));
  const r = bar.getBoundingClientRect(); Object.assign(pop.style, { top: r.bottom + 6 + "px", left: Math.max(8, r.right - 420) + "px" });
  pop.replaceChildren(...(rows.length ? out.map((x) => x.group ? D.h("div", { class: "cf-sgroup" }, x.group) : D.h("button", { type: "button", role: "option", class: "cf-sitem" + (x === rows[sel] ? " on" : ""), onmousedown: (e) => { e.preventDefault(); pick(x); } }, D.ic(x.i), D.h("span", {}, x.t), x.s && D.h("code", {}, x.s))) : [D.h("div", { class: "cf-sempty" }, "Aucun résultat pour « " + input.value.trim() + " »")]));
  pop.hidden = false; D.icons();
}
function pick(x) { pop.hidden = true; input.blur(); x.run(); }

input.addEventListener("focus", () => { load(); draw(); });
input.addEventListener("input", () => { sel = 0; draw(); });
input.addEventListener("blur", () => setTimeout(() => (pop.hidden = true), 120));
input.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { input.value = ""; D.S.q = ""; pop.hidden = true; input.blur(); D.S.cur && D.render(D.S.cur); }
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % Math.max(1, rows.length); draw(); pop.querySelector(".on")?.scrollIntoView({ block: "nearest" }); }
  else if (e.key === "Enter" && rows[sel]) pick(rows[sel]);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); bar.click(); }
});
window.addEventListener("resize", () => (pop.hidden = true));
})();
