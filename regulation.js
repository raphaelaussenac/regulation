// Régulation : classe les techniciens disponibles par distance routière jusqu'à la commune du client.
import { $, esc, api, normaliser, barre, dateDuJour, fmtDate, annoncer, autocompleteAdresse, positionTemporaire, centreDuContour } from './commun.js';

const [moi, donneesServeur, geo] = await Promise.all([
  api('/api/moi'),
  api('/api/donnees'),
  api('/api/geo').catch(e => { console.warn(e.message); return null; }),
]);
// Position temporaire : un technicien qui en a une part de là, et non de son point de départ habituel.
// Ses champs ville et adresse restent ceux du point de départ ; « temporaire » décrit l'autre.
function avecPositionsDuJour(d) {
  return {
    ...d,
    techniciens: d.techniciens.map(t => {
      const p = positionTemporaire(t);
      return p ? { ...t, lat: p.lat, lon: p.lon, temporaire: p } : t;
    }),
  };
}
let D = avecPositionsDuJour(donneesServeur); // paramètres, interventions, techniciens, absences
const centreDepartement = centreDuContour(geo?.contour); // favorise les adresses proches dans la recherche

const champ = $('commune');
const boutonEffacer = $('effacer');
const boiteSugg = $('suggestions');
const choixMode = $('mode');
const choixType = $('intervention');
const blocClassement = $('classement');
const liste = $('liste');
const blocIndispos = $('indispos');
const listeIndispos = $('indispos-liste');
const etatEl = $('etat');
const surtitreClassement = $('classement-surtitre');
const lieu = $('classement-lieu');

function afficherEntete() {
  barre({ moi, entreprise: D.parametres.entreprise, page: 'regulation' });
  document.title = `Régulation · ${D.parametres.entreprise}`;
  $('surtitre').textContent = `${modeActuel()} · ${D.parametres.departementNom} (${D.parametres.departement})`;
}
// ─── Nature de la visite ──────────────────────────────────────────
// Chaque technicien a deux listes de compétences : une pour le dépannage, une pour l'entretien.
const MODES = { depannage: 'Dépannage', entretien: 'Entretien' };
const modeActuel = () => MODES[choixMode.value] ?? MODES.depannage;
const competences = t => t[choixMode.value] ?? t.depannage ?? [];

afficherEntete();

// ─── Outils ───────────────────────────────────────────────────────
const pause = ms => new Promise(r => setTimeout(r, ms));
const nfKm = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtDuree = min => {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};
const techniciensDisponibles = n => (n > 1 ? `${n} techniciens disponibles` : `${n} technicien disponible`);

// Appel aux services publics (IGN, geo.api.gouv.fr), avec délai maximal.
async function lireJSON(url, { signal, delai = 10000 } = {}) {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), delai);
  const relayer = () => ctrl.abort();
  signal?.addEventListener('abort', relayer);
  try {
    const rep = await fetch(url, { signal: ctrl.signal });
    if (!rep.ok) throw Object.assign(new Error(`HTTP ${rep.status}`), { status: rep.status });
    return await rep.json();
  } finally {
    clearTimeout(minuteur);
    signal?.removeEventListener('abort', relayer);
  }
}

function etat(texte, alerte = false) {
  etatEl.textContent = texte;
  etatEl.classList.toggle('etat--alerte', alerte);
}

// ─── Interventions et disponibilité ───────────────────────────────
const fait = (t, type) => !type || competences(t).includes(type);
const absenceEnCours = (t, jour) => D.absences.find(a => a.technicien === t.id && a.du <= jour && jour <= a.au) || null;

function remplirTypes() {
  const choisi = choixType.value;
  choixType.innerHTML = '<option value="">Tous types d’intervention</option>'
    + D.interventions.map(x => {
      const duree = choixMode.value === 'entretien' && x.duree ? ` · ${x.duree}` : '';
      return `<option value="${esc(x.id)}">${esc(x.nom)}${esc(duree)}</option>`;
    }).join('');
  choixType.value = D.interventions.some(x => x.id === choisi) ? choisi : '';
}

// ─── Communes ─────────────────────────────────────────────────────
const DEPARTEMENT = geo?.departement.code ?? D.parametres.departement;
const COMMUNES = (geo?.communes ?? []).map(([nom, cp, lat, lon, pop]) => {
  const cle = normaliser(nom);
  return { nom, cp: cp.split(' '), lat, lon, pop, dep: DEPARTEMENT, cle, mots: cle.split(' ') };
});
const exemple = COMMUNES.reduce((a, c) => (!a || c.pop > a.pop ? c : a), null);
if (exemple) champ.placeholder = `ex. ${exemple.nom} ou ${exemple.cp[0]}`;

