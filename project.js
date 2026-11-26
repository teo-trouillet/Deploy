(() => {
const { h, ic, btn, gh, act, toast, ago, dur, S, SET, cur, icons, deploy, setupAuto, render, go, picker, match, repos, VIEWS, loading } = window.DP;
const empty = (root) => root.append(h("div", { class: "fe-empty" }, "Choisis un projet."));
const link = (href, label, icon = "external-link") => h("a", { class: "fe-btn", href, target: "_blank", rel: "noopener" }, ic(icon), label);
const days = (n) => [...Array(n)].map((_, i) => new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10));
const dl = (k) => k.slice(8) + "/" + k.slice(5, 7);
const perDay = (arr, key, ds, f = () => true) => ds.map((d) => arr.filter((x) => f(x) && x[key].slice(0, 10) === d).length);
const secs = (r) => Math.round((new Date(r.updated_at) - new Date(r.run_started_at)) / 1000);
const pagesUrl = async (repo) => (await gh(`/repos/${repo}/pages`).catch(() => null))?.html_url;

function chart({ type = "bar", labels, series, height = 170 }) {
  const W = 1100, H = height, pl = 30, pb = 20, pt = 8, pr = 6, n = labels.length, iw = W - pl - pr, ih = H - pt - pb, bw = iw / n;
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
  const [d, commits, url, brs, wf] = await Promise.all([gh(`/repos/${repo}/actions/runs?per_page=100`), gh(`/repos/${repo}/commits?per_page=100`).catch(() => []), pagesUrl(repo), gh(`/repos/${repo}/branches?per_page=30`).catch(() => []), gh(`/repos/${repo}/contents/.github/workflows/deploy.yml`).catch(() => null)]);
  const runs = d.workflow_runs, done = runs.filter((r) => r.status === "completed"), ok = done.filter((r) => r.conclusion === "success"), last = runs[0], ds = days(14);
  const r14 = runs.filter((r) => Date.now() - new Date(r.created_at) < 14 * 864e5), f14 = r14.filter((r) => r.conclusion === "failure").length;
  const kv = (k, ...v) => h("div", { class: "fe-kvb" }, h("span", { class: "fe-meta" }, k), h("div", {}, ...v));
  const host = url ? url.replace(/^https?:\/\//, "").replace(/\/$/, "") : "Pas encore déployé";
  root.append(h("div", { class: "fe-card fe-prod" },
    h("div", { class: "fe-prodhead" }, h("b", {}, "Déploiement de production"), h("div", { class: "fe-acts" }, link(m.html_url, "GitHub"), btn("Rollback instantané", "undo-2", () => go("Déploiements")), url && link(url, "Visiter"))),
    h("div", { class: "fe-prodbody" }, h("div", { class: "fe-thumb" }, url && h("iframe", { src: url, loading: "lazy", sandbox: "", tabindex: "-1", title: "Aperçu" })),
      h("div", { class: "fe-details" }, kv("Déploiement", host), kv("Domaines", url ? h("a", { href: url, target: "_blank", rel: "noopener" }, host) : "—"),
        h("div", { class: "fe-two" }, kv("Statut", h("span", { class: "fe-scell" }, h("span", { class: "fe-dot " + (!last ? "" : last.status !== "completed" ? "run" : last.conclusion === "success" ? "ok" : "fail") }), last ? (last.status === "completed" ? (last.conclusion === "success" ? "Prêt" : last.conclusion) : "En cours") : "—")), kv("Créé", last ? ago(last.created_at) : "—")),
        kv("Source", h("div", { class: "fe-mono" }, m.default_branch), h("div", { class: "fe-meta" }, last ? `${last.head_sha.slice(0, 7)} ${last.display_title}` : "—")))),
    h("div", { class: "fe-prodfoot" }, h("span", { class: "fe-meta" }, `Pour mettre à jour la production, pousse sur la branche ${m.default_branch}.`), btn("Déploiements", "list-filter", () => go("Déploiements")))));
  const reco = [["Connecter un dépôt Git", true], ["Ajouter un domaine personnalisé", !!url && !/github\.io/.test(url)], ["Déploiement de preview", !!wf && atob(wf.content.replace(/\n/g, "")).includes("pr-preview")], ["Voir le trafic", false]];
  root.append(h("div", { class: "fe-grid3" },
    panel(`Recommandations ${reco.filter((x) => x[1]).length}/${reco.length}`, ...reco.map(([t, v]) => h("div", { class: "fe-reco" + (v ? " done" : "") }, ic(v ? "check" : "circle"), t))),
    panel("Observabilité · 14 j", stat("Déploiements", r14.length), stat("Échecs", f14), stat("Taux d'erreur", r14.length ? Math.round((f14 / r14.length) * 100) + " %" : "0 %")),
    panel("Analytics", h("span", { class: "fe-meta" }, "Trafic, pages populaires et clones de ton dépôt."), btn("Voir Analytics", "bar-chart-3", () => go("Analytics")))));
  root.append(h("div", { class: "fe-sec" }, "Branches actives"), h("div", { class: "fe-list" }, brs.map((b) => h("div", { class: "fe-row" }, ic("git-branch"), h("div", { class: "fe-main" }, h("b", {}, b.name), h("span", { class: "fe-meta" }, b.protected ? "protégée" : "branche")), link(`https://github.com/${repo}/tree/${b.name}`, "Ouvrir")))));
  root.append(panel("Déploiements par jour (14 j)", chart({ labels: ds.map(dl), series: [{ name: "Réussis", color: "#2e9e5b", data: perDay(runs, "created_at", ds, (r) => r.conclusion === "success") }, { name: "Échecs", color: "#d64545", data: perDay(runs, "created_at", ds, (r) => r.conclusion === "failure") }] })));
  const ls = ok.slice(0, 20).reverse();
  if (ls.length) root.append(panel("Durée des builds (secondes)", chart({ type: "line", labels: ls.map((r) => r.head_sha.slice(0, 5)), series: [{ name: "Durée", color: "#111", data: ls.map(secs) }] })));
  root.append(panel("Commits par jour (14 j)", chart({ labels: ds.map(dl), series: [{ name: "Commits", color: "#111", data: perDay(commits.map((c) => ({ t: c.commit.author.date })), "t", ds) }] })));
}

/* ---- Previews par PR ---- */
async function vPreviews(root) {
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

function commitCard(repo, m, path) {
  const inp = h("input", { type: "file", multiple: true });
  const msg = h("input", { class: "fe-input", value: "Update via Deploy", style: "flex:1;min-width:220px" });
  return panel("Commit et push", h("span", { class: "fe-meta" }, `Importe un ou plusieurs fichiers : un seul commit est poussé sur ${m.default_branch}${path ? " dans /" + path : ""}, ce qui déclenche le déploiement.`), inp,
    h("div", { class: "fe-bar", style: "margin:0" }, msg, btn("Commit et push", "upload", () => act(async () => {
      const files = [...inp.files]; if (!files.length) throw new Error("Choisis au moins un fichier.");
      const L = loading("Commit sur " + m.default_branch);
      try {
        L.step("Lecture de la branche");
        const ref = await gh(`/repos/${repo}/git/ref/heads/${m.default_branch}`), head = await gh(`/repos/${repo}/git/commits/${ref.object.sha}`);
        L.step(`Envoi de ${files.length} fichier(s)`);
        const tree = [];
        for (const f of files) {
          const b64 = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result.split(",")[1]); r.onerror = ko; r.readAsDataURL(f); });
          const blob = await gh(`/repos/${repo}/git/blobs`, { method: "POST", body: { content: b64, encoding: "base64" } });
          tree.push({ path: (path ? path + "/" : "") + f.name, mode: "100644", type: "blob", sha: blob.sha });
        }
        L.step("Création du commit");
        const t = await gh(`/repos/${repo}/git/trees`, { method: "POST", body: { base_tree: head.tree.sha, tree } });
        const c = await gh(`/repos/${repo}/git/commits`, { method: "POST", body: { message: msg.value || "Update via Deploy", tree: t.sha, parents: [ref.object.sha] } });
        L.step("Push sur GitHub");
        await gh(`/repos/${repo}/git/refs/heads/${m.default_branch}`, { method: "PATCH", body: { sha: c.sha } });
        L.close(); go("Déploiements");
      } catch (e) { L.close(); throw e; }
    }, "Commit poussé : déploiement en cours"), "primary")));
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
      go("Déploiements");
    }, "Commit créé : déploiement en cours"), "primary")));
  }
  const items = [...data].sort((a, b) => (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1) || a.name.localeCompare(b.name)).filter((x) => match(x.name));
  root.append(crumbs, h("div", { class: "fe-bar", style: "margin-top:0" }, btn("Nouveau fichier", "file-plus", () => { const n = prompt("Nom du fichier (ex. about.html)"); if (n) act(async () => { await gh(`/repos/${repo}/contents/${path ? path + "/" : ""}${n}`, { method: "PUT", body: { message: "Add " + n, content: btoa("\n"), branch: m.default_branch } }); render(S.cur); }, "Fichier créé"); })),
    h("div", { class: "fe-list" }, items.map((x) => h("div", { class: "fe-row fe-click", onclick: () => { S.path = x.path; render(S.cur); } }, ic(x.type === "dir" ? "folder" : "file-text"), h("div", { class: "fe-main" }, h("b", {}, x.name)), h("span", { class: "fe-meta" }, x.type === "dir" ? "" : x.size + " o")))), commitCard(repo, m, path));
}

