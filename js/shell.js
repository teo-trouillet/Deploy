/* Coque de l'application : animation d'intro, navbar, routage des pages. */
// Intro : après 1,2 s la navbar se déploie depuis la gauche,
// puis 0,8 s plus tard le header descend depuis le haut.
// L'intro ne se joue qu'une fois par session (et jamais avec « réduire les animations »).
const seenIntro = (() => { try { const v = sessionStorage.getItem("fe_intro"); sessionStorage.setItem("fe_intro", "1"); return v === "1" || matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();

window.setTimeout(() => {
    document.body.classList.remove("loading-screen");
    document.body.classList.add("header-hidden");

    window.setTimeout(() => {
        document.body.classList.remove("header-hidden");
    }, seenIntro ? 0 : 800);
}, seenIntro ? 0 : 1200);

lucide.createIcons();
window.setTimeout(() => showPage(fromHash() || "Projets"), seenIntro ? 0 : 1300);

function setCollapsed(collapsed) {
    document.body.classList.toggle("nav-collapsed", collapsed);
}

const navToggle = document.querySelector(".nav-toggle");
const toggleNav = () => setCollapsed(!document.body.classList.contains("nav-collapsed"));
navToggle.addEventListener("click", toggleNav);
navToggle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleNav(); }
});

document.querySelectorAll(".nav-group-title").forEach((button) => {
    const group = button.closest(".nav-group");
    const panel = document.getElementById(button.getAttribute("aria-controls"));

    if (!group || !panel) return;

    const items = [...panel.querySelectorAll(".nav-item-left")];
    const stagger = 75;

    panel.style.height = "0px";
    panel.style.visibility = "hidden";

    items.forEach((item) => {
        item.style.setProperty("--item-reveal-delay", "0ms");
    });

    const isOpen = () => group.classList.contains("is-open");

    function setOpen(shouldOpen) {
        if (shouldOpen === isOpen()) return;

        const currentHeight = panel.getBoundingClientRect().height;

        panel.style.transition = "none";
        panel.style.height = `${currentHeight}px`;
        panel.getBoundingClientRect();

        items.forEach((item, index) => {
            const delayIndex = shouldOpen
                ? index
                : items.length - 1 - index;

            item.style.setProperty(
                "--item-reveal-delay",
                `${delayIndex * stagger}ms`
            );
        });

        group.classList.toggle("is-open", shouldOpen);
        button.setAttribute("aria-expanded", String(shouldOpen));
        panel.setAttribute("aria-hidden", String(!shouldOpen));
        panel.inert = !shouldOpen;

        if (shouldOpen) {
            panel.style.visibility = "visible";
            panel.style.pointerEvents = "auto";
        } else {
            panel.style.pointerEvents = "none";
        }

        requestAnimationFrame(() => {
            panel.style.removeProperty("transition");

            panel.style.height = shouldOpen
                ? `${panel.scrollHeight}px`
                : "0px";
        });
    }

    button.addEventListener("click", () => {
        // Navbar réduite : on la déplie d'abord (sinon le groupe
        // s'ouvrirait de façon invisible).
        if (document.body.classList.contains("nav-collapsed")) {
            setCollapsed(false);
            setOpen(true);
            return;
        }
        setOpen(!isOpen());
    });

    panel.addEventListener("transitionend", (event) => {
        if (event.target !== panel || event.propertyName !== "height") return;

        panel.style.removeProperty("transition");

        if (group.classList.contains("is-open")) {
            panel.style.height = "auto";
            panel.style.visibility = "visible";
        } else {
            panel.style.height = "0px";
            panel.style.visibility = "hidden";
        }
    });
});

// Navigation entre les pages : chaque lien affiche sa propre section.
const contentTitle = document.getElementById("content-title");
const contentBody = document.querySelector(".content-body");

const pageDescriptions = {
    "Publications": "Publie et retrouve les versions de ton site.",
    "Tags": "Marque un commit comme version.",
    "Changelog": "Liste des changements entre deux versions.",
    "Comparer": "Différences de fichiers entre deux versions ou branches.",
    "Général": "Informations du projet sélectionné.",
    "Git": "Connecte ton compte avec un token personnel.",
    "Environnements": "Production et previews par pull request.",
    "Variables d'environnement": "Variables d'environnement utilisables par tes workflows.",
    "Déploiements": "Historique des déploiements, journaux, relance et restauration.",
    "Support": "Tickets d'aide du projet, créés comme issues GitHub.",
    "Projets": "Tes dépôts GitHub : sélectionne-en un pour ouvrir son dashboard.",
    "Activité": "Dernière activité de ton compte GitHub.",
    "Aperçu": "Vue d'ensemble du projet sélectionné.",
    "Fichiers": "Parcours, édite et pousse des fichiers directement sur GitHub.",
    "Journaux": "Journal des déploiements, commits et pull requests.",
    "Domaines": "URL GitHub Pages, domaine personnalisé et HTTPS.",
    "Statistiques": "Trafic des 14 derniers jours.",
    "Sécurité": "Comment ton token est protégé."
};

let swapT, firstPage = true;
function showPage(label) {
    clearTimeout(swapT);
    if (firstPage || matchMedia("(prefers-reduced-motion: reduce)").matches) { firstPage = false; return renderPage(label); }
    contentBody.classList.add("is-leaving");
    swapT = setTimeout(() => { renderPage(label); contentBody.classList.remove("is-leaving"); }, 140);
}

