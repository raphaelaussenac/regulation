// Gestion : techniciens, absences, types d'intervention, paramètres et sauvegarde.
import { $, esc, api, barre, ouvrirFenetre, annoncer, dateDuJour, fmtDate, fmtDateLongue, pluriel } from './commun.js';
import { exporter, importer, derniereSauvegarde } from './stockage.js';

let D = await api('/api/donnees');

// Centre du département : favorise les adresses proches lors de la saisie d'un point de départ.
let centreDepartement = null;
api('/api/geo')
  .then(geo => {
    const points = geo.contour.flat();
    if (!points.length) return;
    const lats = points.map(p => p[0]);
    const lons = points.map(p => p[1]);
    centreDepartement = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 };
  })
  .catch(() => {});

function afficherEntete() {
  barre({ entreprise: D.parametres.entreprise, page: 'gestion' });
  document.title = `Gestion · ${D.parametres.entreprise}`;
  $('surtitre').textContent = `${D.parametres.entreprise} · ${D.parametres.departementNom} (${D.parametres.departement})`;
}

async function recharger() {
  D = await api('/api/donnees');
  toutRendre();
}

// ─── Rubriques ────────────────────────────────────────────────────
const RUBRIQUES = ['techniciens', 'absences', 'interventions', 'parametres', 'sauvegarde'];

function montrer() {
  const demandee = location.hash.slice(1);
  const rubrique = RUBRIQUES.includes(demandee) ? demandee : 'techniciens';
  for (const r of RUBRIQUES) $(`rubrique-${r}`).hidden = r !== rubrique;
  for (const onglet of document.querySelectorAll('.onglet')) {
    if (onglet.dataset.rubrique === rubrique) onglet.setAttribute('aria-current', 'true');
    else onglet.removeAttribute('aria-current');
  }
  if (rubrique === 'parametres') preparerParametres();
  if (rubrique === 'sauvegarde') rendreSauvegarde();
}
addEventListener('hashchange', montrer);

// ─── Outils d'affichage ───────────────────────────────────────────
const trier = (elements, cle) => [...elements].sort((a, b) => cle(a).localeCompare(cle(b), 'fr'));
const ligneVide = (colonnes, texte) => `<tr><td colspan="${colonnes}" class="tableau__vide">${texte}</td></tr>`;
// Sur téléphone, chaque ligne devient une fiche : « libelle » s'affiche au-dessus de la valeur.
const cellule = (libelle, contenu) => `<td data-libelle="${esc(libelle)}">${contenu}</td>`;
const actions = (...boutons) => `<td class="tableau__actions">${boutons.join('')}</td>`;
const bouton = (action, id, texte, discret = false) =>
  `<button type="button" class="bouton bouton--petit${discret ? ' bouton--discret' : ''}" data-action="${action}" data-id="${esc(id)}">${texte}</button>`;
const lienCarte = p => `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=16/${p.lat}/${p.lon}`;

function puces(ids) {
  const html = D.interventions.filter(x => ids.includes(x.id)).map(x => `<span class="puce">${esc(x.court)}</span>`).join('');
  return html ? `<span class="puces">${html}</span>` : '<span class="tableau__detail">Aucune</span>';
}

function disponibilite(t) {
  const jour = dateDuJour();
  const prochaine = D.absences
    .filter(a => a.technicien === t.id && a.au >= jour)
    .sort((a, b) => a.du.localeCompare(b.du))[0];
  if (!prochaine) return '<span class="statut statut--ok">Disponible</span>';
  if (prochaine.du <= jour) return `<span class="statut statut--absent">Absent jusqu’au ${fmtDate(prochaine.au)}</span>`;
  return `<span class="statut">Absent du ${fmtDate(prochaine.du)} au ${fmtDate(prochaine.au)}</span>`;
}

