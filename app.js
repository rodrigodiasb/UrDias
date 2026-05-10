let db = null;
let firebaseReady = false;
let fire = null;

const firebaseConfig = window.QUIZ_FIREBASE_CONFIG || {};
const firebaseEnabled = Boolean(window.QUIZ_FIREBASE_ENABLED);

const CONFIG = {
  totalQuestions: 10,
  levelPlan: { facil: 5, medio: 3, dificil: 2 },
  learningPattern: ['facil','facil','facil','facil','facil','medio','medio','medio','dificil','dificil'],
  points: { facil: 10, medio: 20, dificil: 35 },
  bonusPerStreak: 3,
  localKeys: {
    used: 'quiz_used_question_ids_v2',
    scores: 'quiz_local_scores_v2',
    reports: 'quiz_local_reports_v2'
  }
};

const $ = (id) => document.getElementById(id);
const screens = ['screenStart','screenGame','screenFeedback','screenResult','screenRank'];

const state = {
  allQuestions: [],
  selectedQuestions: [],
  currentIndex: 0,
  score: 0,
  correct: 0,
  streak: 0,
  playerName: '',
  playerGroup: '',
  startedAt: null,
  questionsLoaded: false,
  lastAnswerCorrect: false
};

function setStatus(message, type = ''){
  const el = $('statusMessage');
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('ok','warn');
  if(type) el.classList.add(type);
}

function showScreen(id){
  screens.forEach(s => $(s).classList.toggle('active', s === id));
}

