import { Keypair, PublicKey } from "@solana/web3.js"

export const DRAFFLE_PROGRAM_ID = process.env
  .NEXT_PUBLIC_DRAFFLE_PROGRAM_ID as string
export const DISPENSER_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_DISPENSER_PROGRAM_ID as string
)

export const DISPENSER_REGISTRY_KEYPAIR = Keypair.fromSecretKey(
  new Uint8Array(
    JSON.parse(process.env.NEXT_PUBLIC_DISPENSER_REGISTRY_KEYPAIR as string)
  )
)
export const DISPENSER_REGISTRY_ADDRESS = DISPENSER_REGISTRY_KEYPAIR.publicKey
