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
  Award,
  RotateCw,
  CheckCircle2,
  XCircle,
  GraduationCap,
  Sparkles,
  StickyNote,
  Trash2,
  Pencil,
  Plus,
} from "lucide-react"
import { api } from "../api/client"
import { formatTimecode } from "../utils/format"
import { getCategoryHex } from "../utils/colors"
import { AssignCategoryModal } from "./AssignCategoryModal"
import Tooltip from "./Tooltip"
import type {
  Lecture,
  LectureChapter,
  GlossaryTerm,
  SearchResultItem,
  User,
  Category,
  LectureQuiz,
  LectureNote,
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

type LeftTab = "structure" | "summary" | "glossary" | "quiz"
type RightTab = "transcript" | "notes" | "search" | "chat"

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

  // Интерактивная проверка знаний (Квиз)
  const [quiz, setQuiz] = useState<LectureQuiz | null>(null)
  const [quizLoading, setQuizLoading] = useState<boolean>(false)
  const [quizError, setQuizError] = useState<string | null>(null)
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({})

  const loadQuiz = useCallback(async (forceRegenerate: boolean = false) => {
    try {
      setQuizLoading(true)
      setQuizError(null)
      if (forceRegenerate) {
        setUserAnswers({})
      }
      const data = await api.getLectureQuiz(lectureId, forceRegenerate)
      setQuiz(data)
    } catch (err) {
      console.error("Failed to load quiz:", err)
      setQuizError("Не удалось сформировать тест. Пожалуйста, повторите попытку.")
    } finally {
      setQuizLoading(false)
    }
  }, [lectureId])

  useEffect(() => {
    if (leftTab === "quiz" && !quiz && !quizLoading) {
      loadQuiz(false)
    }
  }, [leftTab, quiz, quizLoading, loadQuiz])

  // Заметки на таймкодах
  const [notes, setNotes] = useState<LectureNote[]>([])
  const [notesLoading, setNotesLoading] = useState<boolean>(false)
  const [newNoteText, setNewNoteText] = useState<string>("")
  const [newNoteTimecode, setNewNoteTimecode] = useState<number | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null)
  const [editingNoteText, setEditingNoteText] = useState<string>("")
  const [isSubmittingNote, setIsSubmittingNote] = useState<boolean>(false)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)

  const loadNotes = useCallback(async () => {
    try {
      setNotesLoading(true)
      const data = await api.getNotes(lectureId)
      setNotes(data)
    } catch (err) {
      console.error("Failed to load notes:", err)
    } finally {
      setNotesLoading(false)
    }
  }, [lectureId])

  useEffect(() => {
    loadNotes()
  }, [loadNotes])

  const handleCreateNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = newNoteText.trim()
    if (!trimmed || isSubmittingNote) return

    const targetTimecode = newNoteTimecode !== null ? newNoteTimecode : Math.floor(currentTime)
    setIsSubmittingNote(true)
    try {
      const created = await api.createNote(lectureId, targetTimecode, trimmed)
      setNotes((prev) => [...prev, created].sort((a, b) => a.timecode - b.timecode))
      setNewNoteText("")
      setNewNoteTimecode(null)
    } catch (err) {
      console.error("Failed to create note:", err)
    } finally {
      setIsSubmittingNote(false)
    }
  }

  const handleUpdateNote = async (noteId: number) => {
    const trimmed = editingNoteText.trim()
    if (!trimmed) return
    try {
      const updated = await api.updateNote(lectureId, noteId, trimmed)
      setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)))
      setEditingNoteId(null)
      setEditingNoteText("")
    } catch (err) {
      console.error("Failed to update note:", err)
    }
  }

  const handleDeleteNote = async (noteId: number) => {
    try {
      await api.deleteNote(lectureId, noteId)
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
    } catch (err) {
      console.error("Failed to delete note:", err)
    }
  }

  const handleExportNotes = () => {
    if (notes.length === 0) return
    const lines = [
      `# Заметки к лекции: ${lecture?.title || "Без названия"}`,
      `Всего заметок: ${notes.length}`,
      `Дата экспорта: ${new Date().toLocaleString("ru-RU")}`,
      "",
      "---",
      "",
      ...notes.map(
        (n, i) =>
          `### ${i + 1}. [${formatTimecode(n.timecode)}] (${new Date(
            n.created_at
          ).toLocaleDateString("ru-RU")})\n${n.text}\n`
      ),
    ]
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `notes_lecture_${lectureId}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const startAddNote = (timecode?: number) => {
    setRightTab("notes")
    const tc = timecode !== undefined ? timecode : Math.floor(currentTime)
    setNewNoteTimecode(tc)
    window.setTimeout(() => {
      noteInputRef.current?.focus()
    }, 80)
  }

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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl liquid-btn-glass text-xs font-medium text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ко всем лекциям</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-300 dark:bg-white/[0.1]" />

          <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate max-w-xl">
            {lecture.title}
          </h1>

          {lecture.category ? (
            <Tooltip content="Нажмите, чтобы изменить категорию лекции" position="bottom">
              <button
                type="button"
                onClick={() => {
                  if (!currentUser) {
                    onOpenAuth?.("Авторизуйтесь, чтобы менять категории лекций")
                    return
                  }
                  setIsAssignCategoryOpen(true)
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border shrink-0 backdrop-blur-md hover:brightness-110 dark:hover:brightness-125 transition-all cursor-pointer shadow-sm"
                style={{
                  backgroundColor: `${getCategoryHex(lecture.category.color)}20`,
                  color: getCategoryHex(lecture.category.color),
                  borderColor: `${getCategoryHex(lecture.category.color)}40`,
                }}
              >
                <Tag className="w-3 h-3" />
                <span>{lecture.category.name}</span>
                <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
              </button>
            </Tooltip>
          ) : (
            <Tooltip content="Указать категорию для этой лекции" position="bottom">
              <button
                type="button"
                onClick={() => {
                  if (!currentUser) {
                    onOpenAuth?.("Авторизуйтесь, чтобы указать категорию лекции")
                    return
                  }
                  setIsAssignCategoryOpen(true)
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white liquid-glass-subtle hover:bg-white/70 dark:hover:bg-white/[0.08] border-dashed border-slate-300 dark:border-white/[0.12] flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
              >
                <Tag className="w-3 h-3 text-slate-500" />
                <span>+ Категория</span>
              </button>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          {/* Кнопка добавления в избранное */}
          <Tooltip
            content={(isFavorite !== undefined ? isFavorite : lecture.is_favorite) ? "Удалить из избранного" : "Добавить в избранное"}
            position="bottom"
          >
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
                  ? "bg-amber-400/20 border-amber-400/40 text-amber-600 dark:text-amber-300 hover:bg-amber-400/30 shadow-sm"
                  : "liquid-btn-glass text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              }`}
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
          </Tooltip>

          <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl liquid-glass-subtle font-mono text-slate-600 dark:text-zinc-400">
            <Clock className="w-3.5 h-3.5 text-cyan-500" />
            {formatTimecode(lecture.duration)}
          </span>
          <span className="px-2.5 py-1 rounded-xl liquid-glass-subtle text-emerald-600 dark:text-emerald-400 text-[11px] font-medium border border-emerald-500/25">
            Готово
          </span>

          {/* Быстрый переход к тесту проверки знаний */}
          <Tooltip content="Пройти интерактивный тест на понимание материала" position="bottom">
            <button
              type="button"
              onClick={() => setLeftTab("quiz")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-sm ${
                leftTab === "quiz"
                  ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-liquid-btn border-cyan-400/40"
                  : "liquid-btn-glass text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 border-cyan-500/30"
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Тест по лекции</span>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Двухколоночный макет рабочей области */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ================= ВИДЕО-СЕКЦИЯ (7 колонок в обычном / 12 колонок в театральном) ================= */}
        <div className={isTheaterMode ? "lg:col-span-12 space-y-4" : "lg:col-span-7 space-y-6"}>
          {/* Видеоплеер в стиле жидкого стекла */}
          <div className={`relative rounded-3xl overflow-hidden border border-white/40 dark:border-white/15 shadow-2xl bg-black aspect-video group ${isTheaterMode ? "max-h-[72vh] mx-auto" : ""}`}>
            <video
              ref={videoRef}
              src={api.getStreamUrl(lecture.id)}
              poster={api.getThumbnailUrl(lecture.id)}
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
                  className="absolute top-4 right-4 z-30 px-3.5 py-1.5 rounded-full liquid-btn-primary text-white text-xs font-mono font-medium flex items-center gap-1.5 shadow-liquid-btn"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Перемотка: [{seekFlash}]</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Панель подсказок горячих клавиш и управления воспроизведением */}
          <div className="flex items-center justify-between flex-wrap gap-2 px-2 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
            <div className="flex items-center gap-3">
              <span>
                <kbd className="px-1.5 py-0.5 rounded liquid-glass-subtle text-slate-700 dark:text-zinc-400">
                  Space
                </kbd>{" "}
                Play/Pause
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded liquid-glass-subtle text-slate-700 dark:text-zinc-400">
                  ←
                </kbd>{" "}
                <kbd className="px-1.5 py-0.5 rounded liquid-glass-subtle text-slate-700 dark:text-zinc-400">
                  →
                </kbd>{" "}
                ±5 сек
              </span>
            </div>

            {/* Инструменты плеера: Скорость, PiP, Театр, Fullscreen */}
            <div className="flex items-center gap-1.5">
              {/* Выпадающее меню скорости */}
              <div className="relative">
                <Tooltip content="Скорость воспроизведения" position="top">
                  <button
                    type="button"
                    onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)}
                    className="px-2.5 py-1 rounded-xl liquid-btn-glass text-slate-700 dark:text-zinc-300 flex items-center gap-1 transition-all cursor-pointer font-medium"
                  >
                    <Gauge className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span>{playbackRate}x</span>
                    <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
                  </button>
                </Tooltip>

                {isSpeedMenuOpen && (
                  <div className="absolute right-0 bottom-full mb-1.5 w-28 py-1 rounded-2xl liquid-glass-modal shadow-2xl z-40 space-y-0.5">
                    <div className="px-2.5 py-1 text-[10px] uppercase font-semibold text-slate-400 dark:text-zinc-500 border-b border-slate-200/60 dark:border-white/[0.06]">
                      Скорость
                    </div>
                    {SPEED_OPTIONS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => changePlaybackRate(rate)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                          playbackRate === rate
                            ? "text-cyan-600 dark:text-cyan-400 font-semibold bg-cyan-500/10"
                            : "text-slate-700 dark:text-zinc-300 hover:bg-white/60 dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        <span>{rate}x</span>
                        {playbackRate === rate && <Check className="w-3 h-3 text-cyan-500" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Картинка в картинке PiP */}
              <Tooltip content="Режим «Картинка в картинке» (PiP)" position="top">
                <button
                  type="button"
                  onClick={togglePiP}
                  className="p-1.5 rounded-xl liquid-btn-glass text-slate-600 dark:text-zinc-300 transition-all cursor-pointer"
                >
                  <Tv className="w-3.5 h-3.5" />
                </button>
              </Tooltip>

              {/* Театральный режим */}
              <Tooltip
                content={isTheaterMode ? "Вернуть стандартный вид" : "Театральный режим (широкий экран)"}
                position="top"
              >
                <button
                  type="button"
                  onClick={() => setIsTheaterMode(!isTheaterMode)}
                  className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                    isTheaterMode
                      ? "liquid-btn-primary text-white shadow-liquid-btn"
                      : "liquid-btn-glass text-slate-600 dark:text-zinc-300"
                  }`}
                >
                  {isTheaterMode ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </Tooltip>

              {/* Добавить заметку на текущем таймкоде */}
              <Tooltip content="Добавить заметку на текущем таймкоде" position="top">
                <button
                  type="button"
                  onClick={() => startAddNote(Math.floor(currentTime))}
                  className="px-2.5 py-1 rounded-xl liquid-btn-primary text-white flex items-center gap-1.5 transition-all cursor-pointer font-medium text-xs shadow-liquid-btn"
                >
                  <StickyNote className="w-3.5 h-3.5" />
                  <span>+ Заметка [{formatTimecode(currentTime)}]</span>
                </button>
              </Tooltip>

              {/* На весь экран (Fullscreen) */}
              <Tooltip content="Развернуть во весь экран" position="top">
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-xl liquid-btn-glass text-slate-600 dark:text-zinc-300 transition-all cursor-pointer"
                >
                  <Expand className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Быстрые закладки-заметки на таймлайне лекции */}
          {notes.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 no-scrollbar text-xs">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 shrink-0 flex items-center gap-1.5 pl-1">
                <StickyNote className="w-3.5 h-3.5 text-cyan-500" />
                Заметки ({notes.length}):
              </span>
              <div className="flex items-center gap-1.5 flex-nowrap">
                {notes.map((note) => {
                  const isCurrent = Math.abs(currentTime - note.timecode) < 5
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => {
                        seekTo(note.timecode)
                        setRightTab("notes")
                      }}
                      className={`shrink-0 px-2.5 py-1 rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer max-w-[220px] ${
                        isCurrent
                          ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/50 shadow-sm"
                          : "liquid-glass-subtle text-slate-700 dark:text-zinc-300 hover:bg-white/70 dark:hover:bg-white/10 border border-white/40 dark:border-white/[0.06]"
                      }`}
                      title={note.text}
                    >
                      <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold text-[10px]">
                        [{formatTimecode(note.timecode)}]
                      </span>
                      <span className="truncate text-[11px]">{note.text}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Баннер возобновления просмотра с сохранённой позиции */}
          <AnimatePresence>
            {showResumePrompt && savedProgressTime && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                className="p-3.5 rounded-2xl liquid-glass border border-cyan-500/35 flex items-center justify-between gap-3 text-xs shadow-md"
              >
                <div className="flex items-center gap-2.5 text-slate-900 dark:text-zinc-100 font-medium">
                  <div className="w-8 h-8 rounded-xl liquid-btn-primary text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span>Вы остановились на отметке </span>
                    <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                      [{formatTimecode(savedProgressTime)}]
                    </span>
                    <span className="text-slate-600 dark:text-zinc-400">. Продолжить просмотр лекции?</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      seekTo(savedProgressTime)
                      setShowResumePrompt(false)
                    }}
                    className="px-3.5 py-1.5 rounded-xl liquid-btn-primary text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-liquid-btn cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Продолжить</span>
                  </button>
                  <Tooltip content="Закрыть уведомление" position="top">
                    <button
                      type="button"
                      onClick={() => setShowResumePrompt(false)}
                      className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-white/40 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </Tooltip>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ================= ЛЕВАЯ ПАНЕЛЬ ВКЛАДОК (7 колонок обычный / 6 колонок в театральном) ================= */}
        <div className={isTheaterMode ? "lg:col-span-6 lg:col-start-1 space-y-6" : "lg:col-span-7 space-y-6"}>
          {/* Нижняя панель с переключателем вкладок (Segmented Control) */}
          <div className="liquid-glass rounded-3xl p-5 space-y-4 shadow-xl">
            {/* Переключатель вкладок левой колонки */}
            <div className="relative flex p-1 liquid-glass-subtle rounded-xl w-full">
              {/* Скользящий стеклянный индикатор */}
              <div
                className="absolute top-1 bottom-1 left-1 rounded-lg liquid-tab-indicator pointer-events-none"
                style={{
                  width: "calc((100% - 8px) / 4)",
                  transform:
                    leftTab === "structure"
                      ? "translateX(0%)"
                      : leftTab === "summary"
                      ? "translateX(100%)"
                      : leftTab === "glossary"
                      ? "translateX(200%)"
                      : "translateX(300%)",
                }}
              />
              {[
                { id: "structure", label: "Структура", icon: BookOpen },
                { id: "summary", label: "Конспект", icon: FileText },
                { id: "glossary", label: "Термины", icon: Bookmark },
                { id: "quiz", label: "Квиз / Тест", icon: Award },
              ].map((tab) => {
                const Icon = tab.icon
                const isActive = leftTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setLeftTab(tab.id as LeftTab)}
                    className={`relative z-10 flex-1 py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                      isActive
                        ? "text-slate-900 dark:text-white font-semibold"
                        : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
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
                            ? "liquid-glass-subtle border-cyan-500/50 shadow-sm"
                            : "liquid-glass-subtle border-white/40 dark:border-white/[0.04] hover:bg-white/70 dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        <button
                          type="button"
                          className={`px-2 py-1 rounded-md text-xs font-mono font-semibold shrink-0 flex items-center gap-1 ${
                            isChapterActive
                              ? "liquid-btn-primary text-white"
                              : "liquid-glass-subtle text-slate-700 dark:text-zinc-300"
                          }`}
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>[{formatTimecode(chapter.start_time)}]</span>
                        </button>

                        <div className="space-y-1">
                          <h4
                            className={`text-xs font-semibold ${
                              isChapterActive
                                ? "text-cyan-600 dark:text-cyan-300"
                                : "text-slate-900 dark:text-white"
                            }`}
                          >
                            {chapter.title}
                          </h4>
                          <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
                            {chapter.summary}
                          </p>
                        </div>
                      </motion.div>
                    )
                  })
                ) : (
                  <div className="text-center py-8 text-xs text-slate-500">
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
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl liquid-btn-glass text-xs font-medium text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
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
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl liquid-btn-glass text-xs font-medium text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Скачать .md</span>
                  </button>
                </div>

                <div className="max-h-[500px] overflow-y-auto pr-2 space-y-3 text-xs leading-relaxed text-slate-700 dark:text-zinc-300">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight mb-3 mt-1">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100 mt-4 mb-2 pb-1 border-b border-slate-200 dark:border-white/[0.08]">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-xs font-semibold text-slate-800 dark:text-zinc-200 mt-3 mb-1.5">
                          {children}
                        </h3>
                      ),
                      p: ({ children }) => (
                        <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed mb-2.5">
                          {children}
                        </p>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc list-inside space-y-1 mb-3 pl-1">
                          {children}
                        </ul>
                      ),
                      li: ({ children }) => (
                        <li className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
                          {children}
                        </li>
                      ),
                      strong: ({ children }) => (
                        <strong className="text-slate-900 dark:text-white font-semibold">{children}</strong>
                      ),
                      code: ({ children }) => (
                        <code className="font-mono text-[11px] liquid-glass-subtle px-1.5 py-0.5 rounded text-cyan-600 dark:text-cyan-300">
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
                        className="p-3.5 rounded-2xl liquid-glass-subtle border border-white/40 dark:border-white/[0.06] hover:border-white/80 dark:hover:border-white/[0.15] transition-all space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-xs text-slate-900 dark:text-white">
                            {term.term}
                          </span>
                          <button
                            type="button"
                            onClick={() => seekTo(term.first_timecode)}
                            className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-600 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            [{formatTimecode(term.first_timecode)}]
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
                          {term.definition}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-xs text-slate-500">
                    Глоссарий терминов пока пуст...
                  </div>
                )}
              </div>
            )}

            {/* Вкладка 4: Интерактивная проверка знаний (Квиз) */}
            {leftTab === "quiz" && (
              <div className="space-y-5">
                {quizLoading ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
                    <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                      Локальный ИИ формирует интерактивный тест по лекции...
                    </span>
                  </div>
                ) : quizError ? (
                  <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-300 space-y-2 text-center">
                    <p>{quizError}</p>
                    <button
                      type="button"
                      onClick={() => loadQuiz(true)}
                      className="px-3.5 py-1.5 rounded-xl liquid-btn-glass text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Попробовать снова</span>
                    </button>
                  </div>
                ) : quiz && quiz.questions.length > 0 ? (
                  <div className="space-y-6">
                    {/* Заголовок квиза и панель действий */}
                    <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-200/60 dark:border-white/[0.06]">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <Award className="w-4 h-4 text-cyan-500" />
                          <span>Проверка знаний по лекции</span>
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                          Ответьте на вопросы и закрепите ключевые концепции материала
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {Object.keys(userAnswers).length > 0 && (
                          <button
                            type="button"
                            onClick={() => setUserAnswers({})}
                            className="px-2.5 py-1.5 rounded-xl liquid-btn-glass text-[11px] font-medium text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                          >
                            Сбросить ответы
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => loadQuiz(true)}
                          className="px-3 py-1.5 rounded-xl liquid-btn-glass text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <RotateCw className="w-3 h-3" />
                          <span>Новые вопросы</span>
                        </button>
                      </div>
                    </div>

                    {/* Баннер результатов, если отвечены все вопросы */}
                    {Object.keys(userAnswers).length === quiz.questions.length && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`p-4 rounded-2xl border text-xs shadow-lg space-y-1.5 ${
                          quiz.questions.filter((q) => userAnswers[q.id] === q.correct_option_id).length === quiz.questions.length
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200"
                            : "bg-blue-500/10 border-blue-500/30 text-slate-900 dark:text-zinc-100"
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span className="flex items-center gap-1.5 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            Тест завершен! Результат:{" "}
                            {quiz.questions.filter((q) => userAnswers[q.id] === q.correct_option_id).length} из{" "}
                            {quiz.questions.length} (
                            {Math.round(
                              (quiz.questions.filter((q) => userAnswers[q.id] === q.correct_option_id).length /
                                quiz.questions.length) *
                                100
                            )}
                            %)
                          </span>
                        </div>
                        <p className="text-[11px] opacity-80">
                          {quiz.questions.filter((q) => userAnswers[q.id] === q.correct_option_id).length === quiz.questions.length
                            ? "Поздравляем! Вы отлично усвоили все ключевые концепции этой лекции."
                            : "Изучите пояснения ниже и пересмотрите фрагменты видео для закрепления материала."}
                        </p>
                      </motion.div>
                    )}

                    {/* Список вопросов */}
                    <div className="space-y-4">
                      {quiz.questions.map((q, idx) => {
                        const userAnswer = userAnswers[q.id]
                        const isAnswered = userAnswer !== undefined
                        const isCorrect = isAnswered && userAnswer === q.correct_option_id

                        return (
                          <motion.div
                            key={q.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className={`p-4 sm:p-5 rounded-2xl liquid-glass-subtle border transition-all ${
                              isAnswered
                                ? isCorrect
                                  ? "border-emerald-500/40 bg-emerald-500/[0.04]"
                                  : "border-rose-500/40 bg-rose-500/[0.04]"
                                : "border-white/50 dark:border-white/[0.08]"
                            }`}
                          >
                            {/* Шапка вопроса: Номер и индикатор */}
                            <div className="flex items-center justify-between gap-2 mb-2.5">
                              <span className="text-[10px] font-mono uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-wider">
                                Вопрос {idx + 1} из {quiz.questions.length}
                              </span>

                              {isAnswered && (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium font-mono flex items-center gap-1 ${
                                    isCorrect
                                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                      : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                  }`}
                                >
                                  {isCorrect ? (
                                    <>
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>Верно</span>
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="w-3 h-3" />
                                      <span>Неверно</span>
                                    </>
                                  )}
                                </span>
                              )}
                            </div>

                            {/* Текст вопроса */}
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3.5 leading-snug">
                              {q.question}
                            </h4>

                            {/* 4 Варианта ответов */}
                            <div className="space-y-2">
                              {q.options.map((opt) => {
                                const isSelected = userAnswer === opt.id
                                const isOptionCorrect = opt.id === q.correct_option_id

                                let optStyle = "liquid-glass hover:bg-white/70 dark:hover:bg-white/[0.08] text-slate-700 dark:text-zinc-300 border-slate-200/60 dark:border-white/[0.08]"

                                if (isAnswered) {
                                  if (isOptionCorrect) {
                                    optStyle = "bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-200 font-medium shadow-sm"
                                  } else if (isSelected && !isCorrect) {
                                    optStyle = "bg-rose-500/15 border-rose-500 text-rose-800 dark:text-rose-200 font-medium shadow-sm"
                                  } else {
                                    optStyle = "opacity-45 liquid-glass text-slate-500 dark:text-zinc-500 border-transparent"
                                  }
                                }

                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    disabled={isAnswered}
                                    onClick={() => {
                                      setUserAnswers((prev) => ({ ...prev, [q.id]: opt.id }))
                                    }}
                                    className={`w-full p-3 rounded-xl border text-xs text-left flex items-start gap-3 transition-all cursor-pointer ${optStyle}`}
                                  >
                                    <span
                                      className={`w-5 h-5 rounded-md flex items-center justify-center font-mono font-bold text-[11px] shrink-0 mt-0.5 ${
                                        isAnswered
                                          ? isOptionCorrect
                                            ? "bg-emerald-500 text-white"
                                            : isSelected
                                            ? "bg-rose-500 text-white"
                                            : "liquid-glass-subtle text-slate-400"
                                          : "liquid-glass-subtle text-slate-600 dark:text-zinc-400"
                                      }`}
                                    >
                                      {opt.id}
                                    </span>

                                    <span className="flex-1 leading-relaxed">{opt.text}</span>

                                    {isAnswered && isOptionCorrect && (
                                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                    )}
                                    {isAnswered && isSelected && !isCorrect && (
                                      <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                    )}
                                  </button>
                                )
                              })}
                            </div>

                            {/* Блок объяснения и переход к таймкоду в лекции */}
                            {isAnswered && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                className="mt-3 pt-3 border-t border-slate-200/60 dark:border-white/[0.06] space-y-2 text-xs"
                              >
                                <p className="text-slate-600 dark:text-zinc-300 leading-relaxed text-[11px]">
                                  <span className="font-semibold text-slate-900 dark:text-white">Пояснение: </span>
                                  {q.explanation}
                                </p>

                                <div className="flex items-center justify-between pt-1">
                                  <button
                                    type="button"
                                    onClick={() => seekTo(q.timecode)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl liquid-btn-primary text-white text-[11px] font-semibold shadow-liquid-btn cursor-pointer transition-all"
                                  >
                                    <Play className="w-3 h-3 fill-current" />
                                    <span>Смотреть фрагмент в лекции [{formatTimecode(q.timecode)}]</span>
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </motion.div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-xs text-slate-500 dark:text-zinc-400 space-y-3">
                    <GraduationCap className="w-8 h-8 text-cyan-500 mx-auto opacity-75" />
                    <p>Интерактивный тест для этой лекции готов к генерации.</p>
                    <button
                      type="button"
                      onClick={() => loadQuiz(true)}
                      className="px-4 py-2 rounded-xl liquid-btn-primary text-white text-xs font-semibold shadow-liquid-btn cursor-pointer inline-flex items-center gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Сформировать вопросы</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ================= ПРАВАЯ КОЛОНКА (5 колонок в обычном / 6 колонок в театральном) ================= */}
        <div className={`${isTheaterMode ? "lg:col-span-6 lg:col-start-7 h-[760px]" : "lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:row-span-2 h-[calc(100vh-6rem)]"} sticky top-20 flex flex-col rounded-3xl liquid-glass border border-white/60 dark:border-white/[0.1] shadow-2xl overflow-hidden`}>
          {/* Верхний переключатель режимов правой панели */}
          <div className="p-3 border-b border-slate-200/60 dark:border-white/[0.06] liquid-glass-subtle">
            <div className="relative flex p-1 liquid-glass-subtle rounded-xl">
              {/* Скользящий стеклянный индикатор */}
              <div
                className="absolute top-1 bottom-1 left-1 rounded-lg liquid-tab-indicator pointer-events-none"
                style={{
                  width: "calc((100% - 8px) / 4)",
                  transform:
                    rightTab === "transcript"
                      ? "translateX(0%)"
                      : rightTab === "notes"
                      ? "translateX(100%)"
                      : rightTab === "search"
                      ? "translateX(200%)"
                      : "translateX(300%)",
                }}
              />
              {[
                { id: "transcript", label: "Транскрипт", icon: Volume2 },
                { id: "notes", label: "Заметки", icon: StickyNote, count: notes.length },
                { id: "search", label: "Поиск", icon: Search },
                { id: "chat", label: "Вопрос-ответ", icon: MessageSquare },
              ].map((tab) => {
                const Icon = tab.icon
                const isActive = rightTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setRightTab(tab.id as RightTab)}
                    className={`relative z-10 flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                      isActive
                        ? "text-slate-900 dark:text-white font-semibold"
                        : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold leading-tight ${
                          isActive
                            ? "bg-cyan-500 text-white"
                            : "bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-zinc-300"
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Содержимое Режима 1: Синхронный транскрипт */}
          {rightTab === "transcript" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Панель управления автоскроллом */}
              <div className="px-4 py-2 border-b border-slate-200/60 dark:border-white/[0.04] flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                <span>Синхронизировано с воспроизведением</span>
                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`px-2.5 py-0.5 rounded-full border text-[10px] transition-all cursor-pointer ${
                    autoScroll
                      ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30 font-semibold"
                      : "liquid-glass-subtle text-slate-600 dark:text-zinc-400"
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
                            ? "liquid-glass-subtle border-cyan-400/60 dark:border-cyan-400/50 shadow-md ring-1 ring-cyan-400/25"
                            : "liquid-glass-subtle border-white/40 dark:border-white/[0.04] hover:bg-white/70 dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span
                            className={`text-xs font-mono font-semibold flex items-center gap-1 ${
                              isSegActive ? "text-cyan-600 dark:text-cyan-400" : "text-slate-500 dark:text-zinc-400"
                            }`}
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            [{formatTimecode(seg.start_time)}]
                          </span>
                          {isSegActive && (
                            <span className="text-[10px] uppercase font-mono tracking-wider text-cyan-600 dark:text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.5 rounded">
                              Сейчас в плеере
                            </span>
                          )}
                        </div>

                        <p
                          className={`text-xs leading-relaxed transition-colors ${
                            isSegActive
                              ? "text-slate-900 dark:text-white font-medium"
                              : "text-slate-700 dark:text-zinc-300"
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
                  <div className="text-center py-16 text-xs text-slate-500">
                    Транскрипт речи формируется...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Содержимое Режима 2: Заметки на таймкодах */}
          {rightTab === "notes" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Верхняя плашка управления заметками: Заголовок + Экспорт в MD */}
              <div className="px-4 py-2.5 border-b border-slate-200/60 dark:border-white/[0.04] flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-700 dark:text-zinc-200 font-semibold">
                  <StickyNote className="w-4 h-4 text-cyan-500" />
                  <span>Заметки ({notes.length})</span>
                </div>

                <div className="flex items-center gap-2">
                  <Tooltip content="Экспортировать все заметки с таймкодами в Markdown (.md)" position="left">
                    <button
                      type="button"
                      disabled={notes.length === 0}
                      onClick={handleExportNotes}
                      className="px-2.5 py-1 rounded-xl liquid-btn-glass text-[11px] font-medium text-slate-600 dark:text-zinc-300 disabled:opacity-40 flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Экспорт .md</span>
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* Форма быстрого добавления заметки */}
              <div className="p-3.5 border-b border-slate-200/60 dark:border-white/[0.04] liquid-glass-subtle space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-300">
                    <span>Таймкод:</span>
                    <button
                      type="button"
                      onClick={() => setNewNoteTimecode(Math.floor(currentTime))}
                      className="px-2 py-0.5 rounded-lg liquid-btn-primary text-white text-[11px] font-mono font-bold flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                      title="Кликните, чтобы синхронизировать с текущей секундой видео"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      [{formatTimecode(newNoteTimecode !== null ? newNoteTimecode : Math.floor(currentTime))}]
                    </button>
                    {newNoteTimecode !== null && newNoteTimecode !== Math.floor(currentTime) && (
                      <button
                        type="button"
                        onClick={() => setNewNoteTimecode(Math.floor(currentTime))}
                        className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                      >
                        (обновить до {formatTimecode(currentTime)})
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                    Ctrl + Enter для сохранения
                  </span>
                </div>

                <div className="relative">
                  <textarea
                    ref={noteInputRef}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault()
                        handleCreateNote()
                      }
                    }}
                    placeholder="Напишите заметку или закладку к этому моменту..."
                    rows={2}
                    className="w-full liquid-glass-input rounded-xl p-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none resize-none transition-all leading-relaxed"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={isSubmittingNote || !newNoteText.trim()}
                    onClick={() => handleCreateNote()}
                    className="px-3.5 py-1.5 rounded-xl liquid-btn-primary text-white text-xs font-semibold shadow-liquid-btn disabled:opacity-40 cursor-pointer transition-all flex items-center gap-1.5"
                  >
                    {isSubmittingNote ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>Сохранить заметку</span>
                  </button>
                </div>
              </div>

              {/* Список заметок */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                {notesLoading ? (
                  <div className="flex items-center justify-center py-16 text-slate-500 gap-2 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
                    <span>Загрузка заметок...</span>
                  </div>
                ) : notes.length > 0 ? (
                  notes.map((note) => {
                    const isEditing = editingNoteId === note.id
                    const isNearCurrent = Math.abs(currentTime - note.timecode) < 5

                    return (
                      <motion.div
                        key={note.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className={`p-3.5 rounded-2xl border transition-all space-y-2.5 shadow-sm ${
                          isNearCurrent
                            ? "bg-cyan-500/10 border-cyan-500/50 shadow-cyan-500/5"
                            : "liquid-glass-subtle border-slate-200/80 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20"
                        }`}
                      >
                        {/* Шапка заметки: Таймкод + Дата + Кнопки редактирования/удаления */}
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => seekTo(note.timecode)}
                            className="px-2.5 py-1 rounded-lg liquid-btn-primary text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow-liquid-btn cursor-pointer transition-all hover:scale-105"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>[{formatTimecode(note.timecode)}]</span>
                          </button>

                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400 dark:text-zinc-500 mr-1.5">
                              {new Date(note.created_at).toLocaleTimeString("ru-RU", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>

                            {!isEditing && (
                              <>
                                <Tooltip content="Редактировать заметку" position="top">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingNoteId(note.id)
                                      setEditingNoteText(note.text)
                                    }}
                                    className="p-1 rounded-lg text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-white/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                </Tooltip>

                                <Tooltip content="Удалить заметку" position="top">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteNote(note.id)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </Tooltip>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Содержимое заметки */}
                        {isEditing ? (
                          <div className="space-y-2 pt-1">
                            <textarea
                              value={editingNoteText}
                              onChange={(e) => setEditingNoteText(e.target.value)}
                              rows={3}
                              className="w-full liquid-glass-input rounded-xl p-2.5 text-xs text-slate-900 dark:text-white outline-none resize-none leading-relaxed"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingNoteId(null)}
                                className="px-2.5 py-1 rounded-xl liquid-btn-glass text-[11px] text-slate-600 dark:text-zinc-400 cursor-pointer"
                              >
                                Отмена
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateNote(note.id)}
                                className="px-3 py-1 rounded-xl liquid-btn-primary text-white text-[11px] font-semibold cursor-pointer"
                              >
                                Сохранить
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                            {note.text}
                          </p>
                        )}
                      </motion.div>
                    )
                  })
                ) : (
                  <div className="text-center py-16 text-xs text-slate-500 dark:text-zinc-400 space-y-3">
                    <StickyNote className="w-8 h-8 text-cyan-500 mx-auto opacity-70" />
                    <div>
                      <p className="font-medium text-slate-700 dark:text-zinc-300">
                        Пока нет заметок к этой лекции
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                        Создавайте персональные закладки с комментариями прямо по ходу просмотра видео.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startAddNote(Math.floor(currentTime))}
                      className="px-3.5 py-1.5 rounded-xl liquid-btn-primary text-white text-xs font-semibold shadow-liquid-btn cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Создать заметку на [{formatTimecode(currentTime)}]</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Содержимое Режима 3: Поиск по смыслу внутри лекции */}
          {rightTab === "search" && (
            <div className="flex-1 flex flex-col p-4 space-y-4 overflow-hidden">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={lectureSearchInputRef}
                  type="text"
                  value={lectureQuery}
                  onChange={(e) => setLectureQuery(e.target.value)}
                  placeholder="Искать смысловой фрагмент..."
                  className="w-full liquid-glass-input rounded-xl pl-9 pr-9 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none transition-all"
                />
                {isSearching ? (
                  <Loader2 className="w-4 h-4 text-cyan-500 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
                ) : lectureQuery ? (
                  <button
                    onClick={() => setLectureQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : null}
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 pl-0.5">
                {lectureSearchResults.map((hit) => (
                  <motion.div
                    key={hit.chunk_id}
                    whileHover={{ y: -1 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => seekTo(hit.start_time)}
                    className="p-3.5 rounded-2xl liquid-glass-subtle border border-slate-200/80 dark:border-white/[0.08] hover:border-cyan-500/50 hover:bg-white/70 dark:hover:bg-white/[0.08] transition-all cursor-pointer space-y-2 group shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                        {hit.score}% по смыслу
                      </span>
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded text-xs font-mono font-semibold liquid-glass-subtle text-slate-700 dark:text-white flex items-center gap-1 group-hover:bg-blue-600 group-hover:text-white transition-colors"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        [{formatTimecode(hit.start_time)}]
                      </button>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-zinc-300 line-clamp-3 leading-relaxed">
                      «{hit.text}»
                    </p>
                  </motion.div>
                ))}

                {lectureQuery.trim() && !isSearching && lectureSearchResults.length === 0 && (
                  <div className="text-center py-12 text-xs text-slate-500">
                    Совпадений в этой лекции не обнаружено
                  </div>
                )}

                {!lectureQuery.trim() && (
                  <div className="text-center py-12 text-xs text-slate-500 space-y-1">
                    <HelpCircle className="w-6 h-6 mx-auto text-slate-400 dark:text-zinc-600 mb-2" />
                    <div>Введите вопрос или тему для поиска</div>
                    <div className="text-[11px] text-slate-400 dark:text-zinc-600">
                      Векторное сравнение фрагментов через MiniLM
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Содержимое Режима 4: Чат «Вопрос-ответ» (RAG) */}
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
                          ? "liquid-btn-primary text-white rounded-tr-none shadow-md"
                          : "liquid-glass-subtle text-slate-800 dark:text-zinc-200 border border-white/40 dark:border-white/[0.08] rounded-tl-none shadow-sm"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.text}</div>

                      {/* Источники цитирования с таймкодами */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-white/[0.08] space-y-1.5">
                          <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-zinc-400 tracking-wider">
                            Источники из лекции:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.sources.map((src, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => seekTo(src.timecode)}
                                className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-600 hover:text-white border border-cyan-500/20 transition-all flex items-center gap-1 cursor-pointer"
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
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 p-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-500" />
                    <span>ИИ анализирует лекцию и формулирует ответ...</span>
                  </div>
                )}
              </div>

              {/* Поле ввода вопроса */}
              <form
                onSubmit={handleSendQuestion}
                className="p-3 border-t border-slate-200/60 dark:border-white/[0.06] liquid-glass-subtle flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Задайте вопрос по материалу..."
                  disabled={chatLoading}
                  className="flex-1 liquid-glass-input rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none disabled:opacity-50 transition-all"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="w-8 h-8 rounded-xl liquid-btn-primary disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shadow-liquid-btn shrink-0"
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
