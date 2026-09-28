'use strict';

// =============================================================================
// HELPERS COMMUNS
// =============================================================================
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

const formatHM = (h) => {
  if (!h || isNaN(h)) return '0h00';
  const H = Math.floor(h);
  const M = Math.round((h - H) * 60);
  return `${H}h${String(M).padStart(2, '0')}`;
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

const LOGO_SVG_DATAURL = () => {
  return new Promise((res) => {
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
};

// =============================================================================
// NAVIGATION ONGLETS
// =============================================================================
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
    document.querySelectorAll('[data-actions]').forEach(a => a.classList.toggle('hidden', a.dataset.actions !== tab));
    window.scrollTo(0, 0);
  });
});

// =============================================================================
// ONGLET RAPPORT (existant)
// =============================================================================
const STORAGE_KEY = 'rjc_draft_v1';
const state = { photos: [], meteo: '' };

const templates = {
  engin: () => `
    <div class="row-item">
      <input type="text" class="f-nom" placeholder="Ex : Pelle 8T, camion benne" />
      <input type="text" class="f-heures" placeholder="Heures" />
      <button type="button" class="btn-remove" data-remove>✕</button>
    </div>`,
  livraison: () => `
    <div class="row-item">
      <input type="text" class="f-nom" placeholder="Ex : PE DN 200, sable 0/4" />
      <input type="text" class="f-qte" placeholder="Qté / fournisseur" />
      <button type="button" class="btn-remove" data-remove>✕</button>
    </div>`,
};

const containers = {
  engin: 'engins', livraison: 'livraisons',
};

const addRow = (type) => {
  const c = $(containers[type]);
  const wrap = document.createElement('div');
  wrap.innerHTML = templates[type]().trim();
  c.appendChild(wrap.firstChild);
};

document.querySelectorAll('[data-add]').forEach((btn) => {
  btn.addEventListener('click', () => addRow(btn.dataset.add));
});

document.addEventListener('click', (e) => {
  if (e.target.matches('[data-remove]') && e.target.closest('#tab-rapport')) {
    e.target.closest('.row-item').remove();
    persist();
  }
});

['engin', 'livraison'].forEach(addRow);

document.querySelectorAll('.weather-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.weather-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.meteo = btn.dataset.val;
    persist();
  });
});

const readAsDataURL = (file) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });

const compressImage = (dataUrl, maxWidth = 1200, quality = 0.72) =>
  new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      res(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });

const renderPhotos = () => {
  const grid = $('photoGrid');
  grid.innerHTML = '';
  state.photos.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'photo-thumb';
    div.innerHTML = `<img src="${p}" alt=""><button type="button" class="remove" data-idx="${i}">✕</button>`;
    grid.appendChild(div);
  });
};

$('photoInput').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  toast(`Compression de ${files.length} photo(s)...`);
  for (const f of files) {
    try {
      const raw = await readAsDataURL(f);
      const small = await compressImage(raw);
      state.photos.push(small);
    } catch (err) { console.error(err); }
  }
  renderPhotos();
  persist();
  e.target.value = '';
  toast('Photos ajoutées', 'success');
});

document.getElementById('photoGrid').addEventListener('click', (e) => {
  if (e.target.matches('.remove')) {
    state.photos.splice(+e.target.dataset.idx, 1);
    renderPhotos();
    persist();
  }
});

const collectRows = (containerId, fields) => {
  return [...document.querySelectorAll(`#${containerId} .row-item`)].map((row) => {
    const obj = {};
    fields.forEach((f) => {
      const el = row.querySelector('.f-' + f);
      obj[f] = el ? el.value.trim() : '';
    });
    return obj;
  }).filter((r) => Object.values(r).some((v) => v));
};