/* ---- Analytics ---- */
async function vAnalytics(root) {
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

/* ---- Projet sélectionné : sélecteur de la navbar + barre de projet ---- */
const sw = document.getElementById("project-switcher"), swName = document.getElementById("project-name");
const short = (r) => (r || "").split("/")[1] || "";
const cache = {};
async function getMeta(repo) {
  const c = cache[repo]; if (c && Date.now() - c.t < 30000) return c.m;
  const m = await gh(`/repos/${repo}`); m._url = m.has_pages ? await pagesUrl(repo) : null; cache[repo] = { t: Date.now(), m }; return m;
}
const NEED = ["Aperçu", "Déploiements", "Logs", "Fichiers", "Domaines", "Variables d'environnement", "Analytics", "Général", "Environnements", "Releases", "Tags", "Changelog", "Comparer", "Support"];
const syncSwitcher = () => {
  swName.textContent = cur() ? short(cur()) : "Choisir un projet";
  sw.classList.toggle("attn", !cur());
  document.querySelectorAll(".nav-item").forEach((i) => i.classList.toggle("needs-project", !cur() && NEED.includes(i.querySelector("span")?.textContent.trim())));
};
function setProject(repo, label = "Aperçu") { SET("fe_repo", repo); syncSwitcher(); go(label); }
async function projBar(box, label) {
  const repo = cur(), m = await getMeta(repo);
  document.getElementById("content-title").textContent = `/ ${m.name} / ${label}`;
  box.append(h("div", { class: "fe-head" }, h("div", { class: "fe-main" }, h("b", { class: "fe-title" }, m.name), h("span", { class: "fe-meta" }, `${m.owner.login} · ${m.private ? "privé" : "public"} · ${m.default_branch}`)),
    btn("Déployer", "rocket", () => act(async () => { await deploy(repo, m.default_branch); go("Déploiements"); }), "primary"),
    btn("Déploiement auto", "git-branch", () => confirm("Installer le workflow (déploiement à chaque push + previews par PR) ?") && act(async () => { const L = loading("Configuration de " + m.name); try { await setupAuto(repo, L); } finally { L.close(); } delete cache[repo]; go(label); }, "Déploiement auto et previews activés")),
    m._url && link(m._url, "Visiter"), link(m.html_url, "GitHub")));
}

let pop;
const closePop = () => { pop?.remove(); pop = null; sw.setAttribute("aria-expanded", "false"); };
sw.addEventListener("click", async (e) => {
  e.stopPropagation();
  if (pop) return closePop();
  const r = sw.getBoundingClientRect(), col = document.body.classList.contains("nav-collapsed");
  const input = h("input", { class: "fe-input", placeholder: "Rechercher un projet…" }), list = h("div", { class: "pop-list" });
  pop = h("div", { class: "project-pop", style: `left:${col ? r.right + 8 : r.left}px;top:${r.bottom + 6}px` }, input, list,
    h("button", { type: "button", class: "pop-item", onclick: () => { closePop(); go("Projets"); } }, ic("layout-grid"), h("span", {}, "Tous les projets")));
  document.body.appendChild(pop); sw.setAttribute("aria-expanded", "true");
  let all = [];
  const draw = () => {
    const q = input.value.toLowerCase();
    list.replaceChildren(...all.filter((x) => x.full_name.toLowerCase().includes(q)).map((x) => h("button", { type: "button", class: "pop-item" + (x.full_name === cur() ? " active" : ""), onclick: () => { closePop(); setProject(x.full_name); } }, ic("folder-git-2"), h("span", {}, x.name), x.full_name === cur() && ic("check"))));
    if (!list.children.length) list.append(h("div", { class: "fe-empty" }, "Aucun projet."));
    icons();
  };
  try { all = await repos(); } catch (err) { list.append(h("div", { class: "fe-empty" }, err.message)); }
  draw(); input.addEventListener("input", draw); input.focus();
});
document.addEventListener("click", (e) => { if (pop && !pop.contains(e.target)) closePop(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });

async function vGeneral(root) {
  const m = await gh(`/repos/${cur()}`);
  const set = (t, desc, body, foot) => h("div", { class: "fe-set" }, h("div", { class: "fe-setbody" }, h("b", {}, t), h("p", { class: "fe-meta" }, desc), body), h("div", { class: "fe-setfoot" }, h("span", { class: "fe-meta" }, foot)));
  root.append(h("div", { class: "fe-settings" },
    set("Nom du projet", "Nom du dépôt GitHub qui héberge ce projet.", h("div", { class: "fe-field" }, h("span", {}, `github.com/${m.owner.login}/`), h("input", { class: "fe-input", value: m.name, readonly: true })), "Se renomme depuis GitHub › Settings."),
    set("ID du projet", "Utilisé pour interagir avec l'API GitHub.", h("div", { class: "fe-field" }, h("code", {}, String(m.id)), btn("Copier", "copy", () => navigator.clipboard.writeText(String(m.id)).then(() => toast("ID copié")))), "Identifiant numérique du dépôt."),
    set("Branche de production", "Chaque push sur cette branche déclenche un déploiement.", h("div", { class: "fe-field" }, h("code", {}, m.default_branch)), "Modifiable depuis GitHub › Settings › Branches."),
    set("Visibilité", "Détermine qui peut voir le code du dépôt.", h("div", { class: "fe-field" }, h("code", {}, m.private ? "Privé" : "Public"), link(m.html_url, "Ouvrir sur GitHub")), "Gérée par GitHub.")));
}
Object.assign(VIEWS, { "Général": vGeneral, "Aperçu": vOverview, "Previews": vPreviews, "Logs": vLogs, "Fichiers": vFiles, "Analytics": vAnalytics, "Environnements": vPreviews });
/* ---- Versions, Support, Logs et Analytics façon Vercel ---- */
const refs = async (repo) => { const [b, t] = await Promise.all([gh(`/repos/${repo}/branches?per_page=100`), gh(`/repos/${repo}/tags?per_page=100`).catch(() => [])]); return [...t.map((x) => x.name), ...b.map((x) => x.name)]; };
const sel = (opts, val) => h("select", { class: "fe-select" }, opts.map((o) => h("option", { value: o, selected: o === val }, o)));
const empt = (icon, title, text, ...c) => h("div", { class: "fe-emptycard" }, h("span", { class: "fe-iconbox" }, ic(icon)), h("b", {}, title), h("span", { class: "fe-meta" }, text), ...c);
const tagRow = (t, onDel) => h("div", { class: "fe-row" }, ic("tag"), h("div", { class: "fe-main" }, h("b", {}, t.name), h("span", { class: "fe-meta fe-mono" }, t.commit.sha.slice(0, 7))), btn("Supprimer", "trash-2", onDel));

async function vReleases(root) {
  const repo = cur(), m = await gh(`/repos/${repo}`), rel = await gh(`/repos/${repo}/releases?per_page=30`);
  const tag = h("input", { class: "fe-input", placeholder: "v1.0.0" }), name = h("input", { class: "fe-input", placeholder: "Titre (optionnel)" }), notes = h("textarea", { class: "fe-input fe-ta", placeholder: "Notes de version (Markdown). Vide = générées automatiquement." });
  root.append(panel("Publier une release", h("span", { class: "fe-meta" }, `Crée un tag sur ${m.default_branch} et publie la release GitHub.`), h("div", { class: "fe-bar", style: "margin:0" }, tag, name), notes,
    btn("Publier la release", "tag", () => act(async () => { if (!tag.value.trim()) throw new Error("Indique un nom de tag."); await gh(`/repos/${repo}/releases`, { method: "POST", body: { tag_name: tag.value.trim(), name: name.value || tag.value.trim(), body: notes.value, target_commitish: m.default_branch, generate_release_notes: !notes.value } }); render(S.cur); }, "Release publiée"), "primary")));
  root.append(h("div", { class: "fe-sec" }, "Releases"), rel.length ? h("div", { class: "fe-list" }, rel.filter((x) => match(x.tag_name, x.name)).map((x) => h("div", { class: "fe-row" }, ic("package"), h("div", { class: "fe-main" }, h("b", {}, x.name || x.tag_name), h("span", { class: "fe-meta" }, `${x.tag_name} · ${ago(x.published_at || x.created_at)}${x.prerelease ? " · pré-version" : ""}`)), link(x.html_url, "Ouvrir"),
    btn("Supprimer", "trash-2", () => confirm("Supprimer cette release ?") && act(async () => { await gh(`/repos/${repo}/releases/${x.id}`, { method: "DELETE" }); render(S.cur); }, "Release supprimée"))))) : empt("package", "Aucune release", "Publie ta première version pour la retrouver ici."));
}
async function vTags(root) {
  const repo = cur(), m = await gh(`/repos/${repo}`), tags = await gh(`/repos/${repo}/tags?per_page=100`), name = h("input", { class: "fe-input", placeholder: "v1.0.1" });
  root.append(panel("Nouveau tag", h("span", { class: "fe-meta" }, `Pose un tag sur le dernier commit de ${m.default_branch}.`), h("div", { class: "fe-bar", style: "margin:0" }, name, btn("Créer le tag", "tag", () => act(async () => { const n = name.value.trim(); if (!n) throw new Error("Indique un nom de tag."); const ref = await gh(`/repos/${repo}/git/ref/heads/${m.default_branch}`); await gh(`/repos/${repo}/git/refs`, { method: "POST", body: { ref: "refs/tags/" + n, sha: ref.object.sha } }); render(S.cur); }, "Tag créé"), "primary"))));
  root.append(h("div", { class: "fe-sec" }, "Tags"), tags.length ? h("div", { class: "fe-list" }, tags.filter((t) => match(t.name)).map((t) => tagRow(t, () => confirm("Supprimer le tag " + t.name + " ?") && act(async () => { await gh(`/repos/${repo}/git/refs/tags/${t.name}`, { method: "DELETE" }); render(S.cur); }, "Tag supprimé")))) : empt("tag", "Aucun tag", "Crée un tag pour marquer une version."));
}
async function cmpView(root, log) {
  const repo = cur(), m = await gh(`/repos/${repo}`), all = await refs(repo), t0 = (await gh(`/repos/${repo}/tags?per_page=1`).catch(() => []))[0]?.name;
  const base = sel(all, t0 || m.default_branch), head = sel(all, m.default_branch), out = h("div");
  const run = () => act(async () => {
    const c = await gh(`/repos/${repo}/compare/${encodeURIComponent(base.value)}...${encodeURIComponent(head.value)}`);
    if (log) {
      const md = c.commits.slice().reverse().map((x) => `- ${x.commit.message.split("\n")[0]} (${x.sha.slice(0, 7)})`).join("\n");
      out.replaceChildren(...(c.commits.length ? [h("div", { class: "fe-bar" }, h("span", { class: "fe-meta" }, `${c.ahead_by} commit(s) depuis ${base.value}`), btn("Copier en Markdown", "copy", () => navigator.clipboard.writeText(md).then(() => toast("Changelog copié")))), h("pre", { class: "fe-log" }, md)] : [empt("scroll-text", "Aucun changement", "Les deux versions sont identiques.")]));
    } else out.replaceChildren(h("div", { class: "fe-stats" }, stat("Commits d'avance", c.ahead_by), stat("En retard", c.behind_by), stat("Fichiers modifiés", c.files.length)),
      c.files.length ? h("div", { class: "fe-list" }, c.files.map((f) => h("div", { class: "fe-row" }, ic("file-text"), h("div", { class: "fe-main" }, h("b", {}, f.filename), h("span", { class: "fe-meta" }, f.status)), h("span", { class: "fe-meta fe-mono" }, `+${f.additions} −${f.deletions}`)))) : empt("git-compare", "Aucune différence", "Ces deux références contiennent les mêmes fichiers."));
    icons();
  });
  root.append(h("div", { class: "fe-bar" }, h("span", { class: "fe-meta" }, log ? "Depuis" : "Base"), base, h("span", { class: "fe-meta" }, log ? "jusqu'à" : "Comparer à"), head, btn(log ? "Générer" : "Comparer", "git-compare", run, "primary")), out);
  run();
}
async function vSupport(root) {
  const repo = cur(), issues = (await gh(`/repos/${repo}/issues?state=all&per_page=50`)).filter((i) => !i.pull_request), list = h("div");
  const st = h("select", { class: "fe-select", onchange: () => draw() }, ["Tous", "Ouverts", "Fermés"].map((x) => h("option", {}, "Statut : " + x)));
  const t = h("input", { class: "fe-input", placeholder: "Résumé du problème" }), b = h("textarea", { class: "fe-input fe-ta", placeholder: "Décris ce qui se passe (étapes, URL, logs…)" });
  const form = h("div", { class: "fe-card", hidden: true }, h("b", {}, "Nouveau ticket"), t, b, btn("Envoyer", "send", () => act(async () => { if (!t.value.trim()) throw new Error("Ajoute un titre."); await gh(`/repos/${repo}/issues`, { method: "POST", body: { title: t.value.trim(), body: b.value } }); render(S.cur); }, "Ticket créé"), "primary"));
  const draw = () => {
    const f = st.value.slice(9), rows = issues.filter((i) => (f === "Tous" || (f === "Ouverts") === (i.state === "open")) && match(i.title));
    list.replaceChildren(rows.length ? h("div", { class: "fe-list" }, rows.map((i) => h("div", { class: "fe-row" }, h("span", { class: "fe-dot " + (i.state === "open" ? "ok" : "") }), h("div", { class: "fe-main" }, h("b", {}, `#${i.number} ${i.title}`), h("span", { class: "fe-meta" }, `${i.state === "open" ? "ouvert" : "fermé"} · ${i.comments} réponse(s) · ${ago(i.updated_at)}`)), link(i.html_url, "Ouvrir")))) : empt("message-circle", "Aucun ticket", "Crée un ticket pour obtenir de l'aide.", btn("Nouveau ticket", "plus", () => { form.hidden = false; t.focus(); }, "primary")));
    icons();
  };
  root.append(h("div", { class: "fe-bar" }, st, h("span", { style: "flex:1" }), btn("Nouveau ticket", "plus", () => { form.hidden = !form.hidden; }, "primary")), form, list);
  draw();
}
async function vLogs2(root) {
  const repo = cur();
  const [runs, commits, prs] = await Promise.all([gh(`/repos/${repo}/actions/runs?per_page=50`), gh(`/repos/${repo}/commits?per_page=30`).catch(() => []), gh(`/repos/${repo}/pulls?state=all&per_page=20&sort=updated`)]);
  const ev = [...runs.workflow_runs.map((r) => ({ t: r.updated_at, k: "DEPLOY", lvl: r.conclusion === "failure" ? "error" : r.status !== "completed" ? "warn" : "ok", m: `${r.name} · ${r.head_branch} · ${r.head_sha.slice(0, 7)} · ${r.status === "completed" ? r.conclusion + " (" + dur(r.run_started_at, r.updated_at) + ")" : "en cours"}` })),
    ...commits.map((c) => ({ t: c.commit.author.date, k: "COMMIT", lvl: "info", m: `${c.sha.slice(0, 7)} ${c.commit.message.split("\n")[0]} — ${c.commit.author.name}` })),
    ...prs.map((p) => ({ t: p.merged_at || p.closed_at || p.created_at, k: "PR", lvl: "info", m: `#${p.number} ${p.merged_at ? "fusionnée" : p.state === "open" ? "ouverte" : "fermée"} · ${p.title}` }))].sort((a, b) => new Date(b.t) - new Date(a.t));
  const K = { DEPLOY: "Déploiements", COMMIT: "Commits", PR: "PR" }, lv = (e) => (e.lvl === "error" ? "Erreur" : e.lvl === "warn" ? "Avertissement" : "Info"), on = {}, con = h("div", { class: "fe-console" });
  let shown = [];
  const draw = () => { shown = ev.filter((e) => on[K[e.k]] !== false && on[lv(e)] !== false && match(e.m));
    con.replaceChildren(...shown.map((e) => h("div", { class: "ln " + e.lvl }, h("span", {}, new Date(e.t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" })), h("b", {}, e.k), h("span", {}, e.m)))); if (!shown.length) con.append(h("div", { class: "ln" }, "Aucun événement.")); };
  const box = (n, c) => h("label", { class: "fe-check" }, h("input", { type: "checkbox", checked: true, onchange: (e) => { on[n] = e.target.checked; draw(); } }), n, h("span", { class: "fe-meta" }, String(c)));
  const side = h("div", { class: "fe-filters" }, h("b", {}, "Filtres"), h("div", { class: "fe-sec" }, "Source"), ...Object.entries(K).map(([k, n]) => box(n, ev.filter((e) => e.k === k).length)), h("div", { class: "fe-sec" }, "Niveau"), ...["Info", "Avertissement", "Erreur"].map((n) => box(n, ev.filter((e) => lv(e) === n).length)));
  const bar = h("div", { class: "fe-bar", style: "margin-top:0" }, btn("Live", "play-circle", () => { S.live = !S.live; render(S.cur); }, S.live ? "primary" : ""), btn("Actualiser", "refresh-cw", () => render(S.cur)),
    btn("Télécharger", "download", () => { const a = h("a", { href: URL.createObjectURL(new Blob([shown.map((e) => `${e.t} ${e.k} ${e.m}`).join("\n")], { type: "text/plain" })), download: "logs.txt" }); a.click(); }));
  root.append(h("div", { class: "fe-logs" }, side, h("div", {}, bar, con)));
  draw();
  if (S.live) S.timer = setTimeout(() => render(S.cur), 8000);
}
function area(labels, data) {
  const W = 1100, H = 260, pl = 34, pb = 22, pt = 10, n = data.length, max = Math.max(1, ...data), x = (i) => pl + ((W - pl - 8) * i) / Math.max(1, n - 1), y = (v) => pt + (H - pt - pb) * (1 - v / max);
  let g = ""; for (let k = 0; k <= 3; k++) { const yy = pt + ((H - pt - pb) * k) / 3; g += `<line x1="${pl}" x2="${W - 8}" y1="${yy}" y2="${yy}" stroke="#e6e9ed"/><text x="${pl - 6}" y="${yy + 3}" text-anchor="end" font-size="10" fill="#7a7a7a">${Math.round(max * (1 - k / 3))}</text>`; }
  const pts = data.map((v, i) => `${x(i)},${y(v)}`).join(" L");
  g += `<path class="fe-fill" d="M${x(0)},${H - pb} L${pts} L${x(n - 1)},${H - pb}Z" fill="#111" opacity=".07"/><polyline class="fe-stroke" fill="none" stroke="#111" stroke-width="1.6" points="${pts.replace(/ L/g, " ")}"/>`;
  labels.forEach((l, i) => { if (i % 2 === 0) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#7a7a7a">${l}</text>`; });
  const el = h("div", { class: "fe-area" }); el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${g}</svg>`; return el;
}
async function vAnalytics2(root) {
  const repo = cur();
  try {
    const [v, c, ref, pth] = await Promise.all([gh(`/repos/${repo}/traffic/views`), gh(`/repos/${repo}/traffic/clones`), gh(`/repos/${repo}/traffic/popular/referrers`), gh(`/repos/${repo}/traffic/popular/paths`)]);
    const ds = days(14), by = (a, k) => ds.map((d) => a.find((x) => x.timestamp.slice(0, 10) === d)?.[k] || 0);
    const M = [["Vues", v.count, by(v.views, "count")], ["Visiteurs uniques", v.uniques, by(v.views, "uniques")], ["Clones", c.count, by(c.clones, "count")]], tabs = h("div", { class: "fe-mtabs" }), box = h("div");
    const pick = (i) => { [...tabs.children].forEach((t, j) => t.classList.toggle("on", i === j)); box.replaceChildren(area(ds.map(dl), M[i][2])); };
    M.forEach(([k, n], i) => tabs.append(h("button", { type: "button", class: "fe-mtab", onclick: () => pick(i) }, h("span", {}, k), h("b", {}, String(n)))));
    root.append(h("div", { class: "fe-hero2" }, h("div", {}, h("b", { class: "fe-herotitle" }, "Trafic du dépôt"), h("div", { class: "fe-meta" }, "Vues, visiteurs et clones sur les 14 derniers jours.")), link(`https://github.com/${repo}/graphs/traffic`, "Détails sur GitHub")),
      h("div", { class: "fe-card fe-flush" }, tabs, box), h("div", { class: "fe-grid" }, panel("Sources", ...ref.map((x) => h("div", { class: "fe-kv" }, h("span", {}, x.referrer), h("b", {}, String(x.count)))), !ref.length && h("span", { class: "fe-meta" }, "Aucune donnée")),
        panel("Pages populaires", ...pth.map((x) => h("div", { class: "fe-kv" }, h("span", {}, x.path), h("b", {}, String(x.count)))), !pth.length && h("span", { class: "fe-meta" }, "Aucune donnée"))));
    pick(0);
  } catch (e) { root.append(panel("Trafic indisponible", h("span", { class: "fe-meta" }, e.message + " (les stats de trafic demandent les droits d'écriture sur le dépôt)."))); }
}
Object.assign(VIEWS, { "Releases": vReleases, "Tags": vTags, "Changelog": (r) => cmpView(r, true), "Comparer": (r) => cmpView(r, false), "Support": vSupport, "Logs": vLogs2, "Analytics": vAnalytics2 });
Object.assign(window.DP, { setProject, projBar, syncSwitcher });
syncSwitcher();
// Ouvre les deux premiers groupes (Projet, Déploiements) après l'animation d'arrivée.
setTimeout(() => [...document.querySelectorAll(".nav-group-title")].slice(0, 2).forEach((b, i) => setTimeout(() => b.getAttribute("aria-expanded") === "false" && b.click(), i * 250)), 2300);
})();