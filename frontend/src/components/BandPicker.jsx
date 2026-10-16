import { bandsOf, bandName, bandColor } from '../lib/exercises.js'
import { t } from '../lib/i18n.js'

export default function BandPicker({ S, value, onChange, disabled = false }) {
  const bands = bandsOf(S)
  return <label className="stp plain" style={{ display: 'flex', alignItems: 'center', gap: 6, paddingInline: 8 }}>
    <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', background: bandColor(value), border: '1px solid var(--muted)', flexShrink: 0 }} />
    <select aria-label={t('Assistance band')} value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)} style={{ minWidth: 0, width: '100%' }}>
      {!bands.includes(value) && <option value={value || ''}>{value ? bandName(value) : t('Choose band')}</option>}
      {bands.map(band => <option key={band} value={band}>{bandName(band)}</option>)}
    </select>
  </label>
}
