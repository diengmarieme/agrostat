// dashboard.js — Interface client AgroStat
let allMesures = [], allCapteurs = [], allParcelles = [];
let charts = {}, tabPage = 1;
const PG = 12;
let chartMode = 'all';

// ── ALERTES INTELLIGENTES ──
function analyser(m) {
  const v = m.valeur, t = m.type, res = [];
  if (t === 'temperature') {
    if (v >= 38) res.push({sev:'crit', titre:'Température critique', msg:`${v}°C — stress thermique grave pour les cultures.`, reco:'💧 Irriguer immédiatement. Voile d\'ombrage recommandé.'});
    else if (v >= 34) res.push({sev:'warn', titre:'Température élevée', msg:`${v}°C — photosynthèse impactée.`, reco:'🌊 Augmenter la fréquence d\'irrigation.'});
    else if (v <= 16) res.push({sev:'warn', titre:'Température basse', msg:`${v}°C — risque de gel des cultures.`, reco:'🌿 Protéger les jeunes pousses.'});
  }
  if (t === 'humidite') {
    if (v < 25) res.push({sev:'crit', titre:'Sécheresse critique', msg:`${v}% — flétrissement imminent des plantes.`, reco:'🚿 Irrigation d\'urgence nécessaire !'});
    else if (v < 35) res.push({sev:'warn', titre:'Humidité faible → irrigation recommandée', msg:`${v}% — sol sec, plantes en stress hydrique.`, reco:'💦 Programmer une irrigation dans les 6 heures.'});
    else if (v > 90) res.push({sev:'warn', titre:'Humidité excessive', msg:`${v}% — risque élevé de maladies fongiques.`, reco:'🍄 Stopper l\'irrigation. Vérifier le drainage.'});
  }
  if (t === 'ph_sol') {
    if (v < 5.5) res.push({sev:'crit', titre:'Sol très acide', msg:`pH ${v} — absorption des nutriments bloquée.`, reco:'🪨 Apport de chaux agricole recommandé (500 kg/ha).'});
    else if (v < 6.2) res.push({sev:'info', titre:'Sol légèrement acide', msg:`pH ${v} — surveiller l\'évolution.`, reco:'🔬 Amendement calcaire léger conseillé.'});
    else if (v > 8.0) res.push({sev:'crit', titre:'Sol très alcalin', msg:`pH ${v} — carence en fer et manganèse.`, reco:'🧴 Apport de soufre ou engrais acidifiant.'});
    else if (v > 7.5) res.push({sev:'warn', titre:'Sol légèrement alcalin', msg:`pH ${v} — réduire apports calcaires.`, reco:'📊 Ajuster les fertilisants.'});
  }
  return res;
}

function getBulletin(mT, mH, mP) {
  const li = [];
  if (mT >= 38)      li.push(['🌡️', `Chaleur intense (${mT.toFixed(1)}°C) — stress thermique actif`]);
  else if (mT >= 34) li.push(['☀️', `Températures chaudes (${mT.toFixed(1)}°C) — surveiller`]);
  else if (mT >= 20) li.push(['✅', `Température optimale (${mT.toFixed(1)}°C) — conditions favorables`]);
  else               li.push(['❄️', `Températures fraîches (${mT.toFixed(1)}°C) — protéger les cultures`]);
  if (mH < 30)       li.push(['🏜️', `Sol très sec (${mH.toFixed(0)}%) — irrigation urgente`]);
  else if (mH < 50)  li.push(['💧', `Humidité modérée (${mH.toFixed(0)}%) — surveiller l'arrosage`]);
  else if (mH <= 80) li.push(['✅', `Humidité optimale (${mH.toFixed(0)}%) — bonnes conditions`]);
  else               li.push(['🌊', `Sol trop humide (${mH.toFixed(0)}%) — risque fongique`]);
  if (mP < 5.5)      li.push(['⚗️', `Sol très acide (pH ${mP.toFixed(1)}) — amendement urgent`]);
  else if (mP < 6.2) li.push(['🪨', `Sol légèrement acide (pH ${mP.toFixed(1)}) — à surveiller`]);
  else if (mP <= 7.2)li.push(['✅', `pH optimal (${mP.toFixed(1)}) — bonne disponibilité nutriments`]);
  else               li.push(['🧂', `Sol alcalin (pH ${mP.toFixed(1)}) — réduire apports calcaires`]);
  return li;
}

