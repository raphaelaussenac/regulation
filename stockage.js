// Stockage local : remplace le serveur de la version en ligne.
// Toutes les données (techniciens, absences, types d'intervention, paramètres) restent dans ce téléphone,
// dans le stockage du navigateur. Rien n'est envoyé ailleurs.

const CLE_DONNEES = 'depannage:donnees';
const CLE_SAUVEGARDE = 'depannage:derniere-sauvegarde';
const PREFIXE_GEO = 'depannage:geo-';
const CLE_DEPARTEMENTS = 'depannage:departements';

// ─── Erreurs affichées dans les pages ─────────────────────────────────
class ErreurSaisie extends Error {}
const refuser = message => { throw new ErreurSaisie(message); };

const HORS_LIGNE = 'Les services de l’État (geo.api.gouv.fr, IGN) ne répondent pas pour le moment. Vérifiez la connexion internet et réessayez.';

// ─── Outils ───────────────────────────────────────────────────────────
function nouvelId(prefixe) {
  const octets = crypto.getRandomValues(new Uint8Array(6));
  return `${prefixe}_${Array.from(octets, o => o.toString(16).padStart(2, '0')).join('')}`;
}
const aujourdhui = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const decalerJours = (iso, jours) => new Date(Date.parse(`${iso}T00:00:00Z`) + jours * 86400000).toISOString().slice(0, 10);
const copie = objet => JSON.parse(JSON.stringify(objet));

// ─── Données ──────────────────────────────────────────────────────────
// Premier lancement : les techniciens et interventions d'exemple, à remplacer depuis la page Gestion.
function donneesInitiales() {
  const tech = (nom, ville, lat, lon, competences) =>
    ({ id: nouvelId('t'), nom, tel: '', ville, adresse: '', lat, lon, depannage: competences, entretien: [...competences] });
  return {
    version: 2,
    parametres: { entreprise: 'Dépannage Hérault', departement: '34', departementNom: 'Hérault' },
    interventions: [
      { id: 'chaudiere', court: 'Chaudière', nom: 'Chaudière', duree: '1 h' },
      { id: 'vmc', court: 'VMC', nom: 'VMC', duree: '' },
      { id: 'plancher', court: 'Plancher', nom: 'Plancher chauffant', duree: '' },
      { id: 'pac', court: 'PAC', nom: 'Pompe à chaleur', duree: '1 h 30' },
      { id: 'clim', court: 'Clim', nom: 'Climatisation', duree: '1 h' },
      { id: 'chauffe-eau', court: 'Chauffe-eau', nom: 'Chauffe-eau', duree: '' },
    ],
    techniciens: [
      tech('Coco', 'Montpellier', 43.6085, 3.8796, ['chaudiere', 'vmc', 'pac', 'clim']),
      tech('Michou', 'Gignac', 43.653, 3.5513, ['chaudiere', 'plancher', 'chauffe-eau']),
      tech('Gérard', 'Saint-Bauzille-de-Putois', 43.8956, 3.7378, ['chaudiere', 'vmc', 'plancher', 'pac', 'chauffe-eau']),
      tech('Nadia', 'Béziers', 43.343, 3.2138, ['vmc', 'pac', 'clim', 'chauffe-eau']),
      tech('Julien', 'Sète', 43.402, 3.6958, ['pac', 'clim', 'chauffe-eau']),
      tech('Sylvie', 'Lunel', 43.6787, 4.1322, ['chaudiere', 'plancher', 'pac', 'clim']),
      tech('Titou', 'Lodève', 43.7324, 3.3172, ['chaudiere', 'vmc', 'chauffe-eau']),
      tech('Rachid', 'Bédarieux', 43.6154, 3.16, ['chaudiere', 'vmc', 'plancher', 'pac', 'chauffe-eau']),
      tech('Mathilde', 'Saint-Pons-de-Thomières', 43.4883, 2.7596, ['chaudiere', 'clim', 'chauffe-eau']),
      tech('Pascal', 'Pézenas', 43.4596, 3.4209, ['vmc', 'plancher', 'pac', 'clim']),
    ],
    absences: [],
  };
}

