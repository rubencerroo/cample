# Cample — lista de regalos privada para círculos cerrados

App web (móvil, tablet y PC) donde cada persona apunta lo que le gustaría recibir. Sus amigos
—y solo ellos— ven la lista y **reservan** regalos para repartírselos, sin que el destinatario se
entere de nada.

## Estado
**Desplegado y funcionando en https://cample.pages.dev** (D1 real, secretos puestos, **en uso por
la familia**: hay cuentas, regalos y amistades reales). Probado de punta a punta en local y en
producción.

⚠️ Antes de afirmar que la base está vacía, **contar de verdad** (`SELECT COUNT(*) FROM users`).
Una consulta filtrada devolviendo 0 no significa que no haya filas.

## Reglas de producto (NO romper)

1. **El dueño de una lista nunca ve información de reservas.** Ni cuántas, ni quién, ni cuándo.
   La API filtra esto en el servidor: `ownerView()` no incluye campos de reserva y `GET /gifts`
   (mi lista) jamás consulta `reservations`. Cualquier endpoint nuevo debe respetarlo.
2. **Entre amigos, la reserva es anónima.** Se muestra «ya lo lleva alguien» / cuántas unidades
   quedan, nunca la identidad. La excepción es uno mismo (`reservedByMe`).
3. **Solo el dueño marca «recibido»** (`POST /gifts/:id/received`). Es la única señal que emite.
4. **La cuenta-espía no se impide, se deja sin premio.** En la web abierta no hay forma de evitar
   que alguien se cree una segunda cuenta, así que la señal de reserva se gana: ver «ya lo lleva
   alguien» en la lista de un amigo exige 7 días de amistad **y** 2 amigos en común, o estar
   desbloqueado. Ver «Confianza» más abajo. (El DNI hacía este papel hasta agosto de 2026.)
5. **Lista privada**: solo amigos aceptados (relación mutua) leen `/lists/:username`.
6. **No explicar la trampa en los textos.** El copy de la app no menciona nunca «segunda cuenta»,
   «espiar» ni cómo funciona la protección: describir la defensa es sugerir el ataque. El DNI se
   presenta solo como «sirve para verificar que eres tú».
7. **Ser admin no da acceso a las reservas.** El panel de administración no expone nada de la
   tabla `reservations`, ni contadores globales: el admin también recibe regalos y cualquier cifra
   le destriparía su propia sorpresa. No añadir excepciones «solo para estadísticas».
8. **Accesibilidad ante todo**: la usan personas mayores. Texto base 17px, botones ≥48px,
   textos en español llano, sin jerga. Mantener este listón en cualquier pantalla nueva.

## Stack

- **Frontend**: React 18 + Vite + React Router + Tailwind v4 (`@tailwindcss/vite`). SPA, PWA
  básica (`public/manifest.webmanifest`).
- **Backend**: Hono sobre Cloudflare Pages Functions (`functions/api/[[path]].ts` delega en
  `src/server/routes.ts`).
- **BD**: Cloudflare D1 (SQLite), binding `DB`. Esquema en `schema.sql` (idempotente).
- **Hosting**: Cloudflare Pages con Wrangler. Todo dentro del plan gratuito.

## Mapa de ficheros

```
schema.sql                  esquema D1
wrangler.toml               config Pages + binding D1
functions/api/[[path]].ts   entrada de Pages Functions -> Hono
src/server/routes.ts        TODA la API (auth, amigos, regalos, reservas, avisos)
src/server/unfurl.ts        lee título/foto/precio de un enlace (con guardas anti-SSRF)
src/server/crypto.ts        PBKDF2 (contraseñas), HMAC (DNI), SHA-256 (sesiones)
src/server/dni.ts           validación DNI/NIE español
src/api.ts                  cliente HTTP tipado
src/App.tsx                 rutas + navegación (inferior en móvil, lateral en escritorio)
src/ui.tsx                  Avatar, Spinner, Empty, ErrorBox, money, useAsync, Reacciones, Dialogos
src/pages/                  Auth, Home, MyList, FriendList, Friends, Reservations, Settings
```

Rutas de la UI: `/`, `/mi-lista`, `/lista/:username`, `/amigos`, `/reservas`, `/ajustes`.

## Confianza: quién ve las reservas y cuándo

El ataque contra el que se defiende Cample es raro: **el atacante y la víctima son la misma
persona**. Alguien se crea una segunda cuenta, se agrega a sí mismo desde ella y ve su propia lista
«como amigo», con lo que se destripa la sorpresa. No hace falta ningún tercero. Lo que se daña no
es una persona sino la credibilidad de la app: si quien regala no se fía, la app no sirve.

