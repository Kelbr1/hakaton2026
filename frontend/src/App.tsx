import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { flushSync } from "react-dom"
import { AnimatePresence } from "framer-motion"
import { Sparkles } from "lucide-react"
import { Navbar } from "./components/Navbar"
import { UploadModal } from "./components/UploadModal"
import { DashboardView } from "./components/DashboardView"
import { LectureWorkspace } from "./components/LectureWorkspace"
import { AuthModal } from "./components/AuthModal"
import { MandatoryAuthGate } from "./components/MandatoryAuthGate"
import { ProfileModal } from "./components/ProfileModal"
import { AppleHelloGreeting } from "./components/AppleHelloGreeting"
import { api } from "./api/client"
import type { Lecture, SystemStatus, User, Category } from "./types"

export const App: React.FC = () => {
  // Данные
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState<boolean>(true)

  // Тема оформления (тёмная / светлая)
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("cyberbreak_theme") as "dark" | "light") || "dark"
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
      root.classList.remove("light")
    } else {
      root.classList.remove("dark")
      root.classList.add("light")
    }
    localStorage.setItem("cyberbreak_theme", theme)
  }, [theme])

  const isTransitioningRef = useRef(false)

  // Переключение темы:
  // - с тёмной на светлую: круг РАСШИРЯЕТСЯ из кнопки
  // - со светлой на тёмную: круг УМЕНЬШАЕТСЯ обратно в кнопку
  const toggleTheme = (e?: React.MouseEvent) => {
    // 1. Вычисляем точный геометрический центр кнопки
    let x: number
    let y: number

    const buttonEl = (e?.currentTarget || document.querySelector("[data-theme-toggle]")) as HTMLElement | null
    if (buttonEl && typeof buttonEl.getBoundingClientRect === "function") {
      const rect = buttonEl.getBoundingClientRect()
      x = Math.round(rect.left + rect.width / 2)
      y = Math.round(rect.top + rect.height / 2)
    } else if (e?.clientX && e?.clientY) {
      x = Math.round(e.clientX)
      y = Math.round(e.clientY)
    } else {
      x = Math.round(window.innerWidth / 2)
      y = Math.round(window.innerHeight / 2)
    }

    // 2. Радиус охвата (до самого дальнего угла экрана с запасом)
    const endRadius = Math.ceil(
      Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      ) * 1.15
    )

    const root = document.documentElement
    root.style.setProperty("--theme-wave-x", `${x}px`)
    root.style.setProperty("--theme-wave-y", `${y}px`)
    root.style.setProperty("--theme-wave-r", `${endRadius}px`)

    // Тёмная -> Светлая: expand (круг растёт из кнопки)
    // Светлая -> Тёмная: shrink (круг сжимается обратно в кнопку)
    const isDark = theme === "dark"
    const direction = isDark ? "expand" : "shrink"
    root.dataset.themeTransition = direction

    const doc = document as any

    // Если поддерживается View Transitions API:
    if (typeof doc.startViewTransition === "function") {
      if (isTransitioningRef.current) return
      isTransitioningRef.current = true

      try {
        const transition = doc.startViewTransition(() => {
          flushSync(() => {
            setTheme((prev) => {
              const next = prev === "dark" ? "light" : "dark"
              if (next === "dark") {
                root.classList.add("dark")
                root.classList.remove("light")
              } else {
                root.classList.remove("dark")
                root.classList.add("light")
              }
              localStorage.setItem("cyberbreak_theme", next)
              return next
            })
          })
        })

        transition.finished.finally(() => {
          delete root.dataset.themeTransition
          isTransitioningRef.current = false
        })
      } catch (err) {
        console.warn("View transition error:", err)
        delete root.dataset.themeTransition
        setTheme((prev) => (prev === "dark" ? "light" : "dark"))
        isTransitioningRef.current = false
      }
    } else {
      // Браузеры без View Transitions API
      delete root.dataset.themeTransition
      setTheme((prev) => (prev === "dark" ? "light" : "dark"))
    }
  }

  // Фильтры и навигация
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false)
  const [selectedLectureId, setSelectedLectureId] = useState<number | null>(null)
  const [selectedInitialTimecode, setSelectedInitialTimecode] = useState<number | undefined>(undefined)

  // Модальные окна и экраны
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false)
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false)
  const [authPromptMessage, setAuthPromptMessage] = useState<string | undefined>(undefined)
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false)
  const [showHelloGreeting, setShowHelloGreeting] = useState<boolean>(false)

  // Загрузка текущего пользователя (если в localStorage есть валидный токен)
  const fetchUser = useCallback(async () => {
    const token = api.getToken()
    if (!token) {
      setCurrentUser(null)
      setAuthLoading(false)
      return
    }

    try {
      const data = await api.getMe()
      setCurrentUser(data.user)
    } catch {
      api.clearToken()
      setCurrentUser(null)
    } finally {
      setAuthLoading(false)
    }
  }, [])

  // Загрузка категорий
  const fetchCategories = useCallback(async () => {
    try {
      const data = await api.getCategories()
      setCategories(data)
    } catch (err) {
      console.error("Failed to load categories:", err)
    }
  }, [])

  // Загрузка списка лекций
  const fetchLectures = useCallback(async () => {
    try {
      const data = await api.getLectures()
      setLectures(data)
    } catch (err) {
      console.error("Failed to load lectures:", err)
    }
  }, [])

  // Загрузка статуса локальных ИИ-подсистем
  const fetchSystemStatus = useCallback(async () => {
    try {
      const status = await api.getSystemStatus()
      setSystemStatus(status)
    } catch (err) {
      console.error("Failed to fetch system status:", err)
    }
  }, [])

  // Инициализация при монтировании
  useEffect(() => {
    fetchUser()
    fetchCategories()
    fetchLectures()
    fetchSystemStatus()
  }, [fetchUser, fetchCategories, fetchLectures, fetchSystemStatus])

  // Поллинг статуса обработки незавершенных лекций
  useEffect(() => {
    const hasPending = lectures.some(
      (l) => l.status !== "ready" && l.status !== "error"
    )

    if (!hasPending) return

    const intervalId = window.setInterval(() => {
      fetchLectures()
      fetchCategories()
    }, 2500)

    return () => window.clearInterval(intervalId)
  }, [lectures, fetchLectures, fetchCategories])

  // Открытие модалки авторизации с контекстным сообщением
  const handleOpenAuth = (message?: string) => {
    setAuthPromptMessage(message)
    setIsAuthOpen(true)
  }

  // Успешный вход или регистрация
  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user)
    setIsAuthOpen(false)
    setShowHelloGreeting(true)
    fetchLectures()
    fetchCategories()
  }

  // Выход из профиля
  const handleLogout = async () => {
    try {
      await api.logout()
    } catch (err) {
      console.error("Logout error:", err)
    } finally {
      setCurrentUser(null)
      setIsProfileOpen(false)
      setOnlyFavorites(false)
      fetchLectures()
    }
  }

  // Защищенное открытие загрузки лекций
  const handleOpenUpload = () => {
    if (!currentUser) {
      handleOpenAuth("Загрузка лекций доступна только авторизованным пользователям")
      return
    }
    setIsUploadOpen(true)
  }

  // Переключение избранного с оптимистичным обновлением
  const handleToggleFavorite = async (lectureId: number) => {
    if (!currentUser) {
      handleOpenAuth("Войдите в личный профиль, чтобы добавлять лекции в избранное")
      return
    }

    setLectures((prev) =>
      prev.map((l) =>
        l.id === lectureId ? { ...l, is_favorite: !l.is_favorite } : l
      )
    )

    try {
      await api.toggleFavorite(lectureId)
    } catch (err) {
      console.error("Failed to toggle favorite:", err)
      fetchLectures()
    }
  }

  // Создание новой категории
  const handleCreateCategory = async (name: string, color?: string): Promise<Category | void> => {
    try {
      const created = await api.createCategory(name, color)
      setCategories((prev) => [...prev, created])
      return created
    } catch (err) {
      console.error("Failed to create category:", err)
      throw err
    }
  }

  // Обновление / переименование категории
  const handleUpdateCategory = async (id: number, name: string, color?: string): Promise<Category | void> => {
    try {
      const updated = await api.updateCategory(id, name, color)
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)))
      setLectures((prev) =>
        prev.map((l) =>
          l.category_id === id ? { ...l, category: { ...l.category, ...updated } } : l
        )
      )
      return updated
    } catch (err) {
      console.error("Failed to update category:", err)
      throw err
    }
  }

  // Удаление категории
  const handleDeleteCategory = async (id: number): Promise<void> => {
    try {
      await api.deleteCategory(id)
      setCategories((prev) => prev.filter((c) => c.id !== id))
      setLectures((prev) =>
        prev.map((l) =>
          l.category_id === id ? { ...l, category_id: null, category: null } : l
        )
      )
      if (selectedCategoryId === id) {
        setSelectedCategoryId(null)
      }
    } catch (err) {
      console.error("Failed to delete category:", err)
      throw err
    }
  }

  // Выбор лекции для просмотра
  const handleSelectLecture = (id: number, timecode?: number) => {
    setSelectedLectureId(id)
    setSelectedInitialTimecode(timecode)
  }

  // Удаление лекции
  const handleDeleteLecture = async (id: number) => {
    try {
      await api.deleteLecture(id)
      setLectures((prev) => prev.filter((l) => l.id !== id))
      fetchCategories()
      if (selectedLectureId === id) {
        setSelectedLectureId(null)
      }
    } catch (err) {
      console.error("Failed to delete lecture:", err)
    }
  }

  // Повторная обработка лекции при сбое
  const handleRetryLecture = async (id: number) => {
    try {
      const updated = await api.retryLecture(id)
      setLectures((prev) => prev.map((l) => (l.id === id ? updated : l)))
    } catch (err) {
      console.error("Failed to retry lecture:", err)
    }
  }

  // Добавление новой лекции в список
  const handleLectureCreated = (newLecture: Lecture) => {
    setLectures((prev) => [newLecture, ...prev])
    fetchCategories()
  }

  // Назначение / сброс категории лекции
  const handleAssignCategory = async (
    lectureId: number,
    categoryId: number | null
  ): Promise<void> => {
    try {
      const updated = await api.updateLecture(lectureId, { category_id: categoryId })
      setLectures((prev) =>
        prev.map((l) =>
          l.id === lectureId
            ? { ...l, category_id: updated.category_id, category: updated.category }
            : l
        )
      )
      fetchCategories()
    } catch (err) {
      console.error("Failed to assign category to lecture:", err)
      throw err
    }
  }

  const favoriteCount = useMemo(
    () => lectures.filter((l) => l.is_favorite).length,
    [lectures]
  )

  const selectedLecture = useMemo(
    () => lectures.find((l) => l.id === selectedLectureId),
    [lectures, selectedLectureId]
  )

  return (
    <div className="min-h-screen bg-[#EEF2F9] dark:bg-[#070814] text-slate-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-400 selection:bg-cyan-500/30 selection:text-cyan-400 relative overflow-x-hidden">
      {/* Жидкий световой фон (Liquid Ambient Glow Mesh) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none">
        {/* Жидкая лазурная сфера */}
        <div className="absolute -top-[12%] -left-[8%] w-[680px] h-[680px] rounded-full bg-gradient-to-br from-cyan-400/25 via-blue-600/20 to-transparent blur-[120px] dark:from-cyan-400/16 dark:via-blue-600/12 animate-liquid-float-1" />
        {/* Жидкая индиго-фиолетовая сфера */}
        <div className="absolute top-[22%] -right-[10%] w-[640px] h-[640px] rounded-full bg-gradient-to-bl from-purple-500/20 via-indigo-600/18 to-transparent blur-[130px] dark:from-purple-500/14 dark:via-indigo-600/12 animate-liquid-float-2" />
        {/* Жидкая изумрудно-бирюзовая сфера */}
        <div className="absolute -bottom-[15%] left-[22%] w-[780px] h-[560px] rounded-full bg-gradient-to-t from-teal-400/20 via-sky-500/16 to-transparent blur-[140px] dark:from-teal-400/10 dark:via-sky-500/10 animate-liquid-float-3" />
        {/* Центральный мягкий пульсирующий блик */}
        <div className="absolute top-[45%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-blue-500/10 blur-[150px] dark:bg-cyan-400/08 animate-liquid-pulse" />
      </div>

      {/* Экран первичной проверки авторизации */}
      {authLoading ? (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 relative z-10">
          <div className="w-11 h-11 rounded-2xl liquid-btn-primary flex items-center justify-center shadow-glow animate-pulse">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">Загрузка платформы...</span>
        </div>
      ) : (
        <>
          {/* Основной интерфейс платформы (размыт и заблокирован, пока пользователь не авторизован) */}
          <div
            className={`flex-1 flex flex-col relative z-10 transition-all duration-500 ${
              !currentUser
                ? "filter blur-[6px] opacity-80 pointer-events-none select-none"
                : "filter-none opacity-100 pointer-events-auto"
            }`}
          >
            {/* Верхняя навигация Apple Style */}
            <Navbar
              systemStatus={systemStatus}
              currentUser={currentUser}
              theme={theme}
              onToggleTheme={toggleTheme}
              onOpenUpload={handleOpenUpload}
              onOpenAuth={handleOpenAuth}
              onOpenProfile={() => setIsProfileOpen(true)}
            />

            {/* Основная рабочая зона */}
            <main className="flex-1">
              {selectedLectureId ? (
                <LectureWorkspace
                  lectureId={selectedLectureId}
                  initialTimecode={selectedInitialTimecode}
                  currentUser={currentUser}
                  categories={categories}
                  onCreateCategory={handleCreateCategory}
                  onAssignCategory={handleAssignCategory}
                  onOpenAuth={handleOpenAuth}
                  isFavorite={selectedLecture?.is_favorite}
                  onToggleFavorite={handleToggleFavorite}
                  onBack={() => {
                    setSelectedLectureId(null)
                    setSelectedInitialTimecode(undefined)
                  }}
                />
              ) : (
                <DashboardView
                  lectures={lectures}
                  categories={categories}
                  selectedCategoryId={selectedCategoryId}
                  onSelectCategory={setSelectedCategoryId}
                  onlyFavorites={onlyFavorites}
                  onToggleOnlyFavorites={setOnlyFavorites}
                  onCreateCategory={handleCreateCategory}
                  onUpdateCategory={handleUpdateCategory}
                  onDeleteCategory={handleDeleteCategory}
                  onAssignCategory={handleAssignCategory}
                  onToggleFavorite={handleToggleFavorite}
                  currentUser={currentUser}
                  onOpenAuth={handleOpenAuth}
                  onSelectLecture={handleSelectLecture}
                  onDeleteLecture={handleDeleteLecture}
                  onRetryLecture={handleRetryLecture}
                  onOpenUpload={handleOpenUpload}
                />
              )}
            </main>
          </div>

          {/* Обязательная плашка регистрации/входа по центру экрана для неавторизованных пользователей */}
          <AnimatePresence>
            {!currentUser && (
              <MandatoryAuthGate
                onSuccess={handleAuthSuccess}
                theme={theme}
                onToggleTheme={toggleTheme}
              />
            )}
          </AnimatePresence>
        </>
      )}

      {/* Модальное окно загрузки лекций */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onLectureCreated={handleLectureCreated}
        categories={categories}
        onCategoryCreated={(cat) => setCategories((prev) => [...prev, cat])}
      />

      {/* Модальное окно авторизации и регистрации */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={handleAuthSuccess}
        promptMessage={authPromptMessage}
      />

      {/* Модальное окно личного профиля */}
      <ProfileModal
        isOpen={isProfileOpen}
        user={currentUser}
        onClose={() => setIsProfileOpen(false)}
        onLogout={handleLogout}
        favoriteCount={favoriteCount}
        categoryCount={categories.length}
        totalLecturesCount={lectures.length}
      />

      {/* Apple iPhone активация-приветствие */}
      <AnimatePresence>
        {showHelloGreeting && currentUser && (
          <AppleHelloGreeting
            userName={currentUser.full_name || "Студент"}
            onComplete={() => setShowHelloGreeting(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
