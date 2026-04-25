const socket = io();

// Get username from localStorage
const currentUsername = localStorage.getItem('username');
if (!currentUsername) {
  window.location.href = '/';
}

// ICE servers configuration with Metered.ca TURN servers
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

// Video call elements
const startCallBtn = document.getElementById('start-call-btn');
const videoContainer = document.getElementById('video-container');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const toggleMicBtn = document.getElementById('toggle-mic');
const toggleCameraBtn = document.getElementById('toggle-camera');
const endCallBtn = document.getElementById('end-call');

// Movie elements
const videoUrlInput = document.getElementById('video-url-input');
const loadVideoBtn = document.getElementById('load-video-btn');
const moviePlayer = document.getElementById('movie-player');
const movieLocalVideo = document.getElementById('movie-local-video');
const movieRemoteVideo = document.getElementById('movie-remote-video');

// Chat elements
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const messages = document.getElementById('messages');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');

// WebRTC
let peerConnection;
let localStream;
let isCallActive = false;
let isMuted = false;
let isCameraOff = false;

// Initialize
socket.emit('login', currentUsername === 'llopie' ? '508812' : '273420');

// Menu
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
  });
});

// User status updates
socket.on('user-status', (users) => {
  updateUserStatus('llopie', users.llopie.online);
  updateUserStatus('sraadu', users.sraadu.online);
  
  const otherUser = currentUsername === 'llopie' ? 'sraadu' : 'llopie';
  startCallBtn.disabled = !users[otherUser].online;
});

function updateUserStatus(username, online) {
  const statusEl = document.getElementById(`status-${username}`);
  statusEl.textContent = online ? 'Online' : 'Offline';
  statusEl.classList.toggle('online', online);
  statusEl.classList.toggle('offline', !online);
}

// Video Call
startCallBtn.addEventListener('click', async () => {
  try {
    await startCall();
    socket.emit('start-call');
  } catch (error) {
    console.error('Error starting call:', error);
    alert('Could not access camera/microphone. Please grant permissions.');
  }
});

socket.on('incoming-call', async () => {
  if (!isCallActive) {
    await startCall();
  }
});

async function startCall() {
  isCallActive = true;
  videoContainer.classList.remove('hidden');
  startCallBtn.style.display = 'none';
  
  try {
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
    
    peerConnection = new RTCPeerConnection(iceServers);
    
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
    
    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
      movieRemoteVideo.srcObject = event.streams[0];
    };
    
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice', event.candidate);
      }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', peerConnection.iceConnectionState);
    };
    
    peerConnection.onconnectionstatechange = () => {
      console.log('Connection State:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'failed') {
        console.error('Connection failed, attempting to restart ICE');
        peerConnection.restartIce();
      }
    };
    
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('webrtc-offer', offer);
  } catch (error) {
    console.error('Error in startCall:', error);
    endCall();
    throw error;
  }
}

socket.on('webrtc-offer', async (offer) => {
  if (!isCallActive) {
    await startCall();
  }
  
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('webrtc-answer', answer);
  } catch (error) {
    console.error('Error handling offer:', error);
  }
});

socket.on('webrtc-answer', async (answer) => {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (error) {
    console.error('Error handling answer:', error);
  }
});

socket.on('webrtc-ice', async (candidate) => {
  try {
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    console.error('Error adding ICE candidate:', error);
  }
});

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

// Movie Sync
loadVideoBtn.addEventListener('click', () => {
  const url = videoUrlInput.value.trim();
  if (url) {
    socket.emit('video-url', url);
    videoUrlInput.value = '';
  }
});

socket.on('video-url', (url) => {
  moviePlayer.src = url;
  moviePlayer.load();
});

let isSeeking = false;

moviePlayer.addEventListener('play', () => {
  if (!isSeeking) {
    socket.emit('video-play', moviePlayer.currentTime);
  }
});

moviePlayer.addEventListener('pause', () => {
  if (!isSeeking) {
    socket.emit('video-pause', moviePlayer.currentTime);
  }
});

moviePlayer.addEventListener('seeking', () => {
  isSeeking = true;
});

moviePlayer.addEventListener('seeked', () => {
  socket.emit('video-seek', moviePlayer.currentTime);
  setTimeout(() => {
    isSeeking = false;
  }, 500);
});

socket.on('video-play', (time) => {
  if (Math.abs(moviePlayer.currentTime - time) > 1) {
    moviePlayer.currentTime = time;
  }
  moviePlayer.play().catch(e => console.log('Play prevented:', e));
});

socket.on('video-pause', (time) => {
  if (Math.abs(moviePlayer.currentTime - time) > 1) {
    moviePlayer.currentTime = time;
  }
  moviePlayer.pause();
});

socket.on('video-seek', (time) => {
  moviePlayer.currentTime = time;
});

socket.on('video-state', (state) => {
  if (state.url) {
    moviePlayer.src = state.url;
    moviePlayer.currentTime = state.time;
    if (state.playing) {
      moviePlayer.play().catch(e => console.log('Auto-play prevented:', e));
    }
  }
});

// Chat
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

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Page hidden');
  } else {
    console.log('Page visible');
    // Reconnect socket if disconnected
    if (!socket.connected) {
      socket.connect();
    }
  }
});

// Handle socket reconnection
socket.on('connect', () => {
  console.log('Socket connected');
  socket.emit('login', currentUsername === 'llopie' ? '508812' : '273420');
});

socket.on('disconnect', () => {
  console.log('Socket disconnected');
});

// Prevent accidental page refresh during call
window.addEventListener('beforeunload', (e) => {
  if (isCallActive) {
    e.preventDefault();
    e.returnValue = '';
  }
});
