import React, { useState, useEffect, useRef, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  Clock,
  Play,
  Film,
  Link,
  Trash2,
  Sparkles,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Calendar,
  X,
  RotateCw,
  Star,
  Plus,
  Check,
  Tag,
  Pencil,
  ChevronDown,
  ArrowUpDown,
} from "lucide-react"
import { api } from "../api/client"
import { formatTimecode, formatDate } from "../utils/format"
import { CATEGORY_COLOR_PRESETS, getCategoryHex } from "../utils/colors"
import { ConfirmModal } from "./ConfirmModal"
import { AssignCategoryModal } from "./AssignCategoryModal"
import Tooltip from "./Tooltip"
import type { Lecture, SearchResultItem, Category, User } from "../types"

export type SortOption =
  | "date_desc"
  | "date_asc"
  | "title_asc"
  | "duration_desc"
  | "duration_asc"

export const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: "date_desc", label: "Сначала новые" },
  { id: "date_asc", label: "Сначала старые" },
  { id: "title_asc", label: "По названию (А-Я)" },
  { id: "duration_desc", label: "По длительности (убыв.)" },
  { id: "duration_asc", label: "По длительности (возр.)" },
]

interface DashboardViewProps {
  lectures: Lecture[]
  categories: Category[]
  selectedCategoryId: number | null
  onSelectCategory: (categoryId: number | null) => void
  onlyFavorites: boolean
  onToggleOnlyFavorites: (onlyFav: boolean) => void
  onCreateCategory: (name: string, color?: string) => Promise<Category | void>
  onUpdateCategory: (id: number, name: string, color?: string) => Promise<Category | void>
  onDeleteCategory: (id: number) => Promise<void>
  onAssignCategory: (lectureId: number, categoryId: number | null) => Promise<void>
  onToggleFavorite: (lectureId: number) => void
  currentUser: User | null
  onOpenAuth: (message?: string) => void
  onSelectLecture: (lectureId: number, initialTimecode?: number) => void
  onDeleteLecture: (lectureId: number) => void
  onRetryLecture?: (lectureId: number) => void
  onOpenUpload: () => void
}

const PIPELINE_STEPS = [
  { key: "extracting_audio", label: "Извлечение аудио" },
  { key: "transcribing", label: "Транскрибация речи" },
  { key: "indexing", label: "Семантический индекс" },
  { key: "summarizing", label: "Генерация конспекта" },
]

interface LectureCardThumbnailProps {
  lecture: Lecture
  isReady: boolean
  hasProgress: boolean
  progressPercent: number
  isFav: boolean
  onFavoriteClick: (e: React.MouseEvent) => void
  onDeleteClick: (e: React.MouseEvent) => void
  onAssignCategoryClick: (e: React.MouseEvent) => void
}

