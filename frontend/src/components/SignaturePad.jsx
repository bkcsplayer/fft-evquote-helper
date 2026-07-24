import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

/**
 * Handwritten signature capture (mouse/touch canvas), shared by EV QuoteApprove and the
 * bird-netting quote approve page. Imperative API via ref: clear(), getDataUrl(), hasInk.
 */
export const SignaturePad = forwardRef(function SignaturePad({ onInkChange }, ref) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [hasInk, setHasInk] = useState(false)

  function resizeCanvas() {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const rect = wrap.getBoundingClientRect()
    const cssW = Math.max(280, Math.floor(rect.width))
    const cssH = 140
    const dpr = window.devicePixelRatio || 1

    const old = document.createElement('canvas')
    old.width = canvas.width
    old.height = canvas.height
    const oldCtx = old.getContext('2d')
    oldCtx.drawImage(canvas, 0, 0)

    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    canvas.width = Math.floor(cssW * dpr)
    canvas.height = Math.floor(cssH * dpr)

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.2

    if (old.width && old.height) {
      ctx.drawImage(old, 0, 0, old.width, old.height, 0, 0, canvas.width, canvas.height)
    }
  }

  useEffect(() => {
    resizeCanvas()
    const onResize = () => resizeCanvas()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function setInk(v) {
    setHasInk(v)
    onInkChange?.(v)
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setInk(false)
  }

  function getCanvasPoint(e) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches?.[0]?.clientX ?? e.clientX
    const clientY = e.touches?.[0]?.clientY ?? e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    let drawing = false
    let last = null

    function start(e) {
      e.preventDefault()
      drawing = true
      last = getCanvasPoint(e)
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
    }
    function move(e) {
      if (!drawing) return
      e.preventDefault()
      const p = getCanvasPoint(e)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      last = p
      setInk(true)
    }
    function end() {
      drawing = false
      last = null
    }

    canvas.addEventListener('mousedown', start)
    canvas.addEventListener('mousemove', move)
    window.addEventListener('mouseup', end)

    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove', move, { passive: false })
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', end)

    return () => {
      canvas.removeEventListener('mousedown', start)
      canvas.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', end)
      canvas.removeEventListener('touchstart', start)
      canvas.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', end)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useImperativeHandle(ref, () => ({
    clear,
    getDataUrl: () => (canvasRef.current ? canvasRef.current.toDataURL('image/png') : ''),
    hasInk,
  }))

  return (
    <div ref={wrapRef} className="rounded-xl border bg-white p-2">
      <canvas ref={canvasRef} className="block w-full touch-none" aria-label="Signature pad" />
    </div>
  )
})
