# Avisos al móvil (Web Push) — propuesto, no hecho

> Estado: **idea con plan**. Nada de esto está implementado. Este documento existe para no tener
> que volver a pensarlo desde cero.

## Por qué

Cample tiene un problema de **ocasión**, no de producto: solo hay motivo para abrirla cuando toca
regalar, y eso son tres o cuatro veces al año por persona. Hoy los avisos (`GET /badges`,
`notifications`) solo se ven **si alguien abre la app**, y nadie la abre. Es un aviso que llega
únicamente a quien ya no lo necesita.

Web Push le da a la app un motivo para acordarse de la persona antes de que la persona se acuerde
de la app. Es, con diferencia, lo que más cambiaría el uso real.

Los tres avisos que valen la pena, por orden:

1. **«El cumple de Marta es en 10 días.»** El único aviso que convierte a Cample en algo útil sin
   que nadie tenga que acordarse de nada.
2. **«Llevas 5 meses sin tocar tu lista y tu cumple es en 3 semanas.»** Ataca directamente el
   motivo por el que la gente no apunta cosas: nadie se lo pide.
3. **Avisos que ya existen** y hoy se pierden: solicitud de amistad, mensaje nuevo en una colecta.

⚠️ **Nunca un aviso que hable de reservas** (regla 1). Un push del estilo «alguien ha cogido algo
de tu lista» sería la peor fuga posible: llega al bolsillo, no hay forma de retirarlo, y puede
leerlo cualquiera que mire la pantalla. Los avisos de colecta **jamás** van al dueño del regalo,
igual que ahora.

## Que encaja en el plan gratuito

Web Push **no necesita Durable Objects** (que es lo que dejó fuera el chat en tiempo real). Hace
falta:

- Un par de claves **VAPID** (se generan una vez, van como secretos de Pages).
- Una tabla de suscripciones.
- Un **Cron Trigger** diario que recorra cumpleaños y listas paradas, y mande lo que toque.

El envío es un `POST` cifrado al endpoint que da el navegador. Desde un Worker se puede hacer con
`fetch` y WebCrypto; hay librerías, pero la mayoría asumen Node y no valen tal cual.

## Soporte real

- **Android (Chrome)**: funciona, incluso sin instalar la app.
- **iPhone**: funciona **solo si la app está añadida a la pantalla de inicio** (iOS 16.4+). Esto
  encaja con `InstallPrompt`, que ya existe: en iPhone, el push es una razón de verdad para
  instalarla, y merece decirlo en ese modal.
- **Escritorio**: funciona en Chrome, Edge y Firefox.

O sea: hay que pedir el permiso **después** de instalar, no antes, y no dar por hecho que existe.

## Esquema

```sql
CREATE TABLE IF NOT EXISTS push_subs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,   -- la URL que da el navegador
  p256dh     TEXT NOT NULL,          -- claves de cifrado del navegador
  auth       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  failed_at  INTEGER                 -- para limpiar las que devuelven 404/410
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subs(user_id);
```

Una persona puede tener varias (móvil y ordenador), de ahí el `id` propio en vez de la clave por
usuario.

## Pasos

1. `POST /push/subscribe` y `DELETE /push/subscribe`, más un interruptor en Ajustes. **Con
   interruptor desde el primer día**: un aviso que no se puede apagar se apaga desinstalando.
2. `public/sw.js` deja de estar vacío: se le añaden `push` y `notificationclick`. Ojo con la nota
   del `CLAUDE.md` — **ahí no se cachea nada**, y eso sigue igual.
3. Envío desde el Worker (VAPID + cifrado del cuerpo).
4. Cron diario: cumpleaños a 10 días y listas paradas. Una tabla o columna de «ya avisado» para no
   repetir el mismo aviso cada día — es el fallo clásico de esto.
5. Enganchar los avisos que ya existen (`notify()`), pero **filtrando por tipo**: hoy `notify()`
   se usa también para cosas que no deben salir del móvil (todo lo de colectas hacia el dueño no
   se genera nunca, pero conviene una lista explícita de tipos que sí se empujan, no al revés).

## Trampas conocidas

- **Idioma**: las notificaciones ya se guardan redactadas (ver `CLAUDE.md`), así que el push
  heredará ese problema. Para los avisos del cron, que se generan en el servidor sin nadie
  delante, hay que decidir el idioma por persona: haría falta guardar `users.lang`, que hoy no
  existe (el idioma vive en `localStorage`).
- **Endpoints muertos**: un 404 o 410 al enviar significa que esa suscripción ya no vale y hay que
  borrarla. Si no se limpian, la tabla crece y el cron se hace lento.
- **No pedir el permiso al entrar**. Si se pide de golpe, la gente dice que no y ya no hay vuelta
  atrás: el navegador no lo vuelve a preguntar. Pedirlo cuando tenga sentido (justo después de
  instalar, o al abrir una colecta).

## Alternativa descartada

Un correo o un SMS: no hay email en todo el sistema **a propósito** (ver `CLAUDE.md`) y el SMS
cuesta dinero. El push es gratis y no añade superficie de ataque remota.