// ─── Rendus ───────────────────────────────────────────────────────
function rendreTechniciens() {
  $('compte-techniciens').textContent = pluriel(D.techniciens.length, 'technicien');
  $('corps-techniciens').innerHTML = trier(D.techniciens, t => t.nom).map(t => `
    <tr>
      <td class="tableau__titre"><span class="tableau__nom">${esc(t.nom)}</span>${t.tel ? `<a class="tableau__detail" href="tel:${esc(t.tel.replace(/[^\d+]/g, ''))}">${esc(t.tel)}</a>` : ''}</td>
      ${cellule('Point de départ', `${esc(t.ville)}${t.adresse ? `<span class="tableau__detail">${esc(t.adresse)}</span>` : ''}`)}
      ${cellule('Dépannage', puces(t.depannage))}
      ${cellule('Entretien', puces(t.entretien))}
      ${cellule('Disponibilité', disponibilite(t))}
      ${actions(bouton('modifier-technicien', t.id, 'Modifier'), bouton('supprimer-technicien', t.id, 'Supprimer', true))}
    </tr>`).join('') || ligneVide(6, 'Aucun technicien. Ajoutez le premier avec le bouton « Ajouter un technicien ».');
}

function rendreAbsences() {
  const noms = new Map(D.techniciens.map(t => [t.id, t.nom]));
  const jour = dateDuJour();
  const absences = D.absences
    .filter(a => a.au >= jour)
    .sort((a, b) => a.du.localeCompare(b.du) || a.au.localeCompare(b.au));
  $('corps-absences').innerHTML = absences.map(a => `
    <tr>
      <td class="tableau__titre"><span class="tableau__nom">${esc(noms.get(a.technicien) ?? 'Technicien supprimé')}</span></td>
      ${cellule('Premier jour', fmtDateLongue(a.du))}
      ${cellule('Dernier jour', fmtDateLongue(a.au))}
      ${cellule('Motif', a.motif ? esc(a.motif) : '<span class="tableau__detail">Non précisé</span>')}
      ${cellule('État', a.du <= jour ? '<span class="statut statut--absent">En cours</span>' : '<span class="statut">À venir</span>')}
      ${actions(bouton('supprimer-absence', a.id, 'Supprimer', true))}
    </tr>`).join('') || ligneVide(6, 'Aucune absence en cours ou à venir.');
}

function rendreInterventions() {
  $('corps-interventions').innerHTML = D.interventions.map(x => {
    const compter = cle => {
      const n = D.techniciens.filter(t => t[cle].includes(x.id)).length;
      return n ? pluriel(n, 'technicien') : '<span class="statut statut--absent">Aucun</span>';
    };
    return `
    <tr>
      <td class="tableau__titre"><span class="puce puce--grande">${esc(x.court)}</span></td>
      ${cellule('Libellé', esc(x.nom))}
      ${cellule('Durée d’un entretien', x.duree ? esc(x.duree) : '<span class="tableau__detail">Non précisée</span>')}
      ${cellule('En dépannage', compter('depannage'))}
      ${cellule('En entretien', compter('entretien'))}
      ${actions(bouton('modifier-intervention', x.id, 'Modifier'), bouton('supprimer-intervention', x.id, 'Supprimer', true))}
    </tr>`;
  }).join('') || ligneVide(6, 'Aucun type d’intervention. Ajoutez le premier avec le bouton « Ajouter un type ».');
}

function toutRendre() {
  rendreTechniciens();
  rendreAbsences();
  rendreInterventions();
}

// ─── Point de départ d'un technicien : recherche d'adresse (IGN Géoplateforme) ───
async function chercherAdresses(q, signal) {
  const params = new URLSearchParams({ q, limit: '6', autocomplete: '1' });
  if (centreDepartement) {
    params.set('lat', centreDepartement.lat.toFixed(4));
    params.set('lon', centreDepartement.lon.toFixed(4));
  }
  const rep = await fetch(`https://data.geopf.fr/geocodage/search?${params}`, { signal });
  if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
  const { features = [] } = await rep.json();
  return features.map(f => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const commune = p.type === 'municipality';
    return {
      libelle: p.label,
      detail: commune ? `Commune · ${p.postcode ?? ''}` : 'Adresse',
      ville: p.city || p.name || p.label,
      adresse: commune ? '' : p.label,
      lat,
      lon,
    };
  });
}

