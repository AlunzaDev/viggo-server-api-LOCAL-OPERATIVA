-- Each new parking rate version reaches the cloud through the outbox (ADMINISTRATIVO keeps a read-only copy).
CREATE TRIGGER parking_rates_outbox AFTER INSERT OR UPDATE ON "parking_rates"
  FOR EACH ROW EXECUTE FUNCTION outbox_capture('parking_rate');