function chercherLocal(texte) {
  const q = normaliser(texte);
  if (!q) return [];
  if (/^\d+$/.test(q)) {
    return COMMUNES.filter(c => c.cp.some(cp => cp.startsWith(q))).sort((a, b) => b.pop - a.pop).slice(0, 20);
  }
  const jetons = q.split(' ');
  const trouvees = [];
  for (const c of COMMUNES) {
    const score = c.cle === q ? 0
      : c.cle.startsWith(q) ? 1
      : jetons.every(j => c.mots.some(m => m.startsWith(j))) ? 2
      : c.cle.includes(q) ? 3
      : -1;
    if (score >= 0) trouvees.push({ c, score });
  }
  return trouvees.sort((a, b) => a.score - b.score || b.c.pop - a.c.pop).slice(0, 8).map(t => t.c);
}

// Communes des autres départements (client près de la limite du département).
async function chercherFrance(q, signal) {
  const params = new URLSearchParams({ fields: 'nom,codesPostaux,codeDepartement,mairie,centre,population' });
  const codePostal = /^\d{5}$/.test(q);
  if (codePostal) {
    params.set('codePostal', q);
  } else {
    params.set('nom', q);
    params.set('boost', 'population');
    params.set('limit', '8');
  }
  let res = await lireJSON(`https://geo.api.gouv.fr/communes?${params}`, { signal });
  res = res.filter(c => (c.mairie || c.centre) && !(COMMUNES.length && c.codeDepartement === DEPARTEMENT));
  if (codePostal) res.sort((a, b) => (b.population || 0) - (a.population || 0));
  return res.slice(0, codePostal ? 20 : 8).map(c => {
    const [lon, lat] = (c.mairie || c.centre).coordinates;
    return { nom: c.nom, cp: c.codesPostaux || [], lat, lon, pop: c.population || 0, dep: c.codeDepartement };
  });
}

// ─── Itinéraires ──────────────────────────────────────────────────
// Service d'itinéraire de l'IGN Géoplateforme : gratuit, licence ouverte, usage professionnel autorisé.
// Il accepte 10 requêtes par seconde et bloque 5 secondes au-delà.
// S'il ne répond pas, la page affiche les distances à vol d'oiseau.
const SERVICES = [
  {
    nom: 'IGN',
    simultanes: 5,    // requêtes en cours en même temps
    intervalle: 130,  // écart minimal entre deux départs, en millisecondes (8 par seconde au plus)
    async trajet(a, b) {
      const url = 'https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&profile=car&optimization=fastest'
        + `&start=${a.lon},${a.lat}&end=${b.lon},${b.lat}`
        + '&geometryFormat=geojson&getSteps=false&getBbox=false&distanceUnit=kilometer&timeUnit=minute';
      const r = await lireJSON(url);
      if (typeof r.distance !== 'number' || !r.geometry) throw new Error('Réponse IGN inattendue');
      return { km: r.distance, min: r.duration, trace: r.geometry.coordinates.map(([x, y]) => [y, x]) };
    },
  },
];

function volOiseau(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return { km: 2 * 6371 * Math.asin(Math.sqrt(h)), min: null, trace: [[a.lat, a.lon], [b.lat, b.lon]] };
}

// Applique fn à chaque élément, au plus « limite » à la fois, en gardant l'ordre des résultats.
async function parPaquets(elements, limite, fn) {
  const res = new Array(elements.length);
  let suivant = 0;
  const ouvrier = async () => {
    while (suivant < elements.length) {
      const k = suivant++;
      res[k] = await fn(elements[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, elements.length) }, ouvrier));
  return res;
}

// Espace les départs de requêtes vers un même service d'au moins « intervalle » millisecondes.
const prochainDepart = new Map();
async function espacer(service) {
  const maintenant = performance.now();
  const depart = Math.max(maintenant, prochainDepart.get(service) ?? 0);
  prochainDepart.set(service, depart + service.intervalle);
  if (depart > maintenant) await pause(depart - maintenant);
}

// Si le service répond malgré tout « trop de requêtes » (HTTP 429), on attend la fin du blocage
// de 5 secondes puis on réessaie une fois.
async function avecReessai(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e.status !== 429) throw e;
    await pause(5500);
    return fn();
  }
}

// Un trajet par technicien, rangés par identifiant de technicien.
async function calculerTrajets(client) {
  const techniciens = D.techniciens;
  for (const service of SERVICES) {
    try {
      const trajets = await parPaquets(techniciens, service.simultanes, t => avecReessai(async () => {
        await espacer(service);
        return service.trajet(t, client);
      }));
      return { service: service.nom, trajets: new Map(techniciens.map((t, k) => [t.id, trajets[k]])) };
    } catch (e) {
      console.warn(`Itinéraire ${service.nom} indisponible`, e);
    }
  }
  return { service: null, trajets: new Map(techniciens.map(t => [t.id, volOiseau(t, client)])) };
}

// ─── État de la page ──────────────────────────────────────────────
const etatPage = {
  client: null,      // commune choisie
  type: '',          // identifiant de l'intervention choisie ('' = toutes)
  trajets: null,     // Map identifiant de technicien → trajet
  service: null,     // service qui a calculé les trajets (null = vol d'oiseau)
  chargement: false,
  edition: null,     // identifiant du technicien dont la position est en cours de saisie
};
let jourAffiche = dateDuJour();

