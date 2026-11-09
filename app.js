const pages = [...document.querySelectorAll('.page')];
const navLinks = [...document.querySelectorAll('.nav-link[data-page]')];
const titles = Object.fromEntries(pages.map(page => [page.id.replace('page-', ''), page.dataset.title]));
const storage = {
  accounts: 'momentum-local-accounts',
  session: 'momentum-local-session',
  entry: 'momentum-entry-questions',
  quizCount: 'momentum-quiz-count',
  customQuestions: 'momentum-custom-questions',
  practiceCases: 'momentum-practice-cases'
};
const defaultEntryQuestions = [
  { prompt: 'Sebuah benda bergerak ke kiri dengan massa tetap. Jika arah positif didefinisikan ke kanan, bagaimana tanda momentumnya?', options: ['Positif, karena momentum selalu positif.', 'Negatif, karena momentum searah dengan kecepatan.'], answer: 1 },
  { prompt: 'Massa benda dibuat tiga kali lebih besar, sementara kecepatannya tetap. Bagaimana besar momentumnya?', options: ['Menjadi tiga kali semula.', 'Tetap sama karena kecepatannya tidak berubah.'], answer: 0 },
  { prompt: 'Dua benda bertumbukan tanpa gaya luar netto. Besaran apa yang selalu tetap untuk sistem kedua benda?', options: ['Momentum total sistem.', 'Kecepatan masing-masing benda.'], answer: 0 }
];
let entryQuestions = JSON.parse(localStorage.getItem(storage.entry) || 'null');
if (!Array.isArray(entryQuestions) || entryQuestions.length !== 3) {
  const legacy = JSON.parse(localStorage.getItem('momentum-entry-question') || 'null');
  entryQuestions = legacy
    ? [{ ...legacy }, ...defaultEntryQuestions.slice(1)]
    : defaultEntryQuestions.map(question => ({ ...question }));
}
const entryVersion = entryQuestions.map(question => `${question.prompt}|${question.options.join('|')}|${question.answer}`).join('::');
let quizCount = Number(localStorage.getItem(storage.quizCount) || '10');
const customQuestions = JSON.parse(localStorage.getItem(storage.customQuestions) || '[]');
const defaultPracticeCases = [
  {
    title: 'Dua troli saling mendekat',
    context: 'Dua troli bergerak pada lintasan lurus licin dan mengalami tumbukan lenting sempurna. Gunakan arah kanan sebagai arah positif.',
    massA: 2, velocityA: 5, massB: 3, velocityB: -2
  },
  {
    title: 'Benda bermassa sama bertumbukan',
    context: 'Dua benda bermassa sama bergerak berlawanan arah pada satu garis lurus dan bertumbukan lenting sempurna. Gunakan arah kanan sebagai arah positif.',
    massA: 2, velocityA: 4, massB: 2, velocityB: -2
  }
];
let practiceCases = JSON.parse(localStorage.getItem(storage.practiceCases) || 'null');
if (!Array.isArray(practiceCases) || practiceCases.length !== 2) {
  practiceCases = defaultPracticeCases.map(problem => ({ ...problem }));
}
let currentUser = null;
let progress = new Set();
let authMode = 'login';
let toastTimer;

