/** Round account picture, or the name's first letter when the computer account has none. */
export function Avatar({ profile, size }: { profile?: AhAhhProfile; size: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {profile?.photo ? <img src={profile.photo} alt="" /> : profile?.name.charAt(0).toUpperCase()}
    </span>
  );
}