remplirTypes();

// Techniciens disponibles (classés par distance si les trajets sont connus), puis les autres.
function classer() {
  const { type, trajets } = etatPage;
  const lignes = D.techniciens.map(t => {
    const absence = absenceEnCours(t, jourAffiche);
    return { t, id: t.id, absence, dispo: !absence && fait(t, type), ...(trajets?.get(t.id) ?? {}) };
  });
  if (trajets) lignes.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  return { dispos: lignes.filter(l => l.dispo), indispos: lignes.filter(l => !l.dispo) };
}

// ─── Classement ───────────────────────────────────────────────────
function puces(t) {
  const html = D.interventions
    .filter(x => competences(t).includes(x.id))
    .map(x => `<span class="puce${x.id === etatPage.type ? ' puce--choisie' : ''}">${esc(x.court)}</span>`)
    .join('');
  return html ? `<span class="puces">${html}</span>` : '';
}

function ligneDispo(l, rang) {
  const { t } = l;
  const resultat = !!etatPage.trajets;
  const proche = resultat && rang === 0;
  let dist = '';
  if (etatPage.chargement) {
    dist = '<span class="panneau__km attente">…</span>';
  } else if (resultat && l.km != null) {
    const temps = l.min == null ? 'à vol d’oiseau' : l.km < 0.05 ? 'sur place' : fmtDuree(l.min);
    dist = `<span class="panneau__km">${l.min == null ? '≈ ' : ''}${nfKm.format(l.km)}<small> km</small></span>
            <span class="panneau__temps">${temps}</span>`;
  }
  const tel = t.tel
    ? `<a class="panneau__tel" href="tel:${esc(t.tel.replace(/[^\d+]/g, ''))}">${esc(t.tel)}</a>`
    : '';
  const temp = t.temporaire;
  // Position actuelle et, juste à côté, le bouton qui la change : il devient un champ de recherche d'adresse.
  const position = etatPage.edition === t.id
    ? `<span class="position position--edition">
        <span class="combo position__combo">
          <input id="position-${esc(t.id)}" class="position__champ" autocomplete="off" spellcheck="false" enterkeyhint="search"
                 placeholder="Nouvelle adresse ou commune" aria-label="Nouvelle position de ${esc(t.nom)}"
                 role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="position-liste-${esc(t.id)}">
          <ul id="position-liste-${esc(t.id)}" class="suggestions" role="listbox" aria-label="Adresses proposées" hidden></ul>
        </span>
        <button type="button" class="bouton-position" data-annuler-position="${esc(t.id)}">Annuler</button>
      </span>`
    : `<span class="position">
        <span class="position__lieu">${esc(temp ? temp.adresse || temp.ville : t.ville)}</span>
        <button type="button" class="bouton-position" data-position="${esc(t.id)}">Changer</button>
        ${temp ? `<button type="button" class="bouton-position" data-retour="${esc(t.id)}">Revenir à ${esc(t.ville)}</button>` : ''}
      </span>`;
  return `<li class="panneau${proche ? ' panneau--proche' : ''}${temp ? ' panneau--temp' : ''}" data-id="${esc(l.id)}">
    ${resultat ? `<span class="panneau__rang" aria-hidden="true">${rang + 1}</span>` : ''}
    <span class="panneau__qui">
      ${proche ? '<span class="panneau__mention">Le plus proche</span>' : ''}
      ${temp ? '<span class="panneau__badge">Position temporaire</span>' : ''}
      <span class="panneau__nom">${esc(t.nom)}</span>
      ${position}
      ${tel}
      ${puces(t)}
    </span>
    <span class="panneau__dist">${dist}</span>
  </li>`;
}

function ligneIndispo(l) {
  const intervention = D.interventions.find(x => x.id === etatPage.type);
  const raison = l.absence
    ? `Absent jusqu’au ${fmtDate(l.absence.au)}${l.absence.motif ? ` · ${l.absence.motif}` : ''}`
    : `Ne fait pas : ${intervention?.court ?? ''} (${modeActuel().toLowerCase()})`;
  return `<li class="indispo" data-id="${esc(l.id)}">
    <span class="indispo__nom">${esc(l.t.nom)}</span>
    <span class="indispo__base">${esc(l.t.temporaire?.ville ?? l.t.ville)}</span>
    <span class="indispo__raison">${esc(raison)}</span>
  </li>`;
}

