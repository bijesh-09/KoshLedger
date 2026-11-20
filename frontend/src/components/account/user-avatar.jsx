import { Avatar, AvatarFallback } from "@/components/ui/avatar"

// The email is immutable in this API, so seeding the gradient with it keeps a
// user's avatar colour stable forever (across logins and devices).
function avatarHue(seed = "") {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  return Math.abs(hash) % 360
}

export function UserAvatar({ seed, className = "", iconClassName = "" }) {
  const hue = avatarHue(seed)

  return (
    <Avatar className={className}>
      <AvatarFallback
        className="text-white"
        style={{
          backgroundImage: `linear-gradient(145deg, hsl(${hue} 72% 60%), hsl(${
            (hue + 38) % 360
          } 76% 42%))`,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className={iconClassName || "size-[62%]"}
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="8.4" r="3.7" opacity="0.95" />
          <path
            d="M4.4 21c.5-4.5 3.7-7.4 7.6-7.4s7.1 2.9 7.6 7.4Z"
            opacity="0.95"
          />
        </svg>
      </AvatarFallback>
    </Avatar>
  )
}
