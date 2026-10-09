'use strict';

const $ = (id) => document.getElementById(id);

const toast = (msg, type = '') => {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2800);
};

const formatDateFR = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const sharePDF = async (doc, fileName, title, text) => {
  try {
    const blob = doc.output('blob');
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      toast('Rapport partagé', 'success');
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') { toast('Partage annulé'); return; }
    console.warn('share failed', err);
  }
  doc.save(fileName);
  toast('Partage indisponible — PDF téléchargé', 'success');
};

const LOGO_SVG_DATAURL = () => new Promise((res) => {
  fetch('logo.svg').then(r => r.text()).then((svg) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 200;
      canvas.getContext('2d').drawImage(img, 0, 0, 200, 200);
      URL.revokeObjectURL(url);
      res(canvas.toDataURL('image/png'));
    };
    img.onerror = () => res(null);
    img.src = url;
  }).catch(() => res(null));
});

// =============================================================================
// STATE
// =============================================================================
const STORAGE_KEY = 'chantier_v1';
const state = { meteo: '' };

const TACHES = ['Marquages', 'Rabotage', 'Terrassement', 'Boisages', 'Pose de tubes', 'Remblai', 'Réfection provisoire', 'Enrobé définitif', 'Récolement'];
const UNITES = ['ml', 'm²', 'm³', 'u', '%'];
const STATUTS = [
  { val: 'a_faire', label: 'À faire', emoji: '⚪' },
  { val: 'en_cours', label: 'En cours', emoji: '🟠' },
  { val: 'termine', label: 'Terminé', emoji: '🟢' },
];

const COMPAGNONS = [
  'AHMADZAI Khalid (conducteur)',
  'AHMADZAI Ishfaq',
  'AHMADZAI Janzeeb',
  'BEYAZIT Hiyasettin',
  'FAQIRI Esmatullah',
  'HAZARBOZ Wahab (conducteur)',
  'KHAN Musaa',
  'KOCHAI Tayyab',
  'WALIZADA Wahidullah',
];

// =============================================================================
// ENGINS (matériel)
// =============================================================================
const enginTemplate = () => `
  <div class="row-item">
    <input type="text" class="f-nom" placeholder="Ex : Pelle 8T, camion benne" />
    <input type="text" class="f-heures" placeholder="Heures" />
    <button type="button" class="btn-remove" data-remove>✕</button>
  </div>`;

const addEngin = (data = {}) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = enginTemplate().trim();
  const row = wrap.firstChild;
  if (data.nom) row.querySelector('.f-nom').value = data.nom;
  if (data.heures) row.querySelector('.f-heures').value = data.heures;
  $('engins').appendChild(row);
};

document.querySelector('[data-add="engin"]').addEventListener('click', () => { addEngin(); persist(); });

document.querySelectorAll('.weather-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.weather-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.meteo = btn.dataset.val;
    persist();
  });
});

// =============================================================================
// POINTAGE ÉQUIPES
// =============================================================================
const compOptions = () => `<option value=""></option>` +
  COMPAGNONS.map(n => `<option value="${n}">${n}</option>`).join('') +
  `<option value="__autre__">+ Autre (saisie libre)</option>`;

const membreTemplate = () => `
  <div class="row-item membre-row">
    <select class="m-nom">${compOptions()}</select>
    <input type="text" class="m-libre" placeholder="Nom libre" style="display:none" />
    <input type="number" class="m-heures" placeholder="Heures" step="0.25" inputmode="decimal" />
    <button type="button" class="btn-remove" data-remove>✕</button>
  </div>`;

const equipeTemplate = () => `
  <div class="equipe-block" data-equipe>
    <div class="equipe-head">
      <input type="text" class="eq-nom" placeholder="Nom de l'équipe (ex: Équipe VRD, Soudure...)" />
      <button type="button" class="btn-remove" data-remove-equipe title="Supprimer l'équipe">✕</button>
    </div>
    <div class="membres row-list"></div>
    <button type="button" class="btn-add btn-add-membre">+ Ajouter un membre</button>
  </div>`;

const addMembre = (equipeEl, data = {}) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = membreTemplate().trim();
  const row = wrap.firstChild;
  const sel = row.querySelector('.m-nom');
  const libre = row.querySelector('.m-libre');
  if (data.nom) {
    if (COMPAGNONS.includes(data.nom)) {
      sel.value = data.nom;
    } else {
      sel.value = '__autre__';
      libre.style.display = '';
      libre.value = data.nom;
    }
  }
  if (data.heures) row.querySelector('.m-heures').value = data.heures;

  sel.addEventListener('change', () => {
    if (sel.value === '__autre__') {
      libre.style.display = '';
      libre.focus();
    } else {
      libre.style.display = 'none';
      libre.value = '';
    }
    persist();
  });

  equipeEl.querySelector('.membres').appendChild(row);
};

