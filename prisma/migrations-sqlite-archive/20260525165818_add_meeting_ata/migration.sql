-- Add meetingId column to ProjectDocument for linking ATAs to meetings
ALTER TABLE "ProjectDocument" ADD COLUMN "meetingId" TEXT;

-- Note: MEETING_ATA enum value requires no SQL change (SQLite stores enums as TEXT strings)
