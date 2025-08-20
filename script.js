

/* ---------- Helpers y selects ---------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/* ---------- Estado global / UI ---------- */
const appMain = document.querySelector('.app-main');
const startModal = $('#startModal');
const loginModal = $('#loginModal');
const hostControls = $('#hostControls');
const headerTheme = $('#headerTheme');
const timerDisplay = $('#timer');

const menuBtn = $('#menuBtn');
const menuPanel = $('#menuPanel');
const copyInvite = $('#copyInvite');
const currentRoomEl = $('#currentRoom');
const clearCanvasBtn = $('#clearCanvasBtn');
const savePngBtn = $('#savePngBtn');
const leaveBtn = $('#leaveBtn');
const darkToggle = $('#darkToggle');

const loginName = $('#loginName');
const loginAvatar = $('#loginAvatar');
const loginContinue = $('#loginContinue');
const meAvatar = $('#meAvatar');
const meName = $('#meName');

const matchTopic = $('#matchTopic');
const matchTime = $('#matchTime');
const createRoomBtn = $('#createRoomBtn');
const hostCode = $('#hostCode');
const enterAsHostBtn = $('#enterAsHostBtn');
const joinCode = $('#joinCode');
const joinRoomBtn = $('#joinRoomBtn');
const joinStatus = $('#joinStatus');

const startMatchBtn = $('#startMatchBtn');

const chatLog = $('#chatLog');
const chatText = $('#chatText');

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const colorPicker = $('#colorPicker');
const sizePicker = $('#sizePicker');
const sizeVal = $('#sizeVal');
const eraserBtn = $('#eraserBtn');

const endModal = document.getElementById('endModal');
const anotherRoundBtn = document.getElementById('anotherRoundBtn');
const exitBtn = document.getElementById('exitBtn');
const carouselInner = $('#carousel-inner');
const currentRatingEl = $('#currentRating');

let peer = null;
let isHost = false;
let roomId = null;
let connections = [];
let hostConn = null;
let matchTimer = null;

// Almacenamiento de datos
let myAvatarDataUrl = '';
let drawingsLocal = [];
let drawingsRemote = [];
let votes = {};



/* ---------- UI utils ---------- */
function show(el) { el.classList.add('show'); }
function hide(el) { el.classList.remove('show'); }

function updateThemeDisplay() {
  headerTheme.textContent = 'Tema: ' + (matchTopic.value.trim() || '—');
}

function enterGameArea(asHost) {
  appMain.style.display = 'flex';
  hide(startModal);
  isHost = !!asHost;
  
  // Mostrar/ocultar botón de iniciar tiempo
  if (asHost) {
    startMatchBtn.classList.remove('hidden');
    askForTopic();

  } else {
    startMatchBtn.classList.add('hidden');
  }
  
  updateThemeDisplay();
  currentRoomEl.textContent = roomId ? 'Sala: ' + roomId : '';
  autosizeCanvas();
  
 
  setTimeout(() => {
    setupBrushButtons();
    autosizeCanvas();
  }, 100);
}

function autosizeCanvas(preserveContent = false) {
  const rect = canvas.parentElement.getBoundingClientRect();
  const newWidth = Math.floor(rect.width);
  const newHeight = Math.floor(rect.height);

  let tempCanvas = null;
  if (preserveContent && canvas.width > 0 && canvas.height > 0) {
    tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    tempCanvas.getContext('2d').drawImage(canvas, 0, 0);
  }

  canvas.width = newWidth;
  canvas.height = newHeight;

  if (tempCanvas) {
    ctx.drawImage(tempCanvas, 0, 0);
  }
}






/* ---------- Timer ---------- */
function updateTimerDisplay(seconds) {
  const clamped = Math.max(0, Math.floor(seconds));
  let min = String(Math.floor(clamped / 60)).padStart(2, '0');
  let sec = String(clamped % 60).padStart(2, '0');
  timerDisplay.textContent = `${min}:${sec}`;
}