`puedeVerReservas(env, viewer, owner)` decide si alguien ve el estado de reserva de una lista:

```
trust_level = 1   O   (amistad ≥ 7 días  Y  ≥ 2 amigos en común)
```

- ⚠️ **Solo mira a quien mira, jamás al dueño.** Fiarse del dueño sería darle la llave de su propia
  casa: su cuenta principal es de fiar y la falsa entraría por ahí. No añadir esa «simplificación».
- Los 2 amigos en común son lo que sostiene todo: una cuenta nueva no los puede fabricar sola,
  hacen falta dos personas reales que la acepten. Los 7 días solo matan el impulso.
- **Mientras el gate está cerrado tampoco se puede reservar ni ver/crear colectas** en esa lista
  (`403`, y `404` en `groupAccess`). Si se dejara reservar, el filtro se saltaría sondeando: los
  regalos que respondiesen «ya está reservado» serían justo los que se ocultan. Quien ya tenía algo
  cogido sí puede soltarlo.
- Los mismos criterios en SQL están en `VE_RESERVAS_SQL` (espera `?1` = quien mira, `?2` = el corte
  de antigüedad y una tabla `g` con `user_id`), y filtran las colectas de `GET /activity`.
- El copy es neutro (`friendList.waitingNotice`): «se abre cuando lleváis un tiempo». **No explicar
  de qué protege** (regla 6).

`trust_level` sube solo por dos vías: el registro de un admin, o el botón **«Desbloquear»** de
`/admin` (`POST /admin/users/:username/trust`). Es un juicio sobre la persona, no sobre la cuenta,
así que se puede retirar y surte efecto al momento. La verificación por SMS está pensada como
tercera vía pero **no está hecha**: sin envío real no hay nada que verificar.

`signup_signals` guarda `HMAC/SHA-256` de IP y User-Agent del registro. `GET /admin/users` marca
`suspicious` cuando dos cuentas comparten ese rastro **y son amigas entre sí** (que es justo la
forma del ataque). **No bloquea nada y no se le dice nunca al usuario**; es solo una señal para
mirar con calma.

⚠️ El DNI sigue existiendo en `users.dni_hash` para las cuentas viejas (con índice único parcial) y
se les sigue pidiendo al recuperar contraseña; las nuevas no lo tienen y ahí basta el usuario,
porque quien decide de verdad es el admin que aprueba a mano. Bases anteriores necesitan
`migrations/011_apertura.sql`, que además marca de fiar a todas las cuentas que ya existían.

## Enlace de invitación

`GET /invite` da el código propio (se crea al pedirlo) y `GET /invite/:code` dice quién invita, sin
sesión, para la pantalla de entrada. Quien se registra con `?invitacion=…` sale con esa amistad ya
aceptada.

**No es obligatorio y no debe serlo**: exigir invitación cerraría la red y mataría el boca a boca.
Es un acelerador, no un muro — una lista sin nadie alrededor no le dice nada a quien acaba de
llegar.

## Seguridad

- Contraseñas: PBKDF2-SHA256, 100k iteraciones, salt por usuario. **Workers rechaza más de
  100.000 iteraciones** (`NotSupportedError`); en local no falla, así que no subirlo «por mejorar».
- Sesión: token aleatorio de 32 bytes en cookie `cample_session` (HttpOnly, SameSite=Lax, Secure
  en https, 60 días). En BD solo se guarda `SHA-256(token + SESSION_PEPPER)`.
- CSRF: SameSite=Lax + verificación de `Origin` en todo método que escribe.
- Rate limit en tabla `rate_limits`: registro 5/h por IP, login 10/15min por IP+usuario.
- Cambiar contraseña cierra el resto de sesiones.
- Al dejar de ser amigos se borran las reservas cruzadas entre esas dos personas.
- Al editar/borrar un regalo reservado, se avisa a quien lo llevaba (`notifications`), **sin** que
  el dueño sepa que ese aviso ha existido.

### Secretos
`DNI_PEPPER` y `SESSION_PEPPER`. En local van en `.dev.vars` (ignorado por git). En producción:

```bash
npx wrangler pages secret put DNI_PEPPER
```

⚠️ Si `DNI_PEPPER` cambia, se pierde la unicidad de DNI de las cuentas ya creadas. Nunca rotarlo
sin migración. Si `SESSION_PEPPER` cambia, se cierran todas las sesiones (eso sí es asumible).

## Desarrollo

