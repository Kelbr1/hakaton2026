import React, { useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderPlus,
  Tag,
} from "lucide-react"
import { api } from "../api/client"
import { CATEGORY_COLOR_PRESETS } from "../utils/colors"
import Tooltip from "./Tooltip"
import type { Category, Lecture } from "../types"

interface UploadModalProps {
  isOpen: boolean
  onClose: () => void
  onLectureCreated: (lecture: Lecture) => void
  categories: Category[]
  onCategoryCreated: (category: Category) => void
}

type TabType = "file" | "url"

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onLectureCreated,
  categories,
  onCategoryCreated,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("file")
  const [dragActive, setDragActive] = useState<boolean>(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [title, setTitle] = useState<string>("")
  const [url, setUrl] = useState<string>("")
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(undefined)
  const [isCreatingCategory, setIsCreatingCategory] = useState<boolean>(false)
  const [newCategoryName, setNewCategoryName] = useState<string>("")
  const [newCategoryColor, setNewCategoryColor] = useState<string>("#3b82f6")
  const [loading, setLoading] = useState<boolean>(false)
  const [uploadPercent, setUploadPercent] = useState<number>(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetForm = () => {
    setSelectedFile(null)
    setTitle("")
    setUrl("")
    setSelectedCategoryId(undefined)
    setIsCreatingCategory(false)
    setNewCategoryName("")
    setNewCategoryColor("#3b82f6")
    setLoading(false)
    setUploadPercent(0)
    setErrorMessage(null)
  }

  const handleClose = () => {
    if (loading) return
    resetForm()
    onClose()
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      setSelectedFile(file)
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ""))
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setSelectedFile(file)
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ""))
      }
    }
  }

  const handleCreateNewCategory = async (e: React.MouseEvent) => {
    e.preventDefault()
    const trimmed = newCategoryName.trim()
    if (!trimmed) return

    try {
      const created = await api.createCategory(trimmed, newCategoryColor)
      onCategoryCreated(created)
      setSelectedCategoryId(created.id)
      setIsCreatingCategory(false)
      setNewCategoryName("")
      setNewCategoryColor("#3b82f6")
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || "Ошибка при создании категории")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (activeTab === "file") {
      if (!selectedFile) {
        setErrorMessage("Пожалуйста, выберите видеофайл для загрузки.")
        return
      }
      try {
        setLoading(true)
        const created = await api.uploadLecture(
          selectedFile,
          title || undefined,
          selectedCategoryId,
          (percent) => setUploadPercent(percent)
        )
        onLectureCreated(created)
        handleClose()
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || "Ошибка при загрузке видеофайла."
        )
        setLoading(false)
      }
    } else {
      if (!url.trim()) {
        setErrorMessage("Пожалуйста, введите ссылку на видео.")
        return
      }
      try {
        setLoading(true)
        const created = await api.importLectureUrl(
          url.trim(),
          title || undefined,
          selectedCategoryId
        )
        onLectureCreated(created)
        handleClose()
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || "Ошибка при импорте видео по ссылке."
        )
        setLoading(false)
      }
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg rounded-3xl liquid-glass-modal overflow-hidden z-10"
          >
            {/* Заголовок */}
            <div className="p-6 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
                  Добавление видеолекции
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Видео будет транскрибировано и проиндексировано локальным ИИ
                </p>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-full liquid-glass-subtle hover:bg-black/10 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-700 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Переключатель вкладок */}
            <div className="px-6 pt-5">
              <div className="relative flex p-1 liquid-glass-subtle rounded-2xl">
                {/* Скользящий стеклянный индикатор активной вкладки */}
                <div
                  className="absolute top-1 bottom-1 left-1 rounded-xl liquid-tab-indicator pointer-events-none"
                  style={{
                    width: "calc(50% - 4px)",
                    transform: activeTab === "file" ? "translateX(0%)" : "translateX(100%)",
                  }}
                />

                <button
                  type="button"
                  onClick={() => setActiveTab("file")}
                  className={`relative z-10 flex-1 py-1.5 text-xs font-medium rounded-xl transition-colors cursor-pointer text-center ${
                    activeTab === "file"
                      ? "text-zinc-900 dark:text-white font-semibold"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  Видеофайл (MP4, WebM)
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("url")}
                  className={`relative z-10 flex-1 py-1.5 text-xs font-medium rounded-xl transition-colors cursor-pointer text-center ${
                    activeTab === "url"
                      ? "text-zinc-900 dark:text-white font-semibold"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  По ссылке (YouTube, Vimeo)
                </button>
              </div>
            </div>

            {/* Тело формы */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {activeTab === "file" ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                      dragActive
                        ? "border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.25)]"
                        : "liquid-glass-subtle border-cyan-500/20 dark:border-white/15 hover:border-cyan-400/50 hover:bg-cyan-500/5"
                    }`}
                  >
                    {selectedFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400 flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div className="text-xs font-medium text-zinc-900 dark:text-white max-w-xs truncate">
                          {selectedFile.name}
                        </div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                          {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-full liquid-glass-subtle text-cyan-500 dark:text-cyan-400 flex items-center justify-center">
                          <UploadCloud className="w-5 h-5" />
                        </div>
                        <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                          Перетащите видео сюда или{" "}
                          <span className="text-cyan-500 dark:text-cyan-400 underline underline-offset-2">
                            выберите файл
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                          Поддерживаются MP4, WebM, MOV, MKV
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    URL видео
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full liquid-glass-input rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-none transition-all"
                  />
                </div>
              )}

              {/* Поле названия */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Название лекции (необязательно)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Автоматически из файла или видеосервиса"
                  className="w-full liquid-glass-input rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-none transition-all"
                />
              </div>

              {/* Выбор или создание категории */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
                    <span>Категория лекции</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCreatingCategory(!isCreatingCategory)}
                    className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 font-medium transition-colors cursor-pointer"
                  >
                    {isCreatingCategory ? "Отмена" : "+ Создать новую"}
                  </button>
                </div>

                {!isCreatingCategory ? (
                  <select
                    value={selectedCategoryId ?? ""}
                    onChange={(e) => {
                      const val = e.target.value
                      setSelectedCategoryId(val ? Number(val) : undefined)
                    }}
                    className="w-full liquid-glass-input rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="" className="bg-white dark:bg-[#12121e]">Без категории</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id} className="bg-white dark:bg-[#12121e]">
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-2.5 p-3 rounded-2xl liquid-glass-subtle">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Название (например: Математика)"
                        className="flex-1 liquid-glass-input rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCreateNewCategory}
                        disabled={!newCategoryName.trim()}
                        className="px-3 py-2 rounded-xl liquid-btn-primary disabled:opacity-40 text-white text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        <span>Сохранить</span>
                      </button>
                    </div>

                    {/* Выбор цвета категории */}
                    <div className="flex items-center justify-between pt-1 border-t border-black/[0.06] dark:border-white/[0.06]">
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">Цвет метки:</span>
                      <div className="flex items-center gap-2">
                        {CATEGORY_COLOR_PRESETS.map((preset) => {
                          const isSelected = newCategoryColor === preset.hex
                          return (
                            <Tooltip key={preset.id} content={preset.label} position="top">
                              <button
                                type="button"
                                onClick={() => setNewCategoryColor(preset.hex)}
                                className={`w-4 h-4 rounded-full transition-transform cursor-pointer relative ${
                                  isSelected
                                    ? "scale-125 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#121215] ring-cyan-400"
                                    : "hover:scale-110 opacity-70 hover:opacity-100"
                                }`}
                                style={{ backgroundColor: preset.hex }}
                              />
                            </Tooltip>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Сообщение об ошибке */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 backdrop-blur-sm text-xs text-red-600 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Прогресс отправки */}
              {loading && activeTab === "file" && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                    <span>Загрузка файла на сервер...</span>
                    <span>{uploadPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 liquid-glass-subtle rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full shadow-[0_0_8px_rgba(6,182,212,0.5)] transition-all duration-200"
                      style={{ width: `${uploadPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Кнопка отправки */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-medium liquid-btn-glass transition-all cursor-pointer disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-xl text-xs font-medium liquid-btn-primary transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{loading ? "Обработка..." : "Добавить лекцию"}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