function startSynchronizedTimer(durationMs, startAt) {
  clearInterval(matchTimer);
  function tick() {
    const now = Date.now();
    const elapsed = now - startAt;
    const remaining = Math.round((durationMs - elapsed) / 1000);
    updateTimerDisplay(remaining);
    if (remaining <= 0) {
      clearInterval(matchTimer);
      updateTimerDisplay(0);
      sendFinalDrawing();
      showEndModalWithDrawings();
    }
  }
  tick();
  matchTimer = setInterval(tick, 250);
}

/* ---------- Theme / Login ---------- */
if (localStorage.getItem('theme') === 'dark') {
  document.body.classList.add('dark');
  darkToggle.checked = true;
}


darkToggle.addEventListener('change', () => {
  document.body.classList.toggle('dark', darkToggle.checked);
  localStorage.setItem('theme', darkToggle.checked ? 'dark' : 'light');
  autosizeCanvas(true); // ✅ 
});


loginAvatar.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    myAvatarDataUrl = reader.result;
    meAvatar.src = myAvatarDataUrl;
  };
  reader.readAsDataURL(file);
});

loginContinue.addEventListener('click', () => {
  const name = loginName.value.trim();
  if (!name) {
    alert('Escribe tu nombre');
    return;
  }
  meName.textContent = name;
  hide(loginModal);
  show(startModal);
  playBackgroundMusic(); // Inicia la música al pasar al modal de configuración
});

/* ---------- Menu ---------- */
menuBtn.addEventListener('click', () => {
  menuPanel.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!menuPanel.contains(e.target) && e.target !== menuBtn) {
    menuPanel.classList.add('hidden');
  }
});

copyInvite.addEventListener('click', async () => {
  if (!roomId) {
    alert('Primero crea o únete a una sala.');
    return;
  }
  await navigator.clipboard.writeText(roomId);
  copyInvite.textContent = '¡Copiado!';
  setTimeout(() => copyInvite.textContent = 'Copiar código de invitación', 1200);
});

clearCanvasBtn.addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  autosizeCanvas();
});

savePngBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'dibujo.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

leaveBtn.addEventListener('click', () => { 
  stopBackgroundMusic();
  location.reload(); 
});

/* ---------- Drawing local ---------- */
let drawing = false;
let last = null;
let erasing = false;

// Configuración de pinceles
let currentBrush = 'round';
const brushes = {
  round: {
    lineCap: 'round',
    lineJoin: 'round',
    shadowBlur: 0,
    shadowColor: 'transparent'
  },
  fine: {
    lineCap: 'butt',
    lineJoin: 'miter',
    shadowBlur: 0,
    shadowColor: 'transparent'
  },
  soft: {
    lineCap: 'round',
    lineJoin: 'round',
    shadowBlur: 10,
    shadowColor: 'rgba(0, 0, 0, 0.03)'
  },
  watercolor: {
    lineCap: 'round',
    lineJoin: 'round',
    shadowBlur: 15,
    shadowColor: 'currentColor'
  }
};

function setupBrushButtons() {
  const brushButtons = $$('.brush-btn');
  
  // Limpiar eventos existentes
  brushButtons.forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
  });
  
  
  const newBrushButtons = $$('.brush-btn');
  newBrushButtons.forEach(btn => {
    btn.addEventListener('click', () => {
    
      const isCurrentlyActive = btn.classList.contains('active');
      
   
      newBrushButtons.forEach(b => b.classList.remove('active'));
      
   
      if (!isCurrentlyActive) {
        currentBrush = btn.dataset.brush;
        btn.classList.add('active');
      } else {
        currentBrush = 'round'; 
      }
    });
  });
  
  
  const defaultBrush = document.querySelector('.brush-btn[data-brush="round"]');
  if (defaultBrush) {
    defaultBrush.classList.add('active');
  }
}

function getPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  return { x, y };
}

