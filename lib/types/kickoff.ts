export type EAPTask = {
  id: string
  text: string
}

export type EAPArea = {
  id: string
  name: string
  color: string
  tasks: EAPTask[]
}

export type Milestone = {
  id: string
  label: string
  date: string
  description?: string
  status: "PLANNED" | "DONE"
}

export type KickOffAttachment = {
  id: string
  name: string
  url: string
  fileType: string
  size?: number
}

export type ExternalAttendee = {
  id:   string
  name: string
  role: string
}

export type KickOffData = {
  id?: string
  projectId: string
  meetingDate: string
  location: string
  objectives: string
  eapAreas: EAPArea[]
  milestones: Milestone[]
  attachments: KickOffAttachment[]
  attendeeIds: string[]
  externalAttendees: ExternalAttendee[]
  notes: string
  registeredAt?: string
}
