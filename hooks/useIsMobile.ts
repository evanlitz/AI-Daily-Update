import { useState, useEffect } from 'react'

// Returns null until mounted (avoids rendering the wrong layout on first pass),
// then true/false based on window width vs breakpoint.
// breakpoint: viewport width threshold — returns true when width < breakpoint.
// Timeline uses 581 (matches its <=580 sidebar collapse); everything else uses 768.
export function useIsMobile(breakpoint = 768): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])
  return isMobile
}
