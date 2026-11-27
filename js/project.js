/* Onglet Projets : bandeau d'état, assistant de création sur un espace quadrillé (les étapes montent l'une après l'autre), liste des projets.
   Chargé après project.js : remplace la vue « Projets ». */
(() => {
const { h, ic, btn, gh, act, ago, S, icons, repos, setupAuto, loading, match, dotOf, toB64, TEMPLATES, upsertVar, VIEWS } = window.DP;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = (r) => !r ? "" : r.status !== "completed" ? "En cours" : r.conclusion === "success" ? "Prêt" : r.conclusion === "cancelled" ? "Annulé" : "Échec";

/* ---------- Assistant de création ---------- */
const FLOW = {
  github: ["Choisir une méthode", "Sélectionner un dépôt", "Créer et déployer"],
  hello: ["Choisir une méthode", "Créer et déployer"],
  tpl: ["Choisir une méthode", "Choisir un modèle", "Créer et déployer"],
  upload: ["Choisir une méthode", "Importer les fichiers", "Créer et déployer"],
};
const METHODS = [
  ["github", "github", "Continuer avec GitHub", "Importer un dépôt existant", "", true],
  ["hello", "globe", "Commencer avec Hello World !", "Une page d'accueil prête à publier", "green"],
  ["tpl", "compass", "Choisir un modèle", "Portfolio, lien en bio, page en construction…", "blue"],
  ["upload", "folder-open", "Importer tes fichiers statiques", "HTML, CSS, JS, images : un seul commit", "amber"],
];
const MAX_FILES = 300;
const readB64 = (f) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result.split(",")[1]); r.onerror = ko; r.readAsDataURL(f); });
// Chemins des fichiers : si un dossier a été choisi, on retire le dossier parent commun pour que index.html soit à la racine du site.
const toItems = (fs) => {
  const raw = fs.map((f) => f.webkitRelativePath || f.name), top = raw[0]?.includes("/") ? raw[0].split("/")[0] + "/" : "";
  const strip = top && raw.every((p) => p.startsWith(top));
  return fs.map((f, i) => ({ f, path: strip ? raw[i].slice(top.length) : raw[i] }));
};
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + " Mo" : Math.max(1, Math.round(b / 1024)) + " Ko");

