import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Sparkles, ChevronDown, User as UserIcon, Sun, Moon } from "lucide-react"
import type { SystemStatus, User } from "../types"

interface NavbarProps {
  systemStatus: SystemStatus | null
  currentUser: User | null
  theme: "dark" | "light"
  onToggleTheme: () => void
  onOpenUpload: () => void
  onOpenAuth: (message?: string) => void
  onOpenProfile: () => void
}

const AVATAR_GRADIENTS: Record<string, string> = {
  blue: "from-blue-600 to-indigo-600",
  purple: "from-purple-600 to-indigo-600",
  cyan: "from-cyan-500 to-blue-600",
  emerald: "from-emerald-500 to-teal-600",
  amber: "from-amber-500 to-orange-600",
  rose: "from-rose-500 to-pink-600",
}

export const Navbar: React.FC<NavbarProps> = ({
  systemStatus,
  currentUser,
  theme,
  onToggleTheme,
  onOpenUpload,
  onOpenAuth,
  onOpenProfile,
}) => {
  const [showStatusDetails, setShowStatusDetails] = useState(false)

  const isOllamaOnline = systemStatus?.ollama?.online ?? false

  const handleUploadClick = () => {
    if (currentUser) {
      onOpenUpload()
    } else {
      onOpenAuth("Авторизуйтесь, чтобы загружать и анализировать новые лекции")
    }
  }

  const gradient =
    AVATAR_GRADIENTS[currentUser?.avatar_color || "blue"] || AVATAR_GRADIENTS.blue

  const initial = currentUser
    ? (currentUser.full_name || currentUser.email).charAt(0).toUpperCase()
    : "U"

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 dark:bg-black/60 border-b border-black/[0.08] dark:border-white/[0.08] transition-colors duration-300">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Логотип платформы */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-cyan-400 p-[1px] shadow-glow">
            <div className="w-full h-full bg-white dark:bg-[#09090B] rounded-[11px] flex items-center justify-center transition-colors">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-cyan-300" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-zinc-900 dark:text-white transition-colors">
                КИБЕРРЫВОК 2026
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium tracking-tight transition-colors">
              Локальный семантический анализ видео
            </p>
          </div>
        </div>

        {/* Правая секция: Статус, Переключатель темы, Профиль / Вход и Загрузка */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Индикатор статуса (Офлайн / Онлайн с LLM) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowStatusDetails(!showStatusDetails)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/[0.04] dark:bg-zinc-900/80 border border-black/[0.08] dark:border-white/[0.08] text-xs text-zinc-700 dark:text-zinc-300 hover:bg-black/[0.07] dark:hover:bg-zinc-800/80 transition-all cursor-pointer"
            >
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isOllamaOnline ? "bg-emerald-400" : "bg-cyan-400"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isOllamaOnline ? "bg-emerald-500" : "bg-cyan-500"
                  }`}
                />
              </span>
              <span className="font-medium hidden sm:inline">
                {isOllamaOnline ? "Онлайн с LLM" : "Офлайн-режим"}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500 dark:text-zinc-400" />
            </button>

            {/* Выпадающая панель статуса LLM */}
            <AnimatePresence>
              {showStatusDetails && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute right-0 mt-2 w-72 rounded-2xl bg-white dark:bg-[#18181C] border border-black/[0.1] dark:border-white/[0.1] p-3.5 text-xs shadow-2xl z-50 text-zinc-800 dark:text-zinc-200"
                >
                  <div className="flex items-start justify-between p-3 rounded-xl bg-zinc-100 dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06]">
                    <div className="space-y-1">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-medium">
                        Режим работы
                      </div>
                      <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                        {isOllamaOnline ? "Онлайн с LLM" : "Офлайн-режим"}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {isOllamaOnline
                          ? `Модель: ${systemStatus?.ollama?.active_model || "Ollama подключена"}`
                          : "Автономный анализ (без LLM)"}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium self-start ${
                        isOllamaOnline
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/20"
                      }`}
                    >
                      {isOllamaOnline ? "LLM Online" : "Офлайн"}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Переключатель темы (Светлая / Тёмная) с плавной кинематографичной анимацией */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
            title={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] border border-black/[0.08] dark:border-white/[0.1] text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer overflow-hidden relative shadow-sm"
          >
            <AnimatePresence mode="wait" initial={false}>
              {theme === "dark" ? (
                <motion.div
                  key="moon"
                  initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  exit={{ rotate: 90, scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  className="flex items-center justify-center"
                >
                  <Moon className="w-4 h-4 text-cyan-400 fill-cyan-400/20" />
                </motion.div>
              ) : (
                <motion.div
                  key="sun"
                  initial={{ rotate: 90, scale: 0.5, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  exit={{ rotate: -90, scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  className="flex items-center justify-center"
                >
                  <Sun className="w-4 h-4 text-amber-500 fill-amber-500" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>

          {/* Кнопка Профиля / Входа */}
          {currentUser ? (
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] border border-black/[0.08] dark:border-white/[0.08] text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-all cursor-pointer shadow-sm"
            >
              <div
                className={`w-6 h-6 rounded-full bg-gradient-to-tr ${gradient} flex items-center justify-center text-[11px] font-bold text-white shadow-sm`}
              >
                {initial}
              </div>
              <span className="max-w-[100px] truncate hidden sm:inline">
                {currentUser.full_name.split(" ")[0]}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenAuth()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-zinc-800 dark:text-zinc-200 transition-all cursor-pointer shadow-sm"
            >
              <UserIcon className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
              <span>Войти</span>
            </button>
          )}

          {/* Кнопка загрузки лекции */}
          <button
            type="button"
            onClick={handleUploadClick}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-zinc-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200 active:scale-95 transition-all font-medium text-xs shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Загрузить лекцию</span>
          </button>
        </div>
      </div>
    </header>
  )
}
