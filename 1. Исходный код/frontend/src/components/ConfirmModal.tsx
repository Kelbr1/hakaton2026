import React, { useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Trash2, LogOut, X } from "lucide-react"

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  description: string
  itemTitle?: string
  confirmText?: string
  cancelText?: string
  type?: "danger" | "warning"
  icon?: "trash" | "logout" | "warning"
  onConfirm: () => void
  onClose: () => void
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  itemTitle,
  confirmText = "Подтвердить",
  cancelText = "Отмена",
  type = "danger",
  icon = "trash",
  onConfirm,
  onClose,
}) => {
  // Закрытие по клавише Escape и подтверждение по Enter
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "Enter") {
        e.preventDefault()
        onConfirm()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose, onConfirm])

  if (!isOpen) return null

  const isDanger = type === "danger"

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        {/* Затемнение с кинематографичным размытием фона */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-md cursor-pointer"
        />

        {/* Модальное окно в стиле Liquid Glass */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{
            type: "spring",
            damping: 26,
            stiffness: 320,
          }}
          className="relative w-full max-w-sm rounded-3xl liquid-glass-modal p-6 z-10 overflow-hidden text-zinc-900 dark:text-zinc-100 transition-colors"
        >
          {/* Свечение на фоне карточки */}
          <div
            className={`absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-[80px] pointer-events-none ${
              isDanger ? "bg-rose-500/20" : "bg-amber-500/20"
            }`}
          />

          {/* Кнопка закрытия в верхнем углу с высоким z-index и надежной областью клика */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            aria-label="Закрыть"
            className="absolute top-4 right-4 z-30 w-8 h-8 rounded-full liquid-glass-subtle hover:bg-black/10 dark:hover:bg-white/10 active:scale-90 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer pointer-events-auto"
          >
            <X className="w-4 h-4 pointer-events-none" />
          </button>

          {/* Иконка */}
          <div className="flex justify-center mb-4 relative z-0 pointer-events-none">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-xl backdrop-blur-sm ${
                isDanger
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-500 shadow-rose-500/15"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-500 shadow-amber-500/15"
              }`}
            >
              {icon === "trash" && <Trash2 className="w-6 h-6" />}
              {icon === "logout" && <LogOut className="w-6 h-6" />}
              {icon === "warning" && <AlertTriangle className="w-6 h-6" />}
            </div>
          </div>

          {/* Текстовая часть */}
          <div className="text-center space-y-2 relative z-0 pointer-events-none">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white tracking-tight">
              {title}
            </h3>

            {itemTitle && (
              <div className="px-3 py-1.5 rounded-xl liquid-glass-subtle border border-black/[0.06] dark:border-white/[0.08] text-xs font-medium text-zinc-800 dark:text-zinc-200 line-clamp-2">
                «{itemTitle}»
              </div>
            )}

            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-normal">
              {description}
            </p>
          </div>

          {/* Кнопки действий */}
          <div className="mt-6 flex items-center gap-2.5 relative z-10">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl liquid-btn-glass active:scale-95 text-xs font-medium transition-all cursor-pointer"
            >
              {cancelText}
            </button>

            <button
              type="button"
              onClick={() => {
                onConfirm()
                onClose()
              }}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-white transition-all active:scale-95 shadow-lg cursor-pointer ${
                isDanger
                  ? "bg-gradient-to-b from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 shadow-rose-600/30 border border-red-400/40"
                  : "bg-gradient-to-b from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-amber-600/30 border border-amber-400/40"
              }`}
            >
              {confirmText}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
