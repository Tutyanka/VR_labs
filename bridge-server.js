const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const ROOT = __dirname;

let latestPacket = {
  timestamp: Date.now(),
  gyro: { x: 0, y: 0, z: 0 },
  source: 'initial'
};

const sockets = new Set();

function numberFrom(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function findObjectByKeys(value, keys) {
  if (!value || typeof value !== 'object') return null;
  const lowerKeys = Object.keys(value).reduce((acc, key) => {
    acc[key.toLowerCase()] = key;
    return acc;
  }, {});

  if (keys.some(key => lowerKeys[key])) return value;

  for (const child of Object.values(value)) {
    const found = findObjectByKeys(child, keys);
    if (found) return found;
  }
  return null;
}

function firstArray(value, names) {
  if (!value || typeof value !== 'object') return null;
  for (const name of names) {
    const direct = value[name];
    if (Array.isArray(direct) && direct.length >= 3) return direct;
  }
  for (const child of Object.values(value)) {
    const found = firstArray(child, names);
    if (found) return found;
  }
  return null;
}

function normalizePacket(raw) {
  const timestamp = numberFrom(
    raw.timestamp,
    raw.time,
    raw.seconds_elapsed !== undefined ? raw.seconds_elapsed * 1000 : undefined,
    raw.loggingTime,
    raw.loggingSample
  ) || Date.now();

  const gyroObject = findObjectByKeys(raw, [
    'gyrox',
    'gyro_x',
    'rotationratex',
    'rotationrate_x',
    'x'
  ]);
  const gyroArray = firstArray(raw, ['gyro', 'gyroscope', 'rotationRate', 'rotation_rate']);
  const gyro = {
    x: numberFrom(
      raw.gyroX,
      raw.gyro_x,
      raw.rotationRateX,
      raw.rotation_rate_x,
      gyroObject && (gyroObject.gyroX ?? gyroObject.gyro_x ?? gyroObject.rotationRateX ?? gyroObject.rotation_rate_x ?? gyroObject.x),
      gyroArray && gyroArray[0],
      latestPacket.gyro && latestPacket.gyro.x,
      0
    ),
    y: numberFrom(
      raw.gyroY,
      raw.gyro_y,
      raw.rotationRateY,
      raw.rotation_rate_y,
      gyroObject && (gyroObject.gyroY ?? gyroObject.gyro_y ?? gyroObject.rotationRateY ?? gyroObject.rotation_rate_y ?? gyroObject.y),
      gyroArray && gyroArray[1],
      latestPacket.gyro && latestPacket.gyro.y,
      0
    ),
    z: numberFrom(
      raw.gyroZ,
      raw.gyro_z,
      raw.rotationRateZ,
      raw.rotation_rate_z,
      gyroObject && (gyroObject.gyroZ ?? gyroObject.gyro_z ?? gyroObject.rotationRateZ ?? gyroObject.rotation_rate_z ?? gyroObject.z),
      gyroArray && gyroArray[2],
      latestPacket.gyro && latestPacket.gyro.z,
      0
    )
  };

  const attitudeObject = findObjectByKeys(raw, ['roll', 'pitch', 'yaw']);
  const attitudeArray = firstArray(raw, ['attitude', 'euler', 'orientation']);
  const attitude = attitudeObject || attitudeArray ? {
    roll: numberFrom(raw.roll, attitudeObject && attitudeObject.roll, attitudeArray && attitudeArray[0]),
    pitch: numberFrom(raw.pitch, attitudeObject && attitudeObject.pitch, attitudeArray && attitudeArray[1]),
    yaw: numberFrom(raw.yaw, attitudeObject && attitudeObject.yaw, attitudeArray && attitudeArray[2])
  } : undefined;

  const quatObject = findObjectByKeys(raw, ['qw', 'qx', 'qy', 'qz', 'w']);
  const quatArray = firstArray(raw, ['quaternion', 'quat']);
  const quaternion = quatObject || quatArray ? {
    w: numberFrom(raw.qw, quatObject && (quatObject.qw ?? quatObject.w), quatArray && quatArray[0]),
    x: numberFrom(raw.qx, quatObject && (quatObject.qx ?? quatObject.x), quatArray && quatArray[1]),
    y: numberFrom(raw.qy, quatObject && (quatObject.qy ?? quatObject.y), quatArray && quatArray[2]),
    z: numberFrom(raw.qz, quatObject && (quatObject.qz ?? quatObject.z), quatArray && quatArray[3])
  } : undefined;

  const packet = { timestamp, gyro, raw };
  if (attitude && Object.values(attitude).every(Number.isFinite)) packet.attitude = attitude;
  if (quaternion && Object.values(quaternion).every(Number.isFinite)) packet.quaternion = quaternion;
  return packet;
}

function sendWs(socket, payload) {
  const body = Buffer.from(payload);
  const header = [];
  header.push(0x81);

  if (body.length < 126) {
    header.push(body.length);
  } else if (body.length < 65536) {
    header.push(126, body.length >> 8, body.length & 255);
  } else {
    header.push(127, 0, 0, 0, 0);
    header.push((body.length >>> 24) & 255, (body.length >>> 16) & 255, (body.length >>> 8) & 255, body.length & 255);
  }

  socket.write(Buffer.concat([Buffer.from(header), body]));
}

function serveFile(req, res) {
  const requestPath = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.normalize(path.join(ROOT, requestPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg'
    };
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        latestPacket = normalizePacket(JSON.parse(body || '{}'));
        res.writeHead(204);
        res.end();
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON', detail: err.message }));
      }
    });
    return;
  }

  if (req.url === '/latest') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(latestPacket));
    return;
  }

  serveFile(req, res);
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    ''
  ].join('\r\n'));

  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
  socket.on('error', () => sockets.delete(socket));
});

setInterval(() => {
  const payload = JSON.stringify(latestPacket);
  for (const socket of sockets) {
    if (socket.destroyed) {
      sockets.delete(socket);
      continue;
    }
    sendWs(socket, payload);
  }
}, 20);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PA2 bridge listening on http://0.0.0.0:${PORT}`);
  console.log(`Sensor Logger POST URL: http://<computer-ip>:${PORT}/sensor`);
});
