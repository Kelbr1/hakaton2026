import axios from "axios"
import type {
  AskQuestionResponse,
  Category,
  Lecture,
  LectureNote,
  LectureQuiz,
  SearchResultItem,
  SystemStatus,
  User,
} from "../types"

const API_BASE = ""
const TOKEN_KEY = "cyberbreak_token"

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

// Автоматическое добавление токена авторизации в заголовки
axios.interceptors.request.use((config) => {
  const token = getStoredToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const api = {
  // Аутентификация
  async register(payload: { email: string; password: string; full_name: string }): Promise<{
    user: User
    token: string
    favorite_lecture_ids: number[]
  }> {
    const res = await axios.post(`${API_BASE}/api/auth/register`, payload)
    if (res.data?.token) {
      setStoredToken(res.data.token)
    }
    return res.data
  },

  async login(payload: { email: string; password: string }): Promise<{
    user: User
    token: string
    favorite_lecture_ids: number[]
  }> {
    const res = await axios.post(`${API_BASE}/api/auth/login`, payload)
    if (res.data?.token) {
      setStoredToken(res.data.token)
    }
    return res.data
  },

  async getMe(): Promise<{ user: User; favorite_lecture_ids: number[] }> {
    const res = await axios.get(`${API_BASE}/api/auth/me`)
    return res.data
  },

  getToken(): string | null {
    return getStoredToken()
  },

  clearToken(): void {
    setStoredToken(null)
  },

  async logout(): Promise<void> {
    try {
      await axios.post(`${API_BASE}/api/auth/logout`)
    } finally {
      setStoredToken(null)
    }
  },

  // Категории
  async getCategories(): Promise<Category[]> {
    const res = await axios.get<Category[]>(`${API_BASE}/api/categories`)
    return res.data
  },

  async createCategory(name: string, color: string = "blue"): Promise<Category> {
    const res = await axios.post<Category>(`${API_BASE}/api/categories`, {
      name,
      color,
    })
    return res.data
  },

  async updateCategory(id: number, name: string, color?: string): Promise<Category> {
    const res = await axios.put<Category>(`${API_BASE}/api/categories/${id}`, {
      name,
      color,
    })
    return res.data
  },

  async deleteCategory(id: number): Promise<void> {
    await axios.delete(`${API_BASE}/api/categories/${id}`)
  },

  // Избранное
  async toggleFavorite(lectureId: number): Promise<{ lecture_id: number; is_favorite: boolean }> {
    const res = await axios.post<{ lecture_id: number; is_favorite: boolean }>(
      `${API_BASE}/api/lectures/${lectureId}/favorite`
    )
    return res.data
  },

  async getUserFavorites(): Promise<number[]> {
    const res = await axios.get<number[]>(`${API_BASE}/api/user/favorites`)
    return res.data
  },

  // Лекции
  async getLectures(categoryId?: number, onlyFavorites?: boolean): Promise<Lecture[]> {
    const params: Record<string, string | number | boolean> = {}
    if (categoryId !== undefined) params.category_id = categoryId
    if (onlyFavorites) params.only_favorites = true

    const res = await axios.get<Lecture[]>(`${API_BASE}/api/lectures`, { params })
    return res.data
  },

  async getLecture(id: number): Promise<Lecture> {
    const res = await axios.get<Lecture>(`${API_BASE}/api/lectures/${id}`)
    return res.data
  },

  async uploadLecture(
    file: File,
    title?: string,
    categoryId?: number,
    onProgress?: (percent: number) => void
  ): Promise<Lecture> {
    const formData = new FormData()
    formData.append("file", file)
    if (title && title.trim()) {
      formData.append("title", title.trim())
    }
    if (categoryId !== undefined) {
      formData.append("category_id", String(categoryId))
    }

    const res = await axios.post<Lecture>(
      `${API_BASE}/api/lectures/upload`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            )
            onProgress(percent)
          }
        },
      }
    )
    return res.data
  },

  async importLectureUrl(url: string, title?: string, categoryId?: number): Promise<Lecture> {
    const res = await axios.post<Lecture>(
      `${API_BASE}/api/lectures/import-url`,
      {
        url: url.trim(),
        title: title?.trim() || undefined,
        category_id: categoryId,
      }
    )
    return res.data
  },

  async deleteLecture(id: number): Promise<void> {
    await axios.delete(`${API_BASE}/api/lectures/${id}`)
  },

  async updateLecture(
    id: number,
    payload: { title?: string; category_id?: number | null }
  ): Promise<Lecture> {
    const res = await axios.patch<Lecture>(`${API_BASE}/api/lectures/${id}`, payload)
    return res.data
  },

  async retryLecture(id: number): Promise<Lecture> {
    const res = await axios.post<Lecture>(`${API_BASE}/api/lectures/${id}/retry`)
    return res.data
  },

  async search(
    query: string,
    lectureId?: number,
    limit: number = 10
  ): Promise<SearchResultItem[]> {
    const params: Record<string, string | number> = {
      q: query,
      limit,
    }
    if (lectureId !== undefined) {
      params.lecture_id = lectureId
    }

    const res = await axios.get<SearchResultItem[]>(`${API_BASE}/api/search`, {
      params,
    })
    return res.data
  },

  async askQuestion(
    lectureId: number,
    question: string
  ): Promise<AskQuestionResponse> {
    const res = await axios.post<AskQuestionResponse>(
      `${API_BASE}/api/lectures/${lectureId}/ask`,
      { question }
    )
    return res.data
  },

  async getSystemStatus(): Promise<SystemStatus> {
    const res = await axios.get<SystemStatus>(`${API_BASE}/api/system/status`)
    return res.data
  },

  getStreamUrl(lectureId: number): string {
    return `${API_BASE}/api/lectures/${lectureId}/stream`
  },

  getThumbnailUrl(lectureId: number): string {
    return `${API_BASE}/api/lectures/${lectureId}/thumbnail`
  },

  async getLectureQuiz(lectureId: number, regenerate: boolean = false): Promise<LectureQuiz> {
    const res = await axios.get<LectureQuiz>(`${API_BASE}/api/lectures/${lectureId}/quiz`, {
      params: regenerate ? { regenerate: true } : {},
    })
    return res.data
  },

  // Заметки на таймкодах
  async getNotes(lectureId: number): Promise<LectureNote[]> {
    const res = await axios.get<LectureNote[]>(`${API_BASE}/api/lectures/${lectureId}/notes`)
    return res.data
  },

  async createNote(lectureId: number, timecode: number, text: string): Promise<LectureNote> {
    const res = await axios.post<LectureNote>(`${API_BASE}/api/lectures/${lectureId}/notes`, {
      timecode,
      text,
    })
    return res.data
  },

  async updateNote(lectureId: number, noteId: number, text: string): Promise<LectureNote> {
    const res = await axios.put<LectureNote>(`${API_BASE}/api/lectures/${lectureId}/notes/${noteId}`, {
      text,
    })
    return res.data
  },

  async deleteNote(lectureId: number, noteId: number): Promise<void> {
    await axios.delete(`${API_BASE}/api/lectures/${lectureId}/notes/${noteId}`)
  },
}