// ── CHARGEMENT PRINCIPAL ──
async function chargerDashboard() {
  try {
    const [mesures, moyennes] = await Promise.all([
      apiGet('/mesures'),
      apiGet('/temperature_moyenne')
    ]);
    if (!mesures) return;
    allMesures = mesures;

    const lT = mesures.find(m => m.type === 'temperature');
    const lH = mesures.find(m => m.type === 'humidite');
    const lP = mesures.find(m => m.type === 'ph_sol');
    const anoms = mesures.filter(m => m.type === 'humidite' && m.valeur < 30);

    // KPI
    set('kpi-temp', lT ? lT.valeur + '°C' : '--');
    set('kpi-hum',  lH ? lH.valeur + '%'  : '--');
    set('kpi-ph',   lP ? lP.valeur         : '--');
    set('kpi-anom', anoms.length);
    set('nav-badge-alertes', anoms.length);

    // Header pills
    set('hp-temp', lT ? '🌡️ ' + lT.valeur + '°C' : '--');
    set('hp-hum',  lH ? '💧 ' + lH.valeur + '%'  : '--');
    set('hp-ph',   lP ? '🧪 ' + lP.valeur         : '--');
    set('hp-anom', '⚠️ ' + anoms.length + ' alerte(s)');

    // Hints KPI
    const hintT = document.getElementById('hint-temp');
    if (hintT && lT) { hintT.textContent = lT.valeur >= 34 ? '⚠ Surveiller' : '✓ Normal'; hintT.className = 'kpi-hint ' + (lT.valeur >= 34 ? 'warn' : 'good'); }
    const hintH = document.getElementById('hint-hum');
    if (hintH && lH) { hintH.textContent = lH.valeur < 30 ? '⚠ Irrigation urgente' : lH.valeur < 50 ? '⚠ Surveiller' : '✓ Optimal'; hintH.className = 'kpi-hint ' + (lH.valeur < 30 ? 'bad' : lH.valeur < 50 ? 'warn' : 'good'); }
    const hintP = document.getElementById('hint-ph');
    if (hintP && lP) { hintP.textContent = (lP.valeur < 5.5 || lP.valeur > 8) ? '⚠ Correction urgente' : '✓ pH optimal'; hintP.className = 'kpi-hint ' + ((lP.valeur < 5.5 || lP.valeur > 8) ? 'bad' : 'good'); }
    set('hint-anom', anoms.length > 0 ? anoms.length + ' humidité(s) < 30%' : '✓ Aucune anomalie');
    document.getElementById('hint-anom').className = 'kpi-hint ' + (anoms.length > 0 ? 'bad' : 'good');

    // Graphique
    dessinerGraphique(mesures, chartMode);

    // Recommandations
    const avg = t => { const v = mesures.filter(m => m.type === t).map(m => m.valeur); return v.length ? v.reduce((a,b)=>a+b)/v.length : null; };
    const mT = avg('temperature'), mH = avg('humidite'), mP = avg('ph_sol');
    if (mT && mH && mP) {
      const bull = getBulletin(mT, mH, mP);
      document.getElementById('reco-list').innerHTML = bull.map(([ico,txt]) =>
        `<div class="stat-row"><span class="stat-label">${ico} ${txt}</span></div>`
      ).join('');
    }

    // Moyennes 24h
    if (moyennes && moyennes.length) {
      document.getElementById('moyennes-list').innerHTML = moyennes.map(m =>
        `<div class="stat-row"><span class="stat-label">🌾 ${m.parcelle}</span><span class="stat-val">${m.moyenne_temperature}°C <span style="font-size:10px;color:var(--gray-400)">(${m.nb_mesures} mes.)</span></span></div>`
      ).join('');
    }

    addLog(`${mesures.length} mesures chargées`);
  } catch(e) { addLog('Erreur dashboard: ' + e.message); }
}

