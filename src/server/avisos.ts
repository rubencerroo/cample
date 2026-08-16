/**
 * Textos de los avisos que escribe el servidor solo, sin nadie delante (el repaso semanal).
 *
 * Los avisos normales (`notify`) se redactan en el idioma de quien provoca el aviso, que es lo que
 * hay: se guardan ya escritos en la tabla. Estos otros no los provoca nadie, así que se redactan en
 * el idioma que la persona tenía puesto al activar los avisos (`users.push_lang`).
 *
 * **Casi todos tienen varias redacciones.** Un aviso que llega siempre con las mismas palabras se
 * lee como una máquina y se apaga a la tercera; con tres formas de decirlo, parece que alguien se
 * acuerda de ti. La que toca se elige con la semana y el id (ver `textoAviso`), así que dos avisos
 * seguidos de la misma clase tampoco suenan igual.
 *
 * ⚠️ Ninguno de estos textos habla nunca de reservas ni de colectas (regla 1). Un aviso llega a la
 * pantalla de bloqueo, lo lee quien esté al lado y no hay forma de retirarlo.
 */

export type LangAviso = 'es' | 'en' | 'fr'

type Tabla = Record<string, string | string[]>

const ES: Tabla = {
  'aviso.generico': 'Tienes algo nuevo en Cample',
  'aviso.prueba': 'Aviso de prueba: si lees esto, funciona.',

  'aviso.cumple': [
    'El cumple de {nombre} es dentro de {dias} días. Mira su lista con tiempo.',
    'Quedan {dias} días para el cumple de {nombre}. ¿Ya sabes qué le llevas?',
    'Dentro de {dias} días es el cumple de {nombre}. Su lista está aquí.',
  ],
  'aviso.cumpleManana': [
    'Mañana es el cumple de {nombre}.',
    'El cumple de {nombre} es mañana. Aún estás a tiempo de mirar su lista.',
  ],
  'aviso.navidad': [
    'Ya asoma la Navidad. Buen momento para mirar las listas de tu gente.',
    'La Navidad está cerca: échale un vistazo a lo que ha pedido tu familia.',
  ],
  'aviso.miCumple': [
    'Tu cumple es dentro de {dias} días y tu lista está casi vacía. Apunta algo.',
    'Se acerca tu cumple ({dias} días). Si apuntas un par de cosas, acertarán.',
    'Faltan {dias} días para tu cumple y nadie sabe qué regalarte. Apunta algo.',
  ],
  'aviso.novedades': [
    'Tus amigos han apuntado {n} cosas nuevas estos días.',
    'Hay {n} ideas nuevas en las listas de tu gente.',
    '{n} cosas nuevas por ver en las listas de tus amigos.',
  ],
  'aviso.sugerencias': [
    'Hay gente que quizá conozcas y aún no tienes en Cample.',
    'Puede que te falte alguien de tu familia en la lista de amigos.',
    'Hay caras conocidas por aquí que todavía no has agregado.',
  ],
  'aviso.pulso': [
    'Están mirando tu lista estos días. Si apuntas algo más, acertarán mejor.',
    'Alguien ha entrado a ver tu lista. Merece la pena tenerla al día.',
    'Tu lista se está mirando. Un par de ideas más y lo pones fácil.',
  ],
  'aviso.listaVacia': [
    'Tu lista está vacía. Con una sola cosa apuntada ya ayudas mucho.',
    'Aún no has apuntado nada. Vale lo primero que se te ocurra.',
    'Tu lista sigue en blanco. ¿Qué te haría ilusión?',
  ],
  'aviso.listaParada': [
    'Hace tiempo que no apuntas nada. ¿Se te ha ocurrido algo?',
    'Tu lista lleva meses igual. ¿Añadimos algo nuevo?',
    'Nada nuevo en tu lista desde hace mucho. Un minuto y queda al día.',
  ],
}