async function pushFiles(repo, items, L) {
  L.step(`Envoi de ${items.length} fichier(s)`);
  const base = `/repos/${repo.full_name}`, ref = await gh(`${base}/git/ref/heads/${repo.default_branch}`), head = await gh(`${base}/git/commits/${ref.object.sha}`), tree = [];
  for (const { f, path } of items) {
    const blob = await gh(`${base}/git/blobs`, { method: "POST", body: { content: await readB64(f), encoding: "base64" } });
    tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const t = await gh(`${base}/git/trees`, { method: "POST", body: { base_tree: head.tree.sha, tree } });
  const c = await gh(`${base}/git/commits`, { method: "POST", body: { message: "Initial deploy", tree: t.sha, parents: [ref.object.sha] } });
  await gh(`${base}/git/refs/heads/${repo.default_branch}`, { method: "PATCH", body: { sha: c.sha } });
}
async function createSite(n, L, D) {
  L.step("Création du dépôt GitHub");
  const repo = await gh("/user/repos", { method: "POST", body: { name: n, auto_init: true, description: "Créé avec Deploy" } });
  await sleep(1500);
  if (D.method === "upload") await pushFiles(repo, D.items, L);
  else {
    L.step("Ajout de la page d'accueil");
    await gh(`/repos/${repo.full_name}/contents/index.html`, { method: "PUT", body: { message: "Initial deploy", content: toB64(TEMPLATES[D.tpl](n)), branch: repo.default_branch } });
  }
  await setupAuto(repo.full_name, L);
  L.step("Site en ligne");
  return repo;
}

// Une étape = une carte dans l'espace quadrillé : titre, sous-titre, contenu et pied (Retour / Suivant).
const pane = (title, sub, content, back, next) => h("div", { class: "cf-wz-pane next" }, h("div", { class: "cf-wz-card" },
  h("div", { class: "cf-wz-body" }, h("b", { class: "cf-wz-h" }, title), sub && h("p", { class: "cf-wz-sub" }, sub), content),
  (back || next) && h("div", { class: "cf-wz-foot" }, back || h("span"), next || h("span"))));

function wizard() {
  const D = { method: null, repo: null, tpl: "Page simple", items: [] };
  let panes = [], at = 0, steps = ["Choisir une méthode"];
  const view = h("div", { class: "cf-wz-view" }), side = h("ol", { class: "cf-wz-steps" });
  // La hauteur du cadre suit la carte affichée ; --vh est la distance de glissement (assez grande pour sortir du cadre).
  const fit = () => { const p = panes[at]; if (!p) return; view.style.setProperty("--vh", Math.max(...panes.map((x) => x.offsetHeight)) + 120 + "px"); view.style.height = p.offsetHeight + 56 + "px"; };
  const ro = new ResizeObserver(() => fit());
  // Étape i : les précédentes montent et sortent par le haut, la suivante monte du bas et prend leur place.
  const show = (i) => {
    at = i;
    panes.forEach((p, k) => { p.className = "cf-wz-pane " + (k < i ? "past" : k === i ? "now" : "next"); p.inert = k !== i; });
    side.replaceChildren(...steps.map((t, k) => h("li", { class: k === at ? "on" : k < at ? "done" : "" }, h("i"), t)));
    fit(); panes[i]._on?.(); icons();
  };
  const add = (...els) => { els.forEach((e) => { panes.push(e); view.append(e); ro.observe(e); }); void view.offsetHeight; };
  const next = () => show(at + 1), prev = () => show(at - 1);
  const backBtn = () => btn("Retour", null, prev, "ghost");
  const nextBtn = (label = "Suivant", fn = next) => btn(label, "arrow-right", fn, "primary");

  const stepMethod = () => pane("Créer quelque chose de nouveau", "Pars d'un modèle, connecte un dépôt ou importe ton code.",
    h("div", { class: "cf-wz-opts" }, METHODS.map(([m, icon, t, d, c, dot]) => h("button", { type: "button", class: "cf-wz-opt", onclick: () => setMethod(m) },
      h("span", { class: "cf-wz-ico " + c }, ic(icon), dot && h("i", { class: "fe-dot ok" })), h("span", { class: "cf-wz-t" }, h("b", {}, t), h("small", {}, d))))));

  const stepRepo = () => {
    const own = h("select", { class: "fe-select", "aria-label": "Compte" }), q = h("input", { class: "fe-input", placeholder: "Rechercher des dépôts…", "aria-label": "Rechercher un dépôt" });
    const list = h("div", { class: "cf-wz-list" }, h("p", { class: "cf-none" }, "Chargement…")), go = nextBtn(); go.disabled = true;
    let all = [];
    const draw = () => {
      const f = q.value.toLowerCase(), rows = all.filter((r) => r.owner.login === own.value && r.name.toLowerCase().includes(f));
      list.replaceChildren(...(rows.length ? rows.map((r) => h("button", { type: "button", class: "cf-wz-item", "aria-pressed": String(D.repo === r.full_name), onclick: (e) => {
        D.repo = r.full_name; go.disabled = false; list.querySelectorAll(".cf-wz-item").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
      } }, h("span", {}, r.name), r.private && h("em", { class: "cf-chip" }, "Privé"))) : [h("p", { class: "cf-none" }, "Aucun dépôt.")]));
    };
    repos().then((a) => {
      all = a; const me = S.user?.login, owners = [...new Set(a.map((r) => r.owner.login))].sort((x, y) => (x === me ? -1 : y === me ? 1 : x.localeCompare(y)));
      own.replaceChildren(...owners.map((o) => h("option", { value: o }, o))); draw();
    }).catch((e) => list.replaceChildren(h("p", { class: "cf-none" }, e.message)));
    own.addEventListener("change", draw); q.addEventListener("input", draw);
    return pane("Sélectionner un dépôt", "Choisis le dépôt GitHub à déployer.", [h("div", { class: "cf-wz-row" }, own, q), list], backBtn(), go);
  };

  const stepTpl = () => {
    const grid = h("div", { class: "cf-wz-tpls" }, Object.keys(TEMPLATES).map((k) => h("button", { type: "button", class: "cf-wz-tpl", "aria-pressed": String(k === D.tpl), onclick: (e) => {
      D.tpl = k; grid.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
    } }, ic("layout-template"), k)));
    return pane("Choisir un modèle", "Une base de site statique que tu personnaliseras ensuite.", grid, backBtn(), nextBtn());
  };

  const stepFiles = () => {
    const sum = h("div", { class: "cf-wz-note" }, "Aucun fichier sélectionné."), go = nextBtn(); go.disabled = true;
    const set = (fs) => {
      D.items = fs.length ? toItems(fs) : [];
      const n = D.items.length, tooMany = n > MAX_FILES, hasIndex = D.items.some((x) => /^index\.html?$/i.test(x.path));
      sum.textContent = !n ? "Aucun fichier sélectionné." : tooMany ? `${n} fichiers : maximum ${MAX_FILES}.` : `${n} fichier(s) · ${fmtSize(D.items.reduce((a, x) => a + x.f.size, 0))}${hasIndex ? "" : " · pas d'index.html à la racine"}`;
      go.disabled = !n || tooMany; drop.classList.toggle("has", n > 0);
    };
    const fin = h("input", { type: "file", multiple: true, hidden: true, onchange: () => set([...fin.files]) });
    const din = h("input", { type: "file", multiple: true, hidden: true, webkitdirectory: "", onchange: () => set([...din.files]) });
    const drop = h("div", { class: "cf-wz-drop", ondragover: (e) => { e.preventDefault(); drop.classList.add("over"); }, ondragleave: () => drop.classList.remove("over"),
      ondrop: (e) => { e.preventDefault(); drop.classList.remove("over"); set([...e.dataTransfer.files]); } },
      ic("upload-cloud"), h("b", {}, "Dépose tes fichiers ici"), h("div", { class: "cf-wz-btns" }, btn("Choisir des fichiers", null, () => fin.click()), btn("Choisir un dossier", null, () => din.click())), sum, fin, din);
    return pane("Importer tes fichiers", "Ils seront poussés en un seul commit dans un nouveau dépôt.", drop, backBtn(), go);
  };

  const stepFinal = () => {
    const gh_ = D.method === "github";
    const field = (k, label, ph) => { const i = h("input", { class: "fe-input", placeholder: ph, autocomplete: "off" }); return { k, i, row: h("label", { class: "cf-wz-f" }, h("span", { class: "cf-wz-lab" }, label, h("em", {}, "Optionnel")), i) }; };
    const F = gh_ ? [field("BUILD_COMMAND", "Commande de build", "npm run build"), field("OUTPUT_DIR", "Dossier de sortie", "dist"), field("NODE_VERSION", "Version de Node", "22"), field("ROOT_DIR", "Dossier racine", ".")] : [];
    const chip = h("a", { class: "cf-wz-repo", target: "_blank", rel: "noopener" }), name = h("input", { class: "fe-input", placeholder: "nom-du-site", autocomplete: "off", "aria-label": "Nom du projet" });
    const note = h("div", { class: "cf-wz-note" });
    const run = btn("Déployer", "rocket", () => act(async () => {
      let n = "";
      if (!gh_) { n = name.value.trim(); if (!/^[\w.-]+$/.test(n)) throw new Error("Nom invalide (lettres, chiffres, - _ .)."); }
      const L = loading(gh_ ? "Déploiement de " + D.repo.split("/")[1] : "Création de " + n, gh_ ? 4 : 6);
      try {
        let full = D.repo;
        if (gh_) {
          L.step("Enregistrement des réglages");
          for (const x of F) if (x.i.value.trim()) await upsertVar(D.repo, x.k, x.i.value.trim());
          await setupAuto(D.repo, L);
        } else full = (await createSite(n, L, D)).full_name;
        L.done(); S.repos = null;
        await sleep(700); L.close(); window.DP.setProject(full, "Déploiements");
      } catch (e) { L.close(); throw e; }
    }), "primary");
    const p = pane("Configurer et déployer", gh_ ? "Règle ton projet puis déploie-le sur GitHub Pages." : "Donne un nom à ton projet : le dépôt GitHub et le site sont créés pour toi.",
      gh_ ? [chip, ...F.map((x) => x.row), note] : [h("label", { class: "cf-wz-f" }, h("span", { class: "cf-wz-lab" }, "Nom du projet"), name), note], backBtn(), run);
    p._on = () => {
      if (gh_) { chip.href = "https://github.com/" + D.repo; chip.replaceChildren(ic("github"), h("span", {}, D.repo), ic("external-link")); note.textContent = "Le workflow .github/workflows/deploy.yml sera ajouté (ou remplacé) dans ce dépôt, sur sa branche par défaut."; }
      else { note.textContent = D.method === "upload" ? `${D.items.length} fichier(s) importé(s) · dépôt public, déploiement auto et previews par PR.` : `Modèle : ${D.tpl} · dépôt public, déploiement auto et previews par PR.`; setTimeout(() => name.focus({ preventScroll: true }), 650); }
      icons();
    };
    return p;
  };

  const setMethod = (m) => {
    if (D.method === m && panes.length > 1) return next();
    panes.slice(1).forEach((p) => { ro.unobserve(p); p.remove(); }); panes = panes.slice(0, 1);
    Object.assign(D, { method: m, repo: null, items: [], tpl: "Page simple" }); steps = FLOW[m];
    add(...{ github: [stepRepo, stepFinal], hello: [stepFinal], tpl: [stepTpl, stepFinal], upload: [stepFiles, stepFinal] }[m].map((f) => f()));
    next();
  };

  const frame = h("div", { class: "cf-wz-frame" }, h("i", { class: "gt" }), h("i", { class: "gb" }), h("i", { class: "gl" }), h("i", { class: "gr" }),
    ...["tl", "tr", "bl", "br"].map((c) => h("b", { class: "gh " + c })), view);
  view.style.transition = "none";
  add(stepMethod()); show(0);
  requestAnimationFrame(() => requestAnimationFrame(() => (view.style.transition = "")));
  return h("div", { class: "cf-wz", id: "fe-new" }, h("div", { class: "cf-wz-label" }, "Créer une app"), frame, h("div", { class: "cf-wz-side" }, side));
}

/* ---------- Vue Projets ---------- */
async function vProjects(root) {
  const all = await repos(), rs = all.filter((r) => match(r.full_name, r.description));
  const pages = all.filter((r) => r.has_pages).length, priv = all.filter((r) => r.private).length;
  root.append(h("div", { class: "cf-strip" }, ic("folder-git-2"), h("span", { class: "cf-chip ok" }, `${all.length} projet${all.length > 1 ? "s" : ""}`),
    h("span", { class: "cf-strip-txt" }, `${pages} avec GitHub Pages actif · ${priv} privé${priv > 1 ? "s" : ""}.`),
    h("span", { class: "cf-strip-end" }, S.user && h("a", { class: "cf-chip", href: "https://github.com/" + S.user.login, target: "_blank", rel: "noopener" }, ic("github"), S.user.login))));
  root.append(wizard());

  const open = (r) => window.DP.setProject(r.full_name), cells = {};
  const rows = rs.map((r) => {
    const dot = h("span", { class: "fe-dot " + (r.has_pages ? "ok" : "") }), lab = document.createTextNode(r.has_pages ? "En ligne" : "—"), msg = h("em", { class: "cf-msg" }, r.description || "—");
    cells[r.full_name] = { dot, lab, msg };
    return h("div", { class: "cf-prj", tabindex: "0", role: "link", onclick: () => open(r), onkeydown: (e) => e.key === "Enter" && open(r) },
      h("span", { class: "fe-avatar" }, r.name[0].toUpperCase()),
      h("div", { class: "cf-prj-main" }, h("b", {}, h("span", { class: "cf-prj-name" }, r.name), h("em", { class: "cf-chip" }, r.private ? "Privé" : "Public")), h("span", { class: "cf-by" }, r.has_pages ? `${r.owner.login}.github.io/${r.name}` : "Pas de déploiement")),
      msg, h("span", { class: "cf-st" }, dot, lab), h("time", {}, ago(r.pushed_at)));
  });
  const alerts = h("span", { class: "cf-strip-txt" }, "Vérification…");
  const kv = (k, v) => h("div", { class: "cf-kv" }, h("span", {}, k), h("em", { class: "cf-chip" }, String(v)));
  const li = (r) => h("button", { type: "button", class: "cf-li cf-lib", onclick: () => open(r) }, ic("folder-git-2"), h("span", {}, r.name), h("em", { class: "cf-by" }, ago(r.pushed_at)));
  root.append(h("div", { class: "cf-two" },
    h("div", { class: "cf-card" }, h("div", { class: "cf-card-head" }, h("b", {}, "Projets"), h("span", { class: "cf-chip" }, String(rs.length))), rows.length ? rows : h("p", { class: "cf-none pad" }, "Aucun projet.")),
    h("div", { class: "cf-side" },
      h("div", { class: "cf-card" }, h("div", { class: "cf-card-head" }, h("b", {}, "Utilisation")), h("div", { class: "cf-pad" }, kv("Projets", all.length), kv("Pages actif", pages), kv("Privés", priv))),
      h("div", { class: "cf-card" }, h("div", { class: "cf-card-head" }, h("b", {}, "Alertes")), h("div", { class: "cf-pad row" }, ic("bell"), alerts)),
      all.length > 0 && h("div", { class: "cf-card" }, h("div", { class: "cf-card-head" }, h("b", {}, "Projets récents")), all.slice(0, 3).map(li)))));
  icons();
  // Dernier déploiement de chacun des 20 premiers projets (une requête chacun).
  let fails = 0;
  await Promise.all(rs.slice(0, 20).map((r) => gh(`/repos/${r.full_name}/actions/runs?per_page=1`).then((d) => {
    const x = d.workflow_runs[0]; if (!x) return;
    const c = cells[r.full_name]; c.dot.className = "fe-dot " + dotOf(x); c.lab.textContent = state(x); c.msg.textContent = x.display_title; if (x.conclusion === "failure") fails++;
  }).catch(() => {})));
  alerts.textContent = fails ? `${fails} projet(s) avec un dernier déploiement en échec.` : "Aucune alerte.";
}
VIEWS["Projets"] = vProjects;
})();