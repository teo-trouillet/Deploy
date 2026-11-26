/* Aperçu façon Cloudflare : bandeau d'état, schéma de flux, métriques, domaines, déploiements, étapes suivantes.
   Chargé après project.js : remplace la vue « Aperçu ». */
(() => {
const { h, ic, btn, gh, ago, dur, cur, go, fromB64, icons, VIEWS } = window.DP;
const ext = (href, label, icon = "external-link") => h("a", { class: "fe-btn", href, target: "_blank", rel: "noopener" }, ic(icon), label);
const days = (n) => [...Array(n)].map((_, i) => new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10));
const perDay = (runs, ds, f) => ds.map((d) => runs.filter((r) => f(r) && r.created_at.slice(0, 10) === d).length);
const state = (r) => !r ? "" : r.status !== "completed" ? "run" : r.conclusion === "success" ? "ok" : "fail";
const stateLabel = (r) => !r ? "—" : r.status !== "completed" ? "En cours" : r.conclusion === "success" ? "Prêt" : r.conclusion === "cancelled" ? "Annulé" : "Échec";

// Courbe fine qui se dessine à l'affichage ; « Aucune donnée » si tout est à zéro.
function spark(data, color) {
  const max = Math.max(...data), el = h("div", { class: "cf-spark" });
  if (!max) { el.append(h("span", { class: "cf-nodata" }, "Aucune donnée")); return el; }
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${28 - (v / max) * 24}`);
  el.innerHTML = `<svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,30 ${pts.join(" ")} 100,30" fill="${color}" opacity=".1"/><polyline pathLength="1" points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  return el;
}

// Boîte repliable du schéma (clic = déplier, avec animation de hauteur).
function acc(title, items, open = false) {
  const body = h("div", { class: "cf-acc-body" }, h("div", {}, ...(items.length ? items : [h("p", { class: "cf-none" }, "Rien pour l'instant")])));
  const head = h("button", { type: "button", class: "cf-acc-head", "aria-expanded": String(open) }, h("span", {}, title), h("em", { class: "cf-count" }, String(items.length)), ic("chevron-down"));
  const box = h("div", { class: "cf-acc" + (open ? " open" : "") }, head, body);
  head.addEventListener("click", () => head.setAttribute("aria-expanded", String(box.classList.toggle("open"))));
  return box;
}
const li = (icon, label, href) => h(href ? "a" : "div", { class: "cf-li", ...(href ? { href, target: "_blank", rel: "noopener" } : {}) }, ic(icon), h("span", {}, label));

async function vOverview(root) {
  const repo = cur(); if (!repo) return root.append(h("div", { class: "fe-empty" }, "Choisis un projet."));
  const m = await gh(`/repos/${repo}`);
  const [d, pages, brs, vars, wf] = await Promise.all([
    gh(`/repos/${repo}/actions/runs?per_page=100`), gh(`/repos/${repo}/pages`).catch(() => null),
    gh(`/repos/${repo}/branches?per_page=30`).catch(() => []), gh(`/repos/${repo}/actions/variables`).catch(() => ({ variables: [] })),
    gh(`/repos/${repo}/contents/.github/workflows/deploy.yml`).catch(() => null)]);
  const runs = d.workflow_runs, last = runs[0], url = pages?.html_url, host = url ? url.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
  const custom = pages?.cname, preview = !!wf && fromB64(wf.content).includes("pr-preview"), ds = days(14);
  const r14 = runs.filter((r) => Date.now() - new Date(r.created_at) < 14 * 864e5), done = r14.filter((r) => r.status === "completed");
  const f14 = done.filter((r) => r.conclusion === "failure").length, avg = done.length ? Math.round(done.reduce((a, r) => a + (new Date(r.updated_at) - new Date(r.run_started_at)) / 1000, 0) / done.length) : 0;

  // 1. Bandeau d'état
  root.append(h("div", { class: "cf-strip" },
    ic("globe"), h("span", { class: "cf-chip " + (url ? "ok" : "") }, url ? "URL active" : "Aucune URL"),
    h("span", { class: "cf-strip-txt" }, "Déploiement automatique à chaque push sur " + m.default_branch + "."),
    h("span", { class: "cf-strip-end" }, h("a", { class: "cf-chip", href: m.html_url, target: "_blank", rel: "noopener" }, ic("github"), m.full_name),
      last && h("span", {}, "par " + (last.actor?.login || "—")), last && h("time", {}, ago(last.created_at)))));

  // 2. Schéma de flux : sources → projet → liaisons
  const wire = () => h("i", { class: "cf-wire", "aria-hidden": "true" });
  root.append(h("div", { class: "cf-flow" },
    h("div", { class: "cf-col" }, acc("Branches", brs.map((b) => li("git-branch", b.name + (b.protected ? " · protégée" : ""), `https://github.com/${repo}/tree/${b.name}`)), true),
      acc("Workflows", wf ? [li("file-code-2", "deploy.yml", wf.html_url)] : []), acc("Previews PR", preview ? [li("git-pull-request", "Actives (/pr-preview/pr-N/)")] : [])),
    wire(),
    h("div", { class: "cf-node" }, h("div", { class: "cf-node-head" }, ic("rocket"), h("b", {}, m.name), h("span", { class: "fe-dot " + state(last) })),
      h("div", { class: "cf-node-body" }, h("span", { class: "cf-k" }, "Dernier build"), h("div", { class: "cf-kv" }, h("span", {}, "Statut"), h("em", { class: "cf-chip " + state(last) }, stateLabel(last))),
        h("div", { class: "cf-kv" }, h("span", {}, "Durée"), h("em", { class: "cf-chip" }, last && last.status === "completed" ? dur(last.run_started_at, last.updated_at) : "—")),
        h("div", { class: "cf-kv" }, h("span", {}, "Previews"), h("em", { class: "cf-chip" }, preview ? "Activées" : "Désactivées")))),
    wire(),
    h("div", { class: "cf-col" }, acc("Variables", (vars.variables || []).map((v) => li("braces", v.name)), true), acc("Domaines", [url && li("link-2", host, url), custom && li("shield-check", custom)].filter(Boolean)))));

  // 3. Métriques + domaines et routes
  const metric = (k, v, data, c) => h("div", { class: "cf-metric" }, h("span", {}, k), h("b", {}, v), spark(data, c));
  root.append(h("div", { class: "cf-two" },
    h("div", { class: "cf-card" }, h("div", { class: "cf-card-head" }, h("b", {}, "Métriques"), h("span", { class: "cf-chip" }, "14 derniers jours"), h("button", { type: "button", class: "cf-arrow", "aria-label": "Voir les statistiques", onclick: () => go("Statistiques") }, ic("arrow-right"))),
      h("div", { class: "cf-metrics" }, metric("Déploiements", String(r14.length), perDay(r14, ds, () => true), "var(--cf-blue)"),
        metric("Durée moyenne", avg + " s", done.slice(0, 14).reverse().map((r) => (new Date(r.updated_at) - new Date(r.run_started_at)) / 1000), "var(--cf-blue)"),
        metric("Échecs", String(f14), perDay(r14, ds, (r) => r.conclusion === "failure"), "var(--fail)"))),
    h("div", { class: "cf-card" }, h("div", { class: "cf-card-head" }, h("b", {}, "Domaines et routes"), h("button", { type: "button", class: "cf-arrow", "aria-label": "Gérer les domaines", onclick: () => go("Domaines") }, ic("arrow-right"))),
      h("div", { class: "cf-dom" }, h("span", { class: "cf-k" }, "github.io", h("em", { class: "cf-chip " + (url ? "ok" : "") }, url ? "Activé" : "Désactivé")), url ? h("a", { href: url, target: "_blank", rel: "noopener" }, host) : h("span", {}, "Pas encore publié")),
      h("div", { class: "cf-dom" }, h("span", { class: "cf-k" }, "Domaine personnalisé"), h("span", {}, custom || "—")),
      h("div", { class: "cf-dom" }, h("span", { class: "cf-k" }, "HTTPS"), h("span", {}, pages ? (pages.https_enforced ? "Forcé" : "Non forcé") : "—")))));

  // 4. Déploiements récents
  root.append(h("div", { class: "cf-card" }, h("div", { class: "cf-card-head" }, h("b", {}, "Déploiements"), h("button", { type: "button", class: "cf-arrow", "aria-label": "Tous les déploiements", onclick: () => go("Déploiements") }, ic("arrow-right"))),
    runs.length ? runs.slice(0, 5).map((r) => h("a", { class: "cf-dep", href: r.html_url, target: "_blank", rel: "noopener" },
      h("code", {}, r.head_sha.slice(0, 7)), h("em", { class: "cf-msg" }, r.display_title || "Sans message"),
      h("span", { class: "cf-st" }, h("i", { class: "fe-dot " + state(r) }), stateLabel(r), r.status === "completed" && h("small", {}, dur(r.run_started_at, r.updated_at))),
      h("span", { class: "cf-chip" }, ic("git-branch"), r.head_branch), h("span", { class: "cf-by" }, "par " + (r.actor?.login || "—")), h("time", {}, ago(r.created_at)))) : h("p", { class: "cf-none pad" }, "Aucun déploiement : pousse un commit ou clique sur Déployer.")));

  // 5. Étapes suivantes
  const reco = [["Connecter un dépôt Git", true, "Git"], ["Ajouter un domaine personnalisé", !!custom, "Domaines"], ["Activer les previews de PR", preview, "Environnements"], ["Définir une variable d'environnement", (vars.variables || []).length > 0, "Variables d'environnement"]];
  root.append(h("div", { class: "cf-card" }, h("div", { class: "cf-card-head" }, h("b", {}, "Étapes suivantes"), h("span", { class: "cf-chip" }, `${reco.filter((x) => x[1]).length}/${reco.length}`)),
    h("div", { class: "cf-steps" }, reco.map(([t, v, to]) => h("button", { type: "button", class: "cf-step" + (v ? " done" : ""), onclick: () => go(to) }, ic(v ? "circle-check" : "circle"), t)))));
  icons();
}
VIEWS["Aperçu"] = vOverview;
})();
