// Outils partagés par les pages : accès aux données du téléphone, barre du haut, fenêtres, dates.
import { traiter } from './stockage.js';

export const $ = id => document.getElementById(id);

// Numéro de version, défini une seule fois dans version.js (affiché dans la barre du haut).
export const VERSION_APPLI = globalThis.VERSION_APPLI ?? '?';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// « St Bauzille », « saint-bauzille », « ST BAUZILLE » → « saint bauzille »
const ABREVIATIONS = new Map([['st', 'saint'], ['ste', 'sainte']]);
export const normaliser = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .replace(/[^a-z0-9]+/g, ' ').trim()
  .split(' ').map(m => ABREVIATIONS.get(m) ?? m).join(' ');

// Date du jour du téléphone au format AAAA-MM-JJ, comme les dates d'absence.
export function dateDuJour() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const JOUR_COURT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const JOUR_LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDate = iso => JOUR_COURT.format(new Date(`${iso}T12:00:00`));
export const fmtDateLongue = iso => JOUR_LONG.format(new Date(`${iso}T12:00:00`));

// Accès aux données : mêmes adresses que la version en ligne, mais tout se passe dans le téléphone.
export function api(chemin, options) {
  return traiter(chemin, options);
}

// Le système peut effacer les données d'un site peu utilisé ; on demande qu'elles soient conservées.
navigator.storage?.persist?.().catch(() => {});

// Fichiers de l'application gardés dans le téléphone : elle s'ouvre même avec un mauvais réseau.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service worker non installé', e));
}

// Message bref après une action ; la zone existe dès le chargement pour être lue par les lecteurs d'écran.
const zoneAnnonce = Object.assign(document.createElement('p'), { className: 'annonce', role: 'status' });
zoneAnnonce.setAttribute('aria-live', 'polite');
document.body.append(zoneAnnonce);
let minuterieAnnonce = 0;
export function annoncer(texte) {
  zoneAnnonce.textContent = texte;
  clearTimeout(minuterieAnnonce);
  minuterieAnnonce = setTimeout(() => { zoneAnnonce.textContent = ''; }, 3500);
}

// Fenêtre de saisie ou de confirmation. « valider » reçoit le formulaire ; s'il lève une erreur,
// le message s'affiche en bas de la fenêtre, qui reste ouverte.
export function ouvrirFenetre({ titre, corps, bouton = 'Enregistrer', danger = false, valider, apresOuverture }) {
  const fenetre = document.createElement('dialog');
  fenetre.className = 'fenetre';
  fenetre.innerHTML = `
    <form class="fenetre__formulaire" novalidate>
      <h2 class="fenetre__titre">${esc(titre)}</h2>
      <div class="fenetre__corps">${corps}</div>
      <p class="fenetre__erreur" role="alert" hidden></p>
      <div class="fenetre__actions">
        <button type="button" class="bouton" data-annuler>Annuler</button>
        <button type="submit" class="bouton ${danger ? 'bouton--danger' : 'bouton--principal'}">${esc(bouton)}</button>
      </div>
    </form>`;
  document.body.append(fenetre);
  const formulaire = fenetre.querySelector('form');
  const erreur = fenetre.querySelector('.fenetre__erreur');
  fenetre.addEventListener('close', () => fenetre.remove());
  fenetre.querySelector('[data-annuler]').addEventListener('click', () => fenetre.close());
  formulaire.addEventListener('submit', async e => {
    e.preventDefault();
    const envoi = formulaire.querySelector('[type="submit"]');
    envoi.disabled = true;
    erreur.hidden = true;
    try {
      await valider(formulaire);
      fenetre.close();
    } catch (err) {
      erreur.textContent = err.message;
      erreur.hidden = false;
    } finally {
      envoi.disabled = false;
    }
  });
  fenetre.showModal();
  apresOuverture?.(fenetre);
  return fenetre;
}

// Barre du haut : nom de l'entreprise et les deux pages.
export function barre({ entreprise, page }) {
  const lien = (href, texte, cle) => `<a href="${href}"${page === cle ? ' aria-current="page"' : ''}>${texte}</a>`;
  $('barre').innerHTML = `
    <p class="barre__marque">${esc(entreprise)}<span class="barre__version">v${esc(VERSION_APPLI)}</span></p>
    <nav class="barre__nav" aria-label="Pages">
      ${lien('./', 'Régulation', 'regulation')}${lien('gestion.html', 'Gestion', 'gestion')}
    </nav>`;
}

// Position du jour d'un technicien : sa position temporaire si elle court encore, sinon rien.
export function positionDuJour(t, jour = dateDuJour()) {
  const p = t.positionTemporaire;
  return p && p.jusquau >= jour ? p : null;
}

// Centre approximatif d'un département, d'après son contour.
export function centreDuContour(contour) {
  const points = (contour ?? []).flat();
  if (!points.length) return null;
  const lats = points.map(p => p[0]);
  const lons = points.map(p => p[1]);
  return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 };
}

// ─── Recherche d'adresse (IGN Géoplateforme) ──────────────────────
// Sert au point de départ d'un technicien (Gestion) et à sa position du jour (Régulation).
async function chercherAdresses(q, signal, centre) {
  const params = new URLSearchParams({ q, limit: '6', autocomplete: '1' });
  if (centre) {
    params.set('lat', centre.lat.toFixed(4));
    params.set('lon', centre.lon.toFixed(4));
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
// « centre » (facultatif) renvoie le centre du département, pour proposer d'abord les adresses proches.
export function autocompleteAdresse(champ, boite, choisir, centre = () => null) {
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
        resultats = await chercherAdresses(q, requete.signal, centre());
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