const addEquipe = (data = {}) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = equipeTemplate().trim();
  const block = wrap.firstChild;
  if (data.nom) block.querySelector('.eq-nom').value = data.nom;
  $('equipes').appendChild(block);
  (data.membres && data.membres.length ? data.membres : [{}]).forEach(m => addMembre(block, m));

  block.querySelector('.btn-add-membre').addEventListener('click', () => {
    addMembre(block);
    persist();
  });
  block.querySelector('[data-remove-equipe]').addEventListener('click', () => {
    if (!confirm("Supprimer cette équipe ?")) return;
    block.remove();
    persist();
  });
};

$('eq-add').addEventListener('click', () => { addEquipe(); persist(); });

// Auto-remplissage : quand on tape sur les heures du PREMIER membre,
// recopie la valeur sur les autres membres de la même équipe dont le champ heures est vide.
document.addEventListener('input', (e) => {
  if (!e.target.matches('.m-heures')) return;
  const row = e.target.closest('.membre-row');
  const membres = row.parentElement.querySelectorAll('.membre-row');
  if (membres[0] !== row) return;
  const val = e.target.value;
  for (let i = 1; i < membres.length; i++) {
    const h = membres[i].querySelector('.m-heures');
    if (!h.value) h.value = val;
  }
});

// =============================================================================
// AVANCEMENT (rues × tâches)
// =============================================================================
const tacheTemplate = () => `
  <div class="row-item av-row">
    <select class="a-tache">${TACHES.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
    <select class="a-statut">${STATUTS.map(s => `<option value="${s.val}">${s.emoji} ${s.label}</option>`).join('')}</select>
    <input type="number" class="a-prev" placeholder="Prévu" step="any" />
    <input type="number" class="a-real" placeholder="Réalisé" step="any" />
    <select class="a-unit">${UNITES.map(u => `<option value="${u}">${u}</option>`).join('')}</select>
    <button type="button" class="btn-remove" data-remove>✕</button>
  </div>`;

const rueTemplate = () => `
  <div class="rue-block" data-rue>
    <div class="rue-head">
      <input type="text" class="r-nom" placeholder="Rue / tronçon (ex: Rue Turin, Imp. Guisot...)" />
      <button type="button" class="btn-remove" data-remove-rue title="Supprimer la rue">✕</button>
    </div>
    <div class="taches row-list"></div>
    <button type="button" class="btn-add btn-add-tache">+ Ajouter une tâche</button>
  </div>`;

const addTacheToRue = (rueEl, data = {}) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = tacheTemplate().trim();
  const row = wrap.firstChild;
  if (data.tache) row.querySelector('.a-tache').value = data.tache;
  if (data.statut) row.querySelector('.a-statut').value = data.statut;
  if (data.prev) row.querySelector('.a-prev').value = data.prev;
  if (data.real) row.querySelector('.a-real').value = data.real;
  if (data.unit) row.querySelector('.a-unit').value = data.unit;
  rueEl.querySelector('.taches').appendChild(row);
};

const addRue = (data = {}) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = rueTemplate().trim();
  const block = wrap.firstChild;
  if (data.nom) block.querySelector('.r-nom').value = data.nom;
  $('av-rues').appendChild(block);
  (data.taches && data.taches.length ? data.taches : [{}]).forEach(t => addTacheToRue(block, t));

  block.querySelector('.btn-add-tache').addEventListener('click', () => {
    addTacheToRue(block);
    updateRecap();
    persist();
  });
  block.querySelector('[data-remove-rue]').addEventListener('click', () => {
    if (!confirm("Supprimer cette rue et ses tâches ?")) return;
    block.remove();
    updateRecap();
    persist();
  });
};

$('av-add-rue').addEventListener('click', () => { addRue(); updateRecap(); persist(); });

document.addEventListener('click', (e) => {
  if (!e.target.matches('[data-remove]')) return;
  e.target.closest('.row-item').remove();
  updateRecap();
  persist();
});

