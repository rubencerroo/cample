/**
 * Traducción de los mensajes de error de la API.
 *
 * En vez de meter una clave de idioma en cada una de las ~50 respuestas de `routes.ts`, el
 * middleware `traducirErrores` intercepta la respuesta y cambia el campo `error` usando esta
 * tabla, que va del español (el idioma en el que están escritas las rutas) a cada idioma. Así el
 * código de las rutas no se toca y añadir un error nuevo sigue siendo escribir el texto en
 * español; si falta aquí, se devuelve en español en lugar de romperse.
 */
const EN: Record<string, string> = {
  'Cuéntanos un poco más': 'Tell us a bit more',
  'Demasiadas cuentas nuevas desde aquí. Prueba dentro de un rato.':
    'Too many new accounts from here. Try again in a while.',
  'Demasiados intentos, prueba dentro de un rato': 'Too many attempts, try again in a while',
  'El DNI o NIE no es válido. Revísalo (número + letra)':
    'That ID number is not valid. Check it (numbers + letter)',
  'El código no es correcto o ha caducado': 'That code is wrong or has expired',
  'Esa reacción no vale': 'That reaction is not allowed',
  'Ese enlace no vale. Copia la dirección de la página del producto.':
    'That link will not do. Copy the address of the product page.',
  'Has probado con muchos enlaces seguidos. Prueba dentro de un rato.':
    'You have tried many links in a row. Try again in a while.',
  'No he podido leer esa página. Escríbelo a mano.':
    'I could not read that page. Please type it in yourself.',
  'No puedes darte un toque a ti mismo': 'You cannot nudge yourself',
  'No puedes reaccionar a tus propios regalos': 'You cannot react to your own presents',
  'Ya le has dado un toque hace poco. Espera unos días.':
    'You nudged them recently. Wait a few days.',
  'El enlace debe empezar por http:// o https://': 'The link must start with http:// or https://',
  'El nombre no puede estar vacío': 'Your name cannot be empty',
  'El usuario debe tener 3-20 letras, números, punto o guion bajo':
    'The username must be 3-20 letters, numbers, dots or underscores',
  'Esa colecta no existe': 'That group present does not exist',
  'Esa imagen no vale. Prueba con otra foto.': 'That image will not do. Try another photo.',
  'Esa solicitud ya no está pendiente': 'That request is no longer pending',
  'Escribe algo': 'Write something',
  'Escribe tu nombre (2-40 caracteres)': 'Write your name (2-40 characters)',
  'Ese nombre de usuario ya está cogido': 'That username is already taken',
  'Ese regalo ya está cogido': 'That present is already taken',
  'Ese regalo ya está recibido': 'That present has already been received',
  'Ese teléfono no parece válido. Escríbelo con los 9 dígitos.':
    'That phone number does not look valid. Write all 9 digits.',
  'Ese teléfono ya está puesto en otra cuenta': 'That phone number is already on another account',
  'Esta colecta ya está cerrada': 'This group present is already closed',
  'Esta es tu propia lista': 'This is your own list',
  'Ha ocurrido un error, inténtalo de nuevo': 'Something went wrong, please try again',
  'Has alcanzado el máximo de regalos': 'You have reached the maximum number of presents',
  'Has enviado varios mensajes seguidos. Prueba dentro de un rato.':
    'You have sent several messages in a row. Try again in a while.',
  'La contraseña actual no es correcta': 'Your current password is not correct',
  'La contraseña necesita al menos 8 caracteres': 'The password needs at least 8 characters',
  'La foto es demasiado grande': 'That photo is too big',
  'La nueva contraseña necesita 8 caracteres': 'The new password needs 8 characters',
  'No autorizado': 'Not allowed',
  'No encontrado': 'Not found',
  'No existe ese usuario': 'No such user',
  'No hay ninguna solicitud pendiente': 'There is no pending request',
  'No puedes agregarte a ti mismo': 'You cannot add yourself',
  'No puedes borrar tu propia cuenta': 'You cannot delete your own account',
  'No puedes desactivarte a ti mismo': 'You cannot disable yourself',
  'No puedes organizar tu propio regalo': 'You cannot organise your own present',
  'No puedes reservarte tus propios regalos': 'You cannot reserve your own presents',
  'No puedes ver esta colecta': 'You cannot see this group present',
  'No sois amigos': 'You are not friends',
  'Pon cuánto va a costar el regalo': 'Say how much the present will cost',
  'Ponle un nombre al regalo': 'Give the present a name',
  'Sin foto': 'No photo',
  'Solo puedes ver la lista de tus amigos': 'You can only see your friends’ lists',
  'Solo quien organiza puede cambiar esto': 'Only the organiser can change this',
  'Usuario o contraseña incorrectos': 'Wrong username or password',
  'Ya está reservado': 'It is already reserved',
  'Ya existe una cuenta con ese DNI. Solo se permite una por persona.':
    'There is already an account with that ID number. Only one per person is allowed.',
  'Ya hay una colecta para ese regalo': 'There is already a group present for that item',
  'no autenticado': 'not signed in',
  'origen no permitido': 'origin not allowed',
  'Únete a la colecta para ver esto': 'Join the group present to see this',
}