function renderPage(label) {
    contentTitle.textContent = `/ ${label}`;

    document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.toggle(
            "active",
            item.querySelector("span")?.textContent.trim() === label
        );
    });

    // Ouvre automatiquement le groupe de la page active.
    const groupBtn = document.querySelector(".nav-item.active")?.closest(".nav-group")?.querySelector(".nav-group-title");
    if (groupBtn && groupBtn.getAttribute("aria-expanded") === "false" && !document.body.classList.contains("nav-collapsed")) groupBtn.click();

    contentBody.replaceChildren();

    if (label === "Accueil") {
        const greeting = document.createElement("span");
        greeting.textContent = "Bonjour" + (window.DP?.S.user ? " " + window.DP.S.user.login : "");
        contentBody.appendChild(greeting);
        return;
    }

    const page = document.createElement("section");
    page.className = "page-view app-view";

    const heading = document.createElement("h1");
    heading.textContent = label;

    const description = document.createElement("p");
    description.textContent = pageDescriptions[label]
        || `Bienvenue dans la section ${label}.`;

    page.append(heading, description);
    contentBody.appendChild(page);
    if (window.Deploy) window.Deploy.render(label, page);
}

// Infobulle sur chaque onglet : explique à quoi il sert.
document.querySelectorAll(".nav-item").forEach((item) => {
    const tip = pageDescriptions[item.querySelector("span")?.textContent.trim()];
    if (tip) item.title = tip;
});

// Routage par hash : #deploiements, #fichiers… (rafraîchissement, retour et liens partageables).
const slug = (l) => l.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function fromHash() {
    const s = location.hash.slice(1);
    return [...document.querySelectorAll(".nav-item")].map((i) => i.querySelector("span")?.textContent.trim()).find((l) => l && slug(l) === s);
}
window.addEventListener("hashchange", () => { const l = fromHash(); if (l) showPage(l); });

document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (event) => {
        event.preventDefault();
        const label = item.querySelector("span")?.textContent.trim();
        if (!label) return;
        if (location.hash === "#" + slug(label)) showPage(label);
        else location.hash = slug(label);
    });
});

const searchbar = document.getElementById("searchbar");
const searchInput = searchbar.querySelector(".search-input");

searchbar.addEventListener("click", () => {
    searchbar.classList.add("active");
    searchInput.focus();
});

searchInput.addEventListener("blur", () => {
    if (searchInput.value.trim() === "") {
        searchbar.classList.remove("active");
    }
});

// Thème : automatique → clair → sombre.
document.getElementById("theme-toggle")?.addEventListener("click", () => {
    let cur = "auto";
    try { cur = localStorage.getItem("fe_theme") || "auto"; } catch { /* stockage indisponible */ }
    const next = ["auto", "light", "dark"][(["auto", "light", "dark"].indexOf(cur) + 1) % 3];
    try { next === "auto" ? localStorage.removeItem("fe_theme") : localStorage.setItem("fe_theme", next); } catch { /* ignoré */ }
    if (next === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next;
    window.DP?.toast("Thème : " + { auto: "automatique", light: "clair", dark: "sombre" }[next]);
});

// Palette de commandes (Ctrl/Cmd + K) : pages et projets.
function openPalette() {
    if (document.querySelector(".fe-palette")) return;
    const D = window.DP, close = () => o.remove();
    const input = D.h("input", { class: "fe-input", placeholder: "Aller à une page ou un projet…", "aria-label": "Palette de commandes" });
    const list = D.h("div", { class: "pop-list" });
    let items = [...document.querySelectorAll(".nav-item span")].map((s) => { const l = s.textContent.trim(); return { t: l, i: "corner-down-right", run: () => D.go(l) }; });
    const draw = () => {
        const q = input.value.toLowerCase(), rows = items.filter((x) => x.t.toLowerCase().includes(q)).slice(0, 12);
        list.replaceChildren(...rows.map((x, k) => D.h("button", { type: "button", class: "pop-item" + (k === 0 ? " active" : ""), onclick: () => { close(); x.run(); } }, D.ic(x.i), D.h("span", {}, x.t))));
        D.icons();
    };
    const o = D.h("div", { class: "fe-overlay fe-palette", role: "dialog", "aria-modal": "true", "aria-label": "Palette de commandes", onclick: (e) => e.target === o && close() }, D.h("div", { class: "fe-loader" }, input, list));
    document.body.appendChild(o); draw(); input.focus();
    input.addEventListener("input", draw);
    input.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); if (e.key === "Enter") list.querySelector(".pop-item")?.click(); });
    if (D.LS("fe_token")) D.repos().then((rs) => { items = items.concat(rs.map((r) => ({ t: r.full_name, i: "folder-git-2", run: () => D.setProject(r.full_name) }))); draw(); }).catch(() => {});
}
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); } });

// Mobile : la navbar devient un tiroir.
document.querySelector(".mobile-menu")?.addEventListener("click", () => document.body.classList.toggle("nav-open"));
document.querySelectorAll(".nav-item").forEach((i) => i.addEventListener("click", () => document.body.classList.remove("nav-open")));
