const path = require('path');
const { createNativeServer } = require('./server/create-native-server');

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';
const staticDir = path.resolve(__dirname, '../../frontend');
const server = createNativeServer({ staticDir });

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the other server or set PORT to a different value.`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`HEYA API server running at http://${host}:${port}`);
  console.log(`Health check: http://localhost:${port}/api/health`);
  console.log(`Frontend: http://localhost:${port}`);
  console.log(`Mounted routes: ${server.routes.length}`);
});

module.exports = server;
