// AFK Minecraft Bot + Web Dashboard
// Setup:  npm install mineflayer express socket.io
// Run:    node bot.js     -> dashboard: http://localhost:3000

const mineflayer = require('mineflayer');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// ====== CONFIG (apni details yahan daalo) ======
const CONFIG = {
  host: 'play.kelmora.cloud',
  port: 25584,
  username: 'YoYOHoneySingh',          // offline mode: koi bhi naam | microsoft: email
  auth: 'offline',              // 'offline' ya 'microsoft'
  version: false,               // false = auto detect, ya '1.20.4'
  password: 'HOney@123',     // /register aur /login ke liye (yaad rakhna, wahi use hota hai)
  reconnectDelay: 10000,        // ms
  dashboardPort: 3000,
};

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let bot = null;
let status = { online: false, health: 0, food: 0, pos: null };
let moveTimer = null;
let moveEnabled = false;
let logs = [];

function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logs.push(line);
  if (logs.length > 200) logs.shift();
  io.emit('log', line);
  console.log(line);
}

function pushStatus() {
  io.emit('status', status);
}

function startBot() {
  log(`Connecting to ${CONFIG.host}:${CONFIG.port} ...`);
  bot = mineflayer.createBot({
    host: CONFIG.host,
    port: CONFIG.port,
    username: CONFIG.username,
    auth: CONFIG.auth,
    version: CONFIG.version || undefined,
  });

  bot.once('spawn', () => {
    status.online = true;
    log('Bot spawn ho gaya.');
    pushStatus();
  });

  bot.on('health', () => {
    status.health = bot.health;
    status.food = bot.food;
    pushStatus();
  });

  bot.on('move', () => {
    if (bot.entity) {
      const p = bot.entity.position;
      status.pos = { x: p.x.toFixed(1), y: p.y.toFixed(1), z: p.z.toFixed(1) };
    }
  });

  let lastAuth = 0;
  bot.on('message', (m) => {
    const text = m.toString();
    log(text);
    // Server jo prompt dikhaye uske hisaab se register/login (5s cooldown)
    if (Date.now() - lastAuth < 5000) return;
    const t = text.toLowerCase();
    if (t.includes('/register') || t.includes('/reg ')) {
      lastAuth = Date.now();
      bot.chat(`/register ${CONFIG.password} ${CONFIG.password}`);
      log('Auto: /register bheja');
    } else if (t.includes('/login') || t.includes('/l ')) {
      lastAuth = Date.now();
      bot.chat(`/login ${CONFIG.password}`);
      log('Auto: /login bheja');
    }
  });

  bot.on('kicked', (reason) => log('Kicked: ' + reason));
  bot.on('error', (err) => log('Error: ' + err.message));

  bot.on('end', () => {
    status.online = false;
    pushStatus();
    log(`Disconnected. ${CONFIG.reconnectDelay / 1000}s baad reconnect...`);
    setTimeout(startBot, CONFIG.reconnectDelay);
  });
}

// Optional: halka sa jump/look (default OFF, dashboard se toggle)
function setMove(on) {
  moveEnabled = on;
  clearInterval(moveTimer);
  if (on) {
    moveTimer = setInterval(() => {
      if (!bot || !status.online) return;
      bot.setControlState('jump', true);
      setTimeout(() => bot && bot.setControlState('jump', false), 300);
      bot.look(Math.random() * Math.PI * 2, 0);
    }, 30000);
  }
  log('Auto-move: ' + (on ? 'ON' : 'OFF'));
  io.emit('move', moveEnabled);
}

// ====== Dashboard ======
const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>AFK Bot Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 body{font-family:system-ui;background:#111;color:#eee;margin:0;padding:16px;max-width:800px;margin:auto}
 .card{background:#1c1c1c;border-radius:10px;padding:12px;margin-bottom:12px}
 #log{height:300px;overflow:auto;font:13px monospace;white-space:pre-wrap}
 input{width:70%;padding:8px;border-radius:6px;border:1px solid #444;background:#222;color:#eee}
 button{padding:8px 12px;border:0;border-radius:6px;background:#3b82f6;color:#fff;cursor:pointer;margin:2px}
 button.red{background:#ef4444}
</style></head><body>
<h2>AFK Bot Dashboard</h2>
<div class="card" id="st">Status: loading...</div>
<div class="card"><div id="log"></div></div>
<div class="card">
 <input id="msg" placeholder="Chat ya /command likho" onkeydown="if(event.key==='Enter')send()">
 <button onclick="send()">Send</button>
</div>
<div class="card">
 <button onclick="socket.emit('toggleMove')">Toggle Auto-move</button>
 <button class="red" onclick="socket.emit('quit')">Disconnect (reconnect hoga)</button>
</div>
<script src="/socket.io/socket.io.js"></script>
<script>
 const socket = io(); const L = document.getElementById('log');
 const add = t => { L.textContent += t + '\\n'; L.scrollTop = L.scrollHeight; };
 socket.on('init', d => { d.logs.forEach(add); render(d.status); });
 socket.on('log', add);
 socket.on('status', render);
 function render(s){
  document.getElementById('st').textContent =
   (s.online ? 'Online' : 'Offline') + ' | HP: ' + s.health + ' | Food: ' + s.food +
   (s.pos ? ' | Pos: ' + s.pos.x + ', ' + s.pos.y + ', ' + s.pos.z : '');
 }
 function send(){ const i = document.getElementById('msg'); if(i.value){ socket.emit('chat', i.value); i.value=''; } }
</script></body></html>`;

app.get('/', (req, res) => res.send(HTML));

io.on('connection', (socket) => {
  socket.emit('init', { logs, status });
  socket.on('chat', (text) => {
    if (bot && status.online) {
      bot.chat(text);
      log('> ' + text);
    }
  });
  socket.on('toggleMove', () => setMove(!moveEnabled));
  socket.on('quit', () => bot && bot.quit());
});

// Dashboard sirf apne PC pe khulega (127.0.0.1). Bahar expose mat karna bina password ke.
server.listen(CONFIG.dashboardPort, '127.0.0.1', () =>
  log(`Dashboard: http://localhost:${CONFIG.dashboardPort}`)
);

startBot();