function filtreChart(mode, el) {
  chartMode = mode;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  dessinerGraphique(allMesures, mode);
}

function dessinerGraphique(mesures, mode) {
  const ctx = document.getElementById('chart-main');
  if (!ctx) return;
  if (charts.main) charts.main.destroy();
  const temps  = mesures.filter(m => m.type === 'temperature').slice(0,24).reverse();
  const humids = mesures.filter(m => m.type === 'humidite').slice(0,24).reverse();
  const phs    = mesures.filter(m => m.type === 'ph_sol').slice(0,24).reverse();
  const labels = (temps.length ? temps : humids).map(m => fmtDate(m.timestamp).slice(6,14));
  const ds = [];
  if (mode === 'all' || mode === 'temperature') ds.push({label:'Temp. (°C)', data:temps.map(m=>m.valeur), borderColor:'#f97316', backgroundColor:'rgba(249,115,22,.08)', tension:.4, fill:true, pointRadius:2});
  if (mode === 'all' || mode === 'humidite')    ds.push({label:'Humid. (%)', data:humids.map(m=>m.valeur), borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,.08)', tension:.4, fill:true, pointRadius:2});
  if (mode === 'all') ds.push({label:'pH Sol', data:phs.map(m=>m.valeur), borderColor:'#10b981', backgroundColor:'rgba(16,185,129,.06)', tension:.4, fill:true, pointRadius:2});
  charts.main = new Chart(ctx, {
    type:'line', data:{labels, datasets:ds},
    options:{responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:12,padding:16}}},
      scales:{x:{grid:{color:'#f1f5f9'},ticks:{font:{size:10}}}, y:{grid:{color:'#f1f5f9'},min:0}}}
  });
}

