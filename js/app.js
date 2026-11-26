(() => {
const LS = (k) => localStorage.getItem(k);
const SET = (k, v) => (v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v));
const S = { user: null, repos: null, q: "", timer: null, cur: null, path: "", live: false };

// Base64 UTF-8 sûr (remplace escape/unescape, dépréciés) et sans dépassement de pile.
const toB64 = (s) => { const b = new TextEncoder().encode(s); let r = ""; for (let i = 0; i < b.length; i += 0x8000) r += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(r); };
const fromB64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

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
  const t = h("div", { class: "fe-toast" + (err ? " err" : ""), role: err ? "alert" : "status" }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
function loading(title, total = 6) {
  const ul = h("ul", { class: "fe-steps-list" }), bar = h("i"), n = { v: 0 };
  const o = h("div", { class: "fe-overlay" }, h("div", { class: "fe-loader" }, h("span", { class: "fe-lico" }, ic("rocket")), h("b", { class: "fe-ltitle" }, title),
    h("span", { class: "fe-meta" }, "Ça prend environ une minute. Laisse cette fenêtre ouverte."), h("div", { class: "fe-progress" }, bar), ul));
  document.body.appendChild(o); icons();
  const set = (f) => (bar.style.width = Math.max(4, Math.min(100, (f / total) * 100)) + "%");
  set(0.4);
  return {
    step(t) { ul.querySelector("li:last-child")?.classList.add("done"); ul.append(h("li", {}, h("span", { class: "fe-lstate" }, ic("check")), t)); n.v++; set(n.v - 0.5); icons(); },
    done() { ul.querySelectorAll("li").forEach((li) => li.classList.add("done")); set(total); },
    close() { o.classList.add("out"); setTimeout(() => o.remove(), 220); },
  };
}
const ago = (d) => {
  const s = (new Date(d) - Date.now()) / 1000, f = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  for (const [u, n] of [["day", 86400], ["hour", 3600], ["minute", 60]]) if (Math.abs(s) >= n) return f.format(Math.round(s / n), u);
  return "à l'instant";
};
const dur = (a, b) => { const s = Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000)); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; };

