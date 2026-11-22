import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { getDrawBoard, type DrawBoard as Board } from '../../utils/api-client';
import { ticketUrl } from '../../utils/create-draw';
import { decryptFile } from '../../utils/encryption';
import { useNow } from '../../utils/time-left';

// "4:32" or "1:04:32"
function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// The tickets' key from the link (base64url) as the hex the file decryption takes
function keyHex(key: string): string {
  const bytes = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Fetches and decrypts one picture; null if it can't be shown
async function openPicture(picture: { url: string; type: string } | null, key: string): Promise<string | null> {
  if (!picture) return null;
  try {
    const res = await fetch(picture.url);
    if (!res.ok) return null;
    const decrypted = await decryptFile(await res.blob(), keyHex(key));
    return URL.createObjectURL(new Blob([decrypted], { type: picture.type }));
  } catch {
    return null;
  }
}

const POLL_MS = 2500;
const POLL_QUEUE_MS = 1200; // A screen handing out tickets shows the next one quickly
const CELEBRATE_MS = 6000;
const CELEBRATE_HANDOUT_MS = 3500;

interface DrawBoardProps {
  drawId: string;
  displayToken?: string; // From the screen link; without it the owner's login is used
  ticketKey?: string; // With it the screen hands out the tickets itself, one QR code at a time
  grid?: boolean; // With the key: every free ticket at once, in a grid
}

// Columns and size of a grid that fits n squares on the screen below the header
function gridLayout(n: number, width: number, height: number) {
  let best = { cols: 1, size: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const size = Math.floor(Math.min(width / cols, height / rows));
    if (size > best.size) best = { cols, size };
  }
  return best;
}

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

// The screen of a draw, for a TV or a projector. It never shows which tickets won, only how many
// are taken, plus a moment of celebration when a prize is found. With the tickets' key it hands
// out the tickets itself: one big QR code, and the next as soon as it is scanned.
export function DrawBoard({ drawId, displayToken, ticketKey, grid = false }: DrawBoardProps) {
  const { t, i18n } = useTranslation();
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [gridQrs, setGridQrs] = useState<Record<string, string>>({}); // Ticket id -> QR image
  // What a taken ticket held, decrypted here: the draw's own picture and each prize's (null = none)
  const [pictures, setPictures] = useState<{ base: string | null; prizes: Array<string | null> } | null>(null);
  const showGrid = grid && !!ticketKey;
  const windowSize = useWindowSize();
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null); // "round:number" of tickets already counted, so only new prizes are celebrated

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await getDrawBoard(drawId, displayToken, showGrid);
        if (cancelled) return;
        const first = seen.current === null;
        seen.current ??= new Set();
        for (const [number, prize] of next.opened) {
          const key = `${next.round ?? 1}:${number}`;
          if (!seen.current.has(key) && prize !== null && !first) {
            setCelebrate(next.prizes[prize]?.label || t('lag.draw.board.prize'));
          }
          seen.current.add(key);
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
  }, [drawId, displayToken, ticketKey, showGrid]);

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

  // The pictures, fetched once: their links are short-lived, the decrypted copies stay here
  useEffect(() => {
    if (!showGrid || !ticketKey) return;
    let cancelled = false;
    const made: string[] = [];
    getDrawBoard(drawId, displayToken, false, true)
      .then(async ({ pictures: found }) => {
        if (!found || cancelled) return;
        const [base, ...prizes] = await Promise.all([found.base, ...found.prizes].map((p) => openPicture(p, ticketKey)));
        made.push(...[base, ...prizes].filter((u): u is string => !!u));
        if (!cancelled) setPictures({ base, prizes });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      made.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [showGrid, drawId, displayToken, ticketKey]);

  // The grid's QR codes, made once per ticket and kept while it is free
  const freeIds = board?.free?.map((c) => c.id).join() ?? '';
  useEffect(() => {
    if (!showGrid || !board?.free) return;
    let cancelled = false;
    const missing = board.free.filter((c) => !gridQrs[c.id]);
    if (missing.length === 0) return;
    Promise.all(missing.map(async (c) => [c.id, await QRCode.toDataURL(ticketUrl(c.id, ticketKey!), { width: 400, margin: 1, errorCorrectionLevel: 'M' })] as const))
      .then((made) => { if (!cancelled) setGridQrs((old) => ({ ...old, ...Object.fromEntries(made) })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showGrid, freeIds]);

  const now = useNow(true); // For the countdowns to the next round

  useEffect(() => {
    if (!celebrate) return;
    // Shorter while the screen hands out tickets: the celebration covers the QR codes
    const timer = setTimeout(() => setCelebrate(null), ticketKey ? CELEBRATE_HANDOUT_MS : CELEBRATE_MS);
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
  const rounds = board.rounds ?? 1;
  const round = board.round ?? 1;
  // When the next round comes: at its time, or when every ticket is taken
  const roundLine = rounds <= 1 || round === 0 ? null
    : round >= rounds ? t('lag.draw.board.lastRound')
    : board.nextAt ? t('lag.draw.board.nextRoundIn', { time: clock(board.nextAt - now) })
    : t('lag.draw.board.nextRoundSoldOut');

  return (
    <main className="lg-board">
      <header className="lg-board-head">
        <div className="lg-stack" style={{ gap: 6 }}>
          <span className="lg-board-eyebrow">
            {t('lag.templates.draw.name')}
            {rounds > 1 && round > 0 && <> · {t('lag.draw.board.round', { round, rounds })}</>}
          </span>
          <h1 className="lg-board-title">{board.title || t('keyring.series.drawUntitled')}</h1>
        </div>
        <div className="lg-board-headright">
        {roundLine && <span className="lg-board-roundline">{roundLine}</span>}
        <button
          type="button"
          className="lg-board-full"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
        >
          {t('lag.draw.board.fullscreen')}
        </button>
        </div>
      </header>

      {round === 0 ? (
        <div className="lg-board-count">
          <span>{t('lag.draw.board.startsIn')}</span>
          <strong>{board.nextAt ? clock(board.nextAt - now) : '…'}</strong>
          <span className="lg-board-prizesleft">{t('lag.draw.board.prizesLeft', { count: totalPrizes })}</span>
        </div>
      ) : showGrid ? (
        board.free === undefined ? (
          <p className="lg-board-hint">{t('lag.draw.board.oldServer')}</p>
        ) : (
          <div className="lg-board-gridwrap">
            {(() => {
              const free = new Map(board.free.map((c) => [c.number, c.id]));
              const opened = new Map(board.opened);
              // Room left under the header and the tally line
              const { cols, size } = gridLayout(board.codeCount, windowSize.width * 0.94, windowSize.height * 0.68);
              return (
                <ol className="lg-board-tickets" style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)` }}>
                  {Array.from({ length: board.codeCount }, (_, i) => {
                    const number = i + 1;
                    const id = free.get(number);
                    if (id) {
                      return (
                        <li key={number} className="lg-board-ticket" style={{ width: size, height: size }}>
                          {gridQrs[id] ? <img src={gridQrs[id]} alt={t('lag.draw.board.scanToTake', { number })} /> : <span className="lg-board-ticket-blank" />}
                          <span className="lg-board-ticket-no">{number}</span>
                        </li>
                      );
                    }
                    // Taken: its picture if it had one, otherwise the prize's name
                    const prize = opened.get(number) ?? null;
                    const picture = prize !== null ? pictures?.prizes[prize] : pictures?.base;
                    const label = prize !== null ? board.prizes[prize]?.label || t('lag.draw.board.prize') : t('lag.draw.board.noPrizeCell');
                    return (
                      <li key={number} className={`lg-board-ticket is-taken${prize !== null ? ' is-win' : ''}`} style={{ width: size, height: size }}>
                        {picture ? (
                          <img className="lg-board-ticket-pic" src={picture} alt={label} />
                        ) : (
                          <span className="lg-board-ticket-label" style={{ fontSize: Math.max(11, size / 9) }}>{label}</span>
                        )}
                        <span className="lg-board-ticket-no">{number}{picture && prize !== null ? ` · ${label}` : ''}</span>
                      </li>
                    );
                  })}
                </ol>
              );
            })()}
            <p className="lg-board-gridtally">
              <strong>{fmt(taken)}</strong> {t('lag.draw.board.taken', { count: fmt(board.codeCount) })} · <span className="lg-board-prizesleft">{prizeLine}</span>
            </p>
          </div>
        )
      ) : ticketKey ? (
        board.next === undefined ? (
          <p className="lg-board-hint">{t('lag.draw.board.oldServer')}</p>
        ) : (
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
        )
      ) : (
        <div className="lg-board-count">
          <strong>{fmt(taken)}</strong>
          <span>{t('lag.draw.board.taken', { count: fmt(board.codeCount) })}</span>
          <div className="lg-board-bar" aria-hidden="true">
            <span style={{ width: `${board.codeCount ? (taken / board.codeCount) * 100 : 0}%` }} />
          </div>
          <span className="lg-board-prizesleft">{prizeLine}</span>
          {!displayToken && <span className="lg-board-nokey">{t('lag.draw.board.noKey')}</span>}
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