function ecrireCle(cle, valeur) {
  try {
    localStorage.setItem(cle, valeur);
  } catch {
    refuser('Enregistrement impossible : le stockage du téléphone est plein ou désactivé (navigation privée ?).');
  }
}

// Les données sont relues à chaque appel : les pages Régulation et Gestion partagent ainsi le même état.
function lire() {
  const brut = localStorage.getItem(CLE_DONNEES);
  if (brut === null) {
    const d = donneesInitiales();
    enregistrer(d);
    return d;
  }
  try {
    return migrer(JSON.parse(brut));
  } catch {
    // Des données présentes mais illisibles ne sont jamais écrasées.
    refuser('Les données enregistrées sur ce téléphone sont illisibles. Restaurez une sauvegarde depuis Gestion › Sauvegarde.');
  }
}

// Données d'une version antérieure : une seule liste « interventions » par technicien,
// reprise à l'identique pour le dépannage et pour l'entretien.
function migrer(d) {
  for (const t of d.techniciens ?? []) {
    if (!Array.isArray(t.depannage)) t.depannage = Array.isArray(t.interventions) ? t.interventions : [];
    if (!Array.isArray(t.entretien)) t.entretien = [...t.depannage];
    delete t.interventions;
  }
  for (const x of d.interventions ?? []) x.duree ??= '';
  return d;
}

function enregistrer(d) {
  ecrireCle(CLE_DONNEES, JSON.stringify(d));
}

function trouver(liste, id, quoi) {
  return liste.find(x => x.id === id) || refuser(`${quoi} introuvable : la page n’est peut-être plus à jour, rechargez-la.`);
}

// ─── Contrôle des saisies ─────────────────────────────────────────────
function texte(valeur, nom, { max = 120, requis = true } = {}) {
  const v = typeof valeur === 'string' ? valeur.trim() : '';
  if (requis && !v) refuser(`${nom} : champ obligatoire.`);
  if (v.length > max) refuser(`${nom} : ${max} caractères au plus.`);
  return v;
}

function nombre(valeur, nom, min, max) {
  const v = Number(valeur);
  if (valeur === null || valeur === '' || !Number.isFinite(v) || v < min || v > max) refuser(`${nom} : valeur invalide.`);
  return v;
}

function dateISO(valeur, nom) {
  if (typeof valeur !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valeur) || Number.isNaN(Date.parse(valeur))) {
    refuser(`${nom} : date invalide.`);
  }
  return valeur;
}

// ─── Communes et contour du département ───────────────────────────────
// Téléchargés une fois (geo.api.gouv.fr et IGN), puis gardés dans le téléphone.
// L'Hérault est fourni avec l'application.
const arrondi = v => Math.round(v * 1e4) / 1e4;
let listeDepartements = null;

async function lireJSONDistant(url, delai = 30000) {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), delai);
  try {
    const rep = await fetch(url, { signal: ctrl.signal });
    if (!rep.ok) throw new Error(`${url} : HTTP ${rep.status}`);
    return await rep.json();
  } finally {
    clearTimeout(minuteur);
  }
}

async function departements() {
  if (listeDepartements) return listeDepartements;
  try {
    const liste = await lireJSONDistant('https://geo.api.gouv.fr/departements?fields=nom,code');
    listeDepartements = liste.map(d => ({ code: d.code, nom: d.nom }));
    try { localStorage.setItem(CLE_DEPARTEMENTS, JSON.stringify(listeDepartements)); } catch { /* facultatif */ }
  } catch (e) {
    const garde = localStorage.getItem(CLE_DEPARTEMENTS);
    if (!garde) throw e;
    listeDepartements = JSON.parse(garde);
  }
  return listeDepartements;
}

const geoValide = g => g && g.departement && Array.isArray(g.communes) && g.communes.length && Array.isArray(g.contour);

