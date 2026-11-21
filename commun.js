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
