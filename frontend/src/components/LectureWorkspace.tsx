import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import ReactMarkdown from "react-markdown"
import {
  ArrowLeft,
  Play,
  Clock,
  BookOpen,
  FileText,
  Bookmark,
  Search,
  MessageSquare,
  Copy,
  Check,
  Download,
  Send,
  Loader2,
  HelpCircle,
  X,
  Volume2,
  Star,
  Tag,
  ChevronDown,
  Gauge,
  Tv,
  Maximize2,
  Minimize2,
  Expand,
} from "lucide-react"
import { api } from "../api/client"
import { formatTimecode } from "../utils/format"
import { getCategoryHex } from "../utils/colors"
import { AssignCategoryModal } from "./AssignCategoryModal"
import type {
  Lecture,
  LectureChapter,
  GlossaryTerm,
  SearchResultItem,
  User,
  Category,
} from "../types"

interface LectureWorkspaceProps {
  lectureId: number
  initialTimecode?: number
  onBack: () => void
  currentUser?: User | null
  categories?: Category[]
  onCreateCategory?: (name: string, color?: string) => Promise<Category | void>
  onAssignCategory?: (lectureId: number, categoryId: number | null) => Promise<void>
  onOpenAuth?: (message?: string) => void
  isFavorite?: boolean
  onToggleFavorite?: (lectureId: number) => void
}

type LeftTab = "structure" | "summary" | "glossary"
type RightTab = "transcript" | "search" | "chat"

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  sources?: Array<{
    timecode: number
    text: string
    score?: number
  }>
}

