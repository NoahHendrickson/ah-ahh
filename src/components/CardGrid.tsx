import { Play } from '../icons';
import { playContainer, type Resource } from '../musickit';
import { useNav } from '../navigation';
import { Artwork } from './Artwork';

function subtitle(item: Resource): string {
  const a = item.attributes ?? {};
  if (item.type === 'artists') return 'Artist';
  if (item.type === 'stations') return 'Station';
  if (item.type.endsWith('playlists')) return a.curatorName ?? 'Playlist';
  return a.artistName ?? '';
}

export function Card({ item, order = 0 }: { item: Resource; order?: number }) {
  const { open } = useNav();
  const round = item.type === 'artists';
  const playable = /albums$|playlists$|stations$/.test(item.type);
  return (
    <div className="card" style={{ '--i': order } as React.CSSProperties} onClick={() => open(item)}>
      <div className="card-art">
        <Artwork artwork={item.attributes?.artwork} size={180} round={round} />
        {playable && (
          <button
            className="card-play"
            title="Play"
            onClick={(e) => {
              e.stopPropagation();
              void playContainer(item, 0, false);
            }}
          >
            <Play />
          </button>
        )}
      </div>
      <div className="card-title" title={item.attributes?.name}>
        {item.attributes?.name}
      </div>
      <div className="card-subtitle">{subtitle(item)}</div>
    </div>
  );
}

export function CardGrid({ items }: { items: Resource[] }) {
  return (
    <div className="card-grid">
      {items.map((item, i) => (
        <Card key={`${item.type}:${item.id}`} item={item} order={i} />
      ))}
    </div>
  );
}

/** A titled horizontal shelf of cards (Home, Artist pages). */
export function Shelf({ title, items }: { title: string; items: Resource[] }) {
  if (!items.length) return null;
  return (
    <section className="section">
      <h2>{title}</h2>
      <div className="shelf">
        {items.map((item, i) => (
          <Card key={`${item.type}:${item.id}`} item={item} order={i} />
        ))}
      </div>
    </section>
  );
}
