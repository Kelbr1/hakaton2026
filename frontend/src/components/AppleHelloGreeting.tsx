import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, ArrowRight } from "lucide-react"

interface AppleHelloGreetingProps {
  userName: string
  onComplete: () => void
}

export const AppleHelloGreeting: React.FC<AppleHelloGreetingProps> = ({
  userName,
  onComplete,
}) => {
  const [step, setStep] = useState<"hello" | "welcome">("hello")

  // Шаг 1: Элегантная плавная задержка на "Привет" (2.6 секунды), чтобы пользователь успел прочитать
  useEffect(() => {
    const helloTimer = window.setTimeout(() => {
      setStep("welcome")
    }, 2600)

    return () => window.clearTimeout(helloTimer)
  }, [])

  // Шаг 2: Комфортное время на чтение приветствия (6 секунд), затем мягкое завершение
  useEffect(() => {
    if (step === "welcome") {
      const autoCloseTimer = window.setTimeout(() => {
        onComplete()
      }, 6000)

      return () => window.clearTimeout(autoCloseTimer)
    }
  }, [step, onComplete])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: "blur(20px)" }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="fixed inset-0 z-[100] bg-[#000000] flex flex-col items-center justify-center overflow-hidden select-none cursor-pointer"
      onClick={onComplete}
    >
      {/* Мягкие кинематографичные градиентные сферы Apple Glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-600/25 blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-indigo-600/25 blur-[150px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[650px] rounded-full bg-cyan-600/15 blur-[170px] pointer-events-none" />

      {/* Центральный блок анимации */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-lg">
        <AnimatePresence mode="wait">
          {step === "hello" ? (
            <motion.div
              key="hello"
              initial={{ opacity: 0, scale: 0.94, filter: "blur(14px)", y: 15 }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)", y: 0 }}
              exit={{ opacity: 0, scale: 1.04, filter: "blur(16px)", y: -10 }}
              transition={{
                duration: 0.9,
                ease: [0.16, 1, 0.3, 1], // Apple spring curve
              }}
              className="flex flex-col items-center justify-center"
            >
              <h1 className="text-7xl sm:text-8xl font-extralight tracking-tight text-white drop-shadow-2xl font-sans">
                Привет
              </h1>
            </motion.div>
          ) : (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, scale: 0.92, filter: "blur(16px)", y: 25 }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)", y: 0 }}
              transition={{
                duration: 0.8,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="space-y-6 flex flex-col items-center"
            >
              {/* Иконка успеха со свечением */}
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-500 p-[1.5px] shadow-[0_0_35px_rgba(6,182,212,0.35)]">
                <div className="w-full h-full liquid-glass rounded-[22px] flex items-center justify-center p-3 backdrop-blur-2xl">
                  <Sparkles className="w-8 h-8 text-cyan-300 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white drop-shadow-md">
                  Добро пожаловать, {userName}!
                </h2>
                <p className="text-sm text-zinc-300/80 font-normal leading-relaxed max-w-md">
                  Ваш профиль активирован. Теперь вам доступны персональные категории, избранные лекции и автономный семантический ИИ-анализ.
                </p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onComplete()
                }}
                className="mt-2 group flex items-center gap-2.5 px-8 py-3.5 rounded-full liquid-btn-primary text-white font-semibold text-sm active:scale-95 transition-all shadow-glow cursor-pointer"
              >
                <span>Начать работу</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Подсказка снизу */}
      <div className="absolute bottom-10 text-[11px] font-mono text-zinc-600 tracking-wider">
        Нажмите в любой точке экрана, чтобы продолжить
      </div>
    </motion.div>
  )
}
