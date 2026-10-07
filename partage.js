const CarnetPartage = {
  profileKey: "carnet.profil.v1",
  directoryKey: "carnet.annuaire.v1",
  roles: ["proprietaire", "editeur", "lecteur"],

  loadProfile() {
    try {
      return { id: "", nom: "", courriel: "", role: "editeur", ...JSON.parse(localStorage.getItem(this.profileKey) || "{}") };
    } catch {
      return { id: "", nom: "", courriel: "", role: "editeur" };
    }
  },

  saveProfile(profile) {
    localStorage.setItem(this.profileKey, JSON.stringify(profile));
  },

  loadDirectory() {
    try {
      const items = JSON.parse(localStorage.getItem(this.directoryKey) || "[]");
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  },

  rememberUser(profile) {
    if (!profile.id) return;
    const items = this.loadDirectory().filter((item) => item.id !== profile.id);
    items.push({ id: profile.id, nom: profile.nom || profile.courriel || "Compte", courriel: profile.courriel || "" });
    localStorage.setItem(this.directoryKey, JSON.stringify(items));
  },

  rememberUsers(users) {
    for (const user of users || []) this.rememberUser(user);
  },

  canEdit(profile) {
    return profile.role === "proprietaire" || profile.role === "editeur";
  },

  lotFrom(data, profile) {
    return {
      format: "carnet-horaire-1",
      exportedAt: new Date().toISOString(),
      exportedBy: profile.id || profile.nom || "inconnu",
      utilisateurs: this.loadDirectory().concat(profile.id ? [profile] : []),
      contacts: data.contacts || [],
      evenements: data.evenements || []
    };
  },

  merge(local, incoming) {
    const contacts = this.mergeList(local.contacts, incoming.contacts);
    const evenements = this.mergeList(local.evenements, incoming.evenements, true);
    return {
      contacts: contacts.filter((item) => item.deleted !== true),
      evenements: evenements.filter((item) => item.deleted !== true),
      report: {
        fiches: contacts.length,
        rencontres: evenements.length,
        retirees: contacts.filter((item) => item.deleted).length + evenements.filter((item) => item.deleted).length
      }
    };
  },

  mergeList(localItems, incomingItems, keepOwner) {
    const map = new Map();
    for (const item of localItems || []) map.set(item.id, item);
    for (const item of incomingItems || []) {
      const current = map.get(item.id);
      if (!current || this.stamp(item) >= this.stamp(current)) {
        const next = { ...item };
        if (keepOwner && current?.ownerId) {
          next.ownerId = current.ownerId;
          next.ownerName = current.ownerName || next.ownerName;
        }
        map.set(item.id, next);
      }
    }
    return [...map.values()];
  },

  stamp(item) {
    const value = Date.parse(item.updatedAt || item.createdAt || 0);
    return Number.isNaN(value) ? 0 : value;
  }
};