const EN: Tabla = {
  'aviso.generico': 'You have something new on Cample',
  'aviso.prueba': 'Test notification: if you can read this, it works.',

  'aviso.cumple': [
    "{nombre}'s birthday is in {dias} days. Have a look at their list.",
    "{dias} days to {nombre}'s birthday. Do you know what you are getting them?",
    "In {dias} days it is {nombre}'s birthday. Their list is right here.",
  ],
  'aviso.cumpleManana': [
    "Tomorrow is {nombre}'s birthday.",
    "{nombre}'s birthday is tomorrow. There is still time to check their list.",
  ],
  'aviso.navidad': [
    'Christmas is coming. A good time to look at your people’s lists.',
    'Christmas is close: have a look at what your family has asked for.',
  ],
  'aviso.miCumple': [
    'Your birthday is in {dias} days and your list is nearly empty. Add something.',
    'Your birthday is coming ({dias} days). Add a couple of things and they will get it right.',
    '{dias} days to your birthday and nobody knows what to get you. Add something.',
  ],
  'aviso.novedades': [
    'Your friends have added {n} new things lately.',
    'There are {n} new ideas on your people’s lists.',
    '{n} new things to look at on your friends’ lists.',
  ],
  'aviso.sugerencias': [
    'There are people you may know who are not on Cample with you yet.',
    'You may be missing someone from your family in your list of friends.',
    'There are familiar faces around here you have not added yet.',
  ],
  'aviso.pulso': [
    'People are looking at your list. Add something else and they will get it right.',
    'Someone has looked at your list. Worth keeping it up to date.',
    'Your list is being looked at. A couple more ideas and you make it easy.',
  ],
  'aviso.listaVacia': [
    'Your list is empty. Even one thing on it helps a lot.',
    'You have not added anything yet. The first thing that comes to mind will do.',
    'Your list is still blank. What would you like?',
  ],
  'aviso.listaParada': [
    'You have not added anything in a while. Thought of something?',
    'Your list has been the same for months. Shall we add something?',
    'Nothing new on your list for a long time. One minute and it is up to date.',
  ],
}

const FR: Tabla = {
  'aviso.generico': 'Tu as du nouveau sur Cample',
  'aviso.prueba': 'Avis de test : si tu lis ceci, ça marche.',

  'aviso.cumple': [
    "L'anniversaire de {nombre} est dans {dias} jours. Regarde sa liste.",
    "Encore {dias} jours avant l'anniversaire de {nombre}. Tu sais quoi lui offrir ?",
    "Dans {dias} jours, c'est l'anniversaire de {nombre}. Sa liste est ici.",
  ],
  'aviso.cumpleManana': [
    "Demain, c'est l'anniversaire de {nombre}.",
    "L'anniversaire de {nombre} est demain. Tu as encore le temps de voir sa liste.",
  ],
  'aviso.navidad': [
    'Noël approche. Bon moment pour regarder les listes de tes proches.',
    'Noël est proche : jette un œil à ce que ta famille a demandé.',
  ],
  'aviso.miCumple': [
    'Ton anniversaire est dans {dias} jours et ta liste est presque vide. Ajoute quelque chose.',
    'Ton anniversaire approche ({dias} jours). Ajoute deux ou trois idées.',
    'Encore {dias} jours avant ton anniversaire et personne ne sait quoi t’offrir.',
  ],
  'aviso.novedades': [
    'Tes amis ont ajouté {n} nouvelles choses ces jours-ci.',
    'Il y a {n} nouvelles idées sur les listes de tes proches.',
    '{n} nouveautés à voir sur les listes de tes amis.',
  ],
  'aviso.sugerencias': [
    'Il y a des personnes que tu connais peut-être et qui ne sont pas encore tes amis.',
    'Il manque peut-être quelqu’un de ta famille dans ta liste d’amis.',
    'Il y a par ici des visages connus que tu n’as pas encore ajoutés.',
  ],
  'aviso.pulso': [
    'On regarde ta liste ces jours-ci. Ajoute autre chose et ils viseront mieux.',
    'Quelqu’un est venu voir ta liste. Ça vaut le coup de la tenir à jour.',
    'Ta liste est consultée. Deux idées de plus et tu leur facilites la vie.',
  ],
  'aviso.listaVacia': [
    'Ta liste est vide. Une seule chose dessus aide déjà beaucoup.',
    'Tu n’as encore rien ajouté. La première idée qui vient fera l’affaire.',
    'Ta liste est toujours blanche. Qu’est-ce qui te ferait plaisir ?',
  ],
  'aviso.listaParada': [
    'Tu n’as rien ajouté depuis un moment. Une idée ?',
    'Ta liste n’a pas bougé depuis des mois. On ajoute quelque chose ?',
    'Rien de neuf sur ta liste depuis longtemps. Une minute et c’est à jour.',
  ],
}

const TABLAS: Record<LangAviso, Tabla> = { es: ES, en: EN, fr: FR }

/**
 * Traduce una clave de aviso. Los huecos van como {nombre}; si falta la clave, sale en español.
 *
 * Cuando hay varias redacciones, `semilla` elige cuál (es el mismo número que reparte los huecos
 * semanales, así que cambia sola cada semana). Sin semilla sale la primera, que es la más clara:
 * las alternativas están para no repetirse, no para lucirse.
 */
export function textoAviso(
  lang: string | null | undefined,
  clave: string,
  vars?: Record<string, string | number>,
  semilla = 0,
): string {
  const l = (lang ?? 'es').slice(0, 2).toLowerCase() as LangAviso
  const valor = (TABLAS[l] ?? ES)[clave] ?? ES[clave] ?? clave
  const plantilla = Array.isArray(valor) ? valor[semilla % valor.length] : valor
  if (!vars) return plantilla
  return plantilla.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}
