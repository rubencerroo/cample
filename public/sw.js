// Service worker mínimo: existe para que el navegador considere Cample instalable
// (Chrome exige un manejador de `fetch`) y para que funcione «Compartir con Cample».
// A propósito NO cachea nada: una respuesta mala guardada en caché se queda pegada
// y no hay forma cómoda de arreglarla en el móvil de otra persona.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
