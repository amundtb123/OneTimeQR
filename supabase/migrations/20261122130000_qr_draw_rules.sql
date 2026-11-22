-- Draws: rules for who may take tickets, and rounds.
--
-- Per person: at most N tickets, and/or a wait between one person's tickets. A "person" is a
-- phone: the app gives it a random id the first time it scans, and the server only ever sees
-- that id hashed together with the draw, so the same phone can't be followed from one draw to
-- the next. No name, no IP, nothing personal. The limits count per round.
--
-- Rounds: a draw can have several rounds, each a fresh set of tickets with the same prizes.
-- Round 1 starts at first_round_at (or when the draw is made). The next round starts as soon as
-- every ticket in the current one is taken, or at its scheduled time (first_round_at + n ×
-- round_interval_ms) if that comes first. Tickets of a round that has ended can't be opened.
--
-- Ordinary drops and series are not affected. Everything goes with its draw. Safe to re-run.

ALTER TABLE public.qr_series ADD COLUMN IF NOT EXISTS max_per_person integer CHECK (max_per_person > 0);
-- How long a person must wait after taking a ticket before taking the next
ALTER TABLE public.qr_series ADD COLUMN IF NOT EXISTS cooldown_ms bigint CHECK (cooldown_ms > 0);
ALTER TABLE public.qr_series ADD COLUMN IF NOT EXISTS rounds integer NOT NULL DEFAULT 1 CHECK (rounds > 0);
ALTER TABLE public.qr_series ADD COLUMN IF NOT EXISTS round_interval_ms bigint CHECK (round_interval_ms > 0);
ALTER TABLE public.qr_series ADD COLUMN IF NOT EXISTS first_round_at timestamptz;

-- A ticket's round; its series_number counts from 1 within the round
ALTER TABLE public.qr_drops ADD COLUMN IF NOT EXISTS round integer NOT NULL DEFAULT 1 CHECK (round > 0);
CREATE INDEX IF NOT EXISTS qr_drops_series_round_idx ON public.qr_drops (series_id, round) WHERE series_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.qr_draw_participants (
  series_id uuid NOT NULL REFERENCES public.qr_series(id) ON DELETE CASCADE,
  participant_hash text NOT NULL,
  round integer NOT NULL DEFAULT 1,
  opened integer NOT NULL DEFAULT 0 CHECK (opened >= 0),
  last_opened_at timestamptz,
  PRIMARY KEY (series_id, participant_hash, round)
);

ALTER TABLE public.qr_draw_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qr_draw_participants FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.qr_draw_participants TO service_role;

