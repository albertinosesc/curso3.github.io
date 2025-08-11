/*
  Gerador de Diagramas de Acordes - app.js
  - SVG interativo com navegação por teclado/mouse
  - Modos de exibição: notas, graus, dedos
  - Controles de tonalidade, sustenidos/bemóis, pestana
  - Exportação para SVG/HTML
  - Undo (Ctrl+Z), salvar rápido (Ctrl+S)
*/

(function () {
  'use strict';

  // Constantes musicais
  const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const NOTES_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const KEY_SIGNATURES = [
    'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#',
    'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'
  ];
  const FINGER_CYCLE = ['1', '2', '3', '4', 'T'];

  const STORAGE_KEY = 'chord-diagram-autosave-v1';

  // Elementos
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const el = {
    titleInput: $('#titleInput'),
    stringsInput: $('#stringsInput'),
    startFretInput: $('#startFretInput'),
    numFretsInput: $('#numFretsInput'),
    orientationSelect: $('#orientationSelect'),
    displayModeSelect: $('#displayModeSelect'),
    tonicSelect: $('#tonicSelect'),
    keySelect: $('#keySelect'),
    noteColorInput: $('#noteColorInput'),
    accPrefSelect: $('#accPrefSelect'),
    exportSvgBtn: $('#exportSvgBtn'),
    exportHtmlBtn: $('#exportHtmlBtn'),
    saveBtn: $('#saveBtn'),
    loadBtn: $('#loadBtn'),
    openTunings: $('#openTunings'),
    barreFret: $('#barreFret'),
    barreStart: $('#barreStart'),
    barreEnd: $('#barreEnd'),
    applyBarreBtn: $('#applyBarreBtn'),
    clearBarreBtn: $('#clearBarreBtn'),
    diagramWrapper: $('#diagramWrapper'),
    svg: $('#diagramSvg'),
    diagramTitle: $('#diagramTitle'),
    statusText: $('#statusText'),
    app: $('#app')
  };

  // Estado
  const state = {
    title: 'Acorde',
    numStrings: 6,
    startFret: 1,
    numFrets: 5,
    orientation: 'normal', // normal, invertida, horizontal, horizontal-invertida
    openStrings: [], // 'none' | 'open' | 'mute'
    stringTunings: [], // notas das cordas soltas (de 1 a N). Index 0 = corda 1 (mais grave ou agudo dependendo da orientação visual)
    notes: {}, // key: `${stringIndex}:${fret}` -> { type: 'nota'|'grau'|'dedo', text, degreeAlt: -1|0|1 }
    barre: { fret: 0, start: 0, end: 0 },
    displayMode: 'nota',
    tonic: 'C',
    keySignature: 'C',
    accPreference: 'auto', // auto|sustenidos|bemóis
    preferSharps: true,
    noteColor: '#4f46e5',
    cursor: { stringIndex: 1, fret: 1, inEdit: false },
    undoStack: [],
  };

  // Helpers musicais
  function normalizeNoteName(name) {
    if (!name) return 'C';
    return name.replace(/♯/g, '#').replace(/♭/g, 'b');
  }

  function getPreferSharps() {
    if (state.accPreference === 'sustenidos') return true;
    if (state.accPreference === 'bemóis') return false;
    // auto por tonalidade
    const flats = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']);
    return !flats.has(state.keySignature);
  }

  function noteIndex(note) {
    note = normalizeNoteName(note);
    const iSharp = NOTES_SHARP.indexOf(note);
    if (iSharp !== -1) return iSharp;
    const iFlat = NOTES_FLAT.indexOf(note);
    if (iFlat !== -1) return iFlat;
    // se vier com letras minúsculas, corrige
    const u = note.toUpperCase();
    const i2 = NOTES_SHARP.indexOf(u);
    if (i2 !== -1) return i2;
    return 0;
  }

  function idxToNote(idx, preferSharps) {
    const arr = preferSharps ? NOTES_SHARP : NOTES_FLAT;
    return arr[((idx % 12) + 12) % 12];
  }

  function calcNoteAt(stringIndex, fret) {
    const base = state.stringTunings[stringIndex - 1] || 'E';
    const baseIdx = noteIndex(base);
    const prefer = getPreferSharps();
    return idxToNote(baseIdx + fret, prefer);
  }

  function calcDegreeAt(stringIndex, fret) {
    const note = calcNoteAt(stringIndex, fret);
    const tonicIdx = noteIndex(state.tonic);
    const noteIdxVal = noteIndex(note);
    const diff = ((noteIdxVal - tonicIdx) % 12 + 12) % 12;
    // mapeamento para graus (maior): 0->1, 2->2, 4->3, 5->4, 7->5, 9->6, 11->7
    const map = { 0: 1, 2: 2, 4: 3, 5: 4, 7: 5, 9: 6, 11: 7 };
    if (map[diff]) return { degree: map[diff], alt: 0 };
    // alterados: 1 (b2/#1), 3 (b3/#2), 6 (#4/b5), 8 (b6/#5), 10 (b7)
    const altered = {
      1: { low: 'b2', high: '#1' },
      3: { low: 'b3', high: '#2' },
      6: { low: '#4', high: 'b5' },
      8: { low: 'b6', high: '#5' },
      10: { low: 'b7', high: '#6' },
    };
    if (altered[diff]) {
      // por padrão escolhe bemol em tons com bemóis, sustenido em tons com sustenidos
      const preferSharp = getPreferSharps();
      const tag = preferSharp ? altered[diff].high : altered[diff].low; // '#n' ou 'bn'
      const alt = tag.startsWith('#') ? 1 : -1;
      const degree = parseInt(tag.slice(1), 10);
      return { degree, alt };
    }
    return { degree: 1, alt: 0 };
  }

  // Undo
  function pushUndo() {
    const snapshot = JSON.stringify(state);
    state.undoStack.push(snapshot);
    if (state.undoStack.length > 50) state.undoStack.shift();
  }

  function undo() {
    if (state.undoStack.length === 0) return;
    const prev = state.undoStack.pop();
    const parsed = JSON.parse(prev);
    // preserva a pilha atual? não; substitui tudo exceto a própria pilha
    const keepUndo = state.undoStack.slice();
    Object.keys(state).forEach((k) => {
      if (k === 'undoStack') return;
      state[k] = parsed[k];
    });
    state.undoStack = keepUndo;
    renderAll();
  }

  // Persistência
  function quickSave() {
    const data = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, data);
    flashStatus('Salvo');
  }

  function quickLoad() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) { flashStatus('Nada para carregar'); return; }
    const parsed = JSON.parse(data);
    Object.assign(state, parsed);
    renderAll();
    flashStatus('Carregado');
  }

  // UI iniciais
  function fillNoteSelectOptions(selectEl, withEmpty = false) {
    const prefer = getPreferSharps();
    const opts = prefer ? NOTES_SHARP : NOTES_FLAT;
    selectEl.innerHTML = '';
    if (withEmpty) {
      const op = document.createElement('option');
      op.value = ''; op.textContent = '-';
      selectEl.appendChild(op);
    }
    for (const n of opts) {
      const op = document.createElement('option');
      op.value = n; op.textContent = n;
      selectEl.appendChild(op);
    }
  }

  function populateTonicAndKey() {
    // tonic: 12 notas (ambas grafias)
    el.tonicSelect.innerHTML = '';
    const seen = new Set();
    const both = [];
    for (let i = 0; i < 12; i++) {
      both.push(NOTES_SHARP[i]);
      both.push(NOTES_FLAT[i]);
    }
    for (const n of both) {
      const norm = normalizeNoteName(n);
      if (seen.has(norm)) continue;
      seen.add(norm);
      const op = document.createElement('option');
      op.value = norm; op.textContent = norm;
      el.tonicSelect.appendChild(op);
    }
    el.tonicSelect.value = state.tonic;

    // key signatures
    el.keySelect.innerHTML = '';
    for (const k of KEY_SIGNATURES) {
      const op = document.createElement('option');
      op.value = k; op.textContent = k;
      el.keySelect.appendChild(op);
    }
    el.keySelect.value = state.keySignature;
  }

  function buildOpenTunings() {
    el.openTunings.innerHTML = '';
    for (let s = 1; s <= state.numStrings; s++) {
      const row = document.createElement('div');
      row.className = 'open-tuning-row';
      const lab = document.createElement('label');
      lab.textContent = `Corda ${s}`;
      const sel = document.createElement('select');
      fillNoteSelectOptions(sel, false);
      sel.value = state.stringTunings[s - 1] || defaultTuningForString(s, state.numStrings);
      sel.addEventListener('change', () => {
        pushUndo();
        state.stringTunings[s - 1] = sel.value;
        renderAll();
      });
      row.appendChild(lab);
      row.appendChild(sel);
      el.openTunings.appendChild(row);
    }
  }

  function defaultTuningForString(s, total) {
    // para 6 cordas usa E A D G B E (de grave para agudo, s=1 grave)
    const std = ['E', 'A', 'D', 'G', 'B', 'E'];
    if (total === 6 && s >= 1 && s <= 6) return std[s - 1];
    // fallback: tudo em C
    return 'C';
  }

  function ensureArrays() {
    // openStrings e stringTunings
    if (!Array.isArray(state.openStrings)) state.openStrings = [];
    if (!Array.isArray(state.stringTunings)) state.stringTunings = [];
    for (let i = 0; i < state.numStrings; i++) {
      if (!state.openStrings[i]) state.openStrings[i] = 'none';
      if (!state.stringTunings[i]) state.stringTunings[i] = defaultTuningForString(i + 1, state.numStrings);
    }
  }

  // Renderização principal
  function renderAll() {
    ensureArrays();
    state.preferSharps = getPreferSharps();

    el.diagramTitle.textContent = state.title || 'Acorde';

    buildOpenTunings();
    renderSvg();
    updateStatus();
    // orientação na UI
    el.diagramWrapper.classList.toggle('orientation-horizontal', state.orientation.startsWith('horizontal'));
  }

  function updateStatus() {
    const cs = state.cursor;
    const mode = state.displayMode;
    el.statusText.textContent = `Cursor: corda ${cs.stringIndex}, traste ${cs.fret} | modo: ${mode} | acidente: ${state.preferSharps ? '# (sustenidos)' : 'b (bemóis)'}`;
  }

  // GRID
  function renderSvg() {
    const svg = el.svg;
    svg.innerHTML = '';

    const padding = 40; // ao redor
    const cellW = 48;
    const cellH = 48;

    const strings = state.numStrings;
    const frets = state.numFrets;

    const totalW = padding * 2 + cellW * strings;
    const totalH = padding * 2 + cellH * (frets + 1); // +1 para cabeçalho/nut

    svg.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
    svg.setAttribute('width', totalW);
    svg.setAttribute('height', totalH);

    // fundo opcional pela tonalidade
    const bgColor = backgroundFromKey(state.keySignature);
    const bg = rect(0, 0, totalW, totalH, { fill: bgColor });
    svg.appendChild(bg);

    // título interno opcional (já temos acima)

    // linhas de trastes horizontais
    for (let f = 0; f <= frets; f++) {
      const y = padding + (f + 1) * cellH; // primeira linha depois do nut
      const line = svgLine(padding, y, padding + cellW * strings, y, { class: 'grid-line' });
      svg.appendChild(line);
    }

    // nut (traste zero) ou início
    const nutY = padding + cellH; // acima da primeira casa
    const nut = svgLine(padding, nutY, padding + cellW * strings, nutY, { class: 'nut-line' });
    if (state.startFret > 1) {
      nut.setAttribute('class', 'grid-line');
      nut.setAttribute('stroke-width', '2');
    }
    svg.appendChild(nut);

    // linhas verticais (cordas)
    for (let s = 0; s < strings; s++) {
      const x = padding + s * cellW + cellW / 2;
      const line = svgLine(x, padding + cellH, x, padding + cellH * (frets + 1), { class: 'grid-line' });
      svg.appendChild(line);
    }

    // números dos trastes
    if (state.startFret > 0) {
      for (let f = 1; f <= frets; f++) {
        const fretNum = state.startFret + f - 1;
        const y = padding + (f + 0.5) * cellH + 6;
        const t = svgText(padding - 20, y, String(fretNum), { class: 'fret-number' });
        svg.appendChild(t);
      }
    }

    // rótulos de corda (à esquerda, acima do nut): estado aberto/mudo
    for (let s = 1; s <= strings; s++) {
      const x = padding + (s - 1) * cellW + cellW / 2;
      const y = padding + cellH / 2;
      const stateOpen = state.openStrings[s - 1];
      const marker = svgText(x, y, openMarkerChar(stateOpen), {
        class: stateOpen === 'mute' ? 'mute-marker' : 'open-marker'
      });
      marker.style.cursor = 'pointer';
      marker.addEventListener('click', () => {
        pushUndo();
        state.openStrings[s - 1] = cycleOpenState(state.openStrings[s - 1]);
        renderAll();
      });
      svg.appendChild(marker);
    }

    // pestana
    if (state.barre && state.barre.fret > 0 && state.barre.start > 0 && state.barre.end > 0 && state.barre.end >= state.barre.start) {
      const fret = state.barre.fret;
      const yCenter = padding + (fret + 0.5) * cellH + cellH; // centro da casa
      const xStart = padding + (state.barre.start - 1) * cellW + cellW / 2;
      const xEnd = padding + (state.barre.end - 1) * cellW + cellW / 2;
      const r = cellH * 0.35;
      const path = roundedBar(xStart, xEnd, yCenter, r);
      const barrePath = svgPath(path, { stroke: '#0f172a', 'stroke-width': 10, fill: 'none', opacity: 0.4 });
      svg.appendChild(barrePath);
    }

    // notas
    Object.entries(state.notes).forEach(([key, val]) => {
      const [sStr, fStr] = key.split(':');
      const s = parseInt(sStr, 10);
      const f = parseInt(fStr, 10);
      if (f < 1 || f > state.numFrets) return;
      if (s < 1 || s > state.numStrings) return;
      const cx = padding + (s - 1) * cellW + cellW / 2;
      const cy = padding + (f + 0.5) * cellH + cellH;
      const circle = svgCircle(cx, cy, Math.min(cellW, cellH) * 0.32, {
        fill: state.noteColor,
        class: 'note-circle ' + (isCursorAt(s, f) ? 'pulse' : '')
      });
      svg.appendChild(circle);

      const label = formatNoteLabel(s, f, val);
      const text = svgText(cx, cy + 1, label, { class: 'note-text', fill: bestTextColor(state.noteColor) });
      svg.appendChild(text);
    });

    // cursor
    if (state.cursor.inEdit) {
      const cx = padding + (state.cursor.stringIndex - 1) * cellW + (cellW / 2) - (cellW * 0.45);
      const cy = padding + (state.cursor.fret + 0.5) * cellH + cellH - (cellH * 0.45);
      const cur = rect(cx, cy, cellW * 0.9, cellH * 0.9, { class: 'cursor-rect' });
      svg.appendChild(cur);
    }

    // clique para alternar nota
    svg.addEventListener('click', onSvgClickOnce);

    // orientação: invertida ou horizontal
    applyOrientationTransform(svg, totalW, totalH);
  }

  function onSvgClickOnce(ev) {
    // Adiciona apenas um ouvinte por render
    el.svg.removeEventListener('click', onSvgClickOnce);
    const pt = el.svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const svgP = pt.matrixTransform(el.svg.getScreenCTM().inverse());

    const padding = 40, cellW = 48, cellH = 48;
    const x = svgP.x - padding; const y = svgP.y - padding - 48; // desconta linha do nut
    if (x < 0 || y < 0) return;

    const s = Math.floor(x / cellW) + 1;
    const f = Math.floor(y / cellH) + 1; // casas começam em 1

    if (s >= 1 && s <= state.numStrings && f >= 1 && f <= state.numFrets) {
      focusDiagram();
      moveCursorTo(s, f);
      toggleNoteAtCursor();
    }
  }

  function isCursorAt(s, f) {
    return state.cursor.stringIndex === s && state.cursor.fret === f;
  }

  function formatNoteLabel(s, f, noteVal) {
    const mode = state.displayMode;
    if (mode === 'dedo') {
      return noteVal?.text ?? '1';
    }
    if (mode === 'nota') {
      return calcNoteAt(s, f);
    }
    if (mode === 'grau') {
      const deg = calcDegreeAt(s, f);
      const alt = noteVal?.degreeAlt ?? deg.alt;
      const base = noteVal?.degree ?? deg.degree;
      if (alt === 1) return `#${base}`;
      if (alt === -1) return `b${base}`;
      return String(base);
    }
    return '';
  }

  function bestTextColor(bg) {
    try {
      const { r, g, b } = hexToRgb(bg);
      const yiq = (r * 299 + g * 587 + b * 114) / 1000;
      return yiq >= 128 ? '#0f172a' : '#ffffff';
    } catch {
      return '#ffffff';
    }
  }

  function hexToRgb(hex) {
    const res = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return res ? { r: parseInt(res[1], 16), g: parseInt(res[2], 16), b: parseInt(res[3], 16) } : { r: 255, g: 255, b: 255 };
  }

  function backgroundFromKey(key) {
    // opcional: cores leves por tonalidade
    const map = {
      'C': '#ffffff', 'G': '#fbfeff', 'D': '#f9fffb', 'A': '#fffaf9', 'E': '#faf7ff', 'B': '#fffdf6', 'F#': '#f6fffe', 'C#': '#f7fff6',
      'F': '#fffefe', 'Bb': '#fefcff', 'Eb': '#fcfff8', 'Ab': '#fdf9ff', 'Db': '#f9ffff', 'Gb': '#fff8fb', 'Cb': '#f8fffe'
    };
    return map[key] || '#ffffff';
  }

  // SVG helpers
  function svgLine(x1, y1, x2, y2, attrs) {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => l.setAttribute(k, v));
    return l;
  }
  function svgCircle(cx, cy, r, attrs) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => c.setAttribute(k, v));
    return c;
  }
  function svgText(x, y, text, attrs) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.textContent = text;
    if (attrs) Object.entries(attrs).forEach(([k, v]) => t.setAttribute(k, v));
    return t;
  }
  function svgPath(d, attrs) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => p.setAttribute(k, v));
    return p;
  }
  function rect(x, y, w, h, attrs) {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', h);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => r.setAttribute(k, v));
    return r;
  }

  function roundedBar(xStart, xEnd, yCenter, radius) {
    const y = yCenter;
    const r = radius;
    const x1 = Math.min(xStart, xEnd);
    const x2 = Math.max(xStart, xEnd);
    const d = [
      `M ${x1} ${y}`,
      `A ${r} ${r} 0 0 1 ${x1 + r} ${y - r}`,
      `L ${x2 - r} ${y - r}`,
      `A ${r} ${r} 0 0 1 ${x2} ${y}`,
    ].join(' ');
    return d;
  }

  function openMarkerChar(state) {
    if (state === 'open') return '◯';
    if (state === 'mute') return '×';
    return ' ';
  }

  function cycleOpenState(prev) {
    if (prev === 'none') return 'open';
    if (prev === 'open') return 'mute';
    return 'none';
  }

  // Navegação e edição
  function focusDiagram() {
    state.cursor.inEdit = true;
    el.diagramWrapper.focus();
    renderAll();
  }
  function blurDiagram() {
    state.cursor.inEdit = false;
    renderAll();
  }

  function moveCursor(dx, dy) {
    const sMax = state.numStrings;
    const fMax = state.numFrets;
    let s = state.cursor.stringIndex + dx;
    let f = state.cursor.fret + dy;
    if (s < 1) s = sMax; if (s > sMax) s = 1;
    if (f < 1) f = fMax; if (f > fMax) f = 1;
    state.cursor.stringIndex = s; state.cursor.fret = f;
    renderAll();
  }
  function moveCursorTo(s, f) {
    const sMax = state.numStrings; const fMax = state.numFrets;
    state.cursor.stringIndex = Math.min(Math.max(1, s), sMax);
    state.cursor.fret = Math.min(Math.max(1, f), fMax);
    renderAll();
  }

  function toggleNoteAtCursor() {
    const key = posKey(state.cursor.stringIndex, state.cursor.fret);
    pushUndo();
    if (state.notes[key]) {
      delete state.notes[key];
    } else {
      state.notes[key] = defaultNoteValueForMode();
    }
    renderAll();
  }

  function defaultNoteValueForMode() {
    if (state.displayMode === 'dedo') return { type: 'dedo', text: '1' };
    if (state.displayMode === 'grau') {
      const d = calcDegreeAt(state.cursor.stringIndex, state.cursor.fret);
      return { type: 'grau', degree: d.degree, degreeAlt: d.alt };
    }
    return { type: 'nota' };
  }

  function clearNoteContentAtCursor() {
    const key = posKey(state.cursor.stringIndex, state.cursor.fret);
    if (!state.notes[key]) return;
    pushUndo();
    const note = state.notes[key];
    if (note.type === 'dedo') {
      note.text = '';
    } else if (note.type === 'grau') {
      note.degreeAlt = 0;
    }
    renderAll();
  }

  function removeNoteAtCursor() {
    const key = posKey(state.cursor.stringIndex, state.cursor.fret);
    if (!state.notes[key]) return;
    pushUndo();
    delete state.notes[key];
    renderAll();
  }

  function cycleFingerAtCursor() {
    const key = posKey(state.cursor.stringIndex, state.cursor.fret);
    pushUndo();
    if (!state.notes[key]) state.notes[key] = { type: 'dedo', text: '1' };
    const note = state.notes[key];
    if (note.type !== 'dedo') { note.type = 'dedo'; note.text = '1'; renderAll(); return; }
    const idx = FINGER_CYCLE.indexOf(note.text || '1');
    const next = FINGER_CYCLE[(idx + 1) % FINGER_CYCLE.length];
    note.text = next;
    renderAll();
  }

  function adjustDegreeAltAtCursor(direction) {
    // direction: +1 para #, -1 para b, 0 alterna
    const key = posKey(state.cursor.stringIndex, state.cursor.fret);
    const d = state.notes[key];
    if (!d || (d.type !== 'grau' && state.displayMode !== 'grau')) return;
    pushUndo();
    if (!state.notes[key]) state.notes[key] = { type: 'grau', degree: calcDegreeAt(state.cursor.stringIndex, state.cursor.fret).degree, degreeAlt: 0 };
    const note = state.notes[key];
    note.type = 'grau';
    if (direction === 0) {
      note.degreeAlt = note.degreeAlt === 1 ? -1 : (note.degreeAlt === -1 ? 0 : 1);
    } else {
      const target = direction > 0 ? 1 : -1;
      note.degreeAlt = target;
    }
    renderAll();
  }

  function toggleAccidentalPreference() {
    pushUndo();
    if (state.accPreference === 'sustenidos') state.accPreference = 'bemóis';
    else if (state.accPreference === 'bemóis') state.accPreference = 'auto';
    else state.accPreference = 'sustenidos';
    renderAll();
  }

  function posKey(s, f) { return `${s}:${f}`; }

  // Orientação
  function applyOrientationTransform(svg, w, h) {
    // Para simplificar visual: usamos transform no container externo
    // Orientações:
    // - normal: nada
    // - invertida: espelha vertical (troca ordem de cordas)
    // - horizontal: rotaciona 90°
    // - horizontal-invertida: rotaciona 90° + espelho
    svg.style.transformOrigin = 'center center';
    svg.style.transform = 'none';
    if (state.orientation === 'invertida') {
      svg.style.transform = 'scale(1,-1) translate(0, -100%)';
    } else if (state.orientation === 'horizontal') {
      svg.style.transform = 'rotate(90deg)';
    } else if (state.orientation === 'horizontal-invertida') {
      svg.style.transform = 'rotate(90deg) scale(-1,1)';
    }
  }

  // Exportação
  function exportSvg() {
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(el.svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    triggerDownload(blob, `${(state.title || 'acorde').replace(/\s+/g, '_')}.svg`);
  }

  function exportHtml() {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(el.svg);
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escapeHtml(state.title || 'Acorde')}</title></head><body style="margin:0;display:grid;place-items:center;background:#f8fafc;"><div style="padding:24px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 6px 30px rgba(15,23,42,.08)">${svgString}</div></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    triggerDownload(blob, `${(state.title || 'acorde').replace(/\s+/g, '_')}.html`);
  }

  function escapeHtml(s) { return s.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function triggerDownload(blob, filename) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Eventos de UI
  function bindUI() {
    el.titleInput.addEventListener('input', () => { state.title = el.titleInput.value; renderAll(); });
    el.stringsInput.addEventListener('change', () => { pushUndo(); state.numStrings = clampInt(el.stringsInput.value, 1, 12); renderAll(); });
    el.startFretInput.addEventListener('change', () => { pushUndo(); state.startFret = clampInt(el.startFretInput.value, 0, 20); renderAll(); });
    el.numFretsInput.addEventListener('change', () => { pushUndo(); state.numFrets = clampInt(el.numFretsInput.value, 1, 15); renderAll(); });
    el.orientationSelect.addEventListener('change', () => { pushUndo(); state.orientation = el.orientationSelect.value; renderAll(); });
    el.displayModeSelect.addEventListener('change', () => { pushUndo(); state.displayMode = el.displayModeSelect.value; renderAll(); });
    el.tonicSelect.addEventListener('change', () => { pushUndo(); state.tonic = normalizeNoteName(el.tonicSelect.value); renderAll(); });
    el.keySelect.addEventListener('change', () => { pushUndo(); state.keySignature = el.keySelect.value; renderAll(); });
    el.noteColorInput.addEventListener('input', () => { pushUndo(); state.noteColor = el.noteColorInput.value; renderAll(); });
    el.accPrefSelect.addEventListener('change', () => { pushUndo(); state.accPreference = el.accPrefSelect.value; renderAll(); });

    el.applyBarreBtn.addEventListener('click', () => {
      pushUndo();
      const fret = clampInt(el.barreFret.value, 0, 20);
      const start = clampInt(el.barreStart.value, 0, state.numStrings);
      const end = clampInt(el.barreEnd.value, 0, state.numStrings);
      state.barre = { fret, start, end };
      renderAll();
    });
    el.clearBarreBtn.addEventListener('click', () => { pushUndo(); state.barre = { fret: 0, start: 0, end: 0 }; renderAll(); });

    el.exportSvgBtn.addEventListener('click', exportSvg);
    el.exportHtmlBtn.addEventListener('click', exportHtml);
    el.saveBtn.addEventListener('click', quickSave);
    el.loadBtn.addEventListener('click', quickLoad);

    // foco na área do diagrama via clique/Tab
    el.diagramWrapper.addEventListener('focus', () => { state.cursor.inEdit = true; renderAll(); });
    el.diagramWrapper.addEventListener('blur', () => { state.cursor.inEdit = false; renderAll(); });

    // teclado global
    window.addEventListener('keydown', onKeyDown, { capture: true });
  }

  function onKeyDown(ev) {
    // atalhos globais, porém prioriza quando foco está no diagrama
    const inDiagram = state.cursor.inEdit;

    // Ctrl + S
    if (ev.key.toLowerCase() === 's' && ev.ctrlKey) { ev.preventDefault(); quickSave(); return; }

    // Ctrl + Z
    if (ev.key.toLowerCase() === 'z' && ev.ctrlKey) { ev.preventDefault(); undo(); return; }

    // Ctrl + E ou Ctrl sozinho
    if ((ev.key.toLowerCase() === 'e' && ev.ctrlKey) || (ev.key === 'Control')) {
      if (ev.key === 'Control') ev.preventDefault();
      toggleAccidentalPreference();
      return;
    }

    // Tab: alterna entre controles e diagrama
    if (ev.key === 'Tab') {
      ev.preventDefault();
      if (inDiagram) {
        // vai para o primeiro controle
        (el.titleInput || document.body).focus();
        blurDiagram();
      } else {
        focusDiagram();
      }
      return;
    }

    // Esc: sai do modo de edição
    if (ev.key === 'Escape') { if (inDiagram) { blurDiagram(); } return; }

    // se não está no diagrama, não processa setas/edição
    if (!inDiagram) return;

    // Navegação com setas (wrap-around)
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); moveCursor(-1, 0); return; }
    if (ev.key === 'ArrowRight') { ev.preventDefault(); moveCursor(1, 0); return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); moveCursor(0, -1); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); moveCursor(0, 1); return; }

    // Shift + setas: altera b/# do grau no ponto atual
    if (ev.shiftKey && (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown' || ev.key === 'ArrowRight' || ev.key === 'ArrowUp')) {
      ev.preventDefault();
      const dir = (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') ? 1 : -1;
      adjustDegreeAltAtCursor(dir);
      return;
    }

    // Espaço/Enter: adiciona/remove
    if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); toggleNoteAtCursor(); return; }

    // Backspace: limpa conteúdo
    if (ev.key === 'Backspace') { ev.preventDefault(); clearNoteContentAtCursor(); return; }

    // Delete: remove nota
    if (ev.key === 'Delete') { ev.preventDefault(); removeNoteAtCursor(); return; }

    // Modo 'dedo': 1-4/T definem texto
    if (state.displayMode === 'dedo') {
      const k = ev.key.toUpperCase();
      if (['1','2','3','4','T'].includes(k)) { ev.preventDefault(); pushUndo(); state.notes[posKey(state.cursor.stringIndex, state.cursor.fret)] = { type: 'dedo', text: k }; renderAll(); return; }
      // tecla F para ciclar
      if (k === 'F') { ev.preventDefault(); cycleFingerAtCursor(); return; }
    }

    // Modo 'grau': dígitos 1-7 definem grau, Shift aplica #/b
    if (state.displayMode === 'grau') {
      if (/^[1-7]$/.test(ev.key)) {
        ev.preventDefault();
        const degree = parseInt(ev.key, 10);
        pushUndo();
        state.notes[posKey(state.cursor.stringIndex, state.cursor.fret)] = { type: 'grau', degree, degreeAlt: 0 };
        renderAll();
        return;
      }
      if (ev.key === '#') { ev.preventDefault(); adjustDegreeAltAtCursor(1); return; }
      if (ev.key.toLowerCase() === 'b') { ev.preventDefault(); adjustDegreeAltAtCursor(-1); return; }
    }
  }

  function clampInt(v, min, max) { v = parseInt(v, 10); if (Number.isNaN(v)) v = min; return Math.min(Math.max(v, min), max); }

  // Inicialização
  function init() {
    // defaults
    state.openStrings = Array(state.numStrings).fill('none');
    state.stringTunings = Array(state.numStrings).fill('').map((_, i) => defaultTuningForString(i + 1, state.numStrings));

    // bind UI
    bindUI();
    populateTonicAndKey();

    // sincroniza controles
    el.titleInput.value = state.title;
    el.stringsInput.value = state.numStrings;
    el.startFretInput.value = state.startFret;
    el.numFretsInput.value = state.numFrets;
    el.orientationSelect.value = state.orientation;
    el.displayModeSelect.value = state.displayMode;
    el.noteColorInput.value = state.noteColor;
    el.accPrefSelect.value = state.accPreference;

    // render inicial
    renderAll();

    // tenta carregar salvo automaticamente
    try { quickLoad(); } catch {}
  }

  init();
})();