const STORAGE_KEY = "carnet.suivi.v1";

const state = {
  view: "accueil",
  filter: "tous",
  query: "",
  selectedContactId: null,
  month: startOfMonth(new Date()),
  selectedDay: toDateKey(new Date()),
  editingContact: null,
  editingEvent: null
};

let deferredInstall = null;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { contacts: [], evenements: [] };
    const data = JSON.parse(raw);
    return {
      contacts: Array.isArray(data.contacts) ? data.contacts : [],
      evenements: Array.isArray(data.evenements) ? data.evenements : []
    };
  } catch {
    return { contacts: [], evenements: [] };
  }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return new Intl.DateTimeFormat("fr-CA", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  }).format(date);
}

function formatDay(value) {
  const date = new Date(value + "T12:00:00");
  return new Intl.DateTimeFormat("fr-CA", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

function escapeHtml(value) {
  const map = {
    "&": String.fromCharCode(38, 97, 109, 112, 59),
    "<": String.fromCharCode(38, 108, 116, 59),
    ">": String.fromCharCode(38, 103, 116, 59),
    '"': String.fromCharCode(38, 113, 117, 111, 116, 59)
  };
  return String(value ?? "").replace(/[&<>"]/g, (ch) => map[ch]);
}

function contactName(data, id) {
  return data.contacts.find((item) => item.id === id)?.nom || "Sans fiche";
}

function upcoming(data) {
  const now = Date.now() - 60 * 60 * 1000;
  return data.evenements
    .filter((item) => new Date(item.debut).getTime() >= now)
    .sort((a, b) => new Date(a.debut) - new Date(b.debut));
}

function render() {
  const data = load();
  const root = document.querySelector("#app");
  const views = {
    accueil: renderHome,
    fiches: renderFiches,
    agenda: renderAgenda,
    reglages: renderSettings
  };
  root.innerHTML = views[state.view](data);
  document.querySelectorAll(".nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
  bind(data);
}

function renderHome(data) {
  const next = upcoming(data).slice(0, 4);
  const people = data.contacts.filter((item) => item.type === "personne").length;
  const orgs = data.contacts.length - people;
  return `
    <section class="stats">
      <article class="stat"><span>Fiches</span><strong>${data.contacts.length}</strong></article>
      <article class="stat"><span>Personnes</span><strong>${people}</strong></article>
      <article class="stat"><span>Organismes</span><strong>${orgs}</strong></article>
    </section>
    <section class="panel">
      <div class="spread">
        <h2>Prochaines rencontres</h2>
        <button class="btn btn-primary btn-small" data-action="new-event">Nouvelle rencontre</button>
      </div>
      <div class="list" style="margin-top:12px">
        ${next.length ? next.map(eventCard).join("") : `<p class="empty">Aucune rencontre à venir. Le calendrier conserve les rendez-vous et peut préparer un rappel pendant que l’application est ouverte.</p>`}
      </div>
    </section>
  `;
}

function renderFiches(data) {
  const q = state.query.trim().toLowerCase();
  const items = data.contacts
    .filter((item) => state.filter === "tous" || item.type === state.filter)
    .filter((item) => !q || [item.nom, item.organisation, item.fonction, item.ville, item.contexte].join(" ").toLowerCase().includes(q))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const selected = data.contacts.find((item) => item.id === state.selectedContactId);
  return `
    <div class="layout">
      <section class="panel">
        <div class="spread">
          <h2>Répertoire</h2>
          <button class="btn btn-primary btn-small" data-action="new-contact">Nouvelle fiche</button>
        </div>
        <div class="filters" style="margin-top:12px">
          ${["tous", "personne", "organisme"].map((key) => `<button class="chip ${state.filter === key ? "active" : ""}" data-filter="${key}">${labelType(key)}</button>`).join("")}
        </div>
        <input class="search" id="search" placeholder="Rechercher un nom, une ville, un enjeu" value="${escapeHtml(state.query)}" />
        <div class="list">
          ${items.length ? items.map((item) => `
            <button class="card" data-contact="${item.id}">
              <strong>${escapeHtml(item.nom)}</strong>
              <div class="meta">${escapeHtml([item.fonction, item.organisation].filter(Boolean).join(" · ") || "Fiche sans fonction")}</div>
              <span class="tag">${item.type === "organisme" ? "Organisme" : "Personne"}</span>
            </button>`).join("") : `<p class="empty">Aucune fiche pour le moment.</p>`}
        </div>
      </section>
      <section class="panel sheet">
        ${selected ? renderContactDetail(data, selected) : `<h2>Fiche technique</h2><p class="empty">Sélectionnez une fiche ou créez-en une. Chaque fiche peut recevoir un historique de suivi et des rencontres liées.</p>`}
      </section>
    </div>`;
}

function renderContactDetail(data, contact) {
  const events = data.evenements.filter((item) => item.contactId === contact.id).sort((a, b) => new Date(b.debut) - new Date(a.debut));
  const suivis = [...(contact.suivis || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  return `
    <div class="spread">
      <h2>${escapeHtml(contact.nom)}</h2>
      <div class="row">
        <button class="btn-ghost btn-small" data-action="edit-contact" data-id="${contact.id}">Modifier</button>
        <button class="btn-danger btn-small" data-action="delete-contact" data-id="${contact.id}">Retirer</button>
      </div>
    </div>
    <div>
      <span class="tag">${contact.type === "organisme" ? "Organisme" : "Personne"}</span>
      ${contact.ville ? `<span class="tag">${escapeHtml(contact.ville)}</span>` : ""}
    </div>
    <p class="meta">${escapeHtml([contact.fonction, contact.organisation, contact.telephone, contact.courriel].filter(Boolean).join(" · "))}</p>
    ${block("Contexte", contact.contexte)}
    ${block("Enjeux et points à aborder", contact.enjeux)}
    ${block("Engagements", contact.engagements)}
    ${block("Notes", contact.notes)}
    <div>
      <div class="spread"><h2 style="font-size:18px">Suivis</h2></div>
      <div class="field" style="margin-top:8px">
        <textarea id="suivi-texte" placeholder="Compte rendu, décision, prochain geste"></textarea>
        <button class="btn btn-small" data-action="add-suivi" data-id="${contact.id}">Ajouter le suivi</button>
      </div>
      ${suivis.map((item) => `<article class="follow"><small>${formatDate(item.date)}</small><div>${escapeHtml(item.texte)}</div></article>`).join("")}
    </div>
    <div>
      <div class="spread">
        <h2 style="font-size:18px">Rencontres liées</h2>
        <button class="btn-ghost btn-small" data-action="new-event" data-contact="${contact.id}">Planifier</button>
      </div>
      <div class="list" style="margin-top:8px">
        ${events.length ? events.map(eventCard).join("") : `<p class="empty">Aucune rencontre liée.</p>`}
      </div>
    </div>`;
}

function block(title, value) {
  if (!value) return "";
  return `<div><strong>${title}</strong><p class="meta" style="white-space:pre-wrap">${escapeHtml(value)}</p></div>`;
}

function renderAgenda(data) {
  const monthLabel = new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric" }).format(state.month);
  const days = calendarDays(state.month);
  const marked = new Set(data.evenements.map((item) => toDateKey(new Date(item.debut))));
  const dayEvents = data.evenements
    .filter((item) => toDateKey(new Date(item.debut)) === state.selectedDay)
    .sort((a, b) => new Date(a.debut) - new Date(b.debut));
  return `
    <div class="layout">
      <section class="panel">
        <div class="cal-head">
          <button class="btn-ghost btn-small" data-action="prev-month">Mois précédent</button>
          <h2 style="font-size:18px;text-transform:capitalize">${monthLabel}</h2>
          <button class="btn-ghost btn-small" data-action="next-month">Mois suivant</button>
        </div>
        <div class="weekdays">${["L", "M", "M", "J", "V", "S", "D"].map((d) => `<span>${d}</span>`).join("")}</div>
        <div class="days">
          ${days.map((day) => {
            const key = toDateKey(day.date);
            return `<button class="day ${day.outside ? "muted" : ""} ${key === toDateKey(new Date()) ? "today" : ""} ${key === state.selectedDay ? "selected" : ""}" data-day="${key}">${day.date.getDate()}${marked.has(key) ? `<i class="dot"></i>` : ""}</button>`;
          }).join("")}
        </div>
      </section>
      <section class="panel">
        <div class="spread">
          <h2 style="text-transform:capitalize">${formatDay(state.selectedDay)}</h2>
          <button class="btn btn-primary btn-small" data-action="new-event">Ajouter</button>
        </div>
        <div class="list" style="margin-top:12px">
          ${dayEvents.length ? dayEvents.map(eventCard).join("") : `<p class="empty">Aucune rencontre ce jour.</p>`}
        </div>
      </section>
    </div>`;
}

function renderSettings() {
  const installed = window.matchMedia("(display-mode: standalone)").matches;
  return `
    <section class="panel sheet">
      <h2>Réglages</h2>
      <p class="meta">Les fiches restent sur cet appareil. L’export permet de transmettre le carnet, ou de le reprendre sur un autre téléphone. Une synchronisation continue sera ajoutée au moment du passage vers l’application connectée.</p>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn btn-primary" data-action="notify">Activer les rappels</button>
        <button class="btn" data-action="export">Exporter le carnet</button>
        <button class="btn" data-action="import">Importer</button>
        <input id="import-file" type="file" accept="application/json" hidden />
        ${installed ? "" : `<button class="btn-ghost" data-action="install">Installer sur l’écran d’accueil</button>`}
        <button class="btn" data-action="ics">Exporter le calendrier</button>
      </div>
      <p class="meta">Les rappels s’affichent lorsque Carnet est ouvert, ou peu après une réouverture. Le rappel système fiable, application fermée, viendra avec la version Android connectée. En attendant, chaque rencontre peut être ajoutée au calendrier du téléphone.</p>
      <button class="btn-danger" data-action="reset">Effacer les données de cet appareil</button>
    </section>`;
}

function eventCard(item) {
  const data = load();
  return `
    <button class="event" data-event="${item.id}">
      <strong>${escapeHtml(item.titre)}</strong>
      <div class="meta">${formatDate(item.debut)} · ${escapeHtml(contactName(data, item.contactId))}${item.lieu ? " · " + escapeHtml(item.lieu) : ""}</div>
    </button>`;
}

function labelType(key) {
  return { tous: "Tous", personne: "Personnes", organisme: "Organismes" }[key];
}

function calendarDays(month) {
  const first = startOfMonth(month);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, outside: date.getMonth() !== month.getMonth() };
  });
}

function bind(data) {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = () => { state.view = button.dataset.view; render(); };
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.onclick = () => { state.filter = button.dataset.filter; render(); };
  });
  const search = document.querySelector("#search");
  if (search) {
    search.oninput = () => { state.query = search.value; render(); document.querySelector("#search")?.focus(); };
  }
  document.querySelectorAll("[data-contact]").forEach((button) => {
    if (button.dataset.action) return;
    button.onclick = () => { state.selectedContactId = button.dataset.contact; state.view = "fiches"; render(); };
  });
  document.querySelectorAll("[data-event]").forEach((button) => {
    button.onclick = () => openEvent(data.evenements.find((item) => item.id === button.dataset.event));
  });
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.onclick = () => handleAction(button.dataset.action, button.dataset.id || button.dataset.contact, data);
  });
  document.querySelectorAll("[data-day]").forEach((button) => {
    button.onclick = () => { state.selectedDay = button.dataset.day; render(); };
  });
}