function begin(e) { 
  drawing = true; 
  last = getPoint(e); 
  saveState(); 
}


function end() { 
  drawing = false; 
  last = null; 
}

function move(e) {
  if (!drawing) return;
  const p = getPoint(e);
  const brush = brushes[currentBrush];
  
  ctx.lineJoin = brush.lineJoin;
  ctx.lineCap = brush.lineCap;
  ctx.shadowBlur = brush.shadowBlur;
  ctx.shadowColor = brush.shadowColor;
  ctx.strokeStyle = erasing ? 
    (document.body.classList.contains('dark') ? '#0b1220' : '#ffffff') : 
    colorPicker.value;
  ctx.lineWidth = parseInt(sizePicker.value, 10);
  
  if (currentBrush === 'watercolor') {
    ctx.globalAlpha = 0.7;
  } else {
    ctx.globalAlpha = 1.0;
  }
  
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  
  if (currentBrush === 'soft') {
    for (let i = 0; i < 3; i++) {
      const offsetX = (Math.random() - 0.5) * ctx.lineWidth;
      const offsetY = (Math.random() - 0.5) * ctx.lineWidth;
      ctx.beginPath();
      ctx.moveTo(last.x + offsetX, last.y + offsetY);
      ctx.lineTo(p.x + offsetX, p.y + offsetY);
      ctx.stroke();
    }
  }
  
  last = p;
}


canvas.addEventListener('mousedown', begin);
canvas.addEventListener('touchstart', begin);
window.addEventListener('mouseup', end);
window.addEventListener('touchend', end);
canvas.addEventListener('mousemove', move);
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); }, { passive: false });

sizePicker.addEventListener('input', () => sizeVal.textContent = sizePicker.value);

eraserBtn.addEventListener('click', () => {
  erasing = !erasing;
  eraserBtn.classList.toggle('active', erasing);
  eraserBtn.textContent = erasing ? 'Dibujar' : 'Borrador';
});

/* ---------- Chat ---------- */
function pushMsg({ from = 'Yo', avatar = myAvatarDataUrl || meAvatar.src, text = '', isMe = false }) {
  const wrap = document.createElement('div');
  wrap.className = 'msg' + (isMe ? ' me' : '');
  wrap.innerHTML = `
    <img class="avatar" src="${avatar || ''}" alt="${from}" />
    <div class="bubble">
      <div class="muted" style="margin-bottom:4px;">${from}</div>
      <div>${text}</div>
    </div>`;
  chatLog.appendChild(wrap);
  chatLog.scrollTop = chatLog.scrollHeight;
}

chatText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatText.value.trim()) {
    const text = chatText.value.trim();
    pushMsg({ text, isMe: true, from: meName.textContent, avatar: myAvatarDataUrl });
    chatText.value = '';
    const payload = { type: 'chat', from: meName.textContent, avatar: myAvatarDataUrl, text };
    if (isHost) {
      connections.forEach(c => { try { c.send(payload); } catch { } });
    } else if (hostConn) {
      try { hostConn.send(payload); } catch { }
    }
  }
});

/* ---------- PeerJS: crear/entrar sala ---------- */
function ensurePeer() {
  if (peer) return peer;
  peer = new Peer();

  peer.on('connection', (conn) => {
    connections.push(conn);

    conn.on('open', () => {
      if (myAvatarDataUrl || meName.textContent) {
        try {
          conn.send({ type: 'profile', name: meName.textContent, avatar: myAvatarDataUrl });
        } catch (e) { }
      }
    });

    conn.on('data', (data) => {
      if (!data || !data.type) return;

      if (data.type === 'join-request') {
        conn.send({
          type: 'join-accepted',
          theme: matchTopic.value.trim(),
          duration: parseInt(matchTime.value, 10),
        });
      }
      else if (data.type === 'profile') {
        pushMsg({ from: data.name || 'Invitado', avatar: data.avatar || '', text: 'se ha unido', isMe: false });
      }
      else if (data.type === 'chat') {
        pushMsg({ from: data.from || 'Invitado', avatar: data.avatar || '', text: data.text || '' });
      }
      else if (data.type === 'start-timer') {
        // No aplica para host
      }
      else if (data.type === 'final-drawing') {
        drawingsRemote.push({ img: data.img, fromName: data.fromName, avatar: data.avatar });
        rebuildCarousel();
      }
      else if (data.type === 'vote') {
        applyVote(data);
      }
    });

    conn.on('close', () => {
      connections = connections.filter(c => c !== conn);
    });
  });

  return peer;
}

