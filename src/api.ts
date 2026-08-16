import { getLang, translate } from './i18n'

export type User = {
  id: string
  username: string
  displayName: string
  bio: string
  avatarSeed: string
  birthday: string | null
  avatarVersion: number
  hasAvatar: boolean
  onboardingSeen: number
  hasPhone?: boolean
  isAdmin?: boolean
}

export type Reset = {
  id: string
  status: 'pending' | 'approved'
  username: string
  displayName: string
  createdAt: number
  expiresAt: number | null
}

export type Gift = {
  id: string
  title: string
  notes: string
  url: string | null
  imageUrl: string | null
  price: number | null
  currency: string
  priority: number
  quantity: number
  isReceived: boolean
  isArchived: boolean
  visibility: 'all' | 'only' | 'except'
  createdAt: number
  // Foto propia subida desde la galería; manda sobre `imageUrl`. Ver `giftImageSrc`.
  hasImage: boolean
  imageVersion: number
  // solo en mi lista: a quién señala la restricción (los nombres son solo para el dueño)
  audience?: { username: string; displayName: string }[]
  // solo en listas ajenas: cuántas personas señala, nunca quiénes
  audienceCount?: number
  // Reacciones: las ve todo el que ve el regalo, **incluido el dueño**. No son reservas.
  reactions?: { emoji: string; count: number; people: { username: string; displayName: string }[] }[]
  myReaction?: string | null
  taken?: number
  remaining?: number
  reservedByMe?: boolean
  myUnits?: number
  for?: { username: string; displayName: string }
  group?: { id: string; status: string; members: number; imMember: boolean } | null
}

export type AdminUser = {
  username: string
  displayName: string
  createdAt: number
  isActive: boolean
  isAdmin: boolean
  gifts: number
  friends: number
  trusted: boolean
  trustSource: string | null
  suspicious: boolean
}

export type GroupMember = {
  username: string
  displayName: string
  avatarSeed: string
  avatarVersion: number
  hasAvatar: boolean
  isOrganizer: boolean
  isMe: boolean
  share: number | null
  hasPaid: boolean
}

export type GroupMessage = {
  id: string
  body: string
  createdAt: number
  author: { username: string; displayName: string; avatarSeed: string; avatarVersion: number; hasAvatar: boolean }
}

export type Group = {
  id: string
  status: 'open' | 'bought' | 'cancelled'
  splitMode: 'equal' | 'custom'
  note: string
  target: number | null
  collected: number
  createdAt: number
  gift: { id: string; title: string; notes: string; url: string | null; price: number | null; isReceived: boolean }
  for: { username: string; displayName: string }
  isOrganizer: boolean
  isMember: boolean
  members: GroupMember[]
  messages: GroupMessage[]
}

export type GroupSummary = {
  id: string
  status: Group['status']
  title: string
  members: number
  target: number | null
  for: { username: string; displayName: string }
}

/** Un suceso del inicio. `members` solo viene en las colectas. */
export type Activity = {
  kind: 'gift' | 'received' | 'group'
  ref: string
  at: number
  title: string
  imageUrl: string | null
  price: number | null
  members: number | null
  user: User
}

export type Feedback = {
  id: string
  kind: 'bug' | 'idea'
  body: string
  status: 'new' | 'done'
  createdAt: number
  from: { username: string; displayName: string } | null
}

/** Lo que se saca de un enlace para prerrellenar un regalo. Todo puede venir vacío. */
export type Preview = {
  title: string | null
  imageUrl: string | null
  price: number | null
  siteName: string | null
}

/**
 * Señal de vida de mi propia lista. `views` es un rango, nunca un número, y viene `null` si
 * tengo menos de 3 amigos (con menos, cualquier cifra señalaría a alguien).
 */
export type Pulse = {
  friends: number
  views: 'none' | 'few' | 'some' | 'many' | null
  myGifts: number
  friendsAvg: number
}

export class ApiError extends Error {}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const lang = getLang()
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...init,
    // El idioma va en la cabecera para que los mensajes de error del servidor vengan traducidos.
    headers: {
      'Accept-Language': lang,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok)
    throw new ApiError((data as any).error ?? translate(lang, 'api.connectionError'))
  return data as T
}

const body = (data: unknown) => ({ body: JSON.stringify(data) })

