const { createControllers } = require('./controllers');
const { createRoutes } = require('./routes');

const routes = createRoutes(createControllers());
for (const route of routes) {
  console.log(`${route.method.padEnd(6)} ${route.path.padEnd(42)} ${route.action}`);
}
console.log(`\nroutes: ${routes.length}`);
