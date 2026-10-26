export function formatTimecode(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) {
    return "00:00"
  }

  const totalSec = Math.floor(seconds)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const remainingSec = totalSec % 60

  const pad = (n: number) => n.toString().padStart(2, "0")

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(remainingSec)}`
  }

  return `${pad(minutes)}:${pad(remainingSec)}`
}

export function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString)
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  } catch {
    return isoString
  }
}
