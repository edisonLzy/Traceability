import { Button } from "@renderer/components/ui/button";
import { Replayer } from "@rrweb/replay";
import type { RrwebReplay } from "@traceability/protocol";
import { useEffect, useRef, useState } from "react";

interface RrwebReplayPlayerProps {
  replay: RrwebReplay;
}

const SPEEDS = [1, 2, 4, 8];

const seekClass =
  "h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-surface-3 " +
  "[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-primary " +
  "[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary";

function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Renders an rrweb session using `@rrweb/replay`'s Replayer directly.
 *
 * `rrweb-player` (the Svelte UI wrapper) ships a broken dist in every 2.x
 * stable release: the onMount that constructs the Replayer is missing, so its
 * `rr-player__frame` stays empty. We drive `Replayer` ourselves and provide a
 * small controller + viewport scaling in its place.
 */
export function RrwebReplayPlayer({ replay }: RrwebReplayPlayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const replayerRef = useRef<Replayer | null>(null);
  const rafRef = useRef<number | null>(null);

  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || replay.events.length === 0) return;

    host.innerHTML = "";
    let replayer: Replayer;
    try {
      replayer = new Replayer(replay.events as any, {
        root: host,
        skipInactive: true,
        speed: 1,
        showDebug: false,
      });
    } catch (err) {
      console.error("[RrwebReplayPlayer] failed to build replayer", err);
      return;
    }
    replayerRef.current = replayer;

    // Recorded viewport size comes from the Meta event (rrweb type 4). The
    // Replayer sizes its iframe to this; we scale the wrapper down to fit the
    // pane. Fall back to the iframe's measured size when meta is absent.
    const meta = (replay.events as any[]).find((e) => e && e.type === 4);
    const recW: number | undefined = meta?.data?.width;
    const recH: number | undefined = meta?.data?.height;

    const applyScale = () => {
      const wrapper = replayer.wrapper;
      const iframe = replayer.iframe;
      if (!wrapper || !iframe) return;
      const iw = recW ?? iframe.offsetWidth ?? 0;
      const ih = recH ?? iframe.offsetHeight ?? 0;
      const cw = host.clientWidth;
      const scale = iw > 0 && cw > 0 ? Math.min(1, cw / iw) : 1;
      wrapper.style.transform = `scale(${scale})`;
      wrapper.style.transformOrigin = "top left";
      wrapper.style.width = `${iw || cw}px`;
      if (ih > 0) {
        host.style.minHeight = "0";
        host.style.height = `${Math.round(ih * scale)}px`;
      }
    };
    applyScale();
    const ro = new ResizeObserver(applyScale);
    ro.observe(host);
    if (replayer.iframe) ro.observe(replayer.iframe);

    // Start paused at t=0 (matches the previous autoPlay:false behaviour).
    replayer.pause(0);
    const md = replayer.getMetaData();
    setTotal(md.totalTime || 0);
    setCurrent(0);
    setPlaying(false);
    setSpeed(1);

    const tick = () => {
      const rp = replayerRef.current;
      if (!rp) return;
      setCurrent(rp.getCurrentTime());
      rafRef.current = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const rp = replayerRef.current;
      if (rp) setCurrent(rp.getCurrentTime());
    };
    const onFinish = () => {
      setPlaying(false);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const rp = replayerRef.current;
      if (rp) setCurrent(rp.getMetaData().totalTime);
    };
    replayer.on("play", onPlay);
    replayer.on("pause", onPause);
    replayer.on("finish", onFinish);

    return () => {
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      replayer.off("play", onPlay);
      replayer.off("pause", onPause);
      replayer.off("finish", onFinish);
      try {
        replayer.destroy();
      } catch {
        // ignore – best-effort teardown
      }
      replayerRef.current = null;
      host.innerHTML = "";
    };
  }, [replay.id, replay.events]);

  const togglePlay = () => {
    const rp = replayerRef.current;
    if (!rp) return;
    if (playing) {
      rp.pause();
    } else if (total > 0 && current >= total) {
      rp.play(0);
    } else {
      rp.play();
    }
  };

  const seek = (offset: number) => {
    const rp = replayerRef.current;
    if (!rp) return;
    setCurrent(offset);
    if (playing) rp.play(offset);
    else rp.pause(offset);
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    replayerRef.current?.setConfig({ speed: s });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div
        className="replay-player min-h-50 w-full overflow-hidden rounded-lg border border-hairline bg-[#090a0b]"
        ref={hostRef}
      />
      <div className="flex items-center gap-2.5 px-0.5">
        <Button size="sm" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚" : "▶"}
        </Button>
        <input
          className={seekClass}
          type="range"
          min={0}
          max={Math.max(total, 1)}
          step={50}
          value={Math.min(current, total || 0)}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span className="whitespace-nowrap text-xs tabular-nums text-subtle">
          {formatMs(current)} / {formatMs(total)}
        </span>
        <div className="ml-auto flex gap-1">
          {SPEEDS.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={speed === s ? "primary" : "default"}
              onClick={() => changeSpeed(s)}
            >
              {s}×
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
