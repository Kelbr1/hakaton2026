export interface CategoryColorPreset {
  id: string
  label: string
  hex: string
}

export const CATEGORY_COLOR_PRESETS: CategoryColorPreset[] = [
  { id: "blue", label: "Синий", hex: "#3b82f6" },
  { id: "purple", label: "Фиолетовый", hex: "#8b5cf6" },
  { id: "emerald", label: "Изумрудный", hex: "#10b981" },
  { id: "amber", label: "Янтарный", hex: "#f59e0b" },
  { id: "rose", label: "Коралловый", hex: "#f43f5e" },
  { id: "cyan", label: "Бирюзовый", hex: "#06b6d4" },
  { id: "indigo", label: "Индиго", hex: "#6366f1" },
]

export function getCategoryHex(color?: string | null): string {
  if (!color) return "#3b82f6"
  if (color.startsWith("#")) return color
  const map: Record<string, string> = {
    blue: "#3b82f6",
    purple: "#8b5cf6",
    emerald: "#10b981",
    green: "#10b981",
    amber: "#f59e0b",
    yellow: "#f59e0b",
    orange: "#f97316",
    rose: "#f43f5e",
    red: "#ef4444",
    cyan: "#06b6d4",
    teal: "#14b8a6",
    indigo: "#6366f1",
    violet: "#8b5cf6",
    pink: "#ec4899",
  }
  return map[color.toLowerCase()] || "#3b82f6"
}
