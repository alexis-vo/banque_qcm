// ---------- État global ----------
let currentQuizData = null;      // { titre_chapitre, questions } : le tirage en cours
let questionsPoolComplet = [];   // toutes les questions du chapitre chargé (avant tirage)
let titreChapitreActuel = '';
let dossierActuel = null;        // pour pouvoir relancer sans repasser par le menu
let fichierActuel = null;

let config = {
  nb: 10,
  mode: 'classique',   // 'classique' | 'immediat' | 'revision'
  timed: false,
  dureeMinutes: 5,      // utilisé en mode classique (minuteur global)
  dureeSecondesParQuestion: 60 // utilisé en mode immediat (minuteur par question)
};

let currentQIndex = 0;   // index de la question affichée en mode immediat
let scoreCourant = 0;    // score accumulé en mode immediat

let timerId = null;
let timeLeft = 0;

// Échappe & < > pour que le LaTeX (ex: "d(x,y) < r") ne soit jamais interprété
// comme du HTML. Sans ça, un "<" dans une formule tronque le reste du texte
// inséré via innerHTML avant même que MathJax ait pu le lire.
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// ---------- Menu principal ----------

async function initMenu() {
  try {
    const response = await fetch('data/index.json');
    const data = await response.json();
    const container = document.getElementById('menu-container');
    let html = '';
    data.matieres.forEach(mat => {
      html += `<div class="matiere-card">`;
      html += `<h3>${mat.nom}</h3>`;
      mat.chapitres.forEach(chap => {
        html += `<button class="chapitre-btn" onclick="chargerChapitre('${mat.dossier}', '${chap.fichier}')">${chap.titre}</button>`;
      });
      html += `</div>`;
    });
    container.innerHTML = html;
  } catch (error) {
    document.getElementById('menu-container').innerHTML = `<p class="incorrect">Erreur lors du chargement des cours. (Vérifiez que vous utilisez un serveur local).</p>`;
    console.error(error);
  }
}

// Charger un chapitre : on ne tire plus les questions ici, on affiche d'abord les réglages
async function chargerChapitre(dossier, fichier) {
  const cheminComplet = `data/${dossier}/${fichier}`;
  try {
    const response = await fetch(cheminComplet);
    if (!response.ok) {
      throw new Error(`Fichier introuvable (Erreur HTTP ${response.status})`);
    }
    const data = await response.json();

    questionsPoolComplet = data.questions;
    titreChapitreActuel = data.titre_chapitre;
    dossierActuel = dossier;
    fichierActuel = fichier;

    afficherOptions();
  } catch (error) {
    console.error("Erreur interceptée :", error);
    alert("Impossible de charger ce chapitre.");
  }
}

// ---------- Écran de réglages ----------

function afficherOptions() {
  document.getElementById('selector-section').style.display = 'none';
  document.getElementById('quiz-section').style.display = 'none';
  document.getElementById('options-section').style.display = 'block';

  document.getElementById('options-title').innerText = titreChapitreActuel;

  const maxDispo = Math.min(20, questionsPoolComplet.length);
  const nbInput = document.getElementById('nb-questions');
  nbInput.max = maxDispo;
  if (parseInt(nbInput.value) > maxDispo) nbInput.value = maxDispo;
  document.getElementById('max-questions').innerText = maxDispo;

  mettreAJourVisibiliteReglages();
}

function toggleTempsLimiteInput() {
  const checked = document.getElementById('temps-limite-check').checked;
  document.getElementById('temps-limite-wrapper').style.display = checked ? 'block' : 'none';
}

// Ajuste le libellé de durée selon le mode (minutes en classique, secondes/question en immediat)
function mettreAJourLabelDuree() {
  const mode = document.querySelector('input[name="mode-quiz"]:checked').value;
  const label = document.getElementById('temps-limite-label');
  const input = document.getElementById('temps-limite-valeur');
  if (mode === 'immediat') {
    label.innerText = 'Durée par question (secondes)';
    input.value = 60;
    input.min = 5;
  } else {
    label.innerText = 'Durée totale (minutes)';
    input.value = 5;
    input.min = 1;
  }
}