const collectData = () => ({
  date: $('date').value,
  jour: $('jour').value,
  chantier: $('chantier').value.trim(),
  localisation: $('localisation').value.trim(),
  redacteur: $('redacteur').value.trim(),
  meteo: state.meteo,
  tempMin: $('tempMin').value,
  tempMax: $('tempMax').value,
  meteoObs: $('meteoObs').value.trim(),
  engins: collectRows('engins', ['nom', 'heures']),
  livraisons: collectRows('livraisons', ['nom', 'qte']),
  secObs: $('secObs').value.trim(),
  incidents: $('incidents').value.trim(),
  visiteurs: $('visiteurs').value.trim(),
  obsGen: $('obsGen').value.trim(),
  prevu: $('prevu').value.trim(),
});

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: collectData(), photos: state.photos }));
  } catch (e) {}
};

const restore = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const { data, photos } = JSON.parse(raw);
    if (data.date) $('date').value = data.date;
    if (data.jour) $('jour').value = data.jour;
    $('chantier').value = data.chantier || '';
    $('localisation').value = data.localisation || '';
    $('redacteur').value = data.redacteur || '';
    $('tempMin').value = data.tempMin || '';
    $('tempMax').value = data.tempMax || '';
    $('meteoObs').value = data.meteoObs || '';
    $('secObs').value = data.secObs || '';
    $('incidents').value = data.incidents || '';
    $('visiteurs').value = data.visiteurs || '';
    $('obsGen').value = data.obsGen || '';
    $('prevu').value = data.prevu || '';
    if (data.meteo) {
      const btn = document.querySelector(`.weather-btn[data-val="${data.meteo}"]`);
      if (btn) { btn.classList.add('active'); state.meteo = data.meteo; }
    }
    const fill = (containerId, type, fields, items) => {
      const c = $(containerId);
      c.innerHTML = '';
      (items && items.length ? items : [{}]).forEach((it) => {
        addRow(type);
        const row = c.lastElementChild;
        fields.forEach((f) => {
          const el = row.querySelector('.f-' + f);
          if (el) el.value = it[f] || '';
        });
      });
    };
    fill('engins', 'engin', ['nom', 'heures'], data.engins);
    fill('livraisons', 'livraison', ['nom', 'qte'], data.livraisons);
    if (photos && photos.length) { state.photos = photos; renderPhotos(); }
  } catch (e) { console.warn('restore fail', e); }
};

$('tab-rapport').addEventListener('input', persist);
$('date').valueAsDate = new Date();
restore();

