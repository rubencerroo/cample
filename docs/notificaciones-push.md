# Avisos al móvil (Web Push) — hecho

> Estado: **funcionando**. Este documento cuenta cómo está montado y, sobre todo, por qué está
> montado así: hay dos decisiones que se salen de lo que dice cualquier tutorial.

## Por qué

Cample tiene un problema de **ocasión**, no de producto: solo hay motivo para abrirla cuando toca
regalar, y eso son tres o cuatro veces al año por persona. Los avisos de dentro de la app
(`GET /badges`, `notifications`) solo se ven **si alguien la abre**, o sea que llegan justo a quien
ya no los necesita.

⚠️ **Nunca un aviso que hable de reservas** (regla 1). Un push del estilo «alguien ha cogido algo de
tu lista» sería la peor fuga posible: llega al bolsillo, no se puede retirar y lo lee cualquiera que
mire la pantalla. Por eso el diseño no tiene lista negra: **solo se empuja lo que alguien ha escrito
a mano** como texto de push en `notify()`.

## Las dos decisiones que se salen de lo normal

### 1. El cron no vive en Pages

Cloudflare **Pages Functions no soporta cron triggers**: `scheduled()` es de los Workers. La salida
es un Worker aparte y minúsculo en `cron/`, que se despierta cada hora y llama a
`POST /api/cron/tick` con una cabecera `X-Cron-Secret`. Toda la lógica sigue en `routes.ts`. El
Worker va en el plan gratuito y no toca el proyecto de Pages, así que ni la URL ni el binding de D1
corren riesgo.

### 2. Los avisos van sin contenido

Cifrar el cuerpo de un push (RFC 8291, `aes128gcm`) es con diferencia lo más difícil de hacer a mano
en un Worker. No hace falta: **un push puede ir vacío**, y entonces solo necesita la firma VAPID. El
service worker, al recibirlo, pide el texto a `GET /api/push/pending` con la cookie de sesión (mismo
origen, así que la cookie viaja).

Ventajas: no hay que cifrar nada, y el texto sale **en el idioma de la persona** en vez de en el de
quien provocó el aviso. La contrapartida: si el móvil está sin conexión justo en ese momento, el
aviso llega genérico («Tienes algo nuevo»). Con avisos de cumpleaños, irrelevante.

Lo único criptográfico que queda es firmar un JWT ES256 para VAPID (`src/server/push.ts`, ~20 líneas
de WebCrypto). La clave privada es solo el escalar `d`; las coordenadas `x` e `y` salen de la
pública, así que como secretos basta con las dos cadenas que da el generador.

## Ser pesado es la única forma de estropear esto

Todo lo demás se puede arreglar; que la familia apague los avisos, no. Por eso el repaso
(`POST /cron/tick`) es deliberadamente lento:

- **Como mucho un aviso cada 6 días** por persona (`users.push_last_at`), y en la práctica menos: si
  ese día no hay nada que contar, no se manda nada.
- **Cada persona tiene su hueco propio**, un día de la semana y una hora entre las 10 y las 20, que
  salen de `numeroDe(id + semana)`. Ni todo el mundo a la vez, ni la misma persona siempre a la
  misma hora, ni nada de madrugada. Como el número depende de la semana, el hueco baila solo.
- **El mensaje va cambiando**: seis clases de aviso, cada una con su clave en `push_sent` (por año,
  por mes o por semana). El cumpleaños de un amigo gana siempre porque es el único con fecha; el
  resto se barajan con la semana para que no salga siempre el mismo.

Las seis clases: cumple de un amigo (de 12 a 1 días antes, ventana ancha para que quepa el hueco
semanal), mi propio cumple con la lista casi vacía, novedades de mis amigos, gente que quizá
conozca, «están mirando tu lista» (mismas cautelas que `GET /me/pulse`: mínimo 3 amigos, nunca un
número ni quién) y lista vacía o parada.

Los avisos **reactivos** —solicitud de amistad, amistad aceptada, toque, colecta completa, mensajes
nuevos en una colecta— salen en el momento. El del chat está limitado a **uno por hora y colecta**,
y su aviso nace marcado como leído para no sumar también en el globito de Inicio.

## Piezas

```
src/server/push.ts       firma VAPID y envía (aviso vacío); borra las suscripciones muertas
src/server/avisos.ts     textos del repaso en es/en/fr (los redacta el servidor sin nadie delante)
src/server/routes.ts     /push/key, /push/subscribe, /push/unsubscribe, /push/state,
                         /push/pending y /cron/tick
public/sw.js             `push` y `notificationclick` (sigue sin cachear NADA)
src/push.ts              activar/desactivar desde el navegador
src/AvisosPrompt.tsx     la pantalla propia que explica los avisos antes del cuadro del sistema
cron/                    el Worker que despierta el repaso
```

Tablas: `push_subs` (una fila por aparato), `push_sent` (qué avisos del repaso ya se mandaron),
`users.push_lang` y `users.push_last_at`, y en `notifications` las columnas `push_state` (0 no se
empuja, 1 empujado sin recoger, 2 recogido) y `push_body`.

## Pedir el permiso

**El navegador solo lo pregunta una vez en la vida.** Si la persona dice que no, no hay vuelta atrás
desde la app. Por eso:

- Nunca se pide al entrar. Primero sale `AvisosPrompt`, que explica qué avisos va a recibir y que
  como mucho es uno a la semana; el cuadro del sistema solo aparece si dice que sí.
- Va el último de la cola de ventanas: guía → teléfono → instalar → avisos.
- **En iPhone solo funciona con la app añadida a la pantalla de inicio** (iOS 16.4+), así que allí no
  se ofrece hasta que está instalada.
- Hay interruptor en Ajustes desde el primer día. Al cerrar sesión se apaga la suscripción de ese
  aparato (tablet compartida de casa).

## Secretos

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y `CRON_SECRET`, en Pages y en `.dev.vars`.
Copia en `secrets.local.txt` (fuera de git).

⚠️ Si se pierde `VAPID_PRIVATE_KEY`, **todas las suscripciones dejan de valer** y hay que volver a
pedir el permiso a todo el mundo, que es justo lo que solo se puede hacer una vez. `CRON_SECRET`
tiene que ser el mismo en Pages y en el Worker de `cron/`. Sin claves puestas, el push no existe y
la app no lo ofrece en ningún sitio: nada revienta.

## Probarlo

No se puede probar del todo en local: el navegador exige HTTPS (salvo `localhost`) y los endpoints
de push son externos. El orden cómodo es Chrome de escritorio (se comporta como Android y tiene
`Application → Service Workers → Push` para disparar uno a mano), luego un Android, y el iPhone el
último — acordándose de instalarla antes o parecerá que está roto.

Para forzar el repaso sin esperar al hueco:

```bash
curl -X POST https://cample.pages.dev/api/cron/tick -H "X-Cron-Secret: <el secreto>"
```

Responde `{ ok, sent, candidates }`. Si `sent` es 0 casi siempre, es que está funcionando: la
mayoría de las horas no le toca a nadie.

## Alternativa descartada

Un correo o un SMS: no hay email en todo el sistema **a propósito** (ver `CLAUDE.md`) y el SMS cuesta
dinero. El push es gratis y no añade superficie de ataque remota.