function rendreListe() {
  const classement = classer();
  const { client, type, trajets, service, chargement } = etatPage;
  const intervention = D.interventions.find(x => x.id === type);
  const enMode = `en ${modeActuel().toLowerCase()}`;
  const duree = choixMode.value === 'entretien' && intervention?.duree ? ` Durée prévue pour l’entretien : ${intervention.duree}.` : '';
  $('surtitre').textContent = `${modeActuel()} · ${D.parametres.departementNom} (${D.parametres.departement})`;

  surtitreClassement.textContent = client ? 'Client' : 'Vos techniciens';
  lieu.hidden = !client;
  if (client) {
    const cp = client.cp.length === 1 ? ` · ${client.cp[0]}` : '';
    lieu.textContent = `${client.nom}${client.dep !== DEPARTEMENT ? ` (${client.dep})` : ''}${cp}`;
  }

  liste.innerHTML = classement.dispos.map(ligneDispo).join('');
  listeIndispos.innerHTML = classement.indispos.map(ligneIndispo).join('');
  brancherEdition();
  blocIndispos.hidden = !classement.indispos.length;

  if (!D.techniciens.length) {
    etat(moi.role === 'admin'
      ? 'Aucun technicien enregistré. Ajoutez-les depuis la page Gestion.'
      : 'Aucun technicien enregistré. Demandez à un administrateur de les ajouter.', true);
  } else if (!classement.dispos.length) {
    etat(intervention
      ? `Aucun technicien disponible aujourd’hui pour « ${intervention.nom} » ${enMode}.`
      : 'Aucun technicien disponible aujourd’hui.', true);
  } else if (chargement) {
    etat('Calcul des itinéraires…');
  } else if (trajets && service) {
    etat(`Distances et temps par la route jusqu’à la mairie de la commune, sans trafic (calcul ${service}).${duree}`);
  } else if (trajets) {
    etat('Le calcul d’itinéraire ne répond pas : distances à vol d’oiseau. Vérifiez la connexion internet puis appuyez sur Entrée dans le champ pour relancer.', true);
  } else if (intervention) {
    etat(`${techniciensDisponibles(classement.dispos.length)} pour « ${intervention.nom} » ${enMode}. Choisissez la commune du client pour les classer.${duree}`);
  } else {
    etat('');
  }
  return classement;
}

rendreListe();

if (!window.L) {
  $('carte').innerHTML = '<p class="carte-hs">La carte n’a pas pu se charger. Vérifiez la connexion internet puis rechargez la page.</p>';
  throw new Error('Leaflet indisponible');
}

// ─── Carte ────────────────────────────────────────────────────────
const css = getComputedStyle(document.documentElement);
const COULEUR = {
  encre: css.getPropertyValue('--map-ink').trim(),
  papier: css.getPropertyValue('--map-paper').trim(),
  vert: css.getPropertyValue('--map-sign').trim(),
};
const CADRAGE = { paddingTopLeft: [60, 70], paddingBottomRight: [60, 30], maxZoom: 13 };

const carte = L.map('carte', { zoomControl: false, minZoom: 5, maxZoom: 19 });
L.control.zoom({ position: 'topright', zoomInTitle: 'Zoom avant', zoomOutTitle: 'Zoom arrière' }).addTo(carte);
L.control.scale({ imperial: false }).addTo(carte);

// Le département : un voile léger à l'extérieur, un contour net.
const anneaux = geo?.contour ?? [];
let VUE_DEPARTEMENT;
if (anneaux.length) {
  L.polygon([[[85, -180], [85, 180], [-85, 180], [-85, -180]], ...anneaux], {
    stroke: false, fillColor: COULEUR.encre, fillOpacity: 0.07, interactive: false,
  }).addTo(carte);
  VUE_DEPARTEMENT = L.polygon(anneaux.map(a => [a]), {
    color: COULEUR.encre, weight: 2, opacity: 0.5, fill: false, interactive: false,
  }).addTo(carte).getBounds();
} else if (D.techniciens.length) {
  VUE_DEPARTEMENT = L.latLngBounds(D.techniciens.map(t => [t.lat, t.lon]));
} else {
  VUE_DEPARTEMENT = L.latLngBounds([[42.3, -4.8], [51.1, 8.2]]); // France métropolitaine
}

// Leaflet ignore un cadrage demandé pendant une animation de zoom : on le garde pour la fin de celle-ci.
let zoomEnCours = false;
let cadrageEnAttente = null;
carte.on('zoomanim', () => { zoomEnCours = true; });
carte.on('zoomend', () => {
  zoomEnCours = false;
  if (cadrageEnAttente) {
    const [bornes, options] = cadrageEnAttente;
    cadrageEnAttente = null;
    carte.fitBounds(bornes, options);
  }
});
function cadrerSur(bornes, options = CADRAGE) {
  if (zoomEnCours) cadrageEnAttente = [bornes, options];
  else carte.fitBounds(bornes, options);
}
const cadrerDepartement = () => cadrerSur(VUE_DEPARTEMENT, { padding: [20, 20], maxZoom: 11 });

