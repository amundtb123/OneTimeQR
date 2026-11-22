import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { getDrawBoard, type DrawBoard as Board } from '../../utils/api-client';
import { ticketUrl } from '../../utils/create-draw';

const POLL_MS = 2500;
const POLL_QUEUE_MS = 1200; // A screen handing out tickets shows the next one quickly
const CELEBRATE_MS = 6000;

interface DrawBoardProps {
  drawId: string;
  displayToken?: string; // From the screen link; without it the owner's login is used
  ticketKey?: string; // With it the screen hands out the tickets itself, one QR code at a time
}

// The screen of a draw, for a TV or a projector. It never shows which tickets won, only how many
// are taken, plus a moment of celebration when a prize is found. With the tickets' key it hands
// out the tickets itself: one big QR code, and the next as soon as it is scanned.
export function DrawBoard({ drawId, displayToken, ticketKey }: DrawBoardProps) {
  const { t, i18n } = useTranslation();
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const seen = useRef<Set<number> | null>(null); // Tickets already counted, so only new prizes are celebrated

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
            setCelebrate(next.prizes[prize]?.label || t('lag.draw.board.prize'));
          }
          seen.current.add(number);
        }
        setBoard(next);
        setFailed(false);
      } catch (error: any) {
        if (!cancelled && error?.status === 404) setFailed(true);
      } finally {
        if (!cancelled) timer = setTimeout(load, ticketKey ? POLL_QUEUE_MS : POLL_MS);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [drawId, displayToken, ticketKey]);

  // The QR code of the next ticket, drawn here: its key never leaves this screen
  const nextId = board?.next?.id;
  useEffect(() => {
    if (!ticketKey || !nextId) {
      setQr(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(ticketUrl(nextId, ticketKey), { width: 900, margin: 1, errorCorrectionLevel: 'M' })
      .then((src) => { if (!cancelled) setQr(src); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ticketKey, nextId]);

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

  const fmt = (n: number) => n.toLocaleString(i18n.language);
  const taken = board.opened.length;
  const totalPrizes = board.prizes.reduce((sum, p) => sum + p.count, 0);
  const prizesLeft = totalPrizes - board.opened.filter(([, prize]) => prize !== null).length;
  const prizeLine = prizesLeft > 0 ? t('lag.draw.board.prizesLeft', { count: prizesLeft }) : t('lag.draw.board.noPrizesLeft');

  return (
    <main className="lg-board">
      <header className="lg-board-head">
        <div className="lg-stack" style={{ gap: 6 }}>
          <span className="lg-board-eyebrow">{t('lag.templates.draw.name')}</span>
          <h1 className="lg-board-title">{board.title || t('keyring.series.drawUntitled')}</h1>
        </div>
        <button
          type="button"
          className="lg-board-full"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
        >
          {t('lag.draw.board.fullscreen')}
        </button>
      </header>

      {ticketKey ? (
        <div className="lg-board-queue">
          {board.next ? (
            <figure className="lg-board-qr">
              {qr ? <img key={board.next.id} src={qr} alt={t('lag.draw.board.scanToTake', { number: board.next.number })} /> : <div className="lg-board-qr-blank" />}
              <figcaption>{t('lag.draw.board.scanToTake', { number: board.next.number })}</figcaption>
            </figure>
          ) : (
            <p className="lg-board-done">{t('lag.draw.board.allTaken')}</p>
          )}
          <div className="lg-board-tally">
            <strong>{fmt(taken)}</strong>
            <span>{t('lag.draw.board.taken', { count: fmt(board.codeCount) })}</span>
            <span className="lg-board-prizesleft">{prizeLine}</span>
          </div>
        </div>
      ) : (
        <div className="lg-board-count">
          <strong>{fmt(taken)}</strong>
          <span>{t('lag.draw.board.taken', { count: fmt(board.codeCount) })}</span>
          <div className="lg-board-bar" aria-hidden="true">
            <span style={{ width: `${board.codeCount ? (taken / board.codeCount) * 100 : 0}%` }} />
          </div>
          <span className="lg-board-prizesleft">{prizeLine}</span>
        </div>
      )}

      {celebrate && (
        <div className="lg-board-celebrate" role="status" aria-live="assertive">
          <div>
            <span className="lg-board-celebrate-star" aria-hidden="true">★</span>
            <strong>{celebrate}</strong>
          </div>
        </div>
      )}
    </main>
  );
}