function handleAction(action, id, data) {
  if (action === "new-contact") openContact();
  if (action === "edit-contact") openContact(data.contacts.find((item) => item.id === id));
  if (action === "delete-contact") deleteContact(id);
  if (action === "add-suivi") addSuivi(id);
  if (action === "new-event") openEvent(null, id && data.contacts.some((item) => item.id === id) ? id : null);
  if (action === "prev-month") { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); render(); }
  if (action === "next-month") { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); render(); }
  if (action === "notify") enableNotifications();
  if (action === "export") exportData();
  if (action === "import") document.querySelector("#import-file").click();
  if (action === "install") installApp();
  if (action === "ics") exportIcs();
  if (action === "reset") resetData();
  const file = document.querySelector("#import-file");
  if (file && !file.dataset.bound) {
    file.dataset.bound = "1";
    file.onchange = importData;
  }
}

function openContact(contact) {
  state.editingContact = contact || {
    id: uid(), type: "personne", nom: "", fonction: "", organisation: "", courriel: "", telephone: "", ville: "", contexte: "", enjeux: "", engagements: "", notes: "", suivis: [], createdAt: new Date().toISOString()
  };
  const item = state.editingContact;
  openModal(`
    <form id="contact-form" class="sheet">
      <h2>${contact ? "Modifier la fiche" : "Nouvelle fiche"}</h2>
      <div class="grid-2">
        <div class="field"><label>Type</label><select name="type"><option value="personne" ${item.type === "personne" ? "selected" : ""}>Personne</option><option value="organisme" ${item.type === "organisme" ? "selected" : ""}>Organisme</option></select></div>
        <div class="field"><label>Ville</label><input name="ville" value="${escapeHtml(item.ville)}" /></div>
      </div>
      <div class="field"><label>Nom</label><input name="nom" required value="${escapeHtml(item.nom)}" /></div>
      <div class="grid-2">
        <div class="field"><label>Fonction</label><input name="fonction" value="${escapeHtml(item.fonction)}" /></div>
        <div class="field"><label>Organisation</label><input name="organisation" value="${escapeHtml(item.organisation)}" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Téléphone</label><input name="telephone" value="${escapeHtml(item.telephone)}" /></div>
        <div class="field"><label>Courriel</label><input name="courriel" type="email" value="${escapeHtml(item.courriel)}" /></div>
      </div>
      <div class="field"><label>Contexte</label><textarea name="contexte">${escapeHtml(item.contexte)}</textarea></div>
      <div class="field"><label>Enjeux et points à aborder</label><textarea name="enjeux">${escapeHtml(item.enjeux)}</textarea></div>
      <div class="field"><label>Engagements</label><textarea name="engagements">${escapeHtml(item.engagements)}</textarea></div>
      <div class="field"><label>Notes</label><textarea name="notes">${escapeHtml(item.notes)}</textarea></div>
      <div class="row">
        <button class="btn btn-primary" type="submit">Enregistrer</button>
        <button class="btn-ghost" type="button" data-close>Annuler</button>
      </div>
    </form>`);
  document.querySelector("#contact-form").onsubmit = (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const data = load();
    const next = { ...state.editingContact, updatedAt: new Date().toISOString() };
    for (const key of ["type", "nom", "fonction", "organisation", "courriel", "telephone", "ville", "contexte", "enjeux", "engagements", "notes"]) next[key] = String(form.get(key) || "").trim();
    const index = data.contacts.findIndex((entry) => entry.id === next.id);
    if (index >= 0) data.contacts[index] = next; else data.contacts.push(next);
    save(data);
    state.selectedContactId = next.id;
    state.view = "fiches";
    closeModal();
    toast("Fiche enregistrée.");
    render();
  };
}