// Le mode "revision" n'a pas besoin de nombre de questions limité ni de minuteur
function mettreAJourVisibiliteReglages() {
  const mode = document.querySelector('input[name="mode-quiz"]:checked').value;
  const nbRow = document.getElementById('nb-questions-row');
  const timedRow = document.getElementById('temps-limite-row');

  if (mode === 'revision') {
    nbRow.style.display = 'none';
    timedRow.style.display = 'none';
    document.getElementById('temps-limite-check').checked = false;
    toggleTempsLimiteInput();
  } else {
    nbRow.style.display = 'block';
    timedRow.style.display = 'block';
    mettreAJourLabelDuree();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('input[name="mode-quiz"]').forEach(r => {
    r.addEventListener('change', mettreAJourVisibiliteReglages);
  });
});

// Lit les réglages choisis, tire les questions et lance le quiz
function demarrerQuiz() {
  const nb = parseInt(document.getElementById('nb-questions').value) || 10;
  const mode = document.querySelector('input[name="mode-quiz"]:checked').value;
  const timed = document.getElementById('temps-limite-check').checked;
  const dureeValeur = parseInt(document.getElementById('temps-limite-valeur').value) || 0;

  config.mode = mode;

  if (mode === 'revision') {
    config.timed = false;
  } else {
    config.nb = Math.max(1, Math.min(20, nb, questionsPoolComplet.length));
    config.timed = timed;
    if (mode === 'immediat') {
      config.dureeSecondesParQuestion = Math.max(5, dureeValeur);
    } else {
      config.dureeMinutes = Math.max(1, dureeValeur);
    }
  }

  lancerQuizAvecConfigActuelle();
}

// Relance un quiz avec la config déjà choisie (nouveau tirage), sans repasser par les réglages
function relancerMemeOptions() {
  lancerQuizAvecConfigActuelle();
}

// Retourne à l'écran de réglages (le pool de questions est déjà en mémoire, pas de refetch)
function changerOptions() {
  arreterTimer();
  document.getElementById('quiz-section').style.display = 'none';
  document.getElementById('results-container').style.display = 'none';
  afficherOptions();
}

function lancerQuizAvecConfigActuelle() {
  let questionsSelectionnees;
  if (config.mode === 'revision') {
    questionsSelectionnees = [...questionsPoolComplet];
  } else {
    questionsSelectionnees = [...questionsPoolComplet].sort(() => Math.random() - 0.5).slice(0, config.nb);
  }

  currentQuizData = {
    titre_chapitre: titreChapitreActuel,
    questions: questionsSelectionnees
  };

  currentQIndex = 0;
  scoreCourant = 0;

  document.getElementById('options-section').style.display = 'none';
  document.getElementById('quiz-section').style.display = 'block';
  document.getElementById('quiz-title').innerText = currentQuizData.titre_chapitre;
  document.getElementById('results-container').style.display = 'none';
  document.getElementById('results-container').innerHTML = '';
  document.getElementById('submit-btn').style.display = 'none';

  if (config.mode === 'classique') {
    renderQuiz();
  } else if (config.mode === 'immediat') {
    renderQuestionUnique(0);
  } else {
    renderRevision();
  }
}

// ---------- Mode classique (toutes les questions, correction à la fin) ----------

function renderQuiz() {
  const container = document.getElementById('questions-container');
  let html = '';
  currentQuizData.questions.forEach((q, qIndex) => {
    html += `<div class="question-card" id="q-card-${qIndex}">`;
    html += `<div class="question-title">Question ${q.id} : ${escapeHtml(q.enonce)}</div>`;
    html += `<div class="options">`;
    q.options.forEach((opt, oIndex) => {
      html += `<label><input type="radio" name="question-${qIndex}" value="${oIndex}"> <span>${escapeHtml(opt)}</span></label>`;
    });
    html += `</div><div id="feedback-${qIndex}"></div></div>`;
  });
  container.innerHTML = html;
  document.getElementById('submit-btn').style.display = 'block';

  if (window.MathJax) {
    MathJax.typesetPromise([container]);
  }

  if (config.timed) {
    demarrerTimer(config.dureeMinutes * 60, () => validerQuiz(), 'timer-display');
  } else {
    document.getElementById('timer-display').style.display = 'none';
  }
}

