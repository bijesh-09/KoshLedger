import { useNavigate } from "react-router-dom"
import { ChevronRight, LogOut, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/lib/auth-context"

import { UserAvatar } from "./user-avatar"

export function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  function handleLogout() {
    logout()
    navigate("/", { replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full p-0"
            aria-label={`Open account menu for ${user.username}`}
          />
        }
      >
        <UserAvatar
          seed={user.email || user.username}
          className="size-8 ring-1 ring-border/70"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-2">
            <span className="text-sm font-semibold text-foreground">
              {user.username}
            </span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="gap-2 py-1.5"
            onClick={() => navigate("/profile")}
          >
            <UserRound aria-hidden="true" />
            Profile
            <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
          </DropdownMenuItem>

          <DropdownMenuItem
            variant="destructive"
            className="gap-2 py-1.5"
            onClick={handleLogout}
          >
            <LogOut aria-hidden="true" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
