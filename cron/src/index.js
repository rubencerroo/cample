/**
 * Despierta el repaso de avisos de Cample una vez por hora.
 *
 * No decide nada: la ruta `/api/cron/tick` es la que mira qué hora es en España, a quién le toca
 * hueco esta semana y si hay algo que contarle. Aquí solo se llama con el secreto compartido.
 */
export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      fetch(env.CAMPLE_URL, {
        method: 'POST',
        headers: { 'X-Cron-Secret': env.CRON_SECRET },
      })
        .then(async (r) => console.log('cron', r.status, await r.text()))
        .catch((e) => console.error('cron', e)),
    )
  },
}
