const socket = io();

const currentUsername = localStorage.getItem('username');
if (!currentUsername) {
  window.location.href = '/';
}

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:a.relay.metered.ca:80',
      username: 'cba959575ceffc433ab81619',
      credential: '5gHG8y3yamx/2RsC'
    },
    {
      urls: 'turn:a.relay.metered.ca:80?transport=tcp',
      username: 'cba959575ceffc433ab81619',
      credential: '5gHG8y3yamx/2RsC'
    },
    {
      urls: 'turn:a.relay.metered.ca:443',
      username: 'cba959575ceffc433ab81619',
      credential: '5gHG8y3yamx/2RsC'
    },
    {
      urls: 'turn:a.relay.metered.ca:443?transport=tcp',
      username: 'cba959575ceffc433ab81619',
      credential: '5gHG8y3yamx/2RsC'
    }
  ]
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const menuBtn         = document.getElementById('menu-btn');
const sideMenu        = document.getElementById('side-menu');
const menuOverlay     = document.getElementById('menu-overlay');
const closeMenuBtn    = document.getElementById('close-menu');
const menuItems       = document.querySelectorAll('.menu-item');
const views           = document.querySelectorAll('.view');

const startCallBtn    = document.getElementById('start-call-btn');
const callIdle        = document.getElementById('call-idle');
const videoContainer  = document.getElementById('video-container');
const localVideo      = document.getElementById('local-video');
const remoteVideo     = document.getElementById('remote-video');
const remoteLabel     = document.getElementById('remote-label');
const toggleMicBtn    = document.getElementById('toggle-mic');
const toggleCameraBtn = document.getElementById('toggle-camera');
const endCallBtn      = document.getElementById('end-call');

const movieFileInput  = document.getElementById('movie-file-input');
const movieFileLabel  = document.getElementById('movie-file-label');
const movieFileStatus = document.getElementById('movie-file-status');
const moviePlayer     = document.getElementById('movie-player');
const movieLocalVideo = document.getElementById('movie-local-video');
const movieRemoteVideo= document.getElementById('movie-remote-video');
const skipBackBtn     = document.getElementById('skip-back-btn');
const skipFwdBtn      = document.getElementById('skip-fwd-btn');

const chatInput       = document.getElementById('chat-input');
const sendBtn         = document.getElementById('send-btn');
const messages        = document.getElementById('messages');
const emojiBtn        = document.getElementById('emoji-btn');
const emojiPicker     = document.getElementById('emoji-picker');

// ── WebRTC state ──────────────────────────────────────────────────────────────
let peerConnection      = null;
let localStream         = null;
let isCallActive        = false;
let isMuted             = false;
let isCameraOff         = false;
let pendingIceCandidates = [];

const otherUsername = currentUsername === 'llopie' ? 'sraadu' : 'llopie';

function log(...args) { console.log('[WebRTC]', ...args); }

// Login
socket.emit('login', currentUsername === 'llopie' ? '508812' : '273420');

// ── Menu ──────────────────────────────────────────────────────────────────────
function openMenu()  { sideMenu.classList.add('open');  menuOverlay.classList.add('visible'); }
function closeMenu() { sideMenu.classList.remove('open'); menuOverlay.classList.remove('visible'); }

menuBtn.addEventListener('click', openMenu);
closeMenuBtn.addEventListener('click', closeMenu);
menuOverlay.addEventListener('click', closeMenu);

function switchView(viewName, notifyOther = false) {
  menuItems.forEach(mi => mi.classList.remove('active'));
  const target = document.querySelector(`[data-view="${viewName}"]`);
  if (target) target.classList.add('active');

  views.forEach(v => v.classList.remove('active'));
  const viewEl = document.getElementById(`${viewName}-view`);
  if (viewEl) viewEl.classList.add('active');

  closeMenu();

  if (notifyOther && isCallActive) {
    if (viewName === 'movie') {
      socket.emit('open-movie-tab');
    } else if (viewName === 'call') {
      socket.emit('leave-movie-tab');
    }
  }
}

menuItems.forEach(item => {
  item.addEventListener('click', () => {
    switchView(item.dataset.view, true);
  });
});

// ── User status ───────────────────────────────────────────────────────────────
socket.on('user-status', (users) => {
  setStatus('llopie', users.llopie.online);
  setStatus('sraadu', users.sraadu.online);
  startCallBtn.disabled = !users[otherUsername].online;
});

function setStatus(username, online) {
  const dot = document.getElementById(`dot-${username}`);
  if (!dot) return;
  dot.classList.toggle('online', online);
  dot.classList.toggle('offline', !online);
}

