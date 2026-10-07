const STORAGE_KEY = "carnet.suivi.v1";

const state = {
  view: "accueil",
  filter: "tous",
  query: "",
  selectedContactId: null,
  month: startOfMonth(new Date()),
  selectedDay: toDateKey(new Date()),
  calendarMode: "mois",
  eventQuery: "",
  eventType: [],
  eventContactId: [],
  eventBand: [],
  eventCategory: [],
  eventOwnerId: [],
  eventPeriod: "7",
  eventStatut: "actifs",
  eventLieu: "tous",
  eventSuivi: "tous",
  contactVisibility: [],
  contactCategory: [],
  editingContact: null,
  editingEvent: null,
  openFilters: { fiches: false, agenda: false }
};

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
    .filter((item) => canSeeEvent(item) && new Date(item.debut).getTime() >= now)
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
  const people = data.contacts.filter((item) => canSeeEvent(item) && item.type === "personne").length;
  const orgs = data.contacts.filter((item) => canSeeEvent(item)).length - people;
  return `
    <section class="stats">
      <article class="stat"><span>Fiches</span><strong>${data.contacts.filter((item) => canSeeEvent(item)).length}</strong></article>
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
    .filter((item) => canSeeEvent(item))
    .filter((item) => !state.contactVisibility.length || state.contactVisibility.includes(item.visibilite))
    .filter((item) => !state.contactCategory.length || state.contactCategory.includes(item.categorie))
    .filter((item) => !q || [item.nom, item.telephone, item.courriel, item.adresse, item.organisme, item.notes].join(" ").toLowerCase().includes(q))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const selected = data.contacts.find((item) => item.id === state.selectedContactId);
  return `
    <div class="layout">
      <section class="panel">
        <div class="spread">
          <h2>Répertoire</h2>
          <button class="btn btn-primary btn-small" data-action="new-contact">Nouvelle fiche</button>
        </div>
        ${filterPanel("fiches", [
          ["Visibilité", "contact-visibility", [["public", "Public"], ["prive", "Privé"], ["personnel", "Personnel"]], state.contactVisibility],
          ["Catégorie", "contact-category", [["Contacts", "Contacts"], ["Organismes", "Organismes"]], state.contactCategory]
        ])}
        <input class="search" id="search" placeholder="Rechercher un nom, un courriel, un organisme" value="${escapeHtml(state.query)}" />
        <div class="list">
          ${items.length ? items.map((item) => `
            <button class="card" data-contact="${item.id}">
              <strong>${escapeHtml(item.nom)}</strong>
              <div class="meta">${escapeHtml([item.telephone, item.courriel, item.organisme].filter(Boolean).join(" · "))}</div>
              ${item.categorie ? `<span class="tag">${escapeHtml(item.categorie)}</span>` : ""}
              <span class="tag">${visibilityLabel(item.visibilite) || "Sans visibilité"}</span>
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
        ${ownsEvent(contact) ? `<button class="btn-danger btn-small" data-action="delete-contact" data-id="${contact.id}">Retirer</button>` : ""}
      </div>
    </div>
    <div>
      ${contact.categorie ? `<span class="tag">${escapeHtml(contact.categorie)}</span>` : ""}
      <span class="tag">${visibilityLabel(contact.visibilite) || "Sans visibilité"}</span>
      ${contact.ville ? `<span class="tag">${escapeHtml(contact.ville)}</span>` : ""}
    </div>
    <p class="meta">${escapeHtml([contact.telephone, contact.courriel, contact.adresse, contact.organisme].filter(Boolean).join(" · "))}</p>
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
  const selected = new Date(state.selectedDay + "T12:00:00");
  const label = state.calendarMode === "semaine" ? weekLabel(selected) : monthLabel(selected);
  return `
    <section class="panel calendar-shell">
      <div class="cal-toolbar">
        <div class="filters" role="tablist" aria-label="Vue du calendrier">
          <button class="chip ${state.calendarMode === "semaine" ? "active" : ""}" data-cal="semaine">Semaine</button>
          <button class="chip ${state.calendarMode === "mois" ? "active" : ""}" data-cal="mois">Mois</button>
        </div>
        <div class="cal-nav">
          <button class="btn-ghost btn-small icon-btn" data-action="cal-prev" aria-label="Période précédente">‹</button>
          <h2>${escapeHtml(label)}</h2>
          <button class="btn-ghost btn-small icon-btn" data-action="cal-next" aria-label="Période suivante">›</button>
          <button class="btn-ghost btn-small" data-action="cal-today" aria-label="Revenir à aujourd’hui">Auj.</button>
        </div>
      </div>
      ${renderEventFilters(data)}
      ${state.calendarMode === "semaine" ? renderWeek(data, selected) : renderMonth(data, selected)}
    </section>
    <section class="panel">
      <div class="spread">
        <h2 style="text-transform:capitalize">${formatDay(state.selectedDay)}</h2>
        <button class="btn btn-primary btn-small" data-action="new-event">Ajouter</button>
      </div>
      ${renderHourlyDay(data, state.selectedDay)}
    </section>`;
}

function renderEventFilters(data) {
  const contacts = [...data.contacts].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const windowItems = data.evenements.filter((item) => canSeeEvent(item) && matchesPeriod(item));
  const visible = windowItems.filter((item) => matchesEventFilter(data, item)).length;
  const chip = (attr, key, label, on) => `<button class="chip ${on ? "active" : ""}" ${attr}="${key}">${label}</button>`;
  return `
    <div class="event-filters">
      <div class="filter-row quick-filters">
        <div class="filters" aria-label="Raccourcis">
          ${chip("data-event-period", "jour", "Jour", state.eventPeriod === "jour")}
          ${chip("data-event-period", "7", "7 jours", state.eventPeriod === "7")}
          ${chip("data-event-statut", "actifs", "Actifs", state.eventStatut === "actifs")}
          ${chip("data-event-suivi", "retard", "Retard", state.eventSuivi === "retard")}
          <button class="chip ${state.openFilters.agenda ? "active" : ""}" data-filter-toggle="agenda">Filtres</button>
        </div>
      </div>
      <input class="search" id="event-search" placeholder="Titre, lieu ou fiche" value="${escapeHtml(state.eventQuery)}" />
      ${filterPanel("agenda", [
        ["Période", "event-period", [["jour", "Jour"], ["7", "7 jours"], ["30", "30 jours"], ["mois", "Mois"], ["tous", "Tout"]], [state.eventPeriod]],
        ["Statut", "event-statut", [["actifs", "Actifs"], ["a-venir", "À venir"], ["en-cours", "En cours"], ["tenue", "Tenue"], ["reportee", "Reportée"], ["annulee", "Annulée"], ["tous", "Tous"]], [state.eventStatut]],
        ["Suivi", "event-suivi", [["tous", "Tous"], ["ouvert", "Action ouverte"], ["sans", "Sans action"], ["retard", "En retard"]], [state.eventSuivi]],
        ["Lieu", "event-lieu", [["tous", "Tous"], ["avec", "Avec lieu"], ["sans", "Sans lieu"]], [state.eventLieu]],
        ["Type de fiche", "event-type", [["personne", "Personnes"], ["organisme", "Organismes"], ["sans", "Sans fiche"]], state.eventType],
        ["Plage", "event-band", [["matin", "Matin"], ["apres", "Après-midi"], ["soir", "Soir"]], state.eventBand],
        ["Catégorie", "event-category", [["Événements", "Événements"], ["Rencontres", "Rencontres"]], state.eventCategory],
        ["Utilisateur", "event-owner", knownUsers(data).map((user) => [user.id, user.nom]), state.eventOwnerId],
        ["Fiche", "event-contact", contacts.map((contact) => [contact.id, contact.nom]), state.eventContactId]
      ])}
      <div class="spread">
        <p class="meta">${visible} / ${windowItems.length} dans la période.</p>
        <button class="btn-ghost btn-small" data-event-reset>Réinitialiser</button>
      </div>
    </div>`;
}

function renderMonth(data, selected) {
  const month = startOfMonth(selected);
  const days = calendarDays(month);
  return `
    <div class="weekdays">${["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => `<span>${day}</span>`).join("")}</div>
    <div class="days month-grid">
      ${days.map((day) => {
        const key = toDateKey(day.date);
        const items = eventsOn(data, key);
        return `<div class="day ${day.outside ? "muted" : ""} ${key === toDateKey(new Date()) ? "today" : ""} ${key === state.selectedDay ? "selected" : ""}" data-day="${key}">
          <span class="day-num">${day.date.getDate()}</span>
          <div class="day-events">
            ${items.length ? `<span class="day-dot" aria-label="${items.length} rencontre${items.length > 1 ? "s" : ""}"></span>` : ""}
            ${items.slice(0, 2).map((item) => `<button class="pill" data-event="${item.id}">${escapeHtml(rangeLabel(item))}</button>`).join("")}
            ${items.length > 2 ? `<span class="more">+${items.length - 2}</span>` : ""}
          </div>
        </div>`;
      }).join("")}
    </div>`;
}

function renderWeek(data, selected) {
  const days = weekDays(selected);
  return `
    <div class="week-board">
      <div class="week-cols">
        ${days.map((date) => {
          const key = toDateKey(date);
          const items = eventsOn(data, key);
          return `<div class="week-col ${key === state.selectedDay ? "selected" : ""}">
            <button class="week-head ${key === toDateKey(new Date()) ? "today" : ""}" data-day="${key}">
              <small>${new Intl.DateTimeFormat("fr-CA", { weekday: "short" }).format(date)}</small>
              <strong>${date.getDate()}</strong>
              ${items.length ? `<span class="day-dot"></span>` : ""}
            </button>
            <div class="week-track">
              ${items.length ? items.map((item) => `<button class="slot-event" data-event="${item.id}"><strong>${escapeHtml(rangeLabel(item))}</strong><span>${escapeHtml(item.nom || item.titre)}</span></button>`).join("") : `<span class="slot-empty">Libre</span>`}
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>`;
}

function renderHourlyDay(data, key) {
  const items = eventsOn(data, key);
  if (!items.length) return `<p class="empty">Aucune rencontre sur cette journée.</p>`;
  const hours = [...new Set(items.flatMap((item) => occupiedHours(item, key)))].sort((a, b) => a - b);
  return `<div class="hour-day">${hours.map((hour) => hourSlot(key, hour, items, true)).join("")}</div>`;
}

function hourSlot(dayKey, hour, items, detailed) {
  const placed = items.filter((item) => eventTouchesHour(item, dayKey, hour));
  return `<div class="hour-slot" data-day="${dayKey}">
    <span class="slot-label">${hourLabel(hour)}</span>
    <div class="slot-body">
      ${placed.length ? placed.map((item) => eventInSlot(item, dayKey, hour, detailed)).join("") : `<span class="slot-empty">${hourLabel(hour)} – ${hourLabel(hour + 1)}</span>`}
    </div>
  </div>`;
}

function eventInSlot(item, dayKey, hour, detailed) {
  const start = eventDate(item.debut);
  const startsHere = toDateKey(start) === dayKey && start.getHours() === hour;
  const range = rangeLabel(item);
  if (!startsHere) {
    return `<button class="slot-event continue" data-event="${item.id}">Suite · ${escapeHtml(range)} · ${escapeHtml(item.nom || item.titre)}</button>`;
  }
  return `<button class="slot-event" data-event="${item.id}">
    <strong>${escapeHtml(range)}</strong>
    <span>${escapeHtml(item.nom || item.titre)}${item.adresse ? " · " + escapeHtml(item.adresse) : ""}</span>
  </button>`;
}

function eventTouchesHour(item, dayKey, hour) {
  const start = eventDate(item.debut);
  const end = eventDate(item.fin);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const slotStart = new Date(`${dayKey}T${String(hour).padStart(2, "0")}:00:00`);
  const slotEnd = new Date(slotStart.getTime() + 60 * 60000);
  return start < slotEnd && end > slotStart;
}

function occupiedHours(item, dayKey) {
  const start = eventDate(item.debut);
  const end = eventDate(item.fin);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const hours = [];
  for (let hour = 0; hour < 24; hour += 1) {
    if (eventTouchesHour(item, dayKey, hour)) hours.push(hour);
  }
  return hours.length ? [hours[0]] : [];
}

function hourLabel(hour) {
  return `${String(hour).padStart(2, "0")} h`;
}

function rangeLabel(item) {
  const start = eventDate(item.debut);
  const end = eventDate(item.fin);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  if (toDateKey(start) === toDateKey(end)) return `${shortTime(start)} – ${shortTime(end)}`;
  const day = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" });
  return `${day.format(start)} ${shortTime(start)} – ${day.format(end)} ${shortTime(end)}`;
}

function eventDate(value) {
  if (!value) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return new Date(value);
  return new Date(value);
}

function datePart(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = eventDate(value);
  return Number.isNaN(date.getTime()) ? "" : toDateKey(date);
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
      ${renderPartage()}
      <button class="btn-danger" data-action="reset">Effacer les données de cet appareil</button>
    </section>`;
}

function renderPartage() {
  const profile = CarnetPartage.loadProfile();
  return `
    <div class="sheet" style="margin-top:8px">
      <h2>Horaire partagé</h2>
      <p class="meta">Le registre commun est le classeur Horaire partagé, dans le dossier Carnet. Chaque appareil garde une copie, puis fusionne un lot. En cas de conflit, la modification la plus récente l’emporte. Une suppression reste marquée pour être reprise par les autres.</p>
      <div class="grid-2">
        <div class="field"><label>Nom affiché</label><input id="share-nom" value="${escapeHtml(profile.nom)}" /></div>
        <div class="field"><label>Courriel</label><input id="share-courriel" type="email" value="${escapeHtml(profile.courriel)}" /></div>
      </div>
      <div class="field"><label>Rôle</label>
        <select id="share-role">
          ${CarnetPartage.roles.map((role) => `<option value="${role}" ${profile.role === role ? "selected" : ""}>${role}</option>`).join("")}
        </select>
      </div>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn btn-primary" data-action="share-save">Enregistrer le profil</button>
        <button class="btn" data-action="share-export">Préparer un lot</button>
        <button class="btn" data-action="share-import">Fusionner un lot</button>
        <input id="share-file" type="file" accept="application/json" hidden />
      </div>
      <p class="meta">${CarnetPartage.canEdit(profile) ? "Ce profil peut modifier l’horaire." : "Ce profil consulte l’horaire, sans préparer de modification."}</p>
    </div>`;
}

function eventCategories(data) {
  return [...new Set(data.evenements.map((item) => String(item.categorie || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
}

function knownUsers(data) {
  const map = new Map();
  const profile = CarnetPartage.loadProfile();
  if (profile.id) map.set(profile.id, { id: profile.id, nom: profile.nom || "Moi" });
  for (const user of CarnetPartage.loadDirectory()) map.set(user.id, user);
  for (const item of data.evenements) {
    if (item.ownerId) map.set(item.ownerId, { id: item.ownerId, nom: item.ownerName || item.ownerId });
  }
  return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

function canSeeEvent(item) {
  const profile = CarnetPartage.loadProfile();
  if (profile.id && item.ownerId === profile.id) return true;
  if (item.visibilite === "public") return true;
  if (item.visibilite === "prive") return Boolean(profile.id) && (item.invites || []).includes(profile.id);
  return false;
}

function visibilityLabel(value) {
  return { public: "Public", prive: "Privé", personnel: "Personnel" }[value] || "";
}

function ownerLabel(item) {
  return item.ownerName || "Compte non nommé";
}

function ownsEvent(item) {
  const profile = CarnetPartage.loadProfile();
  return Boolean(profile.id) && item.ownerId === profile.id;
}

function eventCard(item) {
  const data = load();
  return `
    <button class="event" data-event="${item.id}">
      <strong>${escapeHtml(item.nom || item.titre)}</strong>
      <div class="meta">${formatDate(item.debut)}${item.adresse ? " · " + escapeHtml(item.adresse) : ""}</div>
    </button>`;
}

function labelType(key) {
  return { tous: "Tous", personne: "Personnes", organisme: "Organismes" }[key];
}

function eventsOn(data, key) {
  return data.evenements
    .filter((item) => coversDay(item, key))
    .filter((item) => canSeeEvent(item))
    .filter((item) => matchesEventFilter(data, item))
    .sort((a, b) => new Date(a.debut) - new Date(b.debut));
}

function coversDay(item, key) {
  const start = eventDate(item.debut);
  const end = eventDate(item.fin);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const dayStart = new Date(`${key}T00:00:00`);
  const dayEnd = new Date(`${key}T23:59:59`);
  return start <= dayEnd && end >= dayStart;
}

function matchesEventFilter(data, item) {
  if (!matchesPeriod(item)) return false;
  if (!matchesStatut(item)) return false;
  if (!matchesSuivi(item)) return false;
  if (!matchesLieu(item)) return false;
  const contact = data.contacts.find((entry) => entry.id === item.contactId);
  if (state.eventType.length) {
    const kind = !contact ? "sans" : contact.type === "organisme" || contact.categorie === "Organismes" ? "organisme" : contact.type === "personne" || contact.categorie === "Contacts" ? "personne" : "";
    if (!state.eventType.includes(kind)) return false;
  }
  if (state.eventCategory.length && !state.eventCategory.includes(String(item.categorie || "").trim())) return false;
  if (state.eventOwnerId.length && !state.eventOwnerId.includes(item.ownerId)) return false;
  if (state.eventContactId.length && !state.eventContactId.includes(item.contactId)) return false;
  if (state.eventBand.length && !state.eventBand.some((band) => matchesBand(item, band))) return false;
  const q = state.eventQuery.trim().toLowerCase();
  if (!q) return true;
  const haystack = [item.titre, item.nom, item.lieu, item.adresse, item.notes, item.categorie, item.ownerName, contact?.nom, contact?.organisme].join(" ").toLowerCase();
  return haystack.includes(q);
}

function periodWindow() {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (state.eventPeriod === "tous") return null;
  if (state.eventPeriod === "jour") return [start, new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59)];
  if (state.eventPeriod === "7") return [start, new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59)];
  if (state.eventPeriod === "30") return [start, new Date(start.getFullYear(), start.getMonth(), start.getDate() + 29, 23, 59, 59)];
  const month = startOfMonth(new Date(state.selectedDay + "T12:00:00"));
  return [month, new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59)];
}

function matchesPeriod(item) {
  const window = periodWindow();
  if (!window) return true;
  const start = eventDate(item.debut);
  const end = eventDate(item.fin);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return start <= window[1] && end >= window[0];
}

function eventStatut(item) {
  if (item.statut === "annulee" || item.statut === "reportee") return item.statut;
  const now = Date.now();
  const start = eventDate(item.debut).getTime();
  const end = eventDate(item.fin).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "a-venir";
  if (item.statut === "tenue" || now > end) return "tenue";
  if (now >= start && now <= end) return "en-cours";
  return "a-venir";
}

function matchesStatut(item) {
  const statut = eventStatut(item);
  if (state.eventStatut === "tous") return true;
  if (state.eventStatut === "actifs") return statut === "a-venir" || statut === "en-cours";
  return statut === state.eventStatut;
}

function matchesSuivi(item) {
  const open = Boolean(item.suiviOuvert);
  if (state.eventSuivi === "tous") return true;
  if (state.eventSuivi === "ouvert") return open;
  if (state.eventSuivi === "sans") return !open;
  if (!open || !item.suiviEcheance) return false;
  return item.suiviEcheance < toDateKey(new Date());
}

function matchesLieu(item) {
  const has = Boolean(String(item.adresse || item.lieu || "").trim());
  if (state.eventLieu === "avec") return has;
  if (state.eventLieu === "sans") return !has;
  return true;
}

function resetEventFilters() {
  state.eventPeriod = "7";
  state.eventStatut = "actifs";
  state.eventSuivi = "tous";
  state.eventLieu = "tous";
  state.eventType = [];
  state.eventBand = [];
  state.eventCategory = [];
  state.eventOwnerId = [];
  state.eventContactId = [];
  state.eventQuery = "";
  render();
}

function matchesBand(item, band) {
  if (band === "toutes") return true;
  const ranges = { matin: [7, 12], apres: [12, 17], soir: [17, 21] };
  const [from, to] = ranges[band];
  const start = new Date(item.debut);
  const end = item.fin ? new Date(item.fin) : new Date(start.getTime() + 60 * 60000);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = Math.max(end.getHours() * 60 + end.getMinutes(), startMin + 30);
  return startMin < to * 60 && endMin > from * 60;
}

function shortTime(value) {
  return new Intl.DateTimeFormat("fr-CA", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function monthLabel(date) {
  return new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric" }).format(date);
}

function weekLabel(date) {
  const days = weekDays(date);
  const start = days[0];
  const end = days[6];
  const fmt = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "short" });
  return `${fmt.format(start)} – ${fmt.format(end)} ${end.getFullYear()}`;
}

function weekDays(date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function startOfWeek(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function addDays(date, count) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + count);
  return copy;
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

function shiftCalendar(direction) {
  const current = new Date(state.selectedDay + "T12:00:00");
  const next = state.calendarMode === "semaine"
    ? addDays(current, 7 * direction)
    : new Date(current.getFullYear(), current.getMonth() + direction, 1);
  state.selectedDay = toDateKey(next);
  state.month = startOfMonth(next);
  render();
}



function filterPanel(id, groups) {
  return `<details class="filter-panel" data-filter-panel="${id}" ${state.openFilters[id] ? "open" : ""}>
    <summary>Filtre</summary>
    ${groups.map(([title, key, options, selected]) => `<div class="filter-group">
      <h3>${title}</h3>
      <div class="filter-options">
        ${options.map(([value, label]) => `<label><input type="checkbox" data-filter-key="${key}" value="${escapeHtml(value)}" ${selected.includes(value) ? "checked" : ""} /> ${escapeHtml(label)}</label>`).join("")}
      </div>
    </div>`).join("")}
  </details>`;
}

function multiOptions(options, selected) {
  return options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${selected.includes(value) ? "selected" : ""}>${label}</option>`).join("");
}

function bindMulti(selector, key) {
  document.querySelectorAll(`[data-filter-key="${key}"]`).forEach((field) => {
    field.onchange = () => {
      state[key] = [...document.querySelectorAll(`[data-filter-key="${key}"]:checked`)].map((option) => option.value);
      render();
    };
  });
}

function bind(data) {
  document.querySelectorAll("[data-filter-panel]").forEach((panel) => {
    panel.ontoggle = () => { state.openFilters[panel.dataset.filterPanel] = panel.open; };
  });
  document.querySelectorAll("[data-filter-toggle]").forEach((button) => {
    button.onclick = () => {
      const id = button.dataset.filterToggle;
      state.openFilters[id] = !state.openFilters[id];
      render();
    };
  });
  document.querySelectorAll("[data-filter-key='event-period']").forEach((field) => {
    field.onchange = () => { if (field.checked) { state.eventPeriod = field.value; render(); } };
  });
  document.querySelectorAll("[data-filter-key='event-statut']").forEach((field) => {
    field.onchange = () => { if (field.checked) { state.eventStatut = field.value; render(); } };
  });
  document.querySelectorAll("[data-filter-key='event-suivi']").forEach((field) => {
    field.onchange = () => { if (field.checked) { state.eventSuivi = field.value; render(); } };
  });
  document.querySelectorAll("[data-filter-key='event-lieu']").forEach((field) => {
    field.onchange = () => { if (field.checked) { state.eventLieu = field.value; render(); } };
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = () => { state.view = button.dataset.view; render(); };
  });
  bindMulti("#contact-visibility", "contactVisibility");
  bindMulti("#contact-category", "contactCategory");
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
  document.querySelectorAll("[data-cal]").forEach((button) => {
    button.onclick = () => { state.calendarMode = button.dataset.cal; render(); };
  });
  bindMulti("#event-type", "eventType");
  bindMulti("#event-band", "eventBand");
  bindMulti("#event-category", "eventCategory");
  bindMulti("#event-owner", "eventOwnerId");
  bindMulti("#event-contact", "eventContactId");
  document.querySelectorAll("[data-event-period]").forEach((button) => {
    button.onclick = () => { state.eventPeriod = button.dataset.eventPeriod; render(); };
  });
  document.querySelectorAll("[data-event-statut]").forEach((button) => {
    button.onclick = () => { state.eventStatut = button.dataset.eventStatut; render(); };
  });
  document.querySelectorAll("[data-event-suivi]").forEach((button) => {
    button.onclick = () => { state.eventSuivi = button.dataset.eventSuivi; render(); };
  });
  document.querySelectorAll("[data-event-lieu]").forEach((button) => {
    button.onclick = () => { state.eventLieu = button.dataset.eventLieu; render(); };
  });
  const resetFilters = document.querySelector("[data-event-reset]");
  if (resetFilters) resetFilters.onclick = resetEventFilters;
  const eventSearch = document.querySelector("#event-search");
  if (eventSearch) {
    eventSearch.oninput = () => {
      state.eventQuery = eventSearch.value;
      const pos = eventSearch.selectionStart;
      render();
      const next = document.querySelector("#event-search");
      if (next) { next.focus(); next.setSelectionRange(pos, pos); }
    };
  }

  document.querySelectorAll("[data-day]").forEach((node) => {
    node.onclick = (event) => {
      if (event.target.closest("[data-event]")) return;
      state.selectedDay = node.dataset.day;
      state.month = startOfMonth(new Date(state.selectedDay + "T12:00:00"));
      render();
    };
  });
}

function handleAction(action, id, data) {
  if (action === "new-contact") openContact();
  if (action === "edit-contact") openContact(data.contacts.find((item) => item.id === id));
  if (action === "delete-contact") deleteContact(id);
  if (action === "add-suivi") addSuivi(id);
  if (action === "new-event") openEvent(null, id && data.contacts.some((item) => item.id === id) ? id : null);
  if (action === "cal-prev") shiftCalendar(-1);
  if (action === "cal-next") shiftCalendar(1);
  if (action === "cal-today") {
    state.selectedDay = toDateKey(new Date());
    state.month = startOfMonth(new Date());
    render();
  }
  if (action === "notify") enableNotifications();
  if (action === "export") exportData();
  if (action === "import") document.querySelector("#import-file").click();
  if (action === "install") installApp();
  if (action === "ics") exportIcs();
  if (action === "share-save") saveShareProfile();
  if (action === "share-export") exportShareLot();
  if (action === "share-import") document.querySelector("#share-file").click();
  const file = document.querySelector("#import-file");
  if (file && !file.dataset.bound) {
    file.dataset.bound = "1";
    file.onchange = importData;
  }
  const shareFile = document.querySelector("#share-file");
  if (shareFile && !shareFile.dataset.bound) {
    shareFile.dataset.bound = "1";
    shareFile.onchange = importShareLot;
  }
}

function openContact(contact) {
  const data = load();
  const profile = CarnetPartage.loadProfile();
  const mine = !contact || ownsEvent(contact);
  const lock = mine ? "" : "disabled";
  state.editingContact = contact || {
    id: uid(), nom: "", telephone: "", courriel: "", adresse: "", organisme: "", notes: "", invites: [], ownerId: profile.id, ownerName: profile.nom, createdAt: new Date().toISOString()
  };
  const item = state.editingContact;
  openModal(`
    <form id="contact-form" class="sheet">
      <h2>${contact ? "Modifier la fiche" : "Nouvelle fiche"}</h2>
      <div class="field"><label>Nom</label><input name="nom" required value="${escapeHtml(item.nom)}" ${lock} /></div>
      <div class="grid-2">
        <div class="field"><label>No de téléphone</label><input name="telephone" value="${escapeHtml(item.telephone)}" ${lock} /></div>
        <div class="field"><label>Adresse courriel</label><input name="courriel" type="email" value="${escapeHtml(item.courriel)}" ${lock} /></div>
      </div>
      <div class="field"><label>Adresse complète</label><textarea name="adresse" ${lock}>${escapeHtml(item.adresse)}</textarea></div>
      <div class="field"><label>Catégorie</label>
        <select name="categorie" ${lock}>
          <option value="">Choisir</option>
          <option value="Contacts" ${item.categorie === "Contacts" ? "selected" : ""}>Contacts</option>
          <option value="Organismes" ${item.categorie === "Organismes" ? "selected" : ""}>Organismes</option>
        </select>
      </div>
      <div class="field"><label>Organisme associé</label><input name="organisme" value="${escapeHtml(item.organisme)}" ${lock} /></div>
      <div class="field"><label>Visibilité</label>
        <select name="visibilite" required ${lock}>
          <option value="">Choisir</option>
          <option value="public" ${item.visibilite === "public" ? "selected" : ""}>Public — visible par tous</option>
          <option value="prive" ${item.visibilite === "prive" ? "selected" : ""}>Privé — visible pour les utilisateurs invités</option>
          <option value="personnel" ${item.visibilite === "personnel" ? "selected" : ""}>Personnel — utilisateur seulement</option>
        </select>
      </div>
      <div class="field"><label>Utilisateurs invités</label>
        <select name="invites" multiple ${lock} size="4">
          ${knownUsers(data).filter((user) => user.id !== profile.id).map((user) => `<option value="${escapeHtml(user.id)}" ${(item.invites || []).includes(user.id) ? "selected" : ""}>${escapeHtml(user.nom)}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Notes</label><textarea name="notes" ${lock}>${escapeHtml(item.notes)}</textarea></div>
      <div class="row">
        ${mine ? `<button class="btn btn-primary" type="submit">Enregistrer</button>` : ""}
        <button class="btn-ghost" type="button" data-close>Fermer</button>
      </div>
    </form>`);
  document.querySelector("#contact-form").onsubmit = (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const visibilite = String(form.get("visibilite") || "");
    if (!profile.id) { toast("Enregistrez d’abord votre profil dans Réglages."); return; }
    if (!["public", "prive", "personnel"].includes(visibilite)) { toast("Choisissez Public, Privé ou Personnel."); return; }
    if (state.editingContact.ownerId && state.editingContact.ownerId !== profile.id) { toast("Seul le compte propriétaire peut modifier ce contact."); return; }
    const data = load();
    const next = { ...state.editingContact, updatedAt: new Date().toISOString(), ownerId: profile.id, ownerName: profile.nom || profile.courriel || "Compte" };
    for (const key of ["nom", "telephone", "courriel", "adresse", "organisme", "notes"]) next[key] = String(form.get(key) || "").trim();
    next.visibilite = visibilite;
    next.categorie = ["Contacts", "Organismes"].includes(String(form.get("categorie") || "")) ? String(form.get("categorie")) : "";
    next.invites = visibilite === "prive" ? form.getAll("invites") : [];
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
  const profile = CarnetPartage.loadProfile();
  const mine = !eventItem || ownsEvent(eventItem);
  state.editingEvent = eventItem || {
    id: uid(), nom: "", debut: "", fin: "", adresse: "", invites: [], notes: "", ownerId: profile.id, ownerName: profile.nom
  };
  const item = state.editingEvent;
  const lock = mine ? "" : "disabled";
  openModal(`
    <form id="event-form" class="sheet">
      <h2>${eventItem ? "Modifier l’événement" : "Nouvel événement"}</h2>
      <p class="meta">Jour sélectionné : ${escapeHtml(formatDay(baseDay))}. Propriétaire : ${escapeHtml(item.ownerName || profile.nom || "profil à enregistrer")}.</p>
      <div class="field"><label>Nom</label><input name="nom" required value="${escapeHtml(item.nom || item.titre || "")}" ${lock} /></div>
        <div class="field"><label>Catégorie</label>
          <select name="categorie" required ${lock}>
            <option value="">Choisir</option>
            <option value="Événements" ${item.categorie === "Événements" ? "selected" : ""}>Événements</option>
            <option value="Rencontres" ${item.categorie === "Rencontres" ? "selected" : ""}>Rencontres</option>
          </select>
        </div>
      <div class="grid-2">
        <div class="field"><label>Date de début</label><input name="dateDebut" type="date" required value="${datePart(item.debut) || baseDay}" ${lock} /></div>
        <div class="field"><label>Heure de début</label><input name="heureDebut" type="time" required value="${timePart(item.debut)}" ${lock} /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Date de fin</label><input name="dateFin" type="date" required value="${datePart(item.fin)}" ${lock} /></div>
        <div class="field"><label>Heure de fin</label><input name="heureFin" type="time" required value="${timePart(item.fin)}" ${lock} /></div>
      </div>
      <div class="field"><label>Adresse</label><input name="adresse" value="${escapeHtml(item.adresse || item.lieu || "")}" ${lock} /></div>
      <div class="grid-2">
        <div class="field"><label>Statut forcé</label>
          <select name="statut" ${lock}>
            <option value="">Dérivé des dates</option>
            <option value="reportee" ${item.statut === "reportee" ? "selected" : ""}>Reportée</option>
            <option value="annulee" ${item.statut === "annulee" ? "selected" : ""}>Annulée</option>
            <option value="tenue" ${item.statut === "tenue" ? "selected" : ""}>Tenue</option>
          </select>
        </div>
        <div class="field"><label>Fiche liée</label>
          <select name="contactId" ${lock}>
            <option value="">Sans fiche</option>
            ${data.contacts.filter((entry) => canSeeEvent(entry)).sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map((entry) => `<option value="${entry.id}" ${item.contactId === entry.id ? "selected" : ""}>${escapeHtml(entry.nom)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Action ouverte</label><input name="suiviOuvert" type="checkbox" ${item.suiviOuvert ? "checked" : ""} ${lock} /></div>
        <div class="field"><label>Échéance de l’action</label><input name="suiviEcheance" type="date" value="${escapeHtml(item.suiviEcheance || "")}" ${lock} /></div>
      </div>
      <div class="field"><label>Visibilité</label>
        <select name="visibilite" required ${lock}>
          <option value="">Choisir</option>
          <option value="public" ${item.visibilite === "public" ? "selected" : ""}>Public — visible par tous</option>
          <option value="prive" ${item.visibilite === "prive" ? "selected" : ""}>Privé — visible pour les utilisateurs invités</option>
          <option value="personnel" ${item.visibilite === "personnel" ? "selected" : ""}>Personnel — utilisateur seulement</option>
        </select>
      </div>
      <div class="field"><label>Utilisateurs invités</label>
        <select name="invites" multiple ${lock} size="4">
          ${knownUsers(data).filter((user) => user.id !== profile.id).map((user) => `<option value="${escapeHtml(user.id)}" ${(item.invites || []).includes(user.id) ? "selected" : ""}>${escapeHtml(user.nom)}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Notes</label><textarea name="notes" ${lock}>${escapeHtml(item.notes)}</textarea></div>
      <div class="row" style="flex-wrap:wrap">
        ${mine ? `<button class="btn btn-primary" type="submit">Enregistrer</button>` : ""}
        <button class="btn" type="button" data-action="one-ics">Ajouter au calendrier du téléphone</button>
        ${eventItem && mine ? `<button class="btn-danger" type="button" data-action="delete-event">Retirer</button>` : ""}
        <button class="btn-ghost" type="button" data-close>Fermer</button>
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

function timePart(value) {
  if (!value) return "";
  const match = String(value).match(/T(\d{2}:\d{2})/);
  if (match) return match[1];
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function combineDayTime(day, time) {
  if (!day || !time) return "";
  return `${day}T${time}`;
}

function readEventForm() {
  const form = new FormData(document.querySelector("#event-form"));
  const day = state.selectedDay;
  const nom = String(form.get("nom") || "").trim();
  const visibilite = String(form.get("visibilite") || "");
  return {
    ...state.editingEvent,
    nom,
    titre: nom,
    debut: combineDayTime(String(form.get("dateDebut") || ""), String(form.get("heureDebut") || "")),
    fin: combineDayTime(String(form.get("dateFin") || ""), String(form.get("heureFin") || "")),
    adresse: String(form.get("adresse") || "").trim(),
    lieu: String(form.get("adresse") || "").trim(),
    notes: String(form.get("notes") || "").trim(),
    categorie: ["Événements", "Rencontres"].includes(String(form.get("categorie") || "")) ? String(form.get("categorie")) : "",
    statut: ["reportee", "annulee", "tenue"].includes(String(form.get("statut") || "")) ? String(form.get("statut")) : "",
    contactId: String(form.get("contactId") || ""),
    suiviOuvert: form.get("suiviOuvert") === "on",
    suiviEcheance: String(form.get("suiviEcheance") || ""),
    visibilite,
    invites: visibilite === "prive" ? form.getAll("invites") : []
  };
}

function persistEvent(form) {
  const profile = CarnetPartage.loadProfile();
  if (!profile.id) {
    toast("Enregistrez d’abord votre profil dans Réglages.");
    return;
  }
  if (!["public", "prive", "personnel"].includes(String(form.get("visibilite") || ""))) {
    toast("Choisissez Public, Privé ou Personnel.");
    return;
  }
  const debut = combineDayTime(String(form.get("dateDebut") || ""), String(form.get("heureDebut") || ""));
  const fin = combineDayTime(String(form.get("dateFin") || ""), String(form.get("heureFin") || ""));
  if (!(eventDate(fin) > eventDate(debut))) {
    toast("La fin doit être après le début.");
    return;
  }
  if (state.editingEvent.ownerId && state.editingEvent.ownerId !== profile.id) {
    toast("Seul le compte propriétaire peut modifier cet événement.");
    return;
  }
  const visibilite = String(form.get("visibilite") || "");
  const nom = String(form.get("nom") || "").trim();
  const data = load();
  const next = {
    ...state.editingEvent,
    nom,
    titre: nom,
    debut,
    fin,
    adresse: String(form.get("adresse") || "").trim(),
    lieu: String(form.get("adresse") || "").trim(),
    notes: String(form.get("notes") || "").trim(),
    categorie: ["Événements", "Rencontres"].includes(String(form.get("categorie") || "")) ? String(form.get("categorie")) : "",
    statut: ["reportee", "annulee", "tenue"].includes(String(form.get("statut") || "")) ? String(form.get("statut")) : "",
    contactId: String(form.get("contactId") || ""),
    suiviOuvert: form.get("suiviOuvert") === "on",
    suiviEcheance: String(form.get("suiviEcheance") || ""),
    visibilite,
    invites: visibilite === "prive" ? form.getAll("invites") : [],
    ownerId: profile.id,
    ownerName: profile.nom || profile.courriel || "Compte",
    updatedAt: new Date().toISOString(),
    updatedBy: profile.id
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

function saveShareProfile() {
  const profile = CarnetPartage.loadProfile();
  profile.nom = document.querySelector("#share-nom").value.trim();
  profile.courriel = document.querySelector("#share-courriel").value.trim();
  profile.role = document.querySelector("#share-role").value;
  if (!profile.id) profile.id = "u-" + uid();
  CarnetPartage.saveProfile(profile);
  CarnetPartage.rememberUser(profile);
  toast("Profil partagé enregistré.");
  render();
}

function stampAuthor(item) {
  const profile = CarnetPartage.loadProfile();
  item.updatedAt = new Date().toISOString();
  item.updatedBy = profile.id || profile.nom || "local";
  return item;
}

function exportShareLot() {
  const profile = CarnetPartage.loadProfile();
  if (!CarnetPartage.canEdit(profile)) {
    toast("Ce rôle ne prépare pas de modification.");
    return;
  }
  const blob = new Blob([JSON.stringify(CarnetPartage.lotFrom(load(), profile), null, 2)], { type: "application/json" });
  download(blob, `horaire-partage-${toDateKey(new Date())}.json`);
}

function importShareLot(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (incoming.format !== "carnet-horaire-1") throw new Error("format");
      const merged = CarnetPartage.merge(load(), incoming);
      CarnetPartage.rememberUsers(incoming.utilisateurs);
      save({ contacts: merged.contacts, evenements: merged.evenements });
      toast("Horaire fusionné.");
      render();
    } catch {
      toast("Lot inutilisable.");
    }
  };
  reader.readAsText(file);
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
    lines.push(`SUMMARY:${escapeIcs(item.nom || item.titre)}`);
    if (item.adresse || item.lieu) lines.push(`LOCATION:${escapeIcs(item.adresse || item.lieu)}`);
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
setInterval(checkReminders, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkReminders(); });
render();
checkReminders();