// Messages d'erreur GitHub en français (le message d'origine est conservé entre parenthèses).
function frErr(status, msg) {
  const fr = { 403: "Accès refusé : vérifie les droits de ton token (repo, workflow) ou la protection de la branche.", 404: "Introuvable (ou non autorisé) : vérifie le nom du dépôt et les droits du token.",
    409: "Conflit : la ressource a changé entre-temps, recharge la page.", 422: "GitHub a refusé ces données : vérifie le nom ou le contenu envoyé." }[status];
  if (status >= 500) return "GitHub est momentanément indisponible, réessaie dans un instant.";
  return fr ? (msg ? `${fr} (${msg})` : fr) : msg || "Erreur " + status;
}
async function gh(path, opt = {}) {
  const t = LS("fe_token");
  if (!t) throw new Error("Non connecté : Paramètres › Git.");
  const r = await fetch(path.startsWith("http") ? path : "https://api.github.com" + path, {
    method: opt.method || "GET",
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: "Bearer " + t, ...(opt.body ? { "Content-Type": "application/json" } : {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  if (r.status === 204) return null;
  const d = await r.json().catch(() => null);
  if (r.status === 401) { SET("fe_token"); throw new Error("Token invalide ou expiré : reconnecte-toi."); }
  if ((r.status === 403 || r.status === 429) && r.headers.get("x-ratelimit-remaining") === "0") {
    const at = new Date(r.headers.get("x-ratelimit-reset") * 1000).toLocaleTimeString("fr-FR", { timeStyle: "short" });
    throw new Error(`Limite de requêtes GitHub atteinte : réessaie vers ${at}.`);
  }
  if (!r.ok) throw new Error(frErr(r.status, d?.message));
  return d;
}
async function ghText(path) {
  const r = await fetch("https://api.github.com" + path, { headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + LS("fe_token") } });
  if (r.status === 401) { SET("fe_token"); throw new Error("Token invalide ou expiré : reconnecte-toi."); }
  if (!r.ok) throw new Error("Log indisponible (" + r.status + ")");
  return (await r.text()).replace(/\x1b\[[0-9;]*m/g, "").replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /gm, "");
}
// Workflow installé dans les projets : build auto (npm) si package.json, sinon publication telle quelle.
// Réglable via les variables Actions BUILD_COMMAND et OUTPUT_DIR.
const WF = [
  "name: Deploy",
  "on:",
  "  push:",
  "    branches: [main, master]",
  "  pull_request:",
  "    types: [opened, reopened, synchronize, closed]",
  "  workflow_dispatch:",
  "concurrency: preview-${{ github.ref }}",
  "permissions:",
  "  contents: write",
  "  pull-requests: write",
  "jobs:",
  "  deploy:",
  "    runs-on: ubuntu-latest",
  "    steps:",
  "      - uses: actions/checkout@v4",
  "      - uses: actions/setup-node@v4",
  "        if: github.event.action != 'closed'",
  "        with:",
  "          node-version: 22",
  "      - name: Build",
  "        id: build",
  "        if: github.event.action != 'closed'",
  "        env:",
  "          BUILD_COMMAND: ${{ vars.BUILD_COMMAND }}",
  "          OUTPUT_DIR: ${{ vars.OUTPUT_DIR }}",
  "        run: |",
  "          DIR=\"$OUTPUT_DIR\"",
  "          if [ -f package.json ]; then",
  "            npm ci || npm install",
  "            if [ -n \"$BUILD_COMMAND\" ]; then bash -c \"$BUILD_COMMAND\"",
  "            elif grep -q '\"build\"' package.json; then npm run build; fi",
  "            if [ -z \"$DIR\" ]; then for d in dist build out public _site; do [ -d \"$d\" ] && DIR=\"$d\" && break; done; fi",
  "          fi",
  "          echo \"dir=${DIR:-.}\" >> \"$GITHUB_OUTPUT\"",
  "      - name: Production",
  "        if: github.event_name != 'pull_request'",
  "        uses: JamesIves/github-pages-deploy-action@v4",
  "        with:",
  "          folder: ${{ steps.build.outputs.dir }}",
  "          branch: gh-pages",
  "          clean-exclude: pr-preview/",
  "          force: false",
  "      - name: Preview",
  "        if: github.event_name == 'pull_request'",
  "        uses: rossjrw/pr-preview-action@v1",
  "        with:",
  "          source-dir: ${{ steps.build.outputs.dir }}",
  "          preview-branch: gh-pages",
  "          umbrella-dir: pr-preview",
].join("\n") + "\n";
async function setupAuto(repo, L) {
  const m = await gh(`/repos/${repo}`), br = m.default_branch;
  L && L.step("Ajout du workflow de déploiement et de previews");
  const path = `/repos/${repo}/contents/.github/workflows/deploy.yml`;
  let sha; try { sha = (await gh(path + "?ref=" + br)).sha; } catch (e) { /* absent */ }
  await gh(path, { method: "PUT", body: { message: "Deploy: déploiement auto + previews par PR", content: toB64(WF), branch: br, sha } });
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
    try { await gh(`/repos/${repo}/actions/workflows/${wf.id}/dispatches`, { method: "POST", body: { ref: ref || (await gh(`/repos/${repo}`)).default_branch } }); return toast("Déploiement lancé : " + wf.name); } catch (e) { /* pas de workflow_dispatch */ }
  }
  await gh(`/repos/${repo}/pages/builds`, { method: "POST" });
  toast("Build GitHub Pages lancé");
}

const dotOf = (r) => (r.status !== "completed" ? "run" : r.conclusion === "success" ? "ok" : r.conclusion === "failure" ? "fail" : "");
const match = (...s) => !S.q || s.join(" ").toLowerCase().includes(S.q);

/* ---------- Vues ---------- */
async function vConnect(root) {
  if (LS("fe_token") && !S.user) try { setProfile(await gh("/user")); } catch (e) { /* token invalide */ }
  const u = S.user, input = h("input", { class: "fe-input", type: "password", placeholder: "ghp_… ou github_pat_…", autocomplete: "off" });
  const set = (t, desc, foot, ...body) => h("div", { class: "fe-set" }, h("div", { class: "fe-setbody" }, h("b", {}, t), h("p", { class: "fe-meta" }, desc), ...body), foot && h("div", { class: "fe-setfoot fe-footrow" }, ...foot));
  const connect = () => act(async () => { SET("fe_token", input.value.trim()); setProfile(await gh("/user")); S.repos = null; render(S.cur); }, "Connecté");
  root.append(h("div", { class: "fe-settings" },
    set("Compte GitHub", "Le compte utilisé par Deploy pour lire et modifier tes dépôts.", null,
      h("div", { class: "fe-conn" }, u ? h("img", { class: "fe-uava", src: u.avatar_url, alt: "" }) : h("span", { class: "fe-uava" }, ic("user")), h("div", { class: "fe-main" }, h("b", {}, u ? u.login : "Non connecté"), h("span", { class: "fe-meta" }, u ? "Connecté à GitHub" : "Ajoute un token pour commencer")), h("span", { class: "fe-pill " + (u ? "prod" : "") }, u ? "Actif" : "Hors ligne")),
      u && h("div", { class: "fe-bar", style: "margin:0" }, btn("Se déconnecter", "log-out", () => { SET("fe_token"); SET("fe_repo"); S.user = null; S.repos = null; toast("Déconnecté"); render(S.cur); }))),
    set("Personal Access Token", "Colle un token GitHub. Il reste uniquement dans ton navigateur.", [h("span", { class: "fe-meta" }, "Droits requis : repo, workflow (delete_repo seulement pour supprimer un projet)."), h("a", { class: "fe-btn", href: "https://github.com/settings/tokens/new?scopes=repo,workflow&description=Deploy", target: "_blank", rel: "noopener" }, ic("external-link"), "Créer un token")],
      h("div", { class: "fe-field" }, input, btn("Se connecter", "log-in", connect, "primary")))));
  input.addEventListener("keydown", (e) => e.key === "Enter" && connect());
}

async function vProjects(root) {
  const form = newProjectForm(root); form.removeAttribute("hidden"); form.classList.add("fe-hero"); const grid = h("div", { class: "fe-cards" }), side = h("div", { class: "fe-side" });
  root.append(form, h("div", { class: "fe-split" }, side, h("div", {}, h("div", { class: "fe-sec" }, "Projets"), grid)));
  const all = await repos(), rs = all.filter((r) => match(r.full_name, r.description)), dots = {}, msgs = {};
  const alerts = h("div", { class: "fe-meta" }, "Vérification…");
  side.append(h("div", { class: "fe-sec" }, "Utilisation"), h("div", { class: "fe-card" }, [["Projets", all.length], ["Pages actif", all.filter((r) => r.has_pages).length], ["Privés", all.filter((r) => r.private).length]].map(([k, v]) => h("div", { class: "fe-kv" }, h("span", {}, k), h("b", {}, String(v))))),
    h("div", { class: "fe-sec" }, "Alertes"), h("div", { class: "fe-card fe-center" }, ic("bell"), alerts),
    h("div", { class: "fe-sec" }, "Projets récents"), h("div", { class: "fe-list" }, all.slice(0, 3).map((r) => h("div", { class: "fe-row fe-click", onclick: () => window.DP.setProject(r.full_name) }, ic("folder-git-2"), h("div", { class: "fe-main" }, h("b", {}, r.name), h("span", { class: "fe-meta" }, "push " + ago(r.pushed_at)))))));
  grid.append(...rs.map((r) => h("div", { class: "fe-pcard", onclick: () => window.DP.setProject(r.full_name) },
    h("div", { class: "fe-phead" }, h("span", { class: "fe-avatar" }, r.name[0].toUpperCase()), h("div", { class: "fe-main" }, h("b", {}, r.name), h("span", { class: "fe-meta" }, r.has_pages ? `${r.owner.login}.github.io/${r.name}` : "Pas de déploiement")), (dots[r.full_name] = h("span", { class: "fe-dot " + (r.has_pages ? "ok" : "") }))),
    (msgs[r.full_name] = h("div", { class: "fe-pmsg" }, ic("git-commit-horizontal"), r.description || "—")),
    h("div", { class: "fe-meta fe-pfoot" }, ic("git-branch"), `${r.full_name} · ${ago(r.pushed_at)}`))));
  if (!rs.length) grid.append(h("div", { class: "fe-empty" }, "Aucun projet."));
  icons();
  let fails = 0;
  await Promise.all(rs.slice(0, 12).map((r) => gh(`/repos/${r.full_name}/actions/runs?per_page=1`).then((d) => {
    const x = d.workflow_runs[0]; if (!x) return;
    dots[r.full_name].className = "fe-dot " + dotOf(x); msgs[r.full_name].lastChild.textContent = x.display_title; if (x.conclusion === "failure") fails++;
  }).catch(() => {})));
  alerts.textContent = fails ? `${fails} projet(s) avec un dernier déploiement en échec.` : "Aucune alerte.";
}

function newProjectForm() {
  const name = h("input", { class: "fe-input", placeholder: "nom-du-site" });
  return h("div", { class: "fe-card", hidden: true, id: "fe-new" }, h("b", { class: "fe-herotitle" }, "Crée ton prochain projet"), h("div", { class: "fe-meta" }, "Un nom, un clic : dépôt GitHub, page d'accueil, déploiement auto, previews par PR et GitHub Pages."),
    h("div", { class: "fe-bar", style: "margin:0" }, name, btn("Créer et déployer", "rocket", () => act(async () => {
      const n = name.value.trim(); if (!/^[\w.-]+$/.test(n)) throw new Error("Nom invalide (lettres, chiffres, - _ .).");
      const L = loading("Création de " + n);
      try {
        L.step("Création du dépôt GitHub");
        const repo = await gh("/user/repos", { method: "POST", body: { name: n, auto_init: true, description: "Créé avec Deploy" } });
        await new Promise((r) => setTimeout(r, 1500));
        L.step("Ajout de la page d'accueil");
        const html = `<!DOCTYPE html><html lang="fr"><meta charset="utf-8"><title>${n}</title><body style="font-family:sans-serif;text-align:center;padding:4rem"><h1>${n}</h1><p>Déployé avec Deploy.</p></body></html>`;
        await gh(`/repos/${repo.full_name}/contents/index.html`, { method: "PUT", body: { message: "Initial deploy", content: toB64(html), branch: repo.default_branch } });
        await setupAuto(repo.full_name, L);
        L.step("Site en ligne"); L.done();
        S.repos = null;
        await new Promise((r) => setTimeout(r, 700)); L.close(); window.DP.setProject(repo.full_name, "Déploiements");
      } catch (e) { L.close(); throw e; }
    }), "primary")));
}

async function vRuns(root, filter) {
  const box = h("div", { class: "fe-list" }), stats = h("div", { class: "fe-stats" }), FS = { Tous: () => 1, Réussis: (r) => r.conclusion === "success", "En cours": (r) => r.status !== "completed", Échecs: (r) => r.conclusion === "failure", Annulés: (r) => r.conclusion === "cancelled" };
  const fsel = h("select", { class: "fe-select chip", onchange: () => load() }, Object.keys(FS).map((k) => h("option", {}, "Statut : " + k)));
  root.append(h("div", { class: "fe-bar" }, fsel,
    btn("Déployer maintenant", "rocket", () => act(() => deploy(cur()), null), "primary")), stats, box);
  if (!cur()) return box.append(h("div", { class: "fe-empty" }, "Choisis un projet."));
  const repo = cur();
  const load = async () => {
    const d = await gh(`/repos/${repo}/actions/runs?per_page=40`);
    let runs = d.workflow_runs.filter((r) => (!filter || filter(r)) && FS[fsel.value.slice(9)](r) && match(r.display_title, r.head_branch, r.name));
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
  const prev = r.event === "pull_request", name = repo.split("/")[1];
  const row = h("div", { class: "fe-row fe-dep" }, h("div", { class: "fe-pname" }, h("span", { class: "fe-avatar sm" }, name[0].toUpperCase()), name), h("b", { class: "fe-ell" }, r.display_title),
    h("span", { class: "fe-scell" }, h("span", { class: "fe-dot " + dotOf(r) }), r.status === "completed" ? `${r.conclusion === "success" ? "Prêt" : r.conclusion} ${dur(r.run_started_at, r.updated_at)}` : "En cours"),
    h("span", { class: "fe-pill " + (prev ? "prev" : "prod") }, ic(prev ? "eye" : "arrow-up-circle"), prev ? "Aperçu PR" : "Production"), h("span", { class: "fe-mono" }, r.head_sha.slice(0, 7)),
    h("span", { class: "fe-meta fe-pfoot" }, ic("git-branch"), r.head_branch), h("span", { class: "fe-meta" }, ago(r.created_at)),
    btn("Journaux", "terminal", () => act(async () => {
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
    r.conclusion === "success" && r.id !== firstOk && btn("Restaurer", "undo-2", () => confirm("Redéployer cette version ?") && act(async () => { await gh(`/repos/${repo}/actions/runs/${r.id}/rerun`, { method: "POST" }); setTimeout(reload, 1500); }, "Restauration lancée")),
    steps);
  return row;
}

async function vActivity(root) {
  if (!S.user) setProfile(await gh("/user"));
  const ev = (await gh(`/users/${S.user.login}/events?per_page=60`)).filter((e) => match(e.repo.name, e.type));
  const T = { PushEvent: ["git-commit-horizontal", "Push"], PullRequestEvent: ["git-pull-request", "Pull request"], CreateEvent: ["plus-circle", "Création"], DeleteEvent: ["trash-2", "Suppression"], IssuesEvent: ["circle-dot", "Ticket"], IssueCommentEvent: ["message-circle", "Commentaire"], WatchEvent: ["star", "Étoile"], ForkEvent: ["git-fork", "Fork"], ReleaseEvent: ["package", "Release"] };
  const day = (d) => { const x = new Date(d), k = Math.round((new Date(new Date().toDateString()) - new Date(x.toDateString())) / 864e5); return k === 0 ? "Aujourd'hui" : k === 1 ? "Hier" : x.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); };
  const groups = {}; ev.forEach((e) => (groups[day(e.created_at)] ||= []).push(e));
  root.append(...Object.entries(groups).flatMap(([d, es]) => [h("div", { class: "fe-sec" }, d), h("div", { class: "fe-list" }, es.map((e) => {
    const [i, l] = T[e.type] || ["activity", e.type.replace("Event", "")], c = e.payload.commits?.[0]?.message?.split("\n")[0] || e.payload.pull_request?.title || e.payload.issue?.title || e.payload.ref || "";
    return h("div", { class: "fe-row" }, h("span", { class: "fe-iconbox sm" }, ic(i)), h("div", { class: "fe-main" }, h("b", {}, l), h("span", { class: "fe-meta fe-ell" }, e.repo.name + (c ? " · " + c : ""))), h("span", { class: "fe-meta" }, ago(e.created_at)));
  }))]));
  if (!ev.length) root.append(h("div", { class: "fe-empty" }, "Aucune activité récente."));
}

async function vDomains(root) {
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

async function vVars(root) {
  const repo = cur(); if (!repo) return root.append(h("div", { class: "fe-empty" }, "Choisis un projet."));
  const d = await gh(`/repos/${repo}/actions/variables?per_page=100`);
  const n = h("input", { class: "fe-input", placeholder: "NOM" }), v = h("input", { class: "fe-input", placeholder: "valeur" });
  root.append(h("div", { class: "fe-card" }, h("div", { class: "fe-bar", style: "margin:0" }, n, v, btn("Ajouter / mettre à jour", "plus", () => act(async () => {
    const body = { name: n.value.trim(), value: v.value };
    try { await gh(`/repos/${repo}/actions/variables`, { method: "POST", body }); } catch { await gh(`/repos/${repo}/actions/variables/${body.name}`, { method: "PATCH", body }); }
    render(S.cur);
  }, "Variable enregistrée"), "primary")), h("div", { class: "fe-meta" }, "Variables Actions (non secrètes). Spéciales : BUILD_COMMAND (ex. npm run build) et OUTPUT_DIR (ex. dist) règlent le build du déploiement ; sans elles, Deploy détecte package.json et le dossier dist/build/out.")),
  h("div", { class: "fe-list" }, d.variables.filter((x) => match(x.name)).map((x) => h("div", { class: "fe-row" }, h("div", { class: "fe-main" }, h("b", {}, x.name), h("span", { class: "fe-meta" }, x.value)),
    btn("Supprimer", "trash-2", () => act(async () => { await gh(`/repos/${repo}/actions/variables/${x.name}`, { method: "DELETE" }); render(S.cur); }, "Supprimée"))))));
}

const PROJ = ["Aperçu", "Déploiements", "Journaux", "Fichiers", "Domaines", "Variables d'environnement", "Statistiques", "Général", "Environnements", "Publications", "Tags", "Changelog", "Comparer", "Support"];
const info = (t) => async (root) => root.append(h("div", { class: "fe-card" }, t));
const VIEWS = {
  "Projets": vProjects, "Déploiements": (r) => vRuns(r), "Activité": vActivity,
  "Domaines": vDomains, "Variables d'environnement": vVars, "Git": vConnect,
  "Sécurité": info("Ton token n'est stocké que dans le localStorage de ce navigateur et n'est envoyé qu'à api.github.com. Utilise un token à durée limitée et révoque-le sur GitHub si besoin."),
  "Support": info("1) Paramètres › Git : colle ton token. 2) Projets › Nouveau projet pour créer et déployer un site. 3) Déploiements : journaux, relance, restauration."),
};

function onboarding() {
  const step = (n, t, d, ...x) => h("li", { class: "fe-onb-step" }, h("span", { class: "fe-onb-n" }, String(n)), h("div", {}, h("b", {}, t), h("p", { class: "fe-meta" }, d), ...x));
  return h("div", { class: "fe-card fe-onb" }, h("b", { class: "fe-herotitle" }, "Bienvenue sur Deploy"), h("span", { class: "fe-meta" }, "Trois étapes pour mettre ton premier site en ligne."),
    h("ol", { class: "fe-onb-list" },
      step(1, "Crée un token GitHub", "Droits repo et workflow, avec une expiration courte.", h("a", { class: "fe-btn", href: "https://github.com/settings/tokens/new?scopes=repo,workflow&description=Deploy", target: "_blank", rel: "noopener" }, ic("external-link"), "Créer un token")),
      step(2, "Colle-le dans Deploy", "Il reste uniquement dans ton navigateur.", btn("Ouvrir Paramètres › Git", "key-round", () => go("Git"), "primary")),
      step(3, "Choisis ou crée un projet", "Un nom suffit : dépôt, workflow et GitHub Pages sont configurés pour toi.")));
}

async function render(target) {
  clearTimeout(S.timer);
  S.cur = target;
  const { label, root } = target;
  [...root.querySelectorAll(":scope > :not(h1):not(.fe-desc)")].forEach((n) => n.remove());
  const fn = VIEWS[label];
  if (!fn) return;
  const box = h("div");
  root.append(box);
  const sk = h("div", { class: "fe-skel", "aria-hidden": "true" }, h("i"), h("i"), h("i")); box.append(sk);
  try {
    if (label !== "Git" && !LS("fe_token") && !["Sécurité"].includes(label))
      box.append(onboarding());
    else if (PROJ.includes(label) && !cur()) box.append(h("div", { class: "fe-card" }, "Aucun projet sélectionné.", btn("Choisir un projet", "folder-git-2", () => document.getElementById("project-switcher").click(), "primary")));
    else { if (PROJ.includes(label) && window.DP.projBar) await window.DP.projBar(box, label); await fn(box); }
  } catch (e) { box.append(h("div", { class: "fe-card" }, "Erreur : " + e.message)); } finally { sk.remove(); }
  icons();
}

window.Deploy = {
  render: (label, root) => {
    if (label === "Projets") { if (S.keep) S.keep = false; else S.proj = null; } root.querySelector("p")?.classList.add("fe-desc"); return render({ label, root }); },
  action: (a) => {
    if (a === "new") { go("Projets"); setTimeout(() => { const f = document.getElementById("fe-new"); f?.removeAttribute("hidden"); f?.querySelector("input")?.focus(); }, 300); }
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
window.DP = { h, ic, btn, gh, act, toast, ago, dur, S, SET, LS, cur, icons, deploy, setupAuto, render, go, toB64, fromB64, match, dotOf, repos, VIEWS, loading };
})();