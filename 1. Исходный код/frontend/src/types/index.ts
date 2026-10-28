export type LectureStatus =
  | "uploading"
  | "extracting_audio"
  | "transcribing"
  | "indexing"
  | "summarizing"
  | "ready"
  | "error"

export interface User {
  id: number
  email: string
  full_name: string
  avatar_color?: string
  created_at: string
}

export interface Category {
  id: number
  name: string
  color: string
  created_at: string
  lectures_count?: number
}

export interface TranscriptSegment {
  id?: number
  lecture_id: number
  start_time: number
  end_time: number
  text: string
}

export interface SearchChunk {
  id?: number
  lecture_id: number
  start_time: number
  end_time: number
  text: string
  embedding_json?: string
}

export interface LectureChapter {
  id?: number
  lecture_id: number
  title: string
  start_time: number
  summary: string
}

export interface GlossaryTerm {
  id?: number
  lecture_id: number
  term: string
  definition: string
  first_timecode: number
}

export interface Lecture {
  id: number
  title: string
  source_type: "file" | "url"
  source_url?: string | null
  video_path?: string | null
  audio_path?: string | null
  thumbnail_path?: string | null
  duration: number
  status: LectureStatus
  error_message?: string | null
  summary_markdown?: string | null
  category_id?: number | null
  category?: Category | null
  is_favorite?: boolean
  created_at: string
  segments?: TranscriptSegment[]
  chapters?: LectureChapter[]
  glossary_terms?: GlossaryTerm[]
}

export interface SearchResultItem {
  chunk_id: number
  lecture_id: number
  lecture_title: string
  start_time: number
  end_time: number
  text: string
  score: number
}

export interface SystemStatus {
  status: string
  gpu: {
    available: boolean
    name: string
    device: string
    compute_type: string
  }
  whisper: {
    model: string
    loaded: boolean
  }
  embeddings: {
    model: string
    loaded: boolean
  }
  ollama: {
    online: boolean
    active_model: string | null
    available_models: string[]
  }
}

export interface AskQuestionResponse {
  answer: string
  sources: Array<{
    timecode: number
    text: string
    score?: number
  }>
}

export interface QuizOption {
  id: string
  text: string
}

export interface QuizQuestion {
  id: number
  question: string
  options: QuizOption[]
  correct_option_id: string
  explanation: string
  timecode: number
}

export interface LectureQuiz {
  lecture_id: number
  lecture_title: string
  total_questions: number
  questions: QuizQuestion[]
}

export interface LectureNote {
  id: number
  lecture_id: number
  user_id?: number | null
  timecode: number
  text: string
  created_at: string
}
