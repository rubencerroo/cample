import app from '../../src/server/routes'
import type { Env } from '../../src/server/routes'

export const onRequest: PagesFunction<Env> = (ctx) =>
  app.fetch(ctx.request, ctx.env, {
    waitUntil: ctx.waitUntil.bind(ctx),
    passThroughOnException: ctx.passThroughOnException.bind(ctx),
    props: {},
  } as ExecutionContext)
