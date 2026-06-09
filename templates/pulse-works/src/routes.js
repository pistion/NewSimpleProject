export const routes = [
  { path: '/', title: 'Home' },
  { path: '/shop', title: 'Shop' },
  { path: '/product', title: 'Product' },
  { path: '/lookbook', title: 'Lookbook' },
  { path: '/studio', title: 'Studio' },
  { path: '/contact', title: 'Contact' }
];

export function routeFor(pathname) {
  return routes.find((route) => route.path === pathname) || routes[0];
}
