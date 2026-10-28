import { Album, Home, Logo, Playlists, Search, Settings, Songs } from '../icons';
import type { ReactNode } from 'react';
import { useLibrary } from '../library';
import { useNav, type Route } from '../navigation';
import { useProfile } from '../profile';
import { Avatar } from './Avatar';

export function Sidebar() {
  const { route, navigate } = useNav();
  const { playlists } = useLibrary();
  const profile = useProfile();

  const current = (target: Route) => route.view === target.view;
  const item = (target: Route, icon: ReactNode, label: string) => (
    <button className={`nav-item ${current(target) ? 'active' : ''}`} onClick={() => navigate(target)}>
      {icon}
      <span>{label}</span>
    </button>
  );
  // Same as item(), as a bare icon.
  const iconItem = (target: Route, icon: ReactNode, title: string) => (
    <button className={`icon-btn ${current(target) ? 'current' : ''}`} title={title} onClick={() => navigate(target)}>
      {icon}
    </button>
  );

  return (
    <nav className="sidebar">
      <div className="sidebar-top drag">
        <div className="logo">
          <Logo />
          ah ahh
        </div>
      </div>
      <div className="sidebar-scroll">
        {item({ view: 'search' }, <Search />, 'Search')}
        {item({ view: 'home' }, <Home />, 'Home')}

        <div className="nav-heading">Library</div>
        {item({ view: 'songs' }, <Songs />, 'Songs')}
        {item({ view: 'albums' }, <Album />, 'Albums')}
        {item({ view: 'playlists' }, <Playlists />, 'Playlists')}

        {playlists.length > 0 && <div className="nav-heading">Playlists</div>}
        {playlists.map((p) => (
          <button
            key={p.id}
            className={`nav-item playlist ${route.view === 'collection' && route.item.id === p.id ? 'active' : ''}`}
            onClick={() => navigate({ view: 'collection', item: p })}
            title={p.attributes?.name}
          >
            <span>{p.attributes?.name}</span>
          </button>
        ))}
      </div>
      <div className="sidebar-bottom">
        {item({ view: 'profile' }, <Avatar profile={profile} size={22} />, profile?.name ?? 'Profile')}
        {iconItem({ view: 'settings' }, <Settings />, 'Settings')}
      </div>
    </nav>
  );
}