// Le cadrage initial attend que la carte ait une vraie taille
// (page ouverte dans un onglet ou un panneau encore replié).
carte.setView(VUE_DEPARTEMENT.getCenter(), 8);
let cadrageInitialFait = false;
function cadrageInitial() {
  const { x, y } = carte.getSize();
  if (x < 100 || y < 100) return;
  cadrerDepartement();
  cadrageInitialFait = true;
}
cadrageInitial();
new ResizeObserver(() => {
  carte.invalidateSize();
  if (!cadrageInitialFait && !etatPage.client) cadrageInitial();
}).observe($('carte'));

// ─── Fond de carte ────────────────────────────────────────────────
// Données OpenStreetMap dessinées par OpenFreeMap : gratuit, sans clé, usage professionnel possible.
// Si la carte OpenStreetMap ne peut pas s'afficher, on passe au Plan IGN.
const STYLE_OSM = 'https://tiles.openfreemap.org/styles/liberty';
const PLAN_IGN = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2'
  + '&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
let fondOSM = null;
let fondIGN = null;

function passerAuPlanIGN(raison) {
  if (fondIGN) return;
  console.warn('Fond OpenStreetMap indisponible, passage au Plan IGN :', raison);
  if (fondOSM) carte.removeLayer(fondOSM);
  fondIGN = L.tileLayer(PLAN_IGN, { maxZoom: 19, attribution: 'Fond © <a href="https://www.ign.fr/">IGN</a>' }).addTo(carte);
}

const webgl = (() => {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
})();

if (window.maplibregl && L.maplibreGL && webgl) {
  fondOSM = L.maplibreGL({ style: STYLE_OSM }).addTo(carte);
  const gl = fondOSM.getMaplibreMap();
  let charge = false;
  gl.once('load', () => { charge = true; });
  // Une erreur sans sourceId vient du style lui-même (serveur injoignable) ; une tuile manquante ne compte pas.
  gl.on('error', e => { if (!charge && !e.sourceId) setTimeout(() => passerAuPlanIGN(e.error)); });
  setTimeout(() => { if (!charge) passerAuPlanIGN('délai dépassé'); }, 15000);
} else {
  passerAuPlanIGN('MapLibre ou WebGL indisponible');
}

const BoutonDepartement = L.Control.extend({
  options: { position: 'topright' },
  onAdd() {
    const b = L.DomUtil.create('button', 'btn-carte');
    b.type = 'button';
    b.textContent = `Vue ${D.parametres.departementNom}`;
    b.title = 'Recentrer la carte sur le département';
    L.DomEvent.disableClickPropagation(b);
    L.DomEvent.on(b, 'click', cadrerDepartement);
    return b;
  },
});
new BoutonDepartement().addTo(carte);

const icone = (texte, classe) => L.divIcon({
  className: `pin ${classe}`,
  html: `<span class="pin__pied"></span><span class="pin__mat"></span><span class="pin__panneau">${esc(texte)}</span>`,
  iconSize: [0, 0],
});

const marqueurs = new Map(); // identifiant de technicien → marqueur
function construireMarqueurs() {
  for (const m of marqueurs.values()) m.remove();
  marqueurs.clear();
  for (const t of D.techniciens) {
    const m = L.marker([t.lat, t.lon], { icon: icone(t.nom, t.temporaire ? 'pin--tech pin--temp' : 'pin--tech'), title: `${t.nom} · ${t.temporaire ? `${t.temporaire.ville} (position temporaire)` : t.ville}`, keyboard: false, riseOnHover: true })
      .on('mouseover', () => mettreEnAvant(t.id))
      .on('mouseout', () => mettreEnAvant(null))
      .addTo(carte);
    marqueurs.set(t.id, m);
  }
}
construireMarqueurs();

let marqueurClient = null;
function placerClient(c) {
  const ic = icone(`Client · ${c.nom}`, 'pin--client');
  if (marqueurClient) marqueurClient.setLatLng([c.lat, c.lon]).setIcon(ic);
  else marqueurClient = L.marker([c.lat, c.lon], { icon: ic, keyboard: false, zIndexOffset: 1000 }).addTo(carte);
}

// Trajets : le plus proche en trait vert plein sur une gaine blanche, les deux suivants en pointillés.
// Les autres techniciens n'ont leur trajet affiché qu'au survol.
const calqueTrajets = L.layerGroup().addTo(carte);
const STYLE_GAINE = { color: COULEUR.papier, weight: 10, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false };
const STYLE_PROCHE = { color: COULEUR.vert, weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false };
const STYLE_AUTRE = { color: COULEUR.encre, weight: 4, opacity: 0.75, dashArray: '1 9', lineCap: 'round', lineJoin: 'round', interactive: false };
let traits = [];  // { id, trait, style }, le plus proche en dernier (dessiné au-dessus)
let gaine = null;
let traitSurvol = null;
let enAvant = null;