// Liste de suggestions sous le champ ; « choisir » reçoit la position retenue, ou null si le texte change.
function autocompleteAdresse(champ, boite, choisir) {
  let resultats = [];
  let actif = -1;
  let minuterie = 0;
  let requete = null;

  const afficher = message => {
    boite.innerHTML = resultats.length
      ? resultats.map((r, k) => `
          <li role="option" id="${boite.id}-${k}" data-k="${k}" aria-selected="${k === actif}">
            <span class="suggestions__nom">${esc(r.libelle)}</span>
            <span class="suggestions__detail">${esc(r.detail)}</span>
          </li>`).join('')
      : message ? `<li class="suggestions__message" role="presentation">${esc(message)}</li>` : '';
    boite.hidden = !boite.innerHTML;
    champ.setAttribute('aria-expanded', String(!boite.hidden));
    if (actif >= 0 && resultats.length) champ.setAttribute('aria-activedescendant', `${boite.id}-${actif}`);
    else champ.removeAttribute('aria-activedescendant');
  };
  const selectionner = r => {
    champ.value = r.libelle;
    resultats = [];
    afficher();
    choisir(r);
  };

  champ.addEventListener('input', () => {
    choisir(null);
    clearTimeout(minuterie);
    requete?.abort();
    const q = champ.value.trim();
    if (q.length < 3) {
      resultats = [];
      return afficher();
    }
    minuterie = setTimeout(async () => {
      requete = new AbortController();
      try {
        resultats = await chercherAdresses(q, requete.signal);
        actif = resultats.length ? 0 : -1;
        afficher('Aucune adresse trouvée. Essayez avec le nom de la commune.');
      } catch (e) {
        if (e.name === 'AbortError') return;
        resultats = [];
        afficher('Recherche d’adresse impossible pour le moment. Vérifiez la connexion internet.');
      }
    }, 250);
  });

  champ.addEventListener('keydown', e => {
    if (boite.hidden || !resultats.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      actif = (actif + (e.key === 'ArrowDown' ? 1 : -1) + resultats.length) % resultats.length;
      afficher();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (resultats[actif]) selectionner(resultats[actif]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); // ferme la liste sans fermer la fenêtre
      resultats = [];
      afficher();
    }
  });
  champ.addEventListener('blur', () => {
    resultats = [];
    afficher();
  });
  boite.addEventListener('mousedown', e => {
    e.preventDefault(); // garde le focus dans le champ
    const li = e.target.closest('li[data-k]');
    if (li) selectionner(resultats[Number(li.dataset.k)]);
  });
}

