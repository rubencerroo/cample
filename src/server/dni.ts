// Validación de DNI/NIE español. Solo se usa para derivar un identificador
// único por persona: el documento nunca se almacena ni se devuelve en claro.

const LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'

export function normalizeDocument(raw: string): string | null {
  const s = (raw || '').toUpperCase().replace(/[\s-]/g, '')
  if (/^[0-9]{8}[A-Z]$/.test(s)) {
    return LETTERS[Number(s.slice(0, 8)) % 23] === s[8] ? s : null
  }
  if (/^[XYZ][0-9]{7}[A-Z]$/.test(s)) {
    const num = Number(String('XYZ'.indexOf(s[0])) + s.slice(1, 8))
    return LETTERS[num % 23] === s[8] ? s : null
  }
  return null
}