function showPage(name) {
  const page = document.getElementById(`page-${name}`) || document.getElementById('page-beranda');
  if (!currentUser) return;
  if (currentUser.role === 'siswa' && !hasPassedEntry() && page.id !== 'page-beranda') {
    showToast('Selesaikan prediksi pembuka di beranda sebelum membuka aktivitas.');
    return;
  }
  if (page.classList.contains('teacher-only') && currentUser.role !== 'guru') {
    showToast('Menu ini hanya tersedia untuk akun guru.');
    return;
  }
  pages.forEach(item => item.classList.toggle('active', item === page));
  navLinks.forEach(link => link.classList.toggle('active', link.dataset.page === page.id.replace('page-', '')));
  document.getElementById('current-section').textContent = page.dataset.title;
  history.replaceState(null, '', `#${page.id.replace('page-', '')}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-go]');
  if (target) showPage(target.dataset.go);
});
navLinks.forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  showPage(link.dataset.page);
}));

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function getAccounts() {
  return JSON.parse(localStorage.getItem(storage.accounts) || '{}');
}

async function passwordDigest(password) {
  if (!crypto.subtle) throw new Error('Gunakan localhost atau HTTPS untuk membuat akun.');
  const bytes = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function hasPassedEntry() {
  if (!currentUser || currentUser.role !== 'siswa') return true;
  const record = JSON.parse(localStorage.getItem(`momentum-entry-results:${currentUser.username}`) || 'null');
  return record?.version === entryVersion && record.answers?.length === entryQuestions.length;
}

let entryIndex = 0;
const entryAnswers = [];
function renderEntryQuestion() {
  const question = entryQuestions[entryIndex];
  document.getElementById('entry-progress').textContent = `Pertanyaan ${entryIndex + 1} dari ${entryQuestions.length}`;
  document.getElementById('entry-question').textContent = question.prompt;
  document.getElementById('entry-heading').textContent = `Prediksi ${entryIndex + 1}: apa yang akan terjadi?`;
  const options = document.getElementById('entry-options');
  options.replaceChildren();
  question.options.forEach((text, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'entry-option';
    button.dataset.answer = String(index);
    button.textContent = `${String.fromCharCode(65 + index)} · ${text}`;
    button.addEventListener('click', () => {
      options.querySelectorAll('.entry-option').forEach(item => item.classList.toggle('selected', item === button));
    });
    options.appendChild(button);
  });
  document.getElementById('entry-reason').value = '';
  document.getElementById('entry-feedback').textContent = '';
  document.getElementById('submit-entry').innerHTML = entryIndex === entryQuestions.length - 1
    ? 'Selesaikan prediksi <span>✓</span>'
    : 'Prediksi berikutnya <span>→</span>';
}

function renderPredictionResults() {
  const panel = document.getElementById('prediction-results');
  const results = JSON.parse(localStorage.getItem(`momentum-entry-results:${currentUser.username}`) || 'null');
  const visible = currentUser.role === 'siswa' && results?.version === entryVersion && results.answers?.length === entryQuestions.length;
  panel.hidden = !visible;
  if (!visible) return;
  const score = results.answers.filter((answer, index) => answer.choice === entryQuestions[index].answer).length;
  document.getElementById('prediction-score').textContent = `${score} / ${entryQuestions.length} PREDIKSI TEPAT`;
  const list = document.getElementById('prediction-result-list');
  list.replaceChildren();
  results.answers.forEach((answer, index) => {
    const question = entryQuestions[index];
    const correct = answer.choice === question.answer;
    const item = document.createElement('article');
    item.className = 'prediction-result-item';
    const heading = document.createElement('strong');
    heading.textContent = `${index + 1}. ${question.prompt}`;
    const result = document.createElement('p');
    result.textContent = `Prediksimu: ${question.options[answer.choice]}${correct ? ' · Tepat!' : ` · Pembahasan: ${question.options[question.answer]}`}`;
    const reason = document.createElement('small');
    reason.textContent = `Alasanmu: ${answer.reason}`;
    item.append(heading, result, reason);
    list.appendChild(item);
  });
}

function updateRoleView() {
  document.body.classList.toggle('is-teacher', currentUser?.role === 'guru');
  document.body.classList.toggle('student-locked', currentUser?.role === 'siswa' && !hasPassedEntry());
  document.getElementById('auth-screen').hidden = Boolean(currentUser);
  document.body.classList.toggle('authenticated', Boolean(currentUser));
  if (!currentUser) return;
  document.getElementById('profile-name').textContent = currentUser.name;
  document.getElementById('profile-role').textContent = currentUser.role === 'guru' ? 'Guru' : 'Siswa';
  document.getElementById('profile-avatar').textContent = currentUser.name.trim().charAt(0).toUpperCase();
  const passedEntry = hasPassedEntry();
  document.getElementById('student-gate').hidden = currentUser.role !== 'siswa' || passedEntry;
  document.getElementById('gate-note').hidden = passedEntry;
  document.getElementById('quiz-count-setting').value = String(quizCount);
  renderTeacherEntryEditors();
  renderEntryQuestion();
  renderPredictionResults();
  renderTeacherQuestions();
  renderTeacherPracticeEditors();
  renderPracticeCase();
  const graphData = JSON.parse(localStorage.getItem(getGraphStorageKey()) || '[]');
  renderGraphRows(graphData);
  drawGraph(graphData);
  questionIndex = 0;
  quizScore = 0;
  quizFinished = false;
  renderQuestion();
  updateProgress();
  const target = location.hash.slice(1);
  showPage(titles[target] && (target !== 'guru' || currentUser.role === 'guru') ? target : 'beranda');
}

document.getElementById('auth-toggle').addEventListener('click', () => {
  authMode = authMode === 'login' ? 'register' : 'login';
  const registering = authMode === 'register';
  document.getElementById('auth-title').textContent = registering ? 'Buat akun belajar.' : 'Selamat datang.';
  document.getElementById('auth-subtitle').textContent = registering
    ? 'Pilih peran guru atau siswa untuk mulai.'
    : 'Masuk sebagai guru atau siswa untuk melanjutkan.';
  document.getElementById('auth-name-label').hidden = !registering;
  document.getElementById('auth-role-label').hidden = false;
  document.getElementById('auth-name').required = registering;
  document.getElementById('auth-password').autocomplete = registering ? 'new-password' : 'current-password';
  document.getElementById('auth-submit').innerHTML = registering ? 'Buat akun <span>→</span>' : 'Masuk <span>→</span>';
  document.getElementById('auth-toggle').textContent = registering
    ? 'Sudah punya akun? Masuk'
    : 'Belum punya akun? Buat akun lokal';
  document.getElementById('auth-error').textContent = '';
});

document.getElementById('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const username = document.getElementById('auth-username').value.trim().toLowerCase();
  const password = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name').value.trim();
  const role = document.getElementById('auth-role').value;
  const error = document.getElementById('auth-error');
  const accounts = getAccounts();
  try {
    const digest = await passwordDigest(password);
    if (authMode === 'register') {
      if (accounts[username]) throw new Error('Nama pengguna sudah dipakai. Pilih nama lain.');
      accounts[username] = { name, role, passwordHash: digest };
      localStorage.setItem(storage.accounts, JSON.stringify(accounts));
    } else {
      const account = accounts[username];
      if (!account || account.passwordHash !== digest) throw new Error('Nama pengguna atau kata sandi tidak cocok.');
      if (account.role !== role) throw new Error(`Akun ini terdaftar sebagai ${account.role === 'guru' ? 'guru' : 'siswa'}.`);
    }
    const account = accounts[username];
    currentUser = { username, name: account.name, role: account.role };
    localStorage.setItem(storage.session, username);
    progress = new Set(JSON.parse(localStorage.getItem(`momentum-progress:${username}`) || '[]'));
    error.textContent = '';
    updateRoleView();
  } catch (loginError) {
    error.textContent = loginError.message;
  }
});

document.getElementById('logout-button').addEventListener('click', () => {
  resetSimulation();
  localStorage.removeItem(storage.session);
  currentUser = null;
  document.body.classList.remove('authenticated', 'is-teacher', 'student-locked');
  document.getElementById('auth-screen').hidden = false;
  document.getElementById('auth-form').reset();
  authMode = 'login';
  document.getElementById('auth-title').textContent = 'Selamat datang.';
  document.getElementById('auth-subtitle').textContent = 'Masuk sebagai guru atau siswa untuk melanjutkan.';
  document.getElementById('auth-name-label').hidden = true;
  document.getElementById('auth-role-label').hidden = false;
  document.getElementById('auth-name').required = false;
  document.getElementById('auth-password').autocomplete = 'current-password';
  document.getElementById('auth-submit').innerHTML = 'Masuk <span>→</span>';
  document.getElementById('auth-toggle').textContent = 'Belum punya akun? Buat akun lokal';
});

function markComplete(name) {
  if (progress.has(name)) return;
  progress.add(name);
  localStorage.setItem(`momentum-progress:${currentUser.username}`, JSON.stringify([...progress]));
  updateProgress();
}

function updateProgress() {
  const count = document.getElementById('completed-count');
  if (!count) return;
  count.textContent = progress.size;
  document.querySelectorAll('.learning-card').forEach(card => {
    card.classList.toggle('completed', progress.has(card.dataset.go));
  });
}

document.getElementById('submit-entry').addEventListener('click', () => {
  const selected = document.querySelector('#entry-options .entry-option.selected');
  const reasonSelect = document.getElementById('entry-reason');
  const reason = reasonSelect.value;
  if (!selected) return showToast('Pilih prediksi terlebih dahulu.');
  if (!reason) return showToast('Pilih alasan prediksimu terlebih dahulu.');
  entryAnswers[entryIndex] = { choice: Number(selected.dataset.answer), reason: reasonSelect.selectedOptions[0].textContent };
  if (entryIndex < entryQuestions.length - 1) {
    entryIndex += 1;
    renderEntryQuestion();
    return;
  }
  const resultKey = `momentum-entry-results:${currentUser.username}`;
  localStorage.setItem(resultKey, JSON.stringify({ version: entryVersion, answers: [...entryAnswers] }));
  document.body.classList.remove('student-locked');
  document.getElementById('student-gate').hidden = true;
  renderPredictionResults();
  showToast('Tiga prediksi tersimpan. Semua aktivitas telah terbuka.');
});

function renderTeacherEntryEditors() {
  const container = document.getElementById('teacher-prediction-editors');
  if (!container) return;
  container.replaceChildren();
  entryQuestions.forEach((question, index) => {
    const section = document.createElement('section');
    section.className = 'teacher-prediction-editor';
    const heading = document.createElement('h3');
    heading.textContent = `Prediksi ${index + 1}`;
    section.appendChild(heading);
    const prompt = document.createElement('textarea');
    prompt.className = 'teacher-entry-prompt';
    prompt.rows = 2;
    prompt.maxLength = 240;
    prompt.value = question.prompt;
    prompt.setAttribute('aria-label', `Pertanyaan prediksi ${index + 1}`);
    section.appendChild(prompt);
    question.options.forEach((option, optionIndex) => {
      const label = document.createElement('label');
      label.className = 'teacher-label';
      label.textContent = `Pilihan ${String.fromCharCode(65 + optionIndex)}`;
      const input = document.createElement('input');
      input.className = 'teacher-entry-option';
      input.maxLength = 140;
      input.value = option;
      label.appendChild(input);
      section.appendChild(label);
    });
    const answerLabel = document.createElement('label');
    answerLabel.className = 'teacher-label';
    answerLabel.textContent = 'Kunci jawaban';
    const answerSelect = document.createElement('select');
    answerSelect.className = 'teacher-entry-answer';
    answerSelect.innerHTML = '<option value="0">Pilihan A</option><option value="1">Pilihan B</option>';
    answerSelect.value = String(question.answer);
    answerLabel.appendChild(answerSelect);
    section.appendChild(answerLabel);
    container.appendChild(section);
  });
}

document.getElementById('save-entry-question').addEventListener('click', () => {
  const editors = [...document.querySelectorAll('.teacher-prediction-editor')];
  const updated = editors.map(editor => ({
    prompt: editor.querySelector('.teacher-entry-prompt').value.trim(),
    options: [...editor.querySelectorAll('.teacher-entry-option')].map(input => input.value.trim()),
    answer: Number(editor.querySelector('.teacher-entry-answer').value)
  }));
  if (updated.some(question => !question.prompt || question.options.some(option => !option))) {
    return showToast('Lengkapi tiga pertanyaan prediksi dan semua pilihan jawaban.');
  }
  localStorage.setItem(storage.entry, JSON.stringify(updated));
  location.reload();
});

const simulation = {
  a: { mass: 2, velocity: 4, direction: 1, x: 10 },
  b: { mass: 3, velocity: 2, direction: 1, x: 20 },
  running: false,
  previousFrame: 0,
  elapsed: 0,
  collisionTime: null,
  postCollisionDuration: 1.2,
  collisions: 0
};
let animationFrame = null;
const signed = value => `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
const worldLength = 30;
const simulationLimit = 12;

function renderSimulation() {
  const stage = document.querySelector('.motion-stage');
  const width = stage.clientWidth;
  const scale = width / worldLength;
  ['a', 'b'].forEach(id => {
    const body = simulation[id];
    const object = document.getElementById(`motion-${id}`);
    document.getElementById(`mass-${id}-value`).textContent = body.mass;
    document.getElementById(`velocity-${id}-value`).textContent = document.getElementById(`velocity-${id}`).value;
    const diameter = Math.min(86, Math.max(54, 42 + Math.sqrt(body.mass) * 9));
    object.style.width = `${diameter}px`;
    object.style.height = `${diameter}px`;
    object.style.left = `${body.x / worldLength * 100}%`;
    object.style.top = `${Math.max(58, stage.clientHeight * (id === 'a' ? .38 : .5) - diameter / 2)}px`;
    document.getElementById(`speed-label-${id}`).textContent = `|v| = ${Math.abs(body.velocity).toFixed(2)} m/s ${body.velocity < 0 ? '←' : body.velocity > 0 ? '→' : '·'}`;
    document.getElementById(`equation-label-${id}`).textContent = `p = ${signed(body.mass * body.velocity)} kg·m/s`;
    document.getElementById(`momentum-${id}`).textContent = signed(body.mass * body.velocity);
    object.classList.toggle('moving-left', body.velocity < 0);
    object.querySelector('span').textContent = id.toUpperCase();
    const direction = body.velocity < 0 ? -1 : 1;
    document.querySelectorAll(`.direction[data-object="${id}"]`).forEach(button => {
      button.classList.toggle('active', Number(button.dataset.direction) === direction);
    });
  });
  const total = simulation.a.mass * simulation.a.velocity + simulation.b.mass * simulation.b.velocity;
  document.getElementById('momentum-total').textContent = signed(total);
  document.getElementById('run-simulation').disabled = simulation.running;
  document.getElementById('run-simulation').innerHTML = simulation.running
    ? 'Simulasi berjalan… <span>●</span>'
    : 'Jalankan simulasi <span>→</span>';
  if (!simulation.running) {
    document.querySelectorAll('#page-simulasi input, #page-simulasi .direction').forEach(control => {
      control.disabled = false;
    });
  }
  return scale;
}

function setSimulationMessage(message) {
  document.getElementById('simulation-feedback').textContent = message;
}

function collisionStep() {
  const a = simulation.a;
  const b = simulation.b;
  const aElement = document.getElementById('motion-a');
  const bElement = document.getElementById('motion-b');
  const width = document.querySelector('.motion-stage').clientWidth;
  const scale = width / worldLength;
  const radiusA = aElement.clientWidth / (2 * scale);
  const radiusB = bElement.clientWidth / (2 * scale);
  const dt = Math.min(.045, (simulation.previousFrame ? (performance.now() - simulation.previousFrame) / 1000 : .016)) * 1.8;
  simulation.previousFrame = performance.now();
  simulation.elapsed += dt;
  const previousGap = b.x - a.x;
  a.x += a.velocity * dt;
  b.x += b.velocity * dt;
  const gap = b.x - a.x;

  if (simulation.collisions === 0
    && (previousGap * gap <= 0 || Math.abs(gap) <= radiusA + radiusB)) {
    const velocityA = a.velocity;
    const velocityB = b.velocity;
    a.velocity = ((a.mass - b.mass) * velocityA + 2 * b.mass * velocityB) / (a.mass + b.mass);
    b.velocity = ((b.mass - a.mass) * velocityB + 2 * a.mass * velocityA) / (a.mass + b.mass);
    const direction = gap >= 0 ? 1 : -1;
    a.x = (a.x + b.x - direction * (radiusA + radiusB)) / 2;
    b.x = a.x + direction * (radiusA + radiusB);
    simulation.collisions += 1;
    simulation.collisionTime = simulation.elapsed;
    const timeToWall = [a, b].map((body, index) => {
      const radius = index === 0 ? radiusA : radiusB;
      if (Math.abs(body.velocity) < .001) return Infinity;
      return body.velocity > 0
        ? (worldLength - radius - body.x) / body.velocity
        : (body.x - radius) / Math.abs(body.velocity);
    });
    simulation.postCollisionDuration = Math.max(.12, Math.min(1.2, Math.min(...timeToWall) * .75));
    document.getElementById('collision-note').textContent = 'Tumbukan lenting: momentum total dan energi kinetik sistem tetap.';
    setSimulationMessage(`Benda bertumbukan dan memantul! Setelah tumbukan: vA = ${signed(a.velocity)} m/s, vB = ${signed(b.velocity)} m/s. Momentum masing-masing berubah, momentum total tetap.`);
    markComplete('simulasi');
  }

  [a, b].forEach(body => {
    const element = document.getElementById(`motion-${body === a ? 'a' : 'b'}`);
    const radius = element.clientWidth / (2 * scale);
    if (body.x < radius) {
      body.x = radius;
      body.velocity = Math.abs(body.velocity);
    } else if (body.x > worldLength - radius) {
      body.x = worldLength - radius;
      body.velocity = -Math.abs(body.velocity);
    }
  });

  renderSimulation();
  if (simulation.collisions && simulation.elapsed - simulation.collisionTime >= simulation.postCollisionDuration) {
    stopSimulation();
    return;
  }
  if (simulation.elapsed >= simulationLimit) {
    stopSimulation();
    if (!simulation.collisions) setSimulationMessage('Belum terjadi tumbukan pada rentang simulasi ini. Atur arah atau kecepatan agar benda saling mendekat.');
    return;
  }
  animationFrame = requestAnimationFrame(collisionStep);
}

function stopSimulation() {
  simulation.running = false;
  animationFrame = null;
  document.querySelectorAll('#page-simulasi input, #page-simulasi .direction').forEach(control => {
    control.disabled = false;
  });
  renderSimulation();
  if (simulation.collisions) setSimulationMessage('Pantulan selesai. Momentum setiap benda mengikuti kecepatan akhirnya; momentum total sistem tetap.');
}

function startSimulation() {
  if (simulation.running) return;
  ['a', 'b'].forEach(id => {
    const body = simulation[id];
    body.mass = Number(document.getElementById(`mass-${id}`).value);
    const magnitude = Number(document.getElementById(`velocity-${id}`).value);
    const direction = Number(document.querySelector(`.direction[data-object="${id}"].active`).dataset.direction);
    body.velocity = magnitude * direction;
  });
  const scale = renderSimulation();
  const radiusA = document.getElementById('motion-a').clientWidth / (2 * scale);
  const radiusB = document.getElementById('motion-b').clientWidth / (2 * scale);
  const relativeSpeed = Math.abs(simulation.a.velocity - simulation.b.velocity);
  const gap = Math.min(20, radiusA + radiusB + Math.max(.25, relativeSpeed * .8));
  if (simulation.a.velocity >= simulation.b.velocity) {
    simulation.a.x = (worldLength - gap) / 2;
    simulation.b.x = (worldLength + gap) / 2;
  } else {
    simulation.a.x = (worldLength + gap) / 2;
    simulation.b.x = (worldLength - gap) / 2;
  }
  simulation.running = true;
  simulation.elapsed = 0;
  simulation.collisionTime = null;
  simulation.collisions = 0;
  simulation.previousFrame = 0;
  document.getElementById('collision-note').textContent = 'Tumbukan dimodelkan lenting sempurna satu dimensi.';
  setSimulationMessage('Amati benda bergerak. Ketika bersentuhan, kecepatan keduanya berubah dan benda memantul.');
  document.querySelectorAll('#page-simulasi input, #page-simulasi .direction').forEach(control => {
    control.disabled = true;
  });
  renderSimulation();
  animationFrame = requestAnimationFrame(collisionStep);
}

function resetSimulation() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  simulation.running = false;
  simulation.a = { mass: 2, velocity: 4, direction: 1, x: 10 };
  simulation.b = { mass: 3, velocity: 2, direction: 1, x: 20 };
  simulation.collisions = 0;
  simulation.elapsed = 0;
  ['a', 'b'].forEach(id => {
    document.getElementById(`mass-${id}`).value = simulation[id].mass;
    document.getElementById(`velocity-${id}`).value = Math.abs(simulation[id].velocity);
    document.querySelectorAll(`.direction[data-object="${id}"]`).forEach(button => {
      button.classList.toggle('active', button.dataset.direction === '1');
      button.disabled = false;
    });
  });
  document.querySelectorAll('#page-simulasi input').forEach(input => { input.disabled = false; });
  document.getElementById('collision-note').textContent = 'Tanda kecepatan dan momentum menunjukkan arah gerak.';
  setSimulationMessage('Atur massa, kecepatan, dan arah, lalu jalankan simulasi.');
  renderSimulation();
}

['mass-a', 'velocity-a', 'mass-b', 'velocity-b'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    const bodyId = id.slice(-1);
    simulation[bodyId].mass = Number(document.getElementById(`mass-${bodyId}`).value);
    simulation[bodyId].velocity = Number(document.getElementById(`velocity-${bodyId}`).value)
      * Number(document.querySelector(`.direction[data-object="${bodyId}"].active`).dataset.direction);
    renderSimulation();
  });
});
document.querySelectorAll('.direction[data-object]').forEach(button => button.addEventListener('click', () => {
  if (simulation.running) return;
  const id = button.dataset.object;
  document.querySelectorAll(`.direction[data-object="${id}"]`).forEach(item => item.classList.toggle('active', item === button));
  simulation[id].velocity = Number(document.getElementById(`velocity-${id}`).value) * Number(button.dataset.direction);
  renderSimulation();
}));
document.getElementById('run-simulation').addEventListener('click', startSimulation);
document.getElementById('reset-sim').addEventListener('click', resetSimulation);
renderSimulation();
window.addEventListener('resize', renderSimulation);