function shuffle(array){
  const copy = [...array];
  for(let i = copy.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeLevel(level){
  const v = String(level || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (v.includes('facil')) return 'facil';
  if (v.includes('dificil')) return 'dificil';
  return 'medio';
}

function getUsedIds(){
  try { return JSON.parse(localStorage.getItem(CONFIG.localKeys.used) || '[]'); }
  catch { return []; }
}

function saveUsedIds(ids){
  localStorage.setItem(CONFIG.localKeys.used, JSON.stringify([...new Set(ids.map(String))]));
}

function pickOneByLevel(level, alreadyPicked, usedIds){
  const candidates = state.allQuestions.filter(q => normalizeLevel(q.nivel) === level);
  const already = new Set(alreadyPicked.map(q => String(q.id)));
  const used = new Set(usedIds.map(String));

  let pool = shuffle(candidates.filter(q => !used.has(String(q.id)) && !already.has(String(q.id))));

  if (!pool.length) {
    pool = shuffle(candidates.filter(q => !already.has(String(q.id))));
  }

  if (!pool.length) {
    pool = shuffle(state.allQuestions.filter(q => !already.has(String(q.id))));
  }

  return pool[0] || null;
}

function buildQuestionSet(){
  const usedIds = getUsedIds();
  const selected = [];

  CONFIG.learningPattern.forEach(level => {
    const item = pickOneByLevel(level, selected, usedIds);
    if(item) selected.push(item);
  });

  if (selected.length < CONFIG.totalQuestions) {
    const already = new Set(selected.map(q => String(q.id)));
    const complement = shuffle(state.allQuestions.filter(q => !already.has(String(q.id))))
      .slice(0, CONFIG.totalQuestions - selected.length);
    selected.push(...complement);
  }

  const newUsed = [...usedIds, ...selected.map(q => String(q.id))];
  const allIds = new Set(state.allQuestions.map(q => String(q.id)));
  const stillHasFreshQuestions = [...allIds].some(id => !newUsed.includes(id));
  saveUsedIds(stillHasFreshQuestions ? newUsed : []);

  return selected.slice(0, CONFIG.totalQuestions);
}

async function loadQuestions(){
  try {
    const response = await fetch('./db_perguntas.json', { cache: 'no-store' });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const questions = data?.quiz_terminologias_medicas?.questoes || data?.questoes || [];
    if(!Array.isArray(questions) || !questions.length) {
      throw new Error('Nenhuma questão encontrada no JSON.');
    }
    state.allQuestions = questions.map(q => ({...q, nivel: normalizeLevel(q.nivel)}));
    state.questionsLoaded = true;
    setStatus(`Banco carregado: ${state.allQuestions.length} questões disponíveis.`, 'ok');
  } catch (err) {
    console.error('Erro ao carregar perguntas:', err);
    state.questionsLoaded = false;
    setStatus('Erro ao carregar o banco de perguntas. Confira o arquivo db_perguntas.json.', 'warn');
  }
}

async function initFirebase(){
  if(!firebaseEnabled){
    console.info('Firebase desativado. Usando modo local.');
    return;
  }

  if(!firebaseConfig || !firebaseConfig.projectId || String(firebaseConfig.projectId).includes('COLE_AQUI')){
    console.warn('Firebase ativado, mas firebaseConfig está incompleto. Usando modo local.');
    return;
  }

  try {
    const appModule = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const authModule = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const fireModule = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const app = appModule.initializeApp(firebaseConfig);
    const auth = authModule.getAuth(app);
    await authModule.signInAnonymously(auth);
    db = fireModule.getFirestore(app);
    fire = fireModule;
    firebaseReady = true;
    console.info('Firebase conectado.');
  } catch (error) {
    console.warn('Firebase não conectou. O jogo continuará em modo local.', error);
    firebaseReady = false;
  }
}

async function startGame(){
  const name = $('playerName').value.trim();
  const group = $('playerGroup').value.trim();
  if(!name){ alert('Informe o nome do jogador.'); return; }

  if(!state.questionsLoaded){
    setStatus('Aguarde: carregando o banco de perguntas...', 'warn');
    await loadQuestions();
    if(!state.questionsLoaded){
      alert('Ainda não foi possível carregar as perguntas. Confira se o arquivo db_perguntas.json está na mesma pasta do index.html.');
      return;
    }
  }

  state.playerName = name;
  state.playerGroup = group || 'Sem grupo';
  state.currentIndex = 0;
  state.score = 0;
  state.correct = 0;
  state.streak = 0;
  state.startedAt = new Date();
  state.selectedQuestions = buildQuestionSet();

  if(!state.selectedQuestions.length){
    alert('Não há perguntas suficientes para iniciar o desafio.');
    return;
  }

  $('hudPlayer').textContent = state.playerName;
  showScreen('screenGame');
  renderQuestion();
}

function renderQuestion(){
  const q = state.selectedQuestions[state.currentIndex];
  if(!q){
    finishGame();
    return;
  }

  $('hudScore').textContent = state.score;
  $('hudQuestionCount').textContent = `Questão ${state.currentIndex + 1}/${state.selectedQuestions.length}`;
  $('hudLevel').textContent = 'Desafio';
  $('hudCategory').textContent = String(q.categoria || 'Geral').replaceAll('_',' ');
  $('questionText').textContent = q.pergunta;
  $('progressFill').style.width = `${((state.currentIndex) / state.selectedQuestions.length) * 100}%`;

  const answers = $('answers');
  answers.innerHTML = '';
  shuffle(q.alternativas || []).forEach(alt => {
    const btn = document.createElement('button');
    btn.className = 'answer-btn';
    btn.textContent = alt;
    btn.addEventListener('click', () => answerQuestion(alt));
    answers.appendChild(btn);
  });
}

function answerQuestion(answer){
  const q = state.selectedQuestions[state.currentIndex];
  const isCorrect = answer === q.correta;
  state.lastAnswerCorrect = isCorrect;

  if(isCorrect){
    state.correct += 1;
    state.streak += 1;
    const base = CONFIG.points[q.nivel] || 10;
    const bonus = state.streak > 1 ? (state.streak - 1) * CONFIG.bonusPerStreak : 0;
    state.score += base + bonus;
  } else {
    state.streak = 0;
  }

  $('feedbackCard').classList.toggle('wrong', !isCorrect);
  $('feedbackIcon').textContent = isCorrect ? '✓' : '×';
  $('feedbackTitle').textContent = isCorrect ? 'Resposta certa!' : 'Resposta errada';
  $('feedbackExplanation').innerHTML = `${escapeHtml(q.explicacao || '')}<br><br><strong>Resposta correta:</strong> ${escapeHtml(q.correta)}`;
  showScreen('screenFeedback');
}

async function nextQuestion(){
  state.currentIndex += 1;
  if(state.currentIndex >= state.selectedQuestions.length){
    await finishGame();
  } else {
    showScreen('screenGame');
    renderQuestion();
  }
}

async function finishGame(){
  $('progressFill').style.width = '100%';
  const total = state.selectedQuestions.length || CONFIG.totalQuestions;
  const percent = total ? Math.round((state.correct / total) * 100) : 0;

  $('resultSummary').textContent = `${state.playerName}, você concluiu o desafio com ${state.correct} acertos em ${total} questões.`;
  $('resultScore').textContent = state.score;
  $('resultCorrect').textContent = `${state.correct}/${total}`;
  $('resultPercent').textContent = `${percent}%`;

  await saveScore({
    playerName: state.playerName,
    playerGroup: state.playerGroup,
    score: state.score,
    correct: state.correct,
    total,
    percent,
    createdAt: new Date().toISOString(),
    questions: state.selectedQuestions.map(q => q.id)
  });

  showScreen('screenResult');
}

async function saveScore(payload){
  if(firebaseReady){
    try {
      const { addDoc, collection, serverTimestamp } = fire;
      await addDoc(collection(db, 'resultados'), {...payload, createdAtServer: serverTimestamp()});
      return;
    } catch (err) {
      console.warn('Falha ao salvar no Firestore. Salvando localmente.', err);
    }
  }

  const scores = JSON.parse(localStorage.getItem(CONFIG.localKeys.scores) || '[]');
  scores.push(payload);
  localStorage.setItem(CONFIG.localKeys.scores, JSON.stringify(scores));
}

async function loadRanking(){
  let scores = [];

  if(firebaseReady){
    try {
      const { collection, getDocs, limit, orderBy, query } = fire;
      const q = query(collection(db, 'resultados'), orderBy('score', 'desc'), limit(20));
      const snap = await getDocs(q);
      scores = snap.docs.map(doc => doc.data());
    } catch (err) {
      console.warn('Falha ao carregar ranking do Firestore. Usando ranking local.', err);
    }
  }

  if(!scores.length){
    scores = JSON.parse(localStorage.getItem(CONFIG.localKeys.scores) || '[]')
      .sort((a,b) => (b.score || 0) - (a.score || 0))
      .slice(0,20);
  }

  renderRanking(scores);
  showScreen('screenRank');
}

function renderRanking(scores){
  const list = $('rankList');
  list.innerHTML = '';

  if(!scores.length){
    list.innerHTML = '<p class="rank-meta">Ainda não há pontuações registradas.</p>';
    return;
  }

  scores.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'rank-item';
    row.innerHTML = `
      <div class="rank-pos">#${index + 1}</div>
      <div>
        <div class="rank-name">${escapeHtml(item.playerName || 'Jogador')}</div>
        <div class="rank-meta">${escapeHtml(item.playerGroup || 'Sem grupo')} • ${item.correct || 0}/${item.total || 10} acertos</div>
      </div>
      <div class="rank-score">${item.score || 0}</div>`;
    list.appendChild(row);
  });
}

function openReport(){
  $('reportText').value = '';
  $('reportDialog').showModal();
}

async function sendReport(event){
  event.preventDefault();
  const text = $('reportText').value.trim();
  if(!text){ alert('Descreva o motivo do recurso antes de enviar.'); return; }

  const q = state.selectedQuestions[state.currentIndex];
  if(!q){ return; }

  const payload = {
    questionId: q.id,
    questionText: q.pergunta,
    correctAnswer: q.correta,
    playerName: state.playerName,
    playerGroup: state.playerGroup,
    reportText: text,
    createdAt: new Date().toISOString()
  };

  if(firebaseReady){
    try {
      const { addDoc, collection, serverTimestamp } = fire;
      await addDoc(collection(db, 'recursos_questoes'), {...payload, createdAtServer: serverTimestamp()});
      $('reportDialog').close();
      alert('Recurso registrado. Obrigado por ajudar a melhorar o quiz!');
      return;
    } catch (err) {
      console.warn('Falha ao salvar recurso no Firestore. Salvando localmente.', err);
    }
  }

  const reports = JSON.parse(localStorage.getItem(CONFIG.localKeys.reports) || '[]');
  reports.push(payload);
  localStorage.setItem(CONFIG.localKeys.reports, JSON.stringify(reports));
  $('reportDialog').close();
  alert('Recurso registrado localmente. Quando o Firebase estiver configurado, os próximos recursos irão para o banco online.');
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[t]));
}

function bindEvents(){
  $('btnStart').addEventListener('click', startGame);
  $('btnNext').addEventListener('click', nextQuestion);
  $('btnRestart').addEventListener('click', () => showScreen('screenStart'));
  $('btnShowRank').addEventListener('click', loadRanking);
  $('btnShowRankStart').addEventListener('click', loadRanking);
  $('btnBackHome').addEventListener('click', () => showScreen('screenStart'));
  $('btnReport').addEventListener('click', openReport);
  $('btnSendReport').addEventListener('click', sendReport);

  $('playerName').addEventListener('keydown', (ev) => { if(ev.key === 'Enter') $('playerGroup').focus(); });
  $('playerGroup').addEventListener('keydown', (ev) => { if(ev.key === 'Enter') startGame(); });
}

bindEvents();
loadQuestions();
initFirebase();
