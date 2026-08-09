-- Migration: enhance S-Curve baseline model
-- Adds reason, createdById to ProjectBaseline
-- Adds plannedStart, budgetedCost to BaselineSnap

ALTER TABLE "ProjectBaseline" ADD COLUMN "reason" TEXT;
ALTER TABLE "ProjectBaseline" ADD COLUMN "createdById" TEXT;

ALTER TABLE "BaselineSnap" ADD COLUMN "plannedStart" DATETIME;
ALTER TABLE "BaselineSnap" ADD COLUMN "budgetedCost" REAL;
