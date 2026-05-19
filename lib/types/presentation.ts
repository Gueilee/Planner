export type SlideType =
  | "cover"
  | "content"
  | "bullets"
  | "image"
  | "data-table"
  | "quote"
  | "timeline"
  | "financial"
  | "team"
  | "split"
  | "closing"

export type TableData = {
  headers: string[]
  rows: (string | number | null)[][]
  sheetName?: string
}

export type TimelineItem = {
  date: string
  label: string
  done?: boolean
}

export type FinancialCard = {
  label: string
  value: string
  color: string
}

export type TeamMember = {
  name: string
  role: string
  department?: string | null
  initials: string
}

export type Slide = {
  id: string
  type: SlideType
  title: string
  subtitle?: string
  content?: string
  bullets?: string[]
  imageUrl?: string
  imageCaption?: string
  tableData?: TableData
  timelineItems?: TimelineItem[]
  financialCards?: FinancialCard[]
  teamMembers?: TeamMember[]
  splitLeft?: string
  splitRight?: string
  accent?: string
  notes?: string
}

export type PresentationTheme = "dark" | "slate" | "corporate"

export type Presentation = {
  id?: string
  projectId: string
  title: string
  subtitle?: string
  theme: PresentationTheme
  slides: Slide[]
  createdAt?: string
  updatedAt?: string
}