// ── ALERTES ──
async function chargerAlertes() {
  try {
    const mesures = await apiGet('/mesures');
    if (!mesures) return;
    const toutes = [];
    mesures.forEach(m => analyser(m).forEach(a => toutes.push({...a, m})));
    const crit = toutes.filter(a=>a.sev==='crit').length;
    const warn = toutes.filter(a=>a.sev==='warn').length;
    const ok   = mesures.length - toutes.length;
    set('as-crit', crit); set('as-warn', warn); set('as-ok', Math.max(0,ok));
    set('nav-badge-alertes', crit + warn);
    const el = document.getElementById('alertes-detail');
    if (!toutes.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">Aucune alerte</div><div class="empty-sub">Toutes vos parcelles sont en bonne santé</div></div>'; return; }
    toutes.sort((a,b) => ({crit:0,warn:1,info:2}[a.sev] - {crit:0,warn:1,info:2}[b.sev]));
    el.innerHTML = toutes.slice(0,30).map(a => `
      <div class="alert-item ${a.sev}">
        <div class="ai-row"><span class="ai-title">${a.titre}</span>
          <span class="ai-sev sev-${a.sev}">${a.sev==='crit'?'CRITIQUE':a.sev==='warn'?'ATTENTION':'INFO'}</span></div>
        <div class="ai-meta">Capteur ${a.m.capteur_id} · ${a.m.parcelle||'—'} · ${fmtDate(a.m.timestamp)}</div>
        <div class="ai-msg">${a.msg}</div>
        <div class="ai-reco">💡 ${a.reco}</div>
      </div>`).join('');
    addLog(`${toutes.length} alertes analysées`);
  } catch(e) { addLog('Erreur alertes: ' + e.message); }
}

// ── MESURES ──
function filtrerTab() {
  const t = document.getElementById('f-type')?.value || '';
  const p = document.getElementById('f-parcelle')?.value || '';
  const filtered = allMesures.filter(m => (!t || m.type===t) && (!p || m.parcelle===p));
  tabPage = 1; rendreTableauMesures(filtered);
}

function rendreTableauMesures(mesures) {
  const total = mesures.length, pages = Math.ceil(total/PG);
  const slice = mesures.slice((tabPage-1)*PG, tabPage*PG);
  const wrap = document.getElementById('mesures-tbl');
  const badges = {temperature:'<span class="type-pill tp-temp">🌡️ Temp.</span>', humidite:'<span class="type-pill tp-hum">💧 Humid.</span>', ph_sol:'<span class="type-pill tp-ph">🧪 pH Sol</span>'};
  const etat = m => { const al=analyser(m); if(!al.length)return'<span class="status-ok">✓ Normal</span>'; return al[0].sev==='crit'?'<span class="status-crit">⚠ Critique</span>':'<span class="status-warn">⚠ Attention</span>'; };
  if (!slice.length) { wrap.innerHTML='<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">Aucune mesure</div></div>'; document.getElementById('mesures-pag').innerHTML=''; return; }
  wrap.innerHTML = `<table class="tbl"><thead><tr><th>Capteur</th><th>Type</th><th>Parcelle</th><th>Valeur</th><th>Date & Heure</th><th>État</th></tr></thead><tbody>${
    slice.map(m=>`<tr class="${m.type==='humidite'&&m.valeur<30?'row-anom':''}"><td><strong>${m.capteur_id}</strong></td><td>${badges[m.type]||m.type}</td><td>${m.parcelle||'—'}</td><td><strong style="color:${m.type==='humidite'&&m.valeur<30?'var(--red-500)':'var(--gray-900)'}">${m.valeur} ${m.unite}</strong></td><td style="font-size:11.5px">${fmtDate(m.timestamp)}</td><td>${etat(m)}</td></tr>`).join('')
  }</tbody></table>`;
  // Pagination
  if (pages <= 1) { document.getElementById('mesures-pag').innerHTML=''; return; }
  let h = `<div class="pag"><button class="pg" onclick="chPage(${tabPage-1})" ${tabPage===1?'disabled':''}>‹</button>`;
  for (let i=1;i<=Math.min(pages,8);i++) h+=`<button class="pg ${i===tabPage?'active':''}" onclick="chPage(${i})">${i}</button>`;
  if (pages>8) h+=`<span class="pg-info">...${pages}</span>`;
  h+=`<button class="pg" onclick="chPage(${tabPage+1})" ${tabPage===pages?'disabled':''}>›</button><span class="pg-info">${total} mesures</span></div>`;
  document.getElementById('mesures-pag').innerHTML = h;
}

function chPage(p) {
  const t = document.getElementById('f-type')?.value||'', pa = document.getElementById('f-parcelle')?.value||'';
  const filtered = allMesures.filter(m=>(!t||m.type===t)&&(!pa||m.parcelle===pa));
  if (p<1||p>Math.ceil(filtered.length/PG)) return;
  tabPage=p; rendreTableauMesures(filtered);
}

function chargerMesures() {
  filtrerTab();
  // Peupler filtre parcelles
  const sel = document.getElementById('f-parcelle');
  if (sel && allParcelles.length) {
    const curr = sel.value;
    sel.innerHTML = '<option value="">Toutes les parcelles</option>' + allParcelles.map(p=>`<option value="${p.nom}">${p.nom}</option>`).join('');
    sel.value = curr;
  }
}

// ── EXPORT CSV ──
function exportCSV() {
  if (!allMesures.length) { toast('Aucune mesure à exporter','info'); return; }
  const headers = ['Capteur','Type','Parcelle','Valeur','Unité','Timestamp'];
  const rows = allMesures.map(m => [m.capteur_id,m.type,m.parcelle||'',m.valeur,m.unite,m.timestamp||''].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `agrostat_mesures_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  toast('✅ CSV exporté avec succès','success');
  addLog('Export CSV: ' + allMesures.length + ' mesures');
}

// ── PARCELLES ──
async function chargerParcelles() {
  const data = await apiGet('/parcelles');
  if (!data) return;
  allParcelles = data;
  const grid = document.getElementById('parcelles-grid');
  if (!data.length) { grid.innerHTML='<div class="empty-state"><div class="empty-icon">🌾</div><div class="empty-title">Aucune parcelle</div><div class="empty-sub">Ajoutez votre première parcelle</div></div>'; return; }
  grid.innerHTML = data.map(p => {
    const caps = allCapteurs.filter(c => c.parcelle === p.nom);
    return `<div class="pcard">
      <div class="pcard-header"><div class="pcard-name">🌾 ${p.nom}</div><div class="pcard-loc">📍 ${p.localisation||'Non renseigné'}</div></div>
      <div class="pcard-body">
        <div class="pcard-stat"><span class="pcard-stat-lbl">Superficie</span><span class="pcard-stat-val">${p.superficie||'—'} ha</span></div>
        <div class="pcard-stat"><span class="pcard-stat-lbl">Capteurs</span><span class="pcard-stat-val">${caps.length}</span></div>
        <div class="pcard-stat"><span class="pcard-stat-lbl">Créée le</span><span class="pcard-stat-val">${p.created_at?p.created_at.slice(0,10):'—'}</span></div>
      </div>
      <div class="pcard-footer">
        <button class="btn btn-sm btn-danger" onclick="supprimerParcelle(${p.id},'${p.nom}')">🗑️ Supprimer</button>
      </div>
    </div>`;
  }).join('');
  addLog(`${data.length} parcelles chargées`);
}

function ouvrirModalParcelle() {
  document.getElementById('modal-parcelle').classList.add('open');
  hideErr('mp-err');
}

async function ajouterParcelle() {
  const nom = document.getElementById('mp-nom').value.trim();
  const loc  = document.getElementById('mp-loc').value.trim();
  const sup  = parseFloat(document.getElementById('mp-sup').value) || 1.0;
  hideErr('mp-err');
  if (!nom) { showErr('mp-err','⚠️ Nom de la parcelle requis'); return; }
  const r = await apiPost('/parcelles', {nom, localisation:loc, superficie:sup});
  if (!r) return;
  if (r.erreur) { showErr('mp-err','❌ '+r.erreur); return; }
  toast('✅ Parcelle "'+nom+'" créée !','success');
  fermerModals();
  ['mp-nom','mp-loc','mp-sup'].forEach(id => document.getElementById(id).value='');
  chargerParcelles();
  addLog('Parcelle créée: '+nom);
}

async function supprimerParcelle(id, nom) {
  if (!confirm(`Supprimer la parcelle "${nom}" et tous ses capteurs ?`)) return;
  const r = await apiDelete('/parcelles/'+id);
  if (r && !r.erreur) { toast('✅ Parcelle supprimée','success'); chargerParcelles(); chargerCapteurs(); }
  else toast('❌ '+(r?.erreur||'Erreur'),'error');
}

// ── CAPTEURS ──
async function chargerCapteurs() {
  const data = await apiGet('/capteurs');
  if (!data) return;
  allCapteurs = data;
  const wrap = document.getElementById('capteurs-tbl');
  const sel  = document.getElementById('sel-capteur-evo');
  const selMC= document.getElementById('mc-parcelle');

  if (sel) {
    sel.innerHTML = '<option value="">Choisir un capteur...</option>' + data.map(c=>`<option value="${c.capteur_id}">${c.capteur_id} — ${c.type} (${c.parcelle})</option>`).join('');
  }
  if (selMC && allParcelles.length) {
    selMC.innerHTML = allParcelles.map(p=>`<option value="${p.id}">${p.nom}</option>`).join('');
  }

  if (!wrap) return;
  const badges = {temperature:'<span class="type-pill tp-temp">🌡️ Température</span>', humidite:'<span class="type-pill tp-hum">💧 Humidité</span>', ph_sol:'<span class="type-pill tp-ph">🧪 pH Sol</span>'};
  if (!data.length) { wrap.innerHTML='<div class="empty-state"><div class="empty-icon">📡</div><div class="empty-title">Aucun capteur</div><div class="empty-sub">Ajoutez votre premier capteur IoT</div></div>'; return; }
  wrap.innerHTML = `<table class="tbl"><thead><tr><th>ID Capteur</th><th>Type</th><th>Parcelle</th><th>Statut</th><th>Créé le</th><th>Action</th></tr></thead><tbody>${
    data.map(c=>`<tr><td><code style="background:var(--gray-100);padding:2px 8px;border-radius:4px;font-size:11px">${c.capteur_id}</code></td><td>${badges[c.type]||c.type}</td><td>🌾 ${c.parcelle}</td><td><span class="${c.actif?'status-ok':'status-crit'}">${c.actif?'● Actif':'● Inactif'}</span></td><td style="font-size:11.5px;color:var(--gray-400)">${c.created_at?c.created_at.slice(0,10):'—'}</td><td><button class="btn btn-xs btn-danger" onclick="supprimerCapteur(${c.id},'${c.capteur_id}')">Supprimer</button></td></tr>`).join('')
  }</tbody></table>`;
  addLog(`${data.length} capteurs chargés`);
}

function ouvrirModalCapteur() {
  if (!allParcelles.length) { toast('⚠️ Ajoutez d\'abord une parcelle','info'); return; }
  const selMC = document.getElementById('mc-parcelle');
  selMC.innerHTML = allParcelles.map(p=>`<option value="${p.id}">${p.nom}</option>`).join('');
  document.getElementById('modal-capteur').classList.add('open');
  hideErr('mc-err');
}

async function ajouterCapteur() {
  const cid  = document.getElementById('mc-id').value.trim().toUpperCase().replace(/\s+/g,'_');
  const type = document.getElementById('mc-type').value;
  const pid  = document.getElementById('mc-parcelle').value;
  hideErr('mc-err');
  if (!cid) { showErr('mc-err','⚠️ ID du capteur requis'); return; }
  if (!pid)  { showErr('mc-err','⚠️ Sélectionnez une parcelle'); return; }
  const r = await apiPost('/capteurs', {capteur_id:cid, type, parcelle_id:parseInt(pid)});
  if (!r) return;
  if (r.erreur) { showErr('mc-err','❌ '+r.erreur); return; }
  toast('✅ Capteur "'+cid+'" ajouté ! Simulation démarrée.','success');
  fermerModals();
  ['mc-id'].forEach(id => document.getElementById(id).value='');
  chargerCapteurs();
  addLog('Capteur ajouté: '+cid);
}

async function supprimerCapteur(id, cid) {
  if (!confirm(`Supprimer le capteur "${cid}" ?`)) return;
  const r = await apiDelete('/capteurs/'+id);
  if (r && !r.erreur) { toast('✅ Capteur supprimé','success'); chargerCapteurs(); }
  else toast('❌ '+(r?.erreur||'Erreur'),'error');
}

// ── ÉVOLUTION ──
async function chargerEvolution() {
  const id = document.getElementById('sel-capteur-evo')?.value;
  if (!id) { toast('⚠️ Sélectionnez un capteur','info'); return; }
  const data = await apiGet('/evolution/'+id);
  if (!data || !data.length) { toast('ℹ️ Pas encore de données — attendre 30s','info'); return; }
  const vals = data.map(d=>d.moyenne);
  const bar = document.getElementById('evo-stats');
  bar.style.display = 'flex';
  bar.innerHTML = `
    <div><div class="evo-stat-lbl">Capteur</div><div class="evo-stat-val">${id}</div></div>
    <div><div class="evo-stat-lbl">Nb. heures</div><div class="evo-stat-val">${data.length}</div></div>
    <div><div class="evo-stat-lbl">Moyenne</div><div class="evo-stat-val">${(vals.reduce((a,b)=>a+b)/vals.length).toFixed(2)} ${data[0].unite}</div></div>
    <div><div class="evo-stat-lbl">Min</div><div class="evo-stat-val">${Math.min(...vals).toFixed(2)}</div></div>
    <div><div class="evo-stat-lbl">Max</div><div class="evo-stat-val">${Math.max(...vals).toFixed(2)}</div></div>`;
  const rev = [...data].reverse();
  const ctx = document.getElementById('chart-evo');
  if (charts.evo) charts.evo.destroy();
  charts.evo = new Chart(ctx, {
    type:'bar',
    data:{labels:rev.map(d=>fmtDate(d.heure).slice(0,14)),datasets:[
      {label:`Moy (${data[0].unite})`, data:rev.map(d=>d.moyenne), backgroundColor:'rgba(16,185,129,.6)', borderColor:'#059669', borderWidth:1.5, borderRadius:5},
      {label:'Min', data:rev.map(d=>d.min_valeur), type:'line', borderColor:'#3b82f6', borderDash:[4,4], tension:.4, pointRadius:2, fill:false},
      {label:'Max', data:rev.map(d=>d.max_valeur), type:'line', borderColor:'#ef4444', borderDash:[4,4], tension:.4, pointRadius:2, fill:false}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:12}}},scales:{x:{grid:{display:false},ticks:{font:{size:9}}},y:{grid:{color:'#f1f5f9'}}}}
  });
  addLog(`Évolution ${id}: ${data.length} heures`);
}

// ── PROFIL ──
async function chargerProfil() {
  const user = getUser();
  if (!user) return;
  const initiales = user.nom_complet.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  set('profil-nom', user.nom_complet);
  set('profil-email', user.email);
  set('profil-avatar', initiales);
  document.getElementById('edit-nom').value = user.nom_complet;
  const parc = await apiGet('/parcelles');
  const caps = await apiGet('/capteurs');
  set('profil-nb-parc', parc?.length || 0);
  set('profil-nb-cap',  caps?.length || 0);
}

async function sauvegarderProfil() {
  hideErr('profil-err');
  document.getElementById('profil-ok').style.display='none';
  const nom = document.getElementById('edit-nom').value.trim();
  const pwd = document.getElementById('edit-pwd').value.trim();
  if (!nom) { showErr('profil-err','⚠️ Le nom ne peut pas être vide'); return; }
  const body = {nom_complet: nom};
  if (pwd) { if(pwd.length<6){showErr('profil-err','⚠️ Mot de passe trop court');return;} body.password=pwd; }
  const r = await apiPut('/profil', body);
  if (r && !r.erreur) {
    showOk('profil-ok','✅ Profil mis à jour avec succès');
    const u = getUser(); u.nom_complet = nom; localStorage.setItem('user', JSON.stringify(u));
    set('hdr-nom', nom);
    toast('✅ Profil sauvegardé','success');
  } else showErr('profil-err','❌ '+(r?.erreur||'Erreur'));
}

// ── SECTION LOADERS ──
const sectionLoaders = {
  dashboard: chargerDashboard,
  alertes:   chargerAlertes,
  mesures:   chargerMesures,
  parcelles: chargerParcelles,
  capteurs:  chargerCapteurs,
  evolution: chargerCapteurs,
  profil:    chargerProfil
};

// ── INIT ──
window.addEventListener('DOMContentLoaded', async () => {
  if (!verifierConnexion('client')) return;
  const user = getUser();
  const initiales = user.nom_complet.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  set('hdr-nom',      user.nom_complet);
  set('hdr-initiales',initiales);
  set('hdr-parcelles',user.parcelles?.join(' · ') || '');
  document.getElementById('profil-avatar').textContent = initiales;
  // Sidebar parcelles
  const sb = document.getElementById('sidebar-parcelles-list');
  if (sb && user.parcelles) {
    sb.innerHTML = user.parcelles.map(p=>`<div class="parcelle-chip">🌾 ${p}</div>`).join('');
  }
  startDatetime();
  // Charger tout
  await chargerDashboard();
  const parc = await apiGet('/parcelles');
  if (parc) { allParcelles = parc; }
  await chargerCapteurs();
  // Auto-refresh toutes les 30 secondes
  setInterval(async () => {
    await chargerDashboard();
    const sec = document.querySelector('.section.active');
    if (sec) {
      const name = sec.id.replace('sec-','');
      if (sectionLoaders[name] && name !== 'dashboard') sectionLoaders[name]();
    }
    addLog('Auto-refresh');
  }, 30000);
  addLog('Connecté: ' + user.nom_complet);
});
