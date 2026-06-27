export type KOSlideType =
  | "cover"
  | "agenda"
  | "objectives"
  | "about"
  | "methodology"
  | "team"
  | "scope"
  | "eap"
  | "timeline"
  | "financial"
  | "risks"
  | "success"
  | "contacts"
  | "closing"
  | "content"
  | "bullets"

export type KOTimelineItem  = { date: string; label: string; done?: boolean }
export type KOFinancialCard = { label: string; value: string; color: string }
export type KOTeamMember    = { name: string; role: string; department?: string | null; initials: string }
export type KORisk          = { description: string; level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; mitigation?: string }
export type KOEapArea       = { name: string; color: string; tasks: string[] }
export type KOSuccessFactor = { category: string; description: string }
export type KOContact       = { name: string; role: string; email?: string; phone?: string }
export type KOAgendaItem    = { icon: string; label: string; description?: string }

export type KOSlide = {
  id:              string
  type:            KOSlideType
  title:           string
  subtitle?:       string
  content?:        string
  bullets?:        string[]
  imageUrl?:       string
  agendaItems?:    KOAgendaItem[]
  timelineItems?:  KOTimelineItem[]
  financialCards?: KOFinancialCard[]
  teamMembers?:    KOTeamMember[]
  risks?:          KORisk[]
  eapAreas?:       KOEapArea[]
  successFactors?: KOSuccessFactor[]
  contacts?:       KOContact[]
  splitLeft?:      string
  splitRight?:     string
  accent?:         string
  notes?:          string
}

export type KOPresentation = {
  id?:        string
  projectId:  string
  title:      string
  slides:     KOSlide[]
  createdAt?: string
  updatedAt?: string
}
