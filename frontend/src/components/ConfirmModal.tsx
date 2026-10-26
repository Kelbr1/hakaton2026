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
          className="fixed inset-0 bg-black/80 backdrop-blur-md cursor-pointer"
        />

        {/* Модальное окно в стиле Apple Pro */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{
            type: "spring",
            damping: 26,
            stiffness: 320,
          }}
          className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-[#121215] border border-zinc-200/90 dark:border-white/[0.1] shadow-2xl p-6 z-10 overflow-hidden text-zinc-900 dark:text-zinc-100 transition-colors"
        >
          {/* Свечение на фоне карточки */}
          <div
            className={`absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-[80px] pointer-events-none ${
              isDanger ? "bg-red-500/20" : "bg-amber-500/20"
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
            className="absolute top-4 right-4 z-30 w-8 h-8 rounded-full bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200 dark:hover:bg-white/[0.14] active:scale-90 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer pointer-events-auto"
          >
            <X className="w-4 h-4 pointer-events-none" />
          </button>

          {/* Иконка */}
          <div className="flex justify-center mb-4 relative z-0 pointer-events-none">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-xl ${
                isDanger
                  ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/25 text-red-600 dark:text-red-400 shadow-red-500/10"
                  : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/25 text-amber-600 dark:text-amber-400 shadow-amber-500/10"
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
              <div className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.06] text-xs font-medium text-zinc-800 dark:text-zinc-200 line-clamp-2">
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
              className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200 dark:hover:bg-white/[0.1] active:scale-95 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-all border border-zinc-200 dark:border-white/[0.08] cursor-pointer"
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
                  ? "bg-red-600 hover:bg-red-500 shadow-red-600/30"
                  : "bg-amber-600 hover:bg-amber-500 shadow-amber-600/30"
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
