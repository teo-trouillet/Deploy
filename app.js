(() => {
const LS = (k) => localStorage.getItem(k);
const SET = (k, v) => (v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v));
const S = { user: null, repos: null, q: "", timer: null, cur: null };

const h = (t, a = {}, ...c) => {
  const e = document.createElement(t);
  for (const [k, v] of Object.entries(a)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  e.append(...c.flat().filter((x) => x != null && x !== false));
  return e;
};
const ic = (n) => h("i", { "data-lucide": n });
const btn = (label, icon, fn, cls = "") => h("button", { type: "button", class: "fe-btn " + cls, onclick: fn }, icon && ic(icon), label);
const icons = () => window.lucide && lucide.createIcons();
const go = (label) => [...document.querySelectorAll(".nav-item")].find((i) => i.querySelector("span")?.textContent.trim() === label)?.click();

function toast(msg, err) {
  const t = h("div", { class: "fe-toast" + (err ? " err" : "") }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
function loading(title) {
  const ul = h("ul", { class: "fe-steps-list" });
  const o = h("div", { class: "fe-overlay" }, h("div", { class: "fe-loader" }, h("div", { class: "fe-spin" }), h("b", {}, title), ul));
  document.body.appendChild(o);
  return { step(t) { ul.querySelector("li:last-child")?.classList.add("done"); ul.append(h("li", {}, t)); }, close() { o.remove(); } };
}
const ago = (d) => {
  const s = (new Date(d) - Date.now()) / 1000, f = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  for (const [u, n] of [["day", 86400], ["hour", 3600], ["minute", 60]]) if (Math.abs(s) >= n) return f.format(Math.round(s / n), u);
  return "à l'instant";
};
const dur = (a, b) => { const s = Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000)); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };

async function gh(path, opt = {}) {
  const t = LS("fe_token");
  if (!t) throw new Error("Non connecté : Paramètres › Connexion GitHub.");
  const r = await fetch(path.startsWith("http") ? path : "https://api.github.com" + path, {
    method: opt.method || "GET",
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: "Bearer " + t, ...(opt.body ? { "Content-Type": "application/json" } : {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  if (r.status === 204) return null;
  const d = await r.json().catch(() => null);
  if (r.status === 401) { SET("fe_token"); throw new Error("Token invalide ou expiré : reconnecte-toi."); }
  if (!r.ok) throw new Error(d?.message || "Erreur " + r.status);
  return d;
}
async function ghText(path) {
  const r = await fetch("https://api.github.com" + path, { headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + LS("fe_token") } });
  if (!r.ok) throw new Error("Log indisponible (" + r.status + ")");
  return (await r.text()).replace(/\x1b\[[0-9;]*m/g, "").replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /gm, "");
}
const WF = ["name: Deploy", "on:", "  push:", "    branches: [main, master]", "  pull_request:", "    types: [opened, reopened, synchronize, closed]", "  workflow_dispatch:",
  "concurrency: preview-${{ github.ref }}", "permissions:", "  contents: write", "  pull-requests: write", "jobs:", "  deploy:", "    runs-on: ubuntu-latest", "    steps:",
  "      - uses: actions/checkout@v4", "      - name: Production", "        if: github.event_name != 'pull_request'", "        uses: JamesIves/github-pages-deploy-action@v4",
  "        with:", "          folder: .", "          branch: gh-pages", "          clean-exclude: pr-preview/", "          force: false",
  "      - name: Preview", "        if: github.event_name == 'pull_request'", "        uses: rossjrw/pr-preview-action@v1",
  "        with:", "          source-dir: .", "          preview-branch: gh-pages", "          umbrella-dir: pr-preview", ""].join("\n");
async function setupAuto(repo, L) {
  const m = await gh(`/repos/${repo}`), br = m.default_branch;
  L && L.step("Ajout du workflow de déploiement et de previews");
  const path = `/repos/${repo}/contents/.github/workflows/deploy.yml`;
  let sha; try { sha = (await gh(path + "?ref=" + br)).sha; } catch (e) { /* absent */ }
  await gh(path, { method: "PUT", body: { message: "Deploy: déploiement auto + previews par PR", content: btoa(WF), branch: br, sha } });
  L && L.step("Premier build en cours (30 s à 2 min)");
  if (sha) gh(`/repos/${repo}/actions/workflows/deploy.yml/dispatches`, { method: "POST", body: { ref: br } }).catch(() => {});
  for (let i = 0; ; i++) {
    try { await gh(`/repos/${repo}/branches/gh-pages`); break; } catch (e) {
      if (i > 40) throw new Error("La branche gh-pages n'existe pas : le build a échoué, regarde l'onglet Déploiements.");
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  L && L.step("Activation de GitHub Pages");
  const body = { source: { branch: "gh-pages", path: "/" }, build_type: "legacy" };
  try { await gh(`/repos/${repo}/pages`, { method: "PUT", body }); } catch (e) { await gh(`/repos/${repo}/pages`, { method: "POST", body }); }
}
const act = async (fn, ok) => { try { await fn(); ok && toast(ok); } catch (e) { toast(e.message, true); } };

const repos = async (force) => (!S.repos || force ? (S.repos = await gh("/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator")) : S.repos);
const cur = () => LS("fe_repo");

function setProfile(u) {
  S.user = u;
  const n = document.querySelector(".user-name"), a = document.querySelector(".user-avatar"), r = document.querySelector(".user-role");
  if (u) { n.textContent = u.login; a.textContent = u.login.slice(0, 2).toUpperCase(); r.textContent = "Connecté à GitHub"; }
}

async function deploy(repo, ref) {
  const w = await gh(`/repos/${repo}/actions/workflows`);
  const wf = w.workflows.find((x) => x.state === "active");
  if (wf) {
    try { await gh(`/repos/${repo}/actions/workflows/${wf.id}/dispatches`, { method: "POST", body: { ref: ref || "main" } }); return toast("Déploiement lancé : " + wf.name); } catch (e) { /* pas de workflow_dispatch */ }
  }
  await gh(`/repos/${repo}/pages/builds`, { method: "POST" });
  toast("Build GitHub Pages lancé");
}

async function picker(onchange) {
  return null; // le projet se choisit via le sélecteur de la navbar
  const list = await repos();
  const sel = h("select", { class: "fe-select", onchange: (e) => { SET("fe_repo", e.target.value); onchange(); } },
    h("option", { value: "" }, "Choisir un projet…"),
    list.map((r) => h("option", { value: r.full_name, selected: r.full_name === cur() }, r.full_name)));
  return sel;
}
const dotOf = (r) => (r.status !== "completed" ? "run" : r.conclusion === "success" ? "ok" : r.conclusion === "failure" ? "fail" : "");
const match = (...s) => !S.q || s.join(" ").toLowerCase().includes(S.q);

/* ---------- Vues ---------- */
async function vConnect(root) {
  const input = h("input", { class: "fe-input", type: "password", placeholder: "ghp_… ou github_pat_…", style: "min-width:320px" });
  const status = h("div", { class: "fe-meta" }, S.user ? `Connecté en tant que ${S.user.login}` : "Non connecté");
  root.append(h("div", { class: "fe-card" },
    h("div", {}, "Colle un Personal Access Token GitHub avec les droits ", h("b", {}, "repo"), " et ", h("b", {}, "workflow"), ". Il reste uniquement dans ton navigateur (localStorage) et n'est envoyé qu'à api.github.com."),
    h("a", { class: "fe-btn", href: "https://github.com/settings/tokens/new?scopes=repo,workflow&description=Deploy", target: "_blank", rel: "noopener" }, ic("external-link"), "Créer un token"),
    h("div", { class: "fe-bar", style: "margin:0" }, input,
      btn("Se connecter", "log-in", () => act(async () => { SET("fe_token", input.value.trim()); setProfile(await gh("/user")); S.repos = null; status.textContent = "Connecté en tant que " + S.user.login; input.value = ""; }, "Connecté"), "primary"),
      btn("Se déconnecter", "log-out", () => { SET("fe_token"); SET("fe_repo"); S.user = null; S.repos = null; status.textContent = "Non connecté"; toast("Déconnecté"); })),
    status));
}

async function vProjects(root) {
  const list = h("div", { class: "fe-list" });
  const form = newProjectForm(root);
  root.append(h("div", { class: "fe-bar" }, btn("Nouveau projet", "plus", () => form.toggleAttribute("hidden"), "primary")), form, list);
  const rs = (await repos()).filter((r) => match(r.full_name, r.description));
  const dots = {};
  list.append(...rs.map((r) => h("div", { class: "fe-row" },
    (dots[r.full_name] = h("span", { class: "fe-dot " + (r.has_pages ? "ok" : ""), title: r.has_pages ? "Pages actif" : "Pas de déploiement" })),
    h("div", { class: "fe-main" }, h("b", {}, r.full_name), h("span", { class: "fe-meta" }, `${r.private ? "Privé" : "Public"} · ${r.default_branch} · push ${ago(r.pushed_at)}`)),
    btn("Déployer", "rocket", () => act(() => deploy(r.full_name, r.default_branch))),
    btn("Ouvrir", "layout-dashboard", () => window.DP.setProject(r.full_name), "primary"),
    btn("Déploiement auto", "git-branch", () => confirm("Ajouter un workflow qui déploie à chaque push sur " + r.default_branch + " ?") && act(async () => { await setupAuto(r.full_name); S.repos = null; }, "Déploiement auto activé : chaque push déploie ton site")),
    r.has_pages && btn("Copier l'URL", "copy", () => navigator.clipboard.writeText(`https://${r.owner.login}.github.io/${r.name}/`).then(() => toast("URL copiée"))),
    r.has_pages && h("a", { class: "fe-btn", href: `https://${r.owner.login}.github.io/${r.name}/`, target: "_blank", rel: "noopener" }, ic("external-link"), "Visiter"))));
  if (!rs.length) list.append(h("div", { class: "fe-empty" }, "Aucun projet."));
  rs.slice(0, 12).forEach((r) => gh(`/repos/${r.full_name}/actions/runs?per_page=1`).then((d) => {
    const x = d.workflow_runs[0]; if (!x) return;
    dots[r.full_name].className = "fe-dot " + dotOf(x);
    dots[r.full_name].title = `Dernier run : ${x.status === "completed" ? x.conclusion : "en cours"} (${ago(x.created_at)})`;
  }).catch(() => {}));
}

function newProjectForm() {
  const name = h("input", { class: "fe-input", placeholder: "nom-du-site" });
  return h("div", { class: "fe-card", hidden: true, id: "fe-new" }, h("b", {}, "Nouveau site"), h("div", { class: "fe-meta" }, "Crée le dépôt, une page d'accueil, le déploiement auto, les previews par PR et GitHub Pages."),
    h("div", { class: "fe-bar", style: "margin:0" }, name, btn("Créer et déployer", "rocket", () => act(async () => {
      const n = name.value.trim(); if (!/^[\w.-]+$/.test(n)) throw new Error("Nom invalide (lettres, chiffres, - _ .).");
      const L = loading("Création de " + n);
      try {
        L.step("Création du dépôt GitHub");
        const repo = await gh("/user/repos", { method: "POST", body: { name: n, auto_init: true, description: "Créé avec Deploy" } });
        await new Promise((r) => setTimeout(r, 1500));
        L.step("Ajout de la page d'accueil");
        const html = `<!DOCTYPE html><html lang="fr"><meta charset="utf-8"><title>${n}</title><body style="font-family:sans-serif;text-align:center;padding:4rem"><h1>${n}</h1><p>Déployé avec Deploy.</p></body></html>`;
        await gh(`/repos/${repo.full_name}/contents/index.html`, { method: "PUT", body: { message: "Initial deploy", content: btoa(unescape(encodeURIComponent(html))), branch: repo.default_branch } });
        await setupAuto(repo.full_name, L);
        L.step("Site en ligne");
        S.repos = null;
        await new Promise((r) => setTimeout(r, 700)); L.close(); window.DP.setProject(repo.full_name, "Historique");
      } catch (e) { L.close(); throw e; }
    }), "primary")));
}

async function vRuns(root, filter) {
  const box = h("div", { class: "fe-list" }), stats = h("div", { class: "fe-stats" });
  root.append(h("div", { class: "fe-bar" }, await picker(() => render(S.cur)),
    btn("Déployer maintenant", "rocket", () => act(() => deploy(cur()), null), "primary")), stats, box);
  if (!cur()) return box.append(h("div", { class: "fe-empty" }, "Choisis un projet."));
  const repo = cur();
  const load = async () => {
    const d = await gh(`/repos/${repo}/actions/runs?per_page=40`);
    let runs = d.workflow_runs.filter((r) => (!filter || filter(r)) && match(r.display_title, r.head_branch, r.name));
    const done = d.workflow_runs.filter((r) => r.status === "completed"), ok = done.filter((r) => r.conclusion === "success");
    stats.replaceChildren(...[["Déploiements", d.total_count], ["Taux de réussite", done.length ? Math.round((ok.length / done.length) * 100) + " %" : "—"],
      ["Durée moyenne", ok.length ? dur(0, ok.reduce((a, r) => a + (new Date(r.updated_at) - new Date(r.run_started_at)), 0) / ok.length) : "—"]]
      .map(([k, v]) => h("div", { class: "fe-stat" }, h("b", {}, String(v)), h("span", { class: "fe-meta" }, k))));
    const firstOk = d.workflow_runs.find((r) => r.conclusion === "success")?.id;
    box.replaceChildren(...runs.map((r) => runRow(repo, r, firstOk, load)));
    if (!runs.length) box.append(h("div", { class: "fe-empty" }, "Aucun run."));
    icons();
    clearTimeout(S.timer);
    if (d.workflow_runs.some((r) => r.status !== "completed")) S.timer = setTimeout(() => load().catch(() => {}), 8000);
  };
  await load();
}

function runRow(repo, r, firstOk, reload) {
  const steps = h("div", { class: "fe-steps", hidden: true });
  const row = h("div", { class: "fe-row" }, h("span", { class: "fe-dot " + dotOf(r) }),
    h("div", { class: "fe-main" }, h("b", {}, r.display_title), h("span", { class: "fe-meta" }, `${r.name} · ${r.head_branch} · ${r.head_sha.slice(0, 7)} · ${ago(r.created_at)}${r.status === "completed" ? " · " + dur(r.run_started_at, r.updated_at) : " · en cours"}`)),
    btn("Logs", "terminal", () => act(async () => {
      if (!steps.hidden) return (steps.hidden = true);
      const j = await gh(`/repos/${repo}/actions/runs/${r.id}/jobs`);
      steps.replaceChildren(...j.jobs.flatMap((jb) => { const pre = h("pre", { class: "fe-log", hidden: true }); return [h("b", {}, jb.name,
        " ", btn("Log complet", "file-text", () => act(async () => { if (!pre.hidden) return (pre.hidden = true); pre.textContent = "Chargement…"; pre.hidden = false; pre.textContent = await ghText(`/repos/${repo}/actions/jobs/${jb.id}/logs`); pre.scrollTop = pre.scrollHeight; }))), pre, ...jb.steps.map((s) => h("div", {}, `${s.conclusion === "success" ? "✓" : s.conclusion === "failure" ? "✗" : "…"} ${s.name}`))]; }),
        h("a", { href: r.html_url, target: "_blank", rel: "noopener" }, "Logs complets sur GitHub ↗"));
      steps.hidden = false;
    })),
    r.status !== "completed"
      ? btn("Annuler", "x", () => act(async () => { await gh(`/repos/${repo}/actions/runs/${r.id}/cancel`, { method: "POST" }); reload(); }, "Annulation demandée"))
      : btn("Relancer", "rotate-cw", () => act(async () => { await gh(`/repos/${repo}/actions/runs/${r.id}/rerun`, { method: "POST" }); setTimeout(reload, 1500); }, "Run relancé")),
    r.conclusion === "success" && r.id !== firstOk && btn("Rollback", "undo-2", () => confirm("Redéployer cette version ?") && act(async () => { await gh(`/repos/${repo}/actions/runs/${r.id}/rerun`, { method: "POST" }); setTimeout(reload, 1500); }, "Rollback lancé")),
    steps);
  return row;
}

async function vActivity(root) {
  if (!S.user) setProfile(await gh("/user"));
  const ev = await gh(`/users/${S.user.login}/events?per_page=40`);
  const box = h("div", { class: "fe-list" }, ev.filter((e) => match(e.repo.name, e.type)).map((e) => h("div", { class: "fe-row" }, h("span", { class: "fe-dot ok" }),
    h("div", { class: "fe-main" }, h("b", {}, e.type.replace("Event", "")), h("span", { class: "fe-meta" }, `${e.repo.name} · ${ago(e.created_at)}${e.payload.commits ? " · " + e.payload.commits.length + " commit(s)" : ""}`)))));
  root.append(h("div", { class: "fe-bar" }), box);
}

async function vDomains(root) {
  const bar = h("div", { class: "fe-bar" }, await picker(() => render(S.cur)));
  root.append(bar);
  const repo = cur(); if (!repo) return root.append(h("div", { class: "fe-empty" }, "Choisis un projet."));
  let p;
  try { p = await gh(`/repos/${repo}/pages`); } catch (e) {
    return root.append(h("div", { class: "fe-card" }, "GitHub Pages n'est pas activé.", btn("Activer Pages", "globe", () => act(async () => {
      const m = await gh(`/repos/${repo}`); await gh(`/repos/${repo}/pages`, { method: "POST", body: { source: { branch: m.default_branch, path: "/" } } }); render(S.cur);
    }, "Pages activé"), "primary")));
  }
  const cname = h("input", { class: "fe-input", placeholder: "www.mondomaine.fr", value: p.cname || "" });
  root.append(h("div", { class: "fe-card" },
    h("div", {}, h("b", {}, "URL : "), h("a", { href: p.html_url, target: "_blank", rel: "noopener" }, p.html_url), ` · statut ${p.status || "—"}`),
    h("div", { class: "fe-bar", style: "margin:0" }, cname, btn("Enregistrer le domaine", "link-2", () => act(() => gh(`/repos/${repo}/pages`, { method: "PUT", body: { cname: cname.value.trim() || null } }), "Domaine enregistré (pense au CNAME DNS)"), "primary"),
      btn(p.https_enforced ? "HTTPS forcé ✓" : "Forcer HTTPS", "lock", () => act(() => gh(`/repos/${repo}/pages`, { method: "PUT", body: { https_enforced: true } }), "HTTPS forcé")))));
}

async function vEnvs(root) {
  root.append(h("div", { class: "fe-bar" }, await picker(() => render(S.cur))));
  const repo = cur(); if (!repo) return root.append(h("div", { class: "fe-empty" }, "Choisis un projet."));
  const [prs, brs] = await Promise.all([gh(`/repos/${repo}/pulls?state=open&per_page=30`), gh(`/repos/${repo}/branches?per_page=30`)]);
  const rows = [...prs.map((p) => ({ t: `PR #${p.number} · ${p.title}`, m: `${p.head.ref} · ${ago(p.updated_at)}`, ref: p.head.ref, url: p.html_url })),
    ...brs.map((b) => ({ t: "Branche " + b.name, m: b.protected ? "protégée" : "branche", ref: b.name, url: `https://github.com/${repo}/tree/${b.name}` }))].filter((x) => match(x.t, x.m));
  root.append(h("div", { class: "fe-list" }, rows.map((x) => h("div", { class: "fe-row" }, h("span", { class: "fe-dot" }),
    h("div", { class: "fe-main" }, h("b", {}, x.t), h("span", { class: "fe-meta" }, x.m)),
    btn("Déployer", "rocket", () => act(() => deploy(repo, x.ref))), h("a", { class: "fe-btn", href: x.url, target: "_blank", rel: "noopener" }, ic("external-link"), "Ouvrir")))));
}

async function vVars(root) {
  root.append(h("div", { class: "fe-bar" }, await picker(() => render(S.cur))));
  const repo = cur(); if (!repo) return root.append(h("div", { class: "fe-empty" }, "Choisis un projet."));
  const d = await gh(`/repos/${repo}/actions/variables?per_page=100`);
  const n = h("input", { class: "fe-input", placeholder: "NOM" }), v = h("input", { class: "fe-input", placeholder: "valeur" });
  root.append(h("div", { class: "fe-card" }, h("div", { class: "fe-bar", style: "margin:0" }, n, v, btn("Ajouter / mettre à jour", "plus", () => act(async () => {
    const body = { name: n.value.trim(), value: v.value };
    try { await gh(`/repos/${repo}/actions/variables`, { method: "POST", body }); } catch { await gh(`/repos/${repo}/actions/variables/${body.name}`, { method: "PATCH", body }); }
    render(S.cur);
  }, "Variable enregistrée"), "primary")), h("div", { class: "fe-meta" }, "Variables Actions (non secrètes), disponibles dans tes workflows de build.")),
  h("div", { class: "fe-list" }, d.variables.filter((x) => match(x.name)).map((x) => h("div", { class: "fe-row" }, h("div", { class: "fe-main" }, h("b", {}, x.name), h("span", { class: "fe-meta" }, x.value)),
    btn("Supprimer", "trash-2", () => act(async () => { await gh(`/repos/${repo}/actions/variables/${x.name}`, { method: "DELETE" }); render(S.cur); }, "Supprimée"))))));
}

async function vAnalytics(root) {
  root.append(h("div", { class: "fe-bar" }, await picker(() => render(S.cur))));
  const repo = cur(); if (!repo) return root.append(h("div", { class: "fe-empty" }, "Choisis un projet."));
  const [v, c] = await Promise.all([gh(`/repos/${repo}/traffic/views`), gh(`/repos/${repo}/traffic/clones`)]);
  const max = Math.max(1, ...v.views.map((x) => x.count));
  root.append(h("div", { class: "fe-card" }, h("div", {}, h("b", {}, `${v.count} vues · ${v.uniques} visiteurs uniques`), ` (14 jours, page du dépôt) · ${c.count} clones`),
    h("div", { class: "fe-bars" }, v.views.map((x) => h("div", { title: `${x.timestamp.slice(0, 10)} : ${x.count}`, style: `height:${(x.count / max) * 100}%` })))));
}

const PROJ = ["Aperçu", "Historique", "Previews", "Logs", "Fichiers", "Domaines", "Variables", "Analytics"];
const info = (t) => async (root) => root.append(h("div", { class: "fe-card" }, t));
const VIEWS = {
  "Projets": vProjects, "Déploiements": (r) => vRuns(r), "Activité": vActivity,
  "Historique": (r) => vRuns(r), "Tous les runs": (r) => vRuns(r), "Réussis": (r) => vRuns(r, (x) => x.conclusion === "success"),
  "En cours": (r) => vRuns(r, (x) => x.status !== "completed"), "Échecs": (r) => vRuns(r, (x) => x.conclusion === "failure"),
  "Annulés": (r) => vRuns(r, (x) => x.conclusion === "cancelled"),
  "Domaines": vDomains, "Environnements": vEnvs, "Variables": vVars, "Analytics": vAnalytics, "Connexion GitHub": vConnect,
  "Sécurité": info("Ton token n'est stocké que dans le localStorage de ce navigateur et n'est envoyé qu'à api.github.com. Utilise un token à durée limitée et révoque-le sur GitHub si besoin."),
  "Aide": info("1) Paramètres › Connexion GitHub : colle ton token. 2) Projets › Nouveau projet pour créer et déployer un site. 3) Déploiements : logs, relance, rollback."),
};

async function render(target) {
  clearTimeout(S.timer);
  S.cur = target;
  const { label, root } = target;
  [...root.querySelectorAll(":scope > :not(h1):not(.fe-desc)")].forEach((n) => n.remove());
  const fn = VIEWS[label];
  if (!fn) return;
  const box = h("div");
  root.append(box);
  try {
    if (label !== "Connexion GitHub" && !LS("fe_token") && !["Sécurité", "Aide"].includes(label))
      box.append(h("div", { class: "fe-card" }, "Connecte ton compte GitHub pour commencer.", btn("Connexion GitHub", "key-round", () => go("Connexion GitHub"), "primary")));
    else if (PROJ.includes(label) && !cur()) box.append(h("div", { class: "fe-card" }, "Aucun projet sélectionné.", btn("Choisir un projet", "folder-git-2", () => document.getElementById("project-switcher").click(), "primary")));
    else { if (PROJ.includes(label) && window.DP.projBar) await window.DP.projBar(box, label); await fn(box); }
  } catch (e) { box.append(h("div", { class: "fe-card" }, "Erreur : " + e.message)); }
  icons();
}

window.Deploy = {
  render: (label, root) => {
    if (label === "Projets") { if (S.keep) S.keep = false; else S.proj = null; } root.querySelector("p")?.classList.add("fe-desc"); return render({ label, root }); },
  action: (a) => {
    if (a === "new") { go("Projets"); setTimeout(() => document.getElementById("fe-new")?.removeAttribute("hidden"), 300); }
    if (a === "refresh") { S.repos = null; S.cur && render(S.cur); }
    if (a === "deploy") act(() => { if (!cur()) throw new Error("Choisis d'abord un projet."); return deploy(cur()); });
  },
};

document.querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", () => Deploy.action(b.dataset.action)));
let deb;
document.querySelector(".search-input").addEventListener("input", (e) => { S.q = e.target.value.toLowerCase(); clearTimeout(deb); deb = setTimeout(() => S.cur && render(S.cur), 250); });
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); document.getElementById("searchbar").click(); }
});
if (LS("fe_token")) gh("/user").then(setProfile).catch(() => {});
window.DP = { h, ic, btn, gh, act, toast, ago, dur, S, SET, LS, cur, icons, deploy, setupAuto, render, go, picker, match, dotOf, repos, VIEWS, loading };
})();