createRoomBtn.addEventListener('click', () => {
  showLoader(3000); 
  ensurePeer();
  if (peer.open) {
    roomId = peer.id;
    hostCode.textContent = 'Código: ' + roomId;
    hostControls.classList.remove('hidden');
    updateThemeDisplay();
    return;
  }
  peer.on('open', (id) => {
    roomId = id;
    hostCode.textContent = 'Código: ' + roomId;
    hostControls.classList.remove('hidden');
    updateThemeDisplay();
  });
});



enterAsHostBtn.addEventListener('click', () => {
  enterGameArea(true);
  connections.forEach(c => {
    try { c.send({ type: 'profile', name: meName.textContent, avatar: myAvatarDataUrl }); } catch { }
  });
});

joinRoomBtn.addEventListener('click', () => {
  const code = joinCode.value.trim();
  if (!code) { joinStatus.textContent = 'Escribe un código válido'; return; }

  showLoader(3000); 

  ensurePeer();
  hostConn = peer.connect(code, { reliable: true });
  joinStatus.textContent = 'Conectando…';

  hostConn.on('open', () => {
    roomId = code;
    hostConn.send({
      type: 'join-request',
      name: meName.textContent,
      theme: matchTopic.value.trim()
    });

    if (myAvatarDataUrl || meName.textContent) {
      try {
        hostConn.send({ type: 'profile', name: meName.textContent, avatar: myAvatarDataUrl });
      } catch (e) { }
    }
  });

  hostConn.on('data', (data) => {
    if (!data || !data.type) return;
    if (data.type === 'join-accepted') {
      joinStatus.textContent = '¡Unido!';
      matchTopic.value = data.theme || matchTopic.value;
      updateThemeDisplay();
      matchTime.value = String(data.duration || parseInt(matchTime.value, 10));
      enterGameArea(false);
    }
    else if (data.type === 'profile') {
      pushMsg({ from: data.name || 'Host', avatar: data.avatar || '', text: 'perfil recibido', isMe: false });
    }
    else if (data.type === 'start-timer') {
      startSynchronizedTimer(data.duration, data.startAt);
      if (data.theme) { matchTopic.value = data.theme; updateThemeDisplay(); }
    }
    else if (data.type === 'chat') {
      pushMsg({ from: data.from || 'Host', avatar: data.avatar || '', text: data.text || '' });
    }
    else if (data.type === 'final-drawing') {
      drawingsRemote.push({ img: data.img, fromName: data.fromName, avatar: data.avatar });
      rebuildCarousel();
    }
    else if (data.type === 'vote') {
      applyVote(data);
    }
  });

  hostConn.on('error', (err) => {
    joinStatus.textContent = 'Error: ' + (err?.type || 'desconocido');
  });
});

startMatchBtn.addEventListener('click', () => {
  showLoader(3000); 

  const duration = parseInt(matchTime.value, 10);
  const startAt = Date.now() + 150;
  const theme = matchTopic.value.trim();

  startSynchronizedTimer(duration, startAt);
  const payload = { type: 'start-timer', duration, startAt, theme };
  connections.forEach(c => { try { c.send(payload); } catch { } });
});