function openEvent(eventItem, contactId) {
  const data = load();
  const baseDay = state.selectedDay || toDateKey(new Date());
  state.editingEvent = eventItem || {
    id: uid(), titre: "", contactId: contactId || state.selectedContactId || "", debut: `${baseDay}T09:00`, fin: `${baseDay}T10:00`, lieu: "", notes: "", rappelMinutes: 60
  };
  const item = state.editingEvent;
  openModal(`
    <form id="event-form" class="sheet">
      <h2>${eventItem ? "Modifier la rencontre" : "Nouvelle rencontre"}</h2>
      <div class="field"><label>Titre</label><input name="titre" required value="${escapeHtml(item.titre)}" /></div>
      <div class="field"><label>Fiche liée</label>
        <select name="contactId"><option value="">Aucune</option>${data.contacts.map((contact) => `<option value="${contact.id}" ${contact.id === item.contactId ? "selected" : ""}>${escapeHtml(contact.nom)}</option>`).join("")}</select>
      </div>
      <div class="grid-2">
        <div class="field"><label>Début</label><input name="debut" type="datetime-local" required value="${toLocalInput(item.debut)}" /></div>
        <div class="field"><label>Fin</label><input name="fin" type="datetime-local" value="${toLocalInput(item.fin)}" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Lieu</label><input name="lieu" value="${escapeHtml(item.lieu)}" /></div>
        <div class="field"><label>Rappel (minutes avant)</label><input name="rappelMinutes" type="number" min="0" step="5" value="${item.rappelMinutes ?? 60}" /></div>
      </div>
      <div class="field"><label>Notes de rencontre</label><textarea name="notes">${escapeHtml(item.notes)}</textarea></div>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn btn-primary" type="submit">Enregistrer</button>
        <button class="btn" type="button" data-action="one-ics">Ajouter au calendrier du téléphone</button>
        ${eventItem ? `<button class="btn-danger" type="button" data-action="delete-event">Retirer</button>` : ""}
        <button class="btn-ghost" type="button" data-close>Annuler</button>
      </div>
    </form>`);
  document.querySelector("#event-form").onsubmit = (event) => { event.preventDefault(); persistEvent(new FormData(event.target)); };
  document.querySelector("[data-action='one-ics']").onclick = () => downloadIcs([readEventForm()]);
  const remove = document.querySelector("[data-action='delete-event']");
  if (remove) remove.onclick = () => {
    const store = load();
    store.evenements = store.evenements.filter((entry) => entry.id !== state.editingEvent.id);
    save(store);
    closeModal();
    toast("Rencontre retirée.");
    render();
  };
}

