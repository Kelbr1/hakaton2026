import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Mail, Lock, User as UserIcon, Loader2, Sparkles, ArrowRight } from "lucide-react"
import { api } from "../api/client"
import type { User } from "../types"

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (user: User) => void
  promptMessage?: string
}

type AuthTab = "login" | "register"

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  promptMessage,
}) => {
  const [tab, setTab] = useState<AuthTab>("login")
  const [email, setEmail] = useState<string>("")
  const [password, setPassword] = useState<string>("")
  const [fullName, setFullName] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (tab === "login") {
        const data = await api.login({ email, password })
        onSuccess(data.user)
        onClose()
      } else {
        if (!fullName.trim()) {
          setError("Пожалуйста, укажите ваше имя")
          setLoading(false)
          return
        }
        const data = await api.register({
          email,
          password,
          full_name: fullName.trim(),
        })
        onSuccess(data.user)
        onClose()
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Ошибка авторизации. Проверьте данные."
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Затемнение с размытием */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Окно авторизации в стиле Apple Pro */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#121215] border border-zinc-200/90 dark:border-white/[0.1] shadow-2xl overflow-hidden z-10"
        >
          {/* Декоративное верхнее свечение */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-blue-600/15 dark:bg-blue-600/20 blur-3xl pointer-events-none" />

          {/* Заголовок и кнопка закрытия */}
          <div className="p-6 pb-0 flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 dark:text-blue-400">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
                  {tab === "login" ? "Вход в систему" : "Создание аккаунта"}
                </h2>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {promptMessage ||
                  (tab === "login"
                    ? "Войдите для доступа к избранному и загрузке материалов"
                    : "Зарегистрируйтесь для персонализации и анализа лекций")}
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-white/[0.04] hover:bg-zinc-200 dark:hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-700 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Переключатель режимов Вход / Регистрация (Segmented Control) */}
          <div className="px-6 pt-5">
            <div className="flex p-1 bg-zinc-100 dark:bg-black/40 rounded-xl border border-zinc-200/80 dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => {
                  setTab("login")
                  setError(null)
                }}
                className={`relative flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  tab === "login"
                    ? "text-zinc-900 dark:text-white"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {tab === "login" && (
                  <motion.div
                    layoutId="auth-tab"
                    className="absolute inset-0 bg-white dark:bg-white/[0.1] rounded-lg shadow-sm border border-zinc-200/80 dark:border-white/[0.08]"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <span className="relative z-10">Вход</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTab("register")
                  setError(null)
                }}
                className={`relative flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  tab === "register"
                    ? "text-zinc-900 dark:text-white"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                {tab === "register" && (
                  <motion.div
                    layoutId="auth-tab"
                    className="absolute inset-0 bg-white dark:bg-white/[0.1] rounded-lg shadow-sm border border-zinc-200/80 dark:border-white/[0.08]"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <span className="relative z-10">Регистрация</span>
              </button>
            </div>
          </div>

          {/* Форма */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-300 font-medium">
                {error}
              </div>
            )}

            {tab === "register" && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Ваше имя
                </label>
                <div className="relative flex items-center bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/[0.08] rounded-xl px-3 py-2.5 focus-within:border-blue-500/80 transition-all">
                  <UserIcon className="w-4 h-4 text-zinc-400 dark:text-zinc-500 mr-2.5 shrink-0" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Например: Александр Смирнов"
                    className="w-full bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 outline-none"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Email
              </label>
              <div className="relative flex items-center bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/[0.08] rounded-xl px-3 py-2.5 focus-within:border-blue-500/80 transition-all">
                <Mail className="w-4 h-4 text-zinc-400 dark:text-zinc-500 mr-2.5 shrink-0" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@university.ru"
                  className="w-full bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Пароль
              </label>
              <div className="relative flex items-center bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/[0.08] rounded-xl px-3 py-2.5 focus-within:border-blue-500/80 transition-all">
                <Lock className="w-4 h-4 text-zinc-400 dark:text-zinc-500 mr-2.5 shrink-0" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-black dark:hover:bg-zinc-200 active:scale-[0.98] font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white dark:text-black" />
              ) : (
                <>
                  <span>{tab === "login" ? "Войти в аккаунт" : "Создать аккаунт"}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
