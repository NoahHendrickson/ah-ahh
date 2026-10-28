import { Next, Pause, Play, Previous, Queue, Repeat, RepeatOne, Shuffle, VolumeHigh, VolumeLow, VolumeMute } from '../icons';
import { useState } from 'react';
import { cycleRepeat, formatTime, mk, RepeatMode, toggleShuffle } from '../musickit';
import { itemArtist, itemArtwork, itemTitle, usePlayer, useSmoothPlaybackTime, useVolume } from '../player';

export function PlayerBar({ queueOpen, onToggleQueue }: { queueOpen: boolean; onToggleQueue(): void }) {
  const { item, isPlaying, shuffle, repeat } = usePlayer();
  const music = mk();
  const art = itemArtwork(item, 112);

  return (
    <footer className="player">
      {/* Re-keyed per song so the new one rises in (.swap in styles.css). */}
      <div key={item?.id} className="player-now swap">
        {item ? (
          <>
            <div className="artwork" style={{ width: 56, height: 56 }}>
              {art && <img src={art} alt="" draggable={false} />}
            </div>
            <div className="player-meta">
              <div className="player-title">{itemTitle(item)}</div>
              <div className="player-artist">{itemArtist(item)}</div>
            </div>
          </>
        ) : (
          <div className="player-meta muted">Nothing playing</div>
        )}
      </div>

      <div className="player-center">
        <div className="player-controls">
          <button className={`icon-btn ${shuffle ? 'active' : ''}`} title="Shuffle" onClick={toggleShuffle}>
            <Shuffle />
          </button>
          <button className="icon-btn" title="Previous" disabled={!item} onClick={() => void music.skipToPreviousItem()}>
            <Previous />
          </button>
          <button
            className="play-btn"
            title={isPlaying ? 'Pause' : 'Play'}
            disabled={!item}
            onClick={() => (isPlaying ? music.pause() : void music.play())}
          >
            <span key={isPlaying ? 'pause' : 'play'} className="pop">
              {isPlaying ? <Pause /> : <Play />}
            </span>
          </button>
          <button className="icon-btn" title="Next" disabled={!item} onClick={() => void music.skipToNextItem()}>
            <Next />
          </button>
          <button className={`icon-btn ${repeat !== RepeatMode.none ? 'active' : ''}`} title="Repeat" onClick={cycleRepeat}>
            {repeat === RepeatMode.one ? <RepeatOne /> : <Repeat />}
          </button>
        </div>
        <SeekBar />
      </div>

      <div className="player-side">
        <button className={`icon-btn ${queueOpen ? 'active' : ''}`} title="Up Next" onClick={onToggleQueue}>
          <Queue />
        </button>
        <VolumeControl />
      </div>
    </footer>
  );
}

function SeekBar() {
  const { duration, item, isPlaying } = usePlayer();
  const [dragging, setDragging] = useState<number | null>(null);
  const time = Math.min(useSmoothPlaybackTime(isPlaying && dragging === null), duration || Infinity);
  const value = dragging ?? time;
  const pct = duration ? (value / duration) * 100 : 0;

  const commit = () => {
    if (dragging !== null) void mk().seekToTime(dragging);
    setDragging(null);
  };

  return (
    <div className="seek">
      <span className="time">{formatTime(value)}</span>
      <input
        type="range"
        className="slider"
        min={0}
        max={duration || 1}
        step={0.1}
        value={value}
        disabled={!item}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        onChange={(e) => setDragging(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <span className="time">{formatTime(duration)}</span>
    </div>
  );
}

function VolumeControl() {
  const volume = useVolume();
  const [lastAudible, setLastAudible] = useState(1);
  const Icon = volume === 0 ? VolumeMute : volume < 0.5 ? VolumeLow : VolumeHigh;
  const set = (v: number) => {
    mk().volume = v;
    if (v > 0) setLastAudible(v);
  };
  return (
    <div className="volume">
      <button className="icon-btn" title={volume === 0 ? 'Unmute' : 'Mute'} onClick={() => set(volume === 0 ? lastAudible : 0)}>
        <Icon />
      </button>
      <input
        type="range"
        className="slider"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        style={{ '--pct': `${volume * 100}%` } as React.CSSProperties}
        onChange={(e) => set(Number(e.target.value))}
      />
    </div>
  );
}
