import { Note } from '../icons';
import { artworkUrl, type Artwork as ArtworkData } from '../musickit';

interface Props {
  artwork?: ArtworkData;
  size: number;
  round?: boolean;
  className?: string;
}

export function Artwork({ artwork, size, round, className = '' }: Props) {
  const src = artworkUrl(artwork, size);
  return (
    <div className={`artwork ${round ? 'round' : ''} ${className}`} style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" loading="lazy" draggable={false} /> : <Note size={size * 0.36} />}
    </div>
  );
}
