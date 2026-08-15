/**
 * Normaliza un teléfono a formato internacional (+34...) para que el mismo número escrito
 * de cinco maneras distintas dé siempre el mismo hash. Sin prefijo se asume España, que es
 * de donde es toda la familia.
 */
export function normalizePhone(raw: string): string | null {
  let s = String(raw ?? '').replace(/[^\d+]/g, '')
  if (s.startsWith('00')) s = '+' + s.slice(2)

  if (!s.startsWith('+')) {
    const d = s.replace(/\D/g, '')
    if (/^[6-9]\d{8}$/.test(d)) s = '+34' + d // móvil o fijo español
    else if (d.length >= 11 && d.length <= 15) s = '+' + d
    else return null
  }

  const digits = s.slice(1)
  if (!/^\d{8,15}$/.test(digits)) return null
  return '+' + digits
}
