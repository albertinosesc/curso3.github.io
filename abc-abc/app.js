/* global ABCJS */

const elements = {
  abcInput: document.getElementById("abcInput"),
  paper: document.getElementById("paper"),
  audio: document.getElementById("audio"),
  messages: document.getElementById("messages"),
  transpose: document.getElementById("transpose"),
  transposeValue: document.getElementById("transposeValue"),
  tempo: document.getElementById("tempo"),
  tempoValue: document.getElementById("tempoValue"),
  btnRender: document.getElementById("btnRender"),
  btnClear: document.getElementById("btnClear"),
  btnDownloadAbc: document.getElementById("btnDownloadAbc"),
  btnDownloadSvg: document.getElementById("btnDownloadSvg"),
  fileInput: document.getElementById("fileInput"),
};

let visualObjs = [];
let synthControl = null;
let currentTranspose = 0;
let currentQpm = 120;
let renderTimer = null;

const DEFAULT_ABC = `X:1\nT:Exemplo ABC\nM:4/4\nL:1/8\nQ:1/4=120\nK:C\nC D E F | G A B c | c B A G | F E D C |`;

document.addEventListener("DOMContentLoaded", () => {
  // Seed example ABC
  if (!elements.abcInput.value.trim()) {
    elements.abcInput.value = DEFAULT_ABC;
  }

  // Init controls
  elements.transposeValue.textContent = String(elements.transpose.value);
  elements.tempoValue.textContent = String(elements.tempo.value);

  // Setup listeners
  elements.abcInput.addEventListener("input", scheduleRender);
  elements.btnRender.addEventListener("click", renderAll);
  elements.btnClear.addEventListener("click", clearEditor);
  elements.transpose.addEventListener("input", onTransposeChange);
  elements.tempo.addEventListener("input", onTempoChange);
  elements.btnDownloadAbc.addEventListener("click", downloadAbc);
  elements.btnDownloadSvg.addEventListener("click", downloadSvg);
  elements.fileInput.addEventListener("change", onFileSelected);

  // First render
  renderAll();
});

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(renderAll, 250);
}

function clearEditor() {
  elements.abcInput.value = "";
  scheduleRender();
}

function onTransposeChange() {
  currentTranspose = Number(elements.transpose.value);
  elements.transposeValue.textContent = String(currentTranspose);
  renderAll();
}

function onTempoChange() {
  currentQpm = Number(elements.tempo.value);
  elements.tempoValue.textContent = String(currentQpm);
  // No need to re-render SVG for tempo; just rewire audio
  wireAudio();
}

function renderAll() {
  const abc = elements.abcInput.value.trim();
  elements.messages.textContent = "";

  // Render SVG
  try {
    visualObjs = ABCJS.renderAbc(elements.paper, abc || "K:C\n z", {
      add_classes: true,
      responsive: "resize",
      visualTranspose: currentTranspose,
      // staffwidth: 800,
    });
  } catch (err) {
    console.error(err);
    elements.messages.textContent = `Erro ao renderizar: ${err?.message || err}`;
    visualObjs = [];
  }

  // Setup audio controls
  wireAudio();
}

function wireAudio() {
  // Clear old controls
  elements.audio.innerHTML = "";

  if (!visualObjs || visualObjs.length === 0) return;

  // Cursor highlighter
  const cursorControl = createCursorControl(elements.paper);

  synthControl = new ABCJS.synth.SynthController();
  synthControl.load(elements.audio, cursorControl, {
    displayRestart: true,
    displayPlay: true,
    displayProgress: true,
    displayWarp: true,
    // Optional: displayLoop: true,
  });

  // Connect tune to synth control
  synthControl
    .setTune(visualObjs[0], false, {
      qpm: currentQpm,
      midiTranspose: currentTranspose,
    })
    .catch((err) => {
      console.error(err);
      elements.messages.textContent = `Erro de áudio: ${err?.message || err}`;
    });
}

function createCursorControl(containerEl) {
  let lastSelection = [];
  return {
    onStart() {
      clearSelection();
    },
    onEvent(event) {
      clearSelection();
      if (event?.elements) {
        lastSelection = event.elements;
        event.elements.forEach((el) => el.classList.add("abcjs-note_selected"));
        // Scroll into view if needed
        if (event.elements[0]) {
          event.elements[0].scrollIntoView({ block: "nearest" });
        }
      }
    },
    onFinished() {
      clearSelection();
    },
  };

  function clearSelection() {
    if (!lastSelection) return;
    lastSelection.forEach((el) => el.classList.remove("abcjs-note_selected"));
    lastSelection = [];
  }
}

function downloadAbc() {
  const data = elements.abcInput.value || DEFAULT_ABC;
  const blob = new Blob([data], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, "partitura.abc");
}

function downloadSvg() {
  const svg = elements.paper.querySelector("svg");
  if (!svg) {
    elements.messages.textContent = "Nada para exportar.";
    return;
  }
  const clone = svg.cloneNode(true);
  // Ensure background for readability on light viewers
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const blob = new Blob([clone.outerHTML], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, "partitura.svg");
}

function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  requestAnimationFrame(() => {
    URL.revokeObjectURL(url);
    a.remove();
  });
}

function onFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    elements.abcInput.value = String(reader.result || "");
    renderAll();
  };
  reader.readAsText(file);
}