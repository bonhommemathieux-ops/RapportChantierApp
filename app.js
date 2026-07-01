'use strict';

const STORAGE_KEY = 'rjc_draft_v1';
const state = { photos: [], meteo: '' };

const $ = (id) => document.getElementById(id);

const toast = (msg, type = '') => {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2800);
};

// -------- Lignes dynamiques --------
const templates = {
  effectif: () => `
    <div class="row-item wide">
      <input type="text" class="f-nom" placeholder="Entreprise / équipe" />
      <input type="text" class="f-role" placeholder="Corps d'état / rôle" />
      <input type="number" class="f-nb" placeholder="Nb" min="0" />
      <button type="button" class="btn-remove" data-remove>✕</button>
    </div>`,
  travail: () => `
    <div class="row-item wide">
      <select class="f-desc-select">
        <option value="">— Choisir la tâche —</option>
        <option value="Marquages">Marquages</option>
        <option value="Rabotage">Rabotage</option>
        <option value="Terrassement">Terrassement</option>
        <option value="Boisages">Boisages</option>
        <option value="Pose de tubes">Pose de tubes</option>
        <option value="Remblai">Remblai</option>
        <option value="__autre__">Autre (préciser)…</option>
      </select>
      <input type="text" class="f-loc" placeholder="Localisation" />
      <input type="text" class="f-qte" placeholder="Qté (ml, m²...)" />
      <button type="button" class="btn-remove" data-remove>✕</button>
    </div>`,
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
  effectif: 'effectifs',
  travail: 'travaux',
  engin: 'engins',
  livraison: 'livraisons',
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
  if (e.target.matches('[data-remove]')) {
    e.target.closest('.row-item').remove();
    persist();
  }
});

// Transforme le select "Autre" en champ texte libre
document.addEventListener('change', (e) => {
  if (e.target.matches('.f-desc-select') && e.target.value === '__autre__') {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'f-desc';
    input.placeholder = 'Décris la tâche...';
    e.target.replaceWith(input);
    input.focus();
    persist();
  }
});

// Init : une ligne vide par section
['effectif', 'travail', 'engin', 'livraison'].forEach(addRow);

// -------- Météo --------
document.querySelectorAll('.weather-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.weather-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.meteo = btn.dataset.val;
    persist();
  });
});

// -------- Photos --------
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
      canvas.width = w;
      canvas.height = h;
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
    } catch (err) {
      console.error(err);
    }
  }
  renderPhotos();
  e.target.value = '';
  toast('Photos ajoutées', 'success');
});

document.getElementById('photoGrid').addEventListener('click', (e) => {
  if (e.target.matches('.remove')) {
    state.photos.splice(+e.target.dataset.idx, 1);
    renderPhotos();
  }
});

