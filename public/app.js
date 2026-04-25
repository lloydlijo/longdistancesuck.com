const socket = io();

// Get username from localStorage
const currentUsername = localStorage.getItem('username');
if (!currentUsername) {
  window.location.href = '/';
}

// ICE servers configuration
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
      credential: '5gHG8y3zamx/2RsC'
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

// Video call elements
const startCallBtn = document.getElementById('start-call-btn');
const videoContainer = document.getElementById('video-container');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const toggleMicBtn = document.getElementById('toggle-mic');
const toggleCameraBtn = document.getElementById('toggle-camera');
const endCallBtn = document.getElementById('end-call');

// Movie elements
const movieFileInput = document.getElementById('movie-file-input');
const movieFileLabel = document.getElementById('movie-file-label');
const movieFileStatus = document.getElementById('movie-file-status');
const moviePlayer = document.getElementById('movie-player');
const movieLocalVideo = document.getElementById('movie-local-video');
const movieRemoteVideo = document.getElementById('movie-remote-video');
const skipBackBtn = document.getElementById('skip-back-btn');
const skipFwdBtn = document.getElementById('skip-fwd-btn');

// Chat elements
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const messages = document.getElementById('messages');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');

// WebRTC state
let peerConnection;
let localStream;
let isCallActive = false;
let isMuted = false;
let isCameraOff = false;
let isInitiator = false; // only the person who clicks "Start Call" creates an offer

// Initialize
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

    // If opening movie tab during a call, tell the other person to open it too
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

// ── Redirect to movie tab ─────────────────────────────────────────────────────
socket.on('open-movie-tab', () => {
  // Switch to movie view
  menuItems.forEach(mi => mi.classList.remove('active'));
  document.querySelector('[data-view="movie"]').classList.add('active');
  views.forEach(v => v.classList.remove('active'));
  document.getElementById('movie-view').classList.add('active');
});

// ── Video Call ────────────────────────────────────────────────────────────────
startCallBtn.addEventListener('click', async () => {
  try {
    isInitiator = true;
    await setupLocalMedia();
    peerConnection = createPeerConnection();

    // Add tracks
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('webrtc-offer', offer);

    socket.emit('start-call');
    isCallActive = true;
    videoContainer.classList.remove('hidden');
    startCallBtn.style.display = 'none';
  } catch (error) {
    console.error('Error starting call:', error);
    alert('Could not access camera/microphone. Please grant permissions.');
  }
});

// Receiver: notified of incoming call — set up media and wait for offer
socket.on('incoming-call', async () => {
  if (!isCallActive) {
    try {
      isInitiator = false;
      await setupLocalMedia();
      peerConnection = createPeerConnection();
      localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
      isCallActive = true;
      videoContainer.classList.remove('hidden');
      startCallBtn.style.display = 'none';
    } catch (error) {
      console.error('Error preparing for incoming call:', error);
    }
  }
});

// Receiver gets the offer, sends answer
socket.on('webrtc-offer', async (offer) => {
  try {
    if (!peerConnection) {
      // Safety: create connection if not already done
      isInitiator = false;
      await setupLocalMedia();
      peerConnection = createPeerConnection();
      localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
      isCallActive = true;
      videoContainer.classList.remove('hidden');
      startCallBtn.style.display = 'none';
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('webrtc-answer', answer);
  } catch (error) {
    console.error('Error handling offer:', error);
  }
});

// Caller gets the answer
socket.on('webrtc-answer', async (answer) => {
  try {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  } catch (error) {
    console.error('Error handling answer:', error);
  }
});

socket.on('webrtc-ice', async (candidate) => {
  try {
    if (peerConnection && peerConnection.remoteDescription) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    console.error('Error adding ICE candidate:', error);
  }
});

async function setupLocalMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });
  localVideo.srcObject = localStream;
  movieLocalVideo.srcObject = localStream;
}

function createPeerConnection() {
  const pc = new RTCPeerConnection(iceServers);

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    movieRemoteVideo.srcObject = event.streams[0];
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc-ice', event.candidate);
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('ICE state:', pc.iceConnectionState);
  };

  pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
    if (pc.connectionState === 'failed') {
      pc.restartIce();
    }
  };

  return pc;
}

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

socket.on('call-ended', () => {
  endCall();
});

function endCall() {
  isCallActive = false;
  isInitiator = false;

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
let localMovieFile = null;
let isSeeking = false;
let suppressEvents = false; // prevent echo when receiving remote sync

movieFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  localMovieFile = file;
  const url = URL.createObjectURL(file);
  moviePlayer.src = url;
  moviePlayer.load();
  movieFileStatus.textContent = `✅ Loaded: ${file.name}`;
  movieFileLabel.textContent = '📂 Change Movie File';

  // Tell the other person to load their copy of the same file
  socket.emit('video-file-loaded', file.name);
});

// Other person loaded a file — prompt them to load their own copy
socket.on('video-file-request', (fileName) => {
  movieFileStatus.textContent = `⚠️ Your partner loaded "${fileName}". Please load the same file.`;
  movieFileLabel.style.borderColor = '#f28b82';
  movieFileLabel.style.color = '#f28b82';
});

// Play / Pause / Seek sync
moviePlayer.addEventListener('play', () => {
  if (!suppressEvents && !isSeeking) {
    socket.emit('video-play', moviePlayer.currentTime);
  }
});

moviePlayer.addEventListener('pause', () => {
  if (!suppressEvents && !isSeeking) {
    socket.emit('video-pause', moviePlayer.currentTime);
  }
});

moviePlayer.addEventListener('seeking', () => {
  isSeeking = true;
});

moviePlayer.addEventListener('seeked', () => {
  if (!suppressEvents) {
    socket.emit('video-seek', moviePlayer.currentTime);
  }
  setTimeout(() => { isSeeking = false; }, 500);
});

// Skip buttons
skipBackBtn.addEventListener('click', () => {
  const t = Math.max(0, moviePlayer.currentTime - 10);
  moviePlayer.currentTime = t;
  socket.emit('video-skip', { time: t, delta: -10 });
});

skipFwdBtn.addEventListener('click', () => {
  const t = moviePlayer.currentTime + 10;
  moviePlayer.currentTime = t;
  socket.emit('video-skip', { time: t, delta: 10 });
});

// Remote sync events
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
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

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

  const time = new Date(data.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

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
  if (!document.hidden && !socket.connected) {
    socket.connect();
  }
});

socket.on('connect', () => {
  console.log('Socket connected');
  socket.emit('login', currentUsername === 'llopie' ? '508812' : '273420');
});

socket.on('disconnect', () => {
  console.log('Socket disconnected');
});

window.addEventListener('beforeunload', (e) => {
  if (isCallActive) {
    e.preventDefault();
    e.returnValue = '';
  }
});