function dessinerTrajets(lignes) {
  calqueTrajets.clearLayers();
  traits = [];
  gaine = null;
  traitSurvol = null;
  enAvant = null;
  const visibles = lignes.slice(0, 3);
  if (!visibles.length) return;
  gaine = L.polyline(visibles[0].trace, STYLE_GAINE).addTo(calqueTrajets);
  traits = [...visibles].reverse().map((l, k, tous) => {
    const style = k === tous.length - 1 ? STYLE_PROCHE : STYLE_AUTRE;
    return { id: l.id, trait: L.polyline(l.trace, style).addTo(calqueTrajets), style };
  });
}

function mettreEnAvant(id) {
  if (id === enAvant) return;
  enAvant = id;
  traitSurvol?.remove();
  traitSurvol = null;
  const trajet = id == null || etatPage.chargement ? null : etatPage.trajets?.get(id);
  if (trajet && !traits.some(t => t.id === id)) {
    traitSurvol = L.polyline(trajet.trace, { ...STYLE_AUTRE, weight: STYLE_AUTRE.weight + 2, opacity: 1 }).addTo(calqueTrajets);
  }
  for (const t of traits) {
    if (id == null) t.trait.setStyle(t.style);
    else if (t.id === id) t.trait.setStyle({ ...t.style, weight: t.style.weight + 2, opacity: 1 }).bringToFront();
    else t.trait.setStyle({ ...t.style, opacity: 0.25 });
  }
  if (id == null) traits.at(-1)?.trait.bringToFront();
  gaine?.setStyle({ opacity: id == null || id === traits.at(-1)?.id ? STYLE_GAINE.opacity : 0.25 });
  for (const el of blocClassement.querySelectorAll('[data-id]')) el.classList.toggle('est-survole', el.dataset.id === id);
  for (const [cle, m] of marqueurs) m.getElement()?.classList.toggle('pin--survole', cle === id);
}

blocClassement.addEventListener('mouseover', e => {
  const el = e.target.closest('[data-id]');
  if (el) mettreEnAvant(el.dataset.id);
});
blocClassement.addEventListener('mouseleave', () => mettreEnAvant(null));

// ─── Affichage ────────────────────────────────────────────────────
function afficher({ cadrer = false } = {}) {
  jourAffiche = dateDuJour();
  const { dispos, indispos } = rendreListe();
  const { client, trajets, chargement } = etatPage;
  const resultat = trajets && !chargement;
  const plusProche = resultat ? dispos[0]?.id : undefined;
  const indisponibles = new Set(indispos.map(l => l.id));

  for (const [id, m] of marqueurs) {
    m.setZIndexOffset(indisponibles.has(id) ? -1000 : 0);
    const el = m.getElement();
    el?.classList.toggle('pin--indispo', indisponibles.has(id));
    el?.classList.toggle('pin--proche', id === plusProche);
  }

  dessinerTrajets(resultat ? dispos.filter(l => l.trace) : []);
  blocClassement.scrollTop = 0;

  if (cadrer && client && resultat) {
    const cibles = (dispos.length ? dispos : indispos).filter(l => l.trace).slice(0, 3);
    cadrerSur(L.latLngBounds(cibles.flatMap(l => l.trace)).extend([client.lat, client.lon]));
  }
}

// ─── Calcul pour une commune ──────────────────────────────────────
let jeton = 0;
const memoire = new Map(); // trajets déjà calculés, par commune, tant que les techniciens ne changent pas

async function calculer(client) {
  const moiJeton = ++jeton;
  etatPage.client = client;
  placerClient(client);

  const cle = `${client.lat},${client.lon}`;
  const connu = memoire.get(cle);
  if (connu) {
    Object.assign(etatPage, connu, { chargement: false });
    afficher({ cadrer: true });
    return;
  }

  Object.assign(etatPage, { trajets: null, service: null, chargement: true });
  afficher();
  const ici = L.latLng(client.lat, client.lon);
  if (!carte.getBounds().contains(ici)) carte.setView(ici, carte.getZoom(), { animate: false });

  const res = await calculerTrajets(client);
  if (moiJeton !== jeton) return; // une autre commune a été choisie entre-temps
  if (res.service) memoire.set(cle, res);
  Object.assign(etatPage, res, { chargement: false });
  afficher({ cadrer: true });
}

function reinitialiser() {
  jeton++;
  annulerRechercheDistante();
  champ.value = '';
  boutonEffacer.hidden = true;
  suggestions = [];
  fermerSuggestions();
  marqueurClient?.remove();
  marqueurClient = null;
  Object.assign(etatPage, { client: null, trajets: null, service: null, chargement: false });
  afficher();
  cadrerDepartement();
  champ.focus();
}

// Changer la nature de la visite ou le type d'intervention efface toutes les positions temporaires :
// chaque nouvel appel repart des points de départ habituels.
choixMode.addEventListener('change', async () => {
  remplirTypes();
  etatPage.type = choixType.value;
  if (!(await effacerPositionsTemporaires())) afficher({ cadrer: true });
});

choixType.addEventListener('change', async () => {
  etatPage.type = choixType.value;
  if (!(await effacerPositionsTemporaires())) afficher({ cadrer: true });
});