```bash
npm install
npm run db:local          # crea el esquema en la D1 local
npm run build && npx wrangler pages dev dist --port 8788
```

`npm run dev` (Vite en 5173) proxya `/api` a 8788, así que para trabajar en la UI conviene tener
los dos procesos. Typecheck: `npx tsc --noEmit`.

## Permisos: qué puede hacer Claude solo

**La sesión de PowerShell ya está autenticada** (Wrangler y git). Ruben autoriza a ejecutar el
ciclo completo **sin volver a preguntar en cada sesión**:

- `git add` / `commit` / `push` a `main`.
- Migraciones remotas: `npx wrangler d1 execute cample-db --remote -y --file=...`.
- Consultas a la base de producción, incluidas las de escritura puntuales.
- `npm run deploy`.

El orden es siempre el mismo: **git → migración remota (si toca `schema.sql`) → deploy**.

⚠️ Lo que sigue exigiendo avisar antes: **borrar o vaciar datos de producción**, rotar secretos, y
cualquier migración que **rehaga una tabla** (`DROP TABLE` + copia, como la 011). En ese último caso,
sacar antes una copia con `npx wrangler d1 execute` o `npx wrangler d1 export cample-db --remote
--output <fichero>` **fuera del repositorio** (lleva hashes de contraseñas: nunca en `git`).

## Control de versiones

Repositorio **privado** en `github.com/rubencerroo/cample`, rama `main`.

**Nada se despliega sin estar antes en git.** El orden de cada cambio es:

```bash
git add -A && git commit -m "..." && git push
```

y solo después `npm run deploy`. Si el cambio toca `schema.sql`, la migración remota va entre
medias (antes del deploy). Así siempre se puede volver a la versión anterior, que es justo lo que
faltaba: la app ya la usa la familia con datos reales.

⚠️ **`.dev.vars` y `secrets.local.txt` están en `.gitignore` y NO deben subirse nunca.** Los
peppers no se pueden recuperar de Cloudflare. Antes de un `git add -A` a lo bruto, comprobar:

```bash
git check-ignore -v .dev.vars secrets.local.txt
```

### Por qué el deploy no es automático desde git

El proyecto de Pages `cample` se creó por **subida directa** (`wrangler pages deploy`), no
conectado a un repositorio, y Cloudflare no permite convertir uno en otro. Conectarlo a git
exigiría crear un proyecto nuevo: cambiaría el subdominio (`cample.pages.dev` lo ocupa el actual,
y es la dirección que ya tiene la familia) y habría que rehacer el binding de D1 y volver a subir
los dos secretos. No compensa.

Si algún día se quiere «hago push y se despliega solo» **sin perder la URL**, la vía es un workflow
de GitHub Actions con `cloudflare/wrangler-action` apuntando a este mismo proyecto; hace falta
crear un API token de Cloudflare y guardarlo como secreto del repositorio. Propuesto, no hecho.

## Despliegue

Ya hecho: proyecto Pages `cample`, D1 `cample-db` (`database_id` en `wrangler.toml`), esquema
aplicado y ambos secretos subidos. Copia de respaldo de los peppers en `secrets.local.txt`
(ignorado por git — **no borrar ese fichero**: `DNI_PEPPER` no se puede recuperar de Cloudflare y
sin él no se puede migrar la base).

Para publicar cambios basta con:

```bash
npm run deploy
```

Si cambia `schema.sql`: `npm run db:remote` antes.

### Consultas a la base de producción

```bash
npx wrangler d1 execute cample-db --remote -y --command "SELECT COUNT(*) FROM users"
```

### Logs de producción

```bash
npx wrangler pages deployment list --project-name cample
```

y luego `npx wrangler pages deployment tail <id> --project-name cample --format pretty`. La API
devuelve siempre un mensaje genérico al usuario, así que **el error real solo se ve en el tail**.

## Regalos en grupo (colectas)

Alguien abre una colecta sobre un regalo de un amigo; el resto de amigos de esa persona se unen,
hablan por un chat privado y se reparten el coste.

- **Ocupación**: una colecta viva (`open` o `bought`) ocupa **una unidad** del regalo, igual que
  una reserva individual — ver `unitsTaken()`. Por eso no se puede reservar por libre algo que ya
  tiene colecta, ni al revés. Índice único parcial `idx_groups_one_open`: como mucho una colecta
  viva por regalo.
- **Invisible para el destinatario**: `groupAccess()` responde «no existe» (404, no 403) si quien
  pregunta es el dueño del regalo, aunque acierte el enlace. Los avisos de colecta jamás le llegan.
