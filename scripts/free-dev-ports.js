const { execFileSync } = require('child_process');
const net = require('net');

const DEV_PORTS = [5001, 3000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getListeningPids = (port) => {
  try {
    const output = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });

    return output
      .split('\n')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0 && value !== process.pid);
  } catch (error) {
    return [];
  }
};

const isPortFree = (port) => new Promise((resolve) => {
  const server = net.createServer();

  server.once('error', () => resolve(false));
  server.once('listening', () => {
    server.close(() => resolve(true));
  });
  server.listen(port, '0.0.0.0');
});

const freePort = async (port) => {
  const pids = getListeningPids(port);
  if (pids.length === 0) return;

  console.log(`Freeing port ${port}: stopping PID${pids.length > 1 ? 's' : ''} ${pids.join(', ')}`);
  pids.forEach((pid) => {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      // Process may have exited between lsof and kill.
    }
  });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isPortFree(port)) return;
    await sleep(150);
  }

  throw new Error(`Port ${port} is still in use after stopping PID${pids.length > 1 ? 's' : ''} ${pids.join(', ')}`);
};

(async () => {
  for (const port of DEV_PORTS) {
    await freePort(port);
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