// ─── Fenêtres ─────────────────────────────────────────────────────
function formulaireTechnicien(t) {
  let position = t ? { ville: t.ville, adresse: t.adresse, lat: t.lat, lon: t.lon } : null;
  const cases = nom => D.interventions.map(x => `
    <label class="case"><input type="checkbox" name="${nom}" value="${esc(x.id)}"${t?.[nom].includes(x.id) ? ' checked' : ''}> ${esc(x.nom)}</label>`).join('');
  const groupe = (nom, titre) => `
      <fieldset class="cases">
        <legend>${titre}</legend>
        ${D.interventions.length ? `<div class="cases__liste">${cases(nom)}</div>` : '<p class="aide">Aucun type d’intervention : créez-en d’abord dans la rubrique « Interventions ».</p>'}
      </fieldset>`;
  ouvrirFenetre({
    titre: t ? `Modifier la fiche de ${t.nom}` : 'Nouveau technicien',
    corps: `
      <div class="champ">
        <label for="f-nom">Nom</label>
        <input id="f-nom" name="nom" maxlength="60" required value="${esc(t?.nom)}">
      </div>
      <div class="champ">
        <label for="f-tel">Téléphone <span class="facultatif">(facultatif)</span></label>
        <input id="f-tel" name="tel" type="tel" maxlength="30" value="${esc(t?.tel)}" placeholder="06 12 34 56 78">
      </div>
      <div class="champ">
        <label for="f-depart">Point de départ</label>
        <div class="combo">
          <input id="f-depart" autocomplete="off" spellcheck="false" placeholder="Adresse ou commune" value="${esc(t ? t.adresse || t.ville : '')}"
                 role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="f-depart-liste">
          <ul id="f-depart-liste" class="suggestions" role="listbox" aria-label="Adresses proposées" hidden></ul>
        </div>
        <p id="f-position" class="aide"></p>
      </div>
      ${groupe('depannage', 'Fait en dépannage')}
      ${groupe('entretien', 'Fait en entretien')}`,
    apresOuverture(fenetre) {
      const aide = fenetre.querySelector('#f-position');
      const decrire = () => {
        aide.innerHTML = position
          ? `Position retenue : ${esc(position.adresse || `${position.ville} (centre de la commune)`)} · <a href="${lienCarte(position)}" target="_blank" rel="noopener">voir sur la carte</a>`
          : 'Tapez une adresse ou une commune, puis choisissez-la dans la liste.';
      };
      decrire();
      autocompleteAdresse(fenetre.querySelector('#f-depart'), fenetre.querySelector('#f-depart-liste'), choix => {
        position = choix;
        decrire();
      });
    },
    async valider(formulaire) {
      const f = new FormData(formulaire);
      if (!position) throw new Error('Point de départ : choisissez une adresse ou une commune dans la liste proposée.');
      await api(t ? `/api/techniciens/${t.id}` : '/api/techniciens', {
        methode: t ? 'PUT' : 'POST',
        corps: { nom: f.get('nom'), tel: f.get('tel'), ...position, depannage: f.getAll('depannage'), entretien: f.getAll('entretien') },
      });
      await recharger();
      annoncer(t ? `Fiche de ${f.get('nom')} enregistrée.` : `Fiche de ${f.get('nom')} créée.`);
    },
  });
}

function formulaireAbsence() {
  if (!D.techniciens.length) return annoncer('Ajoutez d’abord un technicien.');
  const jour = dateDuJour();
  const options = trier(D.techniciens, t => t.nom).map(t => `<option value="${esc(t.id)}">${esc(t.nom)} · ${esc(t.ville)}</option>`).join('');
  ouvrirFenetre({
    titre: 'Nouvelle absence',
    bouton: 'Ajouter',
    corps: `
      <div class="champ">
        <label for="f-technicien">Technicien</label>
        <div class="choix"><select id="f-technicien" name="technicien">${options}</select></div>
      </div>
      <div class="deux-colonnes">
        <div class="champ">
          <label for="f-du">Premier jour</label>
          <input id="f-du" name="du" type="date" required value="${jour}">
        </div>
        <div class="champ">
          <label for="f-au">Dernier jour</label>
          <input id="f-au" name="au" type="date" required value="${jour}" min="${jour}">
        </div>
      </div>
      <div class="champ">
        <label for="f-motif">Motif <span class="facultatif">(facultatif)</span></label>
        <input id="f-motif" name="motif" maxlength="60" list="f-motifs" placeholder="Congés, maladie, formation…">
        <datalist id="f-motifs"><option value="Congés"><option value="Maladie"><option value="Formation"><option value="Récupération"></datalist>
      </div>`,
    apresOuverture(fenetre) {
      const du = fenetre.querySelector('#f-du');
      const au = fenetre.querySelector('#f-au');
      du.addEventListener('change', () => {
        au.min = du.value;
        if (au.value < du.value) au.value = du.value;
      });
    },
    async valider(formulaire) {
      const f = new FormData(formulaire);
      await api('/api/absences', { methode: 'POST', corps: Object.fromEntries(f) });
      await recharger();
      annoncer('Absence ajoutée.');
    },
  });
}