export const api = {
  me: () => req<{ user: User | null }>('/me'),
  register: (d: Record<string, unknown>) =>
    req<{ user: User }>('/auth/register', { method: 'POST', ...body(d) }),
  login: (username: string, password: string) =>
    req<{ user: User }>('/auth/login', { method: 'POST', ...body({ username, password }) }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  requestReset: (username: string) =>
    req<{ ok: true }>('/auth/reset/request', { method: 'POST', ...body({ username }) }),
  confirmReset: (username: string, code: string, password: string) =>
    req<{ ok: true }>('/auth/reset/confirm', { method: 'POST', ...body({ username, code, password }) }),
  adminResets: () => req<{ resets: Reset[] }>('/admin/resets'),
  adminStats: () =>
    req<{
      stats: {
        usuarios: number
        desactivados: number
        regalos: number
        amistades: number
        solicitudes: number
        resets: number
        colectas: number
        avisos: number
        db: { used: number; limit: number; photos: number }
      }
    }>('/admin/stats'),
  adminUsers: () => req<{ users: AdminUser[] }>('/admin/users'),
  setTrusted: (username: string, trusted: boolean) =>
    req(`/admin/users/${username}/trust`, { method: 'POST', ...body({ trusted }) }),
  usernameStatus: () => req<{ left: number; nextAt: number | null }>('/me/username'),
  setUsername: (username: string) =>
    req<{ user: User }>('/me/username', { method: 'POST', ...body({ username }) }),
  myInvite: () => req<{ code: string }>('/invite'),
  inviteInfo: (code: string) => req<{ user: User | null }>(`/invite/${code}`),
  sendFeedback: (kind: 'bug' | 'idea', text: string) =>
    req('/feedback', { method: 'POST', ...body({ kind, body: text }) }),
  adminFeedback: () => req<{ feedback: Feedback[] }>('/admin/feedback'),
  setFeedbackDone: (id: string, done: boolean) =>
    req(`/admin/feedback/${id}/done`, { method: 'POST', ...body({ done }) }),
  deleteFeedback: (id: string) => req(`/admin/feedback/${id}`, { method: 'DELETE' }),
  setUserActive: (username: string, isActive: boolean) =>
    req(`/admin/users/${username}/active`, { method: 'POST', ...body({ isActive }) }),
  deleteUser: (username: string) => req(`/admin/users/${username}`, { method: 'DELETE' }),
  approveReset: (id: string) => req<{ code: string }>(`/admin/resets/${id}/approve`, { method: 'POST' }),
  rejectReset: (id: string) => req(`/admin/resets/${id}/reject`, { method: 'POST' }),
  updateMe: (d: Record<string, unknown>) => req<{ user: User }>('/me', { method: 'PATCH', ...body(d) }),

  activity: () => req<{ activity: Activity[] }>('/activity'),

  setPhone: (phone: string) => req<{ hasPhone: boolean }>('/me/phone', { method: 'POST', ...body({ phone }) }),
  fromContacts: (phones: string[]) =>
    req<{ matches: User[] }>('/friends/from-contacts', { method: 'POST', ...body({ phones }) }),
  setAvatar: (dataUrl: string) => req<{ user: User }>('/me/avatar', { method: 'POST', ...body({ dataUrl }) }),
  removeAvatar: () => req<{ user: User }>('/me/avatar', { method: 'DELETE' }),
  changePassword: (current: string, next: string) =>
    req('/me/password', { method: 'POST', ...body({ current, next }) }),

  feed: () => req<{ friends: (User & { openGifts: number })[] }>('/feed'),
  search: (q: string) => req<{ users: User[] }>(`/users/search?q=${encodeURIComponent(q)}`),
  profile: (username: string) => req<{ user: User; relation: string }>(`/users/${username}`),
  friends: () => req<{ friends: User[] }>('/friends'),
  requests: () => req<{ incoming: User[]; outgoing: User[] }>('/friends/requests'),
  suggestions: () => req<{ suggestions: (User & { mutual: number })[] }>('/friends/suggestions'),
  seenOnboarding: (version: number) => req('/me/onboarding', { method: 'POST', ...body({ version }) }),
  addFriend: (u: string) => req<{ relation: string }>(`/friends/${u}/request`, { method: 'POST' }),
  acceptFriend: (u: string) => req<{ relation: string }>(`/friends/${u}/accept`, { method: 'POST' }),
  removeFriend: (u: string) => req<{ relation: string }>(`/friends/${u}`, { method: 'DELETE' }),

  unfurl: (url: string) => req<{ preview: Preview }>(`/unfurl?url=${encodeURIComponent(url)}`),
  pulse: () => req<{ pulse: Pulse }>('/me/pulse'),
  nudge: (username: string) => req(`/nudge/${username}`, { method: 'POST' }),
  react: (id: string, emoji: string) => req(`/gifts/${id}/react`, { method: 'POST', ...body({ emoji }) }),
  unreact: (id: string) => req(`/gifts/${id}/react`, { method: 'DELETE' }),

  gifts: () => req<{ gifts: Gift[] }>('/gifts'),
  createGift: (d: Record<string, unknown>) => req<{ gift: Gift }>('/gifts', { method: 'POST', ...body(d) }),
  updateGift: (id: string, d: Record<string, unknown>) =>
    req<{ gift: Gift }>(`/gifts/${id}`, { method: 'PATCH', ...body(d) }),
  deleteGift: (id: string) => req(`/gifts/${id}`, { method: 'DELETE' }),
  setGiftImage: (id: string, dataUrl: string) =>
    req<{ gift: Gift }>(`/gifts/${id}/image`, { method: 'POST', ...body({ dataUrl }) }),
  removeGiftImage: (id: string) => req<{ gift: Gift }>(`/gifts/${id}/image`, { method: 'DELETE' }),
  setReceived: (id: string, isReceived: boolean) =>
    req(`/gifts/${id}/received`, { method: 'POST', ...body({ isReceived }) }),

  list: (username: string) =>
    req<{ user: User; gifts: Gift[]; canSeeReservations: boolean }>(`/lists/${username}`),
  reserve: (id: string, units = 1) =>
    req<{ units: number }>(`/gifts/${id}/reserve`, { method: 'POST', ...body({ units }) }),
  unreserve: (id: string) => req(`/gifts/${id}/reserve`, { method: 'DELETE' }),
  reservations: () => req<{ reservations: Gift[] }>('/reservations'),

  createGroup: (giftId: string, d: { target?: string; splitMode?: string; note?: string }) =>
    req<{ group: Group }>(`/gifts/${giftId}/group`, { method: 'POST', ...body(d) }),
  groups: () => req<{ groups: GroupSummary[] }>('/groups'),
  group: (id: string) => req<{ group: Group }>(`/groups/${id}`),
  joinGroup: (id: string, pledge?: string) =>
    req(`/groups/${id}/join`, { method: 'POST', ...body({ pledge }) }),
  leaveGroup: (id: string) => req<{ cancelled?: boolean }>(`/groups/${id}/leave`, { method: 'POST' }),
  updateGroup: (id: string, d: Record<string, unknown>) =>
    req(`/groups/${id}`, { method: 'PATCH', ...body(d) }),
  setPaid: (id: string, hasPaid: boolean) => req(`/groups/${id}/paid`, { method: 'POST', ...body({ hasPaid }) }),
  setPledge: (id: string, pledge: string) => req(`/groups/${id}/pledge`, { method: 'POST', ...body({ pledge }) }),
  sendMessage: (id: string, text: string) =>
    req(`/groups/${id}/messages`, { method: 'POST', ...body({ body: text }) }),

  // Avisos al móvil. `pushKey` devuelve null si el servidor no tiene claves puestas.
  pushKey: () => req<{ key: string | null }>('/push/key'),
  pushState: () => req<{ enabled: boolean; available: boolean }>('/push/state'),
  subscribePush: (d: { endpoint: string; p256dh: string; auth: string; lang: string }) =>
    req('/push/subscribe', { method: 'POST', ...body(d) }),
  unsubscribePush: (endpoint?: string) =>
    req('/push/unsubscribe', { method: 'POST', ...body({ endpoint }) }),
  testPush: () => req('/push/test', { method: 'POST' }),
  adminNotify: (d: { body: string; all?: boolean; usernames?: string[] }) =>
    req<{ sent: number }>('/admin/notify', { method: 'POST', ...body(d) }),

  badges: () =>
    req<{ badges: { home: number; friends: number; reservations: number; admin: number } }>('/badges'),
  notifications: () =>
    req<{ notifications: { id: string; kind: string; body: string; link: string | null; is_read: number; created_at: number }[] }>(
      '/notifications',
    ),
  readNotifications: () => req('/notifications/read', { method: 'POST' }),
}
