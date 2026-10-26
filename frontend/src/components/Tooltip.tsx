import React, { useState, useRef, useEffect } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import clsx from "clsx"

export type TooltipPosition = "top" | "bottom" | "left" | "right"

export interface TooltipProps {
  content: ReactNode
  children: ReactNode
  position?: TooltipPosition
  delay?: number
  disabled?: boolean
  className?: string
  sideOffset?: number
}

interface Coords {
  x: number
  y: number
  position: TooltipPosition
  transform: string
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = "top",
  delay = 180,
  disabled = false,
  className,
  sideOffset = 7,
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [coords, setCoords] = useState<Coords | null>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<number | null>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const computeCoords = (): Coords | null => {
    if (!triggerRef.current || typeof window === "undefined") return null
    const rect = triggerRef.current.getBoundingClientRect()

    let effectivePosition = position

    // Auto-flip if tight on screen edges
    if (position === "top" && rect.top < 45) {
      effectivePosition = "bottom"
    } else if (position === "bottom" && rect.bottom > window.innerHeight - 45) {
      effectivePosition = "top"
    }

    let x = rect.left + rect.width / 2
    let y = rect.top - sideOffset
    let transform = "translate(-50%, -100%)"

    if (effectivePosition === "bottom") {
      y = rect.bottom + sideOffset
      transform = "translate(-50%, 0)"
    } else if (effectivePosition === "left") {
      x = rect.left - sideOffset
      y = rect.top + rect.height / 2
      transform = "translate(-100%, -50%)"
    } else if (effectivePosition === "right") {
      x = rect.right + sideOffset
      y = rect.top + rect.height / 2
      transform = "translate(0, -50%)"
    }

    // Keep within horizontal bounds of the screen
    if (effectivePosition === "top" || effectivePosition === "bottom") {
      x = Math.max(60, Math.min(window.innerWidth - 60, x))
    }

    return {
      x,
      y,
      position: effectivePosition,
      transform,
    }
  }

  const handleMouseEnter = () => {
    if (disabled || !content) return
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      const calculated = computeCoords()
      if (calculated) {
        setCoords(calculated)
        setIsVisible(true)
      }
    }, delay)
  }

  const handleMouseLeave = () => {
    clearTimer()
    setIsVisible(false)
  }

  const handleClick = () => {
    // Hide immediately on click to prevent tooltips lingering over action menus/modals
    clearTimer()
    setIsVisible(false)
  }

  // Hide on scroll/resize
  useEffect(() => {
    if (!isVisible) return

    const handleScrollOrResize = () => {
      setIsVisible(false)
    }

    window.addEventListener("scroll", handleScrollOrResize, true)
    window.addEventListener("resize", handleScrollOrResize)

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true)
      window.removeEventListener("resize", handleScrollOrResize)
    }
  }, [isVisible])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => clearTimer()
  }, [])

  const getInitialAnimation = (pos: TooltipPosition) => {
    switch (pos) {
      case "bottom":
        return { opacity: 0, y: -4, scale: 0.94 }
      case "left":
        return { opacity: 0, x: 4, scale: 0.94 }
      case "right":
        return { opacity: 0, x: -4, scale: 0.94 }
      case "top":
      default:
        return { opacity: 0, y: 4, scale: 0.94 }
    }
  }

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        onClick={handleClick}
        className={clsx("inline-flex items-center", className)}
      >
        {children}
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isVisible && coords && content && (
              <motion.div
                initial={getInitialAnimation(coords.position)}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.1 } }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: "fixed",
                  left: `${coords.x}px`,
                  top: `${coords.y}px`,
                  transform: coords.transform,
                  zIndex: 999999,
                  pointerEvents: "none",
                }}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium leading-tight whitespace-nowrap select-none
                  bg-white/90 text-slate-800 border border-slate-300/80
                  shadow-[0_8px_20px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.7)]
                  dark:bg-[#0c0d16]/90 dark:text-zinc-200 dark:border-white/15
                  dark:shadow-[0_10px_30px_rgba(0,0,0,0.6),0_1px_4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.12)]
                  backdrop-blur-xl"
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  )
}

export default Tooltip