function renderGraphRows(savedRows = []) {
  const table = document.getElementById('data-table');
  table.replaceChildren();
  for (let index = 0; index < 5; index += 1) {
    const row = document.createElement('tr');
    const velocityCell = document.createElement('td');
    const velocityInput = document.createElement('input');
    velocityInput.type = 'number';
    velocityInput.min = '0';
    velocityInput.max = '10';
    velocityInput.step = 'any';
    velocityInput.placeholder = '—';
    velocityInput.className = 'graph-data-input';
    velocityInput.dataset.field = 'velocity';
    velocityInput.setAttribute('aria-label', `Kecepatan data ${index + 1}`);
    const massCell = document.createElement('td');
    const massInput = document.createElement('input');
    massInput.type = 'number';
    massInput.min = '0.01';
    massInput.max = '10';
    massInput.step = 'any';
    massInput.placeholder = '—';
    massInput.className = 'graph-data-input';
    massInput.dataset.field = 'mass';
    massInput.setAttribute('aria-label', `Massa data ${index + 1}`);
    const momentumCell = document.createElement('td');
    momentumCell.className = 'calculated-momentum';
    momentumCell.textContent = savedRows[index] ? Number(savedRows[index].momentum.toFixed(2)) : '—';
    if (savedRows[index]) {
      velocityInput.value = savedRows[index].velocity;
      massInput.value = savedRows[index].mass;
    }
    velocityCell.appendChild(velocityInput);
    massCell.appendChild(massInput);
    row.append(velocityCell, massCell, momentumCell);
    table.appendChild(row);
  }
}

