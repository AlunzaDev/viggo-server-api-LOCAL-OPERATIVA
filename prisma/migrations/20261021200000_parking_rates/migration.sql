-- Parking rate per project, owned by OPERATIVO: each change is a new immutable version.
-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "tarifa_version" INTEGER;

-- CreateTable
CREATE TABLE "parking_rates" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "tolerance_minutes" INTEGER NOT NULL,
    "first_block_minutes" INTEGER NOT NULL,
    "first_block_price" DECIMAL(12,2) NOT NULL,
    "fraction_minutes" INTEGER NOT NULL,
    "fraction_price" DECIMAL(12,2) NOT NULL,
    "daily_max" DECIMAL(12,2),
    "created_by" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parking_rates_proyecto_id_version_key" ON "parking_rates"("proyecto_id", "version");

-- AddForeignKey
ALTER TABLE "parking_rates" ADD CONSTRAINT "parking_rates_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The rules the API validates, also enforced by the database.
ALTER TABLE "parking_rates" ADD CONSTRAINT "parking_rates_rules_check" CHECK (
  "version" >= 1
  AND "tolerance_minutes" BETWEEN 0 AND 1440 AND "tolerance_minutes" < "first_block_minutes"
  AND "first_block_minutes" BETWEEN 1 AND 1440 AND "fraction_minutes" BETWEEN 1 AND 1440
  AND "first_block_price" > 0 AND "fraction_price" >= 0
  AND ("daily_max" IS NULL OR "daily_max" >= "first_block_price")
);