async function geoDepartement(code) {
  try {
    const garde = JSON.parse(localStorage.getItem(PREFIXE_GEO + code));
    if (geoValide(garde)) return garde;
  } catch { /* on retélécharge */ }

  let geo = null;
  try {
    const rep = await fetch(`./donnees/geo-${encodeURIComponent(code)}.json`);
    if (rep.ok) geo = await rep.json();
  } catch { /* pas fourni avec l'application */ }
  if (!geoValide(geo)) geo = await telechargerGeo(code);

  // Un seul département gardé à la fois.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const cle = localStorage.key(i);
    if (cle?.startsWith(PREFIXE_GEO) && cle !== PREFIXE_GEO + code) localStorage.removeItem(cle);
  }
  try { localStorage.setItem(PREFIXE_GEO + code, JSON.stringify(geo)); } catch { /* sera retéléchargé */ }
  return geo;
}

async function telechargerGeo(code) {
  const [dep, communes] = await Promise.all([
    lireJSONDistant(`https://geo.api.gouv.fr/departements/${encodeURIComponent(code)}?fields=nom,code`),
    lireJSONDistant(`https://geo.api.gouv.fr/departements/${encodeURIComponent(code)}/communes?fields=nom,codesPostaux,mairie,centre,population`),
  ]);
  // Le contour ne sert qu'au dessin de la carte : s'il manque, l'application fonctionne quand même.
  const filtre = encodeURIComponent(`code_insee='${code}'`);
  const contour = await lireJSONDistant('https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature'
    + '&TYPENAMES=ADMINEXPRESS-COG-CARTO.LATEST:departement&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326'
    + `&CQL_FILTER=${filtre}`).catch(() => null);
  return {
    departement: { code: dep.code, nom: dep.nom },
    // [nom, codes postaux, latitude, longitude (mairie), population]
    communes: communes
      .filter(c => c.mairie || c.centre)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
      .map(c => {
        const [lon, lat] = (c.mairie || c.centre).coordinates;
        return [c.nom, (c.codesPostaux || []).join(' '), arrondi(lat), arrondi(lon), c.population || 0];
      }),
    contour: simplifierContour(contour?.features?.[0]?.geometry),
  };
}

// Contour simplifié à 100 m près : un anneau [[lat, lon], …] par morceau de territoire de plus d'1 km².
function simplifierContour(geometrie) {
  if (!geometrie) return [];
  const polygones = geometrie.type === 'MultiPolygon' ? geometrie.coordinates : [geometrie.coordinates];
  const k = Math.cos((polygones[0][0][0][1] * Math.PI) / 180);
  const enKm = ([x, y]) => [x * k * 111.32, y * 110.57];
  return polygones
    .map(polygone => polygone[0])
    .filter(anneau => aireKm2(anneau.map(enKm)) >= 1)
    .map(anneau => simplifierAnneau(anneau, enKm, 0.1).map(([x, y]) => [arrondi(y), arrondi(x)]));
}

function aireKm2(points) {
  let s = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    s += (points[j][0] + points[i][0]) * (points[j][1] - points[i][1]);
  }
  return Math.abs(s / 2);
}

// Douglas-Peucker : garde les points qui s'écartent de plus de « tolerance » km du tracé simplifié.
function douglasPeucker(points, tolerance) {
  const garder = new Uint8Array(points.length);
  garder[0] = garder[points.length - 1] = 1;
  const pile = [[0, points.length - 1]];
  while (pile.length) {
    const [a, b] = pile.pop();
    const [x1, y1] = points[a];
    const [x2, y2] = points[b];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const longueur = Math.hypot(dx, dy) || 1e-9;
    let iMax = -1;
    let dMax = 0;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (points[i][0] - x1) - dx * (points[i][1] - y1)) / longueur;
      if (d > dMax) {
        iMax = i;
        dMax = d;
      }
    }
    if (iMax >= 0 && dMax > tolerance) {
      garder[iMax] = 1;
      pile.push([a, iMax], [iMax, b]);
    }
  }
  return garder;
}