function getGraphStorageKey() {
  return `momentum-graph-data:${currentUser?.username || 'guest'}`;
}

function plotGraphData() {
  const rows = [...document.querySelectorAll('#data-table tr')];
  const values = [];
  for (const [index, row] of rows.entries()) {
    const velocityInput = row.querySelector('[data-field="velocity"]');
    const massInput = row.querySelector('[data-field="mass"]');
    const velocityText = velocityInput.value.trim();
    const massText = massInput.value.trim();
    if (!velocityText && !massText) continue;
    const velocity = Number(velocityText);
    const mass = Number(massText);
    if (!velocityText || !massText || !Number.isFinite(velocity) || !Number.isFinite(mass)
      || velocity < 0 || velocity > 10 || mass <= 0 || mass > 10) {
      return showToast(`Lengkapi data baris ${index + 1}. Kecepatan 0–10 m/s dan massa >0–10 kg.`);
    }
    values.push({ velocity, mass, momentum: velocity * mass, index });
  }
  if (!values.length) return showToast('Isi minimal satu pasangan nilai kecepatan dan massa.');
  localStorage.setItem(getGraphStorageKey(), JSON.stringify(values));
  values.forEach(value => {
    rows[value.index].querySelector('.calculated-momentum').textContent = Number(value.momentum.toFixed(2));
  });
  drawGraph(values);
  const velocities = values.map(value => value.velocity);
  const masses = values.map(value => value.mass);
  document.getElementById('graph-insight-text').textContent =
    `Dari ${values.length} data yang kamu masukkan, momentum dihitung dengan p = mv. Massa: ${Math.min(...masses)}–${Math.max(...masses)} kg; kecepatan: ${Math.min(...velocities)}–${Math.max(...velocities)} m/s.`;
  document.getElementById('graph-entry-feedback').textContent =
    `${values.length} data berhasil dihitung dan diplot. Periksa bagaimana momentum berubah terhadap kecepatan.`;
  markComplete('grafik');
}

function drawGraph(values) {
  const maximum = 100;
  const pointsData = values.slice().sort((first, second) => first.velocity - second.velocity);
  const svgPoints = pointsData.map(value => ({
    x: 30 + value.velocity * 55,
    y: 240 - Math.min(value.momentum, maximum) / maximum * 230,
    clipped: value.momentum > maximum
  }));
  document.getElementById('graph-line').setAttribute(
    'd',
    svgPoints.length
      ? `M ${svgPoints.map(point => `${point.x} ${point.y}`).join(' L ')}`
      : 'M 30 240 L 580 240'
  );
  const points = document.getElementById('graph-points');
  points.replaceChildren();
  svgPoints.forEach((point, index) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(point.x));
    circle.setAttribute('cy', String(point.y));
    circle.setAttribute('r', point.clipped ? '5' : '4');
    circle.setAttribute('class', 'graph-point');
    circle.setAttribute('aria-label', `Data ${index + 1}`);
    points.appendChild(circle);
  });
}

document.getElementById('plot-data').addEventListener('click', plotGraphData);
document.getElementById('clear-data').addEventListener('click', () => {
  localStorage.removeItem(getGraphStorageKey());
  renderGraphRows();
  drawGraph([]);
  document.getElementById('graph-entry-feedback').textContent = '';
  document.getElementById('graph-insight-text').textContent = 'Grafik dimulai dari garis dasar. Isi data pengamatanmu, lalu gambar titik-titiknya.';
});
renderGraphRows(JSON.parse(localStorage.getItem(getGraphStorageKey()) || '[]'));
const savedGraphData = JSON.parse(localStorage.getItem(getGraphStorageKey()) || '[]');
if (savedGraphData.length) drawGraph(savedGraphData);
else drawGraph([]);