// ─── Mise à jour pendant la journée ───────────────────────────────
// La page reste souvent ouverte toute la journée : on récupère les changements faits dans Gestion
// (techniciens, absences, interventions) quand on revient sur l'onglet et toutes les 5 minutes.
async function rafraichir() {
  if (etatPage.edition) return; // une position est en cours de saisie : on ne redessine pas la liste
  let nouvelles;
  try {
    nouvelles = avecPositionsDuJour(await api('/api/donnees'));
  } catch {
    return;
  }
  if (nouvelles.parametres.departement !== D.parametres.departement) return location.reload();
  const equipe = d => JSON.stringify([d.techniciens, d.interventions]);
  const equipeChangee = equipe(nouvelles) !== equipe(D);
  const autreChangement = JSON.stringify(nouvelles) !== JSON.stringify(D);
  D = nouvelles;
  if (autreChangement) afficherEntete();
  if (equipeChangee) {
    remplirTypes();
    etatPage.type = choixType.value;
    construireMarqueurs();
    memoire.clear();
    if (etatPage.client) return calculer(etatPage.client);
  }
  if (autreChangement || equipeChangee || dateDuJour() !== jourAffiche) afficher();
}
let derniereVerification = Date.now();
function verifier() {
  derniereVerification = Date.now();
  rafraichir();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - derniereVerification > 60000) verifier();
});
setInterval(() => { if (document.visibilityState === 'visible') verifier(); }, 5 * 60000);

// ─── Position temporaire d'un technicien ──────────────────────────
// « Changer », à côté de la position du technicien, devient un champ de recherche d'adresse.
// L'adresse choisie devient sa position temporaire : le classement part de là jusqu'au retour
// à sa position habituelle (bouton « Revenir à … ») ou jusqu'au prochain changement de nature
// de visite ou de type d'intervention.
async function rechargerEquipe() {
  D = avecPositionsDuJour(await api('/api/donnees'));
  construireMarqueurs();
  memoire.clear();
  if (etatPage.client) await calculer(etatPage.client);
  else afficher();
}

function brancherEdition() {
  const t = etatPage.edition && D.techniciens.find(x => x.id === etatPage.edition);
  const champ = t && $(`position-${t.id}`);
  if (!champ) return;
  const boite = $(`position-liste-${t.id}`);
  autocompleteAdresse(champ, boite, choix => { if (choix) enregistrerPosition(t, choix); }, () => centreDepartement);
  champ.addEventListener('keydown', e => {
    if (e.key === 'Escape' && boite.hidden) fermerEdition();
  });
  champ.focus();
}

function ouvrirEdition(t) {
  etatPage.edition = t.id;
  rendreListe();
}

function fermerEdition() {
  etatPage.edition = null;
  rendreListe();
}

async function enregistrerPosition(t, choix) {
  etatPage.edition = null;
  try {
    await api(`/api/techniciens/${t.id}/position`, { methode: 'PUT', corps: choix });
  } catch (e) {
    annoncer(e.message);
    rendreListe();
    return;
  }
  await rechargerEquipe();
  annoncer(`Position temporaire de ${t.nom} : ${choix.ville}.`);
}

async function revenirPositionHabituelle(t) {
  try {
    await api(`/api/techniciens/${t.id}/position`, { methode: 'DELETE' });
  } catch (e) {
    annoncer(e.message);
    return;
  }
  await rechargerEquipe();
  annoncer(`${t.nom} repart de ${t.ville}, sa position habituelle.`);
}

// Renvoie vrai si des positions temporaires ont été effacées (le classement est alors recalculé).
async function effacerPositionsTemporaires() {
  etatPage.edition = null;
  if (!D.techniciens.some(t => t.temporaire)) return false;
  try {
    const { n } = await api('/api/positions-temporaires', { methode: 'DELETE' });
    await rechargerEquipe();
    annoncer(n > 1 ? `${n} positions temporaires effacées.` : 'Position temporaire effacée.');
    return true;
  } catch (e) {
    annoncer(e.message);
    return false;
  }
}

blocClassement.addEventListener('click', e => {
  const b = e.target.closest('[data-position], [data-retour], [data-annuler-position]');
  if (!b) return;
  const id = b.dataset.position ?? b.dataset.retour ?? b.dataset.annulerPosition;
  const t = D.techniciens.find(x => x.id === id);
  if (!t) return;
  if (b.dataset.retour) revenirPositionHabituelle(t);
  else if (b.dataset.annulerPosition) fermerEdition();
  else ouvrirEdition(t);
});

// ─── Saisie et suggestions ────────────────────────────────────────
const MSG_RECHERCHE = 'Recherche dans les autres départements…';
const MSG_AUCUNE = 'Aucune commune trouvée. Vérifiez l’orthographe ou tapez le code postal.';
const MSG_HORS_LIGNE = 'Recherche impossible pour le moment. Vérifiez la connexion internet.';

let suggestions = [];
let actif = -1;
let minuterie = 0;
let requeteDistante = null;

