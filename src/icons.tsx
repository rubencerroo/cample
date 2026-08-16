/**
 * Los iconos de la app.
 *
 * El set es **Lucide** (el paquete `lucide`, que son datos, no componentes), y el que los pinta es
 * **morphicons**. Se usa un solo componente para todos, estáticos incluidos: no cuesta nada más
 * —la librería ya está en el paquete— y a cambio, en cuanto un icono cambia (`icon={a ó b}`), la
 * transición se anima sola sin escribir nada. Ahí es donde morphicons aporta de verdad; para un
 * icono que nunca cambia se comporta como un SVG normal.
 *
 * Reglas de la casa (regla 8: la usan personas mayores):
 *  - `reducedMotion="user"`: quien tenga puesto «reducir movimiento» en su móvil no ve animación.
 *  - Un icono decorativo va **sin** `label` (queda `aria-hidden`); si el icono es la única pista
 *    de lo que hace un botón, hay que pasar `label`.
 *  - Trazo 2 y tamaño mínimo 20: los iconos finos y pequeños no se ven bien.
 *
 * Los emoji siguen vivos donde **son contenido y no interfaz** (🎂 un cumpleaños, 🎉 una
 * reacción): ahí el color comunica y un icono de línea monocromo sería un paso atrás.
 */
import { MorphIcon } from 'morphicons/react'
import {
  Boxes,
  Cake,
  Check,
  CircleHelp,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Clipboard,
  EyeOff,
  Gift,
  Globe,
  HandHeart,
  Handshake,
  Heart,
  House,
  KeyRound,
  Lightbulb,
  Link as LinkIcon,
  Lock,
  MessageSquare,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
  Trash2,
  Undo2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide'

/** Los datos de un icono de Lucide. Se re-exportan para no importar `lucide` por ahí suelto. */
export const ICON = {
  inicio: House,
  lista: Gift,
  amigos: Users,
  reservas: Lock,
  ajustes: Settings,
  admin: Shield,
  cumple: Cake,
  recibido: CircleCheck,
  check: Check,
  deshacer: Undo2,
  colecta: Handshake,
  idea: Lightbulb,
  anadir: Plus,
  editar: Pencil,
  borrar: Trash2,
  enlace: LinkIcon,
  pegar: Clipboard,
  magia: Sparkles,
  abajo: ChevronDown,
  arriba: ChevronUp,
  cerrar: X,
  corazon: Heart,
  buscar: Search,
  agregar: UserPlus,
  // Ajustes
  persona: User,
  telefono: Smartphone,
  llave: KeyRound,
  idioma: Globe,
  ayuda: CircleHelp,
  buzon: MessageSquare,
  privacidad: Lock,
  // Guía de bienvenida
  apuntar: NotebookPen,
  unidades: Boxes,
  oculto: EyeOff,
  regalar: HandHeart,
} as const

/** Los datos de un icono, para tipar props que reciben uno. */
export type IconoDatos = (typeof ICON)[keyof typeof ICON]

export function Icon({
  icon,
  size = 22,
  label,
  className,
}: {
  /** Pasa dos valores distintos según el estado y la transición se anima sola. */
  icon: IconoDatos
  size?: number
  /** Solo si el icono es la única pista de lo que hace; si hay texto al lado, déjalo vacío. */
  label?: string
  className?: string
}) {
  return (
    <MorphIcon
      icon={icon}
      size={size}
      strokeWidth={2}
      absoluteStrokeWidth
      reducedMotion="user"
      label={label}
      className={className}
    />
  )
}
