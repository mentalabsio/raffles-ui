import { FC, useEffect, useState } from "react"
import { cloneDeep } from "lodash"

import { Prize } from "../lib/types"
import { Button } from "@theme-ui/components"
import { LoadingIcon } from "./icons/LoadingIcon"

interface ClaimButtonProps {
  prize: Prize
  prizeIndex: number
  ticketIndex: number
  claimPrize: (prizeIndex: number, ticketIndex: number) => Promise<void>
}

const ClaimButton: FC<ClaimButtonProps> = ({
  prize,
  prizeIndex,
  ticketIndex,
  claimPrize,
}) => {
  const [claimOngoing, setClaimOngoing] = useState(new Map<number, boolean>())

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div>
      <Button
        onClick={async () => {
          setClaimOngoing((state) => cloneDeep(state.set(prizeIndex, true)))
          await claimPrize(prizeIndex, ticketIndex)
          setClaimOngoing((state) => cloneDeep(state.set(prizeIndex, false)))
        }}
        disabled={prize.amount.isZero() || !!claimOngoing.get(prizeIndex)}
      >
        <div>
          {!!claimOngoing.get(prizeIndex) ? <LoadingIcon /> : <>Claim</>}
        </div>
      </Button>
    </div>
  )
}

export default ClaimButton
