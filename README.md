# Cample

Lista de regalos privada para familia y amigos. Cada persona apunta lo que le gustaría recibir, sus amigos reservan regalos para repartírselos y el destinatario no se entera de nada.

**En producción:** https://cample.pages.dev, en uso real por una familia.

## Stack

- **Frontend:** React 18, Vite, Tailwind v4 (PWA instalable)
- **API:** Hono sobre Cloudflare Pages Functions
- **Datos:** Cloudflare D1 (SQLite) con migraciones versionadas en `migrations/`
- **Notificaciones:** Web Push y tareas programadas (`cron/`)

## Reglas de producto que se aplican en el servidor

1. **El dueño de una lista nunca ve información de reservas:** ni cuántas, ni quién, ni cuándo. La API no le devuelve esos campos.
2. **Entre amigos, la reserva es anónima:** se ve «ya lo lleva alguien» y las unidades que quedan, nunca quién lo ha reservado.
3. **Las cuentas espía no se pueden impedir, pero no ganan nada:** para ver reservas hace falta confianza (antigüedad de la amistad y amigos en común).

## Accesibilidad

Está pensada también para personas mayores: el texto mide como mínimo 17 px, los botones 48 px y los flujos son cortos.

## Desarrollo

```bash
npm install
npm run dev                 # frontend
npx wrangler pages dev dist # web + API en local
```

Los secretos (VAPID, etc.) se definen con `wrangler pages secret put` y nunca se versionan.