function formulaireIntervention(x) {
  ouvrirFenetre({
    titre: x ? `Modifier « ${x.nom} »` : 'Nouveau type d’intervention',
    corps: `
      <div class="champ">
        <label for="f-court">Étiquette courte</label>
        <input id="f-court" name="court" maxlength="20" required value="${esc(x?.court)}" placeholder="ex. Clim">
        <p class="aide">Affichée sur les fiches des techniciens. 20 caractères au plus.</p>
      </div>
      <div class="champ">
        <label for="f-libelle">Libellé</label>
        <input id="f-libelle" name="nom" maxlength="60" required value="${esc(x?.nom)}" placeholder="ex. Climatisation">
        <p class="aide">Affiché dans le menu « Type d’intervention » de la régulation.</p>
      </div>
      <div class="champ">
        <label for="f-duree">Durée d’un entretien <span class="facultatif">(facultatif)</span></label>
        <input id="f-duree" name="duree" maxlength="60" value="${esc(x?.duree)}" placeholder="ex. 1 h 30">
        <p class="aide">Affichée dans la régulation quand la nature de la visite est « Entretien ».</p>
      </div>`,
    async valider(formulaire) {
      const f = new FormData(formulaire);
      await api(x ? `/api/interventions/${x.id}` : '/api/interventions', {
        methode: x ? 'PUT' : 'POST',
        corps: { court: f.get('court'), nom: f.get('nom'), duree: f.get('duree') },
      });
      await recharger();
      annoncer(x ? 'Type d’intervention modifié.' : 'Type d’intervention ajouté.');
    },
  });
}

function confirmer({ titre, texte, action, bouton = 'Supprimer' }) {
  ouvrirFenetre({ titre, corps: `<p>${texte}</p>`, bouton, danger: true, valider: action });
}

// ─── Actions des boutons ──────────────────────────────────────────
const trouver = (elements, id) => elements.find(x => x.id === id);

const ACTIONS = {
  'ajouter-technicien': () => formulaireTechnicien(),
  'modifier-technicien': id => formulaireTechnicien(trouver(D.techniciens, id)),
  'supprimer-technicien': id => {
    const t = trouver(D.techniciens, id);
    const n = D.absences.filter(a => a.technicien === id).length;
    confirmer({
      titre: `Supprimer la fiche de ${t.nom} ?`,
      texte: `${esc(t.nom)} n’apparaîtra plus dans la régulation.${n ? ` Ses absences (${n}) seront aussi supprimées.` : ''}`,
      async action() {
        await api(`/api/techniciens/${id}`, { methode: 'DELETE' });
        await recharger();
        annoncer(`Fiche de ${t.nom} supprimée.`);
      },
    });
  },
  'ajouter-absence': () => formulaireAbsence(),
  'supprimer-absence': id => {
    const a = trouver(D.absences, id);
    const nom = trouver(D.techniciens, a.technicien)?.nom ?? 'ce technicien';
    confirmer({
      titre: 'Supprimer cette absence ?',
      texte: `${esc(nom)} redeviendra disponible du ${fmtDateLongue(a.du)} au ${fmtDateLongue(a.au)}.`,
      async action() {
        await api(`/api/absences/${id}`, { methode: 'DELETE' });
        await recharger();
        annoncer('Absence supprimée.');
      },
    });
  },
  'ajouter-intervention': () => formulaireIntervention(),
  'modifier-intervention': id => formulaireIntervention(trouver(D.interventions, id)),
  'supprimer-intervention': id => {
    const x = trouver(D.interventions, id);
    const n = D.techniciens.filter(t => t.depannage.includes(id) || t.entretien.includes(id)).length;
    confirmer({
      titre: `Supprimer « ${x.nom} » ?`,
      texte: `Ce type disparaîtra du menu de la régulation${n ? ` et des fiches de ${pluriel(n, 'technicien')}` : ''}.`,
      async action() {
        await api(`/api/interventions/${id}`, { methode: 'DELETE' });
        await recharger();
        annoncer('Type d’intervention supprimé.');
      },
    });
  },
  'exporter': () => exporterSauvegarde(),
  'importer': () => $('fichier-import').click(),
};