- **Dentro no hay anonimato**: los participantes se ven entre sí y ven quién ha puesto ya su parte;
  es imprescindible para coordinarse. Los amigos que aún no se han unido ven que existe, cuántos
  son y el objetivo, pero **no el chat**. Esto no rompe la regla 1 porque el dueño nunca entra.
- **Reparto**: `equal` (se recalcula solo al entrar o salir gente; el organizador absorbe los
  céntimos del redondeo, así la suma cuadra exacta) o `custom` (cada uno declara su aportación).
  «Ya puesto» es una marca manual de cada miembro: la app no mueve dinero.
- **Organizador**: quien la abre. Si se va, el relevo pasa al miembro más antiguo (también si deja
  de ser amigo del dueño, normalizado en `groupAccess`). Si se queda vacía, se cancela sola y el
  regalo vuelve a estar libre.
- **Chat**: `group_messages`, refresco por sondeo cada 8s con la pestaña visible. No hay
  WebSockets a propósito: Durable Objects se sale del plan gratuito.

Rutas: `/colecta/:id`. Las colectas propias aparecen también en `/reservas`.

## Regalos que no ve todo el mundo

Cada regalo tiene `gifts.visibility`: `all` (por defecto), `only` (lo ven **solo** las personas de
`gift_audience`) o `except` (lo ven todas **menos** ellas). Sirve para pedir algo sin que cierta
persona se entere, o para dejarlo a la vista de una sola.

- **Los nombres son solo del dueño.** `GET /gifts` devuelve `audience` con nombre y usuario;
  `GET /lists/:username` devuelve únicamente `visibility` y `audienceCount`. Un amigo nunca sabe a
  quién se le oculta un regalo. No añadir los nombres a ninguna vista ajena.
- **Sí se avisa de que está restringido**: distintivo `VisibilityChip` («Solo lo ves tú»,
  «Alguien no ve este regalo»), para que nadie lo mencione delante de quien no debe.
- **Filtro en el servidor**: fragmento `VISIBLE_SQL` (usa `?1` = quien mira) en `/lists/:username`
  y en el contador de `/feed`; `canSeeGift()` en reservar, crear colecta y `groupAccess()`, que
  responde 404 —nunca 403— para no confirmar que el regalo existe.
- **Al restringir a posteriori**, `purgeHidden()` quita la reserva o la plaza en la colecta de quien
  deja de verlo y le avisa con un texto neutro; si la colecta se queda vacía, se cancela sola.
- Si no queda nadie señalado, `setAudience()` devuelve el regalo a `all`: una restricción vacía no
  significa nada.
- Las filas de `gift_audience` sobreviven a dejar de ser amigos, a propósito: si se vuelven a
  agregar, la restricción sigue puesta.

⚠️ Bases creadas antes de esto necesitan `migrations/001_gift_visibility.sql` (`CREATE TABLE IF NOT
EXISTS` no añade columnas a una tabla que ya existe).

## Inicio: muro de actividad

`GET /activity` devuelve los 30 últimos sucesos de mis amigos, para que **Inicio no sea otra lista
de amigos** (eso ya es la pestaña Amigos). Tres tipos, unidos con `UNION ALL` y ordenados por fecha:

- `gift`: un amigo ha pedido algo nuevo.
- `received`: un amigo ha marcado un regalo como recibido (la única señal que emite el dueño).
- `group`: hay una colecta sobre el regalo de un amigo.

⚠️ **Lo que sostiene la privacidad aquí es que la CTE `amigos` no me incluye a mí**: por eso nunca
veo una colecta sobre un regalo mío ni actividad de mi propia lista. Los tres bloques pasan además
por `VISIBLE_SQL`, así que un regalo restringido no asoma. **Aquí no aparece ninguna reserva**
(regla 1) y no debe añadirse ninguna: sería la fuga más fácil de colar sin darse cuenta.

`GET /feed` sigue existiendo, pero ahora solo alimenta los cumpleaños próximos del inicio.

## Avisos en las pestañas

`GET /badges` devuelve `{home, friends, reservations, admin}`. Se calculan del **estado real**, no
de notificaciones marcadas: solicitudes de amistad pendientes, mensajes de colecta posteriores a
`group_members.last_read_at` (abrir la colecta la actualiza), y reseteos pendientes si eres admin.
`home` sí cuenta notificaciones sin leer. El frontend los refresca al navegar y cada 30 s.

## Fotos de perfil

