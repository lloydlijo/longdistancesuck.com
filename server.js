const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e8
});

app.use(express.static('public'));

const users = {
  'llopie': { password: '508812', online: false, socketId: null },
  'sraadu': { password: '273420', online: false, socketId: null }
};

let currentVideoTime = 0;
let isPlaying = false;
let currentVideoUrl = '';

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('login', (password) => {
    let username = null;
    
    if (password === '508812') {
      username = 'llopie';
    } else if (password === '273420') {
      username = 'sraadu';
    }

    if (username) {
      users[username].online = true;
      users[username].socketId = socket.id;
      socket.username = username;
      
      socket.emit('login-success', {
        username: username,
        users: {
          llopie: { online: users.llopie.online },
          sraadu: { online: users.sraadu.online }
        }
      });

      io.emit('user-status', {
        llopie: { online: users.llopie.online },
        sraadu: { online: users.sraadu.online }
      });

      // Send current video state
      socket.emit('video-state', {
        url: currentVideoUrl,
        time: currentVideoTime,
        playing: isPlaying
      });
    } else {
      socket.emit('login-failed');
    }
  });

  socket.on('start-call', (data) => {
    socket.broadcast.emit('incoming-call', {
      from: socket.username
    });
  });

  socket.on('webrtc-offer', (data) => {
    const otherUser = socket.username === 'llopie' ? 'sraadu' : 'llopie';
    if (users[otherUser].socketId) {
      io.to(users[otherUser].socketId).emit('webrtc-offer', data);
    }
  });

  socket.on('webrtc-answer', (data) => {
    const otherUser = socket.username === 'llopie' ? 'sraadu' : 'llopie';
    if (users[otherUser].socketId) {
      io.to(users[otherUser].socketId).emit('webrtc-answer', data);
    }
  });

  socket.on('webrtc-ice', (data) => {
    const otherUser = socket.username === 'llopie' ? 'sraadu' : 'llopie';
    if (users[otherUser].socketId) {
      io.to(users[otherUser].socketId).emit('webrtc-ice', data);
    }
  });

  socket.on('chat-message', (message) => {
    io.emit('chat-message', {
      username: socket.username,
      message: message,
      timestamp: Date.now()
    });
  });

  socket.on('video-url', (url) => {
    currentVideoUrl = url;
    currentVideoTime = 0;
    isPlaying = false;
    io.emit('video-url', url);
  });

  socket.on('video-play', (time) => {
    currentVideoTime = time;
    isPlaying = true;
    socket.broadcast.emit('video-play', time);
  });

  socket.on('video-pause', (time) => {
    currentVideoTime = time;
    isPlaying = false;
    socket.broadcast.emit('video-pause', time);
  });

  socket.on('video-seek', (time) => {
    currentVideoTime = time;
    socket.broadcast.emit('video-seek', time);
  });

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
    console.log('User disconnected:', socket.id);
  });

  socket.on('end-call', () => {
    io.emit('call-ended');
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
