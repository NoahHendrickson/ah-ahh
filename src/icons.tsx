// App icon set: Hugeicons (free, stroke-rounded). https://hugeicons.com
import {
  Add01Icon,
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  Copy01Icon,
  DragDropVerticalIcon,
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
export const Grip = icon(DragDropVerticalIcon, true);
export const Copy = icon(Copy01Icon);
export const ExternalLink = icon(LinkSquare02Icon);
export const Upload = icon(Upload01Icon);
export const Key = icon(Key01Icon);

// Brand mark (Figma: ah ahh / Union). Height follows the font size; colour follows the text.
export function Logo() {
  return (
    <svg className="logo-mark" viewBox="0 0 20 27" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 2.5C4 3.05228 4.44772 3.5 5 3.5H7C7.55228 3.5 8 3.94772 8 4.5V6.5C8 7.05228 8.44771 7.5 9 7.5H11C11.5523 7.5 12 7.05228 12 6.5V4.5C12 3.94772 12.4477 3.5 13 3.5H15C15.5523 3.5 16 3.05228 16 2.5V1C16 0.447715 16.4477 0 17 0H19C19.5523 0 20 0.447715 20 1V3C20 3.55228 19.5523 4 19 4H17C16.4477 4 16 4.44772 16 5V10.5C16 11.0523 16.4477 11.5 17 11.5H18.5C19.0523 11.5 19.5 11.9477 19.5 12.5V14.5C19.5 15.0523 19.0523 15.5 18.5 15.5H17C16.4477 15.5 16 15.9477 16 16.5V22C16 22.5523 16.4477 23 17 23H19C19.5523 23 20 23.4477 20 24V26C20 26.5523 19.5523 27 19 27H17C16.4477 27 16 26.5523 16 26V24.5C16 23.9477 15.5523 23.5 15 23.5H13C12.4477 23.5 12 23.0523 12 22.5V20.5C12 19.9477 11.5523 19.5 11 19.5H9C8.44771 19.5 8 19.9477 8 20.5V22.5C8 23.0523 7.55228 23.5 7 23.5H5C4.44772 23.5 4 23.9477 4 24.5V26C4 26.5523 3.55228 27 3 27H1C0.447715 27 0 26.5523 0 26V24C0 23.4477 0.447715 23 1 23H3C3.55228 23 4 22.5523 4 22V16.5C4 15.9477 3.55228 15.5 3 15.5H1.5C0.947715 15.5 0.5 15.0523 0.5 14.5V12.5C0.5 11.9477 0.947715 11.5 1.5 11.5H3C3.55228 11.5 4 11.0523 4 10.5V5C4 4.44772 3.55228 4 3 4H1C0.447715 4 0 3.55228 0 3V1C0 0.447715 0.447715 0 1 0H3C3.55228 0 4 0.447715 4 1V2.5ZM4.5 14.5C4.5 15.0523 4.94772 15.5 5.5 15.5H7C7.55228 15.5 8 15.0523 8 14.5V12.5C8 11.9477 7.55228 11.5 7 11.5H5.5C4.94772 11.5 4.5 11.9477 4.5 12.5V14.5ZM12 14.5C12 15.0523 12.4477 15.5 13 15.5H14.5C15.0523 15.5 15.5 15.0523 15.5 14.5V12.5C15.5 11.9477 15.0523 11.5 14.5 11.5H13C12.4477 11.5 12 11.9477 12 12.5V14.5Z"
      />
    </svg>
  );
}