const updateRecap = () => {
  const recap = $('av-recap');
  const taches = collectTaches();
  if (!taches.length) {
    recap.innerHTML = '<p class="hint">Ajoute des tâches ci-dessus pour voir le récap.</p>';
    return;
  }
  const byTache = {};
  taches.forEach(t => {
    const key = `${t.tache} (${t.unit})`;
    if (!byTache[key]) byTache[key] = { prev: 0, real: 0 };
    byTache[key].prev += parseFloat(t.prev) || 0;
    byTache[key].real += parseFloat(t.real) || 0;
  });
  recap.innerHTML = Object.entries(byTache).map(([k, v]) => {
    const pct = v.prev ? Math.min(100, Math.round(v.real / v.prev * 100)) : 0;
    return `
      <div class="recap-item">
        <div class="recap-title">${k}</div>
        <div class="recap-bar"><div class="recap-fill" style="width:${pct}%"></div></div>
        <div class="recap-nums">${v.real.toFixed(1)} / ${v.prev.toFixed(1)} <span class="recap-pct">${pct}%</span></div>
      </div>`;
  }).join('');
};

// =============================================================================
// COLLECT / PERSIST / RESTORE
// =============================================================================
const collectEngins = () => [...document.querySelectorAll('#engins .row-item')].map(r => ({
  nom: r.querySelector('.f-nom').value.trim(),
  heures: r.querySelector('.f-heures').value.trim(),
})).filter(e => e.nom);

const collectEquipes = () => [...document.querySelectorAll('#equipes .equipe-block')].map(eq => ({
  nom: eq.querySelector('.eq-nom').value.trim(),
  membres: [...eq.querySelectorAll('.membre-row')].map(r => {
    const sel = r.querySelector('.m-nom').value;
    const libre = r.querySelector('.m-libre').value.trim();
    const nom = (sel === '__autre__') ? libre : sel;
    return { nom, heures: r.querySelector('.m-heures').value };
  }).filter(m => m.nom),
})).filter(e => e.nom || e.membres.length);

const collectTaches = () => {
  const out = [];
  document.querySelectorAll('#av-rues .rue-block').forEach(block => {
    const rue = block.querySelector('.r-nom').value.trim();
    if (!rue) return;
    block.querySelectorAll('.av-row').forEach(r => {
      out.push({
        rue,
        tache: r.querySelector('.a-tache').value,
        statut: r.querySelector('.a-statut').value,
        prev: r.querySelector('.a-prev').value,
        real: r.querySelector('.a-real').value,
        unit: r.querySelector('.a-unit').value,
      });
    });
  });
  return out;
};

const collectData = () => ({
  date: $('date').value,
  chantier: $('chantier').value.trim(),
  localisation: $('localisation').value.trim(),
  redacteur: $('redacteur').value.trim(),
  meteo: state.meteo,
  engins: collectEngins(),
  equipes: collectEquipes(),
  taches: collectTaches(),
});

const persist = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData())); } catch (e) {}
};

const restore = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const d = raw ? JSON.parse(raw) : {};
    $('date').value = d.date || new Date().toISOString().slice(0, 10);
    $('chantier').value = d.chantier || '';
    $('localisation').value = d.localisation || '';
    $('redacteur').value = d.redacteur || '';
    if (d.meteo) {
      const btn = document.querySelector(`.weather-btn[data-val="${d.meteo}"]`);
      if (btn) { btn.classList.add('active'); state.meteo = d.meteo; }
    }
    $('engins').innerHTML = '';
    (d.engins && d.engins.length ? d.engins : [{}]).forEach(addEngin);
    $('equipes').innerHTML = '';
    (d.equipes && d.equipes.length ? d.equipes : [{}]).forEach(addEquipe);
    // Grouper les taches par rue pour restaurer dans la nouvelle structure
    $('av-rues').innerHTML = '';
    const rues = {};
    (d.taches || []).forEach(t => {
      const key = t.rue || '(sans rue)';
      if (!rues[key]) rues[key] = [];
      rues[key].push(t);
    });
    const ruesArr = Object.entries(rues).map(([nom, taches]) => ({ nom, taches }));
    (ruesArr.length ? ruesArr : [{}]).forEach(addRue);
    updateRecap();
  } catch (e) { console.warn('restore fail', e); }
};

$('form').addEventListener('input', () => { updateRecap(); persist(); });
$('form').addEventListener('change', () => { updateRecap(); persist(); });

restore();

