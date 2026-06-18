const net = require('net');

const host = '192.168.28.18';
const startPort = 5400;
const endPort = 5500;

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    
    socket.on('connect', () => {
      console.log(`Port ${port} is OPEN`);
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

async function run() {
  console.log(`Scanning ${host} from port ${startPort} to ${endPort}...`);
  for (let port = startPort; port <= endPort; port++) {
    await checkPort(port);
  }
  console.log('Scan complete.');
}

run();
