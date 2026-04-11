self.addEventListener('install', (e) => {
  console.log('[FarmaStock] Service Worker instalado');
});

self.addEventListener('fetch', (e) => {
  // Permite que la app siga funcionando con normalidad
});