El navegador recorta la foto a 256×256 y la comprime a JPEG (~20 KB) antes de subirla
(`fileToAvatarDataUrl`). Se guarda en la tabla **`avatars`, nunca en `users`**, para que ninguna
consulta normal arrastre los bytes. Se sirve en `GET /api/avatar/:username?v=<avatar_version>` con
caché inmutable: cambiar la foto sube `avatar_version` y por tanto la URL. Tope de 150 KB en el
servidor y validación estricta del data URL (solo jpeg/png/webp).

Con decenas de usuarios esto ocupa kilobytes; el panel de admin muestra cuánto. Si algún día
hubiera cientos de personas con fotos, el paso siguiente sería R2 (10 GB gratis), no agrandar D1.

⚠️ **Trampas de los BLOB en D1** (las dos rompieron las fotos y no se ven en local):
- Al escribir, `bind()` solo admite **ArrayBuffer**. Un `Uint8Array` falla en producción, pero el
  D1 local de miniflare lo acepta: en local parecía funcionar y en remoto no guardaba nada.
- Al leer, D1 devuelve el BLOB como **array de números**. Si se pasa tal cual a `Response`, se
  serializa como el texto «137,80,78,…» con un 200 y un tamaño plausible. Hay que convertirlo con
  `new Uint8Array(...)`. Comprobar el código de estado no basta: verificar los bytes.

⚠️ **`avatar_version` es un contador que SOLO sube**, y si hay foto puesta se guarda aparte en
`has_avatar`. Cuando al quitar la foto la versión volvía a 0, la siguiente foto reutilizaba la
dirección `?v=1` de la primera y el navegador servía de su caché la imagen antigua: parecía que
«subía la foto que le daba la gana». Nunca reiniciar ese contador.

Todas las respuestas de la API van con `Cache-Control: no-store` (middleware) salvo la foto, que
pone la suya. La caché de la foto es corta (`max-age=300, must-revalidate`) a propósito: con `immutable` a un
año, cualquier respuesta mala que entrara en la caché del navegador se quedaba pegada sin arreglo
posible. Y `Avatar` reinicia su estado de error cuando cambia la URL, para que un fallo puntual de
red no deje las iniciales fijas el resto de la sesión.

## Foto propia del regalo

Además de la que se saca del enlace (`gifts.image_url`), se puede subir una desde la galería, que es
la única vía para lo que no viene de una tienda. Mismo camino que los avatares: bytes en
**`gift_images`**, contador `gifts.image_version` que **solo sube**, y `has_image`. El navegador la
reduce a 640px de lado mayor y la comprime (`fileToGiftImageDataUrl`); **no se recorta a cuadrado**,
que un regalo alargado perdería justo lo que se quiere enseñar. `giftImageSrc()` decide cuál se
pinta: la subida manda sobre la del enlace.

⚠️ **`GET /gift-image/:id` va sin caché** (`private, no-store`), a diferencia del avatar. Una cara no
es un secreto, pero esta foto **sí dice qué ha pedido alguien**: con `max-age=300` la imagen se
quedaba en la caché del navegador y en la tablet compartida de casa la siguiente persona la sacaba
de ahí aunque el servidor le respondiera 404. Se comprobó de verdad; no volver a ponerle caché.
El endpoint además exige ser el dueño o amigo con `canSeeGift`, y responde 404 en vez de 403.

⚠️ Bases anteriores necesitan `migrations/012_gift_images.sql`.

## Cambiar el nombre de usuario

Copiado de Instagram, que es donde la gente ya ha aprendido cómo funciona:

- Como mucho **2 cambios cada 14 días** (`USERNAME_CAMBIOS` / `USERNAME_DIAS` en `routes.ts`).
- El nombre que sueltas **te queda reservado 14 días** (`username_history`): nadie más puede
  cogerlo, ni al cambiarse ni al registrarse.
- **Volver a un nombre propio reservado no gasta cambio**: arreglar una equivocación no se castiga.

`GET /me/username` devuelve cuántos cambios quedan y cuándo se libera el siguiente hueco.

⚠️ Bases anteriores necesitan `migrations/013_username_change.sql`.

## Instalar en el móvil y «Compartir con Cample»

- `public/sw.js` es un service worker **deliberadamente vacío** (solo un `fetch` que no hace nada):
  existe porque Chrome exige un manejador de `fetch` para considerar la app instalable y para que
  funcione el share target. **No cachear nada ahí**: una respuesta mala pegada en la caché de un
  móvil ajeno no hay forma de arreglarla (mismo motivo que la caché corta de los avatares).
