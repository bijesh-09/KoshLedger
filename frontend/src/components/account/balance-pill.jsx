import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { formatRupees } from "@/lib/utils"

/**
 * Small navbar wallet read-out styled after the usual "Rs 0000.00 / Balance"
 * label. The eye toggles the amount without touching any state outside.
 */
export function BalancePill({ balance, className }) {
  const [visible, setVisible] = useState(false)

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-lg border border-border/60 bg-card/60 py-1 pr-1 pl-2.5",
        className,
      )}
    >
      <div className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-tight tabular-nums">
          {visible ? formatRupees(balance) : "Rs ••••••"}
        </span>
        <span className="mt-1 text-[10px] leading-none text-muted-foreground">
          Balance
        </span>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="ml-1 text-muted-foreground"
        aria-label={visible ? "Hide balance" : "Show balance"}
        aria-pressed={!visible}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? (
          <EyeOff className="size-3.5" aria-hidden="true" />
        ) : (
          <Eye className="size-3.5" aria-hidden="true" />
        )}
      </Button>
    </div>
  )
}
