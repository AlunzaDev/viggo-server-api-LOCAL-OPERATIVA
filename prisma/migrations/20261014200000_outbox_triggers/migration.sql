-- DropIndex
DROP INDEX "outbox_events_pending_idx";

-- AlterTable
ALTER TABLE "outbox_events" ADD COLUMN     "position" BIGSERIAL NOT NULL,
ALTER COLUMN "event_id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "occurred_at" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_position_key" ON "outbox_events"("position");

-- CreateIndex
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events"("position") WHERE (sent_at IS NULL);

-- Outbox capture -----------------------------------------------------------------
-- Every insert/update of the local operation tables records an event in the same
-- transaction, so what happens offline is never lost and reaches the cloud later.
-- TG_ARGV[0] is the aggregate type sent to the cloud.
CREATE OR REPLACE FUNCTION outbox_capture() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN
    RETURN NULL;
  END IF;

  INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload, occurred_at)
  VALUES (
    TG_ARGV[0] || CASE TG_OP WHEN 'INSERT' THEN '.created' ELSE '.updated' END,
    TG_ARGV[0],
    NEW.id::text,
    to_jsonb(NEW),
    clock_timestamp()
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER tickets_outbox AFTER INSERT OR UPDATE ON "tickets"
  FOR EACH ROW EXECUTE FUNCTION outbox_capture('ticket');
CREATE TRIGGER payments_outbox AFTER INSERT OR UPDATE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION outbox_capture('payment');
CREATE TRIGGER cash_payment_sessions_outbox AFTER INSERT OR UPDATE ON "cash_payment_sessions"
  FOR EACH ROW EXECUTE FUNCTION outbox_capture('cash_payment_session');
CREATE TRIGGER cash_register_shifts_outbox AFTER INSERT OR UPDATE ON "cash_register_shifts"
  FOR EACH ROW EXECUTE FUNCTION outbox_capture('cash_register_shift');
CREATE TRIGGER cash_register_movements_outbox AFTER INSERT OR UPDATE ON "cash_register_movements"
  FOR EACH ROW EXECUTE FUNCTION outbox_capture('cash_register_movement');
CREATE TRIGGER cash_register_cuts_outbox AFTER INSERT OR UPDATE ON "cash_register_cuts"
  FOR EACH ROW EXECUTE FUNCTION outbox_capture('cash_register_cut');
CREATE TRIGGER pension_moves_outbox AFTER INSERT OR UPDATE ON "pension_moves"
  FOR EACH ROW EXECUTE FUNCTION outbox_capture('pension_move');