- `src/InstallPrompt.tsx`: modal que invita a instalar. Solo en móvil, nunca si ya está instalada
  (`display-mode: standalone` / `navigator.standalone`), y al cerrarlo no vuelve en 30 días
  (`localStorage.cample_instalar_oculto`). En Android usa `beforeinstallprompt` (instalador real);
  en iPhone esa API no existe, así que solo explica el gesto Compartir → Añadir a pantalla de inicio.
  No se muestra a la vez que el onboarding.
- **Share target**: el manifiesto declara `share_target` GET a `/mi-lista` con `title`/`text`/`url`,
  así que Cample sale en el «Compartir con…» del sistema. `MyList` lee esos parámetros
  (`prefillDesdeCompartir`), abre el diálogo de nuevo regalo prellenado y limpia la URL. Muchas apps
  meten el enlace dentro de `text`, por eso se rescata con regex. **Solo Android**: iOS no soporta
  share_target (ahí hay que copiar y pegar el enlace).

## Guía de bienvenida (onboarding)

`src/pages/Onboarding.tsx`: 6 pasos, sale sola cuando `user.onboardingSeen < ONBOARDING_VERSION` y
se puede repetir desde Ajustes. Para volver a enseñársela a todo el mundo, subir
`ONBOARDING_VERSION`. **El texto no menciona nada técnico ni cómo se protege la sorpresa** (ver
regla 6): solo dice qué verá y qué no verá cada persona.

## Idiomas (español, inglés y francés)

- Sin librerías: `src/i18n.tsx` (proveedor + `useT()` + `translate()`) y los diccionarios planos
  `src/locales/es.ts`, `en.ts` y `fr.ts`. **El español es la referencia**: los demás están tipados
  como `Dict` (`typeof es`), así que olvidar una clave al traducir no compila. Huecos `{nombre}`.
- **Para añadir un idioma**: crear `src/locales/xx.ts` tipado como `Dict`, meterlo en `LANGS`,
  `DICTS` y `LOCALES` de `i18n.tsx`, y añadir su tabla en `src/server/messages.ts`. La detección
  automática y el selector de Ajustes salen solos de `LANGS` (ojo al `grid-cols-N` del selector).
- Elección: `localStorage.cample_lang` → `navigator.languages` → español. Se cambia en Ajustes y
  queda guardado. El proveedor mantiene también una variable de módulo (`getLang()`) porque
  `money()`, `birthdayLabel()` y el cliente HTTP la necesitan sin contexto de React.
- Fechas y moneda salen de `Intl` con `localeOf()`. Nada de listas de meses a mano.
- **Errores del servidor**: las rutas siguen escribiendo el mensaje en español y un middleware de
  `routes.ts` lo traduce al vuelo con la tabla de `src/server/messages.ts`, según el
  `Accept-Language` que manda `src/api.ts`. Se hizo así para no meter una clave en cada uno de los
  ~50 `c.json({ error })`. Si un mensaje nuevo no está en la tabla, sale en español (no rompe).
- ⚠️ **Las notificaciones (`notify()`) se guardan ya redactadas en la tabla `notifications`**, así
  que salen en el idioma en que se generaron y no se traducen a posteriori. Para arreglarlo habría
  que guardar clave + datos en vez de texto; hoy no compensa.

## Teléfono y agenda del móvil

- `users.phone_hash` es **opcional** y se guarda como `HMAC-SHA256(teléfono, DNI_PEPPER)`, igual que
  el DNI, con índice único parcial. El número **nunca** se guarda ni se devuelve en claro: por eso
  el campo de Ajustes sale siempre vacío y solo se sabe `hasPhone`. `normalizePhone`
  (`src/server/phone.ts`) lo lleva a `+34…` para que el mismo número escrito de cinco formas dé el
  mismo hash.
- **El teléfono NO sustituye al DNI.** El DNI sigue siendo lo único que garantiza una cuenta por
  persona (regla 4); un número se duplica o se falsea mucho más fácil. El teléfono solo sirve para
  encontrarse. No usarlo para entrar ni para recuperar contraseña.
- **Agenda**: `DesdeLaAgenda` en `Friends` usa el **Contact Picker** (`navigator.contacts.select`).
  Lo abre el sistema y la persona elige a mano; no hay forma de leer la agenda entera. **Solo Chrome
  de Android**: si la API no existe, el botón no se pinta (en iPhone nunca aparece).
  `POST /friends/from-contacts` normaliza y hashea los números, cruza contra `phone_hash` por trozos
  de 50 (D1 limita los parámetros) y devuelve solo a quien no es ya amigo ni tiene solicitud.
  **Los teléfonos recibidos no se guardan en ningún sitio**, ni en logs.