function readEventForm() {
  const form = new FormData(document.querySelector("#event-form"));
  return {
    ...state.editingEvent,
    titre: String(form.get("titre") || "").trim(),
    contactId: String(form.get("contactId") || ""),
    debut: String(form.get("debut") || ""),
    fin: String(form.get("fin") || ""),
    lieu: String(form.get("lieu") || "").trim(),
    notes: String(form.get("notes") || "").trim(),
    rappelMinutes: Number(form.get("rappelMinutes") || 0)
  };
}

function persistEvent(form) {
  const data = load();
  const next = {
    ...state.editingEvent,
    titre: String(form.get("titre") || "").trim(),
    contactId: String(form.get("contactId") || ""),
    debut: String(form.get("debut") || ""),
    fin: String(form.get("fin") || ""),
    lieu: String(form.get("lieu") || "").trim(),
    notes: String(form.get("notes") || "").trim(),
    rappelMinutes: Number(form.get("rappelMinutes") || 0),
    updatedAt: new Date().toISOString()
  };
  const index = data.evenements.findIndex((entry) => entry.id === next.id);
  if (index >= 0) data.evenements[index] = next; else data.evenements.push(next);
  save(data);
  state.selectedDay = toDateKey(new Date(next.debut));
  state.view = "agenda";
  closeModal();
  toast("Rencontre enregistrée.");
  render();
}