const buildPDF = async (data) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = M;

  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, W, 28, 'F');
  const logo = await LOGO_SVG_DATAURL();
  if (logo) doc.addImage(logo, 'PNG', M, 4, 20, 20);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold').setFontSize(16);
  doc.text('RAPPORT CHANTIER FCTP', M + 25, 14);
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(`${data.chantier || '—'}${data.jour ? '  •  Jour n°' + data.jour : ''}`, M + 25, 21);
  doc.setFontSize(9);
  doc.text(formatDateFR(data.date), W - M, 14, { align: 'right' });

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
      ['Chantier', data.chantier || '—', 'Rédigé par', data.redacteur || '—'],
      ['Localisation', data.localisation || '—', 'Date', formatDateFR(data.date) || '—'],
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

  addTitle('Météo');
  const meteoParts = [];
  if (data.meteo) meteoParts.push(data.meteo);
  if (data.tempMin || data.tempMax) meteoParts.push(`${data.tempMin || '?'}°C / ${data.tempMax || '?'}°C`);
  doc.text(meteoParts.join('  •  ') || '—', M, y); y += 5;
  if (data.meteoObs) {
    const lines = doc.splitTextToSize('Impact : ' + data.meteoObs, W - 2 * M);
    doc.text(lines, M, y); y += lines.length * 4.5 + 2;
  }
  y += 2;

  if (data.engins.length) {
    addTitle('Matériel présent');
    doc.autoTable({
      startY: y,
      head: [['Engin / matériel', 'Heures']],
      body: data.engins.map((e) => [e.nom, e.heures]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  if (data.livraisons.length) {
    addTitle('Livraisons du jour');
    doc.autoTable({
      startY: y,
      head: [['Matériau / fourniture', 'Qté / fournisseur']],
      body: data.livraisons.map((l) => [l.nom, l.qte]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  const secBlocks = [
    ['Observations sécurité', data.secObs],
    ['Incidents / accidents', data.incidents],
    ['Visiteurs / contrôles', data.visiteurs],
  ].filter((b) => b[1]);
  if (secBlocks.length) {
    addTitle('Sécurité, incidents & visiteurs');
    secBlocks.forEach(([label, val]) => {
      if (y > H - 25) { doc.addPage(); y = M; }
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(100, 116, 139);
      doc.text(label, M, y); y += 4;
      doc.setFont('helvetica', 'normal').setTextColor(30, 41, 59);
      const lines = doc.splitTextToSize(val, W - 2 * M);
      doc.text(lines, M, y); y += lines.length * 4.5 + 3;
    });
  }

  const obsBlocks = [
    ['Points de blocage / observations', data.obsGen],
    ['Programme prévu J+1', data.prevu],
  ].filter((b) => b[1]);
  if (obsBlocks.length) {
    addTitle('Observations & programme');
    obsBlocks.forEach(([label, val]) => {
      if (y > H - 25) { doc.addPage(); y = M; }
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(100, 116, 139);
      doc.text(label, M, y); y += 4;
      doc.setFont('helvetica', 'normal').setTextColor(30, 41, 59);
      const lines = doc.splitTextToSize(val, W - 2 * M);
      doc.text(lines, M, y); y += lines.length * 4.5 + 3;
    });
  }

  if (state.photos.length) {
    doc.addPage(); y = M;
    addTitle('Photos du chantier');
    const cols = 2, gap = 4;
    const cellW = (W - 2 * M - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.75;
    let col = 0;
    for (let i = 0; i < state.photos.length; i++) {
      if (y + cellH > H - M) { doc.addPage(); y = M; col = 0; }
      const x = M + col * (cellW + gap);
      try { doc.addImage(state.photos[i], 'JPEG', x, y, cellW, cellH); }
      catch (err) { console.warn('image add fail', err); }
      col++;
      if (col >= cols) { col = 0; y += cellH + gap; }
    }
  }

  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(8).setTextColor(148, 163, 184);
    doc.text(`Page ${p} / ${total}`, W - M, H - 6, { align: 'right' });
    doc.text('Rapport Journalier — généré le ' + new Date().toLocaleString('fr-FR'), M, H - 6);
  }
  return doc;
};

$('btnShare').addEventListener('click', async () => {
  const data = collectData();
  if (!data.chantier || !data.date) { toast('Renseigne au minimum le chantier et la date', 'error'); return; }
  toast('Génération du PDF...');
  try {
    const doc = await buildPDF(data);
    const dateStr = data.date || new Date().toISOString().slice(0, 10);
    const cleanChantier = (data.chantier || 'chantier').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    const fileName = `Rapport_${cleanChantier}_${dateStr}.pdf`;
    const title = `Rapport ${data.chantier} — ${formatDateFR(data.date)}`;
    const text = `Rapport journalier ${data.chantier} du ${formatDateFR(data.date)}${data.jour ? ' (jour n°' + data.jour + ')' : ''}.`;
    await sharePDF(doc, fileName, title, text);
  } catch (err) { console.error(err); toast('Erreur PDF', 'error'); }
});

$('btnReset').addEventListener('click', () => {
  if (!confirm('Effacer toutes les données saisies ?')) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

// =============================================================================
// ONGLET POINTAGE
// =============================================================================
const PT_KEY = 'pointage_v1';
const ENTREPRISES = ['FCTP', 'LMC', 'Lusoloc', 'STATR', 'Tadielo', 'Assciage', 'LHERM', 'Autre'];

const COMPAGNONS_LMC = [
  { nom: 'AHMADZAI KHALID', ent: 'LMC' },
  { nom: 'BEYAZIT HIYASETTIN', ent: 'LMC' },
  { nom: 'FAQIRI ESMATULLAH', ent: 'LMC' },
  { nom: 'HAZARBOZ WAHAB', ent: 'LMC' },
  { nom: 'AHMADZAI ISHFAQ', ent: 'LMC' },
  { nom: 'KHAN MUSAA', ent: 'LMC' },
  { nom: 'AHMADZAI JANZEEB', ent: 'LMC' },
  { nom: 'WALIZADA WAHIDULLAH', ent: 'LMC' },
  { nom: 'KOCHAI TAYYAB', ent: 'LMC' },
];

const ptTemplate = () => `
  <div class="row-item pointage-row">
    <input type="text" class="p-nom" placeholder="Nom prénom" />
    <select class="p-ent">${ENTREPRISES.map(e => `<option value="${e}">${e}</option>`).join('')}</select>
    <input type="time" class="p-arr" />
    <input type="time" class="p-dep" />
    <input type="number" class="p-pause" placeholder="Pause min" min="0" step="15" value="60" />
    <span class="p-total">—</span>
    <button type="button" class="btn-remove" data-remove>✕</button>
  </div>`;

const computeHours = (arr, dep, pauseMin) => {
  if (!arr || !dep) return 0;
  const [ah, am] = arr.split(':').map(Number);
  const [dh, dm] = dep.split(':').map(Number);
  let total = (dh * 60 + dm) - (ah * 60 + am) - (parseInt(pauseMin) || 0);
  if (total < 0) total += 24 * 60;
  return Math.max(0, total / 60);
};

const ptAddRow = (data = {}) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = ptTemplate().trim();
  const row = wrap.firstChild;
  if (data.nom) row.querySelector('.p-nom').value = data.nom;
  if (data.ent) row.querySelector('.p-ent').value = data.ent;
  if (data.arr) row.querySelector('.p-arr').value = data.arr;
  if (data.dep) row.querySelector('.p-dep').value = data.dep;
  if (data.pause !== undefined && data.pause !== '') row.querySelector('.p-pause').value = data.pause;
  $('pt-compagnons').appendChild(row);
};

const collectPointage = () => {
  const rows = [...document.querySelectorAll('#pt-compagnons .pointage-row')];
  const compagnons = rows.map(r => {
    const arr = r.querySelector('.p-arr').value;
    const dep = r.querySelector('.p-dep').value;
    const pause = r.querySelector('.p-pause').value;
    return {
      nom: r.querySelector('.p-nom').value.trim(),
      ent: r.querySelector('.p-ent').value,
      arr, dep, pause,
      heures: computeHours(arr, dep, pause),
    };
  }).filter(c => c.nom);
  return {
    date: $('pt-date').value,
    chantier: $('pt-chantier').value.trim(),
    chef: $('pt-chef').value.trim(),
    compagnons,
  };
};

const updatePointage = () => {
  const d = collectPointage();
  $('pt-total-nb').textContent = d.compagnons.length;
  $('pt-total-h').textContent = formatHM(d.compagnons.reduce((s, c) => s + c.heures, 0));
  document.querySelectorAll('#pt-compagnons .pointage-row').forEach(row => {
    const h = computeHours(
      row.querySelector('.p-arr').value,
      row.querySelector('.p-dep').value,
      row.querySelector('.p-pause').value
    );
    row.querySelector('.p-total').textContent = h > 0 ? formatHM(h) : '—';
  });
  try { localStorage.setItem(PT_KEY, JSON.stringify(d)); } catch (e) {}
};

const restorePointage = () => {
  try {
    const raw = localStorage.getItem(PT_KEY);
    const d = raw ? JSON.parse(raw) : {};
    $('pt-date').value = d.date || new Date().toISOString().slice(0, 10);
    $('pt-chantier').value = d.chantier || '';
    $('pt-chef').value = d.chef || '';
    $('pt-compagnons').innerHTML = '';
    (d.compagnons && d.compagnons.length ? d.compagnons : [{}]).forEach(ptAddRow);
    updatePointage();
  } catch (e) { console.warn('restore pointage', e); }
};

$('pt-add').addEventListener('click', () => { ptAddRow(); updatePointage(); });

$('pt-load-lmc').addEventListener('click', () => {
  const rows = [...document.querySelectorAll('#pt-compagnons .pointage-row')];
  const nomsPresents = new Set(rows.map(r => r.querySelector('.p-nom').value.trim().toUpperCase()).filter(Boolean));
  const container = $('pt-compagnons');
  if (rows.length === 1 && !rows[0].querySelector('.p-nom').value.trim()) container.innerHTML = '';
  let added = 0;
  COMPAGNONS_LMC.forEach(c => {
    if (nomsPresents.has(c.nom.toUpperCase())) return;
    ptAddRow(c);
    added++;
  });
  updatePointage();
  toast(added ? `Équipe LMC chargée (${added} ajout${added > 1 ? 's' : ''})` : 'Équipe LMC déjà présente', 'success');
});
$('tab-pointage').addEventListener('input', updatePointage);
$('tab-pointage').addEventListener('change', updatePointage);
$('pt-compagnons').addEventListener('click', (e) => {
  if (e.target.matches('[data-remove]')) {
    e.target.closest('.pointage-row').remove();
    updatePointage();
  }
});

$('pt-reset').addEventListener('click', () => {
  if (!confirm('Effacer le pointage ?')) return;
  localStorage.removeItem(PT_KEY);
  restorePointage();
});

$('pt-xlsx').addEventListener('click', () => {
  const d = collectPointage();
  if (!d.compagnons.length) { toast('Aucun compagnon saisi', 'error'); return; }
  const rows = [
    ['POINTAGE JOURNALIER'],
    ['Chantier', d.chantier, 'Date', formatDateFR(d.date), 'Chef', d.chef],
    [],
    ['Nom prénom', 'Entreprise', 'Arrivée', 'Départ', 'Pause (min)', 'Heures'],
    ...d.compagnons.map(c => [c.nom, c.ent, c.arr, c.dep, Number(c.pause) || 0, +c.heures.toFixed(2)]),
    [],
    ['', '', '', '', 'TOTAL', +d.compagnons.reduce((s, c) => s + c.heures, 0).toFixed(2)],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pointage');
  const chan = (d.chantier || 'chantier').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 30);
  const dt = d.date || new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Pointage_${chan}_${dt}.xlsx`);
  toast('Fichier Excel téléchargé', 'success');
});

const buildPointagePDF = async (d) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;

  doc.setFillColor(30, 41, 59).rect(0, 0, W, 26, 'F');
  const logo = await LOGO_SVG_DATAURL();
  if (logo) doc.addImage(logo, 'PNG', M, 4, 18, 18);
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(15);
  doc.text('POINTAGE JOURNALIER', M + 22, 13);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.text(`${d.chantier || '—'} • ${formatDateFR(d.date)}`, M + 22, 20);

  doc.setTextColor(30, 41, 59);
  doc.autoTable({
    startY: 32, theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32, textColor: [100, 116, 139] },
      1: { cellWidth: 60 },
      2: { fontStyle: 'bold', cellWidth: 22, textColor: [100, 116, 139] },
      3: { cellWidth: 'auto' },
    },
    body: [
      ['Chef', d.chef || '—', 'Date', formatDateFR(d.date) || '—'],
      ['Chantier', d.chantier || '—', 'Effectif', String(d.compagnons.length)],
    ],
  });

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6,
    head: [['Nom prénom', 'Entreprise', 'Arrivée', 'Départ', 'Pause', 'Heures']],
    body: d.compagnons.map(c => [c.nom, c.ent, c.arr || '—', c.dep || '—', c.pause ? c.pause + ' min' : '—', formatHM(c.heures)]),
    foot: [['', '', '', '', 'TOTAL', formatHM(d.compagnons.reduce((s, c) => s + c.heures, 0))]],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    footStyles: { fillColor: [249, 115, 22], textColor: 255, fontStyle: 'bold' },
    margin: { left: M, right: M },
  });

  doc.setFontSize(8).setTextColor(148, 163, 184);
  doc.text('Pointage — généré le ' + new Date().toLocaleString('fr-FR'), M, H - 6);
  return doc;
};

$('pt-share').addEventListener('click', async () => {
  const d = collectPointage();
  if (!d.compagnons.length) { toast('Aucun compagnon saisi', 'error'); return; }
  toast('Génération du PDF...');
  try {
    const doc = await buildPointagePDF(d);
    const chan = (d.chantier || 'chantier').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 30);
    const dt = d.date || new Date().toISOString().slice(0, 10);
    const fileName = `Pointage_${chan}_${dt}.pdf`;
    const totalH = formatHM(d.compagnons.reduce((s, c) => s + c.heures, 0));
    const title = `Pointage ${d.chantier} — ${formatDateFR(d.date)}`;
    const text = `Pointage ${d.chantier} du ${formatDateFR(d.date)} : ${d.compagnons.length} compagnons, ${totalH}.`;
    await sharePDF(doc, fileName, title, text);
  } catch (err) { console.error(err); toast('Erreur PDF', 'error'); }
});

restorePointage();

// =============================================================================
// ONGLET AVANCEMENT
// =============================================================================
const AV_KEY = 'avancement_v1';
const TACHES = ['Marquages', 'Rabotage', 'Terrassement', 'Boisages', 'Pose de tubes', 'Remblai', 'Réfection provisoire', 'Enrobé définitif', 'Récolement'];
const UNITES = ['ml', 'm²', 'm³', 'u', '%'];
const STATUTS = [
  { val: 'a_faire', label: 'À faire', emoji: '⚪' },
  { val: 'en_cours', label: 'En cours', emoji: '🟠' },
  { val: 'termine', label: 'Terminé', emoji: '🟢' },
];

const avTemplate = () => `
  <div class="row-item av-row">
    <input type="text" class="a-rue" placeholder="Rue / tronçon" />
    <select class="a-tache">${TACHES.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
    <select class="a-statut">${STATUTS.map(s => `<option value="${s.val}">${s.emoji} ${s.label}</option>`).join('')}</select>
    <input type="number" class="a-prev" placeholder="Prévu" step="any" />
    <input type="number" class="a-real" placeholder="Réalisé" step="any" />
    <select class="a-unit">${UNITES.map(u => `<option value="${u}">${u}</option>`).join('')}</select>
    <button type="button" class="btn-remove" data-remove>✕</button>
  </div>`;

const avAddRow = (data = {}) => {
  const wrap = document.createElement('div');
  wrap.innerHTML = avTemplate().trim();
  const row = wrap.firstChild;
  if (data.rue) row.querySelector('.a-rue').value = data.rue;
  if (data.tache) row.querySelector('.a-tache').value = data.tache;
  if (data.statut) row.querySelector('.a-statut').value = data.statut;
  if (data.prev) row.querySelector('.a-prev').value = data.prev;
  if (data.real) row.querySelector('.a-real').value = data.real;
  if (data.unit) row.querySelector('.a-unit').value = data.unit;
  $('av-taches').appendChild(row);
};

const collectAvancement = () => {
  const rows = [...document.querySelectorAll('#av-taches .av-row')];
  const taches = rows.map(r => ({
    rue: r.querySelector('.a-rue').value.trim(),
    tache: r.querySelector('.a-tache').value,
    statut: r.querySelector('.a-statut').value,
    prev: r.querySelector('.a-prev').value,
    real: r.querySelector('.a-real').value,
    unit: r.querySelector('.a-unit').value,
  })).filter(t => t.rue);
  return {
    date: $('av-date').value,
    chantier: $('av-chantier').value.trim(),
    taches,
  };
};

const updateAvancement = () => {
  const d = collectAvancement();
  const recap = $('av-recap');
  if (!d.taches.length) {
    recap.innerHTML = '<p class="hint">Ajoute des tâches ci-dessus pour voir le récap.</p>';
    try { localStorage.setItem(AV_KEY, JSON.stringify(d)); } catch (e) {}
    return;
  }
  const byTache = {};
  d.taches.forEach(t => {
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
  try { localStorage.setItem(AV_KEY, JSON.stringify(d)); } catch (e) {}
};

const restoreAvancement = () => {
  try {
    const raw = localStorage.getItem(AV_KEY);
    const d = raw ? JSON.parse(raw) : {};
    $('av-date').value = d.date || new Date().toISOString().slice(0, 10);
    $('av-chantier').value = d.chantier || '';
    $('av-taches').innerHTML = '';
    (d.taches && d.taches.length ? d.taches : [{}]).forEach(avAddRow);
    updateAvancement();
  } catch (e) { console.warn('restore av', e); }
};

$('av-add').addEventListener('click', () => { avAddRow(); updateAvancement(); });
$('tab-avancement').addEventListener('input', updateAvancement);
$('tab-avancement').addEventListener('change', updateAvancement);
$('av-taches').addEventListener('click', (e) => {
  if (e.target.matches('[data-remove]')) {
    e.target.closest('.av-row').remove();
    updateAvancement();
  }
});

$('av-reset').addEventListener('click', () => {
  if (!confirm('Effacer l\'avancement ?')) return;
  localStorage.removeItem(AV_KEY);
  restoreAvancement();
});

$('av-xlsx').addEventListener('click', () => {
  const d = collectAvancement();
  if (!d.taches.length) { toast('Aucune tâche saisie', 'error'); return; }
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
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Détail');
  XLSX.utils.book_append_sheet(wb, wsRecap, 'Récap');
  const chan = (d.chantier || 'chantier').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 30);
  const dt = d.date || new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Avancement_${chan}_${dt}.xlsx`);
  toast('Fichier Excel téléchargé', 'success');
});

const buildAvancementPDF = async (d) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;

  doc.setFillColor(30, 41, 59).rect(0, 0, W, 26, 'F');
  const logo = await LOGO_SVG_DATAURL();
  if (logo) doc.addImage(logo, 'PNG', M, 4, 18, 18);
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(15);
  doc.text('SUIVI AVANCEMENT', M + 22, 13);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.text(`${d.chantier || '—'} • ${formatDateFR(d.date)}`, M + 22, 20);

  doc.setTextColor(30, 41, 59);
  doc.autoTable({
    startY: 32,
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
    let y = doc.lastAutoTable.finalY + 8;
    doc.setFillColor(249, 115, 22).rect(M, y, 3, 6, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(194, 65, 12);
    doc.text('RÉCAP PAR TÂCHE', M + 6, y + 4.5);
    doc.autoTable({
      startY: y + 8,
      head: [['Tâche', 'Unité', 'Prévu', 'Réalisé', 'Avancement']],
      body: recapRows,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [249, 115, 22], textColor: 255 },
      margin: { left: M, right: M },
    });
  }

  doc.setFontSize(8).setTextColor(148, 163, 184);
  doc.text('Avancement — généré le ' + new Date().toLocaleString('fr-FR'), M, H - 6);
  return doc;
};

$('av-share').addEventListener('click', async () => {
  const d = collectAvancement();
  if (!d.taches.length) { toast('Aucune tâche saisie', 'error'); return; }
  toast('Génération du PDF...');
  try {
    const doc = await buildAvancementPDF(d);
    const chan = (d.chantier || 'chantier').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 30);
    const dt = d.date || new Date().toISOString().slice(0, 10);
    const fileName = `Avancement_${chan}_${dt}.pdf`;
    const title = `Avancement ${d.chantier} — ${formatDateFR(d.date)}`;
    const text = `Suivi avancement ${d.chantier} du ${formatDateFR(d.date)} : ${d.taches.length} tâches suivies.`;
    await sharePDF(doc, fileName, title, text);
  } catch (err) { console.error(err); toast('Erreur PDF', 'error'); }
});

restoreAvancement();

// =============================================================================
// SERVICE WORKER
// =============================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