// Un anneau est fermé : on le coupe au point le plus éloigné du premier pour avoir deux extrémités distinctes.
function simplifierAnneau(anneau, enKm, tolerance) {
  const points = anneau.map(enKm);
  let loin = 0;
  let dLoin = 0;
  points.forEach(([x, y], i) => {
    const d = Math.hypot(x - points[0][0], y - points[0][1]);
    if (d > dLoin) {
      dLoin = d;
      loin = i;
    }
  });
  const debut = douglasPeucker(points.slice(0, loin + 1), tolerance);
  const fin = douglasPeucker(points.slice(loin), tolerance);
  return anneau.filter((_, i) => (i <= loin ? debut[i] : fin[i - loin]));
}

// ─── Routes (mêmes adresses que la version en ligne) ──────────────────
const routes = [];
function route(methode, motif, gestionnaire) {
  const cles = [];
  const re = new RegExp(`^${motif.replace(/:(\w+)/g, (_, cle) => { cles.push(cle); return '([^/]+)'; })}$`);
  routes.push({ methode, re, cles, gestionnaire });
}

// Un seul utilisateur, sur son propre téléphone : il a accès à tout.
route('GET', '/api/moi', () => ({ id: 'local', identifiant: 'local', nom: '', role: 'admin' }));

route('GET', '/api/donnees', () => {
  const d = lire();
  const jour = aujourdhui();
  return {
    parametres: d.parametres,
    interventions: d.interventions,
    techniciens: d.techniciens,
    absences: d.absences.filter(a => a.au >= jour),
  };
});

route('GET', '/api/geo', () => geoDepartement(lire().parametres.departement).catch(() => refuser(HORS_LIGNE)));

route('GET', '/api/departements', () => departements().catch(() => refuser(HORS_LIGNE)));

route('PUT', '/api/parametres', async ({ corps }) => {
  const entreprise = texte(corps.entreprise, 'Nom de l’entreprise', { max: 80 });
  const code = texte(corps.departement, 'Département', { max: 3 }).toUpperCase();
  const d = lire();
  let dep = { code: d.parametres.departement, nom: d.parametres.departementNom };
  if (code !== dep.code) {
    const liste = await departements().catch(() => refuser(HORS_LIGNE));
    dep = liste.find(x => x.code === code) || refuser('Département inconnu.');
    // Télécharge ses communes et son contour.
    await geoDepartement(dep.code).catch(() => refuser(HORS_LIGNE));
  }
  d.parametres = { entreprise, departement: dep.code, departementNom: dep.nom };
  enregistrer(d);
  return d.parametres;
});

// Types d'intervention
function lireIntervention(d, corps, id) {
  const intervention = {
    court: texte(corps.court, 'Étiquette courte', { max: 20 }),
    nom: texte(corps.nom, 'Libellé', { max: 60 }),
    duree: texte(corps.duree, 'Durée d’un entretien', { max: 60, requis: false }),
  };
  const doublon = d.interventions.find(i => i.id !== id && i.court.toLowerCase() === intervention.court.toLowerCase());
  if (doublon) refuser(`L’étiquette « ${doublon.court} » existe déjà.`);
  return intervention;
}

route('POST', '/api/interventions', ({ corps }) => {
  const d = lire();
  const intervention = { id: nouvelId('i'), ...lireIntervention(d, corps) };
  d.interventions.push(intervention);
  enregistrer(d);
  return intervention;
});

route('PUT', '/api/interventions/:id', ({ params, corps }) => {
  const d = lire();
  const intervention = trouver(d.interventions, params.id, 'Type d’intervention');
  Object.assign(intervention, lireIntervention(d, corps, intervention.id));
  enregistrer(d);
  return intervention;
});

route('DELETE', '/api/interventions/:id', ({ params }) => {
  const d = lire();
  trouver(d.interventions, params.id, 'Type d’intervention');
  d.interventions = d.interventions.filter(i => i.id !== params.id);
  for (const t of d.techniciens) {
    t.depannage = t.depannage.filter(id => id !== params.id);
    t.entretien = t.entretien.filter(id => id !== params.id);
  }
  enregistrer(d);
});

