-- DropIndex
DROP INDEX "tickets_active_usuario_key";

-- CreateIndex
CREATE UNIQUE INDEX "tickets_active_usuario_key" ON "tickets"("usuario_id") WHERE (hora_salida IS NULL);
