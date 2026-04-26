const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e8
});

app.use(express.static('public'));

const users = {
  'llopie': { password: '508812', online: false, socketId: null },
  'sraadu': { password: '273420', online: false, socketId: null }
};

let currentVideoTime = 0;
let isPlaying = false;
let currentVideoFileName = '';

function other(username) {
  return username === 'llopie' ? 'sraadu' : 'llopie';
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('login', (password) => {
    let username = null;
    if (password === '508812') username = 'llopie';
    else if (password === '273420') username = 'sraadu';

    if (username) {
      users[username].online = true;
      users[username].socketId = socket.id;
      socket.username = username;

      socket.emit('login-success', { username });
      io.emit('user-status', {
        llopie: { online: users.llopie.online },
        sraadu: { online: users.sraadu.online }
      });
      socket.emit('video-state', {
        fileName: currentVideoFileName,
        time: currentVideoTime,
        playing: isPlaying
      });
    } else {
      socket.emit('login-failed');
    }
  });

  // ── WebRTC ────────────────────────────────────────────────────────────────
  socket.on('start-call', () => {
    socket.broadcast.emit('incoming-call', { from: socket.username });
  });

  socket.on('webrtc-offer', (data) => {
    const o = other(socket.username);
    if (users[o].socketId) io.to(users[o].socketId).emit('webrtc-offer', data);
  });

  socket.on('webrtc-answer', (data) => {
    const o = other(socket.username);
    if (users[o].socketId) io.to(users[o].socketId).emit('webrtc-answer', data);
  });

  socket.on('webrtc-ice', (data) => {
    const o = other(socket.username);
    if (users[o].socketId) io.to(users[o].socketId).emit('webrtc-ice', data);
  });

  socket.on('end-call', () => io.emit('call-ended'));

  // ── Movie tab navigation sync ─────────────────────────────────────────────
  socket.on('open-movie-tab',  () => socket.broadcast.emit('open-movie-tab'));
  socket.on('leave-movie-tab', () => socket.broadcast.emit('leave-movie-tab'));

  // ── Movie sync ────────────────────────────────────────────────────────────
  socket.on('video-file-loaded', (fileName) => {
    currentVideoFileName = fileName;
    currentVideoTime = 0;
    isPlaying = false;
    socket.broadcast.emit('video-file-request', fileName);
  });

  socket.on('video-play',  (time) => { currentVideoTime = time; isPlaying = true;  socket.broadcast.emit('video-play',  time); });
  socket.on('video-pause', (time) => { currentVideoTime = time; isPlaying = false; socket.broadcast.emit('video-pause', time); });
  socket.on('video-seek',  (time) => { currentVideoTime = time;                    socket.broadcast.emit('video-seek',  time); });
  socket.on('video-skip',  (data) => { currentVideoTime = data.time;               socket.broadcast.emit('video-seek',  data.time); });

  // ── Chat ──────────────────────────────────────────────────────────────────
  socket.on('chat-message', (message) => {
    io.emit('chat-message', { username: socket.username, message, timestamp: Date.now() });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (socket.username) {
      users[socket.username].online = false;
      users[socket.username].socketId = null;
      io.emit('user-status', {
        llopie: { online: users.llopie.online },
        sraadu: { online: users.sraadu.online }
      });
      io.emit('call-ended');
    }
    console.log('Disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