/* ---------- Funciones para dibujos finales y votaciones ---------- */
function sendFinalDrawing() {
  const img = canvas.toDataURL('image/png');
  drawingsLocal = [{ img, fromName: meName.textContent, avatar: myAvatarDataUrl }];
  rebuildCarousel();

  const payload = { type: 'final-drawing', img, fromName: meName.textContent, avatar: myAvatarDataUrl };

  if (isHost) {
    connections.forEach(c => { try { c.send(payload); } catch { } });
  } else if (hostConn) {
    try { hostConn.send(payload); } catch { }
  }
}

function sendVote(targetIndex, rating) {
  const payload = { type: 'vote', from: meName.textContent, targetIndex, rating };
  if (isHost) {
    applyVote(payload);
    connections.forEach(c => { try { c.send(payload); } catch { } });
  } else if (hostConn) {
    try { hostConn.send(payload); } catch { }
  }
}

function applyVote({ from, targetIndex, rating }) {
  if (typeof targetIndex !== 'number') return;
  votes[targetIndex] = votes[targetIndex] || { total: 0, byUser: {} };
  const slot = votes[targetIndex];

  if (slot.byUser[from]) {
    slot.total -= slot.byUser[from];
  }
  slot.byUser[from] = rating;
  slot.total += rating;

  updateVotesDisplay(targetIndex);
}

function updateVotesDisplay(index) {
  const slot = votes[index] || { total: 0, byUser: {} };
  const voters = Object.keys(slot.byUser).length;
  const avg = voters === 0 ? 0 : Math.round((slot.total / voters) * 10) / 10;
  
  const ratingEl = document.querySelector(`#rating-${index}`);
  if (ratingEl) {
    ratingEl.textContent = `${avg}/5 (${voters} votos)`;
  }
}

function rebuildCarousel() {
  carouselInner.innerHTML = '';
  const merged = [...drawingsLocal, ...drawingsRemote];

  if (merged.length === 0) {
    carouselInner.innerHTML = `
      <div class="carousel-item active">
        <div class="p-4 text-center">No hay dibujos aún</div>
      </div>`;
    return;
  }

  merged.forEach((entry, index) => {
    const img = entry.img;
    const fromName = entry.fromName || `Jugador ${index + 1}`;
    const avatar = entry.avatar || '';

    const item = document.createElement('div');
    item.className = `carousel-item ${index === 0 ? 'active' : ''}`;
    item.innerHTML = `
      <div class="text-center p-3">
        <img src="${img}" class="d-block mx-auto rounded border" style="max-width:90%; height:auto;" alt="Dibujo del jugador ${index + 1}">
        
        <h5 class="mt-2"><img src="${avatar}" alt="" style="width:32px;height:32px;border-radius:50%;vertical-align:middle;margin-right:6px;"> 
          ${fromName}</h5>
        
        <!-- Votación -->
        <div class="star-rating mt-2" data-index="${index}">
          <span class="star" data-value="1">★</span>
          <span class="star" data-value="2">★</span>
          <span class="star" data-value="3">★</span>
          <span class="star" data-value="4">★</span>
          <span class="star" data-value="5">★</span>
        </div>
        <p id="rating-${index}" class="muted">0/5 estrellas</p>

        <!-- Botón de guardar -->
        <button class="btn btn-sm mt-2" onclick="downloadImage('${img}', '${fromName}')">Guardar dibujo</button>
      </div>
    `;
    carouselInner.appendChild(item);
  });

  wireStarHandlers();
}

