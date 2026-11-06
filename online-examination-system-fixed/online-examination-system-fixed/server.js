const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { users: [], exams: [], attempts: [] }; }
}
function writeDB(db) {
  const tempFile = DB_FILE + '.tmp';
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2));
  fs.renameSync(tempFile, DB_FILE);
}
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role }; }

async function seed() {
  const db = readDB();
  if (!db.users.some(u => u.role === 'admin')) {
    const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@exam.com').trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';
    if (adminPassword.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
    db.users.push({
      id: 'admin-1', name: 'System Administrator', email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 10), role: 'admin',
      createdAt: new Date().toISOString()
    });
  }
  if (!db.exams.length) {
    db.exams.push({
      id: 'exam-demo', title: 'JavaScript Fundamentals', subject: 'Programming',
      description: 'A quick assessment of JavaScript basics, variables, functions, and arrays.',
      duration: 15, totalMarks: 5, active: true, createdAt: new Date().toISOString(),
      questions: [
        { id: 'q1', text: 'Which keyword declares a block-scoped variable that can be reassigned?', options: ['const', 'let', 'static', 'define'], correct: 1, marks: 1 },
        { id: 'q2', text: 'Which method converts a JSON string into a JavaScript object?', options: ['JSON.stringify()', 'JSON.parse()', 'JSON.object()', 'JSON.convert()'], correct: 1, marks: 1 },
        { id: 'q3', text: 'What is the result of typeof [] in JavaScript?', options: ['array', 'list', 'object', 'undefined'], correct: 2, marks: 1 },
        { id: 'q4', text: 'Which array method creates a new array by transforming each item?', options: ['filter()', 'map()', 'reduceOnly()', 'push()'], correct: 1, marks: 1 },
        { id: 'q5', text: 'Which operator checks strict equality without type coercion?', options: ['==', '=', '===', '!='], correct: 2, marks: 1 }
      ]
    });
  }
  writeDB(db);
}
app.set('trust proxy', 1); // Render terminates HTTPS at its proxy.\napp.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'local-development-secret-change-before-deployment',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please sign in first.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  next();
}
function sanitizeExam(exam) {
  const { questions, ...rest } = exam;
  return { ...rest, questionCount: questions.length };
}

app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const db = readDB(), normalized = String(email).trim().toLowerCase();
  if (db.users.some(u => u.email === normalized)) return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
  const user = { id: 'u-' + Date.now(), name: String(name).trim(), email: normalized, passwordHash: await bcrypt.hash(password, 10), role: 'student', createdAt: new Date().toISOString() };
  db.users.push(user); writeDB(db);
  req.session.user = publicUser(user);
  res.status(201).json({ user: req.session.user });
});
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const db = readDB(), user = db.users.find(u => u.email === String(email || '').trim().toLowerCase());
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) return res.status(401).json({ error: 'Incorrect email or password.' });
  req.session.user = publicUser(user);
  res.json({ user: req.session.user });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/exams', requireAuth, (req, res) => {
  const db = readDB();
  const exams = db.exams.filter(e => req.session.user.role === 'admin' || e.active).map(sanitizeExam);
  res.json({ exams });
});
app.get('/api/exams/:id', requireAuth, (req, res) => {
  const db = readDB(), exam = db.exams.find(e => e.id === req.params.id);
  if (!exam || (!exam.active && req.session.user.role !== 'admin')) return res.status(404).json({ error: 'Exam not found.' });
  if (req.session.user.role !== 'admin' && db.attempts.some(a => a.examId === exam.id && a.userId === req.session.user.id)) {
    return res.status(409).json({ error: 'You have already submitted this exam.' });
  }
  const { questions, ...safe } = exam;
  res.json({ exam: { ...safe, questions: questions.map(({ correct, ...q }) => q) } });
});
app.post('/api/exams/:id/submit', requireAuth, (req, res) => {
  if (req.session.user.role !== 'student') return res.status(403).json({ error: 'Only students can submit exams.' });
  const db = readDB(), exam = db.exams.find(e => e.id === req.params.id && e.active);
  if (!exam) return res.status(404).json({ error: 'Exam not found or inactive.' });
  if (db.attempts.some(a => a.examId === exam.id && a.userId === req.session.user.id)) return res.status(409).json({ error: 'This exam has already been submitted.' });
  const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
  let score = 0;
  const review = exam.questions.map(q => {
    const selected = Number.isInteger(answers[q.id]) ? answers[q.id] : null;
    const correct = selected === q.correct;
    if (correct) score += q.marks;
    return { questionId: q.id, question: q.text, options: q.options, selected, correctAnswer: q.correct, isCorrect: correct, marks: q.marks };
  });
  const attempt = {
    id: 'a-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    examId: exam.id, examTitle: exam.title, userId: req.session.user.id, studentName: req.session.user.name,
    studentEmail: req.session.user.email, score, totalMarks: exam.totalMarks,
    percentage: exam.totalMarks ? Math.round(score / exam.totalMarks * 100) : 0,
    answers, review, submittedAt: new Date().toISOString()
  };
  db.attempts.push(attempt); writeDB(db);
  res.json({ attempt });
});
app.get('/api/results', requireAuth, (req, res) => {
  const db = readDB();
  const results = db.attempts.filter(a => req.session.user.role === 'admin' || a.userId === req.session.user.id);
  res.json({ results: results.sort((a,b) => new Date(b.submittedAt)-new Date(a.submittedAt)) });
});

app.post('/api/admin/exams', requireAdmin, (req, res) => {
  const { title, subject, description, duration, questions, active } = req.body;
  if (!title || !subject || !Array.isArray(questions) || questions.length < 1) return res.status(400).json({ error: 'Title, subject, and at least one question are required.' });
  const cleaned = [];
  for (const [i, q] of questions.entries()) {
    if (!q.text || !Array.isArray(q.options) || q.options.length < 2 || q.options.some(o => !String(o).trim())) return res.status(400).json({ error: `Question ${i+1} needs text and at least two non-empty options.` });
    const correct = Number(q.correct);
    if (!Number.isInteger(correct) || correct < 0 || correct >= q.options.length) return res.status(400).json({ error: `Select a valid correct option for question ${i+1}.` });
    cleaned.push({ id: 'q-' + Date.now() + '-' + i, text: String(q.text).trim(), options: q.options.map(o => String(o).trim()), correct, marks: 1 });
  }
  const db = readDB();
  const exam = { id: 'exam-' + Date.now(), title: String(title).trim(), subject: String(subject).trim(), description: String(description || '').trim(), duration: Math.min(180, Math.max(1, Number(duration) || 30)), totalMarks: cleaned.length, active: active !== false, createdAt: new Date().toISOString(), questions: cleaned };
  db.exams.push(exam); writeDB(db);
  res.status(201).json({ exam: sanitizeExam(exam) });
});
app.patch('/api/admin/exams/:id', requireAdmin, (req, res) => {
  const db = readDB(), exam = db.exams.find(e => e.id === req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });
  exam.active = Boolean(req.body.active); writeDB(db);
  res.json({ exam: sanitizeExam(exam) });
});
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const db = readDB();
  res.json({
    students: db.users.filter(u => u.role === 'student').length,
    exams: db.exams.length, activeExams: db.exams.filter(e => e.active).length,
    attempts: db.attempts.length,
    averageScore: db.attempts.length ? Math.round(db.attempts.reduce((n,a)=>n+a.percentage,0)/db.attempts.length) : 0
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
seed().then(() => app.listen(PORT, () => console.log(`Online Examination System running at http://localhost:${PORT}`)));
