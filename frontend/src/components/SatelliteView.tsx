import { useEffect, useRef, useState } from 'react'
import './SatelliteView.css'

type MapLand = {
  land_id: string
  district: string
  upazila: string
  mouza: string
  khatian_number?: string
  dag_number: string | number
  area_decimal: number
  latitude?: number
  longitude?: number
  demo?: boolean
}

type Props = { land: MapLand; bangla: boolean; onClose: () => void }

function SatelliteView({ land, bangla, onClose }: Props) {
  const [copyStatus, setCopyStatus] = useState('')
  const panelRef = useRef<HTMLElement>(null)
  const hasCoordinates = Number.isFinite(land.latitude) && Number.isFinite(land.longitude)
  const mapUrl = hasCoordinates
    ? `https://www.google.com/maps?q=${land.latitude},${land.longitude}&t=k&z=18&output=embed`
    : ''

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    panelRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
  }, [land.land_id])

  const copyCoordinates = async () => {
    if (!hasCoordinates) return
    const coordinateText = `${land.latitude}, ${land.longitude}`
    try {
      await navigator.clipboard.writeText(coordinateText)
      setCopyStatus(bangla ? 'কোঅর্ডিনেট কপি হয়েছে' : 'Coordinates copied')
    } catch {
      setCopyStatus(coordinateText)
    }
  }

  return <section ref={panelRef} className="tool-panel satellite-panel" aria-label={bangla ? 'জমির স্যাটেলাইট ভিউ' : 'Land satellite view'}>
    <div className="satellite-heading">
      <div>
        <h2>{bangla ? `${land.land_id} · ${land.mouza} — স্যাটেলাইট ভিউ` : `${land.land_id} · ${land.mouza} — Satellite view`}</h2>
        <p>{land.upazila}, {land.district} · {bangla ? 'দাগ' : 'Dag'} {land.dag_number} · {land.area_decimal} {bangla ? 'ডেসিমেল' : 'decimal'}</p>
      </div>
      <button type="button" className="satellite-close-button" onClick={onClose}>{bangla ? 'বন্ধ করুন' : 'Close map'}</button>
    </div>

    {hasCoordinates && <div className="satellite-coordinates">
      <span><strong>{bangla ? 'কোঅর্ডিনেট' : 'Coordinates'}:</strong> {land.latitude?.toFixed(6)}, {land.longitude?.toFixed(6)}</span>
      <button type="button" className="satellite-copy-button" onClick={copyCoordinates}>
        {copyStatus || (bangla ? 'কোঅর্ডিনেট কপি করুন' : 'Copy coordinates')}
      </button>
    </div>}

    <p className="satellite-disclaimer" role="note">
      {bangla
        ? 'এটি synthetic demo coordinate ও map point—প্রকৃত জমির অবস্থান বা সীমানা নয়। স্যাটেলাইট ছবি live video নয়; imagery-এর তারিখ ও বিস্তারিত সেবাদাতার ওপর নির্ভর করে।'
        : 'This is a synthetic demo coordinate and map point, not the real land location or boundary. Satellite imagery is not live video; its date and detail depend on the provider.'}
    </p>

    {hasCoordinates ? <>
      <div className="satellite-map-frame">
        <iframe
          key={land.land_id}
          title={bangla ? `${land.land_id} এর স্যাটেলাইট ম্যাপ` : `Satellite map for ${land.land_id}`}
          src={mapUrl}
          loading="lazy"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div className="satellite-map-footer">
        <small>Map imagery © Google</small>
        <a href={mapUrl} target="_blank" rel="noreferrer">
          {bangla ? 'বড় ম্যাপে খুলুন ↗' : 'Open larger map ↗'}
        </a>
      </div>
    </> : <p className="satellite-unavailable" role="status">
      {bangla ? 'এই রেকর্ডে coordinate নেই, তাই satellite map দেখানো যাচ্ছে না।' : 'This record has no coordinates, so a satellite map cannot be shown.'}
    </p>}
  </section>
}

export default SatelliteView
