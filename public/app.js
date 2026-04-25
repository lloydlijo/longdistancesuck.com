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

// Elements
const menuBtn = document.getElementById('menu-btn');
const sideMenu = document.getElementById('side-menu');
const closeMenu = document.getElementById('close-menu');
const menuItems = document.querySelectorAll('.menu-item');
const views = document.querySelectorAll('.view');

const startCallBtn = document.getElementById('start-call-btn');
const videoContainer = document.getElementById('video-container');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const toggleMicBtn = document.getElementById('toggle-mic');
const toggleCameraBtn = document.getElementById('toggle-camera');
const endCallBtn = document.getElementById('end-call');

const movieFileInput = document.getElementById('movie-file-input');
const movieFileLabel = document.getElementById('movie-file-label');
const movieFileStatus = document.getElementById('movie-file-status');
const moviePlayer = document.getElementById('movie-player');
const movieLocalVideo = document.getElementById('movie-local-video');
const movieRemoteVideo = document.getElementById('movie-remote-video');
const skipBackBtn = document.getElementById('skip-back-btn');
const skipFwdBtn = document.getElementById('skip-fwd-btn');

const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const messages = document.getElementById('messages');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');

// WebRTC state
let peerConnection = null;
let localStream = null;
let isCallActive = false;
let isMuted = false;
let isCameraOff = false;
let pendingIceCandidates = []; // buffer ICE candidates until remoteDescription is set

function log(...args) {
  console.log('[WebRTC]', ...args);
}

// Login
socket.emit('login', currentUsername === 'llopie' ? '508812' : '273420');

// ── Menu ──────────────────────────────────────────────────────────────────────
menuBtn.addEventListener('click', () => sideMenu.classList.add('open'));
closeMenu.addEventListener('click', () => sideMenu.classList.remove('open'));

menuItems.forEach(item => {
  item.addEventListener('click', () => {
    const viewName = item.dataset.view;
    menuItems.forEach(mi => mi.classList.remove('active'));
    item.classList.add('active');
    views.forEach(view => view.classList.remove('active'));
    document.getElementById(`${viewName}-view`).classList.add('active');
    sideMenu.classList.remove('open');
    if (viewName === 'movie' && isCallActive) {
      socket.emit('open-movie-tab');
    }
  });
});

// ── User status ───────────────────────────────────────────────────────────────
socket.on('user-status', (users) => {
  updateUserStatus('llopie', users.llopie.online);
  updateUserStatus('sraadu', users.sraadu.online);
  const otherUser = currentUsername === 'llopie' ? 'sraadu' : 'llopie';
  startCallBtn.disabled = !users[otherUser].online;
});

function updateUserStatus(username, online) {
  const statusEl = document.getElementById(`status-${username}`);
  if (!statusEl) return;
  statusEl.textContent = online ? 'Online' : 'Offline';
  statusEl.classList.toggle('online', online);
  statusEl.classList.toggle('offline', !online);
}

// ── Movie tab redirect ────────────────────────────────────────────────────────
socket.on('open-movie-tab', () => {
  menuItems.forEach(mi => mi.classList.remove('active'));
  document.querySelector('[data-view="movie"]').classList.add('active');
  views.forEach(v => v.classList.remove('active'));
  document.getElementById('movie-view').classList.add('active');
});

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
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  pendingIceCandidates = [];

  const pc = new RTCPeerConnection(iceServers);

  pc.ontrack = (event) => {
    log('ontrack fired — kind:', event.track.kind, '— streams:', event.streams.length);
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      movieRemoteVideo.srcObject = event.streams[0];
    } else {
      // fallback: wrap the track in a new MediaStream
      const ms = new MediaStream([event.track]);
      remoteVideo.srcObject = ms;
      movieRemoteVideo.srcObject = ms;
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      log('Sending ICE candidate type:', event.candidate.type);
      socket.emit('webrtc-ice', event.candidate);
    } else {
      log('ICE gathering complete');
    }
  };

  pc.oniceconnectionstatechange = () => {
    log('ICE state:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed') {
      log('ICE failed — restarting ICE');
      pc.restartIce();
    }
  };

  pc.onconnectionstatechange = () => {
    log('Connection state:', pc.connectionState);
  };

  pc.onsignalingstatechange = () => {
    log('Signaling state:', pc.signalingState);
  };

  peerConnection = pc;
  return pc;
}

