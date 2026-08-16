// Service worker mínimo: existe para que el navegador considere Cample instalable
// (Chrome exige un manejador de `fetch`), para que funcione «Compartir con Cample»
// y para recibir los avisos al móvil.
// A propósito NO cachea nada: una respuesta mala guardada en caché se queda pegada
// y no hay forma cómoda de arreglarla en el móvil de otra persona.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})

// Los avisos llegan VACÍOS a propósito (así no hay que cifrar el cuerpo, ver src/server/push.ts):
// el texto se pide aquí a la API, que responde con la cookie de sesión de este mismo origen y en el
// idioma de la persona. Si no hay red en ese momento, el aviso sale genérico y no pasa nada.
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let cuerpo = 'Tienes algo nuevo'
      let link = '/'
      try {
        const r = await fetch('/api/push/pending', { credentials: 'include' })
        if (r.ok) {
          const d = await r.json()
          if (d.body) cuerpo = d.body
          if (d.link) link = d.link
        }
      } catch {}
      await self.registration.showNotification('Cample', {
        body: cuerpo,
        icon: '/icon.svg',
        badge: '/icon.svg',
        data: { link },
        tag: 'cample',
      })
    })(),
  )
})

// Al tocar el aviso: si Cample ya está abierta se reutiliza esa ventana, y si no se abre una.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'
  event.waitUntil(
    (async () => {
      const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of clientes) {
        if (new URL(c.url).origin === self.location.origin) {
          await c.focus()
          if ('navigate' in c) await c.navigate(link).catch(() => {})
          return
        }
      }
      await self.clients.openWindow(link)
    })(),
  )
})
