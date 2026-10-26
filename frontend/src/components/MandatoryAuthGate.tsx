import React, { useState } from "react"
import { motion } from "framer-motion"
import {
  Sparkles,
  User as UserIcon,
  Mail,
  Lock,
  ArrowRight,
  Loader2,
  Sun,
  Moon,
  ShieldCheck,
} from "lucide-react"
import { api } from "../api/client"
import type { User } from "../types"

interface MandatoryAuthGateProps {
  onSuccess: (user: User) => void
  theme: "dark" | "light"
  onToggleTheme: () => void
}

type AuthTab = "register" | "login"

export const MandatoryAuthGate: React.FC<MandatoryAuthGateProps> = ({
  onSuccess,
  theme,
  onToggleTheme,
}) => {
  const [tab, setTab] = useState<AuthTab>("register")
  const [fullName, setFullName] = useState<string>("")
  const [email, setEmail] = useState<string>("")
  const [password, setPassword] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (tab === "register") {
        if (!fullName.trim()) {
          setError("Пожалуйста, укажите ваше имя")
          setLoading(false)
          return
        }
        const data = await api.register({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
        })
        onSuccess(data.user)
      } else {
        const data = await api.login({
          email: email.trim(),
          password,
        })
        onSuccess(data.user)
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        (tab === "register"
          ? "Ошибка регистрации. Проверьте введенные данные."
          : "Неверный email или пароль.")
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Затемненная вуаль с легким затенением для контраста */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-[1px]"
      />

      {/* Центральная плашка регистрации в стиле Apple Pro */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="relative w-full max-w-md h-[630px] rounded-3xl bg-white/95 dark:bg-[#121215]/95 backdrop-blur-2xl border border-zinc-200/90 dark:border-white/[0.1] shadow-2xl overflow-hidden z-10 my-auto flex flex-col justify-between"
      >
        {/* Верхнее декоративное свечение */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/70 to-transparent" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-56 h-56 rounded-full bg-blue-600/15 dark:bg-blue-600/25 blur-3xl pointer-events-none" />

        {/* Шапка карточки: Логотип и переключатель темы */}
        <div className="p-6 sm:p-7 pb-0 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-cyan-400 p-[1px] shadow-glow shrink-0">
              <div className="w-full h-full bg-white dark:bg-[#09090B] rounded-[15px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-cyan-300" />
              </div>
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white">
                КИБЕРРЫВОК 2026
              </span>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                Интеллектуальный анализ лекций
              </p>
            </div>
          </div>

          {/* Кнопка смены темы оформления */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200 dark:hover:bg-white/[0.1] text-zinc-600 dark:text-zinc-300 flex items-center justify-center border border-zinc-200 dark:border-white/[0.08] transition-all cursor-pointer shrink-0"
            title={theme === "dark" ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-zinc-700" />
            )}
          </button>
        </div>

        {/* Заголовок обязательного доступа */}
        <div className="px-6 sm:px-7 pt-4 space-y-1 shrink-0">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight h-7 flex items-center">
            {tab === "register" ? "Обязательная регистрация" : "Вход в систему"}
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed h-9 flex items-center">
            {tab === "register"
              ? "Создайте аккаунт для доступа к библиотеке лекций, синхронным конспектам и семантическому ИИ-поиску."
              : "Войдите в личный профиль для просмотра видеолекций и работы с учебными материалами."}
          </p>
        </div>

        {/* Переключатель режимов: Регистрация / Вход */}
        <div className="px-6 sm:px-7 pt-3 shrink-0">
          <div className="flex p-1 bg-zinc-100 dark:bg-black/40 rounded-xl border border-zinc-200/80 dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                setTab("register")
                setError(null)
              }}
              className={`relative flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                tab === "register"
                  ? "text-zinc-900 dark:text-white"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {tab === "register" && (
                <motion.div
                  layoutId="mandatory-auth-tab"
                  className="absolute inset-0 bg-white dark:bg-white/[0.1] rounded-lg shadow-sm border border-zinc-200/80 dark:border-white/[0.08]"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <span className="relative z-10">Регистрация</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTab("login")
                setError(null)
              }}
              className={`relative flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                tab === "login"
                  ? "text-zinc-900 dark:text-white"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {tab === "login" && (
                <motion.div
                  layoutId="mandatory-auth-tab"
                  className="absolute inset-0 bg-white dark:bg-white/[0.1] rounded-lg shadow-sm border border-zinc-200/80 dark:border-white/[0.08]"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}
              <span className="relative z-10">Вход</span>
            </button>
          </div>
        </div>

        {/* Форма ввода данных */}
        <form onSubmit={handleSubmit} className="px-6 sm:px-7 py-2.5 flex-1 flex flex-col justify-between">
          <div className="space-y-3">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-600 dark:text-red-300 font-medium"
              >
                {error}
              </motion.div>
            )}

            {tab === "register" ? (
              <div className="space-y-1">
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
                    placeholder="Например: Иван Петров"
                    className="w-full bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-blue-500/[0.06] dark:bg-blue-600/[0.08] border border-blue-500/20 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="text-xs">
                  <div className="font-semibold text-zinc-900 dark:text-white">Безопасный доступ</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Сессия сохраняется на этом устройстве</div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Электронная почта
              </label>
              <div className="relative flex items-center bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/[0.08] rounded-xl px-3 py-2.5 focus-within:border-blue-500/80 transition-all">
                <Mail className="w-4 h-4 text-zinc-400 dark:text-zinc-500 mr-2.5 shrink-0" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@university.ru"
                  className="w-full bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
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
                  placeholder="Минимум 6 символов"
                  className="w-full bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-glow cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{tab === "register" ? "Зарегистрироваться и войти" : "Войти в аккаунт"}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Быстрое переключение под формой */}
            <div className="text-center">
              {tab === "register" ? (
                <button
                  type="button"
                  onClick={() => {
                    setTab("login")
                    setError(null)
                  }}
                  className="text-xs text-zinc-500 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  Уже есть аккаунт? <span className="font-semibold text-blue-600 dark:text-blue-400">Войти</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTab("register")
                    setError(null)
                  }}
                  className="text-xs text-zinc-500 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  Впервые на платформе? <span className="font-semibold text-blue-600 dark:text-blue-400">Создать аккаунт</span>
                </button>
              )}
            </div>
          </div>
        </form>

        {/* Нижний бейдж защищенности данных */}
        <div className="px-6 py-3.5 bg-zinc-50 dark:bg-white/[0.02] border-t border-zinc-100 dark:border-white/[0.04] flex items-center justify-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>100% локальная обработка данных и защищенное хранение</span>
        </div>
      </motion.div>
    </div>
  )
}