// ── Movie tab redirect (both directions) ──────────────────────────────────────
socket.on('open-movie-tab', () => switchView('movie'));
socket.on('leave-movie-tab', () => switchView('call'));

// ── WebRTC helpers ────────────────────────────────────────────────────────────
async function getLocalMedia() {
  if (localStream) return;
  localStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  localVideo.srcObject = localStream;
  movieLocalVideo.srcObject = localStream;
  log('Got local media');
}

function createPeerConnection() {
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  pendingIceCandidates = [];

  const pc = new RTCPeerConnection(iceServers);

  pc.ontrack = (event) => {
    log('ontrack:', event.track.kind);
    const stream = (event.streams && event.streams[0]) || new MediaStream([event.track]);
    remoteVideo.srcObject = stream;
    movieRemoteVideo.srcObject = stream;
    // Update label with other username
    if (remoteLabel) remoteLabel.textContent = otherUsername;
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('webrtc-ice', e.candidate);
  };

  pc.oniceconnectionstatechange = () => {
    log('ICE state:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed') pc.restartIce();
  };

  pc.onconnectionstatechange  = () => log('Connection state:', pc.connectionState);
  pc.onsignalingstatechange   = () => log('Signaling state:', pc.signalingState);

  peerConnection = pc;
  return pc;
}

async function flushPendingCandidates() {
  log(`Flushing ${pendingIceCandidates.length} buffered ICE candidates`);
  for (const c of pendingIceCandidates) {
    try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); }
    catch (e) { log('Flush error:', e); }
  }
  pendingIceCandidates = [];
}

function showCallUI() {
  isCallActive = true;
  callIdle.style.display = 'none';
  videoContainer.classList.remove('hidden');
}

// ── CALLER ────────────────────────────────────────────────────────────────────
startCallBtn.addEventListener('click', async () => {
  try {
    log('=== CALLER: starting call ===');
    await getLocalMedia();
    const pc = createPeerConnection();
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    log('Offer created, sending');

    socket.emit('start-call');
    socket.emit('webrtc-offer', offer);
    showCallUI();
  } catch (err) {
    console.error(err);
    alert('Camera/mic access denied. Please grant permissions and try again.');
  }
});

// ── RECEIVER: incoming-call notification — get media, wait for offer ──────────
socket.on('incoming-call', async () => {
  if (isCallActive) return;
  log('=== RECEIVER: incoming call ===');
  try {
    await getLocalMedia();
    showCallUI();
  } catch (err) { console.error(err); }
});

// ── RECEIVER: got offer → send answer ────────────────────────────────────────
socket.on('webrtc-offer', async (offer) => {
  log('=== RECEIVER: got offer ===');
  try {
    if (!localStream) { await getLocalMedia(); showCallUI(); }
    const pc = createPeerConnection();
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    log('Remote description set (offer)');
    await flushPendingCandidates();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    log('Answer created, sending');
    socket.emit('webrtc-answer', answer);
  } catch (err) { console.error('Offer handling error:', err); }
});

// ── CALLER: got answer ────────────────────────────────────────────────────────
socket.on('webrtc-answer', async (answer) => {
  log('=== CALLER: got answer ===');
  try {
    if (!peerConnection || peerConnection.signalingState !== 'have-local-offer') {
      log('Ignoring answer — wrong state:', peerConnection?.signalingState);
      return;
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    log('Remote description set (answer)');
    await flushPendingCandidates();
  } catch (err) { console.error('Answer handling error:', err); }
});

// ── ICE candidates — buffer until remoteDescription ready ────────────────────
socket.on('webrtc-ice', async (candidate) => {
  const ready = peerConnection && peerConnection.remoteDescription?.type;
  if (!ready) {
    pendingIceCandidates.push(candidate);
    return;
  }
  try { await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); }
  catch (e) { log('ICE add error:', e); }
});

// ── Controls ──────────────────────────────────────────────────────────────────
toggleMicBtn.addEventListener('click', () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks()[0].enabled = !isMuted;
  toggleMicBtn.classList.toggle('active', isMuted);
  toggleMicBtn.textContent = isMuted ? '🔇' : '🎤';
});

toggleCameraBtn.addEventListener('click', () => {
  if (!localStream) return;
  isCameraOff = !isCameraOff;
  localStream.getVideoTracks()[0].enabled = !isCameraOff;
  toggleCameraBtn.classList.toggle('active', isCameraOff);
  toggleCameraBtn.textContent = isCameraOff ? '📹❌' : '📹';
});