// Techniciens
function lireTechnicien(d, corps) {
  if (corps.lat == null || corps.lon == null) {
    refuser('Point de départ : choisissez une adresse ou une commune dans la liste proposée.');
  }
  const connues = new Set(d.interventions.map(i => i.id));
  const liste = valeur => (Array.isArray(valeur) ? [...new Set(valeur)].filter(id => connues.has(id)) : []);
  // Ancien format : une seule liste « interventions », valable pour les deux natures de visite.
  const depannage = corps.depannage ?? corps.interventions;
  const entretien = corps.entretien ?? corps.interventions;
  return {
    nom: texte(corps.nom, 'Nom', { max: 60 }),
    tel: texte(corps.tel, 'Téléphone', { max: 30, requis: false }),
    ville: texte(corps.ville, 'Commune de départ', { max: 80 }),
    adresse: texte(corps.adresse, 'Adresse de départ', { max: 200, requis: false }),
    lat: nombre(corps.lat, 'Latitude', -90, 90),
    lon: nombre(corps.lon, 'Longitude', -180, 180),
    depannage: liste(depannage),
    entretien: liste(entretien),
  };
}

route('POST', '/api/techniciens', ({ corps }) => {
  const d = lire();
  const technicien = { id: nouvelId('t'), ...lireTechnicien(d, corps) };
  d.techniciens.push(technicien);
  enregistrer(d);
  return technicien;
});

route('PUT', '/api/techniciens/:id', ({ params, corps }) => {
  const d = lire();
  const technicien = trouver(d.techniciens, params.id, 'Technicien');
  Object.assign(technicien, lireTechnicien(d, corps));
  enregistrer(d);
  return technicien;
});

route('DELETE', '/api/techniciens/:id', ({ params }) => {
  const d = lire();
  trouver(d.techniciens, params.id, 'Technicien');
  d.techniciens = d.techniciens.filter(t => t.id !== params.id);
  d.absences = d.absences.filter(a => a.technicien !== params.id);
  enregistrer(d);
});

// Position temporaire : là où se trouve le technicien jusqu'à une date (incluse), à la place de son point de départ.
// Passé cette date, il repart de son point de départ habituel sans rien faire.
function lirePosition(corps) {
  if (corps.lat == null || corps.lon == null) {
    refuser('Position du jour : choisissez une adresse ou une commune dans la liste proposée.');
  }
  const jusquau = dateISO(corps.jusquau, 'Jusqu’au');
  if (jusquau < aujourdhui()) refuser('La date de fin est déjà passée.');
  return {
    ville: texte(corps.ville, 'Commune', { max: 80 }),
    adresse: texte(corps.adresse, 'Adresse', { max: 200, requis: false }),
    lat: nombre(corps.lat, 'Latitude', -90, 90),
    lon: nombre(corps.lon, 'Longitude', -180, 180),
    jusquau,
  };
}

route('PUT', '/api/techniciens/:id/position', ({ params, corps }) => {
  const d = lire();
  const technicien = trouver(d.techniciens, params.id, 'Technicien');
  technicien.positionTemporaire = lirePosition(corps);
  enregistrer(d);
  return technicien;
});

route('DELETE', '/api/techniciens/:id/position', ({ params }) => {
  const d = lire();
  const technicien = trouver(d.techniciens, params.id, 'Technicien');
  delete technicien.positionTemporaire;
  enregistrer(d);
  return technicien;
});

// Absences
route('POST', '/api/absences', ({ corps }) => {
  const d = lire();
  const technicien = trouver(d.techniciens, corps.technicien, 'Technicien');
  const du = dateISO(corps.du, 'Premier jour');
  const au = dateISO(corps.au, 'Dernier jour');
  if (au < du) refuser('Le dernier jour doit être le même que le premier ou après.');
  const absence = { id: nouvelId('a'), technicien: technicien.id, du, au, motif: texte(corps.motif, 'Motif', { max: 60, requis: false }) };
  // On en profite pour oublier les absences terminées depuis plus de 30 jours.
  const limite = decalerJours(aujourdhui(), -30);
  d.absences = d.absences.filter(a => a.au >= limite);
  d.absences.push(absence);
  enregistrer(d);
  return absence;
});