-- Where a draw is: { "round": the running round (0 = not started yet), "rounds": how many,
-- "started_at": when it started, "next_at": when the next starts at the latest (null = only when
-- every ticket is taken, or no more rounds) }. Times in epoch ms.
CREATE OR REPLACE FUNCTION public.qr_draw_round(p_series_id uuid, p_now bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := to_timestamp(p_now / 1000.0);
  v_rounds integer;
  v_interval interval;
  v_first timestamptz;
  v_start timestamptz;
  v_round integer := 1;
  v_scheduled timestamptz;
  v_free integer;
  v_last timestamptz;
  v_next timestamptz;
BEGIN
  SELECT rounds, round_interval_ms * interval '1 millisecond', coalesce(first_round_at, created_at)
    INTO v_rounds, v_interval, v_first
    FROM qr_series WHERE id = p_series_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_first > v_now THEN
    RETURN jsonb_build_object('round', 0, 'rounds', v_rounds, 'started_at', NULL,
      'next_at', floor(extract(epoch FROM v_first) * 1000)::bigint);
  END IF;

  v_start := v_first;
  LOOP
    v_scheduled := CASE WHEN v_interval IS NOT NULL AND v_round < v_rounds THEN v_first + v_round * v_interval END;
    IF v_round >= v_rounds THEN
      v_next := NULL;
    ELSE
      -- Sold out: every ticket of this round taken; the next starts when the last one was
      SELECT count(*) FILTER (WHERE scan_count = 0), max(last_opened_at) INTO v_free, v_last
        FROM qr_drops WHERE series_id = p_series_id AND round = v_round;
      v_next := least(v_scheduled, CASE WHEN v_free = 0 THEN greatest(v_last, v_start) END);
    END IF;
    IF v_next IS NULL OR v_next > v_now THEN
      RETURN jsonb_build_object('round', v_round, 'rounds', v_rounds,
        'started_at', floor(extract(epoch FROM v_start) * 1000)::bigint,
        'next_at', CASE WHEN v_scheduled IS NOT NULL THEN floor(extract(epoch FROM v_scheduled) * 1000)::bigint END);
    END IF;
    v_start := greatest(v_start, v_next);
    v_round := v_round + 1;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.qr_draw_round(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_draw_round(uuid, bigint) TO service_role;

-- Opens a draw's ticket for one person, all or nothing. Refuses a ticket whose round isn't
-- running ({ "round_not_started": n, "starts_at": ms|null } or { "round_over": n }), and a person
-- who has as many tickets as the round allows ({ "limit": max }) or took one too recently
-- ({ "wait_until": ms }). Otherwise counts the scan (same rules as qr_drop_consume) and the
-- person's ticket together. Returns the updated ticket, or NULL when it can't be opened.
CREATE OR REPLACE FUNCTION public.qr_draw_open(p_id uuid, p_participant_hash text, p_now bigint)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_series uuid;
  v_ticket_round integer;
  v_max integer;
  v_cooldown bigint;
  v_state jsonb;
  v_current integer;
  v_opened integer;
  v_last timestamptz;
  v_now timestamptz := to_timestamp(p_now / 1000.0);
  v_row jsonb;
BEGIN
  SELECT d.series_id, d.round, s.max_per_person, s.cooldown_ms INTO v_series, v_ticket_round, v_max, v_cooldown
    FROM qr_drops d JOIN qr_series s ON s.id = d.series_id
   WHERE d.id = p_id AND s.kind = 'draw';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- One round at a time. Serialised per draw, so the round can't move on under our feet.
  PERFORM 1 FROM qr_series WHERE id = v_series FOR UPDATE;
  v_state := qr_draw_round(v_series, p_now);
  v_current := (v_state->>'round')::integer;
  IF v_ticket_round > v_current THEN
    RETURN jsonb_build_object('round_not_started', v_ticket_round,
      'starts_at', CASE WHEN v_ticket_round = v_current + 1 THEN v_state->'next_at' END);
  END IF;
  IF v_ticket_round < v_current THEN
    RETURN jsonb_build_object('round_over', v_ticket_round);
  END IF;

  IF v_max IS NOT NULL OR v_cooldown IS NOT NULL THEN
    INSERT INTO qr_draw_participants (series_id, participant_hash, round) VALUES (v_series, p_participant_hash, v_ticket_round)
      ON CONFLICT (series_id, participant_hash, round) DO NOTHING;
    -- Locked, so two tickets scanned at once by the same phone are counted one after the other
    SELECT opened, last_opened_at INTO v_opened, v_last FROM qr_draw_participants
     WHERE series_id = v_series AND participant_hash = p_participant_hash AND round = v_ticket_round
       FOR UPDATE;
    IF v_max IS NOT NULL AND v_opened >= v_max THEN
      RETURN jsonb_build_object('limit', v_max);
    END IF;
    IF v_cooldown IS NOT NULL AND v_last IS NOT NULL AND v_last + v_cooldown * interval '1 millisecond' > v_now THEN
      RETURN jsonb_build_object('wait_until', floor(extract(epoch FROM v_last + v_cooldown * interval '1 millisecond') * 1000)::bigint);
    END IF;
  END IF;

  v_row := qr_drop_consume(p_id, 'scan', p_now);
  IF v_row IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_max IS NOT NULL OR v_cooldown IS NOT NULL THEN
    UPDATE qr_draw_participants SET opened = opened + 1, last_opened_at = v_now
     WHERE series_id = v_series AND participant_hash = p_participant_hash AND round = v_ticket_round;
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.qr_draw_open(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_draw_open(uuid, text, bigint) TO service_role;

-- The board of a draw, now for one round: every opened ticket of it as [number, variant].
-- Replaces the one-argument version, so a call with only the draw can't be ambiguous.
DROP FUNCTION IF EXISTS public.qr_draw_board(uuid);
CREATE OR REPLACE FUNCTION public.qr_draw_board(p_series_id uuid, p_round integer DEFAULT 1)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_array(d.series_number, d.variant) ORDER BY d.last_opened_at, d.series_number), '[]'::jsonb)
    FROM qr_drops d
   WHERE d.series_id = p_series_id
     AND d.round = p_round
     AND d.variant IS NOT NULL
     AND d.scan_count > 0;
$$;
REVOKE ALL ON FUNCTION public.qr_draw_board(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_draw_board(uuid, integer) TO service_role;

-- How many of a series' codes have been opened, now counting every round's tickets
CREATE OR REPLACE FUNCTION public.qr_series_opened(p_series_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(jsonb_object_agg(id, opened), '{}'::jsonb)
    FROM (
      SELECT s.id, s.code_count * s.rounds - count(d.id) FILTER (WHERE d.scan_count = 0) AS opened
        FROM qr_series s
        LEFT JOIN qr_drops d ON d.series_id = s.id
       WHERE s.id = ANY (p_series_ids)
       GROUP BY s.id, s.code_count, s.rounds
    ) counts;
$$;
REVOKE ALL ON FUNCTION public.qr_series_opened(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_series_opened(uuid[]) TO service_role;
