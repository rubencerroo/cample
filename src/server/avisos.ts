/**
 * Textos de los avisos que escribe el servidor solo, sin nadie delante (el repaso semanal).
 *
 * Los avisos normales (`notify`) se redactan en el idioma de quien provoca el aviso, que es lo que
 * hay: se guardan ya escritos en la tabla. Estos otros no los provoca nadie, así que se redactan en
 * el idioma que la persona tenía puesto al activar los avisos (`users.push_lang`).
 *
 * ⚠️ Ninguno de estos textos habla nunca de reservas ni de colectas (regla 1). Un aviso llega a la
 * pantalla de bloqueo, lo lee quien esté al lado y no hay forma de retirarlo.
 */

export type LangAviso = 'es' | 'en' | 'fr'

type Tabla = Record<string, string>

const ES: Tabla = {
  'aviso.generico': 'Tienes algo nuevo en Cample',
  'aviso.cumple': 'El cumple de {nombre} es dentro de {dias} días. Mira su lista con tiempo.',
  'aviso.cumpleManana': 'Mañana es el cumple de {nombre}.',
  'aviso.miCumple': 'Tu cumple es dentro de {dias} días y tu lista está casi vacía. Apunta algo.',
  'aviso.novedades': 'Tus amigos han apuntado {n} cosas nuevas estos días.',
  'aviso.novedadesUno': '{nombre} ha apuntado cosas nuevas en su lista.',
  'aviso.sugerencias': 'Hay gente que quizá conozcas y aún no tienes en Cample.',
  'aviso.pulso': 'Están mirando tu lista estos días. Si apuntas algo más, acertarán mejor.',
  'aviso.listaParada': 'Hace tiempo que no apuntas nada. ¿Se te ha ocurrido algo?',
  'aviso.listaVacia': 'Tu lista está vacía. Con una sola cosa apuntada ya ayudas mucho.',
}

const EN: Tabla = {
  'aviso.generico': 'You have something new on Cample',
  'aviso.cumple': "{nombre}'s birthday is in {dias} days. Have a look at their list.",
  'aviso.cumpleManana': "Tomorrow is {nombre}'s birthday.",
  'aviso.miCumple': 'Your birthday is in {dias} days and your list is nearly empty. Add something.',
  'aviso.novedades': 'Your friends have added {n} new things lately.',
  'aviso.novedadesUno': '{nombre} has added new things to their list.',
  'aviso.sugerencias': 'There are people you may know who are not on your list of friends yet.',
  'aviso.pulso': 'People are looking at your list. Add something else and they will get it right.',
  'aviso.listaParada': 'You have not added anything in a while. Thought of something?',
  'aviso.listaVacia': 'Your list is empty. Even one thing on it helps a lot.',
}

const FR: Tabla = {
  'aviso.generico': 'Tu as du nouveau sur Cample',
  'aviso.cumple': "L'anniversaire de {nombre} est dans {dias} jours. Regarde sa liste.",
  'aviso.cumpleManana': "Demain, c'est l'anniversaire de {nombre}.",
  'aviso.miCumple':
    'Ton anniversaire est dans {dias} jours et ta liste est presque vide. Ajoute quelque chose.',
  'aviso.novedades': 'Tes amis ont ajouté {n} nouvelles choses ces jours-ci.',
  'aviso.novedadesUno': '{nombre} a ajouté de nouvelles choses à sa liste.',
  'aviso.sugerencias': 'Il y a des personnes que tu connais peut-être et qui ne sont pas encore tes amis.',
  'aviso.pulso': 'On regarde ta liste ces jours-ci. Ajoute autre chose et ils viseront mieux.',
  'aviso.listaParada': "Tu n'as rien ajouté depuis un moment. Une idée ?",
  'aviso.listaVacia': 'Ta liste est vide. Une seule chose dessus aide déjà beaucoup.',
}

const TABLAS: Record<LangAviso, Tabla> = { es: ES, en: EN, fr: FR }

/** Traduce una clave de aviso. Los huecos van como {nombre}; si falta la clave, sale en español. */
export function textoAviso(
  lang: string | null | undefined,
  clave: string,
  vars?: Record<string, string | number>,
): string {
  const l = (lang ?? 'es').slice(0, 2).toLowerCase() as LangAviso
  const plantilla = (TABLAS[l] ?? ES)[clave] ?? ES[clave] ?? clave
  if (!vars) return plantilla
  return plantilla.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}