document.querySelector('.gestion').addEventListener('click', e => {
  const b = e.target.closest('button[data-action]');
  if (b) ACTIONS[b.dataset.action]?.(b.dataset.id);
});

// ─── Paramètres ───────────────────────────────────────────────────
let departementsCharges = false;

async function preparerParametres() {
  $('p-entreprise').value = D.parametres.entreprise;
  const choix = $('p-departement');
  if (!departementsCharges) {
    choix.innerHTML = `<option value="${esc(D.parametres.departement)}">${esc(D.parametres.departement)} · ${esc(D.parametres.departementNom)}</option>`;
    try {
      const departements = await api('/api/departements');
      choix.innerHTML = departements.map(d => `<option value="${esc(d.code)}">${esc(d.code)} · ${esc(d.nom)}</option>`).join('');
      departementsCharges = true;
    } catch (e) {
      $('p-message').className = 'message message--erreur';
      $('p-message').textContent = e.message;
    }
  }
  choix.value = D.parametres.departement;
}

$('form-parametres').addEventListener('submit', async e => {
  e.preventDefault();
  const envoi = e.submitter ?? e.target.querySelector('[type="submit"]');
  const message = $('p-message');
  const nouveauDepartement = $('p-departement').value !== D.parametres.departement;
  envoi.disabled = true;
  message.className = 'message';
  message.textContent = nouveauDepartement ? 'Téléchargement des communes et du contour du département…' : 'Enregistrement…';
  try {
    await api('/api/parametres', { methode: 'PUT', corps: { entreprise: $('p-entreprise').value, departement: $('p-departement').value } });
    await recharger();
    afficherEntete();
    message.textContent = 'Paramètres enregistrés.';
  } catch (err) {
    message.className = 'message message--erreur';
    message.textContent = err.message;
  } finally {
    envoi.disabled = false;
  }
});

// ─── Sauvegarde ───────────────────────────────────────────────────
const JOUR_HEURE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

function rendreSauvegarde() {
  const date = derniereSauvegarde();
  const el = $('s-derniere');
  el.className = date ? 'message' : 'message message--erreur';
  el.textContent = date
    ? `Dernière sauvegarde exportée : ${JOUR_HEURE.format(new Date(date))}.`
    : 'Aucune sauvegarde exportée pour le moment.';
}

// Sur iPhone, le menu de partage permet « Enregistrer dans Fichiers », AirDrop ou Mail.
async function exporterSauvegarde() {
  const sauvegarde = exporter();
  const nom = `depannage-sauvegarde-${dateDuJour()}.json`;
  const fichier = new File([JSON.stringify(sauvegarde, null, 2)], nom, { type: 'application/json' });
  rendreSauvegarde();
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: nom });
      annoncer('Sauvegarde exportée.');
    } catch (e) {
      if (e.name !== 'AbortError') annoncer(`Export impossible : ${e.message}`);
    }
    return;
  }
  const lien = Object.assign(document.createElement('a'), { href: URL.createObjectURL(fichier), download: nom });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 10000);
  annoncer('Sauvegarde téléchargée.');
}

$('fichier-import').addEventListener('change', async e => {
  const fichier = e.target.files[0];
  e.target.value = '';
  if (!fichier) return;
  let contenu;
  try {
    contenu = JSON.parse(await fichier.text());
  } catch {
    annoncer('Ce fichier est illisible : choisissez un fichier de sauvegarde .json.');
    return;
  }
  confirmer({
    titre: 'Remplacer les données de ce téléphone ?',
    texte: `Les techniciens, absences, types d’intervention et paramètres actuels seront remplacés par ceux de « ${esc(fichier.name)} ».`,
    bouton: 'Remplacer',
    async action() {
      const n = importer(contenu);
      await recharger();
      afficherEntete();
      annoncer(`Sauvegarde restaurée : ${pluriel(n.techniciens, 'technicien')}, ${pluriel(n.absences, 'absence')}.`);
    },
  });
});

afficherEntete();
toutRendre();
montrer();