function afficherSuggestions(message = MSG_AUCUNE) {
  const q = normaliser(champ.value);
  if (!q) return fermerSuggestions();
  const numerique = /^\d+$/.test(q);
  boiteSugg.innerHTML = suggestions.length
    ? suggestions.map((c, k) => {
        const cps = numerique ? c.cp.filter(cp => cp.startsWith(q)) : c.cp;
        const dep = c.dep !== DEPARTEMENT ? ` <span class="suggestions__dep">(${esc(c.dep)})</span>` : '';
        return `<li role="option" id="sugg-${k}" data-k="${k}" aria-selected="${k === actif}">
          <span class="suggestions__nom">${esc(c.nom)}${dep}</span>
          <span class="suggestions__detail">${esc(cps.join(', '))}</span>
        </li>`;
      }).join('')
    : `<li class="suggestions__message" role="presentation">${esc(message)}</li>`;
  boiteSugg.hidden = false;
  champ.setAttribute('aria-expanded', 'true');
  if (actif >= 0) {
    champ.setAttribute('aria-activedescendant', `sugg-${actif}`);
    $(`sugg-${actif}`)?.scrollIntoView({ block: 'nearest' });
  } else {
    champ.removeAttribute('aria-activedescendant');
  }
}

function fermerSuggestions() {
  boiteSugg.hidden = true;
  champ.setAttribute('aria-expanded', 'false');
  champ.removeAttribute('aria-activedescendant');
}

function annulerRechercheDistante() {
  clearTimeout(minuterie);
  requeteDistante?.abort();
  requeteDistante = null;
}

// Complète les suggestions avec les communes des autres départements quand celui-ci ne suffit pas.
function lancerRechercheDistante() {
  annulerRechercheDistante();
  const q = normaliser(champ.value);
  const utile = /^\d{5}$/.test(q)
    ? !COMMUNES.some(c => c.cp.includes(q))
    : !/^\d+$/.test(q) && q.length >= 3 && suggestions.length < 5;
  if (!utile) return false;
  const texte = champ.value;
  const ctrl = new AbortController();
  requeteDistante = ctrl;
  minuterie = setTimeout(async () => {
    try {
      const autres = await chercherFrance(q, ctrl.signal);
      if (champ.value !== texte) return;
      suggestions = [...suggestions, ...autres];
      if (actif < 0 && suggestions.length) actif = 0;
      afficherSuggestions();
    } catch {
      if (!ctrl.signal.aborted && champ.value === texte) afficherSuggestions(MSG_HORS_LIGNE);
    }
  }, 250);
  return true;
}

async function rechercherEtChoisir() {
  annulerRechercheDistante();
  const texte = champ.value;
  afficherSuggestions(MSG_RECHERCHE);
  try {
    const [premiere] = await chercherFrance(normaliser(texte));
    if (champ.value !== texte) return;
    if (premiere) choisir(premiere);
    else afficherSuggestions(MSG_AUCUNE);
  } catch {
    if (champ.value === texte) afficherSuggestions(MSG_HORS_LIGNE);
  }
}

function choisir(c) {
  annulerRechercheDistante();
  champ.value = c.nom;
  boutonEffacer.hidden = false;
  suggestions = [c]; // Entrée relance le calcul pour cette commune
  actif = 0;
  fermerSuggestions();
  calculer(c);
  // Texte sélectionné : pour l'appel suivant, il suffit de taper la nouvelle commune.
  if (document.activeElement === champ) champ.select();
}

champ.addEventListener('input', () => {
  boutonEffacer.hidden = !champ.value;
  suggestions = chercherLocal(champ.value);
  actif = suggestions.length ? 0 : -1;
  const distante = lancerRechercheDistante();
  afficherSuggestions(distante ? MSG_RECHERCHE : MSG_AUCUNE);
});

champ.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!suggestions.length) return;
    e.preventDefault();
    const n = suggestions.length;
    if (!boiteSugg.hidden) actif = (actif + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    afficherSuggestions();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const c = suggestions[actif] ?? suggestions[0];
    if (c) choisir(c);
    else if (normaliser(champ.value)) rechercherEtChoisir();
  } else if (e.key === 'Escape') {
    if (!boiteSugg.hidden) fermerSuggestions();
    else if (champ.value) reinitialiser();
  }
});

champ.addEventListener('blur', fermerSuggestions);

// Un clic dans le champ sélectionne la commune précédente : il suffit de taper la suivante.
champ.addEventListener('mousedown', e => {
  if (document.activeElement === champ || !champ.value) return;
  e.preventDefault();
  champ.focus();
  champ.select();
});

boiteSugg.addEventListener('mousedown', e => {
  e.preventDefault(); // garde le focus dans le champ
  const li = e.target.closest('li[data-k]');
  if (li) choisir(suggestions[Number(li.dataset.k)]);
});

boutonEffacer.addEventListener('click', reinitialiser);

afficher();
