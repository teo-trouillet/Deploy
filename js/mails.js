/* Deploy Mails — Stalwart JMAP client; no mock messages or external webmail redirects. */
(() => {
  const tabs = ["Réception", "Envoyés", "Boîtes mail", "Domaines", "Paramètres"];
  const slugs = { "Réception": "reception", "Envoyés": "envoyes", "Boîtes mail": "boites-mail", "Domaines": "domaines", "Paramètres": "parametres" };
  const labels = Object.fromEntries(Object.entries(slugs).map(([label, slug]) => [slug, label]));
  const state = { tab: "Réception", messages: [], selected: null, error: "", loading: false };
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) {
      if (child instanceof Node) node.append(child);
      else if (child !== null && child !== undefined) node.append(document.createTextNode(String(child)));
    }
    return node;
  };
  const button = (text, fn, primary = false) => el("button", { type: "button", class: "fe-btn" + (primary ? " primary" : ""), onclick: fn }, text);
  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin", ...options,
      headers: { "X-Requested-With": "deploy", "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Erreur serveur (" + response.status + ")");
    return data;
  }
  function injectNav() {
    const nav = document.querySelector(".nav-group-first");
    if (!nav || document.getElementById("nav-mails")) return;
    const main = el("div", { class: "nav-group-first", id: "nav-mails" });
    main.append(el("a", { href: "#mails", class: "nav-item" }, el("i", { "data-lucide": "mail" }), el("span", {}, "Mails")));
    const group = el("div", { class: "nav-group", id: "mail-subnav" });
    const toggle = el("button", { type: "button", class: "nav-group-title", "aria-expanded": "false", "aria-controls": "nav-mails-items" },
      el("i", { "data-lucide": "mail" }), el("span", {}, "Messagerie"), el("i", { "data-lucide": "chevron-right", class: "group-chevron" }));
    const panel = el("div", { class: "nav-group-items", id: "nav-mails-items", "aria-hidden": "true", inert: "" });
    const inner = el("div", { class: "nav-group-items-inner" });
    tabs.forEach(label => inner.append(el("a", { href: "#mail-" + slugs[label], class: "nav-item nav-item-left" }, el("span", {}, label))));
    panel.append(inner); group.append(toggle, panel); nav.after(main, group);
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open)); panel.setAttribute("aria-hidden", String(!open));
      panel.inert = !open; panel.style.visibility = open ? "visible" : "hidden";
      panel.style.height = open ? panel.scrollHeight + "px" : "0px"; group.classList.toggle("is-open", open);
    });
    window.lucide?.createIcons();
  }
  function show() {
    const title = document.getElementById("content-title");
    const root = document.querySelector(".content-body");
    if (!root || !title) return;
    title.textContent = "/ Mails";
    document.querySelectorAll(".nav-item").forEach(item => {
      const href = item.getAttribute("href") || "";
      item.classList.toggle("active", href === "#mails" || href === "#mail-" + slugs[state.tab]);
    });
    root.replaceChildren();
    const page = el("section", { class: "page-view app-view mail-app" });
    const heading = el("div", { class: "mail-heading" },
      el("div", {}, el("h1", {}, "Mails"), el("p", {}, "Messagerie hébergée par Stalwart · messages réels")),
      button("Nouveau message", () => compose(), true));
    page.append(heading);
    const tabbar = el("div", { class: "mail-tabs", role: "tablist" });
    tabs.forEach(label => tabbar.append(el("button", {
      type: "button", role: "tab", class: "mail-tab" + (state.tab === label ? " active" : ""),
      "aria-selected": String(state.tab === label), onclick: () => { state.tab = label; state.selected = null; show(); if (label === "Réception" || label === "Envoyés") loadMessages(); }
    }, label)));
    page.append(tabbar);
    if (state.error) page.append(el("div", { class: "mail-error", role: "alert" }, state.error));
    root.append(page);
    if (state.tab === "Réception" || state.tab === "Envoyés") renderInbox(page);
    else if (state.tab === "Boîtes mail") renderMailboxes(page);
    else if (state.tab === "Domaines") renderDomains(page);
    else renderSettings(page);
  }
  function renderInbox(page) {
    page.append(el("div", { class: "mail-toolbar" },
      el("span", { class: "mail-muted" }, state.tab === "Envoyés" ? "Messages envoyés" : "Messages reçus"),
      button("Actualiser", loadMessages)));
    if (state.loading) { page.append(el("div", { class: "fe-empty" }, "Chargement des messages…")); return; }
    if (state.selected) {
      const message = state.selected;
      const body = message.preview || Object.values(message.bodyValues || {}).map(part => part.value || "").join("\n") || "Contenu indisponible.";
      page.append(el("article", { class: "mail-reader" },
        button("← Retour", () => { state.selected = null; show(); }),
        el("h2", {}, message.subject || "(sans objet)"),
        el("div", { class: "mail-meta" }, (message.from || []).map(x => x.name || x.email || "").join(", ") + " · " + (message.receivedAt ? new Date(message.receivedAt).toLocaleString("fr-FR") : "")),
        el("p", {}, "À : " + (message.to || []).map(x => x.email || "").join(", ")),
        el("div", { class: "mail-body" }, body),
        button("Répondre", () => compose(message))));
      return;
    }
    if (!state.messages.length) {
      page.append(el("div", { class: "mail-empty" }, el("div", { class: "mail-empty-icon" }, "✉"),
        el("h2", {}, "Aucun message à afficher"),
        el("p", {}, "Les messages réels apparaîtront ici lorsque le compte Stalwart sera configuré.")));
      return;
    }
    const list = el("div", { class: "mail-list" });
    state.messages.forEach(message => {
      const sender = (message.from || [])[0] || {};
      list.append(el("button", { type: "button", class: "mail-row", onclick: () => { state.selected = message; show(); } },
        el("span", { class: "mail-avatar" }, (sender.name || sender.email || "?").slice(0, 1).toUpperCase()),
        el("span", { class: "mail-row-main" },
          el("b", {}, sender.name || sender.email || "Expéditeur inconnu"),
          el("strong", {}, message.subject || "(sans objet)"),
          el("span", { class: "mail-muted" }, message.preview || "")),
        el("time", {}, message.receivedAt ? new Date(message.receivedAt).toLocaleDateString("fr-FR") : "")));
    });
    page.append(list);
  }
  async function loadMessages() {
    state.loading = true; state.error = ""; show();
    try {
      const folder = state.tab === "Envoyés" ? "sent" : "inbox";
      const data = await api("/api/mail/messages?folder=" + folder);
      state.messages = Array.isArray(data.messages) ? data.messages : [];
    } catch (error) { state.messages = []; state.error = error.message; }
    finally { state.loading = false; show(); }
  }
  function compose(reply = null) {
    const overlay = el("div", { class: "mail-overlay", role: "dialog", "aria-modal": "true", "aria-label": "Nouveau message" });
    const form = el("form", { class: "mail-compose" });
    const recipient = el("input", { class: "fe-input", name: "to", type: "email", required: "required", placeholder: "nom@domaine.fr" });
    const subject = el("input", { class: "fe-input", name: "subject", required: "required", placeholder: "Objet du message" });
    const message = el("textarea", { name: "text", required: "required", rows: "9", placeholder: "Votre message…" });
    const field = (label, input) => el("label", { class: "mail-field" }, el("span", {}, label), input);
    if (reply) {
      recipient.value = ((reply.from || [])[0] || {}).email || "";
      subject.value = /^re:/i.test(reply.subject || "") ? reply.subject : "Re : " + (reply.subject || "");
    }
    const error = el("div", { class: "mail-error", hidden: "" });
    const close = () => overlay.remove();
    const submit = el("button", { class: "fe-btn primary", type: "submit" }, "Envoyer");
    form.append(el("div", { class: "mail-compose-head" }, el("h2", {}, reply ? "Répondre" : "Nouveau message"), button("Fermer", close)),
      error, field("Destinataire", recipient), field("Objet", subject), field("Message", message),
      el("div", { class: "mail-compose-actions" }, button("Annuler", close), submit));
    form.addEventListener("submit", async event => {
      event.preventDefault(); submit.disabled = true; submit.textContent = "Envoi…"; error.hidden = true;
      try {
        await api("/api/mail/send", { method: "POST", body: JSON.stringify({ to: recipient.value, subject: subject.value, text: message.value }) });
        close(); state.tab = "Envoyés"; state.selected = null; await loadMessages();
      } catch (e) { error.textContent = e.message; error.hidden = false; submit.disabled = false; submit.textContent = "Envoyer"; }
    });
    overlay.append(form); overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    document.body.append(overlay); recipient.focus();
  }
  async function renderMailboxes(page) {
    page.append(el("div", { class: "mail-section-head" }, el("h2", {}, "Boîtes mail"), button("Créer une boîte", createMailbox, true)));
    try {
      const data = await api("/api/mail/mailboxes"), list = el("div", { class: "mail-list" });
      (data.mailboxes || []).forEach(account => list.append(el("div", { class: "mail-row" },
        el("span", { class: "mail-avatar" }, "@"),
        el("span", { class: "mail-row-main" }, el("b", {}, account.email || account.name || account.id), el("span", { class: "mail-muted" }, account.description || account.type || "Stalwart")),
        button("Supprimer", () => deleteMailbox(account.id)))));
      page.append(list);
      if (!(data.mailboxes || []).length) page.append(el("div", { class: "mail-empty" }, "Aucune boîte retournée par Stalwart."));
    } catch (error) { state.error = error.message; page.append(el("div", { class: "mail-error" }, error.message)); }
  }
  async function createMailbox() {
    const email = prompt("Adresse complète (ex. contact@exemple.fr) :");
    if (!email) return;
    const password = prompt("Mot de passe temporaire (12 caractères minimum) :");
    if (!password) return;
    try { await api("/api/mail/mailboxes", { method: "POST", body: JSON.stringify({ email, password }) }); state.error = ""; show(); }
    catch (error) { state.error = error.message; show(); }
  }
  async function deleteMailbox(id) {
    if (!id || !confirm("Supprimer cette boîte mail ? Cette action est irréversible.")) return;
    try { await api("/api/mail/mailboxes/" + encodeURIComponent(id), { method: "DELETE" }); state.error = ""; show(); }
    catch (error) { state.error = error.message; show(); }
  }
  async function renderDomains(page) {
    page.append(el("div", { class: "mail-section-head" }, el("h2", {}, "Domaines de messagerie"), button("Ajouter un domaine", addDomain, true)),
      el("div", { class: "mail-card" }, el("p", {}, "Configurez MX, SPF, DKIM et DMARC dans le DNS de chaque domaine. Les valeurs DKIM doivent provenir de votre instance Stalwart.")));
    try {
      const data = await api("/api/mail/domains"), domains = data.domains || [];
      domains.forEach(domain => page.append(el("div", { class: "mail-card" },
        el("h3", {}, domain.name || domain.id), el("p", { class: "mail-muted" }, domain.description || "Domaine géré par Stalwart"),
        button("Supprimer", async () => {
          if (!confirm("Supprimer le domaine " + (domain.name || domain.id) + " ?")) return;
          try { await api("/api/mail/domains/" + encodeURIComponent(domain.id), { method: "DELETE" }); show(); }
          catch (error) { state.error = error.message; show(); }
        }))));
      if (!domains.length) page.append(el("div", { class: "mail-empty" }, "Aucun domaine configuré."));
    } catch (error) { state.error = error.message; page.append(el("div", { class: "mail-error" }, error.message)); }
  }
  async function addDomain() {
    const domain = prompt("Nom de domaine (ex. exemple.fr) :");
    if (!domain) return;
    try { await api("/api/mail/domains", { method: "POST", body: JSON.stringify({ domain }) }); state.error = ""; show(); }
    catch (error) { state.error = error.message; show(); }
  }
  function renderSettings(page) {
    page.append(el("h2", {}, "Paramètres"), el("div", { class: "mail-card" },
      el("h3", {}, "État du service"),
      el("p", {}, "Les jetons Stalwart restent côté serveur. Configurez STALWART_URL, STALWART_ADMIN_TOKEN, STALWART_JMAP_TOKEN, STALWART_JMAP_ACCOUNT_ID et STALWART_FROM_ADDRESS."),
      button("Vérifier la connexion", async () => {
        try { const data = await api("/api/mail/status"); alert(data.configured ? "Stalwart configuré : " + data.url : "Stalwart non configuré."); }
        catch (error) { alert(error.message); }
      }),
      el("p", { class: "mail-muted" }, "Ne placez aucun mot de passe ni jeton dans le navigateur ou dans un fichier statique.")));
  }
  const stylesheet = el("link", { rel: "stylesheet", href: "css/mail.css" });
  document.head.append(stylesheet);
  injectNav();
  document.addEventListener("click", event => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    if (link.getAttribute("href") === "#mails") { event.preventDefault(); state.tab = "Réception"; state.selected = null; location.hash = "mails"; show(); loadMessages(); }
    else if (link.getAttribute("href").startsWith("#mail-")) {
      event.preventDefault(); state.tab = labels[link.getAttribute("href").slice(6)] || "Réception";
      state.selected = null; location.hash = "mails"; show();
      if (state.tab === "Réception" || state.tab === "Envoyés") loadMessages();
    }
  });
  window.addEventListener("hashchange", () => {
    if (location.hash === "#mails" || location.hash.startsWith("#mail-")) {
      if (location.hash.startsWith("#mail-")) state.tab = labels[location.hash.slice(6)] || state.tab;
      show(); if (state.tab === "Réception" || state.tab === "Envoyés") loadMessages();
    }
  });
  if (location.hash === "#mails" || location.hash.startsWith("#mail-")) {
    if (location.hash.startsWith("#mail-")) state.tab = labels[location.hash.slice(6)] || state.tab;
    show(); if (state.tab === "Réception" || state.tab === "Envoyés") loadMessages();
  }
  window.DeployMail = { show };
})();