// -------- Collecte des données --------
const collectRows = (containerId, fields) => {
  return [...document.querySelectorAll(`#${containerId} .row-item`)].map((row) => {
    const obj = {};
    fields.forEach((f) => {
      let el = row.querySelector('.f-' + f);
      if (!el && f === 'desc') el = row.querySelector('.f-desc-select');
      let val = el ? el.value.trim() : '';
      if (val === '__autre__') val = '';
      obj[f] = val;
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
  effectifs: collectRows('effectifs', ['nom', 'role', 'nb']),
  travaux: collectRows('travaux', ['desc', 'loc', 'qte']),
  engins: collectRows('engins', ['nom', 'heures']),
  livraisons: collectRows('livraisons', ['nom', 'qte']),
  secObs: $('secObs').value.trim(),
  incidents: $('incidents').value.trim(),
  visiteurs: $('visiteurs').value.trim(),
  obsGen: $('obsGen').value.trim(),
  prevu: $('prevu').value.trim(),
  destinataires: $('destinataires').value.trim(),
  cc: $('cc').value.trim(),
});

// -------- Persistance LocalStorage --------
const persist = () => {
  try {
    const data = collectData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, photos: state.photos }));
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
    if (data.destinataires) $('destinataires').value = data.destinataires;
    if (data.cc) $('cc').value = data.cc;
    if (data.meteo) {
      const btn = document.querySelector(`.weather-btn[data-val="${data.meteo}"]`);
      if (btn) { btn.classList.add('active'); state.meteo = data.meteo; }
    }
    const PRESET_TASKS = ['Marquages', 'Rabotage', 'Terrassement', 'Boisages', 'Pose de tubes', 'Remblai'];
    const fill = (containerId, type, fields, items) => {
      const c = $(containerId);
      c.innerHTML = '';
      (items && items.length ? items : [{}]).forEach((it) => {
        addRow(type);
        const row = c.lastElementChild;
        fields.forEach((f) => {
          if (f === 'desc' && type === 'travail') {
            const sel = row.querySelector('.f-desc-select');
            const val = it[f] || '';
            if (!val) { sel.value = ''; return; }
            if (PRESET_TASKS.includes(val)) {
              sel.value = val;
            } else {
              const input = document.createElement('input');
              input.type = 'text';
              input.className = 'f-desc';
              input.placeholder = 'Décris la tâche...';
              input.value = val;
              sel.replaceWith(input);
            }
            return;
          }
          const el = row.querySelector('.f-' + f);
          if (el) el.value = it[f] || '';
        });
      });
    };
    fill('effectifs', 'effectif', ['nom', 'role', 'nb'], data.effectifs);
    fill('travaux', 'travail', ['desc', 'loc', 'qte'], data.travaux);
    fill('engins', 'engin', ['nom', 'heures'], data.engins);
    fill('livraisons', 'livraison', ['nom', 'qte'], data.livraisons);
    if (photos && photos.length) {
      state.photos = photos;
      renderPhotos();
    }
  } catch (e) { console.warn('restore fail', e); }
};

document.addEventListener('input', persist);

// Date par défaut = aujourd'hui
$('date').valueAsDate = new Date();

restore();

// -------- Génération PDF --------
const LOGO_SVG_DATAURL = () => {
  // Rendu du logo SVG en PNG dataURL pour intégration au PDF
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

const formatDateFR = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const buildPDF = async (data) => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = M;

  // En-tête avec bandeau
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, W, 28, 'F');

  const logo = await LOGO_SVG_DATAURL();
  if (logo) {
    doc.addImage(logo, 'PNG', M, 4, 20, 20);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('RAPPORT JOURNALIER DE CHANTIER', M + 25, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${data.chantier || '—'}${data.jour ? '  •  Jour n°' + data.jour : ''}`, M + 25, 21);
  doc.setFontSize(9);
  doc.text(formatDateFR(data.date), W - M, 14, { align: 'right' });

  y = 36;
  doc.setTextColor(30, 41, 59);

  // Bloc infos
  doc.autoTable({
    startY: y,
    theme: 'plain',
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
    doc.setFillColor(249, 115, 22);
    doc.rect(M, y, 3, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(194, 65, 12);
    doc.text(txt.toUpperCase(), M + 6, y + 4.5);
    y += 8;
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  };

  // Météo
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

  // Effectifs
  if (data.effectifs.length) {
    addTitle('Effectifs & sous-traitants présents');
    doc.autoTable({
      startY: y,
      head: [['Entreprise / équipe', 'Corps d\'état', 'Nb pers.']],
      body: data.effectifs.map((e) => [e.nom, e.role, e.nb]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  // Travaux
  if (data.travaux.length) {
    addTitle('Travaux réalisés & avancement');
    doc.autoTable({
      startY: y,
      head: [['Description', 'Localisation', 'Quantité']],
      body: data.travaux.map((t) => [t.desc, t.loc, t.qte]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  // Engins
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

  // Livraisons
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

  // Sécurité
  const secBlocks = [
    ['Observations sécurité', data.secObs],
    ['Incidents / accidents', data.incidents],
    ['Visiteurs / contrôles', data.visiteurs],
  ].filter((b) => b[1]);
  if (secBlocks.length) {
    addTitle('Sécurité, incidents & visiteurs');
    secBlocks.forEach(([label, val]) => {
      if (y > H - 25) { doc.addPage(); y = M; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(label, M, y); y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      const lines = doc.splitTextToSize(val, W - 2 * M);
      doc.text(lines, M, y); y += lines.length * 4.5 + 3;
    });
  }

  // Observations
  const obsBlocks = [
    ['Points de blocage / observations', data.obsGen],
    ['Programme prévu J+1', data.prevu],
  ].filter((b) => b[1]);
  if (obsBlocks.length) {
    addTitle('Observations & programme');
    obsBlocks.forEach(([label, val]) => {
      if (y > H - 25) { doc.addPage(); y = M; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(label, M, y); y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      const lines = doc.splitTextToSize(val, W - 2 * M);
      doc.text(lines, M, y); y += lines.length * 4.5 + 3;
    });
  }

  // Photos (2 par ligne)
  if (state.photos.length) {
    doc.addPage();
    y = M;
    addTitle('Photos du chantier');
    const cols = 2;
    const gap = 4;
    const cellW = (W - 2 * M - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.75;
    let col = 0;
    for (let i = 0; i < state.photos.length; i++) {
      if (y + cellH > H - M) { doc.addPage(); y = M; col = 0; }
      const x = M + col * (cellW + gap);
      try {
        doc.addImage(state.photos[i], 'JPEG', x, y, cellW, cellH);
      } catch (err) {
        console.warn('image add fail', err);
      }
      col++;
      if (col >= cols) { col = 0; y += cellH + gap; }
    }
  }

  // Pied de page numéro pages
  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${p} / ${total}`, W - M, H - 6, { align: 'right' });
    doc.text('Rapport Journalier — généré le ' + new Date().toLocaleString('fr-FR'), M, H - 6);
  }

  return doc;
};

