export interface UserAvatarUser {
  name: string;
  email?: string;
  avatarUrl?: string;
}

export default function UserAvatar({ user }: { user: UserAvatarUser }) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        className="w-8 h-8 rounded-full object-cover"
      />
    );
  }
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
      {initials}
    </div>
  );
}
