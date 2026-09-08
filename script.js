let currentQuizData = null;

// Charger le menu principal au démarrage
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

// Charger un fichier JSON de chapitre spécifique et sélectionner 10 questions au hasard
async function chargerChapitre(dossier, fichier) {
    const cheminComplet = `data/${dossier}/${fichier}`;
    
    try {
        const response = await fetch(cheminComplet);
        if (!response.ok) {
            throw new Error(`Fichier introuvable (Erreur HTTP ${response.status})`);
        }
        const data = await response.json();
        
        // 1. Mélanger toutes les questions du chapitre de façon aléatoire
        let questionsMelangees = [...data.questions].sort(() => Math.random() - 0.5);
        
        // 2. Conserver uniquement les 10 premières questions après le mélange
        currentQuizData = {
            titre_chapitre: data.titre_chapitre,
            questions: questionsMelangees.slice(0, 10)
        };
        
        document.getElementById('selector-section').style.display = 'none';
        document.getElementById('quiz-section').style.display = 'block';
        document.getElementById('quiz-title').innerText = currentQuizData.titre_chapitre;
        
        renderQuiz();
    } catch (error) {
        console.error("Erreur interceptée :", error);
        alert("Impossible de charger ce chapitre.");
    }
}






// Afficher les questions du quiz
function renderQuiz() {
    const container = document.getElementById('questions-container');
    let html = '';
    
    currentQuizData.questions.forEach((q, qIndex) => {
        html += `<div class="question-card" id="q-card-${qIndex}">`;
        html += `<div class="question-title">Question ${q.id} : ${q.enonce}</div>`;
        html += `<div class="options">`;
        q.options.forEach((opt, oIndex) => {
            html += `<label><input type="radio" name="question-${qIndex}" value="${oIndex}"> ${opt}</label>`;
        });
        html += `</div><div id="feedback-${qIndex}"></div></div>`;
    });
    
    container.innerHTML = html;
    document.getElementById('submit-btn').style.display = 'block';
    document.getElementById('results-container').style.display = 'none';
}

// Valider les réponses et afficher le score
function validerQuiz() {
    let score = 0;
    currentQuizData.questions.forEach((q, qIndex) => {
        const selected = document.querySelector(`input[name="question-${qIndex}"]:checked`);
        const feedbackDiv = document.getElementById(`feedback-${qIndex}`);
        let feedbackHtml = '';
        
        if (selected) {
            const selectedVal = parseInt(selected.value);
            if (selectedVal === q.reponse_correcte) {
                score++;
                feedbackHtml += `<p class="correct">Bonne réponse !</p>`;
            } else {
                feedbackHtml += `<p class="incorrect">Mauvaise réponse.</p>`;
            }
        } else {
            feedbackHtml += `<p class="incorrect">Aucune réponse sélectionnée.</p>`;
        }
        
        feedbackHtml += `<div class="rationale"><strong>Explication :</strong> ${q.explication}</div>`;
        feedbackDiv.innerHTML = feedbackHtml;
    });

    const resultsDiv = document.getElementById('results-container');
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = `<h3>Score final : ${score} / ${currentQuizData.questions.length}</h3><p>Retrouvez les corrections détaillées ci-dessus.</p>`;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// Revenir au menu principal
function retourMenu() {
    document.getElementById('quiz-section').style.display = 'none';
    document.getElementById('selector-section').style.display = 'block';
}

// Lancer l'initialisation au chargement de la page
window.onload = initMenu;
