const API = "http://localhost:5000";
function getToken() { return localStorage.getItem('token'); }
function getUser()  { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; }
function logout() { localStorage.clear(); window.location.href = '/login.html'; }
function verifierConnexion(roleRequis) {
  const token = getToken(), user = getUser();
  if (!token || !user) { window.location.href = '/login.html'; return false; }
  if (roleRequis && user.role !== roleRequis) {
    window.location.href = user.role === 'admin' ? '/admin.html' : '/dashboard.html';
    return false;
  }
  return true;
}
async function apiGet(route) {
  try {
    const r = await fetch(API + route, { headers: { 'Authorization': 'Bearer ' + getToken() } });
    if (r.status === 401 || r.status === 422) { logout(); return null; }
    return r.json();
  } catch(e) { toast('❌ Erreur réseau','error'); return null; }
}
async function apiPost(route, body) {
  try {
    const r = await fetch(API + route, {
      method:'POST', headers:{'Authorization':'Bearer '+getToken(),'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (r.status === 401 || r.status === 422) { logout(); return null; }
    return r.json();
  } catch(e) { toast('❌ Erreur réseau','error'); return null; }
}
async function apiPut(route, body={}) {
  try {
    const r = await fetch(API + route, {
      method:'PUT', headers:{'Authorization':'Bearer '+getToken(),'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (r.status === 401) { logout(); return null; }
    return r.json();
  } catch(e) { toast('❌ Erreur réseau','error'); return null; }
}
async function apiDelete(route) {
  try {
    const r = await fetch(API + route, { method:'DELETE', headers:{'Authorization':'Bearer '+getToken()} });
    if (r.status === 401) { logout(); return null; }
    return r.json();
  } catch(e) { toast('❌ Erreur réseau','error'); return null; }
}
function toast(msg, type='info', dur=3500) {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  wrap.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, dur);
}
let logsQ = [];
function addLog(msg) {
  logsQ.unshift('[' + new Date().toLocaleTimeString('fr-FR') + '] ' + msg);
  if (logsQ.length > 5) logsQ.pop();
  const el = document.getElementById('logs');
  if (el) el.textContent = logsQ.join('  |  ');
}
function startDatetime() {
  const el = document.getElementById('datetime'); if (!el) return;
  const upd = () => el.textContent = new Date().toLocaleString('fr-FR',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  upd(); setInterval(upd, 1000);
}
function goTo(name, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById('sec-' + name);
  if (sec) sec.classList.add('active');
  if (el) el.classList.add('active');
  if (typeof sectionLoaders !== 'undefined' && sectionLoaders[name]) sectionLoaders[name]();
}
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function set(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function showErr(id, msg) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.style.display = 'block'; } }
function hideErr(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function showOk(id, msg) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.style.display = 'block'; } }
function fermerModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open')); }
document.addEventListener('click', e => { if (e.target.classList.contains('modal-overlay')) fermerModals(); });
