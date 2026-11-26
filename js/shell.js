/* Coque de l'application : animation d'intro, navbar, routage des pages. */
// Intro : après 1,2 s la navbar se déploie depuis la gauche,
// puis 0,8 s plus tard le header descend depuis le haut.
window.setTimeout(() => {
    document.body.classList.remove("loading-screen");
    document.body.classList.add("header-hidden");

    window.setTimeout(() => {
        document.body.classList.remove("header-hidden");
    }, 800);
}, 1200);

lucide.createIcons();
window.setTimeout(() => showPage("Projets"), 1300);

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
    "Releases": "Publie et retrouve les versions de ton site.",
    "Tags": "Marque un commit comme version.",
    "Changelog": "Liste des changements entre deux versions.",
    "Comparer": "Différences de fichiers entre deux versions ou branches.",
    "Général": "Informations du projet sélectionné.",
    "Git": "Connecte ton compte avec un token personnel.",
    "Environnements": "Production et previews par pull request.",
    "Variables d'environnement": "Variables d'environnement utilisables par tes workflows.",
    "Déploiements": "Historique des déploiements, logs, relance et rollback.",
    "Support": "Tickets d'aide du projet, créés comme issues GitHub.",
    "Projets": "Tes dépôts GitHub : sélectionne-en un pour ouvrir son dashboard.",
    "Activité": "Dernière activité de ton compte GitHub.",
    "Aperçu": "Vue d'ensemble du projet sélectionné.",
    "Fichiers": "Parcours, édite et pousse des fichiers directement sur GitHub.",
    "Logs": "Journal des déploiements, commits et pull requests.",
    "Domaines": "URL GitHub Pages, domaine personnalisé et HTTPS.",
    "Analytics": "Trafic des 14 derniers jours.",
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

document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (event) => {
        event.preventDefault();
        const label = item.querySelector("span")?.textContent.trim();
        if (label) showPage(label);
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