const LectureCardThumbnail: React.FC<LectureCardThumbnailProps> = ({
  lecture,
  isReady,
  hasProgress,
  progressPercent,
  isFav,
  onFavoriteClick,
  onDeleteClick,
  onAssignCategoryClick,
}) => {
  const [imgError, setImgError] = useState<boolean>(false)
  const [imgLoaded, setImgLoaded] = useState<boolean>(false)

  return (
    <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-slate-900/80 dark:bg-black/60 border border-slate-200/60 dark:border-white/[0.1] mb-3.5 shadow-sm group/thumb select-none">
      {/* Фоновый градиент заглушки (пока изображение загружается или при ошибке) */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950/70 flex items-center justify-center">
        <Film className="w-9 h-9 text-white/20" />
      </div>

      {/* Фото-превью видеокадра */}
      {!imgError && (
        <img
          src={api.getThumbnailUrl(lecture.id)}
          alt={lecture.title}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ${
            imgLoaded ? "opacity-100" : "opacity-0"
          } ${isReady ? "group-hover:scale-105" : ""}`}
        />
      )}

      {/* Затемняющий градиент сверху и снизу для читаемости плашек */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/55 pointer-events-none" />

      {/* Верхний оверлей: Категория и источник слева, Избранное и Удаление справа */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 z-10">
        <div className="flex items-center gap-1.5 flex-wrap max-w-[70%]">
          {lecture.category ? (
            <Tooltip content="Нажмите, чтобы изменить категорию" position="top">
              <button
                type="button"
                onClick={onAssignCategoryClick}
                className="px-2 py-0.5 rounded-md text-[10px] font-medium flex items-center gap-1 backdrop-blur-md bg-black/55 border border-white/20 hover:bg-black/75 text-white transition-all cursor-pointer shadow-sm truncate"
                style={{
                  borderColor: `${getCategoryHex(lecture.category.color)}80`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: getCategoryHex(lecture.category.color) }}
                />
                <span className="truncate max-w-[100px]">{lecture.category.name}</span>
                <ChevronDown className="w-2.5 h-2.5 opacity-60 ml-0.5 shrink-0" />
              </button>
            </Tooltip>
          ) : (
            <Tooltip content="Указать категорию для этой лекции" position="top">
              <button
                type="button"
                onClick={onAssignCategoryClick}
                className="px-2 py-0.5 rounded-md text-[10px] font-medium text-white/90 backdrop-blur-md bg-black/45 hover:bg-black/70 border border-dashed border-white/30 flex items-center gap-1 transition-all cursor-pointer shadow-sm"
              >
                <Tag className="w-2.5 h-2.5 text-white/70" />
                <span>+ Категория</span>
              </button>
            </Tooltip>
          )}

          {/* Источник: URL или файл */}
          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono backdrop-blur-md bg-black/45 border border-white/15 text-white/80 flex items-center gap-1">
            {lecture.source_type === "url" ? (
              <Link className="w-2.5 h-2.5 text-cyan-400" />
            ) : (
              <Film className="w-2.5 h-2.5 text-slate-300" />
            )}
            <span className="uppercase">{lecture.source_type}</span>
          </span>
        </div>

        {/* Кнопки действий: Избранное (звезда) и Удаление */}
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip content={isFav ? "Удалить из избранного" : "Добавить в избранное"} position="top">
            <button
              type="button"
              onClick={onFavoriteClick}
              className={`w-7 h-7 rounded-lg backdrop-blur-md flex items-center justify-center transition-all cursor-pointer border ${
                isFav
                  ? "bg-amber-500/30 border-amber-400/70 text-amber-300 shadow-sm"
                  : "bg-black/45 hover:bg-black/70 border-white/20 text-white/80 hover:text-amber-400"
              }`}
            >
              <Star
                className={`w-3.5 h-3.5 transition-transform ${
                  isFav ? "fill-amber-400 scale-110" : ""
                }`}
              />
            </button>
          </Tooltip>

          <Tooltip content="Удалить лекцию" position="top">
            <button
              type="button"
              onClick={onDeleteClick}
              className="w-7 h-7 rounded-lg backdrop-blur-md bg-black/45 hover:bg-red-600/80 border border-white/20 text-white/80 hover:text-white transition-colors flex items-center justify-center cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Центральная кнопка Play при ховере */}
      {isReady && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-11 h-11 rounded-full backdrop-blur-md bg-white/25 dark:bg-white/20 border border-white/40 text-white flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 opacity-0 group-hover:opacity-100 transition-all duration-300">
            <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
          </div>
        </div>
      )}

      {/* Правый нижний угол: длительность видео */}
      {lecture.duration > 0 && (
        <div className="absolute bottom-2.5 right-2.5 z-10 pointer-events-none">
          <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium backdrop-blur-md bg-black/75 text-white/95 border border-white/15 shadow-sm flex items-center gap-1">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>{formatTimecode(lecture.duration)}</span>
          </span>
        </div>
      )}

      {/* Линия прогресса просмотра по нижнему краю превью */}
      {hasProgress && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50 z-10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  )
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  lectures,
  categories,
  selectedCategoryId,
  onSelectCategory,
  onlyFavorites,
  onToggleOnlyFavorites,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onAssignCategory,
  onToggleFavorite,
  currentUser,
  onOpenAuth,
  onSelectLecture,
  onDeleteLecture,
  onRetryLecture,
  onOpenUpload,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
  const [isSearching, setIsSearching] = useState<boolean>(false)
  const searchTimeoutRef = useRef<number | null>(null)
  const spotlightInputRef = useRef<HTMLInputElement>(null)

  // Модальные окна
  const [lectureToDelete, setLectureToDelete] = useState<Lecture | null>(null)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [lectureToAssignCategory, setLectureToAssignCategory] = useState<Lecture | null>(null)

  // Управление категориями (создание и редактирование)
  const [isCreatingCategory, setIsCreatingCategory] = useState<boolean>(false)
  const [newCatName, setNewCatName] = useState<string>("")
  const [newCatColor, setNewCatColor] = useState<string>("#3b82f6")
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingCatName, setEditingCatName] = useState<string>("")
  const [editingCatColor, setEditingCatColor] = useState<string>("#3b82f6")
  const [isSubmittingCat, setIsSubmittingCat] = useState<boolean>(false)

  // Сортировка лекций
  const [sortBy, setSortBy] = useState<SortOption>("date_desc")
  const [isSortOpen, setIsSortOpen] = useState<boolean>(false)

  // Интерактивный стеклянный блик за курсором (Liquid Glass Spotlight)
  const handleSpotlightMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`)
    e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`)
  }

  // Горячая клавиша Cmd/Ctrl+K или / для быстрого фокуса на поиске Spotlight
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isTyping =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA"

      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !isTyping)) {
        e.preventDefault()
        spotlightInputRef.current?.focus()
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [])

  // Дебаунс-поиск по смыслу по всем лекциям
  useEffect(() => {
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current)
    }

    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = window.setTimeout(async () => {
      try {
        const results = await api.search(trimmed, undefined, 8)
        setSearchResults(results)
      } catch (err) {
        console.error("Semantic search error:", err)
      } finally {
        setIsSearching(false)
      }
    }, 280)

    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery])

  // Фильтрация и сортировка лекций по категории, избранному и выбранному критерию
  const filteredLectures = useMemo(() => {
    const list = lectures.filter((lecture) => {
      if (onlyFavorites && !lecture.is_favorite) {
        return false
      }
      if (selectedCategoryId !== null && lecture.category_id !== selectedCategoryId) {
        return false
      }
      return true
    })

    return [...list].sort((a, b) => {
      if (sortBy === "date_desc") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      if (sortBy === "date_asc") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }
      if (sortBy === "title_asc") {
        return a.title.localeCompare(b.title, "ru")
      }
      if (sortBy === "duration_desc") {
        return (b.duration || 0) - (a.duration || 0)
      }
      if (sortBy === "duration_asc") {
        return (a.duration || 0) - (b.duration || 0)
      }
      return 0
    })
  }, [lectures, onlyFavorites, selectedCategoryId, sortBy])

  const favoritesCount = useMemo(() => {
    return lectures.filter((l) => l.is_favorite).length
  }, [lectures])

  const selectedCategory = useMemo(() => {
    return categories.find((c) => c.id === selectedCategoryId) || null
  }, [categories, selectedCategoryId])

  const handleCreateCategorySubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = newCatName.trim()
    if (!trimmed) {
      setIsCreatingCategory(false)
      return
    }

    setIsSubmittingCat(true)
    try {
      const created = await onCreateCategory(trimmed, newCatColor)
      setNewCatName("")
      setNewCatColor("#3b82f6")
      setIsCreatingCategory(false)
      if (created && created.id) {
        onToggleOnlyFavorites(false)
        onSelectCategory(created.id)
      }
    } catch (err) {
      console.error("Failed to create category:", err)
    } finally {
      setIsSubmittingCat(false)
    }
  }

  const handleUpdateCategorySubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!editingCategoryId) return
    const trimmed = editingCatName.trim()
    if (!trimmed) {
      setEditingCategoryId(null)
      return
    }

    setIsSubmittingCat(true)
    try {
      await onUpdateCategory(editingCategoryId, trimmed, editingCatColor)
      setEditingCategoryId(null)
      setEditingCatName("")
      setEditingCatColor("#3b82f6")
    } catch (err) {
      console.error("Failed to update category:", err)
    } finally {
      setIsSubmittingCat(false)
    }
  }

  const handleFavoriteClick = (e: React.MouseEvent, lectureId: number) => {
    e.stopPropagation()
    if (!currentUser) {
      onOpenAuth("Войдите в систему, чтобы добавлять лекции в избранное")
      return
    }
    onToggleFavorite(lectureId)
  }

  const handleUploadClick = () => {
    if (!currentUser) {
      onOpenAuth("Загрузка лекций доступна только авторизованным пользователям")
      return
    }
    onOpenUpload()
  }

  const getStepIndex = (status: string): number => {
    switch (status) {
      case "uploading":
      case "extracting_audio":
        return 0
      case "transcribing":
        return 1
      case "indexing":
        return 2
      case "summarizing":
        return 3
      case "ready":
        return 4
      default:
        return 0
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10 transition-colors duration-300">
      {/* 1. Глобальный семантический поиск в стиле Apple Spotlight */}
      <section className="relative max-w-3xl mx-auto">
        <div className="text-center mb-6 space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white transition-colors">
            Интеллектуальный поиск по лекциям
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-normal transition-colors">
            Ищите по смыслу тем, формул и идей во всех видеоматериалах курса
          </p>
        </div>

        {/* Инпут поиска в стиле Spotlight */}
        <div className="relative group">
          <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-cyan-500/25 via-blue-600/20 to-indigo-500/25 opacity-70 blur-xl group-hover:opacity-100 transition duration-500" />
          <div className="relative flex items-center liquid-glass-input rounded-2xl px-4 py-3.5 focus-within:border-cyan-400/80 transition-all">
            <Search className="w-5 h-5 text-slate-400 dark:text-zinc-500 mr-3 shrink-0" />
            <input
              ref={spotlightInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Например: как устроен механизм внимания в трансформерах..."
              className="w-full bg-transparent text-sm sm:text-base text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none"
            />
            {isSearching ? (
              <Loader2 className="w-5 h-5 text-cyan-500 dark:text-cyan-400 animate-spin shrink-0 ml-2" />
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="w-5 h-5 text-slate-400 hover:text-slate-700 dark:hover:text-white shrink-0 ml-2 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Результаты семантического поиска */}
        <AnimatePresence>
          {searchQuery.trim().length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="mt-4 space-y-2.5"
            >
              <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-zinc-400 font-medium">
                <span>
                  {searchResults.length > 0
                    ? `Найдено смысловых фрагментов: ${searchResults.length}`
                    : isSearching
                    ? "Идет семантический поиск по векторной базе..."
                    : "Совпадений не обнаружено"}
                </span>
                <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                  Sentence-Transformers 384D
                </span>
              </div>

              {searchResults.map((hit) => (
                <motion.div
                  key={hit.chunk_id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.005 }}
                  onClick={() => onSelectLecture(hit.lecture_id, hit.start_time)}
                  onMouseEnter={handleSpotlightMouseMove}
                  onMouseMove={handleSpotlightMouseMove}
                  className="p-3.5 sm:p-4 rounded-2xl liquid-glass-card transition-all cursor-pointer shadow-lg group relative"
                >
                  {/* Интерактивный стеклянный блик за курсором */}
                  <div className="liquid-card-spotlight pointer-events-none" aria-hidden="true" />

                  <div className="relative z-10 flex items-start gap-3.5">
                    {/* Миниатюра кадра видео */}
                    <div className="relative w-24 sm:w-28 aspect-video rounded-xl overflow-hidden shrink-0 bg-slate-900/80 border border-slate-200/50 dark:border-white/10 hidden xs:block">
                      <img
                        src={api.getThumbnailUrl(hit.lecture_id)}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.currentTarget.style.display = "none"
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                      <span className="absolute bottom-1 right-1 text-[9px] font-mono font-medium text-white/90 bg-black/75 px-1 py-0.5 rounded backdrop-blur-sm border border-white/10">
                        {formatTimecode(hit.start_time)}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <div className="flex items-center gap-2 truncate">
                          <Film className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
                          <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {hit.lecture_title}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
                            {hit.score}% по смыслу
                          </span>

                          <span className="px-2 py-0.5 rounded-md text-xs font-mono font-semibold liquid-glass-subtle text-slate-800 dark:text-white flex items-center gap-1 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <Play className="w-2.5 h-2.5 fill-current" />
                            [{formatTimecode(hit.start_time)}]
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-zinc-300 line-clamp-2 leading-relaxed">
                        «{hit.text}»
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* 2. Основная область: Левый сайдбар (Категории + Избранное) и Правая сетка лекций */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ================= ЛЕВАЯ КОЛОНКА / САЙДБАР (3 колонки) ================= */}
        <aside className="lg:col-span-3 space-y-4 lg:sticky lg:top-24">
          <div className="liquid-glass rounded-3xl p-4 shadow-xl space-y-5 transition-colors">
            {/* Группа: Библиотека */}
            <div className="space-y-1">
              <div className="px-3 pb-1 text-[11px] font-mono uppercase text-slate-400 dark:text-zinc-500 tracking-wider font-semibold">
                Библиотека
              </div>

              {/* Все лекции */}
              <button
                type="button"
                onClick={() => {
                  onToggleOnlyFavorites(false)
                  onSelectCategory(null)
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-all cursor-pointer ${
                  !onlyFavorites && selectedCategoryId === null
                    ? "liquid-btn-primary text-white font-semibold shadow-liquid-btn"
                    : "liquid-btn-glass text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Film className="w-4 h-4 shrink-0" />
                  <span>Все лекции</span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                    !onlyFavorites && selectedCategoryId === null
                      ? "bg-white/25 text-white font-semibold"
                      : "liquid-glass-subtle text-slate-600 dark:text-zinc-400"
                  }`}
                >
                  {lectures.length}
                </span>
              </button>

              {/* Избранное */}
              <button
                type="button"
                onClick={() => {
                  if (!currentUser && !onlyFavorites) {
                    onOpenAuth("Войдите в личный профиль, чтобы смотреть избранные лекции")
                    return
                  }
                  onToggleOnlyFavorites(!onlyFavorites)
                  if (!onlyFavorites) onSelectCategory(null)
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-all cursor-pointer ${
                  onlyFavorites
                    ? "bg-gradient-to-r from-amber-400 to-amber-500 text-black font-semibold shadow-md shadow-amber-400/20 border border-white/40"
                    : "liquid-btn-glass text-slate-700 dark:text-zinc-300 hover:text-amber-500 dark:hover:text-amber-300"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Star
                    className={`w-4 h-4 shrink-0 ${
                      onlyFavorites ? "fill-black text-black" : "text-amber-500 dark:text-amber-400"
                    }`}
                  />
                  <span>Избранное</span>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                    onlyFavorites
                      ? "bg-black/15 text-black font-semibold"
                      : "liquid-glass-subtle text-slate-600 dark:text-zinc-400"
                  }`}
                >
                  {favoritesCount}
                </span>
              </button>
            </div>

            {/* Разделитель */}
            <div className="h-[1px] bg-slate-200/70 dark:bg-white/[0.08] mx-1" />

            {/* Группа: Категории */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-3 pb-1">
                <span className="text-[11px] font-mono uppercase text-slate-400 dark:text-zinc-500 tracking-wider font-semibold">
                  Категории
                </span>
                <Tooltip content="Добавить категорию" position="top">
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUser) {
                        onOpenAuth("Авторизуйтесь, чтобы создавать категории")
                        return
                      }
                      setIsCreatingCategory(true)
                    }}
                    className="w-5 h-5 rounded-md hover:bg-white/60 dark:hover:bg-white/[0.08] text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
              </div>

              {/* Форма создания новой категории */}
              {isCreatingCategory && (
                <form
                  onSubmit={handleCreateCategorySubmit}
                  className="p-2.5 liquid-glass-subtle border border-cyan-500/40 rounded-2xl shadow-inner mb-2 space-y-2"
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      autoFocus
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      placeholder="Название категории..."
                      disabled={isSubmittingCat}
                      className="flex-1 bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none px-1"
                    />
                    <Tooltip content="Сохранить" position="top">
                      <button
                        type="submit"
                        disabled={isSubmittingCat || !newCatName.trim()}
                        className="w-6 h-6 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white flex items-center justify-center cursor-pointer transition-colors shrink-0 shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Отмена" position="top">
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingCategory(false)
                          setNewCatName("")
                          setNewCatColor("#3b82f6")
                        }}
                        className="w-6 h-6 rounded-lg bg-slate-200/80 dark:bg-white/[0.08] hover:bg-slate-300 dark:hover:bg-white/[0.15] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </Tooltip>
                  </div>

                  {/* Выбор цвета новой категории */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 dark:border-white/[0.06]">
                    <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">Цвет метки:</span>
                    <div className="flex items-center gap-1.5">
                      {CATEGORY_COLOR_PRESETS.map((preset) => {
                        const isSelected = newCatColor === preset.hex
                        return (
                          <Tooltip key={preset.id} content={preset.label} position="top">
                            <button
                              type="button"
                              onClick={() => setNewCatColor(preset.hex)}
                              className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer relative ${
                                isSelected
                                  ? "scale-125 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#121526] ring-blue-500"
                                  : "hover:scale-110 opacity-70 hover:opacity-100"
                              }`}
                              style={{ backgroundColor: preset.hex }}
                            />
                          </Tooltip>
                        )
                      })}
                    </div>
                  </div>
                </form>
              )}

              {/* Список категорий с действиями переименования и удаления */}
              <div className="space-y-1">
                {categories.map((cat) => {
                  const isSelected = !onlyFavorites && selectedCategoryId === cat.id
                  const count =
                    cat.lectures_count !== undefined
                      ? cat.lectures_count
                      : lectures.filter((l) => l.category_id === cat.id).length
                  const isEditing = editingCategoryId === cat.id

                  if (isEditing) {
                    return (
                      <form
                        key={cat.id}
                        onSubmit={handleUpdateCategorySubmit}
                        className="p-2.5 liquid-glass-subtle border border-amber-500/50 rounded-2xl shadow-inner space-y-2 mb-1"
                      >
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            autoFocus
                            value={editingCatName}
                            onChange={(e) => setEditingCatName(e.target.value)}
                            disabled={isSubmittingCat}
                            className="flex-1 bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none px-1"
                          />
                          <Tooltip content="Сохранить" position="top">
                            <button
                              type="submit"
                              disabled={isSubmittingCat || !editingCatName.trim()}
                              className="w-6 h-6 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white flex items-center justify-center cursor-pointer transition-colors shrink-0 shadow-sm"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Отмена" position="top">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategoryId(null)
                                setEditingCatName("")
                                setEditingCatColor("#3b82f6")
                              }}
                              className="w-6 h-6 rounded-lg bg-slate-200/80 dark:bg-white/[0.08] hover:bg-slate-300 dark:hover:bg-white/[0.15] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer transition-colors shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </Tooltip>
                        </div>

                        {/* Выбор цвета при редактировании категории */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60 dark:border-white/[0.06]">
                          <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">Цвет:</span>
                          <div className="flex items-center gap-1.5">
                            {CATEGORY_COLOR_PRESETS.map((preset) => {
                              const isSelected = editingCatColor === preset.hex
                              return (
                                <Tooltip key={preset.id} content={preset.label} position="top">
                                  <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => setEditingCatColor(preset.hex)}
                                    className={`w-3.5 h-3.5 rounded-full transition-transform cursor-pointer relative ${
                                      isSelected
                                        ? "scale-125 ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#121526] ring-amber-500"
                                        : "hover:scale-110 opacity-70 hover:opacity-100"
                                    }`}
                                    style={{ backgroundColor: preset.hex }}
                                  />
                                </Tooltip>
                              )
                            })}
                          </div>
                        </div>
                      </form>
                    )
                  }

                  return (
                    <div
                      key={cat.id}
                      onClick={() => {
                        onToggleOnlyFavorites(false)
                        onSelectCategory(cat.id)
                      }}
                      className={`group w-full flex items-center justify-between px-3.5 py-2 rounded-2xl text-xs font-medium transition-all cursor-pointer ${
                        isSelected
                          ? "liquid-btn-primary text-white font-semibold shadow-liquid-btn"
                          : "liquid-glass-subtle text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-white/[0.08]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate mr-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: getCategoryHex(cat.color) }}
                        />
                        <span className="truncate">{cat.name}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Бейдж количества */}
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-mono transition-opacity ${
                            isSelected
                              ? "bg-white/25 text-white"
                              : "liquid-glass-subtle text-slate-600 dark:text-zinc-400 group-hover:opacity-40"
                          }`}
                        >
                          {count}
                        </span>

                        {/* Кнопки переименования и удаления при ховере */}
                        <div
                          className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Tooltip content="Переименовать категорию" position="top">
                            <button
                              type="button"
                              onClick={() => {
                                if (!currentUser) {
                                  onOpenAuth("Авторизуйтесь, чтобы переименовывать категории")
                                  return
                                }
                                setEditingCategoryId(cat.id)
                                setEditingCatName(cat.name)
                                setEditingCatColor(getCategoryHex(cat.color))
                              }}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                isSelected
                                  ? "text-white/80 hover:text-white hover:bg-white/20"
                                  : "text-slate-400 hover:text-amber-500 hover:bg-white/60 dark:hover:text-amber-300 dark:hover:bg-white/[0.08]"
                              }`}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </Tooltip>

                          <Tooltip content="Удалить категорию" position="top">
                            <button
                              type="button"
                              onClick={() => {
                                if (!currentUser) {
                                  onOpenAuth("Авторизуйтесь, чтобы удалять категории")
                                  return
                                }
                                setCategoryToDelete(cat)
                              }}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                isSelected
                                  ? "text-white/80 hover:text-white hover:bg-white/20"
                                  : "text-slate-400 hover:text-red-500 hover:bg-red-500/10 dark:hover:text-red-400"
                              }`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {categories.length === 0 && !isCreatingCategory && (
                  <div className="px-3 py-3 text-center text-xs text-slate-400 dark:text-zinc-500">
                    Нет созданных категорий
                  </div>
                )}
              </div>

              {/* Кнопка создания категории снизу */}
              {!isCreatingCategory && (
                <button
                  type="button"
                  onClick={() => {
                    if (!currentUser) {
                      onOpenAuth("Авторизуйтесь, чтобы создавать категории")
                      return
                    }
                    setIsCreatingCategory(true)
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-2xl text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 liquid-glass-subtle hover:bg-white/70 dark:hover:bg-white/[0.06] border-dashed border-white/40 dark:border-white/[0.1] transition-all cursor-pointer mt-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Новая категория</span>
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* ================= ПРАВАЯ ОБЛАСТЬ: СЕТКА ЛЕКЦИЙ (9 колонок) ================= */}
        <section className="lg:col-span-9 space-y-6">
          {/* Заголовок текущего раздела */}
          <div className="flex items-center justify-between flex-wrap gap-4 pb-3 border-b border-slate-200/80 dark:border-white/[0.08] transition-colors">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5 transition-colors">
                {onlyFavorites ? (
                  <>
                    <Star className="w-5 h-5 text-amber-500 dark:text-amber-400 fill-amber-500 dark:fill-amber-400" />
                    <span>Избранные лекции</span>
                  </>
                ) : selectedCategory ? (
                  <>
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: getCategoryHex(selectedCategory.color) }}
                    />
                    <span>{selectedCategory.name}</span>
                  </>
                ) : (
                  <>
                    <Film className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                    <span>Все видеолекции</span>
                  </>
                )}

                <span className="text-xs font-mono font-normal text-slate-600 dark:text-zinc-300 px-2.5 py-0.5 rounded-full liquid-glass-subtle">
                  {filteredLectures.length}
                </span>
              </h2>

              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 transition-colors">
                {onlyFavorites
                  ? "Лекции, отмеченные звездочкой для быстрого повторения"
                  : selectedCategory
                  ? `Материалы категории «${selectedCategory.name}» с семантическим поиском`
                  : "Синхронизированные конспекты, оглавление и семантический ИИ-анализ"}
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Выпадающий список сортировки */}
              <div className="relative">
                <Tooltip content="Сортировка лекций" position="top">
                  <button
                    type="button"
                    onClick={() => setIsSortOpen(!isSortOpen)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl liquid-btn-glass text-xs font-medium text-slate-700 dark:text-zinc-300 transition-all cursor-pointer"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                    <span className="hidden sm:inline">
                      {SORT_OPTIONS.find((s) => s.id === sortBy)?.label || "Сортировка"}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </button>
                </Tooltip>

                {isSortOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 py-1.5 rounded-2xl liquid-glass-modal shadow-2xl z-30 space-y-0.5">
                    <div className="px-3 py-1 text-[10px] uppercase font-semibold text-slate-400 dark:text-zinc-500 border-b border-slate-200/60 dark:border-white/[0.06]">
                      Сортировка
                    </div>
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSortBy(opt.id)
                          setIsSortOpen(false)
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors cursor-pointer ${
                          sortBy === opt.id
                            ? "text-cyan-600 dark:text-cyan-400 font-semibold bg-cyan-500/10"
                            : "text-slate-700 dark:text-zinc-300 hover:bg-white/60 dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {sortBy === opt.id && <Check className="w-3.5 h-3.5 text-cyan-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleUploadClick}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl liquid-btn-primary text-xs font-semibold text-white transition-all shadow-liquid-btn cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Добавить лекцию</span>
              </button>
            </div>
          </div>

          {/* Сетка карточек лекций */}
          {filteredLectures.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-300/70 dark:border-white/[0.12] rounded-3xl liquid-glass p-8 space-y-4">
              <div className="w-12 h-12 rounded-2xl liquid-glass-subtle text-slate-400 dark:text-zinc-500 flex items-center justify-center mx-auto">
                {onlyFavorites ? (
                  <Star className="w-6 h-6 text-amber-500/70 dark:text-amber-400/60" />
                ) : (
                  <Film className="w-6 h-6" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {onlyFavorites
                    ? "У вас пока нет лекций в избранном"
                    : selectedCategoryId !== null
                    ? "В выбранной категории пока нет лекций"
                    : "В библиотеке пока нет лекций"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                  {onlyFavorites
                    ? "Нажимайте на звездочку на карточке любой лекции, чтобы добавить её в избранное для быстрого доступа."
                    : selectedCategoryId !== null
                    ? "Загрузите новую лекцию в эту категорию или перенесите существующую."
                    : "Загрузите первый видеофайл или укажите ссылку на YouTube/Vimeo, чтобы запустить автономный ИИ-анализ."}
                </p>
              </div>
              {onlyFavorites ? (
                <button
                  type="button"
                  onClick={() => onToggleOnlyFavorites(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium liquid-btn-glass text-slate-800 dark:text-white transition-all cursor-pointer inline-flex items-center gap-2"
                >
                  <span>Ко всем лекциям</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="px-4 py-2 rounded-xl text-xs font-medium liquid-btn-primary text-white transition-all shadow-liquid-btn inline-flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Загрузить лекцию</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredLectures.map((lecture) => {
                const isReady = lecture.status === "ready"
                const isError = lecture.status === "error"
                const currentStepIdx = getStepIndex(lecture.status)
                const isFav = lecture.is_favorite ?? false

                // Сохраненный прогресс просмотра из localStorage
                const savedProg = localStorage.getItem(`cyberbreak_progress_${lecture.id}`)
                const progressSec = savedProg ? parseFloat(savedProg) : 0
                const hasProgress = progressSec > 5 && !!lecture.duration && lecture.duration > 0
                const progressPercent = hasProgress
                  ? Math.min(100, Math.round((progressSec / (lecture.duration || 1)) * 100))
                  : 0

                return (
                  <motion.div
                    key={lecture.id}
                    whileHover={{ y: -4 }}
                    transition={{ type: "spring", stiffness: 320, damping: 26 }}
                    onClick={() => {
                      if (isReady) {
                        onSelectLecture(lecture.id)
                      }
                    }}
                    onMouseEnter={handleSpotlightMouseMove}
                    onMouseMove={handleSpotlightMouseMove}
                    className={`relative flex flex-col justify-between p-4 sm:p-5 rounded-3xl liquid-glass-card shadow-liquid-card-light dark:shadow-liquid-card transition-all ${
                      isReady ? "cursor-pointer group" : "cursor-default"
                    }`}
                  >
                    {/* Интерактивный стеклянный блик за курсором */}
                    <div className="liquid-card-spotlight pointer-events-none" aria-hidden="true" />

                    {/* Верхняя секция карточки */}
                    <div className="relative z-10">
                      {/* Фото-превью видео с плашками категории, длительности и кнопками действий */}
                      <LectureCardThumbnail
                        lecture={lecture}
                        isReady={isReady}
                        hasProgress={hasProgress}
                        progressPercent={progressPercent}
                        isFav={isFav}
                        onFavoriteClick={(e) => handleFavoriteClick(e, lecture.id)}
                        onDeleteClick={(e) => {
                          e.stopPropagation()
                          setLectureToDelete(lecture)
                        }}
                        onAssignCategoryClick={(e) => {
                          e.stopPropagation()
                          if (!currentUser) {
                            onOpenAuth("Авторизуйтесь, чтобы менять категории лекций")
                            return
                          }
                          setLectureToAssignCategory(lecture)
                        }}
                      />

                      <h3 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight line-clamp-2 mb-2 group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors">
                        {lecture.title}
                      </h3>

                      {/* Текстовый индикатор прогресса просмотра */}
                      {hasProgress && (
                        <div className="mt-2 mb-1 p-2 rounded-xl liquid-glass-subtle border border-cyan-500/25 flex items-center justify-between text-[10px] font-mono">
                          <span className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400 font-semibold">
                            <Play className="w-2.5 h-2.5 fill-current" />
                            Просмотрено {progressPercent}%
                          </span>
                          <span className="text-slate-500 dark:text-zinc-400 font-medium">
                            {formatTimecode(progressSec)} / {formatTimecode(lecture.duration)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Нижняя секция: статус или метрики */}
                    <div className="relative z-10 mt-3 pt-3 border-t border-slate-200/60 dark:border-white/[0.06]">
                      {isReady ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {formatDate(lecture.created_at)}
                            </span>
                            <div className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 liquid-glass-subtle px-2 py-0.5 rounded-md border border-emerald-500/25">
                              <span>Готово к изучению</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-end text-xs text-cyan-600 dark:text-cyan-400 font-medium group-hover:translate-x-1 transition-transform">
                            <span className="flex items-center gap-0.5">
                              Открыть
                              <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>
                      ) : isError ? (
                        <div className="space-y-2">
                          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-300 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500 dark:text-red-400 mt-0.5" />
                            <div>
                              <div className="font-medium text-red-700 dark:text-red-300">Ошибка обработки</div>
                              <div className="text-[11px] text-red-600/80 dark:text-red-400/80 line-clamp-2">
                                {lecture.error_message || "Не удалось обработать видео."}
                              </div>
                            </div>
                          </div>
                          {onRetryLecture && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onRetryLecture(lecture.id)
                              }}
                              className="w-full py-1.5 px-3 rounded-lg liquid-btn-glass text-xs text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-all flex items-center justify-center gap-1.5 font-medium cursor-pointer"
                            >
                              <RotateCw className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
                              <span>Повторить обработку</span>
                            </button>
                          )}
                        </div>
                      ) : (
                        /* Пошаговый степпер обработки лекции */
                        <div className="space-y-2.5 py-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-cyan-600 dark:text-cyan-400 font-medium flex items-center gap-1.5">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {PIPELINE_STEPS[currentStepIdx]?.label || "Обработка..."}
                            </span>
                            <span className="text-slate-400 dark:text-zinc-500 font-mono text-[10px]">
                              {currentStepIdx + 1}/4
                            </span>
                          </div>

                          <div className="grid grid-cols-4 gap-1.5">
                            {PIPELINE_STEPS.map((step, idx) => {
                              const isCompleted = idx < currentStepIdx
                              const isCurrent = idx === currentStepIdx

                              return (
                                <Tooltip
                                  key={step.key}
                                  content={step.label}
                                  position="top"
                                  className="w-full"
                                >
                                  <div className="w-full space-y-1">
                                    <div
                                      className={`h-1.5 rounded-full transition-all duration-300 ${
                                        isCompleted
                                          ? "bg-gradient-to-r from-cyan-500 to-blue-600 shadow-sm"
                                          : isCurrent
                                          ? "bg-cyan-400 animate-pulse shadow-sm"
                                          : "bg-slate-200/80 dark:bg-white/[0.08]"
                                      }`}
                                    />
                                  </div>
                                </Tooltip>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Окно подтверждения удаления лекции */}
      <ConfirmModal
        isOpen={lectureToDelete !== null}
        title="Удалить лекцию?"
        itemTitle={lectureToDelete?.title}
        description="Все связанные материалы, расшифровка речи, семантические таймкоды и конспект будут безвозвратно удалены."
        confirmText="Удалить"
        cancelText="Отмена"
        type="danger"
        icon="trash"
        onConfirm={() => {
          if (lectureToDelete) {
            onDeleteLecture(lectureToDelete.id)
            setLectureToDelete(null)
          }
        }}
        onClose={() => setLectureToDelete(null)}
      />

      {/* Окно подтверждения удаления категории */}
      <ConfirmModal
        isOpen={categoryToDelete !== null}
        title="Удалить категорию?"
        itemTitle={categoryToDelete?.name}
        description="Лекции из этой категории сохранятся в общей библиотеке. Будет удалена только сама категория."
        confirmText="Удалить"
        cancelText="Отмена"
        type="danger"
        icon="trash"
        onConfirm={() => {
          if (categoryToDelete) {
            onDeleteCategory(categoryToDelete.id)
            setCategoryToDelete(null)
          }
        }}
        onClose={() => setCategoryToDelete(null)}
      />

      {/* Окно назначения / смены категории для лекции */}
      <AssignCategoryModal
        isOpen={lectureToAssignCategory !== null}
        lecture={lectureToAssignCategory}
        categories={categories}
        onAssignCategory={onAssignCategory}
        onCreateCategory={onCreateCategory}
        onClose={() => setLectureToAssignCategory(null)}
      />
    </div>
  )
}
