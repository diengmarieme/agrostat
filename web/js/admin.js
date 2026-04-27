// admin.js — Interface administrateur AgroStat
let allClientsData = [], allAdminMesures = [], allCapteursAdmin = [], charts = {};

// ── VUE GLOBALE ──
async function chargerOverview() {
  const [stats, mesures, clients] = await Promise.all([
    apiGet('/admin/stats'),
    apiGet('/admin/mesures'),
    apiGet('/admin/users')
  ]);
  if (stats) {
    set('ak-clients',   stats.nb_clients);
    set('ak-parcelles', stats.nb_parcelles);
    set('ak-capteurs',  stats.nb_capteurs);
    set('ak-mesures',   stats.nb_mesures);
    set('badge-clients',stats.nb_clients);
  }
  if (mesures) {
    allAdminMesures = mesures;
    dessinerChartOverview(mesures);
    // Anomalies récentes
    const anoms = mesures.filter(m => m.type === 'humidite' && m.valeur < 30).slice(0,5);
    const el = document.getElementById('overview-anomalies');
    if (!anoms.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Aucune anomalie</div></div>';
    } else {
      el.innerHTML = anoms.map(m => `<div class="stat-row"><span class="stat-label">⚠️ Capteur ${m.capteur_id} — ${m.parcelle}</span><span class="stat-val" style="color:var(--red-500)">${m.valeur}%</span></div>`).join('');
    }
  }
  if (clients) {
    allClientsData = clients;
    const el = document.getElementById('overview-clients');
    const recents = clients.filter(c=>c.role==='client').slice(-5).reverse();
    el.innerHTML = recents.map(u => `<div class="stat-row"><span class="stat-label">👤 ${u.nom_complet}</span><span class="stat-val" style="font-size:11px;color:var(--gray-400)">${u.created_at?u.created_at.slice(0,10):'—'}</span></div>`).join('') || '<div class="loading-state">Aucun client</div>';
  }
  addLog('Vue globale chargée');
}

function dessinerChartOverview(mesures) {
  const ctx = document.getElementById('chart-overview');
  if (!ctx) return;
  if (charts.overview) charts.overview.destroy();
  const temps  = mesures.filter(m=>m.type==='temperature').slice(0,30).reverse();
  const humids = mesures.filter(m=>m.type==='humidite').slice(0,30).reverse();
  const labels = temps.map(m=>new Date(m.timestamp).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}));
  charts.overview = new Chart(ctx, {
    type:'line',
    data:{labels, datasets:[
      {label:'Temp. (°C)', data:temps.map(m=>m.valeur), borderColor:'#f97316', backgroundColor:'rgba(249,115,22,.07)', tension:.4, fill:true, pointRadius:2},
      {label:'Humid. (%)', data:humids.map(m=>m.valeur), borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,.07)', tension:.4, fill:true, pointRadius:2}
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:12}}},
      scales:{x:{grid:{color:'#f1f5f9'},ticks:{font:{size:10}}},y:{grid:{color:'#f1f5f9'},min:0}}}
  });
}

// ── CLIENTS ──
async function chargerClients() {
  const data = await apiGet('/admin/users');
  if (!data) return;
  allClientsData = data;
  set('badge-clients', data.filter(u=>u.role==='client').length);
  afficherClients(data);
  addLog(`${data.length} utilisateurs chargés`);
}

function afficherClients(data) {
  const wrap = document.getElementById('clients-tbl');
  if (!data.length) { wrap.innerHTML='<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">Aucun client</div></div>'; return; }
  wrap.innerHTML = `<table class="ctbl"><thead><tr><th>ID</th><th>Nom complet</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Inscrit le</th><th>Actions</th></tr></thead><tbody>${
    data.map(u=>`<tr>
      <td style="font-weight:700;color:var(--gray-400)">#${u.id}</td>
      <td><strong>${u.nom_complet}</strong></td>
      <td style="font-size:12px;color:var(--gray-500)">${u.email}</td>
      <td><span class="role-pill ${u.role==='admin'?'role-admin':'role-client'}">${u.role==='admin'?'👑 Admin':'👤 Client'}</span></td>
      <td>${u.actif?'<span class="status-active">● Actif</span>':'<span class="status-inactive">● Inactif</span>'}</td>
      <td style="font-size:11.5px;color:var(--gray-400)">${u.created_at?u.created_at.slice(0,10):'—'}</td>
      <td><div class="action-btns">
        ${u.role!=='admin'?`<button class="btn btn-xs btn-secondary" onclick="toggleClient(${u.id})">${u.actif?'Désactiver':'Activer'}</button>`:''}
        ${u.role!=='admin'?`<button class="btn btn-xs btn-danger" onclick="supprimerClient(${u.id},'${u.nom_complet}')">Supprimer</button>`:''}
      </div></td>
    </tr>`).join('')
  }</tbody></table>`;
}