function downloadImage(dataUrl, name) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `dibujo_${name}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


function showEndModalWithDrawings() {
  if (drawingsLocal.length === 0) {
    drawingsLocal = [{ img: canvas.toDataURL('image/png'), fromName: meName.textContent, avatar: myAvatarDataUrl }];
  }
  rebuildCarousel();
  show(endModal);
}

function wireStarHandlers() {
  const starContainers = $$('.star-rating');
  starContainers.forEach(container => {
    const index = parseInt(container.getAttribute('data-index'));
    const stars = container.querySelectorAll('.star');

    stars.forEach(star => {
      star.addEventListener('click', () => {
        const value = parseInt(star.getAttribute('data-value'));
        sendVote(index, value);

        stars.forEach((s, i) => s.classList.toggle('active', i < value));
        $(`#rating-${index}`).textContent = `${value}/5 estrellas`;
      });

      star.addEventListener('mouseover', () => {
        const value = parseInt(star.getAttribute('data-value'));
        stars.forEach((s, i) => s.classList.toggle('hover', i < value));
      });

      star.addEventListener('mouseout', () => {
        stars.forEach(s => s.classList.remove('hover'));
      });
    });
  });
}


/* ---------- Manejo de botones de fin de partida ---------- */
function resetGame() {
  hide(endModal);
  updateTimerDisplay(parseInt(matchTime.value, 10) / 1000);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  autosizeCanvas();
  
 
  drawingsLocal = [];
  drawingsRemote = [];
  votes = {};
  
  if (isHost) {
    hostControls.style.display = 'block';
  }
}

function leaveGame() {
  stopBackgroundMusic();
  if (peer) {
    peer.destroy();
  }
  if (hostConn) {
    hostConn.close();
  }
  connections.forEach(conn => conn.close());
  location.reload();
}

// Asignar eventos a los botones corregidos
anotherRoundBtn.addEventListener('click', resetGame);
anotherRoundBtn.addEventListener("click", askForTopic);


exitBtn.addEventListener('click', leaveGame);

// Funciones de música
function playBackgroundMusic() {
  const bgMusic = document.getElementById("bgMusic");
  if (bgMusic && bgMusic.paused) {
    bgMusic.volume = 0.6;
    bgMusic.play().catch(err => console.log("Autoplay bloqueado:", err));
  }
}

function stopBackgroundMusic() {
  const bgMusic = document.getElementById("bgMusic");
  if (bgMusic && !bgMusic.paused) {
    bgMusic.pause();
  }
}

function showLoader(duration = 8000) {
  const loader = document.getElementById("loaderOverlay");
  loader.classList.remove("hidden");
  setTimeout(() => {
    loader.classList.add("hidden");
  }, duration);
}


//elegir el tema ese

const topicModal = $("#topicModal");
const topicInput = $("#topicInput");
const topicCancel = $("#topicCancel");
const topicConfirm = $("#topicConfirm");


function askForTopic() {
  topicInput.value = matchTopic.value || "";
  show(topicModal);
  topicInput.focus();
}


topicCancel.addEventListener("click", () => {
  hide(topicModal);
});


topicConfirm.addEventListener("click", () => {
  const topic = topicInput.value.trim();
  if (!topic) {
    alert("Por favor escribe una temática");
    return;
  }
  matchTopic.value = topic;
  updateThemeDisplay(); 
  hide(topicModal);
});

/* ---------- Undo / Redo ---------- */
const undoBtn = $('#undoBtn');
const redoBtn = $('#redoBtn');

let undoStack = [];
let redoStack = [];

/* Guardar estado actual */
function saveState() {
  undoStack.push(canvas.toDataURL());
  // Limpiamos el stack de redo al crear un nuevo estado
  redoStack = [];
}

/* Restaurar estado */
function restoreState(stackFrom, stackTo) {
  if (stackFrom.length === 0) return;

  stackTo.push(canvas.toDataURL());
  const imgData = stackFrom.pop();

  const img = new Image();
  img.src = imgData;
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
}

/* Eventos botones */
undoBtn.addEventListener('click', () => restoreState(undoStack, redoStack));
redoBtn.addEventListener('click', () => restoreState(redoStack, undoStack));

/* Atajos de teclado */
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    restoreState(undoStack, redoStack);
  }
  if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
    e.preventDefault();
    restoreState(redoStack, undoStack);
  }
});


/* ---------- Inicialización ---------- */
autosizeCanvas();
sizeVal.textContent = sizePicker.value;
setupBrushButtons();