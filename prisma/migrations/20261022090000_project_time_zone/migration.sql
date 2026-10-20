-- Time zone of the parking, received from ADMINISTRATIVO with the project.
-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "zona_horaria" TEXT NOT NULL DEFAULT 'America/Mexico_City';

