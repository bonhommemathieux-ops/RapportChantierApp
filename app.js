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

const formatDateFRLong = (iso) => {
  if (!iso) return '';
  try {
    const dt = new Date(iso + 'T12:00:00');
    return dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return formatDateFR(iso); }
};

const updateDateFr = () => {
  const el = document.getElementById('dateFr');
  if (!el) return;
  const iso = document.getElementById('date').value;
  el.textContent = iso ? '📅 ' + formatDateFRLong(iso) : '';
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

const LOGO_PNG_DATAURL = () => new Promise((res) => {
  const img = new Image();
  img.onload = () => {
    const w = 600;
    const h = Math.round(w * img.height / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    res({ data: canvas.toDataURL('image/png'), ratio: img.width / img.height });
  };
  img.onerror = () => res(null);
  img.src = 'logo.png';
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

const FRONTS_S2 = [
  'S2-01 Rue Montserby',
  'S2-02 Rue de Périole',
  'S2-03 Rue Jean Aicard',
  'S2-04 Avenue Léon Jouhaux',
  'S2-05 Rue Léon Jouhaux',
  'S2-06 Rue St Louis - Noémie Dessale - Jolimont',
  'S2-07 Rue de Jolimont',
  'S2-08 Avenue Léon Blum',
];
const FRONTS_S3 = [
  'S3-01 Avenue de Lyon',
  'S3-02 Avenue de Lyon - Rue Chabanon',
  'S3-03 Rue du Maroc',
  'S3-04 Avenue de Lavaur - Chemin de Michoun',
  'S3-05 Rue du Faubourg Bonnefoy',
  'S3-06 Avenue de Lyon - Pont Matabiau - Bd Bonrepos',
  'S3-07 Impasse Guisot - Turlan',
  'S3-08 Rue de Turin',
  'S3-09 Chemin de Lapujade',
  'S3-10 Chemin de Lapujade - Rue Michel Ange',
  'S3-11 Allée Monsonego Sandler',
  'S3-12 Rue du Maroc - Zone SERNAM',
];
const ALL_FRONTS = [...FRONTS_S2, ...FRONTS_S3];

const MATERIEL = {
  'Terrassement': [
    'Pelle 5T', 'Pelle 8T', 'Pelle 10T', 'Pelle 12T', 'Pelle 15T', 'Pelle 20T',
    'Mini-pelle 1.5T', 'Mini-pelle 2.5T',
    'BRH (brise-roche hydraulique)', 'Marteau piqueur',
    'Chargeuse',
  ],
  'Transport': [
    'Camion 8x4', 'Camion 6x4', 'Camion 4x2', 'Camion benne', 'Camion-grue', 'Polybenne',
    'Dumper (tombereau)', 'Fourgon utilitaire', 'Semi-remorque',
  ],
  'Compactage': [
    'Compacteur monocylindre', 'Compacteur tandem', 'Plaque vibrante', 'Pilonneuse',
  ],
  'Enrobé / Finitions': [
    'Finisseur', 'Rouleau tandem', 'Mini-finisseur',
  ],
  'Divers': [
    'Groupe électrogène', 'Nacelle', 'Carotteuse', 'Scie à sol',
    'Pompe à eau / Pompe immergée', 'Compresseur',
  ],
};
const ALL_MATERIEL = Object.values(MATERIEL).flat();

const buildMaterielOptions = () =>
  '<option value="">— Choisir un engin —</option>' +
  Object.entries(MATERIEL).map(([groupe, items]) =>
    `<optgroup label="${groupe}">${items.map(m => `<option value="${m}">${m}</option>`).join('')}</optgroup>`
  ).join('') +
  '<option value="__autre__">+ Autre (saisie libre)</option>';

const COMPAGNONS = [
  'AHMADZAI Khalid (conducteur)',
  'AHMADZAI Ishfaq',
  'AHMADZAI Janzeeb',
  'BENONI Charli (Adecco intérim)',
  'BEYAZIT Hiyasettin',
  'FAQIRI Esmatullah',
  'HAZARBOZ Wahab (conducteur)',
  'KHAN Musaa',
  'KOCHAI Tayyab',
  'KONE Adama (My Job intérim)',
  'VIALES Cédric (My Job intérim)',
  'WALIZADA Wahidullah',
];

// =============================================================================
// METEO
// =============================================================================
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

const buildFrontOptions = () =>
  '<option value="">— aucun front —</option>' +
  `<optgroup label="Secteur 2">${FRONTS_S2.map(f => `<option value="${f}">${f}</option>`).join('')}</optgroup>` +
  `<optgroup label="Secteur 3">${FRONTS_S3.map(f => `<option value="${f}">${f}</option>`).join('')}</optgroup>` +
  `<option value="__autre__">+ Autre (sous-tronçon spécifique)</option>`;

const equipeTemplate = () => `
  <div class="equipe-block" data-equipe>
    <div class="equipe-head">
      <input type="text" class="eq-nom" placeholder="Nom de l'équipe (ex: Équipe VRD, Soudure...)" />
      <button type="button" class="btn-remove" data-remove-equipe title="Supprimer l'équipe">✕</button>
    </div>
    <div class="equipe-front">
      <label>🚧 Front affecté :</label>
      <select class="eq-front">${buildFrontOptions()}</select>
      <input type="text" class="eq-front-libre" placeholder="Sous-tronçon (saisie libre)" style="display:none" />
    </div>
    <div class="sub-head">👷 Membres & heures</div>
    <div class="membres row-list"></div>
    <button type="button" class="btn-add btn-add-membre">+ Ajouter un membre</button>
    <div class="sub-head">🚜 Matériel sur ce front</div>
    <div class="engins row-list"></div>
    <button type="button" class="btn-add btn-add-engin">+ Ajouter un engin</button>
    <div class="sub-head">🚧 Tâches</div>
    <div class="taches row-list"></div>
    <button type="button" class="btn-add btn-add-tache">+ Ajouter une tâche</button>
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

  // Front : si dans la liste, sélectionne. Si pas dedans, "Autre" + saisie libre.
  const frontSel = block.querySelector('.eq-front');
  const frontLibre = block.querySelector('.eq-front-libre');
  if (data.front) {
    if (ALL_FRONTS.includes(data.front)) {
      frontSel.value = data.front;
    } else {
      frontSel.value = '__autre__';
      frontLibre.style.display = '';
      frontLibre.value = data.front;
    }
  }
  frontSel.addEventListener('change', () => {
    if (frontSel.value === '__autre__') {
      frontLibre.style.display = '';
      frontLibre.focus();
    } else {
      frontLibre.style.display = 'none';
      frontLibre.value = '';
    }
    persist();
  });

  $('equipes').appendChild(block);

  (data.membres && data.membres.length ? data.membres : [{}]).forEach(m => addMembre(block, m));
  (data.engins && data.engins.length ? data.engins : [{}]).forEach(e => addEnginToEquipe(block, e));
  (data.taches && data.taches.length ? data.taches : [{}]).forEach(t => addTacheToEquipe(block, t));

  block.querySelector('.btn-add-membre').addEventListener('click', () => {
    addMembre(block);
    persist();
  });
  block.querySelector('.btn-add-engin').addEventListener('click', () => {
    addEnginToEquipe(block);
    persist();
  });
  block.querySelector('.btn-add-tache').addEventListener('click', () => {
    addTacheToEquipe(block);
    updateRecap();
    persist();
  });
  block.querySelector('[data-remove-equipe]').addEventListener('click', () => {
    if (!confirm("Supprimer cette équipe et tout son contenu (front, membres, matériel, tâches) ?")) return;
    block.remove();
    updateRecap();
    persist();
  });
};

const addEnginToEquipe = (eqBlock, data = {}) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="row-item engin-row">
      <select class="f-select">${buildMaterielOptions()}</select>
      <input type="text" class="f-nom" placeholder="Nom libre" style="display:none" />
      <input type="text" class="f-heures" placeholder="Heures" />
      <button type="button" class="btn-remove" data-remove>✕</button>
    </div>`.trim();
  const row = wrap.firstChild;
  const sel = row.querySelector('.f-select');
  const libre = row.querySelector('.f-nom');

  if (data.nom) {
    if (ALL_MATERIEL.includes(data.nom)) {
      sel.value = data.nom;
      libre.value = data.nom;
    } else {
      sel.value = '__autre__';
      libre.style.display = '';
      libre.value = data.nom;
    }
  }
  if (data.heures) row.querySelector('.f-heures').value = data.heures;

  sel.addEventListener('change', () => {
    if (sel.value === '__autre__') {
      libre.style.display = '';
      libre.value = '';
      libre.focus();
    } else {
      libre.style.display = 'none';
      libre.value = sel.value;
    }
    persist();
  });

  eqBlock.querySelector('.engins').appendChild(row);
};

const addTacheToEquipe = (eqBlock, data = {}) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="row-item av-row">
      <select class="a-tache">${TACHES.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
      <select class="a-statut">${STATUTS.map(s => `<option value="${s.val}">${s.emoji} ${s.label}</option>`).join('')}</select>
      <input type="number" class="a-prev" placeholder="Prévu" step="any" />
      <input type="number" class="a-real" placeholder="Réalisé" step="any" />
      <select class="a-unit">${UNITES.map(u => `<option value="${u}">${u}</option>`).join('')}</select>
      <button type="button" class="btn-remove" data-remove>✕</button>
    </div>`.trim();
  const row = wrap.firstChild;
  if (data.tache) row.querySelector('.a-tache').value = data.tache;
  if (data.statut) row.querySelector('.a-statut').value = data.statut;
  if (data.prev) row.querySelector('.a-prev').value = data.prev;
  if (data.real) row.querySelector('.a-real').value = data.real;
  if (data.unit) row.querySelector('.a-unit').value = data.unit;
  eqBlock.querySelector('.taches').appendChild(row);
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

// (Les fonctions matériel/tâches/front sont intégrées dans la section Équipe plus haut)

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
const collectEquipes = () => [...document.querySelectorAll('#equipes .equipe-block')].map(eq => {
  const frontSel = eq.querySelector('.eq-front');
  const frontLibre = eq.querySelector('.eq-front-libre');
  const front = (frontSel.value === '__autre__')
    ? frontLibre.value.trim()
    : (frontSel.value || '');
  return {
    nom: eq.querySelector('.eq-nom').value.trim(),
    front,
    membres: [...eq.querySelectorAll('.membre-row')].map(r => {
      const sel = r.querySelector('.m-nom').value;
      const libre = r.querySelector('.m-libre').value.trim();
      const nom = (sel === '__autre__') ? libre : sel;
      return { nom, heures: r.querySelector('.m-heures').value };
    }).filter(m => m.nom),
    engins: [...eq.querySelectorAll('.engins .row-item')].map(r => {
      const sel = r.querySelector('.f-select');
      const libre = r.querySelector('.f-nom');
      const selVal = sel && sel.value && sel.value !== '__autre__' ? sel.value : '';
      const nom = selVal || (libre ? libre.value.trim() : '');
      return { nom, heures: r.querySelector('.f-heures').value.trim() };
    }).filter(e => e.nom),
    taches: [...eq.querySelectorAll('.av-row')].map(r => ({
      tache: r.querySelector('.a-tache').value,
      statut: r.querySelector('.a-statut').value,
      prev: r.querySelector('.a-prev').value,
      real: r.querySelector('.a-real').value,
      unit: r.querySelector('.a-unit').value,
    })),
  };
}).filter(e => e.nom || e.membres.length || e.taches.length);

const collectData = () => {
  const equipes = collectEquipes();
  return {
    date: $('date').value,
    chantier: $('chantier').value.trim(),
    localisation: $('localisation').value.trim(),
    redacteur: $('redacteur').value.trim(),
    meteo: state.meteo,
    equipes,
    // Vue aplatie des taches avec front (nom de rue) pour recap global
    taches: equipes.flatMap(e => e.taches.map(t => ({ rue: e.front || '(sans front)', ...t }))),
  };
};

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
    // Migration ancien format : si pas d.equipes mais d.rues, fusionner tout dans une seule equipe par front
    let equipesArr = (d.equipes && d.equipes.length) ? d.equipes : [];
    if (!equipesArr.length && d.rues && d.rues.length) {
      equipesArr = d.rues.map(r => ({
        nom: '',
        front: r.nom,
        membres: [],
        engins: r.engins || [],
        taches: r.taches || [],
      }));
    }
    $('equipes').innerHTML = '';
    (equipesArr.length ? equipesArr : [{}]).forEach(addEquipe);
    updateRecap();
  } catch (e) { console.warn('restore fail', e); }
};

$('form').addEventListener('input', () => { updateRecap(); updateDateFr(); persist(); });
$('form').addEventListener('change', () => { updateRecap(); updateDateFr(); persist(); });

restore();
updateDateFr();

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
  const logo = await LOGO_PNG_DATAURL();
  let textX = M;
  if (logo) {
    const logoH = 16;
    const logoW = logoH * logo.ratio;
    doc.addImage(logo.data, 'PNG', M, 6, logoW, logoH);
    textX = M + logoW + 5;
  }
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(16);
  doc.text('RAPPORT CHANTIER', textX, 14);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(d.chantier || '—', textX, 21);
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

  if (d.equipes && d.equipes.length) {
    addTitle('Équipes & chantiers');
    d.equipes.forEach((eq) => {
      if (y > H - 40) { doc.addPage(); y = M; }
      const totalH = eq.membres.reduce((s, m) => s + (parseFloat(m.heures) || 0), 0);
      doc.setFillColor(249, 115, 22).rect(M, y, 2, 5, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(30, 41, 59);
      doc.text(`${eq.nom || 'Équipe sans nom'}${eq.front ? '  →  ' + eq.front : ''}`, M + 4, y + 4);
      y += 7;
      doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(100, 116, 139);
      doc.text(`${eq.membres.length} personne(s) — ${totalH.toFixed(2)} h total`, M + 4, y);
      y += 3;

      if (eq.membres.length) {
        doc.autoTable({
          startY: y,
          head: [['Nom', 'Heures']],
          body: eq.membres.map(m => [m.nom, m.heures || '0']),
          styles: { fontSize: 8, cellPadding: 1.5 },
          headStyles: { fillColor: [30, 41, 59], textColor: 255 },
          columnStyles: { 1: { halign: 'center', cellWidth: 25 } },
          margin: { left: M + 4, right: M },
        });
        y = doc.lastAutoTable.finalY + 2;
      }
      if (eq.engins && eq.engins.length) {
        doc.autoTable({
          startY: y,
          head: [['Matériel', 'Heures']],
          body: eq.engins.map(e => [e.nom, e.heures || '']),
          styles: { fontSize: 8, cellPadding: 1.5 },
          headStyles: { fillColor: [148, 163, 184], textColor: 255 },
          columnStyles: { 1: { halign: 'center', cellWidth: 25 } },
          margin: { left: M + 4, right: M },
        });
        y = doc.lastAutoTable.finalY + 2;
      }
      if (eq.taches && eq.taches.length) {
        doc.autoTable({
          startY: y,
          head: [['Tâche', 'Statut', 'Prévu', 'Réalisé', 'Unité', '%']],
          body: eq.taches.map(t => {
            const pct = parseFloat(t.prev) ? Math.round((parseFloat(t.real) || 0) / parseFloat(t.prev) * 100) : 0;
            const s = STATUTS.find(x => x.val === t.statut) || STATUTS[0];
            return [t.tache, `${s.emoji} ${s.label}`, t.prev, t.real, t.unit, pct + '%'];
          }),
          styles: { fontSize: 8, cellPadding: 1.5 },
          headStyles: { fillColor: [30, 41, 59], textColor: 255 },
          margin: { left: M + 4, right: M },
        });
        y = doc.lastAutoTable.finalY + 5;
      } else { y += 3; }
    });
  }

  if (d.taches.length) {

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
      ['Équipe', 'Front', 'Nom', 'Heures'],
    ];
    let grandTotal = 0;
    d.equipes.forEach(eq => {
      let totalEq = 0;
      eq.membres.forEach(m => {
        const h = parseFloat(m.heures) || 0;
        totalEq += h; grandTotal += h;
        ptgRows.push([eq.nom || '(sans nom)', eq.front || '', m.nom, h]);
      });
      ptgRows.push(['', '', `Total ${eq.nom || ''}`, totalEq]);
      ptgRows.push([]);
    });
    ptgRows.push(['', '', 'TOTAL GÉNÉRAL', grandTotal]);
    const wsPtg = XLSX.utils.aoa_to_sheet(ptgRows);
    wsPtg['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsPtg, 'Pointage');

    // Onglet Matériel par équipe/front
    const matRows = [
      ['MATÉRIEL PAR FRONT'],
      ['Chantier', d.chantier, 'Date', formatDateFR(d.date)],
      [],
      ['Équipe', 'Front', 'Matériel', 'Heures'],
    ];
    d.equipes.forEach(eq => {
      (eq.engins || []).forEach(e => {
        matRows.push([eq.nom || '(sans nom)', eq.front || '', e.nom, e.heures || '']);
      });
    });
    const wsMat = XLSX.utils.aoa_to_sheet(matRows);
    wsMat['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsMat, 'Matériel');
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