// -------- Bouton envoyer --------
$('btnSend').addEventListener('click', async () => {
  const data = collectData();
  if (!data.chantier || !data.date) {
    toast('Renseigne au minimum le chantier et la date', 'error');
    return;
  }
  if (!data.destinataires) {
    toast('Renseigne au moins un destinataire', 'error');
    return;
  }

  toast('Génération du PDF...');
  try {
    const doc = await buildPDF(data);
    const dateStr = data.date || new Date().toISOString().slice(0, 10);
    const cleanChantier = (data.chantier || 'chantier').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    const fileName = `Rapport_${cleanChantier}_${dateStr}.pdf`;
    doc.save(fileName);

    // Petit délai pour laisser le téléchargement démarrer
    setTimeout(() => {
      const subject = `Rapport journalier chantier ${data.chantier} — ${formatDateFR(data.date)}`;
      const bodyLines = [
        'Bonjour,',
        '',
        `Veuillez trouver ci-joint le rapport journalier du chantier ${data.chantier} pour la journée du ${formatDateFR(data.date)}.`,
        '',
        '⚠️ Le PDF a été téléchargé sur votre appareil. Merci de le JOINDRE à ce mail avant l\'envoi.',
        `Fichier : ${fileName}`,
        '',
        'Cordialement,',
        data.redacteur || '',
      ];
      const body = encodeURIComponent(bodyLines.join('\r\n'));
      const to = encodeURIComponent(data.destinataires);
      const cc = data.cc ? '&cc=' + encodeURIComponent(data.cc) : '';
      const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}${cc}&body=${body}`;
      window.location.href = mailto;
      toast('PDF téléchargé — joins-le au mail ouvert', 'success');
    }, 600);
  } catch (err) {
    console.error(err);
    toast('Erreur lors de la génération du PDF', 'error');
  }
});

// -------- Reset --------
$('btnReset').addEventListener('click', () => {
  if (!confirm('Effacer toutes les données saisies ?')) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

// -------- Service worker --------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