const defaultQuestions = [
  { prompt: 'Troli bermassa 2,5 kg bergerak 4 m/s ke kiri. Jika kanan ditetapkan positif, berapakah momentumnya?', data: 'm = 2,5 kg · v = −4 m/s', options: ['−10 kg·m/s', '+10 kg·m/s', '−6,5 kg·m/s', '+6,5 kg·m/s'], answer: 0, explanation: 'p = mv = 2,5(−4) = −10 kg·m/s. Tanda negatif menunjukkan arah ke kiri.' },
  { prompt: 'Benda A bermassa 3 kg bergerak ke kanan 5 m/s, sedangkan B bermassa 2 kg bergerak ke kiri 4 m/s. Berapakah momentum total sistem?', data: 'A: 3 kg, +5 m/s · B: 2 kg, −4 m/s', options: ['+7 kg·m/s', '+23 kg·m/s', '−7 kg·m/s', '+1 kg·m/s'], answer: 0, explanation: 'p total = (3×5) + (2×−4) = 15−8 = +7 kg·m/s.' },
  { prompt: 'Momentum sebuah benda adalah +18 kg·m/s saat kecepatannya +6 m/s. Berapakah massanya?', data: 'p = +18 kg·m/s · v = +6 m/s', options: ['3 kg', '108 kg', '12 kg', '24 kg'], answer: 0, explanation: 'm = p/v = 18/6 = 3 kg.' },
  { prompt: 'Grafik p terhadap v berupa garis lurus melalui (2 m/s, 10 kg·m/s). Berapakah massa benda dari kemiringan garis?', data: 'Titik grafik: v = 2 m/s, p = 10 kg·m/s', options: ['5 kg', '20 kg', '8 kg', '12 kg'], answer: 0, explanation: 'Kemiringan grafik p–v = Δp/Δv = 10/2 = 5 kg, sama dengan massa.' },
  { prompt: 'Benda bermassa 1 kg bergerak +8 m/s menumbuk lenting benda bermassa 3 kg yang diam. Berapakah kecepatan benda 1 kg setelah tumbukan satu dimensi?', data: 'm₁ = 1 kg, u₁ = +8 m/s · m₂ = 3 kg, u₂ = 0', options: ['−4 m/s', '+4 m/s', '+2 m/s', '−8 m/s'], answer: 0, explanation: 'Untuk tumbukan lenting sempurna, v₁ = ((m₁−m₂)u₁+2m₂u₂)/(m₁+m₂) = −4 m/s.' },
  { prompt: 'Dua benda masing-masing bermassa 2 kg. Benda A bergerak +6 m/s dan B bergerak −2 m/s. Jika keduanya bertumbukan lenting sempurna, berapa kecepatan A setelah tumbukan?', data: 'mA = mB = 2 kg · uA = +6 m/s · uB = −2 m/s', options: ['−2 m/s', '+2 m/s', '+6 m/s', '+4 m/s'], answer: 0, explanation: 'Pada tumbukan lenting satu dimensi dengan massa sama, kedua benda saling bertukar kecepatan. A menjadi −2 m/s.' },
  { prompt: 'Bola 0,4 kg bergerak +5 m/s lalu memantul menjadi −3 m/s. Berapakah impuls pada bola?', data: 'm = 0,4 kg · u = +5 m/s · v = −3 m/s', options: ['−3,2 N·s', '+3,2 N·s', '−0,8 N·s', '+2,0 N·s'], answer: 0, explanation: 'Impuls = Δp = m(v−u) = 0,4(−3−5) = −3,2 N·s.' },
  { prompt: 'Momentum total sistem sebelum tumbukan adalah +14 kg·m/s. Jika tidak ada gaya luar netto, berapa momentum total setelah tumbukan?', data: 'p total sebelum = +14 kg·m/s', options: ['+14 kg·m/s', 'Bergantung pada massa benda', '0 kg·m/s', '−14 kg·m/s'], answer: 0, explanation: 'Momentum total sistem terisolasi kekal, baik tumbukannya lenting maupun tidak lenting.' },
  { prompt: 'Massa benda dibuat 3 kali dan kecepatannya menjadi 1/2 kali semula. Bagaimana besar momentumnya dibanding semula?', data: 'm baru = 3m · v baru = ½v', options: ['1,5 kali semula', '3,5 kali semula', '½ kali semula', '6 kali semula'], answer: 0, explanation: 'p baru = (3m)(v/2) = 1,5mv, jadi momentumnya 1,5 kali semula.' },
  { prompt: 'A (2 kg) bergerak +5 m/s dan B (3 kg) bergerak −1 m/s. Setelah keduanya menyatu, berapa kecepatan bersama?', data: 'Tumbukan tidak lenting sama sekali · A: 2 kg, +5 m/s · B: 3 kg, −1 m/s', options: ['+1,4 m/s', '+2,0 m/s', '−1,4 m/s', '+4,0 m/s'], answer: 0, explanation: 'v akhir = p total/(mA+mB) = (10−3)/5 = +1,4 m/s. Momentum kekal, energi kinetik tidak.' }
];
let questions = [];
let questionIndex = 0;
let quizScore = 0;
let selectedAnswer = null;
let confidence = null;
let answered = false;
let quizFinished = false;

function activeQuestions() {
  return [...customQuestions, ...defaultQuestions].slice(0, Math.min(10, Math.max(1, quizCount)));
}

function renderQuestion() {
  questions = activeQuestions();
  const question = questions[questionIndex];
  selectedAnswer = null;
  confidence = null;
  answered = false;
  document.getElementById('reason-select').parentElement.hidden = false;
  document.querySelector('.confidence-row').hidden = false;
  document.querySelector('.question-visual').hidden = false;
  document.querySelector('.quiz-progress>span:first-child').innerHTML = `SOAL <b id="question-number">${String(questionIndex + 1).padStart(2, '0')}</b> / ${String(questions.length).padStart(2, '0')}`;
  document.getElementById('quiz-step-label').textContent = `${String(questionIndex + 1).padStart(2, '0')} dari ${String(questions.length).padStart(2, '0')}`;
  document.getElementById('quiz-progress-bar').style.width = `${((questionIndex + 1) / questions.length) * 100}%`;
  document.getElementById('question-text').textContent = question.prompt;
  document.querySelector('.question-visual .visual-data').textContent = question.data || 'Gunakan informasi pada soal.';
  document.querySelector('.question-visual small').textContent = 'Perhatikan massa, kecepatan, dan arah.';
  document.getElementById('quiz-feedback').className = 'quiz-feedback';
  document.getElementById('quiz-feedback').textContent = '';
  document.getElementById('submit-answer').hidden = false;
  document.getElementById('next-question').hidden = true;
  document.getElementById('reason-select').value = '';
  document.querySelectorAll('.confidence-options button').forEach(button => button.classList.remove('selected'));
  const options = document.getElementById('answer-options');
  options.replaceChildren();
  question.options.forEach((text, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'answer-option';
    const letter = document.createElement('span');
    letter.className = 'option-letter';
    letter.textContent = String.fromCharCode(65 + index);
    button.append(letter, document.createTextNode(text));
    button.addEventListener('click', () => {
      if (answered) return;
      selectedAnswer = index;
      options.querySelectorAll('.answer-option').forEach(item => item.classList.toggle('selected', item === button));
    });
    options.appendChild(button);
  });
}

