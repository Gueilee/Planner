"use client"

import { useState } from "react"
import { LayoutGrid } from "lucide-react"
import { ProjectTasksKanban } from "@/app/(dashboard)/kanban/project-tasks-kanban"

interface ProjectKanbanButtonProps {
  projectId:    string
  projectTitle: string
}

export function ProjectKanbanButton({ projectId, projectTitle }: ProjectKanbanButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 h-9 text-sm font-semibold rounded-xl text-white transition-all hover:opacity-90 active:scale-[0.98]"
        style={{ background: "linear-gradient(135deg, #DB2777, #EC4899)", boxShadow: "0 4px 20px rgba(219,39,119,0.30)" }}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Kanban
      </button>

      {open && (
        <ProjectTasksKanban
          project={{ id: projectId, title: projectTitle }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
