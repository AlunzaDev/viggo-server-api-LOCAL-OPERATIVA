-- Occupancy screen (#22): exits of a period and tickets still inside.
-- CreateIndex
CREATE INDEX "tickets_proyecto_id_hora_salida_idx" ON "tickets"("proyecto_id", "hora_salida");

-- CreateIndex
CREATE INDEX "tickets_open_idx" ON "tickets"("proyecto_id", "hora_inicio") WHERE (hora_salida IS NULL);