document.querySelectorAll('.confidence-options button').forEach(button => button.addEventListener('click', () => {
  confidence = Number(button.dataset.confidence);
  document.querySelectorAll('.confidence-options button').forEach(item => item.classList.toggle('selected', item === button));
}));
document.getElementById('submit-answer').addEventListener('click', () => {
  if (selectedAnswer === null) return showToast('Pilih jawaban terlebih dahulu.');
  if (!document.getElementById('reason-select').value) return showToast('Pilih alasan yang mendukung jawabanmu.');
  if (confidence === null) return showToast('Pilih tingkat keyakinanmu.');
  answered = true;
  const question = questions[questionIndex];
  const correct = selectedAnswer === question.answer;
  if (correct) quizScore += 1;
  document.getElementById('score-label').textContent = `${quizScore} BENAR`;
  const choices = [...document.querySelectorAll('.answer-option')];
  choices[question.answer].classList.add('correct');
  if (!correct) choices[selectedAnswer].classList.add('incorrect');
  const feedback = document.getElementById('quiz-feedback');
  feedback.textContent = correct
    ? question.explanation
    : `Terima kasih sudah mencoba. Jawaban tepat: ${question.options[question.answer]}. ${question.explanation}`;
  feedback.className = `quiz-feedback visible${correct ? '' : ' incorrect'}`;
  document.getElementById('submit-answer').hidden = true;
  document.getElementById('next-question').hidden = false;
  document.getElementById('next-question').innerHTML = questionIndex === questions.length - 1
    ? 'Lihat hasil <span>→</span>'
    : 'Soal berikutnya <span>→</span>';
});
document.getElementById('next-question').addEventListener('click', () => {
  if (quizFinished) {
    questionIndex = 0;
    quizScore = 0;
    quizFinished = false;
    document.getElementById('score-label').textContent = '0 BENAR';
    renderQuestion();
    return;
  }
  if (questionIndex < questions.length - 1) {
    questionIndex += 1;
    renderQuestion();
    return;
  }
  document.getElementById('question-text').textContent = `Kamu menjawab ${quizScore} dari ${questions.length} soal dengan benar.`;
  document.getElementById('answer-options').replaceChildren();
  document.getElementById('reason-select').parentElement.hidden = true;
  document.querySelector('.confidence-row').hidden = true;
  document.querySelector('.question-visual').hidden = true;
  document.getElementById('quiz-feedback').textContent = quizScore === questions.length
    ? 'Selamat! Jawabanmu tepat. Pertahankan pemahamanmu dengan mencoba tantangan berikutnya.'
    : 'Tidak apa-apa, kita belajar bersama. Coba eksplorasi kembali simulasi atau petunjuk konsep, lalu ulangi kuis.';
  document.getElementById('quiz-feedback').className = 'quiz-feedback visible';
  document.getElementById('score-label').textContent = `${quizScore} / ${questions.length} BENAR`;
  document.getElementById('next-question').innerHTML = 'Ulangi kuis <span>↻</span>';
  document.getElementById('next-question').hidden = false;
  quizFinished = true;
  markComplete('kuis');
});
renderQuestion();

function renderTeacherQuestions() {
  const list = document.getElementById('teacher-question-list');
  if (!list) return;
  list.replaceChildren();
  document.getElementById('teacher-question-count').textContent = `${customQuestions.length} soal guru · kuis maks. 10`;
  customQuestions.forEach((question, index) => {
    const item = document.createElement('div');
    item.className = 'teacher-question-item';
    const text = document.createElement('span');
    text.textContent = question.prompt;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Hapus';
    remove.addEventListener('click', () => {
      customQuestions.splice(index, 1);
      localStorage.setItem(storage.customQuestions, JSON.stringify(customQuestions));
      renderTeacherQuestions();
      if (currentUser?.role === 'guru') showToast('Soal guru dihapus.');
    });
    item.append(text, remove);
    list.appendChild(item);
  });
}

function signedValue(value, digits = 2) {
  return `${value >= 0 ? '+' : ''}${Number(value.toFixed(digits))}`;
}

function practiceOutcome(problem) {
  const { massA, velocityA, massB, velocityB } = problem;
  const velocityAfterA = ((massA - massB) * velocityA + 2 * massB * velocityB) / (massA + massB);
  const velocityAfterB = ((massB - massA) * velocityB + 2 * massA * velocityA) / (massA + massB);
  return { velocityAfterA, velocityAfterB };
}

function renderPracticeCase() {
  const select = document.getElementById('problem-case-select');
  if (!select) return;
  const previous = Number(select.value || 0);
  select.replaceChildren();
  practiceCases.forEach((problem, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = problem.title;
    select.appendChild(option);
  });
  select.value = String(Math.min(previous, practiceCases.length - 1));
  const problem = practiceCases[Number(select.value)];
  document.getElementById('problem-title').textContent = problem.title;
  document.getElementById('problem-context').textContent = problem.context;
  document.getElementById('problem-givens').textContent =
    `Benda A: m = ${problem.massA} kg, u = ${signedValue(problem.velocityA)} m/s. Benda B: m = ${problem.massB} kg, u = ${signedValue(problem.velocityB)} m/s.`;
  document.getElementById('problem-question').textContent = 'Atur benda A dan B sesuai data tantangan, lalu periksa pengaturanmu.';
  document.querySelectorAll('#practice-controls input, #practice-controls button').forEach(control => { control.disabled = false; });
  document.getElementById('problem-check-button').disabled = false;
  document.getElementById('problem-check-button').innerHTML = 'Periksa jawaban <span>→</span>';
  document.getElementById('problem-feedback').textContent = '';
  document.getElementById('problem-feedback').classList.remove('incorrect');
  document.getElementById('problem-solution').hidden = true;
  document.getElementById('problem-next').hidden = true;
  const stage = document.getElementById('practice-stage');
  stage.dataset.running = 'false';
  document.getElementById('problem-case-select').disabled = false;
  setPracticeControls({ a: { mass: 2, speed: 4, direction: 1 }, b: { mass: 3, speed: 2, direction: 1 } });
  updatePracticePreview();
}

document.getElementById('problem-case-select').addEventListener('change', renderPracticeCase);
function getPracticeSetup() {
  const body = id => ({
    mass: Number(document.getElementById(`practice-mass-${id}`).value),
    velocity: Number(document.getElementById(`practice-velocity-${id}`).value)
      * Number(document.querySelector(`.practice-direction[data-object="${id}"].active`).dataset.direction)
  });
  const a = body('a');
  const b = body('b');
  return { massA: a.mass, velocityA: a.velocity, massB: b.mass, velocityB: b.velocity };
}

function setPracticeControls(setup) {
  ['a', 'b'].forEach(id => {
    const body = setup[id];
    document.getElementById(`practice-mass-${id}`).value = String(body.mass);
    document.getElementById(`practice-velocity-${id}`).value = String(body.speed);
    document.querySelectorAll(`.practice-direction[data-object="${id}"]`).forEach(button => {
      button.classList.toggle('active', Number(button.dataset.direction) === body.direction);
    });
  });
}

function updatePracticePreview() {
  const setup = getPracticeSetup();
  ['a', 'b'].forEach(id => {
    const mass = setup[`mass${id.toUpperCase()}`];
    const velocity = setup[`velocity${id.toUpperCase()}`];
    document.getElementById(`practice-mass-${id}-value`).textContent = String(mass);
    document.getElementById(`practice-velocity-${id}-value`).textContent =
      document.getElementById(`practice-velocity-${id}`).value;
    const object = document.getElementById(`practice-motion-${id}`);
    object.style.width = `${42 + mass * 6}px`;
    object.style.height = `${42 + mass * 6}px`;
    object.classList.toggle('moving-left', velocity < 0);
    document.getElementById(`practice-speed-${id}`).textContent = `v awal = ${signedValue(velocity)} m/s`;
    document.getElementById(`practice-equation-${id}`).textContent = `p = mv = ${signedValue(mass * velocity)} kg·m/s`;
    document.getElementById(`practice-momentum-${id}`).textContent = signedValue(mass * velocity);
  });
  const xA = setup.velocityA > setup.velocityB ? 28 : 72;
  document.getElementById('practice-motion-a').style.left = `${xA}%`;
  document.getElementById('practice-motion-b').style.left = `${100 - xA}%`;
  document.getElementById('practice-momentum-total').textContent =
    signedValue(setup.massA * setup.velocityA + setup.massB * setup.velocityB);
}

document.querySelectorAll('#practice-controls input').forEach(input => {
  input.addEventListener('input', updatePracticePreview);
});
document.querySelectorAll('.practice-direction').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll(`.practice-direction[data-object="${button.dataset.object}"]`).forEach(item => {
    item.classList.toggle('active', item === button);
  });
  updatePracticePreview();
}));
document.getElementById('practice-reset').addEventListener('click', () => {
  setPracticeControls({ a: { mass: 2, speed: 4, direction: 1 }, b: { mass: 3, speed: 2, direction: 1 } });
  updatePracticePreview();
  document.getElementById('problem-feedback').textContent = '';
  document.getElementById('problem-feedback').classList.remove('incorrect');
});

