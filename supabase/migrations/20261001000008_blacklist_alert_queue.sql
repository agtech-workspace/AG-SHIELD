-- Batch alerts queue (decoupled from bulk ingest)
CREATE TABLE IF NOT EXISTS public.blacklist_alert_queue (
  id SERIAL PRIMARY KEY,
  blacklist_id UUID NOT NULL REFERENCES public.registry_blacklist(id) ON DELETE CASCADE,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blacklist_alert_queue_unprocessed ON public.blacklist_alert_queue (created_at) WHERE processed = FALSE;

-- Function to enqueue alerts for a new blacklist row
CREATE OR REPLACE FUNCTION public.enqueue_blacklist_alert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.blacklist_alert_queue (blacklist_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on registry_blacklist insert (non-blocking; processing is batch)
DROP TRIGGER IF EXISTS trg_enqueue_blacklist_alert ON public.registry_blacklist;
CREATE TRIGGER trg_enqueue_blacklist_alert
  AFTER INSERT ON public.registry_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_blacklist_alert();

-- Processor: enqueue into notifications scoped to affected user_checks
CREATE OR REPLACE FUNCTION public.process_blacklist_alert_queue(batch_size INT DEFAULT 100)
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  q_id INT;
  q_bid UUID;
  q_entity TEXT;
  q_reason TEXT;
BEGIN
  FOR q_id, q_bid IN
    SELECT id, blacklist_id
    FROM public.blacklist_alert_queue
    WHERE processed = FALSE
    ORDER BY created_at
    LIMIT batch_size
  LOOP
    SELECT entity_name, reason_flagged
    INTO q_entity, q_reason
    FROM public.registry_blacklist
    WHERE id = q_bid;

    -- Insert notifications for users who checked this account (scoped)
    INSERT INTO public.notifications (user_id, device_id, title, body, type, data, is_read, created_at)
    SELECT DISTINCT uc.user_id,
           uc.device_id,
           'High-Risk Security Alert',
           'Entity "' || COALESCE(q_entity,'') || '" has been flagged. ' || COALESCE(left(q_reason,120),''),
           'alert',
           jsonb_build_object('blacklist_id', q_bid, 'account_number', uc.account_number, 'bank_name', uc.bank_name),
           FALSE,
           NOW()
    FROM public.user_checks uc
    WHERE uc.user_id IS NOT NULL
      AND uc.account_number IS NOT NULL
      AND uc.created_at >= NOW() - INTERVAL '30 days';

    UPDATE public.blacklist_alert_queue
    SET processed = TRUE, processed_at = NOW()
    WHERE id = q_id;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