route('DELETE', '/api/absences/:id', ({ params }) => {
  const d = lire();
  trouver(d.absences, params.id, 'Absence');
  d.absences = d.absences.filter(a => a.id !== params.id);
  enregistrer(d);
});

// ─── Aiguillage ───────────────────────────────────────────────────────
export async function traiter(chemin, { methode = 'GET', corps } = {}) {
  for (const r of routes) {
    const m = r.methode === methode ? r.re.exec(chemin) : null;
    if (!m) continue;
    const params = Object.fromEntries(r.cles.map((cle, i) => [cle, decodeURIComponent(m[i + 1])]));
    try {
      const resultat = await r.gestionnaire({ params, corps: corps ?? {} });
      return copie(resultat ?? { ok: true });
    } catch (e) {
      if (e instanceof ErreurSaisie) throw new Error(e.message);
      console.error(e);
      throw new Error('Erreur inattendue. Réessayez dans un instant.');
    }
  }
  throw new Error(`Adresse inconnue : ${methode} ${chemin}`);
}

// ─── Sauvegarde : export et restauration ──────────────────────────────
export function exporter() {
  const d = lire();
  const quand = new Date();
  ecrireCle(CLE_SAUVEGARDE, quand.toISOString());
  return {
    format: 'depannage-sauvegarde',
    version: 2,
    date: quand.toISOString(),
    donnees: { parametres: d.parametres, interventions: d.interventions, techniciens: d.techniciens, absences: d.absences },
  };
}

export function derniereSauvegarde() {
  return localStorage.getItem(CLE_SAUVEGARDE);
}

// Accepte une sauvegarde de cette application ou le fichier donnees.json de la version en ligne.
// Chaque élément est contrôlé comme une saisie ; les comptes utilisateurs de la version en ligne sont ignorés.
export function importer(objet) {
  const source = objet?.format === 'depannage-sauvegarde' ? objet.donnees : objet;
  if (!source || typeof source !== 'object' || !source.parametres || !Array.isArray(source.techniciens)) {
    throw new Error('Ce fichier n’est pas une sauvegarde de l’application de dépannage.');
  }
  try {
    const p = source.parametres;
    const interventions = (source.interventions ?? []).map(x => ({
      id: texte(x.id, 'Identifiant d’intervention', { max: 40 }),
      court: texte(x.court, 'Étiquette courte', { max: 20 }),
      nom: texte(x.nom, 'Libellé', { max: 60 }),
      duree: texte(x.duree, 'Durée d’un entretien', { max: 60, requis: false }),
    }));
    const d = {
      version: 2,
      parametres: {
        entreprise: texte(p.entreprise, 'Nom de l’entreprise', { max: 80 }),
        departement: texte(p.departement, 'Département', { max: 3 }).toUpperCase(),
        departementNom: texte(p.departementNom, 'Nom du département', { max: 80 }),
      },
      interventions,
      techniciens: [],
      absences: [],
    };
    d.techniciens = source.techniciens.map(t => {
      const technicien = { id: texte(t.id, 'Identifiant de technicien', { max: 40 }), ...lireTechnicien(d, t) };
      // Une position temporaire encore valable est gardée ; une position périmée ou abîmée est ignorée.
      if (t.positionTemporaire) {
        try { technicien.positionTemporaire = lirePosition(t.positionTemporaire); } catch { /* ignorée */ }
      }
      return technicien;
    });
    const ids = new Set(d.techniciens.map(t => t.id));
    d.absences = (source.absences ?? [])
      .filter(a => ids.has(a.technicien))
      .map(a => ({
        id: texte(a.id, 'Identifiant d’absence', { max: 40 }),
        technicien: a.technicien,
        du: dateISO(a.du, 'Premier jour'),
        au: dateISO(a.au, 'Dernier jour'),
        motif: texte(a.motif, 'Motif', { max: 60, requis: false }),
      }));
    enregistrer(d);
    return { techniciens: d.techniciens.length, absences: d.absences.length, interventions: d.interventions.length };
  } catch (e) {
    if (e instanceof ErreurSaisie) throw new Error(`Sauvegarde refusée, rien n’a été modifié. ${e.message}`);
    throw e;
  }
}