document.getElementById('problem-check-button').addEventListener('click', () => {
  const problem = practiceCases[Number(document.getElementById('problem-case-select').value)];
  const setup = getPracticeSetup();
  const feedback = document.getElementById('problem-feedback');
  const solution = document.getElementById('problem-solution');
  const correct = ['massA', 'velocityA', 'massB', 'velocityB']
    .every(key => Math.abs(setup[key] - problem[key]) < .001);
  if (!correct) {
    feedback.textContent = 'Pengaturan benda belum sesuai data tantangan. Periksa massa, kecepatan, dan arah gerak, lalu coba lagi.';
    feedback.classList.add('incorrect');
    return;
  }
  feedback.textContent = 'Pengaturan benda tepat! Simulasi tumbukan sedang dijalankan.';
  feedback.classList.remove('incorrect');
  const outcome = practiceOutcome(setup);
  const totalMomentum = setup.massA * setup.velocityA + setup.massB * setup.velocityB;
  solution.textContent =
    `Pembahasan: setelah pengaturanmu cocok, tumbukan lenting memberi vA akhir = ${signedValue(outcome.velocityAfterA)} m/s. Momentum total sebelum dan sesudah tumbukan tetap ${signedValue(totalMomentum)} kg·m/s.`;
  solution.hidden = false;
  document.querySelectorAll('#practice-controls input, #practice-controls button').forEach(control => { control.disabled = true; });
  document.getElementById('problem-check-button').disabled = true;
  document.getElementById('problem-check-button').innerHTML = 'Simulasi berjalan… <span>↻</span>';
  document.getElementById('problem-case-select').disabled = true;
  runPracticeSimulation(setup, () => {
    feedback.textContent = `Pengaturan benar. Setelah tumbukan, kecepatan A = ${signedValue(outcome.velocityAfterA)} m/s dan B = ${signedValue(outcome.velocityAfterB)} m/s.`;
    document.getElementById('problem-check-button').innerHTML = 'Jawaban benar <span>✓</span>';
    markComplete('problem');
    document.getElementById('problem-next').hidden = false;
  });
});

