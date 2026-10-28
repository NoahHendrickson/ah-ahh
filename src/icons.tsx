// App icon set: Hugeicons (free, stroke-rounded). https://hugeicons.com
import {
  Add01Icon,
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  Copy01Icon,
  FavouriteIcon,
  Home01Icon,
  Key01Icon,
  LinkSquare02Icon,
  ListPlusIcon,
  MusicNote03Icon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PlayListAddIcon,
  Playlist02Icon,
  Playlist03Icon,
  PreviousIcon,
  RepeatOne01Icon,
  Search01Icon,
  Settings01Icon,
  ShuffleIcon,
  Tick02Icon,
  Upload01Icon,
  VolumeHighIcon,
  VolumeLowIcon,
  VolumeMute02Icon,
  Vynil01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';

interface IconProps {
  /** All UI icons are 16px; only override for special cases. */
  size?: number;
  /** Fill the closed shapes (solid play/pause/skip, like most music players). */
  filled?: boolean;
}

// Lines are exactly 1px wide whatever the icon size (absoluteStrokeWidth): the same
// proportion as Hugeicons' 1.5px-on-24px design at our 16px size, and a whole number of
// screen pixels on both 1x and 2x displays so edges stay sharp.
function icon(svg: IconSvgElement, filledByDefault = false) {
  return function Icon({ size = 16, filled = filledByDefault }: IconProps) {
    return (
      <HugeiconsIcon
        icon={svg}
        size={size}
        strokeWidth={1}
        absoluteStrokeWidth
        className={filled ? 'icon filled' : 'icon'}
      />
    );
  };
}

// Navigation
export const Search = icon(Search01Icon);
export const Home = icon(Home01Icon);
export const Songs = icon(MusicNote03Icon);
export const Album = icon(Vynil01Icon);
export const Playlists = icon(Playlist02Icon);
export const Settings = icon(Settings01Icon);

// Playback
export const Play = icon(PlayIcon, true);
export const Pause = icon(PauseIcon, true);
export const Previous = icon(PreviousIcon, true);
export const Next = icon(NextIcon, true);
export const Shuffle = icon(ShuffleIcon);
export const Repeat = icon(ArrowReloadHorizontalIcon);
export const RepeatOne = icon(RepeatOne01Icon);
export const Queue = icon(Playlist03Icon);
export const PlayNext = icon(ListPlusIcon);
export const Favorite = icon(FavouriteIcon);
export const AddToPlaylist = icon(PlayListAddIcon);
export const VolumeHigh = icon(VolumeHighIcon);
export const VolumeLow = icon(VolumeLowIcon);
export const VolumeMute = icon(VolumeMute02Icon);

// General
export const Note = icon(MusicNote03Icon);
export const Add = icon(Add01Icon);
export const Check = icon(Tick02Icon);
export const Close = icon(Cancel01Icon);
export const Copy = icon(Copy01Icon);
export const ExternalLink = icon(LinkSquare02Icon);
export const Upload = icon(Upload01Icon);
export const Key = icon(Key01Icon);
