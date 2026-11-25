(() => {
const { h, ic, btn, gh, act, toast, ago, dur, S, SET, cur, icons, deploy, setupAuto, render, picker, match, repos, VIEWS, loading } = window.DP;
const empty = (root) => root.append(h("div", { class: "fe-empty" }, "Choisis un projet."));
const link = (href, label, icon = "external-link") => h("a", { class: "fe-btn", href, target: "_blank", rel: "noopener" }, ic(icon), label);
const days = (n) => [...Array(n)].map((_, i) => new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10));
const dl = (k) => k.slice(8) + "/" + k.slice(5, 7);
const perDay = (arr, key, ds, f = () => true) => ds.map((d) => arr.filter((x) => f(x) && x[key].slice(0, 10) === d).length);
const secs = (r) => Math.round((new Date(r.updated_at) - new Date(r.run_started_at)) / 1000);
const pagesUrl = async (repo) => (await gh(`/repos/${repo}/pages`).catch(() => null))?.html_url;

function chart({ type = "bar", labels, series, height = 150 }) {
  const W = 640, H = height, pl = 30, pb = 20, pt = 8, pr = 6, n = labels.length, iw = W - pl - pr, ih = H - pt - pb, bw = iw / n;
  const tot = labels.map((_, i) => (type === "bar" ? series.reduce((a, s) => a + s.data[i], 0) : Math.max(...series.map((s) => s.data[i]))));
  const max = Math.max(1, ...tot);
  let g = "";
  for (let k = 0; k <= 3; k++) { const y = pt + ih - (ih * k) / 3; g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="#e6e9ed"/><text x="${pl - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="#7a7a7a">${Math.round((max * k) / 3)}</text>`; }
  if (type === "bar") labels.forEach((l, i) => { let acc = 0; series.forEach((s) => { const v = s.data[i]; if (!v) return; const hh = (ih * v) / max; acc += hh; g += `<rect x="${pl + i * bw + bw * 0.15}" y="${pt + ih - acc}" width="${bw * 0.7}" height="${hh}" rx="2" fill="${s.color}"><title>${l} · ${s.name} : ${v}</title></rect>`; }); });
  else series.forEach((s) => { g += `<polyline fill="none" stroke="${s.color}" stroke-width="1.6" points="${s.data.map((v, i) => `${pl + bw * i + bw / 2},${pt + ih - (ih * v) / max}`).join(" ")}"/>` + s.data.map((v, i) => `<circle cx="${pl + bw * i + bw / 2}" cy="${pt + ih - (ih * v) / max}" r="2.3" fill="${s.color}"><title>${labels[i]} · ${s.name} : ${v}</title></circle>`).join(""); });
  labels.forEach((l, i) => { if (i % Math.ceil(n / 7) === 0) g += `<text x="${pl + bw * i + bw / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#7a7a7a">${l}</text>`; });
  const el = h("div", { class: "fe-chart" });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${g}</svg><div class="fe-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("")}</div>`;
  return el;
}
const panel = (title, ...c) => h("div", { class: "fe-card" }, h("b", {}, title), ...c);
const stat = (k, v) => h("div", { class: "fe-stat" }, h("b", {}, String(v)), h("span", { class: "fe-meta" }, k));

/* ---- Aperçu ---- */
async function vOverview(root) {
  const repo = cur(), m = await gh(`/repos/${repo}`);
  const [d, commits, url] = await Promise.all([gh(`/repos/${repo}/actions/runs?per_page=100`), gh(`/repos/${repo}/commits?per_page=100`).catch(() => []), pagesUrl(repo)]);
  const runs = d.workflow_runs, done = runs.filter((r) => r.status === "completed"), ok = done.filter((r) => r.conclusion === "success"), last = runs[0], ds = days(14);
  root.append(h("div", { class: "fe-stats" }, stat("Déploiements", d.total_count), stat("Taux de réussite", done.length ? Math.round((ok.length / done.length) * 100) + " %" : "—"),
    stat("Durée moyenne", ok.length ? Math.round(ok.reduce((a, r) => a + secs(r), 0) / ok.length) + " s" : "—"), stat("Dernier déploiement", last ? ago(last.created_at) : "—")));
  const status = h("span", { class: "fe-meta" }, "Non vérifié");
  root.append(h("div", { class: "fe-grid" },
    panel("Production", url ? h("a", { href: url, target: "_blank", rel: "noopener" }, url) : h("span", { class: "fe-meta" }, "Pas encore déployé : utilise « Déploiement auto »."),
      url && h("div", { class: "fe-thumb" }, h("iframe", { src: url, loading: "lazy", sandbox: "", tabindex: "-1", title: "Aperçu" })),
      url && h("div", { class: "fe-bar", style: "margin:0" }, btn("Vérifier la disponibilité", "activity", async () => {
        status.textContent = "Test…"; const t = performance.now();
        try { await fetch(url, { mode: "no-cors", cache: "no-store" }); status.textContent = `En ligne · ${Math.round(performance.now() - t)} ms`; } catch (e) { status.textContent = "Injoignable"; }
      }), status)),
    panel("Dernier déploiement", last ? h("div", { class: "fe-main" }, h("div", { class: "fe-row", style: "padding:0;border:0" }, h("span", { class: "fe-dot " + (last.status !== "completed" ? "run" : last.conclusion === "success" ? "ok" : "fail") }), h("b", {}, last.display_title)),
      h("span", { class: "fe-meta" }, `${last.head_branch} · ${last.head_sha.slice(0, 7)} · ${last.status === "completed" ? last.conclusion : "en cours"} · ${ago(last.created_at)}`)) : h("span", { class: "fe-meta" }, "Aucun run"),
      h("span", { class: "fe-meta" }, `${m.default_branch} · ${m.private ? "privé" : "public"} · ${m.open_issues_count} issue(s)/PR ouverte(s)`))));
  root.append(panel("Déploiements par jour (14 j)", chart({ labels: ds.map(dl), series: [{ name: "Réussis", color: "#2e9e5b", data: perDay(runs, "created_at", ds, (r) => r.conclusion === "success") }, { name: "Échecs", color: "#d64545", data: perDay(runs, "created_at", ds, (r) => r.conclusion === "failure") }] })));
  const ls = ok.slice(0, 20).reverse();
  if (ls.length) root.append(panel("Durée des builds (secondes)", chart({ type: "line", labels: ls.map((r) => r.head_sha.slice(0, 5)), series: [{ name: "Durée", color: "#111", data: ls.map(secs) }] })));
  root.append(panel("Commits par jour (14 j)", chart({ labels: ds.map(dl), series: [{ name: "Commits", color: "#111", data: perDay(commits.map((c) => ({ t: c.commit.author.date })), "t", ds) }] })));
}

/* ---- Previews par PR ---- */
async function vPreviews(root) {
  root.append(h("div", { class: "fe-bar" }, await picker(() => render(S.cur))));
  const repo = cur(); if (!repo) return empty(root);
  const m = await gh(`/repos/${repo}`);
  let ready = false;
  try { ready = atob((await gh(`/repos/${repo}/contents/.github/workflows/deploy.yml`)).content.replace(/\n/g, "")).includes("pr-preview"); } catch (e) { /* absent */ }
  if (!ready) return root.append(panel("Previews par pull request", h("span", { class: "fe-meta" }, "Chaque PR obtient sa propre URL de test, supprimée automatiquement à la fermeture. Il faut installer le workflow (déploiement auto + previews)."),
    btn("Activer les previews", "git-pull-request", () => act(async () => { const L = loading("Activation des previews"); try { await setupAuto(repo, L); } finally { L.close(); } render(S.cur); }), "primary")));
  const base = ((await pagesUrl(repo)) || `https://${m.owner.login}.github.io/${m.name}/`).replace(/\/$/, "");
  const [prs, dirs, brs] = await Promise.all([gh(`/repos/${repo}/pulls?state=open&per_page=30`), gh(`/repos/${repo}/contents/pr-preview?ref=gh-pages`).catch(() => []), gh(`/repos/${repo}/branches?per_page=100`)]);
  const up = new Set(dirs.map((x) => x.name));
  const sel = h("select", { class: "fe-select" }, brs.filter((b) => ![m.default_branch, "gh-pages"].includes(b.name)).map((b) => h("option", { value: b.name }, b.name)));
  const title = h("input", { class: "fe-input", placeholder: "Titre de la pull request" });
  root.append(panel("Nouvelle preview", h("span", { class: "fe-meta" }, "Choisis une branche (avec au moins un commit d'avance) : une PR est créée et un build de preview démarre."),
    h("div", { class: "fe-bar", style: "margin:0" }, sel, title, btn("Créer la PR", "git-pull-request", () => act(async () => {
      if (!sel.value) throw new Error("Aucune branche à prévisualiser : crée-en une sur GitHub.");
      await gh(`/repos/${repo}/pulls`, { method: "POST", body: { title: title.value || "Preview " + sel.value, head: sel.value, base: m.default_branch } }); render(S.cur);
    }, "PR créée : la preview se construit"), "primary"))));
  const rows = prs.filter((p) => match(p.title, p.head.ref)).map((p) => {
    const u = `${base}/pr-preview/pr-${p.number}/`, built = up.has("pr-" + p.number);
    return h("div", { class: "fe-row" }, h("span", { class: "fe-dot " + (built ? "ok" : "run") }),
      h("div", { class: "fe-main" }, h("b", {}, `#${p.number} ${p.title}`), h("span", { class: "fe-meta" }, `${p.head.ref} → ${m.default_branch} · ${p.user.login} · ${ago(p.updated_at)} · ${built ? "preview prête" : "build en cours…"}`)),
      built && link(u, "Visiter"), built && btn("Copier", "copy", () => navigator.clipboard.writeText(u).then(() => toast("URL copiée"))),
      btn("Fusionner", "git-merge", () => confirm(`Fusionner #${p.number} et déployer en production ?`) && act(async () => { await gh(`/repos/${repo}/pulls/${p.number}/merge`, { method: "PUT", body: { merge_method: "squash" } }); render(S.cur); }, "Fusionnée : déploiement en production")),
      btn("Fermer", "x", () => act(async () => { await gh(`/repos/${repo}/pulls/${p.number}`, { method: "PATCH", body: { state: "closed" } }); render(S.cur); }, "PR fermée : preview supprimée")));
  });
  root.append(h("div", { class: "fe-list" }, rows.length ? rows : h("div", { class: "fe-empty" }, "Aucune pull request ouverte.")));
  if (prs.some((p) => !up.has("pr-" + p.number))) S.timer = setTimeout(() => render(S.cur), 12000);
}

/* ---- Logs (journal du projet) ---- */
async function vLogs(root) {
  const repo = cur(); if (!repo) return empty(root);
  const [runs, commits, prs] = await Promise.all([gh(`/repos/${repo}/actions/runs?per_page=50`), gh(`/repos/${repo}/commits?per_page=30`).catch(() => []), gh(`/repos/${repo}/pulls?state=all&per_page=20&sort=updated`)]);
  const ev = [...runs.workflow_runs.map((r) => ({ t: r.updated_at, k: "DEPLOY", lvl: r.conclusion === "failure" ? "error" : r.status !== "completed" ? "warn" : "ok", m: `${r.name} · ${r.head_branch} · ${r.head_sha.slice(0, 7)} · ${r.status === "completed" ? r.conclusion + " (" + dur(r.run_started_at, r.updated_at) + ")" : "en cours"}` })),
    ...commits.map((c) => ({ t: c.commit.author.date, k: "COMMIT", lvl: "info", m: `${c.sha.slice(0, 7)} ${c.commit.message.split("\n")[0]} — ${c.commit.author.name}` })),
    ...prs.map((p) => ({ t: p.merged_at || p.closed_at || p.created_at, k: "PR", lvl: "info", m: `#${p.number} ${p.merged_at ? "fusionnée" : p.state === "open" ? "ouverte" : "fermée"} · ${p.title}` }))].sort((a, b) => new Date(b.t) - new Date(a.t));
  const con = h("div", { class: "fe-console" });
  const f = h("select", { class: "fe-select", onchange: draw }, ["Tout", "Erreurs", "Déploiements", "Commits", "PR"].map((x) => h("option", {}, x)));
  let shown = [];
  function draw() {
    shown = ev.filter((e) => ({ Tout: 1, Erreurs: e.lvl === "error", Déploiements: e.k === "DEPLOY", Commits: e.k === "COMMIT", PR: e.k === "PR" })[f.value] && match(e.m));
    con.replaceChildren(...shown.map((e) => h("div", { class: "ln " + e.lvl }, h("span", {}, new Date(e.t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" })), h("b", {}, e.k), h("span", {}, e.m))));
    if (!shown.length) con.append(h("div", { class: "ln" }, "Aucun événement."));
  }
  root.append(h("div", { class: "fe-bar" }, f, btn("Copier", "copy", () => navigator.clipboard.writeText(shown.map((e) => `${e.t} ${e.k} ${e.m}`).join("\n")).then(() => toast("Logs copiés"))), btn("Actualiser", "refresh-cw", () => render(S.cur))), con);
  draw();
}

/* ---- Fichiers (édition + commit = déploiement) ---- */
async function vFiles(root) {
  const repo = cur(); if (!repo) return empty(root);
  const m = await gh(`/repos/${repo}`), path = S.path || "", up = () => { S.path = path.split("/").slice(0, -1).join("/"); render(S.cur); };
  const data = await gh(`/repos/${repo}/contents/${path}?ref=${m.default_branch}`);
  const crumbs = h("div", { class: "fe-bar" }, btn("Racine", "home", () => { S.path = ""; render(S.cur); }), path && btn("Dossier parent", "corner-left-up", up), h("span", { class: "fe-meta" }, "/" + path));
  if (!Array.isArray(data)) {
    if (data.size > 200000 || /\.(png|jpe?g|gif|webp|ico|woff2?|pdf|zip)$/i.test(data.name)) return root.append(crumbs, panel(data.name, h("span", { class: "fe-meta" }, "Fichier binaire ou trop gros pour l'éditeur."), link(data.html_url, "Voir sur GitHub")));
    const ta = h("textarea", { class: "fe-editor", spellcheck: "false" }); ta.value = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ""))));
    const msg = h("input", { class: "fe-input", value: "Update " + data.name, style: "flex:1" });
    return root.append(crumbs, ta, h("div", { class: "fe-bar" }, msg, btn("Commit et déployer", "git-commit-horizontal", () => act(async () => {
      await gh(`/repos/${repo}/contents/${path}`, { method: "PUT", body: { message: msg.value, content: btoa(unescape(encodeURIComponent(ta.value))), sha: data.sha, branch: m.default_branch } });
      if (S.proj) { S.proj.tab = "Déploiements"; render(S.cur); }
    }, "Commit créé : déploiement en cours"), "primary")));
  }
  const items = [...data].sort((a, b) => (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1) || a.name.localeCompare(b.name)).filter((x) => match(x.name));
  root.append(crumbs, h("div", { class: "fe-bar", style: "margin-top:0" }, btn("Nouveau fichier", "file-plus", () => { const n = prompt("Nom du fichier (ex. about.html)"); if (n) act(async () => { await gh(`/repos/${repo}/contents/${path ? path + "/" : ""}${n}`, { method: "PUT", body: { message: "Add " + n, content: btoa("\n"), branch: m.default_branch } }); render(S.cur); }, "Fichier créé"); })),
    h("div", { class: "fe-list" }, items.map((x) => h("div", { class: "fe-row fe-click", onclick: () => { S.path = x.path; render(S.cur); } }, ic(x.type === "dir" ? "folder" : "file-text"), h("div", { class: "fe-main" }, h("b", {}, x.name)), h("span", { class: "fe-meta" }, x.type === "dir" ? "" : x.size + " o")))));
}

/* ---- Analytics ---- */
async function vAnalytics(root) {
  root.append(h("div", { class: "fe-bar" }, await picker(() => render(S.cur))));
  const repo = cur(); if (!repo) return empty(root);
  try {
    const [v, c, ref, pth] = await Promise.all([gh(`/repos/${repo}/traffic/views`), gh(`/repos/${repo}/traffic/clones`), gh(`/repos/${repo}/traffic/popular/referrers`), gh(`/repos/${repo}/traffic/popular/paths`)]);
    const ds = days(14), by = (a, k) => ds.map((d) => a.find((x) => x.timestamp.slice(0, 10) === d)?.[k] || 0);
    root.append(h("div", { class: "fe-stats" }, stat("Vues (14 j)", v.count), stat("Visiteurs uniques", v.uniques), stat("Clones", c.count)),
      panel("Trafic de la page du dépôt", chart({ type: "line", labels: ds.map(dl), series: [{ name: "Vues", color: "#111", data: by(v.views, "count") }, { name: "Visiteurs", color: "#7C9BC0", data: by(v.views, "uniques") }] })),
      panel("Clones", chart({ labels: ds.map(dl), series: [{ name: "Clones", color: "#111", data: by(c.clones, "count") }] })),
      h("div", { class: "fe-grid" }, panel("Sources", ...ref.map((x) => h("div", { class: "fe-meta" }, `${x.referrer} — ${x.count} vues`)), !ref.length && h("span", { class: "fe-meta" }, "Aucune donnée")),
        panel("Pages populaires", ...pth.map((x) => h("div", { class: "fe-meta" }, `${x.path} — ${x.count}`)), !pth.length && h("span", { class: "fe-meta" }, "Aucune donnée"))));
  } catch (e) { root.append(panel("Trafic indisponible", h("span", { class: "fe-meta" }, e.message + " (les stats de trafic demandent les droits d'écriture sur le dépôt)."))); }
}

/* ---- Dashboard dédié d'un projet ---- */
const T = { "Aperçu": ["layout-dashboard", vOverview], "Déploiements": ["rocket", VIEWS["Déploiements"]], "Previews": ["git-pull-request", vPreviews], "Logs": ["terminal", vLogs], "Fichiers": ["folder-open", vFiles], "Domaines": ["link-2", VIEWS["Domaines"]], "Variables": ["braces", VIEWS["Variables"]], "Analytics": ["bar-chart-3", vAnalytics] };
async function vProject(root) {
  const { repo, tab } = S.proj; SET("fe_repo", repo);
  const m = await gh(`/repos/${repo}`), url = m.has_pages ? await pagesUrl(repo) : null;
  const head = h("div", { class: "fe-head" }, btn("", "arrow-left", () => { S.proj = null; S.path = ""; render(S.cur); }),
    h("div", { class: "fe-main" }, h("b", { class: "fe-title" }, m.name), h("span", { class: "fe-meta" }, `${m.owner.login} · ${m.private ? "privé" : "public"} · ${m.default_branch}`)),
    btn("Déployer", "rocket", () => act(async () => { await deploy(repo, m.default_branch); S.proj.tab = "Déploiements"; render(S.cur); }), "primary"),
    btn("Déploiement auto", "git-branch", () => confirm("Installer le workflow (déploiement à chaque push + previews par PR) ?") && act(async () => { const L = loading("Configuration de " + m.name); try { await setupAuto(repo, L); } finally { L.close(); } S.repos = null; render(S.cur); }, "Déploiement auto et previews activés")),
    url && link(url, "Visiter"), link(m.html_url, "GitHub"));
  const tabs = h("div", { class: "fe-tabs" }, Object.entries(T).map(([t, [i]]) => h("button", { type: "button", class: "fe-tab" + (t === tab ? " active" : ""), onclick: () => { S.proj.tab = t; S.path = ""; render(S.cur); } }, ic(i), t)));
  const box = h("div", { class: "fe-tabbox" });
  root.append(head, tabs, box);
  S.embed = true; const p = T[tab][1](box); S.embed = false; await p;
  icons();
}

const base = VIEWS["Projets"];
VIEWS["Projets"] = (box) => { box.parentElement.classList.toggle("in-project", !!S.proj); return S.proj ? vProject(box) : base(box); };
VIEWS["Environnements"] = vPreviews;
VIEWS["Analytics"] = vAnalytics;
})();