function toLocalInput(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addSuivi(id) {
  const texte = document.querySelector("#suivi-texte")?.value.trim();
  if (!texte) return;
  const data = load();
  const contact = data.contacts.find((item) => item.id === id);
  contact.suivis = contact.suivis || [];
  contact.suivis.push({ id: uid(), date: new Date().toISOString(), texte });
  save(data);
  toast("Suivi ajouté.");
  render();
}

function deleteContact(id) {
  if (!confirm("Retirer cette fiche et ses rencontres liées sur cet appareil ?")) return;
  const data = load();
  data.contacts = data.contacts.filter((item) => item.id !== id);
  data.evenements = data.evenements.filter((item) => item.contactId !== id);
  save(data);
  state.selectedContactId = null;
  toast("Fiche retirée.");
  render();
}

function exportData() {
  const blob = new Blob([JSON.stringify(load(), null, 2)], { type: "application/json" });
  download(blob, `carnet-${toDateKey(new Date())}.json`);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!Array.isArray(incoming.contacts) || !Array.isArray(incoming.evenements)) throw new Error("format");
      if (!confirm("Remplacer le carnet de cet appareil par le fichier importé ?")) return;
      save({ contacts: incoming.contacts, evenements: incoming.evenements });
      toast("Carnet importé.");
      render();
    } catch {
      toast("Fichier inutilisable.");
    }
  };
  reader.readAsText(file);
}