function filtrerClients() {
  const q = document.getElementById('search-client')?.value.toLowerCase() || '';
  const filtered = allClientsData.filter(u => u.nom_complet.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  afficherClients(filtered);
}

async function toggleClient(uid) {
  const r = await apiPut(`/admin/users/${uid}/toggle`);
  if (r && !r.erreur) { toast('✅ Statut mis à jour','success'); chargerClients(); chargerOverview(); addLog(`User #${uid} toggle`); }
  else toast('❌ '+(r?.erreur||'Erreur'),'error');
}

async function supprimerClient(uid, nom) {
  if (!confirm(`⚠️ Supprimer le client "${nom}" ?\nToutes ses parcelles et données seront supprimées.`)) return;
  const r = await apiDelete(`/admin/users/${uid}`);
  if (r && !r.erreur) { toast('✅ Client supprimé','success'); chargerClients(); chargerOverview(); addLog(`Client ${nom} supprimé`); }
  else toast('❌ '+(r?.erreur||'Erreur'),'error');
}

// ── PARCELLES ADMIN ──
async function chargerParcellesAdmin() {
  const data = await apiGet('/parcelles');
  if (!data) return;
  const wrap = document.getElementById('all-parcelles-tbl');
  if (!data.length) { wrap.innerHTML='<div class="loading-state">Aucune parcelle</div>'; return; }
  wrap.innerHTML = `<table class="tbl"><thead><tr><th>ID</th><th>Nom</th><th>Propriétaire</th><th>Localisation</th><th>Superficie</th><th>Créée le</th></tr></thead><tbody>${
    data.map(p=>`<tr><td>#${p.id}</td><td><strong>🌾 ${p.nom}</strong></td><td>${p.proprietaire||'—'}</td><td>${p.localisation||'—'}</td><td>${p.superficie||'—'} ha</td><td style="font-size:11.5px;color:var(--gray-400)">${p.created_at?p.created_at.slice(0,10):'—'}</td></tr>`).join('')
  }</tbody></table>`;
  addLog(`${data.length} parcelles affichées`);
}

// ── CAPTEURS ADMIN ──
async function chargerCapteursAdmin() {
  const data = await apiGet('/capteurs');
  if (!data) return;
  allCapteursAdmin = data;
  filtrerCapteursAdmin();
  addLog(`${data.length} capteurs affichés`);
}

function filtrerCapteursAdmin() {
  const t = document.getElementById('admin-filtre-type-cap')?.value || '';
  const filtered = t ? allCapteursAdmin.filter(c=>c.type===t) : allCapteursAdmin;
  const wrap = document.getElementById('all-capteurs-tbl');
  const badges = {temperature:'<span class="type-pill tp-temp">🌡️ Température</span>', humidite:'<span class="type-pill tp-hum">💧 Humidité</span>', ph_sol:'<span class="type-pill tp-ph">🧪 pH Sol</span>'};
  if (!filtered.length) { wrap.innerHTML='<div class="loading-state">Aucun capteur</div>'; return; }
  wrap.innerHTML = `<table class="tbl"><thead><tr><th>ID Capteur</th><th>Type</th><th>Parcelle</th><th>Propriétaire</th><th>Statut</th><th>Créé le</th></tr></thead><tbody>${
    filtered.map(c=>`<tr><td><code style="background:var(--gray-100);padding:2px 8px;border-radius:4px;font-size:11px">${c.capteur_id}</code></td><td>${badges[c.type]||c.type}</td><td>🌾 ${c.parcelle}</td><td>${c.proprietaire||'—'}</td><td><span class="${c.actif?'status-ok':'status-crit'}">${c.actif?'● Actif':'● Inactif'}</span></td><td style="font-size:11.5px;color:var(--gray-400)">${c.created_at?c.created_at.slice(0,10):'—'}</td></tr>`).join('')
  }</tbody></table>`;
}

// ── MESURES ADMIN ──
function filtrerMesuresAdmin() {
  const t = document.getElementById('admin-f-type')?.value || '';
  const filtered = t ? allAdminMesures.filter(m=>m.type===t) : allAdminMesures;
  const wrap = document.getElementById('admin-mesures-tbl');
  const badges = {temperature:'<span class="type-pill tp-temp">🌡️ Temp.</span>', humidite:'<span class="type-pill tp-hum">💧 Humid.</span>', ph_sol:'<span class="type-pill tp-ph">🧪 pH Sol</span>'};
  if (!filtered.length) { wrap.innerHTML='<div class="loading-state">Aucune mesure</div>'; return; }
  wrap.innerHTML = `<table class="tbl"><thead><tr><th>Capteur</th><th>Type</th><th>Parcelle</th><th>Client ID</th><th>Valeur</th><th>Timestamp</th></tr></thead><tbody>${
    filtered.slice(0,150).map(m=>`<tr class="${m.type==='humidite'&&m.valeur<30?'row-anom':''}"><td><strong>${m.capteur_id}</strong></td><td>${badges[m.type]||m.type}</td><td>${m.parcelle||'—'}</td><td style="color:var(--purple-500);font-size:11.5px;font-weight:600">User #${m.user_id}</td><td><strong style="color:${m.type==='humidite'&&m.valeur<30?'var(--red-500)':'var(--gray-900)'}">${m.valeur} ${m.unite}</strong></td><td style="font-size:11.5px">${fmtDate(m.timestamp)}</td></tr>`).join('')
  }</tbody></table>`;
}

// ── AJOUTER CLIENT ──
async function ajouterClientAdmin() {
  const nom  = document.getElementById('ac-nom').value.trim();
  const email= document.getElementById('ac-email').value.trim();
  const pwd  = document.getElementById('ac-pwd').value.trim();
  const parc = document.getElementById('ac-parcelle').value.trim() || nom+' Parcelle';
  const loc  = document.getElementById('ac-loc').value.trim();
  const errEl= document.getElementById('ac-err');
  const okEl = document.getElementById('ac-ok');
  errEl.style.display='none'; okEl.style.display='none';

  if (!nom||!email||!pwd) { showErr('ac-err','⚠️ Nom, email et mot de passe sont obligatoires'); return; }
  if (pwd.length < 6)     { showErr('ac-err','⚠️ Mot de passe trop court (min 6 car.)'); return; }

  const r = await apiPost('/admin/users', {nom_complet:nom, email, password:pwd, role:'client', parcelle_nom:parc, localisation:loc});
  if (!r) return;
  if (r.erreur) { showErr('ac-err','❌ '+r.erreur); return; }
  showOk('ac-ok', `✅ Client "${nom}" créé avec succès ! ID: #${r.id}`);
  toast('✅ Client créé: '+nom,'success');
  chargerOverview(); chargerClients();
  addLog('Admin créé client: '+nom);
}

function resetFormAjout() {
  ['ac-nom','ac-email','ac-pwd','ac-parcelle','ac-loc'].forEach(id => document.getElementById(id).value='');
  ['ac-err','ac-ok'].forEach(id => document.getElementById(id).style.display='none');
}

// ── SECTION LOADERS ──
const sectionLoaders = {
  overview:       chargerOverview,
  clients:        chargerClients,
  'parcelles-admin': chargerParcellesAdmin,
  'capteurs-admin':  chargerCapteursAdmin,
  'mesures-admin':   ()=>{ chargerOverview(); filtrerMesuresAdmin(); },
  'ajouter-client':  ()=>{}
};

// ── INIT ADMIN ──
window.addEventListener('DOMContentLoaded', () => {
  if (!verifierConnexion('admin')) return;
  startDatetime();
  chargerOverview();
  // Auto-refresh 30s
  setInterval(() => {
    chargerOverview();
    const sec = document.querySelector('.section.active');
    if (sec) {
      const name = sec.id.replace('sec-','');
      if (sectionLoaders[name] && name !== 'overview') sectionLoaders[name]();
    }
    addLog('Auto-refresh admin');
  }, 30000);
  addLog('Admin connecté — surveillance active');
});
