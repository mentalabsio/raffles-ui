import {
  ChangeEvent,
  FC,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"

import { sleep } from "@project-serum/common"
import { u64 } from "@solana/spl-token"
import toast from "react-hot-toast"

import {
  buyTickets,
  BUY_TICKETS_TX_FEE_LAMPORTS,
  calculateBasketPrice,
} from "../lib/actions/buyTickets"
import { PaymentOption, Raffle } from "../lib/types"
import {
  getDisplayAmount,
  getBuyerATABalance,
  getWalletLamports,
} from "../lib/accounts"
import { tokenInfoMap, wrappedSOL } from "../config/tokenRegistry"
import { useProgramApis } from "../hooks/useProgramApis"
import { DispenserRegistryRaw } from "../providers/ProgramApisProvider"
import { PublicKey } from "@solana/web3.js"
import { Button, Flex, Input, Select, Text } from "@theme-ui/components"

const MAX_TICKET_AMOUNT = 3000

const isLamportsEnough = (lamports: number | undefined) =>
  (lamports ?? 0) >= BUY_TICKETS_TX_FEE_LAMPORTS

interface AccountBalance {
  mint: PublicKey
  amount: u64 | undefined
}

interface PurchaseTicketsProps {
  raffle: Raffle
  updateRaffle: () => void
}

const MAX_NUMBER_OF_PARTICIPANTS = 5000

export const PurchaseTickets: FC<PurchaseTicketsProps> = ({
  raffle,
  updateRaffle,
}) => {
  const { draffleClient, dispenserClient } = useProgramApis()

  const [purchaseOngoing, setPurchaseOngoing] = useState(false)
  const [walletLamports, setWalletLamports] = useState<number>()
  // const [ticketPrice, setTicketPrice] = useState<PaymentOption>({
  //   mint: raffle.proceeds.mint,
  //   price: raffle.proceeds.ticketPrice,
  //   price: raffle.proceeds.ticketPrice,
  // });

  const nativePaymentOption = useMemo(
    () => ({
      mint: raffle.proceeds.mint,
      dispenserPriceIn: new u64(1),
      dispenserPriceOut: new u64(1),
    }),
    [raffle]
  )

  const [paymentOption, setPaymentOption] =
    useState<PaymentOption>(nativePaymentOption)

  const [buyerATABalance, setBuyerATABalance] = useState<AccountBalance>({
    mint: raffle.proceeds.mint.publicKey,
    amount: undefined,
  })
  const [ticketAmount, setTicketAmount] = useState<number>(1)
  const [dispensers, setDispensers] = useState<
    { account: DispenserRegistryRaw; publicKey: PublicKey }[]
  >([])

  const paymentOptions = useMemo(
    () =>
      (raffle.metadata.alternatePurchaseMints || []).reduce(
        (acc, mintAddress) => {
          if (!tokenInfoMap.has(mintAddress.toString())) {
            console.log(
              `Mint ${mintAddress.toString()} not found in token registry`
            )
            return acc
          }

          const dispenser = dispensers.find(
            (d) =>
              d.account.mintTokenOut.toString() ===
                raffle.proceeds.mint.publicKey.toString() &&
              d.account.mintTokenIn.toString() === mintAddress.toString()
          )
          if (!dispenser) {
            return acc
          }

          const tokenInfo = tokenInfoMap.get(mintAddress.toString())!
          acc.set(mintAddress.toString(), {
            mint: {
              name: tokenInfo.name,
              publicKey: mintAddress,
              logoUrl: tokenInfo.logoURI,
              symbol: tokenInfo.symbol,
              decimals: tokenInfo.decimals,
            },
            dispenserPriceIn: dispenser.account.rateTokenIn,
            dispenserPriceOut: dispenser.account.rateTokenOut,
          })
          return acc
        },
        new Map<string, PaymentOption>([
          [
            raffle.proceeds.mint.publicKey.toString(),
            {
              mint: raffle.proceeds.mint,
              dispenserPriceIn: new u64(1),
              dispenserPriceOut: new u64(1),
            },
          ],
        ])
      ),
    [raffle, dispensers]
  )

  const getBasketPrice = useCallback(
    (ticketAmount: number) =>
      calculateBasketPrice(
        raffle.proceeds.ticketPrice,
        ticketAmount,
        paymentOption
      ),
    [raffle.proceeds.ticketPrice, paymentOption]
  )

  useEffect(() => {
    dispenserClient.account.registry.all().then(setDispensers)
  }, [dispenserClient, setDispensers])

  useEffect(() => {
    if (!draffleClient.provider.wallet?.publicKey) return
    let timerId: ReturnType<typeof setInterval>

    const updateLamports = async () => {
      const newWalletLamports = await getWalletLamports(draffleClient.provider)
      setWalletLamports(newWalletLamports)
      if (
        isLamportsEnough(walletLamports) &&
        !(paymentOption.mint.publicKey.toBase58() === wrappedSOL)
      ) {
        clearInterval(timerId)
      }
    }

    updateLamports()
    timerId = setInterval(() => {
      updateLamports()
    }, 5000)
    return () => clearInterval(timerId)
  }, [
    walletLamports,
    draffleClient.provider,
    draffleClient.provider.wallet.publicKey,
    paymentOption.mint.publicKey,
  ])

  useEffect(() => {
    if (!draffleClient.provider.wallet.publicKey) return
    async function updateBuyerATABalance() {
      setBuyerATABalance({
        mint: paymentOption.mint.publicKey,
        amount: await getBuyerATABalance(
          draffleClient.provider,
          paymentOption.mint.publicKey
        ),
      })
    }
    const timerId = setInterval(() => {
      updateBuyerATABalance()
    }, 5000)
    updateBuyerATABalance()
    return () => clearInterval(timerId)
  }, [
    draffleClient.provider,
    draffleClient.provider.wallet,
    paymentOption.mint.publicKey,
  ])

  const lamportsEnough = useMemo(
    () => isLamportsEnough(walletLamports),
    [walletLamports]
  )
  const buyerTokenBalance = useMemo(() => {
    return paymentOption.mint.publicKey.toBase58() === wrappedSOL
      ? {
          mint: new PublicKey(wrappedSOL),
          amount: new u64(walletLamports ?? 0),
        } // We ignore the potential wSOL ATA
      : buyerATABalance
  }, [walletLamports, buyerATABalance, paymentOption.mint.publicKey])

  const hasEnoughFunds = useMemo(() => {
    const tokensEnough = buyerTokenBalance.amount?.gte(
      getBasketPrice(ticketAmount)
    )
    return tokensEnough && lamportsEnough
  }, [buyerTokenBalance, lamportsEnough, ticketAmount, getBasketPrice])

  const maxTicketsToBuyable = useMemo(() => {
    if (!buyerTokenBalance.amount) return new u64(0)
    const newMax = buyerTokenBalance.amount
      .mul(paymentOption.dispenserPriceOut)
      .div(paymentOption.dispenserPriceIn)
      .div(raffle.proceeds.ticketPrice)

    if (
      paymentOption.mint.publicKey.toString() ===
        buyerTokenBalance.mint.toString() &&
      newMax.ltn(ticketAmount)
    )
      setTicketAmount(newMax.toNumber())
    return newMax
  }, [
    raffle.proceeds.ticketPrice,
    ticketAmount,
    buyerTokenBalance,
    paymentOption,
  ])

  useEffect(() => {
    let newTicketAmount = ticketAmount === 0 ? 1 : ticketAmount
    Math.min(ticketAmount, maxTicketsToBuyable.toNumber())
    setTicketAmount(newTicketAmount)
  }, [maxTicketsToBuyable, ticketAmount, setTicketAmount])

  const hasEnoughFundsToIncrementTicket = useMemo(() => {
    const tokensEnough = buyerTokenBalance.amount?.gte(
      getBasketPrice(ticketAmount + 1)
    )
    return tokensEnough && lamportsEnough
  }, [buyerTokenBalance, lamportsEnough, ticketAmount, getBasketPrice])

  const onBuyTickets = useCallback(async () => {
    try {
      setPurchaseOngoing(true)
      const buyerATAExists = buyerATABalance.amount !== undefined
      await buyTickets(
        draffleClient,
        dispenserClient,
        raffle,
        ticketAmount,
        paymentOption,
        buyerATAExists
      )
      setTicketAmount(1)
      await sleep(500)
      updateRaffle()
      toast.success(`You bought ${ticketAmount} ticket(s)`)
    } catch (error: any) {
      if (error.msg) {
        toast.error(`Transaction failed: ${error.msg}`)
      } else {
        toast.error("Unexpected error")
      }
    }
    setPurchaseOngoing(false)
  }, [
    draffleClient,
    dispenserClient,
    raffle,
    ticketAmount,
    paymentOption,
    buyerATABalance,
    setTicketAmount,
    updateRaffle,
  ])

  const onSelectPurchaseMint = (
    event: ChangeEvent<{
      name?: string | undefined
      value: unknown
    }>
  ) => setPaymentOption(paymentOptions.get(event.target.value as string)!)

  return (
    <Flex
      sx={{
        flexDirection: "column",
        alignItems: "center",
        gap: ".8rem",
      }}
    >
      <Flex
        sx={{
          alignItems: "center",
          gap: ".8rem",
        }}
      >
        <Flex
          sx={{
            alignItems: "center",
            border: "1px solid",
            borderColor: "primary",
            padding: ".4rem 1.6rem",
            borderRadius: ".4rem",
            gap: ".8rem",
          }}
        >
          <Button
            sx={{
              borderRadius: "2.4rem",
              border: "1px solid",
              borderColor: "primary",
              padding: "0 .8rem",
              alignItems: "center",
              width: "2.4rem",
              height: "2.4rem",
              justifyContent: "center",
              fontWeight: "bold",
              fontSize: "1.8rem",
              paddingBottom: ".2rem",
            }}
            variant="resetted"
            onClick={() =>
              setTicketAmount((currentAmount) => Math.max(currentAmount - 1, 1))
            }
            disabled={ticketAmount <= 1}
          >
            -
          </Button>
          <Input
            sx={{
              border: "none",
              maxWidth: "8rem",
            }}
            value={ticketAmount}
            onChange={(event) => {
              const newValue = event.target.value
              const re = /^[0-9\b]+$/
              if (newValue !== "" && !re.test(newValue)) return

              let numericValue = Math.min(
                Math.min(
                  Number(newValue),
                  MAX_TICKET_AMOUNT - raffle.totalTickets
                ),
                maxTicketsToBuyable.toNumber()
              )

              setTicketAmount(numericValue)
            }}
          />
          <Button
            sx={{
              borderRadius: "2.4rem",
              border: "1px solid",
              borderColor: "primary",
              padding: "0 .8rem",
              alignItems: "center",
              width: "2.4rem",
              height: "2.4rem",
              justifyContent: "center",
              fontWeight: "bold",
              fontSize: "1.8rem",
            }}
            onClick={() =>
              setTicketAmount((currentAmount) => currentAmount + 1)
            }
            disabled={
              raffle.totalTickets + ticketAmount >=
                MAX_NUMBER_OF_PARTICIPANTS ||
              !hasEnoughFundsToIncrementTicket ||
              ticketAmount + 1 > MAX_TICKET_AMOUNT - raffle.totalTickets
            }
          >
            +
          </Button>
          <Button
            sx={{
              marginLeft: ".8rem",
            }}
            variant="resetted"
            onClick={() => {
              let maxTickets = Math.min(
                MAX_TICKET_AMOUNT - raffle.totalTickets,
                maxTicketsToBuyable.toNumber()
              )
              setTicketAmount(maxTickets)
            }}
          >
            max
          </Button>
        </Flex>
        <Button
          onClick={onBuyTickets}
          disabled={
            ticketAmount === 0 ||
            raffle.totalTickets + ticketAmount > MAX_NUMBER_OF_PARTICIPANTS ||
            !hasEnoughFunds ||
            purchaseOngoing
          }
        >
          {purchaseOngoing ? (
            "Processing..."
          ) : (
            <>Buy {!lamportsEnough && "(Insufficient SOL)"}</>
          )}
        </Button>
      </Flex>
      {/* <img
            src={raffle.proceeds.mint.logoUrl}
            alt={`Logo for ${raffle.proceeds.mint.name}`}
          /> */}

      <Flex
        sx={{
          alignItems: "center",
          gap: "1.6rem",
        }}
      >
        <Text variant="small">
          Cost:
          {getDisplayAmount(getBasketPrice(ticketAmount), paymentOption.mint)} $
          {raffle.proceeds.mint.symbol}
        </Text>
        <Text
          variant="small"
          sx={{
            alignItems: "center",
          }}
        >
          You have:{" "}
          {buyerTokenBalance
            ? Number(
                getDisplayAmount(
                  buyerTokenBalance.amount || new u64(0),
                  paymentOption.mint
                )
              ).toFixed(2)
            : 0}{" "}
          ${paymentOption.mint.symbol}
        </Text>
      </Flex>
    </Flex>
  )
}
