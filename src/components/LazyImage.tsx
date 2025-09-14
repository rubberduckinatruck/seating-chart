
import React, { useEffect, useRef, useState } from 'react'

export default function LazyImage({
  src,
  alt,
  className,
  width,
  height
}: {
  src: string
  alt: string
  className?: string
  width?: number
  height?: number
}) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const ref = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if ('loading' in HTMLImageElement.prototype) {
      // Native lazy
      el.loading = 'lazy' as any
      el.src = src
      return
    }
    // Fallback: IntersectionObserver
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setLoadedSrc(src)
          io.disconnect()
          break
        }
      }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [src])

  return (
    <img
      ref={ref}
      src={loadedSrc || ''}
      alt={alt}
      className={className}
      width={width}
      height={height}
    />
  )
}