endCallBtn.addEventListener('click', () => { endCall(); socket.emit('end-call'); });
socket.on('call-ended', () => endCall());

function endCall() {
  log('Ending call');
  isCallActive = false;
  pendingIceCandidates = [];

  localStream?.getTracks().forEach(t => t.stop());
  localStream = null;
  peerConnection?.close();
  peerConnection = null;

  [localVideo, remoteVideo, movieLocalVideo, movieRemoteVideo].forEach(v => v.srcObject = null);

  videoContainer.classList.add('hidden');
  callIdle.style.display = '';

  isMuted = isCameraOff = false;
  toggleMicBtn.classList.remove('active');
  toggleCameraBtn.classList.remove('active');
  toggleMicBtn.textContent = '🎤';
  toggleCameraBtn.textContent = '📹';
}

// ── Movie: file upload + playback sync ────────────────────────────────────────
let isSeeking = false;
let suppressEvents = false;

movieFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  moviePlayer.src = URL.createObjectURL(file);
  moviePlayer.load();
  movieFileStatus.textContent = `✅ ${file.name}`;
  movieFileLabel.textContent = '📂 Change File';
  socket.emit('video-file-loaded', file.name);
});

socket.on('video-file-request', (name) => {
  movieFileStatus.textContent = `⚠️ Partner loaded "${name}" — please load the same file.`;
  movieFileLabel.style.borderColor = 'var(--danger)';
  movieFileLabel.style.color = 'var(--danger)';
});

moviePlayer.addEventListener('play',    () => { if (!suppressEvents && !isSeeking) socket.emit('video-play',  moviePlayer.currentTime); });
moviePlayer.addEventListener('pause',   () => { if (!suppressEvents && !isSeeking) socket.emit('video-pause', moviePlayer.currentTime); });
moviePlayer.addEventListener('seeking', () => { isSeeking = true; });
moviePlayer.addEventListener('seeked',  () => {
  if (!suppressEvents) socket.emit('video-seek', moviePlayer.currentTime);
  setTimeout(() => { isSeeking = false; }, 500);
});

skipBackBtn.addEventListener('click', () => {
  const t = Math.max(0, moviePlayer.currentTime - 10);
  moviePlayer.currentTime = t;
  socket.emit('video-skip', { time: t });
});
skipFwdBtn.addEventListener('click', () => {
  const t = moviePlayer.currentTime + 10;
  moviePlayer.currentTime = t;
  socket.emit('video-skip', { time: t });
});

function withSuppression(fn) {
  suppressEvents = true;
  fn();
  setTimeout(() => { suppressEvents = false; }, 300);
}

socket.on('video-play',  (t) => { if (!moviePlayer.src) return; withSuppression(() => { if (Math.abs(moviePlayer.currentTime - t) > 1) moviePlayer.currentTime = t; moviePlayer.play().catch(() => {}); }); });
socket.on('video-pause', (t) => { if (!moviePlayer.src) return; withSuppression(() => { if (Math.abs(moviePlayer.currentTime - t) > 1) moviePlayer.currentTime = t; moviePlayer.pause(); }); });
socket.on('video-seek',  (t) => { if (!moviePlayer.src) return; withSuppression(() => { moviePlayer.currentTime = t; }); });

// ── Chat ──────────────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
  const msg = chatInput.value.trim();
  if (msg) { socket.emit('chat-message', msg); chatInput.value = ''; }
}

socket.on('chat-message', (data) => {
  const el = document.createElement('div');
  el.className = `message ${data.username === currentUsername ? 'own' : 'other'}`;
  const t = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `
    <div class="message-username">${data.username}</div>
    <div class="message-text">${escapeHtml(data.message)}</div>
    <div class="message-time">${t}</div>
  `;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
});

emojiBtn.addEventListener('click', e => { e.stopPropagation(); emojiPicker.classList.toggle('hidden'); });
document.querySelectorAll('.emoji').forEach(em => {
  em.addEventListener('click', () => {
    chatInput.value += em.textContent;
    emojiPicker.classList.add('hidden');
    chatInput.focus();
  });
});
document.addEventListener('click', e => {
  if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) emojiPicker.classList.add('hidden');
});

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

// ── Socket lifecycle ──────────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !socket.connected) socket.connect();
});
socket.on('connect', () => {
  log('Connected');
  socket.emit('login', currentUsername === 'llopie' ? '508812' : '273420');
});
socket.on('disconnect', () => log('Disconnected'));

window.addEventListener('beforeunload', e => {
  if (isCallActive) { e.preventDefault(); e.returnValue = ''; }
});
