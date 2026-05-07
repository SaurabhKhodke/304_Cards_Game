const io = require('socket.io-client');

async function test() {
  // 1. Login
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ADMIN', password: 'admin@3490' })
  });
  const data = await res.json();
  if (!data.token) {
    console.error('Login failed', data);
    return;
  }
  console.log('Logged in as Admin. Token:', data.token);

  // 2. Connect socket
  const socket = io('http://localhost:3000', {
    auth: { token: data.token }
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    socket.emit('admin:subscribe', (ack) => {
      console.log('Subscribed:', ack);
    });
  });

  socket.on('admin:dashboardUpdate', (payload) => {
    console.log('Received dashboard update:', JSON.stringify(payload, null, 2));
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });
}

test().catch(console.error);