- `src/CompletarPerfil.tsx`: pide el teléfono a las cuentas creadas antes de esto. «Ahora no» lo
  calla 30 días (`localStorage.cample_telefono_oculto`). `telefonoPendiente()` existe para que `App`
  no apile dos ventanas: guía → teléfono → instalar.

⚠️ Bases anteriores necesitan `migrations/009_phone.sql`.

## Sugerencias de amistad

`GET /friends/suggestions`: primero amigos de mis amigos ordenados por amigos en común, y si no
llegan a 12, se completa con gente de la red que aún no he agregado (la red es un círculo familiar
cerrado, así que no hay problema de privacidad). Excluye a quien ya es amigo o tiene una solicitud
pendiente en cualquier dirección.

## Cumpleaños

Se guardan como `DD-MM` (`normalizeBirthday` acepta `24-12`, `24/12`, `3-4`…). Los ven los amigos
en la cabecera de la lista, y el inicio destaca los que caen dentro de 60 días.

## Administración

- Admins: los usuarios listados en `ADMIN_USERNAMES` (`[vars]` de `wrangler.toml`, hoy
  `rubencerroo`) se marcan como admin **al registrarse**. Para ascender a alguien que ya existe:
  `npx wrangler d1 execute cample-db --remote -y --command "UPDATE users SET is_admin=1 WHERE username='x'"`.
- Pestaña `/admin` (visible solo para admins): estadísticas, ocupación de la base (el tamaño real
  sale de `meta.size_after` de cualquier consulta D1, contra el límite de 5 GB del plan gratuito),
  aprobar reseteos de contraseña y gestionar personas (desactivar, reactivar, borrar). Nunca
  reservas ni colectas ajenas (regla 7).
- **Buzón de fallos y sugerencias**: cualquiera manda texto libre desde Ajustes (`POST /feedback`,
  tope 10/h por persona, 2000 caracteres). Los admins lo leen en la pestaña «Buzón» de `/admin`,
  con quién lo escribió, y pueden marcarlo resuelto o borrarlo. Cuenta en el aviso de la pestaña.
  El formulario avisa de no contar ahí qué regalo lleva uno: es texto libre y lo lee una persona,
  o sea que es la única vía por la que podría colarse algo de reservas.
- **Recuperación de contraseña**: la persona la pide con usuario + DNI (`/auth/reset/request`,
  respuesta siempre idéntica para no confirmar si un DNI existe). Un admin la aprueba en `/admin`
  y ve **una sola vez** un código de 8 caracteres sin letras ambiguas, válido 1 hora y de un solo
  uso, que dicta por teléfono. Con él, la persona pone contraseña nueva y se cierran todas sus
  sesiones. Conocer el DNI de alguien no basta: hace falta que un humano apruebe.

## Que la gente vuelva (captura, pulso y reacciones)

El problema de Cample no es de producto sino de **frecuencia**: se abre cuando toca regalar, y el
deseo (lo que uno querría recibir) nace fuera de la app. Tres piezas atacan eso:

### Rellenar un regalo desde un enlace

`GET /unfurl?url=` (`src/server/unfurl.ts`) descarga la página y saca `og:title`, `og:image` y
`og:price`. En el diálogo de nuevo regalo el **enlace va primero**, con un botón «Pegar» (lee el
portapapeles) y otro de rellenar. Si el regalo llega desde «Compartir con Cample», se intenta leer
solo y **en silencio**: si falla, la persona escribe y ya, sin ver ningún error que no ha pedido.

⚠️ Esto hace que el servidor descargue una dirección elegida por el usuario (SSRF). `hostPermitido()`
rechaza IP literales, `localhost` y dominios internos, y la descarga está acotada a 6 s y 512 KB.
**No relajar eso** para «que funcione con más tiendas». Límite de 60/h por persona.

### Pulso de mi propia lista

`GET /me/pulse` devuelve `views` (**un rango**: `none|few|some|many`), `myGifts` y `friendsAvg`.
Existe porque la regla 1 deja al dueño a ciegas: si además no ve señal ninguna, deja de apuntar
cosas y la lista se muere. Sale en `MyList` como una tarjeta.

⚠️ **`views` es `null` si tengo menos de 3 amigos**: con dos, cualquier cifra señala a una persona
concreta. Y nunca se devuelve el número exacto ni quién ha entrado. Las visitas se guardan en
`list_views`, una fila por persona y día, desde `GET /lists/:username`.

