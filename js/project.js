(() => {
const { h, ic, btn, gh, act, toast, ago, dur, S, SET, cur, icons, deploy, setupAuto, render, go, toB64, fromB64, match, repos, VIEWS, loading } = window.DP;
const encPath = (x) => x.split("/").map(encodeURIComponent).join("/");
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
  for (let k = 0; k <= 3; k++) { const y = pt + ih - (ih * k) / 3; g += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="currentColor" opacity=".15" stroke-dasharray="3 4"/><text x="${pl - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="currentColor" opacity=".6">${Math.round((max * k) / 3)}</text>`; }
  if (type === "bar") labels.forEach((l, i) => { let acc = 0; series.forEach((s) => { const v = s.data[i]; if (!v) return; const hh = (ih * v) / max; acc += hh; g += `<rect x="${pl + i * bw + bw * 0.15}" y="${pt + ih - acc}" width="${bw * 0.7}" height="${hh}" rx="4" fill="${s.color}"><title>${l} · ${s.name} : ${v}</title></rect>`; }); });
  else series.forEach((s) => { g += `<polyline fill="none" stroke="${s.color}" stroke-width="1.6" points="${s.data.map((v, i) => `${pl + bw * i + bw / 2},${pt + ih - (ih * v) / max}`).join(" ")}"/>` + s.data.map((v, i) => `<circle cx="${pl + bw * i + bw / 2}" cy="${pt + ih - (ih * v) / max}" r="2.3" fill="${s.color}"><title>${labels[i]} · ${s.name} : ${v}</title></circle>`).join(""); });
  labels.forEach((l, i) => { if (i % Math.ceil(n / 7) === 0) g += `<text x="${pl + bw * i + bw / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="currentColor" opacity=".6">${l}</text>`; });
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
    h("div", { class: "fe-prodhead" }, h("b", {}, "Déploiement de production"), h("div", { class: "fe-acts" }, link(m.html_url, "GitHub"), btn("Restauration instantanée", "undo-2", () => go("Déploiements")), url && link(url, "Visiter"))),
    h("div", { class: "fe-prodbody" }, h("div", { class: "fe-thumb" }, url && h("iframe", { src: url, loading: "lazy", sandbox: "", tabindex: "-1", title: "Aperçu" })),
      h("div", { class: "fe-details" }, kv("Déploiement", host), kv("Domaines", url ? h("a", { href: url, target: "_blank", rel: "noopener" }, host) : "—"),
        h("div", { class: "fe-two" }, kv("Statut", h("span", { class: "fe-scell" }, h("span", { class: "fe-dot " + (!last ? "" : last.status !== "completed" ? "run" : last.conclusion === "success" ? "ok" : "fail") }), last ? (last.status === "completed" ? (last.conclusion === "success" ? "Prêt" : last.conclusion) : "En cours") : "—")), kv("Créé", last ? ago(last.created_at) : "—")),
        kv("Source", h("div", { class: "fe-mono" }, m.default_branch), h("div", { class: "fe-meta" }, last ? `${last.head_sha.slice(0, 7)} ${last.display_title}` : "—")))),
    h("div", { class: "fe-prodfoot" }, h("span", { class: "fe-meta" }, `Pour mettre à jour la production, pousse sur la branche ${m.default_branch}.`), btn("Déploiements", "list-filter", () => go("Déploiements")))));
  const reco = [["Connecter un dépôt Git", true], ["Ajouter un domaine personnalisé", !!url && !/github\.io/.test(url)], ["Déploiement de preview", !!wf && fromB64(wf.content).includes("pr-preview")], ["Voir le trafic", false]];
  root.append(h("div", { class: "fe-grid3" },
    panel(`Recommandations ${reco.filter((x) => x[1]).length}/${reco.length}`, ...reco.map(([t, v]) => h("div", { class: "fe-reco" + (v ? " done" : "") }, ic(v ? "check" : "circle"), t))),
    panel("Observabilité · 14 j", stat("Déploiements", r14.length), stat("Échecs", f14), stat("Taux d'erreur", r14.length ? Math.round((f14 / r14.length) * 100) + " %" : "0 %")),
    panel("Statistiques", h("span", { class: "fe-meta" }, "Trafic, pages populaires et clones de ton dépôt."), btn("Voir les statistiques", "bar-chart-3", () => go("Statistiques")))));
  root.append(h("div", { class: "fe-sec" }, "Branches actives"), h("div", { class: "fe-list" }, brs.map((b) => h("div", { class: "fe-row" }, ic("git-branch"), h("div", { class: "fe-main" }, h("b", {}, b.name), h("span", { class: "fe-meta" }, b.protected ? "protégée" : "branche")), link(`https://github.com/${repo}/tree/${b.name}`, "Ouvrir")))));
  const ls = ok.slice(0, 20).reverse(), ok14 = perDay(runs, "created_at", ds, (r) => r.conclusion === "success"), ko14 = perDay(runs, "created_at", ds, (r) => r.conclusion === "failure");
  root.append(h("div", { class: "fe-sec" }, "Activité"), h("div", { class: "fe-grid" },
    panel("Déploiements par jour", chart({ labels: ds.map(dl), series: [{ name: "Réussis", color: "#2e9e5b", data: ok14 }, { name: "Échecs", color: "#d64545", data: ko14 }] })),
    panel("Commits par jour", area(ds.map(dl), perDay(commits.map((c) => ({ t: c.commit.author.date })), "t", ds))),
    ls.length > 0 && panel("Durée des builds (s)", area(ls.map((r) => r.head_sha.slice(0, 5)), ls.map(secs)))));
}

