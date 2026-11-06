const $ = s => document.querySelector(s);
const content = $('#content');
let me = null, currentPage = 'dashboard', currentExam = null, answers = {}, questionIndex = 0, timerHandle = null, secondsLeft = 0, questionDrafts = [];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url, options={}) {
  const res = await fetch(url, { headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3200); }
function dateLabel(value) { return new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
function timeLabel(value) { return new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }
function header() {
  $('#userName').textContent=me?.name||'Guest'; $('#userRole').textContent=me?.role||'Welcome';
  $('#avatar').textContent=(me?.name||'G').charAt(0).toUpperCase();
  document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden',me?.role!=='admin'));
}
function showAuth(mode='login') {
  clearInterval(timerHandle);
  document.querySelector('.app-shell').classList.add('hidden');
  document.body.insertAdjacentHTML('beforeend', `<div class="auth-screen" id="authScreen">
    <section class="auth-art"><div class="auth-brand">exam<span>flow</span></div><div class="auth-copy"><div class="eyebrow">YOUR NEXT CHAPTER STARTS HERE</div><h1>Make every<br>answer count.</h1><p>A calmer, smarter way to take examinations. Focus on what you know, one question at a time.</p></div><div class="auth-quote">✦ &nbsp; Learn. Assess. Achieve. &nbsp; — ExamFlow</div></section>
    <section class="auth-box-wrap"><div class="auth-box"><div class="eyebrow">WELCOME TO EXAMFLOW</div><h2 id="authTitle">Welcome back</h2><p id="authSubtitle">Sign in to continue to your examination dashboard.</p>
    <div class="auth-tabs"><button id="loginTab" class="${mode==='login'?'active':''}">Sign in</button><button id="registerTab" class="${mode==='register'?'active':''}">Create account</button></div>
    <form id="authForm"><div id="nameField" class="field ${mode==='register'?'':'hidden'}"><label>Full name</label><input name="name" placeholder="Your full name" autocomplete="name"></div><div class="field"><label>Email address</label><input name="email" type="email" placeholder="you@example.com" required autocomplete="email"></div><div class="field"><label>Password</label><input name="password" type="password" placeholder="At least 8 characters" required autocomplete="${mode==='login'?'current-password':'new-password'}"></div><button class="primary-btn" id="authSubmit">${mode==='login'?'Sign in to dashboard':'Create student account'} →</button></form>
    <div class="auth-hint" id="authHint">Administrator sign-in is configured by the site administrator. Students can create their own accounts.</div></div></section></div>`);
  const setMode = m => {
    $('#loginTab').classList.toggle('active',m==='login'); $('#registerTab').classList.toggle('active',m==='register');
    $('#nameField').classList.toggle('hidden',m!=='register'); $('#authTitle').textContent=m==='login'?'Welcome back':'Create your account';
    $('#authSubtitle').textContent=m==='login'?'Sign in to continue to your examination dashboard.':'Register as a student and start your learning journey.';
    $('#authSubmit').textContent=m==='login'?'Sign in to dashboard →':'Create student account →';
    $('#authHint').classList.toggle('hidden',m==='register');
  };
  $('#loginTab').onclick=()=>setMode('login'); $('#registerTab').onclick=()=>setMode('register');
  $('#authForm').onsubmit=async e=>{
    e.preventDefault(); const fd=new FormData(e.target), payload=Object.fromEntries(fd.entries());
    try { const result=await api('/api/'+($('#registerTab').classList.contains('active')?'register':'login'),{method:'POST',body:JSON.stringify(payload)}); me=result.user; $('#authScreen').remove(); document.querySelector('.app-shell').classList.remove('hidden'); header(); navigate('dashboard'); }
    catch(err){toast(err.message);}
  };
}
async function boot() {
  try { const result=await api('/api/me'); me=result.user; } catch {}
  if(!me) return showAuth();
  header(); navigate('dashboard');
}
function pageHead(kicker,title,subtitle,action='') { return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`; }
function statCard(label,value,icon,note='Updated just now') { return `<div class="stat-card"><div class="stat-top">${label}<span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`; }
function empty(title,desc,icon='◌') { return `<div class="empty-state"><div class="empty-icon">${icon}</div><b>${title}</b><p>${desc}</p></div>`; }
async function navigate(page) {
  if(!me)return showAuth();
  currentPage=page; $('#crumbPage').textContent=({dashboard:'Dashboard',exams:'Examinations',results:'Results & history',manage:'Manage exams',runner:'Take examination',result:'Exam result'})[page]||'Dashboard';
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  $('#sidebar').classList.remove('open');
  try {
    if(page==='dashboard') await renderDashboard();
    else if(page==='exams') await renderExams();
    else if(page==='results') await renderResults();
    else if(page==='manage') await renderManage();
  } catch(e){content.innerHTML=empty('Unable to load this page',esc(e.message),'!');}
}
async function renderDashboard() {
  const [examData,resultData]=await Promise.all([api('/api/exams'),api('/api/results')]);
  const exams=examData.exams, results=resultData.results;
  let stats, extra='';
  if(me.role==='admin') {
    stats=await api('/api/admin/stats');
    extra=`${statCard('Registered students',stats.students,'♙','Total student accounts')}${statCard('All examinations',stats.exams,'▤',''+stats.activeExams+' currently active')}${statCard('Submissions',stats.attempts,'✓','Completed exam attempts')}${statCard('Average score',stats.averageScore+'%','◈','Across all submissions')}`;
  } else {
    const avg=results.length?Math.round(results.reduce((n,r)=>n+r.percentage,0)/results.length):0;
    extra=`${statCard('Available exams',exams.length,'▤','Ready when you are')}${statCard('Completed exams',results.length,'✓','Your submitted attempts')}${statCard('Average score',avg+'%','◈','Across your attempts')}${statCard('Best score',results.length?Math.max(...results.map(r=>r.percentage))+'%':'—','✦','Keep improving')}`;
  }
  content.innerHTML=pageHead('YOUR OVERVIEW',`Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}, ${esc(me.name.split(' ')[0])} 👋`,'Here is what is happening in your examination workspace.',me.role==='admin'?'<button class="primary-btn" onclick="navigate(\'manage\')">＋ Create examination</button>':'<button class="primary-btn" onclick="navigate(\'exams\')">Explore examinations →</button>')+
  `<div class="stats-grid">${extra}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h3>${me.role==='admin'?'Recent examinations':'Pick up where you left off'}</h3><p>${me.role==='admin'?'Manage assessments and monitor availability':'Explore available assessments'}</p></div><button class="text-btn" onclick="navigate('${me.role==='admin'?'manage':'exams'}')">View all →</button></div><div class="exam-list">${exams.slice(0,4).map(e=>`<div class="exam-row"><div class="subject-icon">▤</div><div class="exam-row-info"><b>${esc(e.title)}</b><small>${esc(e.subject)} · ${e.questionCount} questions · ${e.duration} min</small></div>${me.role==='admin'?`<span class="tag ${e.active?'':'off'}">${e.active?'Active':'Inactive'}</span>`:`<button class="secondary-btn" onclick="startExam('${e.id}')">Start →</button>`}</div>`).join('')||empty('No examinations yet','New exams will appear here.')}</div></section><section class="panel"><div class="panel-head"><div><h3>${me.role==='admin'?'Latest submissions':'Your recent results'}</h3><p>${me.role==='admin'?'Student activity at a glance':'A quick look at your progress'}</p></div><button class="text-btn" onclick="navigate('results')">See all →</button></div><div class="activity-list">${results.slice(0,4).map(r=>`<div class="activity"><span class="activity-dot"></span><div style="flex:1"><b>${esc(me.role==='admin'?r.studentName:r.examTitle)}</b><small>${me.role==='admin'?esc(r.examTitle)+' · ':''}${timeLabel(r.submittedAt)}</small><div class="progress-track"><div class="progress-fill" style="width:${r.percentage}%"></div></div></div><b class="score">${r.percentage}%</b></div>`).join('')||empty('No activity yet','Your completed examinations will show up here.','◷')}</div></section></div>`;
}
async function renderExams() {
  const {exams}=await api('/api/exams'), {results}=await api('/api/results');
  const attempted=new Set(results.map(r=>r.examId));
  content.innerHTML=pageHead('ASSESSMENT LIBRARY','Examinations','Choose an assessment, find your focus, and show what you know.')+
  `<div class="search-row"><input class="search-input" id="examSearch" placeholder="⌕  Search by exam or subject..." style="flex:1"><span class="tag">${exams.length} available</span></div><div class="exam-grid" id="examGrid">${examCards(exams,attempted)}</div>`;
  $('#examSearch').oninput=()=>{const q=$('#examSearch').value.toLowerCase();$('#examGrid').innerHTML=examCards(exams.filter(e=>(e.title+' '+e.subject+' '+e.description).toLowerCase().includes(q)),attempted);};
}
function examCards(exams,attempted=new Set()) {
  return exams.map(e=>`<article class="exam-card"><div class="exam-card-top"><div class="subject-icon">▤</div><span class="tag ${attempted.has(e.id)?'off':''}">${attempted.has(e.id)?'Completed':'Available'}</span></div><h3>${esc(e.title)}</h3><p>${esc(e.description||'A focused assessment designed to test your knowledge.')}</p><div class="exam-meta"><span>◷ ${e.duration} min</span><span>▧ ${e.questionCount} questions</span><span>✦ ${e.questionCount} marks</span></div><button class="${attempted.has(e.id)?'secondary-btn':'primary-btn'}" ${attempted.has(e.id)?'disabled':''} onclick="startExam('${e.id}')">${attempted.has(e.id)?'Already submitted':'Start examination →'}</button></article>`).join('')||empty('No matching examinations','Try a different search term.');
}
async function renderResults() {
  const {results}=await api('/api/results');
  content.innerHTML=pageHead('PERFORMANCE','Results & history','Review completed assessments and track your progress.')+
  (results.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Examination</th>${me.role==='admin'?'<th>Student</th>':''}<th>Submitted</th><th>Score</th><th>Percentage</th><th>Outcome</th><th></th></tr></thead><tbody>${results.map(r=>`<tr><td><b>${esc(r.examTitle)}</b></td>${me.role==='admin'?`<td>${esc(r.studentName)}<br><small style="color:#9aa2b3">${esc(r.studentEmail)}</small></td>`:''}<td>${timeLabel(r.submittedAt)}</td><td><b>${r.score} / ${r.totalMarks}</b></td><td><span class="score">${r.percentage}%</span></td><td><span class="tag ${r.percentage<50?'off':''}">${r.percentage>=50?'Passed':'Needs review'}</span></td><td><button class="text-btn" onclick="showResult('${r.id}')">Review →</button></td></tr>`).join('')}</tbody></table></div>`:empty('No results to show','Complete an examination and your results will appear here.','◷'));
}
async function renderManage() {
  if(me.role!=='admin')return navigate('dashboard');
  const {exams}=await api('/api/exams');
  content.innerHTML=pageHead('ADMINISTRATION','Manage examinations','Create assessments, publish them, and control availability.','<button class="primary-btn" onclick="showCreateForm()">＋ New examination</button>')+
  `<div class="panel" id="createPanel" style="margin-bottom:20px"><div class="panel-head"><div><h3>Examination inventory</h3><p>Activate or deactivate exams for students.</p></div><span class="tag">${exams.length} total</span></div><div class="table-wrap" style="border:0"><table class="data-table"><thead><tr><th>Examination</th><th>Subject</th><th>Duration</th><th>Questions</th><th>Status</th><th>Action</th></tr></thead><tbody>${exams.map(e=>`<tr><td><b>${esc(e.title)}</b><br><small style="color:#9aa2b3">${esc(e.description)}</small></td><td>${esc(e.subject)}</td><td>${e.duration} min</td><td>${e.questionCount}</td><td><span class="tag ${e.active?'':'off'}">${e.active?'Active':'Inactive'}</span></td><td><button class="secondary-btn" onclick="toggleExam('${e.id}',${!e.active})">${e.active?'Deactivate':'Activate'}</button></td></tr>`).join('')}</tbody></table></div></div><div id="createFormMount"></div>`;
}
function showCreateForm() {
  const mount=$('#createFormMount');
  mount.innerHTML=`<section class="panel"><div class="panel-head"><div><h3>Create a new examination</h3><p>Add your exam details and multiple-choice questions.</p></div><button class="text-btn" onclick="$('#createFormMount').innerHTML=''">Close ×</button></div><form id="createExamForm"><div class="form-grid"><div class="field"><label>Examination title *</label><input name="title" required placeholder="e.g. Database Management Systems"></div><div class="field"><label>Subject *</label><input name="subject" required placeholder="e.g. Computer Science"></div><div class="field full"><label>Description</label><textarea name="description" placeholder="Briefly describe this examination"></textarea></div><div class="field"><label>Duration (minutes)</label><input name="duration" type="number" min="1" max="180" value="30" required></div><div class="field"><label>Publish immediately?</label><select name="active"><option value="true">Yes — available to students</option><option value="false">No — keep inactive</option></select></div></div><div id="questionDrafts"></div><div class="question-actions"><button class="secondary-btn" type="button" onclick="addQuestionDraft()">＋ Add question</button><small style="color:#9aa2b3">Each question is worth 1 mark.</small></div><div style="display:flex;justify-content:flex-end;margin-top:20px"><button class="primary-btn">Save examination →</button></div></form></section>`;
  questionDrafts=[];addQuestionDraft();addQuestionDraft();
  $('#createExamForm').onsubmit=async e=>{
    e.preventDefault();
    const fd=new FormData(e.target), payload=Object.fromEntries(fd.entries());
    payload.duration=Number(payload.duration);payload.active=payload.active==='true';payload.questions=questionDrafts.map((_,i)=>({
      text:document.querySelector(`[name="qtext-${i}"]`).value,
      options:[0,1,2,3].map(j=>document.querySelector(`[name="qopt-${i}-${j}"]`).value).filter(v=>v.trim()),
      correct:Number(document.querySelector(`[name="qcorrect-${i}"]`).value)
    }));
    try{await api('/api/admin/exams',{method:'POST',body:JSON.stringify(payload)});toast('Examination created successfully.');renderManage();}
    catch(err){toast(err.message);}
  };
  mount.scrollIntoView({behavior:'smooth',block:'start'});
}
function addQuestionDraft() {
  const i=questionDrafts.length;questionDrafts.push(i);
  $('#questionDrafts').insertAdjacentHTML('beforeend',`<div class="question-builder"><h4>QUESTION ${i+1}</h4><div class="field"><label>Question text *</label><input name="qtext-${i}" required placeholder="Enter your question"></div><div class="option-grid" style="margin-top:12px">${[0,1,2,3].map(j=>`<div class="field"><label>Option ${String.fromCharCode(65+j)}${j<2?' *':''}</label><input name="qopt-${i}-${j}" ${j<2?'required':''} placeholder="Answer option"></div>`).join('')}</div><div class="field" style="margin-top:12px"><label>Correct answer *</label><select name="qcorrect-${i}"><option value="0">Option A</option><option value="1">Option B</option><option value="2">Option C</option><option value="3">Option D</option></select></div></div>`);
}
async function toggleExam(id,active){try{await api('/api/admin/exams/'+id,{method:'PATCH',body:JSON.stringify({active})});toast('Exam availability updated.');renderManage();}catch(e){toast(e.message);}}
async function startExam(id) {
  try{
    const {exam}=await api('/api/exams/'+id);
    if(me.role==='admin')return toast('Sign in with a student account to take an exam.');
    currentExam=exam;answers={};questionIndex=0;secondsLeft=exam.duration*60;
    currentPage='runner';$('#crumbPage').textContent='Take examination';renderRunner();clearInterval(timerHandle);
    timerHandle=setInterval(()=>{secondsLeft--;const t=$('#timerValue');if(t)t.textContent=formatTime(secondsLeft);if(secondsLeft<=0){clearInterval(timerHandle);submitExam(true);}},1000);
  }catch(e){toast(e.message);if(e.message.includes('already'))navigate('exams');}
}
function formatTime(n){n=Math.max(0,n);return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
function renderRunner(){
  const q=currentExam.questions[questionIndex],letters=['A','B','C','D','E','F'];
  content.innerHTML=`<div class="exam-runner"><div class="runner-top"><div><div class="eyebrow">${esc(currentExam.subject)}</div><h2 style="font:800 21px Manrope;margin:7px 0">${esc(currentExam.title)}</h2><small style="color:#8c96a9">${currentExam.questions.length} questions · ${currentExam.duration} minutes</small></div><div class="timer">◷ &nbsp;<span id="timerValue">${formatTime(secondsLeft)}</span></div></div><div class="runner-progress"><div style="width:${(questionIndex+1)/currentExam.questions.length*100}%"></div></div><section class="panel question-panel"><div class="question-number">QUESTION ${String(questionIndex+1).padStart(2,'0')} <span style="color:#a0a8b7">/ ${currentExam.questions.length}</span></div><h2>${esc(q.text)}</h2>${q.options.map((o,i)=>`<label class="answer-option ${answers[q.id]===i?'selected':''}"><input type="radio" name="answer" value="${i}" ${answers[q.id]===i?'checked':''}><span class="option-letter">${letters[i]}</span><span>${esc(o)}</span></label>`).join('')}</section><div class="runner-bottom"><button class="secondary-btn" ${questionIndex===0?'disabled':''} onclick="moveQuestion(-1)">← Previous</button><small>${Object.keys(answers).length} of ${currentExam.questions.length} answered</small>${questionIndex<currentExam.questions.length-1?'<button class="primary-btn" onclick="moveQuestion(1)">Next question →</button>':'<button class="primary-btn" onclick="confirmSubmit()">Submit examination ✓</button>'}</div></div>`;
  document.querySelectorAll('input[name="answer"]').forEach(input=>input.onchange=()=>{answers[q.id]=Number(input.value);renderRunner();});
}
function moveQuestion(step){questionIndex=Math.max(0,Math.min(currentExam.questions.length-1,questionIndex+step));renderRunner();}
function confirmSubmit(){
  const unanswered=currentExam.questions.length-Object.keys(answers).length;
  $('#modal').classList.remove('hidden');$('#modal').innerHTML=`<div class="modal-card"><div class="eyebrow">FINAL CHECK</div><h3>Submit your examination?</h3><p>${unanswered?`You have ${unanswered} unanswered question${unanswered===1?'':'s'}. `:''}Once submitted, you cannot change your answers.</p><div class="modal-actions"><button class="secondary-btn" onclick="$('#modal').classList.add('hidden')">Keep reviewing</button><button class="primary-btn" onclick="$('#modal').classList.add('hidden');submitExam(false)">Submit now →</button></div></div>`;
}
async function submitExam(auto=false){
  if(!currentExam)return;clearInterval(timerHandle);
  try{const {attempt}=await api('/api/exams/'+currentExam.id+'/submit',{method:'POST',body:JSON.stringify({answers})});currentExam=null;await renderResultDetail(attempt,auto);}
  catch(e){toast(e.message);navigate('exams');}
}
async function renderResultDetail(r,auto=false){
  currentPage='result';$('#crumbPage').textContent='Exam result';
  content.innerHTML=`<div class="exam-runner"><section class="panel"><div class="result-hero"><div class="result-circle">${r.percentage}%</div><h1>${r.percentage>=50?'Well done!':'Keep practising!'}</h1><p>${auto?'Your time ran out and your answers were submitted automatically.':'Your examination has been submitted successfully.'}</p><div style="display:flex;justify-content:center;gap:25px;margin:22px 0"><div><div class="eyebrow">YOUR SCORE</div><b style="font:800 21px Manrope">${r.score}/${r.totalMarks}</b></div><div><div class="eyebrow">CORRECT ANSWERS</div><b style="font:800 21px Manrope">${r.review.filter(q=>q.isCorrect).length}/${r.totalMarks}</b></div></div><button class="primary-btn" onclick="navigate('results')">View all results →</button> <button class="secondary-btn" onclick="navigate('exams')">Back to exams</button></div><div class="panel-head"><div><h3>Answer review</h3><p>Check your answers and learn from each question.</p></div></div>${r.review.map((q,i)=>`<div class="review-item"><b>${i+1}. ${esc(q.question)}</b><small class="${q.isCorrect?'correct-text':'wrong-text'}">${q.isCorrect?'✓ Correct':'✕ Incorrect'} · Your answer: ${q.selected===null?'Not answered':esc(q.options[q.selected])}</small><small class="correct-text">Correct answer: ${esc(q.options[q.correctAnswer])}</small></div>`).join('')}</section></div>`;
}
async function showResult(id){
  try{const {results}=await api('/api/results');const r=results.find(x=>x.id===id);if(r)await renderResultDetail(r);}
  catch(e){toast(e.message);}
}
$('#logoutBtn').onclick=async()=>{try{await api('/api/logout',{method:'POST'});}catch{}me=null;document.querySelector('.auth-screen')?.remove();document.querySelector('.app-shell').classList.add('hidden');showAuth();};
document.querySelectorAll('.nav-item').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.page)));
$('#mobileMenu').onclick=()=>$('#sidebar').classList.toggle('open');
boot();