const FR: Record<string, string> = {
  'Cuéntanos un poco más': 'Dis-nous en un peu plus',
  'Demasiadas cuentas nuevas desde aquí. Prueba dentro de un rato.':
    'Trop de nouveaux comptes depuis ici. Réessaie dans un moment.',
  'Demasiados intentos, prueba dentro de un rato': 'Trop de tentatives, réessaie dans un moment',
  'El DNI o NIE no es válido. Revísalo (número + letra)':
    "Ce numéro de pièce d'identité n'est pas valide. Vérifie-le (chiffres + lettre)",
  'El código no es correcto o ha caducado': "Ce code est incorrect ou a expiré",
  'Esa reacción no vale': "Cette réaction n'est pas autorisée",
  'Ese enlace no vale. Copia la dirección de la página del producto.':
    'Ce lien ne convient pas. Copie l’adresse de la page du produit.',
  'Has probado con muchos enlaces seguidos. Prueba dentro de un rato.':
    'Tu as essayé beaucoup de liens à la suite. Réessaie dans un moment.',
  'No he podido leer esa página. Escríbelo a mano.':
    "Je n'ai pas pu lire cette page. Écris-le à la main.",
  'No puedes darte un toque a ti mismo': 'Tu ne peux pas te relancer toi-même',
  'No puedes reaccionar a tus propios regalos': 'Tu ne peux pas réagir à tes propres cadeaux',
  'Ya le has dado un toque hace poco. Espera unos días.':
    'Tu l’as déjà relancé récemment. Attends quelques jours.',
  'El enlace debe empezar por http:// o https://': 'Le lien doit commencer par http:// ou https://',
  'El nombre no puede estar vacío': 'Le nom ne peut pas être vide',
  'El usuario debe tener 3-20 letras, números, punto o guion bajo':
    "Le nom d'utilisateur doit faire 3 à 20 lettres, chiffres, points ou tirets bas",
  'Esa colecta no existe': "Cette cagnotte n'existe pas",
  'Esa imagen no vale. Prueba con otra foto.': 'Cette image ne convient pas. Essaie une autre photo.',
  'Esa solicitud ya no está pendiente': "Cette demande n'est plus en attente",
  'Escribe algo': 'Écris quelque chose',
  'Escribe tu nombre (2-40 caracteres)': 'Écris ton nom (2 à 40 caractères)',
  'Ese nombre de usuario ya está cogido': "Ce nom d'utilisateur est déjà pris",
  'Ese regalo ya está cogido': 'Ce cadeau est déjà pris',
  'Ese regalo ya está recibido': 'Ce cadeau a déjà été reçu',
  'Ese teléfono no parece válido. Escríbelo con los 9 dígitos.':
    "Ce numéro ne semble pas valide. Écris-le avec ses 9 chiffres.",
  'Ese teléfono ya está puesto en otra cuenta': 'Ce numéro est déjà utilisé sur un autre compte',
  'Esta colecta ya está cerrada': 'Cette cagnotte est déjà fermée',
  'Esta es tu propia lista': "C'est ta propre liste",
  'Ha ocurrido un error, inténtalo de nuevo': "Une erreur s'est produite, réessaie",
  'Has alcanzado el máximo de regalos': 'Tu as atteint le nombre maximum de cadeaux',
  'Has enviado varios mensajes seguidos. Prueba dentro de un rato.':
    'Tu as envoyé plusieurs messages à la suite. Réessaie dans un moment.',
  'La contraseña actual no es correcta': "Le mot de passe actuel n'est pas correct",
  'La contraseña necesita al menos 8 caracteres': 'Le mot de passe doit faire au moins 8 caractères',
  'La foto es demasiado grande': 'La photo est trop lourde',
  'La nueva contraseña necesita 8 caracteres': 'Le nouveau mot de passe doit faire 8 caractères',
  'No autorizado': 'Non autorisé',
  'No encontrado': 'Introuvable',
  'No existe ese usuario': "Cet utilisateur n'existe pas",
  'No hay ninguna solicitud pendiente': "Il n'y a aucune demande en attente",
  'No puedes agregarte a ti mismo': 'Tu ne peux pas t\'ajouter toi-même',
  'No puedes borrar tu propia cuenta': 'Tu ne peux pas supprimer ton propre compte',
  'No puedes desactivarte a ti mismo': 'Tu ne peux pas te désactiver toi-même',
  'No puedes organizar tu propio regalo': 'Tu ne peux pas organiser ton propre cadeau',
  'No puedes reservarte tus propios regalos': 'Tu ne peux pas réserver tes propres cadeaux',
  'No puedes ver esta colecta': 'Tu ne peux pas voir cette cagnotte',
  'No sois amigos': "Vous n'êtes pas amis",
  'Pon cuánto va a costar el regalo': 'Indique combien va coûter le cadeau',
  'Ponle un nombre al regalo': 'Donne un nom au cadeau',
  'Sin foto': 'Pas de photo',
  'Solo puedes ver la lista de tus amigos': 'Tu ne peux voir que la liste de tes amis',
  'Solo quien organiza puede cambiar esto': 'Seul l’organisateur peut modifier ceci',
  'Usuario o contraseña incorrectos': "Nom d'utilisateur ou mot de passe incorrect",
  'Ya está reservado': 'C’est déjà réservé',
  'Ya existe una cuenta con ese DNI. Solo se permite una por persona.':
    "Un compte existe déjà avec ce numéro. Un seul compte par personne est autorisé.",
  'Ya hay una colecta para ese regalo': 'Il y a déjà une cagnotte pour ce cadeau',
  'no autenticado': 'non connecté',
  'origen no permitido': 'origine non autorisée',
  'Únete a la colecta para ver esto': 'Rejoins la cagnotte pour voir ceci',
}

/** Devuelve el mensaje en el idioma pedido; si no hay traducción, el original. */
export function translateError(message: string, accept: string | undefined): string {
  const lang = (accept ?? '').slice(0, 2).toLowerCase()
  const tabla = lang === 'en' ? EN : lang === 'fr' ? FR : null
  return tabla?.[message] ?? message
}