function validerQuiz() {
  arreterTimer();
  let score = 0;
  currentQuizData.questions.forEach((q, qIndex) => {
    const selected = document.querySelector(`input[name="question-${qIndex}"]:checked`);
    const feedbackDiv = document.getElementById(`feedback-${qIndex}`);
    let feedbackHtml = '';

    if (selected) {
      const selectedVal = parseInt(selected.value);
      if (selectedVal === q.reponse_correcte) {
        score++;
        feedbackHtml += `<p class="correct">Bonne réponse.</p>`;
      } else {
        feedbackHtml += `<p class="incorrect">Mauvaise réponse.</p>`;
      }
    } else {
      feedbackHtml += `<p class="incorrect">Aucune réponse sélectionnée.</p>`;
    }

    feedbackHtml += `<div class="rationale"><strong>Explication :</strong> ${escapeHtml(q.explication)}</div>`;
    feedbackDiv.innerHTML = feedbackHtml;
  });

  if (window.MathJax) {
    MathJax.typesetPromise();
  }

  afficherResultatsFinal(score, currentQuizData.questions.length);
}

// ---------- Mode immédiat (shot by shot) ----------

function renderQuestionUnique(index) {
  const q = currentQuizData.questions[index];
  const container = document.getElementById('questions-container');

  let html = `<div class="question-card" id="q-card-0">`;
  html += `<div class="question-title">Question ${index + 1} / ${currentQuizData.questions.length} : ${escapeHtml(q.enonce)}</div>`;
  html += `<div class="options">`;
  q.options.forEach((opt, oIndex) => {
    html += `<label><input type="radio" name="question-0" value="${oIndex}"> <span>${escapeHtml(opt)}</span></label>`;
  });
  html += `</div><div id="feedback-0"></div></div>`;

  container.innerHTML = html;
  document.getElementById('submit-btn').style.display = 'none';

  // le bouton de validation de la question réutilise submit-btn pour rester dans la barre d'action fixe
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.style.display = 'block';
  submitBtn.innerText = 'Valider cette réponse';
  submitBtn.onclick = () => evaluerQuestionUnique(index);

  if (window.MathJax) {
    MathJax.typesetPromise([container]);
  }

  if (config.timed) {
    demarrerTimer(config.dureeSecondesParQuestion, () => evaluerQuestionUnique(index), 'timer-display');
  } else {
    document.getElementById('timer-display').style.display = 'none';
  }
}

function evaluerQuestionUnique(index) {
  arreterTimer();
  const q = currentQuizData.questions[index];
  const selected = document.querySelector(`input[name="question-0"]:checked`);
  const feedbackDiv = document.getElementById('feedback-0');
  let feedbackHtml = '';

  if (selected) {
    const selectedVal = parseInt(selected.value);
    if (selectedVal === q.reponse_correcte) {
      scoreCourant++;
      feedbackHtml += `<p class="correct">Bonne réponse.</p>`;
    } else {
      feedbackHtml += `<p class="incorrect">Mauvaise réponse.</p>`;
    }
  } else {
    feedbackHtml += `<p class="incorrect">Aucune réponse sélectionnée.</p>`;
  }

  feedbackHtml += `<div class="rationale"><strong>Explication :</strong> ${escapeHtml(q.explication)}</div>`;
  feedbackDiv.innerHTML = feedbackHtml;

  if (window.MathJax) {
    MathJax.typesetPromise();
  }

  document.querySelectorAll('input[name="question-0"]').forEach(r => r.disabled = true);

  const isLast = index === currentQuizData.questions.length - 1;
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.innerText = isLast ? 'Voir les résultats' : 'Question suivante';
  submitBtn.onclick = isLast
    ? () => afficherResultatsFinal(scoreCourant, currentQuizData.questions.length)
    : () => questionSuivante();
}

