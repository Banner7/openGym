import { bandsOf, bandName, bandColor } from '../lib/exercises.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

export default function BandPicker({ S, value, onChange, disabled = false }) {
  const bands = bandsOf(S)
  return <label className="stp w plain band-picker">
    <span className="band-picker-swatch" aria-hidden="true" style={{ background: bandColor(value) }} />
    <select aria-label={t('Assistance band')} value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {!bands.includes(value) && <option value={value || ''}>{value ? bandName(value) : t('Choose band')}</option>}
      {bands.map(band => <option key={band} value={band}>{bandName(band)}</option>)}
    </select>
    <Icon name="chevronDown" />
  </label>
}
