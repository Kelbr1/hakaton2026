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
import Tooltip from "./Tooltip"

interface MandatoryAuthGateProps {
  onSuccess: (user: User) => void
  theme: "dark" | "light"
  onToggleTheme: (e?: React.MouseEvent) => void
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
        className="fixed inset-0 bg-black/35 backdrop-blur-sm"
      />

      {/* Центральная плашка регистрации в стиле жидкого стекла */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="relative w-full max-w-md h-[630px] rounded-3xl liquid-glass-modal shadow-2xl overflow-hidden z-10 my-auto flex flex-col justify-between"
      >
        {/* Верхнее декоративное свечение */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-56 h-56 rounded-full bg-cyan-500/15 dark:bg-cyan-500/20 blur-3xl pointer-events-none" />

        {/* Шапка карточки: Логотип и переключатель темы */}
        <div className="p-6 sm:p-7 pb-0 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-600 p-[1.5px] shadow-glow shrink-0">
              <div className="w-full h-full bg-white/80 dark:bg-[#0c0f1e]/85 backdrop-blur-md rounded-[14px] flex items-center justify-center shadow-inner">
                <Sparkles className="w-5 h-5 text-cyan-600 dark:text-cyan-300" />
              </div>
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">
                КИБЕРРЫВОК 2026
              </span>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                Интеллектуальный анализ лекций
              </p>
            </div>
          </div>

          {/* Кнопка смены темы оформления */}
          <Tooltip
            content={theme === "dark" ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
            position="bottom"
          >
            <button
              type="button"
              data-theme-toggle="true"
              onClick={(e) => onToggleTheme(e)}
              className="w-8 h-8 rounded-xl liquid-btn-glass text-slate-600 dark:text-zinc-300 flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-sm"
              aria-label={theme === "dark" ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-zinc-700" />
              )}
            </button>
          </Tooltip>
        </div>

        {/* Заголовок обязательного доступа */}
        <div className="px-6 sm:px-7 pt-4 space-y-1 shrink-0">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight h-7 flex items-center">
            {tab === "register" ? "Обязательная регистрация" : "Вход в систему"}
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed h-9 flex items-center">
            {tab === "register"
              ? "Создайте аккаунт для доступа к библиотеке лекций, синхронным конспектам и семантическому ИИ-поиску."
              : "Войдите в личный профиль для просмотра видеолекций и работы с учебными материалами."}
          </p>
        </div>

        {/* Переключатель режимов: Регистрация / Вход */}
        <div className="px-6 sm:px-7 pt-3 shrink-0">
          <div className="relative flex p-1 liquid-glass-subtle rounded-xl">
            {/* Скользящий стеклянный индикатор активной вкладки */}
            <div
              className="absolute top-1 bottom-1 left-1 rounded-lg liquid-tab-indicator pointer-events-none"
              style={{
                width: "calc(50% - 4px)",
                transform: tab === "register" ? "translateX(0%)" : "translateX(100%)",
              }}
            />

            <button
              type="button"
              onClick={() => {
                setTab("register")
                setError(null)
              }}
              className={`relative z-10 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer text-center ${
                tab === "register"
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
              }`}
            >
              Регистрация
            </button>

            <button
              type="button"
              onClick={() => {
                setTab("login")
                setError(null)
              }}
              className={`relative z-10 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer text-center ${
                tab === "login"
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
              }`}
            >
              Вход
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
                <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Ваше имя
                </label>
                <div className="relative flex items-center liquid-glass-input rounded-xl px-3 py-2.5 transition-all">
                  <UserIcon className="w-4 h-4 text-slate-400 dark:text-zinc-500 mr-2.5 shrink-0" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Например: Иван Петров"
                    className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl liquid-glass-subtle border border-cyan-500/25 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg liquid-btn-primary text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="text-xs">
                  <div className="font-semibold text-slate-900 dark:text-white">Безопасный доступ</div>
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">Сессия сохраняется на этом устройстве</div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                Электронная почта
              </label>
              <div className="relative flex items-center liquid-glass-input rounded-xl px-3 py-2.5 transition-all">
                <Mail className="w-4 h-4 text-slate-400 dark:text-zinc-500 mr-2.5 shrink-0" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@university.ru"
                  className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                Пароль
              </label>
              <div className="relative flex items-center liquid-glass-input rounded-xl px-3 py-2.5 transition-all">
                <Lock className="w-4 h-4 text-slate-400 dark:text-zinc-500 mr-2.5 shrink-0" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl liquid-btn-primary text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-liquid-btn cursor-pointer disabled:opacity-50"
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
                  className="text-xs text-slate-500 hover:text-cyan-600 dark:text-zinc-400 dark:hover:text-cyan-400 transition-colors cursor-pointer"
                >
                  Уже есть аккаунт? <span className="font-semibold text-cyan-600 dark:text-cyan-400">Войти</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTab("register")
                    setError(null)
                  }}
                  className="text-xs text-slate-500 hover:text-cyan-600 dark:text-zinc-400 dark:hover:text-cyan-400 transition-colors cursor-pointer"
                >
                  Впервые на платформе? <span className="font-semibold text-cyan-600 dark:text-cyan-400">Создать аккаунт</span>
                </button>
              )}
            </div>
          </div>
        </form>

        {/* Нижний бейдж защищенности данных */}
        <div className="px-6 py-3.5 liquid-glass-subtle border-t border-slate-300/70 dark:border-white/[0.06] flex items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>100% локальная обработка данных и защищенное хранение</span>
        </div>
      </motion.div>
    </div>
  )
}
