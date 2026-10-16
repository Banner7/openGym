import { cardioMetrics, exOr } from './exercises.js'
import { fmtSpeed, toSpeed, fromSpeed } from './speed.js'
import { fmtNum } from './format.js'
import { t } from './i18n-core.js'

export const cardioFields = ['speed', 'floors', 'm', 'level']
export const hasCardio = s => ['min', ...cardioFields].some(k => s?.[k] > 0)
export const isRower = cfg => /rowing|rower/i.test(cfg?.n || exOr(typeof cfg === 'string' ? cfg : cfg?.id)?.n || '')
export const distanceUnit = (cfg, speedUnit) => isRower(cfg) ? 'm' : speedUnit === 'mph' ? 'mi' : 'km'
export const toDistance = (m, unit) => Number(m || 0) / (unit === 'm' ? 1 : unit === 'mi' ? 1609.344 : 1000)
export const fromDistance = (v, unit) => v == null ? null : Math.round(Number(v) * (unit === 'm' ? 1 : unit === 'mi' ? 1609.344 : 1000) * 100) / 100
export const clampCardio = (field, v) => v == null ? null : field === 'level'
  ? Math.max(1, Math.min(40, Math.round(v))) : field === 'floors' ? Math.max(0, Math.round(v)) : Math.max(0, Number(v) || 0)
export function cardioColumns(cfg, speedUnit) {
  const unit = distanceUnit(cfg, speedUnit)
  return cardioMetrics(cfg).map(f => f === 'speed'
    ? { f, step: 0.5, dec: true, hd: speedUnit === 'mph' ? t('Speed (mph)') : t('Speed (km/h)'), view: v => toSpeed(v, speedUnit), store: v => v == null ? null : fromSpeed(v, speedUnit) }
    : f === 'm' ? { f, step: unit === 'm' ? 100 : 0.5, dec: unit !== 'm', hd: t('Distance ({0})', unit), view: v => toDistance(v, unit), store: v => fromDistance(v, unit) }
      : { f, step: 1, dec: false, hd: f === 'floors' ? t('Floors') : t('Level'), store: v => clampCardio(f, v) })
}
export function rowingPace(s) {
  if (!(s?.min > 0 && s?.m > 0)) return ''
  const sec = Math.round(s.min * 60 * 500 / s.m)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} /500m`
}
export function cardioDefaults(cfg) {
  const values = { speed: 8, floors: 40, m: isRower(cfg) ? 4000 : 8000, level: 8 }
  return { min: 20, ...Object.fromEntries(cardioMetrics(cfg).map(k => [k, values[k]])) }
}
export function cardioSeed(cfg, previous) {
  const defaults = cardioDefaults(cfg)
  const result = { min: previous?.min ?? cfg?.min ?? defaults.min }
  for (const field of cardioFields) {
    const value = previous?.[field] ?? cfg?.[field] ?? defaults[field]
    if (value != null) result[field] = value
  }
  return result
}
export function cardioLabel(s, cfg, speedUnit) {
  // Historical speed-only rows keep their original label, even on a reclassified machine.
  if (!['floors', 'm', 'level'].some(k => s[k] != null)) return `${s.min || 0} min @ ${fmtSpeed(s.speed || 0, speedUnit)}`
  const parts = [`${s.min || 0} min`]
  if (s.floors != null) parts.push(t('{0} floors', fmtNum(s.floors)))
  if (s.m != null) {
    const unit = distanceUnit(cfg, speedUnit)
    parts.push(`${unit === 'm' ? Number(s.m).toLocaleString() : toDistance(s.m, unit).toFixed(1)} ${unit}`)
    if (isRower(cfg) && rowingPace(s)) parts.push(rowingPace(s))
  }
  if (s.level != null) parts.push(`L${s.level}`)
  return parts.join(' · ')
}