### Reacciones

`gift_reactions`, una por persona y regalo, cuatro emojis (`EMOJIS` en `routes.ts`). **El dueño SÍ
las ve**, con nombres: es la única señal alegre que recibe de vuelta y no dice nada de reservas.

- La interfaz avisa **antes** de que la reacción la verá el dueño (`friendList.reactionNotice`).
  Nadie debe reaccionar creyendo que hace algo privado. **No convertirlas nunca en anónimas**: una
  reacción anónima sí se leería como «alguien ha cogido esto».
- Queda una fuga por deducción (quien reacciona puede acabar siendo quien regala). Es consciente y
  es el precio de que la lista no sea un pozo.
- Se comparan quitando el selector de variación (U+FE0F): `❤️` y `❤` son el mismo emoji y según el
  teclado llega uno u otro. Se guarda siempre la forma canónica de `EMOJIS`.
- Al dejar de ser amigos se borran las reacciones cruzadas (a diferencia de `gift_audience`).

### Toque («pídele que apunte algo»)

`POST /nudge/:username` manda un aviso normal y corriente. Sale en la lista de un amigo cuando
tiene menos de 3 regalos pendientes. Como mucho uno por semana y pareja. No insinúa nada de
reservas: solo dice que alguien quiere acertar.

⚠️ Bases anteriores necesitan `migrations/010_engagement.sql`.

📄 Los avisos al móvil (Web Push) están **propuestos y sin hacer**: ver `docs/notificaciones-push.md`.

## Ventanas de confirmar y avisar

`DialogosProvider` + `useDialogos()` en `src/ui.tsx`, montado en `main.tsx`. Sustituye a
`confirm()` y `alert()` del navegador, que en escritorio salen pegados arriba con letra y botones
minúsculos y se saltan el listón de accesibilidad de la regla 8.

```ts
if (await confirmar({ title: '¿Borrar «X»?', confirmLabel: 'Borrar', danger: true })) …
await avisar(t('common.problem'), e.message)
```

**No volver a usar `confirm()` ni `alert()`**: el foco entra en la opción segura, Escape cancela y
los botones miden 48px.

## Layout

Contenedores: header y cuerpo con `max-w-6xl` centrado; barra lateral `w-56` visible desde `md`;
`main` con `max-w-3xl`. En móvil, barra de pestañas fija abajo. No meter la barra lateral dentro
del contenedor estrecho: eso fue lo que hacía que en escritorio se viera todo comprimido.

## Decisiones tomadas (y por qué)

- **Fuera el DNI del registro (agosto 2026)**: funcionaba en una familia porque había confianza
  previa, pero para un desconocido pedir el documento es una barrera enorme, solo sirve en España y
  mete de lleno en el RGPD. La defensa pasó a ser social (ver «Confianza»). El SMS se descartó
  igual que antes: cuesta dinero y el código es una barrera real para los mayores.
- **Sin email en todo el sistema**: por eso la recuperación de contraseña pasa por un admin humano
  en vez de por un enlace por correo. Es más lento, pero no añade superficie de ataque remota y
  para una familia el canal (una llamada) ya existe.
- **`quantity` no es un lote**: pedir 4 copas significa 4 unidades repartibles. Cada persona elige
  cuántas se lleva (`reservations.units`), desde una hasta todas las libres, y puede cambiar su
  cantidad después. El tope se calcula con `unitsTaken(env, giftId, exceptUserId)`, que descuenta
  las que ya tenía cogidas esa misma persona para que pueda subir o bajar sin bloquearse a sí misma.
  Una colecta ocupa siempre **una** unidad.
- **Avisos en vez de bloqueo**: el dueño puede editar o borrar un regalo aunque esté reservado
  (impedirlo delataría la reserva). Se avisa al que lo llevaba.

## Puntos de fuga conocidos / pendientes

- **Fuga por deducción**: si alguien borra un regalo y luego el dueño pregunta, no hay filtración
  técnica, pero sí social. Nada que hacer en código.
- **Sesiones caducadas** no se limpian solas; añadir un borrado periódico si la tabla crece.
- **Imágenes de los regalos**: solo por URL externa. Las fotos de perfil sí se suben (ver arriba).
- **Rate limit de registro**: cuenta solo los intentos ya validados (20/h por IP), porque antes un
  DNI mal tecleado gastaba intentos y bloqueaba a familias que comparten wifi.
- **Chat por sondeo** cada 8 s, no en tiempo real: los WebSockets exigen Durable Objects, de pago.
