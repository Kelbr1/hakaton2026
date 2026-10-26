import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Tag, Check, Plus, X, Ban, Loader2 } from "lucide-react"
import { CATEGORY_COLOR_PRESETS, getCategoryHex } from "../utils/colors"
import type { Category, Lecture } from "../types"

interface AssignCategoryModalProps {
  isOpen: boolean
  lecture: Lecture | null
  categories: Category[]
  onAssignCategory: (lectureId: number, categoryId: number | null) => Promise<void>
  onCreateCategory: (name: string, color?: string) => Promise<Category | void>
  onClose: () => void
}

export const AssignCategoryModal: React.FC<AssignCategoryModalProps> = ({
  isOpen,
  lecture,
  categories,
  onAssignCategory,
  onCreateCategory,
  onClose,
}) => {
  const [isCreating, setIsCreating] = useState<boolean>(false)
  const [newCatName, setNewCatName] = useState<string>("")
  const [newCatColor, setNewCatColor] = useState<string>("#3b82f6")
  const [loadingId, setLoadingId] = useState<number | "none" | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setIsCreating(false)
      setNewCatName("")
      setNewCatColor("#3b82f6")
      setLoadingId(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !lecture) return null

  const handleSelect = async (categoryId: number | null) => {
    setLoadingId(categoryId === null ? "none" : categoryId)
    try {
      await onAssignCategory(lecture.id, categoryId)
      onClose()
    } catch (err) {
      console.error("Failed to assign category:", err)
    } finally {
      setLoadingId(null)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newCatName.trim()
    if (!trimmed) return

    setLoadingId("none")
    try {
      const created = await onCreateCategory(trimmed, newCatColor)
      if (created && created.id) {
        await onAssignCategory(lecture.id, created.id)
      }
      setNewCatName("")
      setNewCatColor("#3b82f6")
      setIsCreating(false)
      onClose()
    } catch (err) {
      console.error("Failed to create and assign category:", err)
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        {/* Затемнение с кинематографичным размытием */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-md cursor-pointer"
        />

        {/* Модальное окно */}
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
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-blue-600/15 blur-[80px] pointer-events-none" />

          {/* Кнопка закрытия */}
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
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center border border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-lg shadow-blue-500/10">
              <Tag className="w-5 h-5" />
            </div>
          </div>

          {/* Заголовок и название лекции */}
          <div className="text-center space-y-1.5 mb-5">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white tracking-tight">
              Категория лекции
            </h3>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium px-2 truncate">
              «{lecture.title}»
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Выберите раздел или создайте новый
            </p>
          </div>

          {/* Список категорий для выбора */}
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {/* Опция: Без категории */}
            <button
              type="button"
              onClick={() => handleSelect(null)}
              disabled={loadingId !== null}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-all cursor-pointer ${
                lecture.category_id === null || lecture.category_id === undefined
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-black font-semibold shadow-md"
                  : "bg-zinc-50 dark:bg-white/[0.03] text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.07] border border-zinc-200/80 dark:border-white/[0.05]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Ban className="w-3.5 h-3.5 opacity-60" />
                <span>Без категории</span>
              </div>
              {loadingId === "none" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
              ) : (
                (lecture.category_id === null || lecture.category_id === undefined) && (
                  <Check className="w-4 h-4 text-white dark:text-black" />
                )
              )}
            </button>

            {/* Доступные категории */}
            {categories.map((cat) => {
              const isSelected = lecture.category_id === cat.id
              const isLoading = loadingId === cat.id

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelect(cat.id)}
                  disabled={loadingId !== null}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-all cursor-pointer ${
                    isSelected
                      ? "bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30"
                      : "bg-zinc-50 dark:bg-white/[0.03] text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.07] border border-zinc-200/80 dark:border-white/[0.05]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate mr-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: getCategoryHex(cat.color) }}
                    />
                    <span className="truncate">{cat.name}</span>
                  </div>

                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    isSelected && <Check className="w-4 h-4 text-white shrink-0" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Форма создания новой категории */}
          <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-white/[0.08]">
            {isCreating ? (
              <form onSubmit={handleCreate} className="space-y-2.5 p-2.5 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-blue-500/40">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    autoFocus
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Новая категория..."
                    className="flex-1 bg-white dark:bg-white/[0.05] border border-zinc-200 dark:border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newCatName.trim()}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-semibold text-white transition-all cursor-pointer shrink-0"
                  >
                    Создать
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false)
                      setNewCatName("")
                      setNewCatColor("#3b82f6")
                    }}
                    className="p-1.5 rounded-xl bg-zinc-100 dark:bg-white/[0.05] hover:bg-zinc-200 dark:hover:bg-white/[0.1] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Палитра цветов для категории */}
                <div className="flex items-center justify-between pt-1 border-t border-zinc-200/60 dark:border-white/[0.06]">
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">Цвет метки:</span>
                  <div className="flex items-center gap-1.5">
                    {CATEGORY_COLOR_PRESETS.map((preset) => {
                      const isSelected = newCatColor === preset.hex
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setNewCatColor(preset.hex)}
                          title={preset.label}
                          className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer relative ${
                            isSelected
                              ? "scale-125 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#121215] ring-blue-500"
                              : "hover:scale-110 opacity-70 hover:opacity-100"
                          }`}
                          style={{ backgroundColor: preset.hex }}
                        />
                      )
                    })}
                  </div>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-50 dark:bg-white/[0.02] hover:bg-zinc-100 dark:hover:bg-white/[0.06] border border-dashed border-zinc-200 dark:border-white/[0.1] transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Создать новую категорию</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
