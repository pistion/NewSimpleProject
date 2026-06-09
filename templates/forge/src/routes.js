export const routes = [
  { path: '/', title: 'Home' },
  { path: '/shop', title: 'Shop' },
  { path: '/product', title: 'Product' },
  { path: '/repair', title: 'Repair' },
  { path: '/field-notes', title: 'Field Notes' },
  { path: '/support', title: 'Support' }
];

export function routeFor(pathname) {
  return routes.find((route) => route.path === pathname) || routes[0];
}