export const LectureWorkspace: React.FC<LectureWorkspaceProps> = ({
  lectureId,
  initialTimecode,
  onBack,
  currentUser,
  categories = [],
  onCreateCategory,
  onAssignCategory,
  onOpenAuth,
  isFavorite,
  onToggleFavorite,
}) => {
  const [lecture, setLecture] = useState<Lecture | null>(null)
  const [isAssignCategoryOpen, setIsAssignCategoryOpen] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [leftTab, setLeftTab] = useState<LeftTab>("structure")
  const [rightTab, setRightTab] = useState<RightTab>("transcript")
  const [copied, setCopied] = useState<boolean>(false)
  const [seekFlash, setSeekFlash] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState<boolean>(true)

  // 1. Управление скоростью воспроизведения
  const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2]
  const [playbackRate, setPlaybackRate] = useState<number>(() => {
    const saved = localStorage.getItem("cyberbreak_playback_rate")
    return saved ? parseFloat(saved) : 1.0
  })
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState<boolean>(false)

  // 2. Запоминание позиции просмотра
  const [savedProgressTime, setSavedProgressTime] = useState<number | null>(null)
  const [showResumePrompt, setShowResumePrompt] = useState<boolean>(false)
  const lastSavedTimeRef = useRef<number>(0)

  // 3. Театральный режим
  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(false)

  // Поиск внутри лекции
  const [lectureQuery, setLectureQuery] = useState<string>("")
  const [lectureSearchResults, setLectureSearchResults] = useState<SearchResultItem[]>([])
  const [isSearching, setIsSearching] = useState<boolean>(false)
  const searchTimeoutRef = useRef<number | null>(null)

  // Чат «Вопрос-ответ»
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Здравствуйте! Я локальный ИИ-ассистент по этой лекции. Задайте любой вопрос, и я отвечу строго по содержанию с таймкодами источников.",
    },
  ])
  const [chatInput, setChatInput] = useState<string>("")
  const [chatLoading, setChatLoading] = useState<boolean>(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const transcriptContainerRef = useRef<HTMLDivElement>(null)
  const segmentRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const lectureSearchInputRef = useRef<HTMLInputElement>(null)
  const lastSpaceToggleRef = useRef<number>(0)

  // Программный метод перемотки на точный таймкод
  const seekTo = useCallback((seconds: number) => {
    if (!videoRef.current) return
    const targetSec = Math.max(0, seconds)
    videoRef.current.currentTime = targetSec
    videoRef.current.play().catch(() => {})

    setSeekFlash(formatTimecode(targetSec))
    window.setTimeout(() => setSeekFlash(null), 1800)
  }, [])

  // Обработка горячих клавиш: Space (пауза/плей), стрелки (±5с), Cmd/Ctrl+K или / (поиск)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isTyping =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        (activeEl as HTMLElement)?.isContentEditable

      // Cmd/Ctrl + K или / для быстрого перехода к поиску
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !isTyping)) {
        e.preventDefault()
        setRightTab("search")
        window.setTimeout(() => {
          lectureSearchInputRef.current?.focus()
        }, 50)
        return
      }

      if (isTyping || !videoRef.current) return

      // Space — воспроизведение / пауза
      if (e.code === "Space") {
        e.preventDefault()
        if (e.repeat) return

        const now = Date.now()
        if (now - lastSpaceToggleRef.current < 250) {
          return
        }
        lastSpaceToggleRef.current = now

        // Снимаем фокус с кнопок и видео, чтобы исключить двойное срабатывание
        if (
          activeEl instanceof HTMLElement &&
          (activeEl.tagName === "BUTTON" || activeEl.tagName === "VIDEO")
        ) {
          activeEl.blur()
        }

        if (videoRef.current.paused) {
          videoRef.current.play().catch(() => {})
        } else {
          videoRef.current.pause()
        }
      }

      // Стрелки влево / вправо — перемотка на ±5 секунд
      if (e.code === "ArrowLeft") {
        e.preventDefault()
        const target = Math.max(0, videoRef.current.currentTime - 5)
        seekTo(target)
      } else if (e.code === "ArrowRight") {
        e.preventDefault()
        const maxDur = lecture?.duration || videoRef.current.duration || 99999
        const target = Math.min(maxDur, videoRef.current.currentTime + 5)
        seekTo(target)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [seekTo, lecture?.duration])

  // Загрузка детальных данных лекции
  useEffect(() => {
    let isMounted = true
    const loadLecture = async () => {
      try {
        setLoading(true)
        const data = await api.getLecture(lectureId)
        if (isMounted) {
          setLecture(data)
        }
      } catch (err) {
        console.error("Failed to load lecture:", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    loadLecture()
    return () => {
      isMounted = false
    }
  }, [lectureId])

  // Проверка сохранённой позиции просмотра
  useEffect(() => {
    const saved = localStorage.getItem(`cyberbreak_progress_${lectureId}`)
    if (saved) {
      const sec = parseFloat(saved)
      if (sec > 5 && (!initialTimecode || initialTimecode === 0)) {
        setSavedProgressTime(sec)
        setShowResumePrompt(true)
      }
    }
  }, [lectureId, initialTimecode])

  // Перемотка на начальный таймкод после готовности видеоплеера
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate
    }
    if (initialTimecode !== undefined && initialTimecode > 0 && videoRef.current) {
      videoRef.current.currentTime = initialTimecode
      videoRef.current.play().catch(() => {})
      setSeekFlash(formatTimecode(initialTimecode))
    }
  }

  // Смена скорости воспроизведения
  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate)
    if (videoRef.current) {
      videoRef.current.playbackRate = rate
    }
    localStorage.setItem("cyberbreak_playback_rate", rate.toString())
    setIsSpeedMenuOpen(false)
  }

  // Режим «Картинка в картинке» (PiP)
  const togglePiP = async () => {
    if (!videoRef.current) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture()
      }
    } catch (err) {
      console.error("PiP error:", err)
    }
  }

  // Полноэкранный режим
  const toggleFullscreen = () => {
    if (!videoRef.current) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      videoRef.current.requestFullscreen().catch(() => {})
    }
  }

  // Синхронизация таймлайна плеера и автосохранение прогресса
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const sec = videoRef.current.currentTime
      setCurrentTime(sec)

      // Сохраняем позицию каждые 2 секунды
      if (Math.abs(sec - lastSavedTimeRef.current) >= 2) {
        lastSavedTimeRef.current = sec
        if (sec > 5 && (!lecture?.duration || sec < lecture.duration - 10)) {
          localStorage.setItem(`cyberbreak_progress_${lectureId}`, sec.toFixed(1))
        }
      }
    }
  }

  // Определение активного сегмента речи
  const activeSegment = useMemo(() => {
    if (!lecture?.segments) return null
    return (
      lecture.segments.find(
        (seg) => currentTime >= seg.start_time && currentTime <= seg.end_time
      ) || null
    )
  }, [lecture?.segments, currentTime])

  // Определение активной главы оглавления
  const activeChapter = useMemo(() => {
    if (!lecture?.chapters || lecture.chapters.length === 0) return null
    let currentCh: LectureChapter = lecture.chapters[0]
    for (const ch of lecture.chapters) {
      if (currentTime >= ch.start_time) {
        currentCh = ch
      } else {
        break
      }
    }
    return currentCh
  }, [lecture?.chapters, currentTime])

  // Автоскролл транскрипта к активному блоку текста (скроллит только внутренний контейнер транскрипта)
  useEffect(() => {
    if (!autoScroll || rightTab !== "transcript" || !activeSegment?.id) return

    const container = transcriptContainerRef.current
    const targetElement = segmentRefs.current[activeSegment.id]
    if (!container || !targetElement) return

    // Вычисляем вертикальное смещение строго внутри контейнера без скролла всей страницы
    const containerRect = container.getBoundingClientRect()
    const targetRect = targetElement.getBoundingClientRect()

    const relativeTop = targetRect.top - containerRect.top + container.scrollTop
    const targetScrollTop =
      relativeTop - container.clientHeight / 2 + targetRect.height / 2

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: "smooth",
    })
  }, [activeSegment?.id, autoScroll, rightTab])

  // Поиск по смыслу внутри текущей лекции
  useEffect(() => {
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current)
    }

    const trimmed = lectureQuery.trim()
    if (!trimmed) {
      setLectureSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = window.setTimeout(async () => {
      try {
        const results = await api.search(trimmed, lectureId, 6)
        setLectureSearchResults(results)
      } catch (err) {
        console.error("Lecture semantic search error:", err)
      } finally {
        setIsSearching(false)
      }
    }, 280)

    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [lectureQuery, lectureId])

  // Отправка вопроса в ИИ-чат (RAG)
  const handleSendQuestion = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = chatInput.trim()
    if (!trimmed || chatLoading) return

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: "user",
      text: trimmed,
    }
    setMessages((prev) => [...prev, userMsg])
    setChatInput("")
    setChatLoading(true)

    try {
      const response = await api.askQuestion(lectureId, trimmed)
      const assistantMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: "assistant",
        text: response.answer,
        sources: response.sources,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: "assistant",
        text: "Произошла ошибка при обращении к модели. Попробуйте еще раз.",
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setChatLoading(false)
      window.setTimeout(() => {
        chatScrollRef.current?.scrollTo({
          top: chatScrollRef.current.scrollHeight,
          behavior: "smooth",
        })
      }, 50)
    }
  }

  // Копирование конспекта в буфер обмена
  const handleCopySummary = () => {
    if (!lecture?.summary_markdown) return
    navigator.clipboard.writeText(lecture.summary_markdown)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  // Скачивание конспекта в .md
  const handleDownloadSummary = () => {
    if (!lecture?.summary_markdown) return
    const blob = new Blob([lecture.summary_markdown], { type: "text/markdown;charset=utf-8" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `${lecture.title || "lecture_summary"}.md`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  // Подсветка терминов из глоссария в тексте транскрипта
  const renderHighlightedTranscriptText = (text: string, terms: GlossaryTerm[] = []) => {
    if (!terms || terms.length === 0) return text

    const sortedTerms = [...terms].sort((a, b) => b.term.length - a.term.length)
    const escapedTerms = sortedTerms
      .map((t) => t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")

    if (!escapedTerms) return text

    const regex = new RegExp(`\\b(${escapedTerms})\\b`, "gi")
    const parts = text.split(regex)

    return parts.map((part, index) => {
      const matchedTerm = sortedTerms.find(
        (t) => t.term.toLowerCase() === part.toLowerCase()
      )

      if (matchedTerm) {
        return (
          <span
            key={index}
            className="relative group/term inline-block text-blue-600 dark:text-blue-300 font-medium border-b border-blue-500/50 dark:border-blue-400/50 border-dotted cursor-help"
          >
            {part}
            {/* Всплывающая подсказка с определением термина */}
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-white/10 text-zinc-900 dark:text-white text-[11px] font-normal shadow-2xl opacity-0 group-hover/term:opacity-100 transition-opacity z-50">
              <span className="block font-semibold text-blue-600 dark:text-blue-400 mb-1">
                {matchedTerm.term}
              </span>
              <span className="block text-zinc-600 dark:text-zinc-300 mb-2 leading-relaxed">
                {matchedTerm.definition}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  seekTo(matchedTerm.first_timecode)
                }}
                className="inline-flex items-center gap-1 text-[10px] font-mono text-blue-600 dark:text-cyan-300 hover:text-blue-700 dark:hover:text-cyan-200 pointer-events-auto cursor-pointer"
              >
                <Play className="w-2.5 h-2.5 fill-current" />
                Первое упоминание: [{formatTimecode(matchedTerm.first_timecode)}]
              </button>
            </span>
          </span>
        )
      }

      return part
    })
  }

  if (loading || !lecture) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
        <span className="text-xs text-zinc-400 font-mono">
          Загрузка материалов лекции...
        </span>
      </div>
    )
  }

  return (
    <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Верхняя строка управления */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white border border-black/[0.06] dark:border-white/[0.08] transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ко всем лекциям</span>
          </button>

          <div className="h-4 w-[1px] bg-zinc-300 dark:bg-white/[0.1]" />

          <h1 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight truncate max-w-xl">
            {lecture.title}
          </h1>

          {lecture.category ? (
            <button
              type="button"
              onClick={() => {
                if (!currentUser) {
                  onOpenAuth?.("Авторизуйтесь, чтобы менять категории лекций")
                  return
                }
                setIsAssignCategoryOpen(true)
              }}
              title="Нажмите, чтобы изменить категорию лекции"
              className="px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border shrink-0 hover:brightness-110 dark:hover:brightness-125 transition-all cursor-pointer"
              style={{
                backgroundColor: `${getCategoryHex(lecture.category.color)}18`,
                color: getCategoryHex(lecture.category.color),
                borderColor: `${getCategoryHex(lecture.category.color)}35`,
              }}
            >
              <Tag className="w-3 h-3" />
              <span>{lecture.category.name}</span>
              <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!currentUser) {
                  onOpenAuth?.("Авторизуйтесь, чтобы указать категорию лекции")
                  return
                }
                setIsAssignCategoryOpen(true)
              }}
              title="Указать категорию для этой лекции"
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-white/[0.04] hover:bg-zinc-200 dark:hover:bg-white/[0.08] border border-dashed border-zinc-300 dark:border-white/[0.12] flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
            >
              <Tag className="w-3 h-3 text-zinc-500" />
              <span>+ Категория</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          {/* Кнопка добавления в избранное */}
          <button
            onClick={() => {
              if (!currentUser) {
                onOpenAuth?.("Войдите в личный профиль, чтобы сохранять лекции в избранное")
                return
              }
              if (onToggleFavorite) {
                onToggleFavorite(lecture.id)
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
              (isFavorite !== undefined ? isFavorite : lecture.is_favorite)
                ? "bg-amber-400/15 border-amber-400/40 text-amber-600 dark:text-amber-300 hover:bg-amber-400/25"
                : "bg-black/[0.04] dark:bg-white/[0.04] border-black/[0.06] dark:border-white/[0.08] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/[0.08] dark:hover:bg-white/[0.08]"
            }`}
            title={(isFavorite !== undefined ? isFavorite : lecture.is_favorite) ? "В избранном" : "Добавить в избранное"}
          >
            <Star
              className={`w-3.5 h-3.5 transition-transform ${
                (isFavorite !== undefined ? isFavorite : lecture.is_favorite)
                  ? "fill-amber-400 text-amber-500 dark:text-amber-400"
                  : ""
              }`}
            />
            <span>
              {(isFavorite !== undefined ? isFavorite : lecture.is_favorite)
                ? "В избранном"
                : "В избранное"}
            </span>
          </button>

          <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] font-mono text-zinc-600 dark:text-zinc-400">
            <Clock className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
            {formatTimecode(lecture.duration)}
          </span>
          <span className="px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium border border-emerald-500/20">
            Готово
          </span>
        </div>
      </div>

      {/* Двухколоночный макет рабочей области */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ================= ВИДЕО-СЕКЦИЯ (7 колонок в обычном / 12 колонок в театральном) ================= */}
        <div className={isTheaterMode ? "lg:col-span-12 space-y-4" : "lg:col-span-7 space-y-6"}>
          {/* Видеоплеер в строгом Apple Pro стиле */}
          <div className={`relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black aspect-video group ${isTheaterMode ? "max-h-[72vh] mx-auto" : ""}`}>
            <video
              ref={videoRef}
              src={api.getStreamUrl(lecture.id)}
              controls
              playsInline
              onKeyDown={(e) => {
                if (e.code === "Space") {
                  e.preventDefault()
                  e.stopPropagation()
                  const now = Date.now()
                  if (now - lastSpaceToggleRef.current < 250) return
                  lastSpaceToggleRef.current = now
                  if (videoRef.current) {
                    if (videoRef.current.paused) {
                      videoRef.current.play().catch(() => {})
                    } else {
                      videoRef.current.pause()
                    }
                  }
                }
              }}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              className="w-full h-full object-contain"
            />

            {/* Всплывающее уведомление о перемотке */}
            <AnimatePresence>
              {seekFlash && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  className="absolute top-4 right-4 z-30 px-3 py-1.5 rounded-full bg-blue-600/90 backdrop-blur-md text-white text-xs font-mono font-medium flex items-center gap-1.5 shadow-glow"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Перемотка: [{seekFlash}]</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Панель подсказок горячих клавиш и управления воспроизведением */}
          <div className="flex items-center justify-between flex-wrap gap-2 px-2 text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
            <div className="flex items-center gap-3">
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-white/[0.06] border border-zinc-300/80 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-400">
                  Space
                </kbd>{" "}
                Play/Pause
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-white/[0.06] border border-zinc-300/80 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-400">
                  ←
                </kbd>{" "}
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-white/[0.06] border border-zinc-300/80 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-400">
                  →
                </kbd>{" "}
                ±5 сек
              </span>
            </div>

            {/* Инструменты плеера: Скорость, PiP, Театр, Fullscreen */}
            <div className="flex items-center gap-1.5">
              {/* Выпадающее меню скорости */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)}
                  className="px-2.5 py-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-zinc-700 dark:text-zinc-300 border border-black/[0.06] dark:border-white/[0.08] flex items-center gap-1 transition-all cursor-pointer font-medium"
                  title="Скорость воспроизведения"
                >
                  <Gauge className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                  <span>{playbackRate}x</span>
                  <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
                </button>

                {isSpeedMenuOpen && (
                  <div className="absolute right-0 bottom-full mb-1.5 w-28 py-1 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-white/[0.1] shadow-2xl z-40 space-y-0.5">
                    <div className="px-2.5 py-1 text-[10px] uppercase font-semibold text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-white/[0.06]">
                      Скорость
                    </div>
                    {SPEED_OPTIONS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => changePlaybackRate(rate)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                          playbackRate === rate
                            ? "text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-500/10"
                            : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        <span>{rate}x</span>
                        {playbackRate === rate && <Check className="w-3 h-3 text-blue-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Картинка в картинке PiP */}
              <button
                type="button"
                onClick={togglePiP}
                className="p-1.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-zinc-600 dark:text-zinc-300 border border-black/[0.06] dark:border-white/[0.08] transition-all cursor-pointer"
                title="Режим «Картинка в картинке» (PiP)"
              >
                <Tv className="w-3.5 h-3.5" />
              </button>

              {/* Театральный режим */}
              <button
                type="button"
                onClick={() => setIsTheaterMode(!isTheaterMode)}
                className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                  isTheaterMode
                    ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                    : "bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-zinc-600 dark:text-zinc-300 border border-black/[0.06] dark:border-white/[0.08]"
                }`}
                title={isTheaterMode ? "Вернуть стандартный вид" : "Театральный режим (широкий экран)"}
              >
                {isTheaterMode ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>

              {/* На весь экран (Fullscreen) */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-zinc-600 dark:text-zinc-300 border border-black/[0.06] dark:border-white/[0.08] transition-all cursor-pointer"
                title="Развернуть во весь экран"
              >
                <Expand className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Баннер возобновления просмотра с сохранённой позиции */}
          <AnimatePresence>
            {showResumePrompt && savedProgressTime && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                className="p-3.5 rounded-2xl bg-blue-500/10 dark:bg-blue-600/15 border border-blue-500/30 flex items-center justify-between gap-3 text-xs shadow-sm"
              >
                <div className="flex items-center gap-2.5 text-zinc-900 dark:text-zinc-100 font-medium">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span>Вы остановились на отметке </span>
                    <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
                      [{formatTimecode(savedProgressTime)}]
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-400">. Продолжить просмотр лекции?</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      seekTo(savedProgressTime)
                      setShowResumePrompt(false)
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-glow cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Продолжить</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResumePrompt(false)}
                    className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    title="Закрыть"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ================= ЛЕВАЯ ПАНЕЛЬ ВКЛАДОК (7 колонок обычный / 6 колонок в театральном) ================= */}
        <div className={isTheaterMode ? "lg:col-span-6 lg:col-start-1 space-y-6" : "lg:col-span-7 space-y-6"}>
          {/* Нижняя панель с переключателем вкладок (Segmented Control) */}
          <div className="bg-white dark:bg-[#121215] border border-zinc-200/80 dark:border-white/[0.08] rounded-3xl p-5 space-y-4 shadow-sm dark:shadow-xl">
            {/* Переключатель вкладок левой колонки */}
            <div className="flex p-1 bg-zinc-100 dark:bg-zinc-900/90 rounded-xl border border-zinc-200/80 dark:border-white/[0.06] w-full">
              {[
                { id: "structure", label: "Структура лекции", icon: BookOpen },
                { id: "summary", label: "Автоконспект", icon: FileText },
                { id: "glossary", label: "Ключевые термины", icon: Bookmark },
              ].map((tab) => {
                const Icon = tab.icon
                const isActive = leftTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setLeftTab(tab.id as LeftTab)}
                    className={`relative flex-1 py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                      isActive
                        ? "text-zinc-900 dark:text-white"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="left-tab-indicator"
                        className="absolute inset-0 bg-white dark:bg-white/[0.09] rounded-lg shadow-sm border border-zinc-200/80 dark:border-white/[0.06]"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Вкладка 1: Структура лекции (Оглавление) */}
            {leftTab === "structure" && (
              <div className="space-y-2.5">
                {lecture.chapters && lecture.chapters.length > 0 ? (
                  lecture.chapters.map((chapter, idx) => {
                    const isChapterActive = activeChapter?.title === chapter.title
                    return (
                      <motion.div
                        key={idx}
                        whileHover={{ scale: 1.005 }}
                        onClick={() => seekTo(chapter.start_time)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                          isChapterActive
                            ? "bg-blue-500/[0.08] dark:bg-blue-600/[0.08] border-blue-500/40 shadow-sm"
                            : "bg-zinc-50/70 dark:bg-white/[0.02] border-zinc-200/70 dark:border-white/[0.04] hover:bg-zinc-100/80 dark:hover:bg-white/[0.05]"
                        }`}
                      >
                        <button
                          type="button"
                          className={`px-2 py-1 rounded-md text-xs font-mono font-semibold shrink-0 flex items-center gap-1 ${
                            isChapterActive
                              ? "bg-blue-600 text-white"
                              : "bg-zinc-200/70 dark:bg-white/[0.08] text-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>[{formatTimecode(chapter.start_time)}]</span>
                        </button>

                        <div className="space-y-1">
                          <h4
                            className={`text-xs font-semibold ${
                              isChapterActive
                                ? "text-blue-600 dark:text-blue-300"
                                : "text-zinc-900 dark:text-white"
                            }`}
                          >
                            {chapter.title}
                          </h4>
                          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                            {chapter.summary}
                          </p>
                        </div>
                      </motion.div>
                    )
                  })
                ) : (
                  <div className="text-center py-8 text-xs text-zinc-500">
                    Оглавление лекции формируется...
                  </div>
                )}
              </div>
            )}

            {/* Вкладка 2: Автоконспект */}
            {leftTab === "summary" && (
              <div className="space-y-4">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={handleCopySummary}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/[0.05] hover:bg-zinc-200 dark:hover:bg-white/[0.09] text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white border border-zinc-200/80 dark:border-white/[0.06] transition-all cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                        <span className="text-emerald-600 dark:text-emerald-400">Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Копировать</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDownloadSummary}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-white/[0.05] hover:bg-zinc-200 dark:hover:bg-white/[0.09] text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white border border-zinc-200/80 dark:border-white/[0.06] transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Скачать .md</span>
                  </button>
                </div>

                <div className="max-h-[500px] overflow-y-auto pr-2 space-y-3 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight mb-3 mt-1">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-4 mb-2 pb-1 border-b border-zinc-200 dark:border-white/[0.08]">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mt-3 mb-1.5">
                          {children}
                        </h3>
                      ),
                      p: ({ children }) => (
                        <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed mb-2.5">
                          {children}
                        </p>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc list-inside space-y-1 mb-3 pl-1">
                          {children}
                        </ul>
                      ),
                      li: ({ children }) => (
                        <li className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                          {children}
                        </li>
                      ),
                      strong: ({ children }) => (
                        <strong className="text-zinc-900 dark:text-white font-semibold">{children}</strong>
                      ),
                      code: ({ children }) => (
                        <code className="font-mono text-[11px] bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200 dark:border-transparent px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-300">
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {lecture.summary_markdown || "Конспект формируется локальным ИИ..."}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {/* Вкладка 3: Ключевые термины */}
            {leftTab === "glossary" && (
              <div>
                {lecture.glossary_terms && lecture.glossary_terms.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {lecture.glossary_terms.map((term, idx) => (
                      <motion.div
                        key={idx}
                        whileHover={{ y: -2 }}
                        className="p-3.5 rounded-2xl bg-zinc-50/70 dark:bg-white/[0.02] border border-zinc-200/70 dark:border-white/[0.05] hover:border-zinc-300 dark:hover:border-white/[0.12] transition-all space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-xs text-zinc-900 dark:text-white">
                            {term.term}
                          </span>
                          <button
                            type="button"
                            onClick={() => seekTo(term.first_timecode)}
                            className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            [{formatTimecode(term.first_timecode)}]
                          </button>
                        </div>
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          {term.definition}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-xs text-zinc-500">
                    Глоссарий терминов пока пуст...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ================= ПРАВАЯ КОЛОНКА (5 колонок в обычном / 6 колонок в театральном) ================= */}
        <div className={`${isTheaterMode ? "lg:col-span-6 lg:col-start-7 h-[760px]" : "lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:row-span-2 h-[calc(100vh-6rem)]"} sticky top-20 flex flex-col rounded-3xl bg-white dark:bg-[#121215] border border-zinc-200/80 dark:border-white/[0.08] shadow-sm dark:shadow-2xl overflow-hidden`}>
          {/* Верхний переключатель режимов правой панели */}
          <div className="p-3 border-b border-zinc-200/80 dark:border-white/[0.06] bg-zinc-50 dark:bg-zinc-900/60 backdrop-blur-xl">
            <div className="flex p-1 bg-zinc-200/60 dark:bg-black/40 rounded-xl border border-zinc-200/80 dark:border-white/[0.06]">
              {[
                { id: "transcript", label: "Транскрипт", icon: Volume2 },
                { id: "search", label: "Поиск", icon: Search },
                { id: "chat", label: "Вопрос-ответ", icon: MessageSquare },
              ].map((tab) => {
                const Icon = tab.icon
                const isActive = rightTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setRightTab(tab.id as RightTab)}
                    className={`relative flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                      isActive
                        ? "text-zinc-900 dark:text-white"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="right-tab-indicator"
                        className="absolute inset-0 bg-white dark:bg-white/[0.09] rounded-lg shadow-sm border border-zinc-200/80 dark:border-white/[0.06]"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1">
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Содержимое Режима 1: Синхронный транскрипт */}
          {rightTab === "transcript" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Панель управления автоскроллом */}
              <div className="px-4 py-2 bg-zinc-50/50 dark:bg-white/[0.02] border-b border-zinc-200/60 dark:border-white/[0.04] flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                <span>Синхронизировано с воспроизведением</span>
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`px-2 py-0.5 rounded-full border text-[10px] transition-all cursor-pointer ${
                    autoScroll
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                      : "bg-zinc-100 dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-white/[0.08]"
                  }`}
                >
                  Автоскролл: {autoScroll ? "Вкл" : "Пауза"}
                </button>
              </div>

              {/* Список синхронных сегментов речи */}
              <div
                ref={transcriptContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-3"
              >
                {lecture.segments && lecture.segments.length > 0 ? (
                  lecture.segments.map((seg) => {
                    const isSegActive = activeSegment?.id === seg.id
                    return (
                      <div
                        key={seg.id}
                        ref={(el) => {
                          if (seg.id) segmentRefs.current[seg.id] = el
                        }}
                        onClick={() => seekTo(seg.start_time)}
                        className={`p-3 rounded-2xl transition-all cursor-pointer border ${
                          isSegActive
                            ? "bg-blue-500/[0.08] dark:bg-blue-600/[0.12] border-blue-500/40 dark:border-blue-500/50 shadow-md ring-1 ring-blue-500/20"
                            : "bg-zinc-50/60 dark:bg-white/[0.015] border-zinc-200/60 dark:border-white/[0.04] hover:bg-zinc-100/80 dark:hover:bg-white/[0.04] hover:border-zinc-300 dark:hover:border-white/[0.08]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span
                            className={`text-xs font-mono font-semibold flex items-center gap-1 ${
                              isSegActive ? "text-blue-600 dark:text-blue-400" : "text-zinc-500"
                            }`}
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            [{formatTimecode(seg.start_time)}]
                          </span>
                          {isSegActive && (
                            <span className="text-[10px] uppercase font-mono tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                              Сейчас в плеере
                            </span>
                          )}
                        </div>

                        <p
                          className={`text-xs leading-relaxed transition-colors ${
                            isSegActive
                              ? "text-zinc-900 dark:text-white font-medium"
                              : "text-zinc-700 dark:text-zinc-300"
                          }`}
                        >
                          {renderHighlightedTranscriptText(
                            seg.text,
                            lecture.glossary_terms
                          )}
                        </p>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-16 text-xs text-zinc-500">
                    Транскрипт речи формируется...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Содержимое Режима 2: Поиск по смыслу внутри лекции */}
          {rightTab === "search" && (
            <div className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={lectureSearchInputRef}
                  type="text"
                  value={lectureQuery}
                  onChange={(e) => setLectureQuery(e.target.value)}
                  placeholder="Искать смысловой фрагмент..."
                  className="w-full bg-zinc-100 dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.08] focus:border-blue-500 rounded-xl pl-9 pr-9 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-none transition-all"
                />
                {isSearching ? (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                ) : lectureQuery ? (
                  <button
                    onClick={() => setLectureQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : null}
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {lectureSearchResults.map((hit) => (
                  <motion.div
                    key={hit.chunk_id}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => seekTo(hit.start_time)}
                    className="p-3.5 rounded-2xl bg-zinc-50/70 dark:bg-white/[0.02] border border-zinc-200/70 dark:border-white/[0.06] hover:border-zinc-300 dark:hover:border-white/[0.15] transition-all cursor-pointer space-y-2 group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                        {hit.score}% по смыслу
                      </span>
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-zinc-200/80 dark:bg-white/[0.06] text-zinc-700 dark:text-white flex items-center gap-1 group-hover:bg-blue-600 group-hover:text-white transition-colors"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        [{formatTimecode(hit.start_time)}]
                      </button>
                    </div>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 line-clamp-3 leading-relaxed">
                      «{hit.text}»
                    </p>
                  </motion.div>
                ))}

                {lectureQuery.trim() && !isSearching && lectureSearchResults.length === 0 && (
                  <div className="text-center py-12 text-xs text-zinc-500">
                    Совпадений в этой лекции не обнаружено
                  </div>
                )}

                {!lectureQuery.trim() && (
                  <div className="text-center py-12 text-xs text-zinc-500 space-y-1">
                    <HelpCircle className="w-6 h-6 mx-auto text-zinc-400 dark:text-zinc-600 mb-2" />
                    <div>Введите вопрос или тему для поиска</div>
                    <div className="text-[11px] text-zinc-400 dark:text-zinc-600">
                      Векторное сравнение фрагментов через MiniLM
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Содержимое Режима 3: Чат «Вопрос-ответ» (RAG) */}
          {rightTab === "chat" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* История сообщений */}
              <div
                ref={chatScrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs"
              >
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[88%] p-3.5 rounded-2xl leading-relaxed ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white rounded-tr-none shadow-md"
                          : "bg-zinc-100 dark:bg-white/[0.04] text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-white/[0.06] rounded-tl-none shadow-sm"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.text}</div>

                      {/* Источники цитирования с таймкодами */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-zinc-200 dark:border-white/[0.08] space-y-1.5">
                          <span className="text-[10px] uppercase font-semibold text-zinc-500 dark:text-zinc-400 tracking-wider">
                            Источники из лекции:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.sources.map((src, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => seekTo(src.timecode)}
                                className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-500/10 text-blue-600 dark:text-blue-300 hover:bg-blue-600 hover:text-white border border-blue-500/20 transition-all flex items-center gap-1 cursor-pointer"
                              >
                                <Play className="w-2.5 h-2.5 fill-current" />
                                <span>[{formatTimecode(src.timecode)}]</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {chatLoading && (
                  <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 p-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                    <span>ИИ анализирует лекцию и формулирует ответ...</span>
                  </div>
                )}
              </div>

              {/* Поле ввода вопроса */}
              <form
                onSubmit={handleSendQuestion}
                className="p-3 border-t border-zinc-200/80 dark:border-white/[0.06] bg-zinc-50/80 dark:bg-black/40 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Задайте вопрос по материалу..."
                  disabled={chatLoading}
                  className="flex-1 bg-white dark:bg-white/[0.03] border border-zinc-200 dark:border-white/[0.08] focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 outline-none disabled:opacity-50 transition-all"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shadow-glow shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Окно назначения / смены категории для текущей лекции */}
      <AssignCategoryModal
        isOpen={isAssignCategoryOpen}
        lecture={lecture}
        categories={categories}
        onAssignCategory={async (lecId, catId) => {
          if (onAssignCategory) {
            await onAssignCategory(lecId, catId)
          }
          const chosenCat = categories.find((c) => c.id === catId) || null
          setLecture((prev) =>
            prev ? { ...prev, category_id: catId, category: chosenCat } : prev
          )
        }}
        onCreateCategory={onCreateCategory || (async () => {})}
        onClose={() => setIsAssignCategoryOpen(false)}
      />
    </div>
  )
}