async function flushPendingCandidates() {
  log(`Flushing ${pendingIceCandidates.length} buffered ICE candidates`);
  for (const candidate of pendingIceCandidates) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      log('Flushed buffered ICE candidate');
    } catch (e) {
      log('Error flushing ICE candidate:', e);
    }
  }
  pendingIceCandidates = [];
}

function showCallUI() {
  isCallActive = true;
  videoContainer.classList.remove('hidden');
  startCallBtn.style.display = 'none';
}

// ── CALLER: clicks Start Call ─────────────────────────────────────────────────
startCallBtn.addEventListener('click', async () => {
  try {
    log('=== Starting call as CALLER ===');
    await getLocalMedia();
    const pc = createPeerConnection();

    localStream.getTracks().forEach(track => {
      log('Caller adding track:', track.kind);
      pc.addTrack(track, localStream);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    log('Caller: set local description (offer), sending...');

    socket.emit('start-call');
    socket.emit('webrtc-offer', offer);
    showCallUI();
  } catch (error) {
    console.error('Error starting call:', error);
    alert('Could not access camera/microphone. Please grant permissions.');
  }
});

// ── RECEIVER: notified of incoming call — just get media and show UI ──────────
// Do NOT create PeerConnection here. Wait for the actual offer.
socket.on('incoming-call', async () => {
  if (isCallActive) return;
  log('=== Incoming call — preparing as RECEIVER ===');
  try {
    await getLocalMedia();
    showCallUI();
  } catch (error) {
    console.error('Error preparing for incoming call:', error);
  }
});

// ── RECEIVER: gets the offer, creates answer ──────────────────────────────────
socket.on('webrtc-offer', async (offer) => {
  log('=== Received offer ===');
  try {
    if (!localStream) {
      await getLocalMedia();
      showCallUI();
    }

    // Always create a fresh PC when receiving an offer
    const pc = createPeerConnection();

    localStream.getTracks().forEach(track => {
      log('Receiver adding track:', track.kind);
      pc.addTrack(track, localStream);
    });

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    log('Receiver: set remote description (offer)');

    // Flush any ICE candidates that arrived before the offer
    await flushPendingCandidates();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    log('Receiver: set local description (answer), sending...');
    socket.emit('webrtc-answer', answer);
  } catch (error) {
    console.error('Error handling offer:', error);
  }
});

// ── CALLER: gets the answer ───────────────────────────────────────────────────
socket.on('webrtc-answer', async (answer) => {
  log('=== Received answer ===');
  try {
    if (!peerConnection) {
      log('ERROR: No peer connection when answer arrived');
      return;
    }
    if (peerConnection.signalingState !== 'have-local-offer') {
      log('Ignoring answer — wrong signaling state:', peerConnection.signalingState);
      return;
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    log('Caller: set remote description (answer)');

    // Flush any ICE candidates that arrived before the answer
    await flushPendingCandidates();
  } catch (error) {
    console.error('Error handling answer:', error);
  }
});

// ── ICE candidates — ALWAYS buffer until remoteDescription is ready ───────────
socket.on('webrtc-ice', async (candidate) => {
  const hasRemote = peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type;
  if (!hasRemote) {
    log('Buffering ICE candidate (remoteDescription not set yet)');
    pendingIceCandidates.push(candidate);
    return;
  }
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    log('Added ICE candidate live:', candidate.type);
  } catch (error) {
    log('Error adding live ICE candidate:', error);
  }
});

// ── Call controls ─────────────────────────────────────────────────────────────
toggleMicBtn.addEventListener('click', () => {
  if (localStream) {
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    toggleMicBtn.classList.toggle('active', isMuted);
    toggleMicBtn.textContent = isMuted ? '🔇' : '🎤';
  }
});

toggleCameraBtn.addEventListener('click', () => {
  if (localStream) {
    isCameraOff = !isCameraOff;
    localStream.getVideoTracks()[0].enabled = !isCameraOff;
    toggleCameraBtn.classList.toggle('active', isCameraOff);
    toggleCameraBtn.textContent = isCameraOff ? '📹❌' : '📹';
  }
});

endCallBtn.addEventListener('click', () => {
  endCall();
  socket.emit('end-call');
});

socket.on('call-ended', () => endCall());

function endCall() {
  log('Ending call');
  isCallActive = false;
  pendingIceCandidates = [];

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  movieLocalVideo.srcObject = null;
  movieRemoteVideo.srcObject = null;

  videoContainer.classList.add('hidden');
  startCallBtn.style.display = 'block';

  isMuted = false;
  isCameraOff = false;
  toggleMicBtn.classList.remove('active');
  toggleCameraBtn.classList.remove('active');
  toggleMicBtn.textContent = '🎤';
  toggleCameraBtn.textContent = '📹';
}

// ── Movie: Local File Upload & Sync ───────────────────────────────────────────
let isSeeking = false;
let suppressEvents = false;

movieFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  moviePlayer.src = url;
  moviePlayer.load();
  movieFileStatus.textContent = `✅ Loaded: ${file.name}`;
  movieFileLabel.textContent = '📂 Change Movie File';
  socket.emit('video-file-loaded', file.name);
});