/* ---- Previews par PR ---- */
async function vPreviews(root) {
  const repo = cur(); if (!repo) return empty(root);
  const m = await gh(`/repos/${repo}`);
  let ready = false;
  try { ready = fromB64((await gh(`/repos/${repo}/contents/.github/workflows/deploy.yml`)).content).includes("pr-preview"); } catch (e) { /* absent */ }
  if (!ready) return root.append(panel("Previews par pull request", h("span", { class: "fe-meta" }, "Chaque PR obtient sa propre URL de test, supprimée automatiquement à la fermeture. Il faut installer le workflow (déploiement auto + previews)."),
    btn("Activer les previews", "git-pull-request", () => act(async () => { const L = loading("Activation des previews", 3); try { await setupAuto(repo, L); } finally { L.close(); } render(S.cur); }), "primary")));
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

function commitCard(repo, m, path) {
  const inp = h("input", { type: "file", multiple: true });
  const msg = h("input", { class: "fe-input", value: "Update via Deploy", style: "flex:1;min-width:220px" });
  return panel("Commit et push", h("span", { class: "fe-meta" }, `Importe un ou plusieurs fichiers : un seul commit est poussé sur ${m.default_branch}${path ? " dans /" + path : ""}, ce qui déclenche le déploiement.`), inp,
    h("div", { class: "fe-bar", style: "margin:0" }, msg, btn("Commit et push", "upload", () => act(async () => {
      const files = [...inp.files]; if (!files.length) throw new Error("Choisis au moins un fichier.");
      const L = loading("Commit sur " + m.default_branch, 4);
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
  const data = await gh(`/repos/${repo}/contents/${encPath(path)}?ref=${m.default_branch}`);
  const crumbs = h("div", { class: "fe-crumbs" }, btn(m.name, "folder-git-2", () => { S.path = ""; render(S.cur); }), ...path.split("/").filter(Boolean).flatMap((seg, i, a) => [h("span", { class: "fe-meta" }, "/"), h("button", { type: "button", class: "fe-crumb", onclick: () => { S.path = a.slice(0, i + 1).join("/"); render(S.cur); } }, seg)]));
  if (!Array.isArray(data)) {
    if (data.size > 200000 || /\.(png|jpe?g|gif|webp|ico|woff2?|pdf|zip)$/i.test(data.name)) return root.append(crumbs, panel(data.name, h("span", { class: "fe-meta" }, "Fichier binaire ou trop gros pour l'éditeur."), link(data.html_url, "Voir sur GitHub")));
    const ta = h("textarea", { class: "fe-editor", spellcheck: "false" }); ta.value = fromB64(data.content);
    const msg = h("input", { class: "fe-input", value: "Update " + data.name, style: "flex:1" });
    return root.append(crumbs, ta, h("div", { class: "fe-bar" }, msg, btn("Commit et déployer", "git-commit-horizontal", () => act(async () => {
      await gh(`/repos/${repo}/contents/${encPath(path)}`, { method: "PUT", body: { message: msg.value, content: toB64(ta.value), sha: data.sha, branch: m.default_branch } });
      go("Déploiements");
    }, "Commit créé : déploiement en cours"), "primary")));
  }
  const items = [...data].sort((a, b) => (a.type === "dir" ? 0 : 1) - (b.type === "dir" ? 0 : 1) || a.name.localeCompare(b.name)).filter((x) => match(x.name));
  root.append(crumbs, h("div", { class: "fe-bar", style: "margin-top:0" }, btn("Nouveau fichier", "file-plus", () => { const n = prompt("Nom du fichier (ex. about.html)"); if (n) act(async () => { await gh(`/repos/${repo}/contents/${encPath((path ? path + "/" : "") + n)}`, { method: "PUT", body: { message: "Add " + n, content: btoa("\n"), branch: m.default_branch } }); render(S.cur); }, "Fichier créé"); })),
    h("div", { class: "fe-list" }, items.map((x) => h("div", { class: "fe-row fe-click", onclick: () => { S.path = x.path; render(S.cur); } }, ic(x.type === "dir" ? "folder" : /\.(html?|jsx?|tsx?|css|json|ya?ml)$/i.test(x.name) ? "file-code" : /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(x.name) ? "image" : "file-text"), h("div", { class: "fe-main" }, h("b", {}, x.name)), h("span", { class: "fe-meta" }, x.type === "dir" ? "" : x.size > 1024 ? (x.size / 1024).toFixed(1) + " Ko" : x.size + " o")))), commitCard(repo, m, path));
}

/* ---- Projet sélectionné : sélecteur de la navbar + barre de projet ---- */
const sw = document.getElementById("project-switcher"), swName = document.getElementById("project-name");
const short = (r) => (r || "").split("/")[1] || "";
const cache = {};
async function getMeta(repo) {
  const c = cache[repo]; if (c && Date.now() - c.t < 30000) return c.m;
  const m = await gh(`/repos/${repo}`); m._url = m.has_pages ? await pagesUrl(repo) : null; cache[repo] = { t: Date.now(), m }; return m;
}
const NEED = ["Aperçu", "Déploiements", "Journaux", "Fichiers", "Domaines", "Variables d'environnement", "Statistiques", "Général", "Environnements", "Publications", "Tags", "Changelog", "Comparer", "Support"];
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
    btn("Déploiement auto", "git-branch", () => confirm("Installer le workflow (déploiement à chaque push + previews par PR) ?") && act(async () => { const L = loading("Configuration de " + m.name, 3); try { await setupAuto(repo, L); } finally { L.close(); } delete cache[repo]; go(label); }, "Déploiement auto et previews activés")),
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
  const askDelete = (name) => new Promise((res) => {
    const inp = h("input", { class: "fe-input", placeholder: name }), ok = btn("Supprimer définitivement", "trash-2", () => { o.remove(); res(true); }, "danger");
    ok.disabled = true; inp.addEventListener("input", () => (ok.disabled = inp.value.trim() !== name));
    const o = h("div", { class: "fe-overlay" }, h("div", { class: "fe-loader" }, h("span", { class: "fe-lico danger" }, ic("trash-2")), h("b", { class: "fe-ltitle" }, `Supprimer ${name} ?`),
      h("span", { class: "fe-meta" }, "Le dépôt GitHub, son code, ses déploiements et ses previews seront supprimés définitivement. Cette action est irréversible."), h("span", { class: "fe-meta", style: "margin-top:10px" }, `Tape « ${name} » pour confirmer`), inp,
      h("div", { class: "fe-bar", style: "margin:10px 0 0;justify-content:flex-end" }, btn("Annuler", "x", () => { o.remove(); res(false); }), ok)));
    document.body.appendChild(o); icons(); inp.focus();
  });
  const del = () => act(async () => {
    if (!(await askDelete(m.name))) return;
    const L = loading("Suppression de " + m.name, 2); L.step("Suppression du dépôt GitHub");
    try { await gh(`/repos/${m.full_name}`, { method: "DELETE" }); } catch (e) { L.close(); throw new Error(/admin|delete_repo|Forbidden|Must have/i.test(e.message) ? "Suppression refusée : ajoute le droit delete_repo à ton token (Paramètres › Git)." : e.message); }
    L.step("Nettoyage"); SET("fe_repo"); S.repos = null; window.DP.syncSwitcher(); L.done(); toast("Projet supprimé"); setTimeout(() => { L.close(); go("Projets"); }, 700);
  });
  const danger = h("div", { class: "fe-set fe-danger" }, h("div", { class: "fe-setbody" }, h("b", {}, "Zone de danger"), h("p", { class: "fe-meta" }, "Supprime définitivement ce projet : dépôt GitHub, code, déploiements et previews. Cette action est irréversible.")),
    h("div", { class: "fe-setfoot fe-footrow" }, h("span", { class: "fe-meta" }, "Nécessite le droit delete_repo sur ton token."), btn("Supprimer le projet", "trash-2", del, "danger")));
  const idcard = h("div", { class: "fe-idcard" }, h("img", { class: "fe-uava lg", src: m.owner.avatar_url, alt: "" }), h("div", { class: "fe-main" }, h("b", { class: "fe-herotitle" }, m.name), h("span", { class: "fe-meta" }, m.description || `${m.owner.login} · ${m.default_branch}`)),
    h("span", { class: "fe-pill " + (m.private ? "prev" : "prod") }, m.private ? "Privé" : "Public"), link(m.html_url, "GitHub"));
  const nameIn = h("input", { class: "fe-input", value: m.name }), descIn = h("input", { class: "fe-input", value: m.description || "", placeholder: "Courte description du projet" });
  const patch = (body, ok) => act(async () => {
    const r = await gh(`/repos/${m.full_name}`, { method: "PATCH", body }); delete cache[m.full_name];
    if (r.full_name !== m.full_name) { SET("fe_repo", r.full_name); S.repos = null; syncSwitcher(); }
    render(S.cur);
  }, ok);
  root.append(h("div", { class: "fe-settings" }, idcard,
    set("Nom du projet", "Nom du dépôt GitHub qui héberge ce projet. L'URL GitHub Pages change avec le nom.", h("div", { class: "fe-field" }, h("span", {}, `github.com/${m.owner.login}/`), nameIn, btn("Renommer", "pencil", () => { const n = nameIn.value.trim(); if (!/^[\w.-]+$/.test(n)) return toast("Nom invalide (lettres, chiffres, - _ .).", true); if (n !== m.name && confirm(`Renommer ${m.name} en ${n} ?`)) patch({ name: n }, "Projet renommé"); })), "Les anciens liens GitHub sont redirigés automatiquement."),
    set("Description", "Affichée sur la carte du projet et sur GitHub.", h("div", { class: "fe-field" }, descIn, btn("Enregistrer", "check", () => patch({ description: descIn.value.trim() }, "Description enregistrée"), "primary")), "Visible sur la page GitHub du dépôt."),
    set("ID du projet", "Utilisé pour interagir avec l'API GitHub.", h("div", { class: "fe-field" }, h("code", {}, String(m.id)), btn("Copier", "copy", () => navigator.clipboard.writeText(String(m.id)).then(() => toast("ID copié")))), "Identifiant numérique du dépôt."),
    set("Branche de production", "Chaque push sur cette branche déclenche un déploiement.", h("div", { class: "fe-field" }, h("code", {}, m.default_branch)), "Modifiable depuis GitHub › Settings › Branches."),
    set("Visibilité", "Détermine qui peut voir le code du dépôt.", h("div", { class: "fe-field" }, h("code", {}, m.private ? "Privé" : "Public"), link(m.html_url, "Ouvrir sur GitHub")), "Gérée par GitHub."), danger));
}
Object.assign(VIEWS, { "Général": vGeneral, "Aperçu": vOverview, "Previews": vPreviews, "Fichiers": vFiles, "Environnements": vPreviews });
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
  root.append(h("div", { class: "fe-sec" }, "Publications"), rel.length ? h("div", { class: "fe-list" }, rel.filter((x) => match(x.tag_name, x.name)).map((x) => h("div", { class: "fe-row" }, ic("package"), h("div", { class: "fe-main" }, h("b", {}, x.name || x.tag_name), h("span", { class: "fe-meta" }, `${x.tag_name} · ${ago(x.published_at || x.created_at)}${x.prerelease ? " · pré-version" : ""}`)), link(x.html_url, "Ouvrir"),
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
  const st = h("select", { class: "fe-select chip", onchange: () => draw() }, ["Tous", "Ouverts", "Fermés"].map((x) => h("option", {}, "Statut : " + x)));
  const t = h("input", { class: "fe-input", placeholder: "Résumé du problème" }), b = h("textarea", { class: "fe-input fe-ta", placeholder: "Décris ce qui se passe (étapes, URL, logs…)" });
  const form = h("div", { class: "fe-card", hidden: true }, h("b", {}, "Nouveau ticket"), t, b, btn("Envoyer", "send", () => act(async () => { if (!t.value.trim()) throw new Error("Ajoute un titre."); await gh(`/repos/${repo}/issues`, { method: "POST", body: { title: t.value.trim(), body: b.value } }); render(S.cur); }, "Ticket créé"), "primary"));
  const draw = () => {
    const f = st.value.slice(9), rows = issues.filter((i) => (f === "Tous" || (f === "Ouverts") === (i.state === "open")) && match(i.title));
    list.replaceChildren(rows.length ? h("div", { class: "fe-list" }, rows.map((i) => h("div", { class: "fe-row" }, h("span", { class: "fe-state " + i.state }, ic(i.state === "open" ? "circle-dot" : "circle-check")), h("div", { class: "fe-main" }, h("b", {}, `#${i.number} ${i.title}`), h("span", { class: "fe-meta" }, `${i.user.login} · ${i.state === "open" ? "ouvert" : "fermé"} ${ago(i.updated_at)}`)), h("span", { class: "fe-pill" }, ic("message-circle"), String(i.comments)), link(i.html_url, "Ouvrir")))) : empt("message-circle", "Aucun ticket", "Crée un ticket pour obtenir de l'aide.", btn("Nouveau ticket", "plus", () => { form.hidden = false; t.focus(); }, "primary")));
    icons();
  };
  root.append(h("div", { class: "fe-bar" }, st, h("span", { style: "flex:1" }), btn("Nouveau ticket", "plus", () => { form.hidden = !form.hidden; }, "primary")), form, list);
  draw();
}
async function vLogs(root) {
  const repo = cur();
  if (!repo) return empty(root);
  const repoUrl = "https://github.com/" + repo;
  const runData = await gh(`/repos/${repo}/actions/runs?per_page=25`);
  const runs = runData.workflow_runs || [];
  const statusLabel = (run) => run.status !== "completed" ? (run.status === "queued" ? "En attente" : "En cours") :
    ({ success: "Réussi", failure: "Échec", cancelled: "Annulé", skipped: "Ignoré", timed_out: "Délai dépassé", action_required: "Action requise" }[run.conclusion] || run.conclusion || "Terminé");
  const level = (run) => run.status !== "completed" ? "run" :
    (["failure", "timed_out", "action_required", "startup_failure"].includes(run.conclusion) ? "error" :
    (["cancelled", "skipped", "neutral"].includes(run.conclusion) ? "warn" : "ok"));
  const formatDate = (date) => date ? new Date(date).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const duration = (run) => {
    const start = run.run_started_at || run.created_at;
    const end = run.status === "completed" ? run.updated_at : new Date().toISOString();
    return start && end ? dur(start, end) : "—";
  };
  if (!runs.length) {
    root.append(
      h("div", { class: "fe-log-top" }, h("div", {}, h("h2", {}, "Journaux de déploiement"), h("p", { class: "fe-meta" }, repo + " · Suivi des exécutions et de leurs étapes"))),
      panel("Aucun déploiement trouvé", h("span", { class: "fe-meta" }, "Aucune exécution GitHub Actions n’est disponible pour ce dépôt."), link(repoUrl + "/actions", "Ouvrir GitHub Actions"))
    );
    return;
  }

  const selectedId = String(runs.some((r) => String(r.id) === String(S.logRunId)) ? S.logRunId : runs[0].id);
  S.logRunId = selectedId;
  const selected = runs.find((r) => String(r.id) === selectedId) || runs[0];
  const top = h("div", { class: "fe-log-top" },
    h("div", {}, h("h2", {}, "Journaux de déploiement"), h("p", { class: "fe-meta" }, repo + " · Consulte les étapes d’une seule exécution à la fois")),
    h("div", { class: "fe-log-actions" }, link(repoUrl + "/actions", "Toutes les exécutions"), btn("Actualiser", "refresh-cw", () => render(S.cur)))
  );
  const picker = h("select", { class: "fe-select fe-deploy-picker", "aria-label": "Choisir un déploiement" },
    runs.map((run) => h("option", { value: String(run.id), selected: String(run.id) === selectedId },
      `#${run.run_number} · ${run.name || run.display_title || "Workflow"} · ${statusLabel(run)} · ${formatDate(run.created_at)}`)));
  picker.addEventListener("change", () => { S.logRunId = picker.value; render(S.cur); });
  const pickerCard = h("section", { class: "fe-deploy-picker-card" },
    h("div", { class: "fe-deploy-picker-label" }, ic("git-branch"), h("div", {}, h("b", {}, "Déploiement à consulter"), h("span", { class: "fe-meta" }, "Les journaux chargés seront limités à cette exécution."))),
    picker
  );
  const status = level(selected);
  const hero = h("section", { class: "fe-deploy-hero" },
    h("div", { class: "fe-deploy-hero-main" },
      h("div", { class: "fe-deploy-titleline" }, h("span", { class: "fe-deploy-status " + status }, h("i", {}), statusLabel(selected)), h("span", { class: "fe-meta" }, "Exécution #" + selected.run_number)),
      h("h3", {}, selected.display_title || selected.name || "Déploiement"),
      h("div", { class: "fe-deploy-meta" },
        h("span", {}, ic("git-branch"), selected.head_branch || "Branche inconnue"),
        h("span", {}, ic("git-commit"), (selected.head_sha || "").slice(0, 7) || "SHA inconnu"),
        h("span", {}, ic("user-round"), selected.actor?.login || selected.triggering_actor?.login || "Acteur inconnu"),
        h("span", {}, ic("clock-3"), formatDate(selected.created_at))
      )
    ),
    h("div", { class: "fe-deploy-hero-actions" }, link(selected.html_url || repoUrl + "/actions", "Ouvrir les logs complets", "external-link"))
  );
  const metrics = h("div", { class: "fe-deploy-metrics" },
    h("div", { class: "fe-deploy-metric" }, h("span", { class: "fe-meta" }, "Workflow"), h("b", {}, selected.name || "Workflow")),
    h("div", { class: "fe-deploy-metric" }, h("span", { class: "fe-meta" }, "Durée"), h("b", {}, duration(selected))),
    h("div", { class: "fe-deploy-metric" }, h("span", { class: "fe-meta" }, "Tentative"), h("b", {}, String(selected.run_attempt || 1))),
    h("div", { class: "fe-deploy-metric" }, h("span", { class: "fe-meta" }, "Événement"), h("b", {}, selected.event || "—"))
  );
  const jobsBox = h("div", { class: "fe-deploy-jobs" }, h("div", { class: "fe-deploy-loading" }, h("span", { class: "fe-deploy-spinner" }), "Chargement des étapes de ce déploiement…"));
  root.append(top, pickerCard, hero, metrics, h("div", { class: "fe-deploy-section-head" }, h("div", {}, h("h3", {}, "Étapes du déploiement"), h("p", { class: "fe-meta" }, "Jobs et étapes de l’exécution sélectionnée uniquement.")), h("span", { class: "fe-deploy-count" }, "Chargement…")), jobsBox);

  try {
    const data = await gh(`/repos/${repo}/actions/runs/${selected.id}/jobs?per_page=100`);
    const jobs = data.jobs || [];
    const allSteps = jobs.reduce((n, job) => n + (job.steps || []).length, 0);
    const failedSteps = jobs.reduce((n, job) => n + (job.steps || []).filter((s) => s.conclusion === "failure" || s.conclusion === "timed_out").length, 0);
    const sectionCount = root.querySelector(".fe-deploy-count");
    if (sectionCount) sectionCount.textContent = jobs.length + " job(s) · " + allSteps + " étape(s)";
    jobsBox.replaceChildren();
    if (!jobs.length) {
      jobsBox.append(h("div", { class: "fe-deploy-empty" }, ic("terminal"), h("b", {}, "Aucune étape disponible"), h("span", { class: "fe-meta" }, selected.status !== "completed" ? "Les étapes peuvent apparaître après le démarrage du workflow." : "GitHub n’a retourné aucun job pour cette exécution.")));
    } else {
      jobs.forEach((job, index) => {
        const jobState = job.conclusion || job.status || "queued";
        const jobLevel = job.status !== "completed" ? "run" : (["failure", "timed_out", "action_required"].includes(job.conclusion) ? "error" : (["cancelled", "skipped", "neutral"].includes(job.conclusion) ? "warn" : "ok"));
        const jobHead = h("div", { class: "fe-deploy-job-head" },
          h("span", { class: "fe-deploy-job-icon " + jobLevel }, ic(jobLevel === "ok" ? "check" : jobLevel === "error" ? "x" : jobLevel === "run" ? "loader-circle" : "minus")),
          h("div", { class: "fe-deploy-job-name" }, h("b", {}, job.name || "Job"), h("span", { class: "fe-meta" }, (job.steps || []).length + " étape(s) · " + (job.started_at ? formatDate(job.started_at) : "Pas encore démarré"))),
          h("span", { class: "fe-deploy-status " + jobLevel }, h("i", {}), statusLabel({ status: job.status, conclusion: job.conclusion })),
          h("span", { class: "fe-deploy-chevron" }, ic("chevron-down"))
        );
        const steps = h("div", { class: "fe-deploy-steps" });
        (job.steps || []).forEach((step, stepIndex) => {
          const stepLevel = step.status !== "completed" ? "run" : (["failure", "timed_out", "action_required"].includes(step.conclusion) ? "error" : (["cancelled", "skipped", "neutral"].includes(step.conclusion) ? "warn" : "ok"));
          steps.append(h("div", { class: "fe-deploy-step " + stepLevel },
            h("span", { class: "fe-deploy-step-marker" }, ic(stepLevel === "ok" ? "check" : stepLevel === "error" ? "x" : stepLevel === "run" ? "loader-circle" : "minus")),
            h("div", { class: "fe-deploy-step-copy" }, h("b", {}, step.name || "Étape " + (stepIndex + 1)), h("span", { class: "fe-meta" }, step.started_at ? formatDate(step.started_at) + (step.completed_at ? " · " + dur(step.started_at, step.completed_at) : " · En cours") : "En attente")),
            h("span", { class: "fe-deploy-step-state" }, statusLabel({ status: step.status, conclusion: step.conclusion }))
          ));
        });
        if (!(job.steps || []).length) steps.append(h("div", { class: "fe-deploy-empty small" }, "Aucune étape détaillée pour ce job."));
        const card = h("section", { class: "fe-deploy-job" + (jobLevel === "error" ? " has-error" : "") });
        card.append(h("button", { type: "button", class: "fe-deploy-job-toggle", "aria-expanded": index === 0 || jobLevel === "error" ? "true" : "false", onclick: (event) => {
          const open = card.classList.toggle("expanded");
          event.currentTarget.setAttribute("aria-expanded", String(open));
        } }, jobHead), steps);
        if (index === 0 || jobLevel === "error") card.classList.add("expanded");
        jobsBox.append(card);
      });
      if (failedSteps) jobsBox.prepend(h("div", { class: "fe-deploy-warning" }, ic("alert-triangle"), failedSteps + " étape(s) en échec dans ce déploiement."));
    }
  } catch (error) {
    jobsBox.replaceChildren(h("div", { class: "fe-deploy-empty" }, ic("alert-circle"), h("b", {}, "Impossible de charger les étapes"), h("span", { class: "fe-meta" }, error.message || "Une erreur est survenue."), link(selected.html_url || repoUrl + "/actions", "Voir l’exécution sur GitHub")));
  }
}
function area(labels, data) {
  const W = 1100, H = 260, pl = 34, pb = 22, pt = 10, n = data.length, max = Math.max(1, ...data), x = (i) => pl + ((W - pl - 8) * i) / Math.max(1, n - 1), y = (v) => pt + (H - pt - pb) * (1 - v / max);
  let g = ""; for (let k = 0; k <= 3; k++) { const yy = pt + ((H - pt - pb) * k) / 3; g += `<line x1="${pl}" x2="${W - 8}" y1="${yy}" y2="${yy}" stroke="currentColor" opacity=".15"/><text x="${pl - 6}" y="${yy + 3}" text-anchor="end" font-size="10" fill="currentColor" opacity=".6">${Math.round(max * (1 - k / 3))}</text>`; }
  const pts = data.map((v, i) => `${x(i)},${y(v)}`).join(" L");
  g += `<path class="fe-fill" d="M${x(0)},${H - pb} L${pts} L${x(n - 1)},${H - pb}Z" fill="currentColor" opacity=".07"/><polyline class="fe-stroke" fill="none" stroke="currentColor" stroke-width="1.6" points="${pts.replace(/ L/g, " ")}"/>`;
  labels.forEach((l, i) => { if (i % 2 === 0) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".6">${l}</text>`; });
  const el = h("div", { class: "fe-area" }); el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${g}</svg>`; return el;
}
async function vAnalytics(root) {
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
Object.assign(VIEWS, { "Publications": vReleases, "Tags": vTags, "Changelog": (r) => cmpView(r, true), "Comparer": (r) => cmpView(r, false), "Support": vSupport, "Journaux": vLogs, "Statistiques": vAnalytics });
async function vSecurity(root) {
  const item = (icon, t, d) => h("div", { class: "fe-secitem" }, h("span", { class: "fe-iconbox" }, ic(icon)), h("div", {}, h("b", {}, t), h("p", { class: "fe-meta" }, d)));
  root.append(h("div", { class: "fe-settings" }, h("div", { class: "fe-set" }, h("div", { class: "fe-setbody" },
    item("hard-drive", "Token stocké localement", "Il reste dans le navigateur (session, ou localStorage si « Rester connecté »). Il n'est jamais envoyé à un serveur de Deploy."),
    item("send", "Envoyé uniquement à GitHub", "Les requêtes partent directement vers api.github.com, rien d'autre."),
    item("clock", "Préfère un token à durée limitée", "Choisis une expiration courte quand tu le crées : il se désactive tout seul."),
    item("shield-check", "Droits minimaux", "repo et workflow suffisent. delete_repo n'est utile que pour supprimer un projet.")),
    h("div", { class: "fe-setfoot fe-footrow" }, h("span", { class: "fe-meta" }, "Tu peux révoquer le token à tout moment."), link("https://github.com/settings/tokens", "Gérer mes tokens")))));
}
Object.assign(VIEWS, { "Sécurité": vSecurity });
Object.assign(window.DP, { setProject, projBar, syncSwitcher });
syncSwitcher();
// Ouvre les deux premiers groupes (Projet, Déploiements) après l'animation d'arrivée.
setTimeout(() => [...document.querySelectorAll(".nav-group-title")].slice(0, 2).forEach((b, i) => setTimeout(() => b.getAttribute("aria-expanded") === "false" && b.click(), i * 250)), 2300);
})();