import { createContext, FC, useMemo } from "react"
import { Provider, IdlAccounts, Program } from "@project-serum/anchor"
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react"
import { customProviderFactory } from "../lib/anchorUtils"

import { Draffle, IDL as DraffleIdl } from "../lib/idl/draffle"
import { Dispenser, IDL as DispenserIdl } from "../lib/idl/dispenser"
import { DRAFFLE_PROGRAM_ID } from "../config/programIds"
import { PublicKey } from "@solana/web3.js"

export const ProgramApisContext = createContext<{
  draffleClient: DraffleProgram
}>({} as any)

export type RaffleDataRaw = IdlAccounts<Draffle>["raffle"]
export type EntrantsDataRaw = IdlAccounts<Draffle>["entrants"]
export type EntrantsData = EntrantsDataRaw & {
  entrants: PublicKey[]
}
export type DraffleProgram = Omit<Program<Draffle>, "provider"> & {
  provider: Provider
}

export type DispenserRegistryRaw = IdlAccounts<Dispenser>["registry"]
export type DispenserProgram = Omit<Program<Dispenser>, "provider"> & {
  provider: Provider
}

const ProgramApisProvider = ({ children }) => {
  const { connection } = useConnection()
  const anchorWallet = useAnchorWallet()

  // TODO: Customize type to allow access of publicKey
  const customProvider = useMemo(
    () => customProviderFactory(connection, anchorWallet),
    [connection, anchorWallet]
  )

  const { draffleClient } = useMemo(() => {
    const draffleClient = new Program<Draffle>(
      DraffleIdl,
      DRAFFLE_PROGRAM_ID,
      customProvider
    ) as unknown as DraffleProgram
    return { draffleClient }
  }, [customProvider])

  return (
    <ProgramApisContext.Provider value={{ draffleClient }}>
      {children}
    </ProgramApisContext.Provider>
  )
}

export default ProgramApisProvider
