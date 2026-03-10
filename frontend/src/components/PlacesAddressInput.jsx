import { useEffect, useRef, useState } from 'react'

let googleMapsLoaderPromise = null

function loadGoogleMapsPlaces(apiKey) {
  if (!apiKey) return Promise.resolve(null)
  if (typeof window !== 'undefined' && window.google?.maps) return Promise.resolve(window.google)

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
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly&loading=async`
    s.onload = () => resolve(window.google)
    s.onerror = (e) => reject(e)
    document.head.appendChild(s)
  })

  return googleMapsLoaderPromise
}

async function loadPlacesLibrary(g) {
  if (!g?.maps) return null
  if (typeof g.maps.importLibrary === 'function') {
    try {
      // New Places APIs (AutocompleteSuggestion, Place class, etc.) are exposed via importLibrary().
      return await g.maps.importLibrary('places')
    } catch {
      // Fall through to legacy namespace if available.
    }
  }
  return g.maps.places || null
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
  const placesLibRef = useRef(null)
  const modeRef = useRef('none') // 'new' | 'legacy' | 'none'
  const tokenRef = useRef(null)
  const fetchSeqRef = useRef(0)
  const skipFetchRef = useRef(false)

  const [focused, setFocused] = useState(false)
  const [readyForNewApi, setReadyForNewApi] = useState(false)
  const [predictions, setPredictions] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!apiKey) return
    if (!inputRef.current) return

    let autocomplete = null
    let legacyListener = null
    let alive = true

    loadGoogleMapsPlaces(apiKey)
      .then(async (g) => {
        if (!alive) return
        if (!g?.maps) return

        const placesLib = await loadPlacesLibrary(g)
        if (!alive) return
        placesLibRef.current = placesLib

        // Prefer the new Autocomplete Data API for new customers (legacy Autocomplete is blocked for new projects).
        if (placesLib?.AutocompleteSuggestion && placesLib?.AutocompleteSessionToken) {
          modeRef.current = 'new'
          setReadyForNewApi(true)
          return
        }

        // Fallback to legacy widget when available (older projects).
        if (g.maps.places?.Autocomplete) {
          modeRef.current = 'legacy'
          setReadyForNewApi(false)
          setPredictions([])
          setOpen(false)

          autocomplete = new g.maps.places.Autocomplete(inputRef.current, {
            types: ['address'],
            componentRestrictions: { country: 'ca' },
            fields: ['formatted_address'],
          })

          legacyListener = autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace()
            const formatted = place?.formatted_address
            if (formatted) onChange?.(formatted)
          })
          return
        }

        modeRef.current = 'none'
        setReadyForNewApi(false)
      })
      .catch(() => {
        // Fallback to manual input when script fails.
      })

    return () => {
      alive = false
      try {
        legacyListener?.remove?.()
      } catch {
        // ignore
      }
      // Autocomplete listener is GC'd with element; no explicit destroy in API.
      autocomplete = null
    }
  }, [onChange])

  useEffect(() => {
    if (disabled) return
    if (!focused) return
    if (!readyForNewApi) return
    if (modeRef.current !== 'new') return
    const lib = placesLibRef.current
    if (!lib?.AutocompleteSuggestion || !lib?.AutocompleteSessionToken) return

    const q = (value || '').trim()
    if (q.length < 3) {
      setPredictions([])
      setOpen(false)
      return
    }

    if (skipFetchRef.current) {
      skipFetchRef.current = false
      return
    }

    const seq = ++fetchSeqRef.current
    const t = window.setTimeout(async () => {
      try {
        if (fetchSeqRef.current !== seq) return
        const token = tokenRef.current || new lib.AutocompleteSessionToken()
        tokenRef.current = token

        const request = {
          input: q,
          sessionToken: token,
          includedRegionCodes: ['ca'],
          region: 'ca',
          // Best-effort: restrict to address-like results.
          includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
        }

        const { suggestions } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
        if (fetchSeqRef.current !== seq) return

        const preds = (suggestions || [])
          .map((s) => s?.placePrediction)
          .filter(Boolean)
          .slice(0, 6)

        setPredictions(preds)
        setOpen(preds.length > 0)
      } catch {
        if (fetchSeqRef.current !== seq) return
        setPredictions([])
        setOpen(false)
      }
    }, 220)

    return () => window.clearTimeout(t)
  }, [value, focused, disabled, readyForNewApi])

  async function selectPrediction(pred) {
    if (!pred) return
    const lib = placesLibRef.current
    if (!lib) return

    // Cancel in-flight queries and close the dropdown immediately.
    fetchSeqRef.current += 1
    setOpen(false)
    setPredictions([])

    try {
      const place = pred.toPlace()
      await place.fetchFields({ fields: ['formattedAddress'] })
      const formatted = (place?.formattedAddress || '').trim()
      const fallback = (pred?.text?.toString?.() || '').trim()
      const next = formatted || fallback
      if (next) {
        skipFetchRef.current = true
        onChange?.(next)
      }
    } catch {
      // Ignore and keep manual input.
    } finally {
      // End the session on selection (new token will be created on next typing session).
      tokenRef.current = null
    }
  }

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Allow click selection without immediately closing the list.
          window.setTimeout(() => {
            setFocused(false)
            setOpen(false)
          }, 120)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false)
            setPredictions([])
          }
        }}
        className={className}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="street-address"
        inputMode="text"
      />

      {open && predictions.length ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border bg-white shadow-lg">
          <div className="max-h-72 overflow-auto">
            {predictions.map((pred) => {
              const text = (pred?.text?.toString?.() || '').trim()
              return (
                <button
                  key={pred.placeId || text}
                  type="button"
                  onMouseDown={(e) => {
                    // Prevent input blur before we can select.
                    e.preventDefault()
                    selectPrediction(pred)
                  }}
                  className="block w-full border-b px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                >
                  {text || '—'}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-end bg-white px-3 py-2">
            <img
              alt="Powered by Google"
              className="h-4 opacity-90"
              src="https://storage.googleapis.com/geo-devrel-public-buckets/powered_by_google_on_white.png"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

