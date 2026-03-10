import { useEffect, useRef } from 'react'

let googleMapsLoaderPromise = null

function loadGoogleMapsPlaces(apiKey) {
  if (!apiKey) return Promise.resolve(null)
  if (typeof window !== 'undefined' && window.google?.maps?.places) return Promise.resolve(window.google)

  if (googleMapsLoaderPromise) return googleMapsLoaderPromise

  googleMapsLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-maps-places="1"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google))
      existing.addEventListener('error', (e) => reject(e))
      return
    }

    const s = document.createElement('script')
    s.async = true
    s.defer = true
    s.dataset.googleMapsPlaces = '1'
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`
    s.onload = () => resolve(window.google)
    s.onerror = (e) => reject(e)
    document.head.appendChild(s)
  })

  return googleMapsLoaderPromise
}

export function PlacesAddressInput({
  value,
  onChange,
  className = '',
  placeholder = '',
  required = false,
  disabled = false,
}) {
  const inputRef = useRef(null)

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!apiKey) return
    if (!inputRef.current) return

    let autocomplete = null
    let alive = true

    loadGoogleMapsPlaces(apiKey)
      .then((g) => {
        if (!alive) return
        if (!g?.maps?.places?.Autocomplete) return
        if (!inputRef.current) return

        autocomplete = new g.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'ca' },
          fields: ['formatted_address'],
        })

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace()
          const formatted = place?.formatted_address
          if (formatted) onChange?.(formatted)
        })
      })
      .catch(() => {
        // Fallback to manual input when script fails.
      })

    return () => {
      alive = false
      // Autocomplete listener is GC'd with element; no explicit destroy in API.
      autocomplete = null
    }
  }, [onChange])

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      className={className}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      autoComplete="street-address"
      inputMode="text"
    />
  )
}