// =============================================================================
// PDF (rapport + avancement combinés)
// =============================================================================
const buildPDF = async (d) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = M;

  doc.setFillColor(30, 41, 59).rect(0, 0, W, 28, 'F');
  const logo = await LOGO_SVG_DATAURL();
  if (logo) doc.addImage(logo, 'PNG', M, 4, 20, 20);
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(16);
  doc.text('RAPPORT CHANTIER FCTP', M + 25, 14);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(d.chantier || '—', M + 25, 21);
  doc.setFontSize(9);
  doc.text(formatDateFR(d.date), W - M, 14, { align: 'right' });

  y = 36;
  doc.setTextColor(30, 41, 59);
  doc.autoTable({
    startY: y, theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32, textColor: [100, 116, 139] },
      1: { cellWidth: 60 },
      2: { fontStyle: 'bold', cellWidth: 32, textColor: [100, 116, 139] },
      3: { cellWidth: 'auto' },
    },
    body: [
      ['Chantier', d.chantier || '—', 'Rédigé par', d.redacteur || '—'],
      ['Localisation', d.localisation || '—', 'Date', formatDateFR(d.date) || '—'],
    ],
  });
  y = doc.lastAutoTable.finalY + 4;

  const addTitle = (txt) => {
    if (y > H - 30) { doc.addPage(); y = M; }
    doc.setFillColor(249, 115, 22).rect(M, y, 3, 6, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(194, 65, 12);
    doc.text(txt.toUpperCase(), M + 6, y + 4.5);
    y += 8;
    doc.setTextColor(30, 41, 59).setFont('helvetica', 'normal').setFontSize(9);
  };

  if (d.meteo) {
    addTitle('Météo');
    doc.text(d.meteo, M, y); y += 6;
  }

  if (d.engins.length) {
    addTitle('Matériel présent');
    doc.autoTable({
      startY: y,
      head: [['Engin / matériel', 'Heures']],
      body: d.engins.map(e => [e.nom, e.heures]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  if (d.equipes && d.equipes.length) {
    addTitle('Pointage équipes');
    d.equipes.forEach((eq) => {
      if (y > H - 30) { doc.addPage(); y = M; }
      const totalH = eq.membres.reduce((s, m) => s + (parseFloat(m.heures) || 0), 0);
      doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(30, 41, 59);
      doc.text(`${eq.nom || 'Équipe sans nom'}  —  ${eq.membres.length} personne(s)  —  ${totalH.toFixed(2)} h total`, M, y);
      y += 3;
      doc.autoTable({
        startY: y,
        head: [['Nom', 'Heures']],
        body: eq.membres.map(m => [m.nom, m.heures || '0']),
        styles: { fontSize: 9, cellPadding: 1.8 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        columnStyles: { 1: { halign: 'center', cellWidth: 25 } },
        margin: { left: M, right: M },
      });
      y = doc.lastAutoTable.finalY + 4;
    });
  }

  if (d.taches.length) {
    if (y > H - 50) { doc.addPage(); y = M; }
    addTitle('Avancement — détail');
    doc.autoTable({
      startY: y,
      head: [['Rue / tronçon', 'Tâche', 'Statut', 'Prévu', 'Réalisé', 'Unité', '%']],
      body: d.taches.map(t => {
        const pct = parseFloat(t.prev) ? Math.round((parseFloat(t.real) || 0) / parseFloat(t.prev) * 100) : 0;
        const s = STATUTS.find(x => x.val === t.statut) || STATUTS[0];
        return [t.rue, t.tache, `${s.emoji} ${s.label}`, t.prev, t.real, t.unit, pct + '%'];
      }),
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 6;

    const byTache = {};
    d.taches.forEach(t => {
      const key = `${t.tache}|${t.unit}`;
      if (!byTache[key]) byTache[key] = { tache: t.tache, unit: t.unit, prev: 0, real: 0 };
      byTache[key].prev += parseFloat(t.prev) || 0;
      byTache[key].real += parseFloat(t.real) || 0;
    });
    const recapRows = Object.values(byTache).map(v => [
      v.tache, v.unit, v.prev.toFixed(1), v.real.toFixed(1),
      (v.prev ? Math.round(v.real / v.prev * 100) : 0) + '%',
    ]);
    if (recapRows.length) {
      if (y > H - 40) { doc.addPage(); y = M; }
      doc.setFillColor(249, 115, 22).rect(M, y, 3, 6, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(194, 65, 12);
      doc.text('AVANCEMENT — RÉCAP', M + 6, y + 4.5);
      doc.autoTable({
        startY: y + 8,
        head: [['Tâche', 'Unité', 'Prévu', 'Réalisé', 'Avancement']],
        body: recapRows,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [249, 115, 22], textColor: 255 },
        margin: { left: M, right: M },
      });
    }
  }

  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(8).setTextColor(148, 163, 184);
    doc.text(`Page ${p} / ${total}`, W - M, H - 6, { align: 'right' });
    doc.text('Rapport Chantier — généré le ' + new Date().toLocaleString('fr-FR'), M, H - 6);
  }
  return doc;
};

// =============================================================================
// ACTIONS
// =============================================================================
$('btnShare').addEventListener('click', async () => {
  const d = collectData();
  if (!d.chantier || !d.date) { toast('Renseigne au minimum le chantier et la date', 'error'); return; }
  toast('Génération du PDF...');
  try {
    const doc = await buildPDF(d);
    const dateStr = d.date || new Date().toISOString().slice(0, 10);
    const cleanChantier = (d.chantier || 'chantier').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    const fileName = `Rapport_${cleanChantier}_${dateStr}.pdf`;
    const title = `Rapport ${d.chantier} — ${formatDateFR(d.date)}`;
    const text = `Rapport chantier ${d.chantier} du ${formatDateFR(d.date)}.`;
    await sharePDF(doc, fileName, title, text);
  } catch (err) { console.error(err); toast('Erreur PDF', 'error'); }
});

$('btnXlsx').addEventListener('click', () => {
  const d = collectData();
  if (!d.taches.length && !(d.equipes && d.equipes.length)) {
    toast('Aucune tâche ni pointage saisi', 'error'); return;
  }
  const detail = [
    ['SUIVI AVANCEMENT'],
    ['Chantier', d.chantier, 'Date', formatDateFR(d.date)],
    [],
    ['Rue / tronçon', 'Tâche', 'Statut', 'Qté prévue', 'Qté réalisée', 'Unité', 'Avancement %'],
    ...d.taches.map(t => {
      const pct = parseFloat(t.prev) ? Math.round((parseFloat(t.real) || 0) / parseFloat(t.prev) * 100) : 0;
      const statutLabel = (STATUTS.find(s => s.val === t.statut) || {}).label || '';
      return [t.rue, t.tache, statutLabel, parseFloat(t.prev) || 0, parseFloat(t.real) || 0, t.unit, pct + '%'];
    }),
  ];
  const wsDetail = XLSX.utils.aoa_to_sheet(detail);
  wsDetail['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }];

  const byTache = {};
  d.taches.forEach(t => {
    const key = `${t.tache}|${t.unit}`;
    if (!byTache[key]) byTache[key] = { tache: t.tache, unit: t.unit, prev: 0, real: 0 };
    byTache[key].prev += parseFloat(t.prev) || 0;
    byTache[key].real += parseFloat(t.real) || 0;
  });
  const recapRows = [
    ['RÉCAP PAR TÂCHE'], [],
    ['Tâche', 'Unité', 'Qté prévue', 'Qté réalisée', 'Avancement %'],
    ...Object.values(byTache).map(v => [
      v.tache, v.unit, +v.prev.toFixed(2), +v.real.toFixed(2),
      (v.prev ? Math.round(v.real / v.prev * 100) : 0) + '%',
    ]),
  ];
  const wsRecap = XLSX.utils.aoa_to_sheet(recapRows);
  wsRecap['!cols'] = [{ wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  if (d.taches.length) {
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Détail');
    XLSX.utils.book_append_sheet(wb, wsRecap, 'Récap');
  }

  if (d.equipes && d.equipes.length) {
    const ptgRows = [
      ['POINTAGE ÉQUIPES'],
      ['Chantier', d.chantier, 'Date', formatDateFR(d.date)],
      [],
      ['Équipe', 'Nom', 'Heures'],
    ];
    let grandTotal = 0;
    d.equipes.forEach(eq => {
      let totalEq = 0;
      eq.membres.forEach(m => {
        const h = parseFloat(m.heures) || 0;
        totalEq += h; grandTotal += h;
        ptgRows.push([eq.nom || '(sans nom)', m.nom, h]);
      });
      ptgRows.push(['', `Total ${eq.nom || ''}`, totalEq]);
      ptgRows.push([]);
    });
    ptgRows.push(['', 'TOTAL GÉNÉRAL', grandTotal]);
    const wsPtg = XLSX.utils.aoa_to_sheet(ptgRows);
    wsPtg['!cols'] = [{ wch: 22 }, { wch: 30 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsPtg, 'Pointage');
  }

  const chan = (d.chantier || 'chantier').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 30);
  const dt = d.date || new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Avancement_${chan}_${dt}.xlsx`);
  toast('Fichier Excel téléchargé', 'success');
});

$('btnReset').addEventListener('click', () => {
  if (!confirm('Effacer toutes les données saisies ?')) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

// =============================================================================
// SERVICE WORKER
// =============================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