socket.on('video-file-request', (fileName) => {
  movieFileStatus.textContent = `⚠️ Partner loaded "${fileName}". Please load the same file on your device.`;
  movieFileLabel.style.borderColor = '#f28b82';
  movieFileLabel.style.color = '#f28b82';
});

moviePlayer.addEventListener('play', () => {
  if (!suppressEvents && !isSeeking) socket.emit('video-play', moviePlayer.currentTime);
});
moviePlayer.addEventListener('pause', () => {
  if (!suppressEvents && !isSeeking) socket.emit('video-pause', moviePlayer.currentTime);
});
moviePlayer.addEventListener('seeking', () => { isSeeking = true; });
moviePlayer.addEventListener('seeked', () => {
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

socket.on('video-play', (time) => {
  if (!moviePlayer.src) return;
  withSuppression(() => {
    if (Math.abs(moviePlayer.currentTime - time) > 1) moviePlayer.currentTime = time;
    moviePlayer.play().catch(e => console.log('Play prevented:', e));
  });
});
socket.on('video-pause', (time) => {
  if (!moviePlayer.src) return;
  withSuppression(() => {
    if (Math.abs(moviePlayer.currentTime - time) > 1) moviePlayer.currentTime = time;
    moviePlayer.pause();
  });
});
socket.on('video-seek', (time) => {
  if (!moviePlayer.src) return;
  withSuppression(() => { moviePlayer.currentTime = time; });
});

// ── Chat ──────────────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
  const message = chatInput.value.trim();
  if (message) {
    socket.emit('chat-message', message);
    chatInput.value = '';
  }
}

socket.on('chat-message', (data) => {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${data.username === currentUsername ? 'own' : 'other'}`;
  const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  messageEl.innerHTML = `
    <div class="message-username">${data.username}</div>
    <div class="message-text">${escapeHtml(data.message)}</div>
    <div class="message-time">${time}</div>
  `;
  messages.appendChild(messageEl);
  messages.scrollTop = messages.scrollHeight;
});

emojiBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  emojiPicker.classList.toggle('hidden');
});
document.querySelectorAll('.emoji').forEach(emoji => {
  emoji.addEventListener('click', () => {
    chatInput.value += emoji.textContent;
    emojiPicker.classList.add('hidden');
    chatInput.focus();
  });
});
document.addEventListener('click', (e) => {
  if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
    emojiPicker.classList.add('hidden');
  }
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Socket lifecycle ──────────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !socket.connected) socket.connect();
});
socket.on('connect', () => {
  log('Socket connected');
  socket.emit('login', currentUsername === 'llopie' ? '508812' : '273420');
});
socket.on('disconnect', () => { log('Socket disconnected'); });

window.addEventListener('beforeunload', (e) => {
  if (isCallActive) { e.preventDefault(); e.returnValue = ''; }
});