function exportIcs() {
  downloadIcs(load().evenements);
}

function downloadIcs(events) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Carnet//Suivi//FR"];
  events.filter((item) => item.titre && item.debut).forEach((item) => {
    lines.push("BEGIN:VEVENT", `UID:${item.id}@carnet`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(new Date(item.debut))}`);
    if (item.fin) lines.push(`DTEND:${icsDate(new Date(item.fin))}`);
    lines.push(`SUMMARY:${escapeIcs(item.titre)}`);
    if (item.lieu) lines.push(`LOCATION:${escapeIcs(item.lieu)}`);
    if (item.notes) lines.push(`DESCRIPTION:${escapeIcs(item.notes)}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  download(new Blob([lines.join("\r\n")], { type: "text/calendar" }), "carnet-rencontres.ics");
}

function icsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
}

function download(blob, name) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function enableNotifications() {
  if (!("Notification" in window)) { toast("Rappels non disponibles sur ce navigateur."); return; }
  Notification.requestPermission().then((result) => {
    toast(result === "granted" ? "Rappels autorisés." : "Rappels non autorisés.");
    checkReminders();
  });
}

function checkReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const data = load();
  const now = Date.now();
  let changed = false;
  data.evenements.forEach((item) => {
    const when = new Date(item.debut).getTime() - (item.rappelMinutes || 0) * 60000;
    if (!item.rappelFait && when <= now && new Date(item.debut).getTime() > now - 12 * 3600000) {
      const note = `${item.titre} · ${formatDate(item.debut)}`;
      try {
        navigator.serviceWorker?.ready.then((reg) => reg.showNotification("Carnet", { body: note, icon: "icons/icon-192.png" })).catch(() => new Notification("Carnet", { body: note }));
      } catch {
        new Notification("Carnet", { body: note });
      }
      item.rappelFait = true;
      changed = true;
    }
  });
  if (changed) save(data);
}

function installApp() {
  if (!deferredInstall) { toast("Ouvrez le menu du navigateur, puis Ajouter à l’écran d’accueil."); return; }
  deferredInstall.prompt();
}

function resetData() {
  if (!confirm("Effacer toutes les fiches et rencontres de cet appareil ?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state.selectedContactId = null;
  toast("Carnet effacé.");
  render();
}

function openModal(html) {
  const modal = document.querySelector("#modal");
  modal.innerHTML = `<div class="modal">${html}</div>`;
  modal.classList.add("open");
  modal.onclick = (event) => { if (event.target === modal || event.target.dataset.close !== undefined) closeModal(); };
  modal.querySelectorAll("[data-close]").forEach((button) => { button.onclick = closeModal; });
}

function closeModal() {
  document.querySelector("#modal").classList.remove("open");
}

function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 2400);
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstall = event;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

setInterval(checkReminders, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkReminders(); });
render();
checkReminders();
