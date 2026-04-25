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
    { urls: 'stun:stun2.l.google.com:19302' },
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
  ],
  iceCandidatePoolSize: 10
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
let isInitiator = false;
let makingOffer = false;
let ignoreOffer = false;

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

// Video Call - Perfect Negotiation Pattern
startCallBtn.addEventListener('click', async () => {
  
