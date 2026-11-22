import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDrawBoard, type DrawBoard as Board } from '../../utils/api-client';

const POLL_MS = 2500;
const CELEBRATE_MS = 6000;

interface DrawBoardProps {
  drawId: string;
  displayToken?: string; // From the screen link; without it the owner's login is used
}

// The board of a draw, for a TV or a projector: every ticket, lit up as it is scanned, and a
// moment of celebration when a prize is found. It only ever learns a ticket's prize once the
// ticket has been opened.
export function DrawBoard({ drawId, displayToken }: DrawBoardProps) {
  const { t, i18n } = useTranslation();
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [celebrate, setCelebrate] = useState<{ number: number; label: string } | null>(null);
  const seen = useRef<Set<number> | null>(null); // Tickets already shown, so only new prizes are celebrated

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await getDrawBoard(drawId, displayToken);
        if (cancelled) return;
        const first = seen.current === null;
        seen.current ??= new Set();
        for (const [number, prize] of next.opened) {
          if (!seen.current.has(number) && prize !== null && !first) {
            setCelebrate({ number, label: next.prizes[prize]?.label || t('lag.draw.board.prize') });
          }
          seen.current.add(number);
        }
        setBoard(next);
        setFailed(false);
      } catch (error: any) {
        if (!cancelled && (error?.status === 404 || !board)) setFailed(true);
      } finally {
        if (!cancelled) timer = setTimeout(load, POLL_MS);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [drawId, displayToken]);

  useEffect(() => {
    if (!celebrate) return;
    const timer = setTimeout(() => setCelebrate(null), CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [celebrate]);

  if (failed && !board) {
    return <main className="lg-board lg-board-empty"><p>{t('lag.draw.board.notFound')}</p></main>;
  }
  if (!board) {
    return <main className="lg-board lg-board-empty"><p>{t('lag.draw.board.loading')}</p></main>;
  }

  const opened = new Map(board.opened);
  const winners = board.opened.filter(([, prize]) => prize !== null);
  const totalPrizes = board.prizes.reduce((sum, p) => sum + p.count, 0);
  const latest = winners[winners.length - 1];
  const fmt = (n: number) => n.toLocaleString(i18n.language);
  // Fewer tickets get bigger squares; a few hundred still fit on one screen
  const cell = board.codeCount <= 30 ? 120 : board.codeCount <= 100 ? 76 : board.codeCount <= 300 ? 48 : 30;

  return (
    <main className="lg-board">
      <header className="lg-board-head">
        <div className="lg-stack" style={{ gap: 6 }}>
          <span className="lg-board-eyebrow">{t('lag.templates.draw.name')}</span>
          <h1 className="lg-board-title">{board.title || t('keyring.series.drawUntitled')}</h1>
        </div>
        <div className="lg-board-stats">
          <strong>{winners.length === totalPrizes ? t('lag.draw.board.allFound') : t('lag.draw.board.found', { found: winners.length, total: totalPrizes })}</strong>
          <span>{t('lag.draw.board.scanned', { opened: fmt(board.opened.length), count: fmt(board.codeCount) })}</span>
          <button
            type="button"
            className="lg-board-full"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
          >
            {t('lag.draw.board.fullscreen')}
          </button>
        </div>
      </header>

      <div className="lg-board-body">
        <ol className="lg-board-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cell}px, 1fr))` }} aria-label={t('lag.draw.board.scanned', { opened: fmt(board.opened.length), count: fmt(board.codeCount) })}>
          {Array.from({ length: board.codeCount }, (_, i) => {
            const number = i + 1;
            const state = !opened.has(number) ? '' : opened.get(number) === null ? ' is-open' : ' is-win';
            return (
              <li key={number} className={`lg-board-cell${state}`} style={{ fontSize: Math.max(10, cell / 4) }}>
                {cell >= 48 ? number : ''}
                {state === ' is-win' && cell >= 76 && <span className="lg-board-star" aria-hidden="true">★</span>}
              </li>
            );
          })}
        </ol>

        <aside className="lg-board-side">
          <section>
            <h2>{t('lag.draw.board.latest')}</h2>
            {latest ? (
              <p className="lg-board-latest">
                <span>{t('lag.draw.scan.ticket', { number: latest[0] })}</span>
                <strong>{board.prizes[latest[1]!]?.label || t('lag.draw.board.prize')}</strong>
              </p>
            ) : (
              <p className="lg-board-wait">{t('lag.draw.board.noWinnerYet')}</p>
            )}
          </section>
          <section>
            <h2>{t('lag.draw.prizes')}</h2>
            <ul className="lg-board-prizes">
              {board.prizes.map((prize, i) => {
                const found = winners.filter(([, p]) => p === i).length;
                return (
                  <li key={i} className={found === prize.count ? 'is-done' : ''}>
                    <span>{prize.label || `${t('lag.draw.board.prize')} ${i + 1}`}</span>
                    <span>{found}/{prize.count}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>

      {celebrate && (
        <div className="lg-board-celebrate" role="status" aria-live="assertive">
          <div>
            <span className="lg-board-celebrate-star" aria-hidden="true">★</span>
            <strong>{celebrate.label}</strong>
            <span>{t('lag.draw.scan.ticket', { number: celebrate.number })}</span>
          </div>
        </div>
      )}
    </main>
  );
}
