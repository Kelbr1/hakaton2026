import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Star, Folder, Film, LogOut, ShieldCheck, Calendar } from "lucide-react"
import { formatDate } from "../utils/format"
import { ConfirmModal } from "./ConfirmModal"
import type { User } from "../types"

interface ProfileModalProps {
  isOpen: boolean
  user: User | null
  onClose: () => void
  onLogout: () => void
  favoriteCount: number
  categoryCount: number
  totalLecturesCount: number
}

const AVATAR_GRADIENTS: Record<string, string> = {
  blue: "from-blue-600 via-indigo-600 to-cyan-500",
  purple: "from-purple-600 via-fuchsia-600 to-indigo-600",
  cyan: "from-cyan-500 via-teal-500 to-blue-600",
  emerald: "from-emerald-500 via-teal-600 to-cyan-600",
  amber: "from-amber-500 via-orange-600 to-red-500",
  rose: "from-rose-500 via-pink-600 to-purple-600",
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  user,
  onClose,
  onLogout,
  favoriteCount,
  categoryCount,
  totalLecturesCount,
}) => {
  const [isConfirmLogoutOpen, setIsConfirmLogoutOpen] = useState(false)

  if (!isOpen || !user) return null

  const gradient =
    AVATAR_GRADIENTS[user.avatar_color || "blue"] || AVATAR_GRADIENTS.blue

  const initial = user.full_name
    ? user.full_name.charAt(0).toUpperCase()
    : user.email.charAt(0).toUpperCase()

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/75 backdrop-blur-md"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#121215] border border-zinc-200/90 dark:border-white/[0.1] shadow-2xl overflow-hidden z-10 text-zinc-900 dark:text-zinc-100 transition-colors"
        >
          {/* Верхняя декоративная плашка */}
          <div className="h-28 bg-gradient-to-r from-blue-600/30 via-indigo-500/20 to-purple-600/30 relative">
            <button
              onClick={onClose}
              aria-label="Закрыть"
              className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 pointer-events-none" />
            </button>
          </div>

          <div className="px-6 pb-6 relative -mt-12 space-y-6">
            {/* Аватарка и базовые данные */}
            <div className="flex items-end justify-between">
              <div className="relative">
                <div
                  className={`w-20 h-20 rounded-2xl bg-gradient-to-tr ${gradient} p-[2px] shadow-2xl`}
                >
                  <div className="w-full h-full bg-white dark:bg-[#121215] rounded-[14px] flex items-center justify-center text-2xl font-bold text-zinc-900 dark:text-white shadow-inner">
                    {initial}
                  </div>
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#121215] flex items-center justify-center">
                  <ShieldCheck className="w-3 h-3 text-black stroke-[3]" />
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-medium">
                  Исследователь
                </span>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
                {user.full_name}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                {user.email}
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 mt-2">
                <Calendar className="w-3.5 h-3.5" />
                <span>Регистрация: {formatDate(user.created_at)}</span>
              </div>
            </div>

            {/* Статистика Bento Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/[0.05] text-center space-y-1">
                <div className="flex justify-center text-amber-500 dark:text-amber-400 mb-1">
                  <Star className="w-4 h-4 fill-amber-500/20" />
                </div>
                <div className="text-lg font-bold text-zinc-900 dark:text-white">{favoriteCount}</div>
                <div className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider">
                  Избранное
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/[0.05] text-center space-y-1">
                <div className="flex justify-center text-cyan-600 dark:text-cyan-400 mb-1">
                  <Folder className="w-4 h-4" />
                </div>
                <div className="text-lg font-bold text-zinc-900 dark:text-white">{categoryCount}</div>
                <div className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider">
                  Категорий
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/[0.05] text-center space-y-1">
                <div className="flex justify-center text-indigo-600 dark:text-indigo-400 mb-1">
                  <Film className="w-4 h-4" />
                </div>
                <div className="text-lg font-bold text-zinc-900 dark:text-white">{totalLecturesCount}</div>
                <div className="text-[10px] text-zinc-500 uppercase font-medium tracking-wider">
                  Лекций
                </div>
              </div>
            </div>

            {/* Кнопка выхода */}
            <div className="pt-2 border-t border-zinc-200/80 dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => setIsConfirmLogoutOpen(true)}
                className="w-full py-2.5 px-4 rounded-xl bg-zinc-100 dark:bg-white/[0.04] hover:bg-red-50 dark:hover:bg-red-500/10 text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 border border-zinc-200 dark:border-white/[0.06] hover:border-red-200 dark:hover:border-red-500/20 text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Выйти из аккаунта</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Окно подтверждения выхода */}
        <ConfirmModal
          isOpen={isConfirmLogoutOpen}
          title="Выйти из аккаунта?"
          description="Вы выйдете из профиля на этом устройстве. Для сохранения избранного и добавления новых лекций потребуется повторная авторизация."
          confirmText="Выйти"
          cancelText="Отмена"
          type="warning"
          icon="logout"
          onConfirm={() => {
            setIsConfirmLogoutOpen(false)
            onLogout()
            onClose()
          }}
          onClose={() => setIsConfirmLogoutOpen(false)}
        />
      </div>
    </AnimatePresence>
  )
}