function questionSuivante() {
  currentQIndex++;
  renderQuestionUnique(currentQIndex);
}

// ---------- Mode révision (toutes les questions, réponses visibles) ----------

function renderRevision() {
  const container = document.getElementById('questions-container');
  let html = '';
  currentQuizData.questions.forEach((q) => {
    html += `<div class="question-card revision-card">`;
    html += `<div class="question-title">Question ${q.id} : ${escapeHtml(q.enonce)}</div>`;
    html += `<div class="options">`;
    q.options.forEach((opt, oIndex) => {
      const estCorrecte = oIndex === q.reponse_correcte;
      html += `<label class="${estCorrecte ? 'option-correcte' : ''}">
        <input type="radio" disabled ${estCorrecte ? 'checked' : ''}>
        <span>${escapeHtml(opt)}</span>
        ${estCorrecte ? '<span class="badge-correcte">Réponse correcte</span>' : ''}
      </label>`;
    });
    html += `</div>`;
    html += `<div class="rationale"><strong>Explication :</strong> ${escapeHtml(q.explication)}</div>`;
    html += `</div>`;
  });
  container.innerHTML = html;

  document.getElementById('submit-btn').style.display = 'none';
  document.getElementById('timer-display').style.display = 'none';

  if (window.MathJax) {
    MathJax.typesetPromise([container]);
  }

  const resultsDiv = document.getElementById('results-container');
  resultsDiv.style.display = 'block';
  resultsDiv.innerHTML = `
    <div class="results-actions">
      <button class="btn" onclick="changerOptions()">Changer les réglages</button>
      <button class="btn-back" onclick="retourMenu()">Retour au menu</button>
    </div>
  `;
}

// ---------- Résultats & relance ----------

function afficherResultatsFinal(scoreFinal, total) {
  arreterTimer();
  document.getElementById('timer-display').style.display = 'none';
  document.getElementById('submit-btn').style.display = 'none';

  const resultsDiv = document.getElementById('results-container');
  resultsDiv.style.display = 'block';
  resultsDiv.innerHTML = `
    <h3>Score final : ${scoreFinal} / ${total}</h3>
    <p>Retrouvez les corrections détaillées ci-dessus.</p>
    <div class="results-actions">
      <button class="btn" onclick="relancerMemeOptions()">Recommencer (mêmes réglages)</button>
      <button class="btn" onclick="changerOptions()">Changer les réglages</button>
      <button class="btn-back" onclick="retourMenu()">Retour au menu</button>
    </div>
  `;
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// ---------- Minuteur générique ----------

function demarrerTimer(dureeSecondes, onExpire, displayElementId) {
  arreterTimer();
  timeLeft = dureeSecondes;
  const display = document.getElementById(displayElementId);
  display.style.display = 'block';
  mettreAJourAffichageTimer(displayElementId);

  timerId = setInterval(() => {
    timeLeft--;
    mettreAJourAffichageTimer(displayElementId);
    if (timeLeft <= 0) {
      clearInterval(timerId);
      timerId = null;
      onExpire();
    }
  }, 1000);
}

function arreterTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function mettreAJourAffichageTimer(displayElementId) {
  const el = document.getElementById(displayElementId);
  if (!el) return;
  const m = Math.floor(timeLeft / 60);
  const s = timeLeft % 60;
  el.innerText = `Temps restant : ${m}:${s.toString().padStart(2, '0')}`;
}

// ---------- Navigation ----------

function retourMenu() {
  arreterTimer();
  document.getElementById('quiz-section').style.display = 'none';
  document.getElementById('options-section').style.display = 'none';
  document.getElementById('selector-section').style.display = 'block';
}

window.onload = initMenu;
