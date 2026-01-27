/**
 * useHorizontalVirtualization Hook
 * Provides horizontal column virtualization for wide time series tables.
 * Only renders columns visible in the viewport plus a configurable buffer.
 *
 * Usage:
 *   const { visibleRange, containerRef, leftSpacerWidth, rightSpacerWidth, totalWidth }
 *     = useHorizontalVirtualization({ itemCount, itemWidth, overscan })
 *
 *   <div ref={containerRef} style={{ overflowX: 'auto' }}>
 *     <table style={{ width: totalWidth }}>
 *       <thead><tr>
 *         <th style={{ width: leftSpacerWidth }} />
 *         {headers.slice(visibleRange.start, visibleRange.end).map(...)}
 *         <th style={{ width: rightSpacerWidth }} />
 *       </tr></thead>
 *     </table>
 *   </div>
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

/**
 * @param {Object} options
 * @param {number} options.itemCount - Total number of columns
 * @param {number} options.itemWidth - Width of each column in pixels
 * @param {number} [options.overscan=5] - Extra columns to render outside viewport
 * @param {number} [options.stickyLeftWidth=0] - Width of sticky left columns (excluded from virtualization)
 * @param {boolean} [options.enabled=true] - Set false to disable virtualization
 * @returns {{ visibleRange: {start: number, end: number}, containerRef: React.RefObject, leftSpacerWidth: number, rightSpacerWidth: number, totalWidth: number }}
 */
export function useHorizontalVirtualization({
    itemCount,
    itemWidth,
    overscan = 5,
    stickyLeftWidth = 0,
    enabled = true
}) {
    const containerRef = useRef(null)
    const [scrollLeft, setScrollLeft] = useState(0)
    const [containerWidth, setContainerWidth] = useState(0)

    // Track scroll position
    useEffect(() => {
        const el = containerRef.current
        if (!el || !enabled) return

        const handleScroll = () => {
            setScrollLeft(el.scrollLeft)
        }

        el.addEventListener('scroll', handleScroll, { passive: true })
        return () => el.removeEventListener('scroll', handleScroll)
    }, [enabled])

    // Track container width via ResizeObserver
    useEffect(() => {
        const el = containerRef.current
        if (!el || !enabled) return

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width)
            }
        })

        observer.observe(el)
        setContainerWidth(el.clientWidth)
        return () => observer.disconnect()
    }, [enabled])

    const totalWidth = itemCount * itemWidth

    const visibleRange = useMemo(() => {
        if (!enabled || itemCount === 0) {
            return { start: 0, end: itemCount }
        }

        // Available viewport for period columns (subtract sticky columns)
        const availableWidth = Math.max(0, containerWidth - stickyLeftWidth)

        // Adjust scroll position relative to period column area
        const adjustedScroll = Math.max(0, scrollLeft)

        const startRaw = Math.floor(adjustedScroll / itemWidth)
        const visibleCount = Math.ceil(availableWidth / itemWidth)
        const endRaw = startRaw + visibleCount

        const start = Math.max(0, startRaw - overscan)
        const end = Math.min(itemCount, endRaw + overscan)

        return { start, end }
    }, [scrollLeft, containerWidth, itemCount, itemWidth, overscan, stickyLeftWidth, enabled])

    const leftSpacerWidth = visibleRange.start * itemWidth
    const rightSpacerWidth = Math.max(0, (itemCount - visibleRange.end) * itemWidth)

    return {
        visibleRange,
        containerRef,
        leftSpacerWidth,
        rightSpacerWidth,
        totalWidth,
        enabled
    }
}