function runPracticeSimulation(problem, onComplete) {
  const stage = document.getElementById('practice-stage');
  const objectA = document.getElementById('practice-motion-a');
  const objectB = document.getElementById('practice-motion-b');
  const width = stage.clientWidth;
  const halfWidthA = objectA.offsetWidth / 2;
  const halfWidthB = objectB.offsetWidth / 2;
  const contactDistance = halfWidthA + halfWidthB;
  const startLeft = problem.velocityA > problem.velocityB;
  let xA = startLeft ? width * .28 : width * .72;
  let xB = startLeft ? width * .72 : width * .28;
  let velocityA = problem.velocityA;
  let velocityB = problem.velocityB;
  let previousTime;
  let collisionTime;
  let afterCollisionElapsed = 0;
  const scale = 23;
  const outcome = practiceOutcome(problem);
  const placeObjects = () => {
    objectA.style.left = `${xA}px`;
    objectB.style.left = `${xB}px`;
  };
  stage.dataset.running = 'true';
  placeObjects();
  const animate = time => {
    if (previousTime === undefined) previousTime = time;
    const delta = Math.min((time - previousTime) / 1000, .04);
    previousTime = time;
    if (collisionTime === undefined) {
      xA += velocityA * scale * delta;
      xB += velocityB * scale * delta;
      if (Math.abs(xB - xA) <= contactDistance) {
        const midpoint = (xA + xB) / 2;
        xA = midpoint + (startLeft ? -contactDistance / 2 : contactDistance / 2);
        xB = midpoint + (startLeft ? contactDistance / 2 : -contactDistance / 2);
        velocityA = outcome.velocityAfterA;
        velocityB = outcome.velocityAfterB;
        collisionTime = time;
        document.getElementById('practice-momentum-a').textContent = signedValue(problem.massA * velocityA);
        document.getElementById('practice-momentum-b').textContent = signedValue(problem.massB * velocityB);
        document.getElementById('practice-speed-a').textContent = `v akhir = ${signedValue(velocityA)} m/s`;
        document.getElementById('practice-speed-b').textContent = `v akhir = ${signedValue(velocityB)} m/s`;
        document.getElementById('practice-equation-a').textContent = `p = mv = ${signedValue(problem.massA * velocityA)} kg·m/s`;
        document.getElementById('practice-equation-b').textContent = `p = mv = ${signedValue(problem.massB * velocityB)} kg·m/s`;
        objectA.classList.toggle('moving-left', velocityA < 0);
        objectB.classList.toggle('moving-left', velocityB < 0);
      }
    } else {
      xA += velocityA * scale * delta;
      xB += velocityB * scale * delta;
      afterCollisionElapsed += delta;
    }
    placeObjects();
    if (collisionTime !== undefined && afterCollisionElapsed >= .65) {
      stage.dataset.running = 'false';
      document.getElementById('problem-case-select').disabled = false;
      onComplete();
      return;
    }
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

document.getElementById('problem-next').addEventListener('click', () => {
  const select = document.getElementById('problem-case-select');
  select.value = String((Number(select.value) + 1) % practiceCases.length);
  renderPracticeCase();
});

function renderTeacherPracticeEditors() {
  const container = document.getElementById('teacher-practice-editors');
  if (!container) return;
  container.replaceChildren();
  practiceCases.forEach((problem, index) => {
    const section = document.createElement('section');
    section.className = 'teacher-practice-editor';
    const heading = document.createElement('h3');
    heading.textContent = `Latihan ${index + 1}`;
    section.appendChild(heading);
    const fields = [
      { key: 'title', label: 'Judul kasus', type: 'text', value: problem.title, maxLength: 90 },
      { key: 'context', label: 'Konteks soal', type: 'textarea', value: problem.context, maxLength: 240 },
      { key: 'massA', label: 'Massa A (kg)', type: 'number', value: problem.massA, min: 1, max: 10, step: 1 },
      { key: 'velocityA', label: 'Kecepatan awal A (m/s; kanan +)', type: 'number', value: problem.velocityA, min: -10, max: 10, step: '0.1' },
      { key: 'massB', label: 'Massa B (kg)', type: 'number', value: problem.massB, min: 1, max: 10, step: 1 },
      { key: 'velocityB', label: 'Kecepatan awal B (m/s; kanan +)', type: 'number', value: problem.velocityB, min: -10, max: 10, step: '0.1' }
    ];
    fields.forEach(field => {
      const label = document.createElement('label');
      label.className = 'teacher-label';
      label.textContent = field.label;
      const input = document.createElement(field.type === 'textarea' ? 'textarea' : 'input');
      input.id = `practice-edit-${index}-${field.key}`;
      if (field.type !== 'textarea') input.type = field.type;
      if (field.maxLength) input.maxLength = field.maxLength;
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
      if (field.step !== undefined) input.step = String(field.step);
      input.value = String(field.value);
      label.appendChild(input);
      section.appendChild(label);
    });
    container.appendChild(section);
  });
}

document.getElementById('save-practice-cases').addEventListener('click', () => {
  const updated = practiceCases.map((problem, index) => ({
    title: document.getElementById(`practice-edit-${index}-title`).value.trim(),
    context: document.getElementById(`practice-edit-${index}-context`).value.trim(),
    massA: Number(document.getElementById(`practice-edit-${index}-massA`).value),
    velocityA: Number(document.getElementById(`practice-edit-${index}-velocityA`).value),
    massB: Number(document.getElementById(`practice-edit-${index}-massB`).value),
    velocityB: Number(document.getElementById(`practice-edit-${index}-velocityB`).value)
  }));
  const valid = updated.every(problem => problem.title && problem.context
    && Number.isFinite(problem.massA) && problem.massA >= 1 && problem.massA <= 10
    && Number.isFinite(problem.massB) && problem.massB >= 1 && problem.massB <= 10
    && Number.isFinite(problem.velocityA) && Math.abs(problem.velocityA) <= 10
    && Number.isFinite(problem.velocityB) && Math.abs(problem.velocityB) <= 10
    && problem.velocityA !== problem.velocityB);
  if (!valid) return showToast('Lengkapi kedua soal. Massa 1–10 kg, kecepatan −10 hingga +10 m/s, dan kecepatan awal harus berbeda agar benda bertumbukan.');
  practiceCases = updated;
  localStorage.setItem(storage.practiceCases, JSON.stringify(practiceCases));
  renderPracticeCase();
  showToast('Dua soal praktik berhasil disimpan.');
});

document.getElementById('quiz-count-setting').addEventListener('change', event => {
  const count = Number(event.target.value);
  if (!Number.isInteger(count) || count < 1 || count > 10) return showToast('Jumlah soal harus antara 1 dan 10.');
  quizCount = count;
  localStorage.setItem(storage.quizCount, String(count));
  questionIndex = 0;
  quizScore = 0;
  quizFinished = false;
  renderQuestion();
  showToast(`Jumlah soal kuis diatur menjadi ${count}.`);
});
document.getElementById('add-teacher-question').addEventListener('click', () => {
  const prompt = document.getElementById('teacher-quiz-prompt').value.trim();
  const options = ['a', 'b', 'c', 'd'].map(letter => document.getElementById(`teacher-option-${letter}`).value.trim());
  const explanation = document.getElementById('teacher-explanation').value.trim();
  if (!prompt || options.some(option => !option) || !explanation) return showToast('Lengkapi soal, empat pilihan, dan pembahasannya.');
  customQuestions.unshift({
    prompt,
    data: 'Soal buatan guru',
    options,
    answer: Number(document.getElementById('teacher-correct-option').value),
    explanation
  });
  localStorage.setItem(storage.customQuestions, JSON.stringify(customQuestions));
  document.getElementById('teacher-quiz-prompt').value = '';
  ['a', 'b', 'c', 'd'].forEach(letter => { document.getElementById(`teacher-option-${letter}`).value = ''; });
  document.getElementById('teacher-explanation').value = '';
  renderTeacherQuestions();
  showToast('Soal berhasil ditambahkan ke kuis guru.');
});

const guides = {
  momentum: [
    { title: 'Mulai dari persamaannya.', text: 'Momentum (p) adalah hasil kali antara massa (m) dan kecepatan (v). Persamaan ringkasnya adalah p = m × v.', example: 'Benda bermassa 2 kg bergerak 3 m/s ke kanan. Momentumnya: p = 2 × 3 = +6 kg·m/s.' },
    { title: 'Perhatikan kedua faktor.', text: 'Massa dan kecepatan sama-sama memengaruhi besar momentum. Jika salah satunya dilipatgandakan, momentum ikut berubah sebanding.', example: 'Jika massa menjadi 4 kg dan kecepatan tetap 3 m/s, momentum menjadi 4 × 3 = 12 kg·m/s.' },
    { title: 'Jangan lupakan arahnya.', text: 'Momentum adalah besaran vektor. Besarnya dihitung dengan p = mv, sementara tandanya mengikuti arah kecepatan.', example: 'Jika kanan positif, benda 2 kg yang bergerak 3 m/s ke kiri memiliki momentum −6 kg·m/s.' }
  ],
  arah: [
    { title: 'Sepakati arah positif.', text: 'Sebelum menentukan tanda momentum, tentukan dahulu kesepakatan arah. Di lab ini, kanan bernilai positif dan kiri bernilai negatif.', example: 'Benda bergerak ke kanan → v positif. Benda bergerak ke kiri → v negatif.' },
    { title: 'Momentum mengikuti kecepatan.', text: 'Arah momentum selalu sama dengan arah gerak benda. Massa tidak mengubah arah, tetapi memengaruhi besar momentumnya.', example: 'Massa 3 kg dengan kecepatan −4 m/s memiliki momentum p = 3 × (−4) = −12 kg·m/s.' },
    { title: 'Baca tanda hasilnya.', text: 'Hasil positif berarti momentum ke arah positif. Hasil negatif berarti momentumnya berlawanan dengan arah positif yang telah disepakati.', example: 'Dengan kanan sebagai arah positif, p = −12 kg·m/s berarti benda bergerak ke kiri.' }
  ],
  grafik: [
    { title: 'Baca sumbu terlebih dahulu.', text: 'Sumbu horizontal menunjukkan kecepatan (v), sedangkan sumbu vertikal menunjukkan momentum (p). Setiap titik adalah satu pasangan nilai.', example: 'Titik (v = 2 m/s, p = 8 kg·m/s) menunjukkan benda bermassa 4 kg.' },
    { title: 'Hubungkan titik dengan persamaan.', text: 'Gunakan p = mv untuk melihat pola. Saat massa tetap, momentum bertambah secara proporsional terhadap kecepatan.', example: 'Jika massa 4 kg, saat v bertambah dari 2 menjadi 4 m/s, momentum naik dari 8 menjadi 16 kg·m/s.' },
    { title: 'Kemiringan menunjukkan massa.', text: 'Untuk grafik p terhadap v, kemiringan garis menunjukkan massa benda. Garis yang lebih curam berarti massa lebih besar.', example: 'Kemiringan 4 kg·m/s per m/s berarti massa benda adalah 4 kg.' }
  ]
};
let guideTopic = 'momentum';
let guideStep = 0;
function renderGuide() {
  const item = guides[guideTopic][guideStep];
  document.getElementById('guide-count').textContent = `LANGKAH ${String(guideStep + 1).padStart(2, '0')} / 03`;
  document.getElementById('guide-icon').textContent = String(guideStep + 1).padStart(2, '0');
  document.getElementById('guide-kicker').textContent = ['LANGKAH PERTAMA', 'LANGKAH KEDUA', 'LANGKAH KETIGA'][guideStep];
  document.getElementById('guide-title').textContent = item.title;
  document.getElementById('guide-text').textContent = item.text;
  document.getElementById('guide-example').textContent = item.example;
  document.querySelectorAll('.guide-step-indicators i').forEach((indicator, index) => indicator.classList.toggle('selected', index === guideStep));
  document.getElementById('guide-back').disabled = guideStep === 0;
  document.getElementById('guide-next').innerHTML = guideStep === 2 ? 'Coba aktivitasnya <span>→</span>' : 'Petunjuk berikutnya <span>→</span>';
}
document.querySelectorAll('.guide-topic').forEach(button => button.addEventListener('click', () => {
  guideTopic = button.dataset.topic;
  guideStep = 0;
  document.querySelectorAll('.guide-topic').forEach(item => item.classList.toggle('active', item === button));
  renderGuide();
}));
document.getElementById('guide-back').addEventListener('click', () => {
  if (guideStep > 0) guideStep -= 1;
  renderGuide();
});
document.getElementById('guide-next').addEventListener('click', () => {
  if (guideStep < 2) {
    guideStep += 1;
    renderGuide();
  } else {
    showPage(guideTopic === 'grafik' ? 'grafik' : 'simulasi');
  }
});
renderGuide();

let installPrompt;
const installButton = document.getElementById('install-button');
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  if (!installPrompt) {
    showToast(/iPhone|iPad|iPod/.test(navigator.userAgent)
      ? 'Di Safari, pilih Bagikan lalu Tambahkan ke Layar Utama.'
      : 'Gunakan menu browser untuk memasang aplikasi.');
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});
window.addEventListener('appinstalled', () => {
  installButton.hidden = true;
  showToast('Momentum Lab berhasil dipasang.');
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      console.error('Pendaftaran service worker gagal:', error);
    });
  });
}
if (!window.matchMedia('(display-mode: standalone)').matches && navigator.standalone !== true
  && /iPhone|iPad|iPod/.test(navigator.userAgent)) installButton.hidden = false;

renderEntryQuestion();
const savedUsername = localStorage.getItem(storage.session);
if (savedUsername) {
  const account = getAccounts()[savedUsername];
  if (account) {
    currentUser = { username: savedUsername, name: account.name, role: account.role };
    progress = new Set(JSON.parse(localStorage.getItem(`momentum-progress:${savedUsername}`) || '[]'));
    updateRoleView();
  } else {
    localStorage.removeItem(storage.session);
  }
}
