import { Zero } from 'ethers/constants'
import { BigNumber } from 'ethers/utils'
import React, { useEffect, useMemo, useState } from 'react'
import { RouteComponentProps, withRouter } from 'react-router-dom'
import ReactTooltip from 'react-tooltip'
import styled from 'styled-components'

import { useAsyncDerivedValue, useConnectedCPKContext, useConnectedWeb3Context, useContracts } from '../../../../hooks'
import { MarketMakerService } from '../../../../services'
import { getLogger } from '../../../../util/logger'
import {
  calcSellAmountInCollateral,
  computeBalanceAfterTrade,
  formatBigNumber,
  formatNumber,
  mulBN,
} from '../../../../util/tools'
import {
  BalanceItem,
  CompoundTokenType,
  MarketDetailsTab,
  MarketMakerData,
  OutcomeTableValue,
  Status,
} from '../../../../util/types'
import { Button, ButtonContainer } from '../../../button'
import { ButtonType } from '../../../button/button_styling_types'
import { BigNumberInput, TextfieldCustomPlaceholder } from '../../../common'
import { BigNumberInputReturn } from '../../../common/form/big_number_input'
import {
  Dropdown,
  DropdownDirection,
  DropdownItemProps,
  DropdownPosition,
  DropdownVariant,
} from '../../../common/form/dropdown'
import { FullLoading } from '../../../loading'
import { ModalTransactionResult } from '../../../modal/modal_transaction_result'
import { GenericError } from '../../common/common_styled'
import { GridTransactionDetails } from '../../common/grid_transaction_details'
import { OutcomeTable } from '../../common/outcome_table'
import { TokenBalance } from '../../common/token_balance'
import { TransactionDetailsCard } from '../../common/transaction_details_card'
import { TransactionDetailsLine } from '../../common/transaction_details_line'
import { TransactionDetailsRow, ValueStates } from '../../common/transaction_details_row'
import { WarningMessage } from '../../common/warning_message'

const StyledButtonContainer = styled(ButtonContainer)`
  justify-content: space-between;
  margin: 0 -24px;
  padding: 20px 24px 0;
  margin-top: ${({ theme }) => theme.borders.borderLineDisabled};
`

const CurrencyDropdown = styled(Dropdown)`
  min-width: 80px;
  display: inline-flex;
  float: right;
`
const CustomDropdownItem = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;

  .dropdownItems & .sortBy {
    display: none;
  }
`
const CurrencyDropdownLabelContainer = styled.div`
  margin-top: 20px;
`
const CurrencyDropdownLabel = styled.div`
  display: inline-flex;
  padding-left: 14px;
  padding-top: 14px;
  color: #37474f;
  font-size: 14px;
  font-weight: 400;
  line-height: 16px;
`

const logger = getLogger('Market::Sell')

interface Props extends RouteComponentProps<any> {
  fetchGraphMarketMakerData: () => Promise<void>
  marketMakerData: MarketMakerData
  switchMarketTab: (arg0: MarketDetailsTab) => void
}

const MarketSellWrapper: React.FC<Props> = (props: Props) => {
  const context = useConnectedWeb3Context()
  const cpk = useConnectedCPKContext()
  const { buildMarketMaker, conditionalTokens } = useContracts(context)
  const { fetchGraphMarketMakerData, marketMakerData, switchMarketTab } = props
  const { address: marketMakerAddress, balances, collateral, fee } = marketMakerData
  const marketMakerDataDefault = marketMakerData
  const [stateMarketMakerData, setMarketMakerdata] = useState<MarketMakerData>(marketMakerDataDefault)
  const collateralSymbol = collateral.symbol.toLowerCase()
  let currencySelect = <span />
  const setUserInputCollateral = (symbol: string): void => {
    console.log(stateMarketMakerData)
    console.log(symbol)
    if (symbol.toLowerCase() === collateral.symbol.toLowerCase()) {
      // get the value of
    } else {
      // get the value of
    }
  }
  if (collateralSymbol in CompoundTokenType) {
    const filters = [
      {
        title: 'dai',
        onClick: () => setUserInputCollateral('dai'),
      },
      {
        title: 'cDai',
        onClick: () => setUserInputCollateral('cdai'),
      },
    ]
    const filterItems: Array<DropdownItemProps> = filters.map((item, index) => {
      return {
        content: <CustomDropdownItem>{item.title}</CustomDropdownItem>,
        onClick: item.onClick,
      }
    })
    currencySelect = (
      <CurrencyDropdownLabelContainer>
        <CurrencyDropdownLabel>Withdraw as</CurrencyDropdownLabel>
        <CurrencyDropdown items={filterItems} />
      </CurrencyDropdownLabelContainer>
    )
  }

  let defaultOutcomeIndex = 0
  for (let i = 0; i < balances.length; i++) {
    const shares = parseInt(formatBigNumber(balances[i].shares, collateral.decimals))
    if (shares > 0) {
      defaultOutcomeIndex = i
      break
    }
  }

  const marketMaker = buildMarketMaker(marketMakerAddress)

  const [status, setStatus] = useState<Status>(Status.Ready)
  const [outcomeIndex, setOutcomeIndex] = useState<number>(defaultOutcomeIndex)
  const [balanceItem, setBalanceItem] = useState<BalanceItem>(balances[outcomeIndex])
  const [amountShares, setAmountShares] = useState<Maybe<BigNumber>>(new BigNumber(0))
  const [amountSharesToDisplay, setAmountSharesToDisplay] = useState<string>('')
  const [isNegativeAmountShares, setIsNegativeAmountShares] = useState<boolean>(false)
  const [message, setMessage] = useState<string>('')
  const [isModalTransactionResultOpen, setIsModalTransactionResultOpen] = useState(false)

  const marketFeeWithTwoDecimals = Number(formatBigNumber(fee, 18))

  useEffect(() => {
    setIsNegativeAmountShares(formatBigNumber(amountShares || Zero, collateral.decimals).includes('-'))
  }, [amountShares, collateral.decimals])
  useEffect(() => {
    console.log('11')
    setBalanceItem(balances[outcomeIndex])
    // eslint-disable-next-line
  }, [balances[outcomeIndex]])

  useEffect(() => {
    setOutcomeIndex(defaultOutcomeIndex)
    setBalanceItem(balances[defaultOutcomeIndex])
    setAmountShares(null)
    setAmountSharesToDisplay('')
    // eslint-disable-next-line
  }, [collateral.address])

  const calcSellAmount = useMemo(
    () => async (
      amountShares: BigNumber,
    ): Promise<[number[], Maybe<BigNumber>, Maybe<BigNumber>, Maybe<BigNumber>]> => {
      const holdings = balances.map(balance => balance.holdings)
      const holdingsOfSoldOutcome = holdings[outcomeIndex]
      const holdingsOfOtherOutcomes = holdings.filter((item, index) => {
        return index !== outcomeIndex
      })

      const amountToSell = calcSellAmountInCollateral(
        // If the transaction incur in some precision error, we need to multiply the amount by some factor, for example  amountShares.mul(99999).div(100000) , bigger the factor, less dust
        amountShares,
        holdingsOfSoldOutcome,
        holdingsOfOtherOutcomes,
        marketFeeWithTwoDecimals,
      )

      if (!amountToSell) {
        logger.warn(
          `Could not compute amount of collateral to sell for '${amountShares.toString()}' and '${holdingsOfSoldOutcome.toString()}'`,
        )
        return [[], null, null, null]
      }

      const balanceAfterTrade = computeBalanceAfterTrade(
        holdings,
        outcomeIndex,
        amountToSell.mul(-1), // negate amounts because it's a sale
        amountShares.mul(-1),
      )

      const pricesAfterTrade = MarketMakerService.getActualPrice(balanceAfterTrade)
      const potentialValue = mulBN(amountToSell, 1 / (1 - marketFeeWithTwoDecimals))
      const costFee = potentialValue.sub(amountToSell)

      const probabilities = pricesAfterTrade.map(priceAfterTrade => priceAfterTrade * 100)

      logger.log(`Amount to sell ${amountToSell}`)
      return [probabilities, costFee, amountToSell, potentialValue]
    },
    [outcomeIndex, balances, marketFeeWithTwoDecimals],
  )

  const [probabilities, costFee, tradedCollateral, potentialValue] = useAsyncDerivedValue(
    amountShares || Zero,
    [balances.map(() => 0), null, null, null],
    calcSellAmount,
  )

  const finish = async () => {
    try {
      if (!tradedCollateral) {
        return
      }

      if (!cpk) {
        return
      }

      const sharesAmount = formatBigNumber(amountShares || Zero, collateral.decimals)

      setStatus(Status.Loading)
      setMessage(`Selling ${sharesAmount} shares...`)

      await cpk.sellOutcomes({
        amount: tradedCollateral,
        outcomeIndex,
        marketMaker,
        conditionalTokens,
      })

      await fetchGraphMarketMakerData()
      setAmountShares(null)
      setAmountSharesToDisplay('')
      setStatus(Status.Ready)
      setMessage(`Successfully sold ${sharesAmount} '${balances[outcomeIndex].outcomeName}' shares.`)
    } catch (err) {
      setStatus(Status.Error)
      setMessage(`Error trying to sell '${balances[outcomeIndex].outcomeName}' shares.`)
      logger.error(`${message} - ${err.message}`)
    }
    setIsModalTransactionResultOpen(true)
  }

  const selectedOutcomeBalance = formatNumber(formatBigNumber(balanceItem.shares, collateral.decimals))

  const amountError =
    balanceItem.shares === null
      ? null
      : balanceItem.shares.isZero() && amountShares?.gt(balanceItem.shares)
      ? `Insufficient balance`
      : amountShares?.gt(balanceItem.shares)
      ? `Value must be less than or equal to ${selectedOutcomeBalance} shares`
      : null
  const isSellButtonDisabled =
    !amountShares ||
    (status !== Status.Ready && status !== Status.Error) ||
    amountShares?.isZero() ||
    amountError !== null ||
    isNegativeAmountShares
  return (
    <>
      <OutcomeTable
        balances={balances}
        collateral={collateral}
        disabledColumns={[
          OutcomeTableValue.Payout,
          OutcomeTableValue.Outcome,
          OutcomeTableValue.Probability,
          OutcomeTableValue.Bonded,
        ]}
        newShares={balances.map((balance, i) =>
          i === outcomeIndex ? balance.shares.sub(amountShares || Zero) : balance.shares,
        )}
        outcomeHandleChange={(value: number) => {
          setOutcomeIndex(value)
          setBalanceItem(balances[value])
        }}
        outcomeSelected={outcomeIndex}
        probabilities={probabilities}
        showPriceChange={amountShares?.gt(0)}
        showSharesChange={amountShares?.gt(0)}
      />
      <GridTransactionDetails>
        <div>
          <TokenBalance text="Your Shares" value={formatNumber(selectedOutcomeBalance)} />
          <ReactTooltip id="walletBalanceTooltip" />
          <TextfieldCustomPlaceholder
            formField={
              <BigNumberInput
                decimals={collateral.decimals}
                name="amount"
                onChange={(e: BigNumberInputReturn) => {
                  setAmountShares(e.value)
                  setAmountSharesToDisplay('')
                }}
                style={{ width: 0 }}
                value={amountShares}
                valueToDisplay={amountSharesToDisplay}
              />
            }
            onClickMaxButton={() => {
              setAmountShares(balanceItem.shares)
              setAmountSharesToDisplay(formatBigNumber(balanceItem.shares, collateral.decimals, 5))
            }}
            shouldDisplayMaxButton
            symbol={'Shares'}
          />
          {amountError && <GenericError>{amountError}</GenericError>}
          {currencySelect}
        </div>
        <div>
          <TransactionDetailsCard>
            <TransactionDetailsRow
              title={'Sell Amount'}
              value={`${formatNumber(formatBigNumber(amountShares || Zero, collateral.decimals))} Shares`}
            />
            <TransactionDetailsRow
              emphasizeValue={potentialValue ? potentialValue.gt(0) : false}
              state={ValueStates.success}
              title={'Profit'}
              value={
                potentialValue
                  ? `${formatNumber(formatBigNumber(potentialValue, collateral.decimals, 2))} ${collateral.symbol}`
                  : '0.00'
              }
            />
            <TransactionDetailsRow
              title={'Trading Fee'}
              value={`${costFee ? formatNumber(formatBigNumber(costFee.mul(-1), collateral.decimals, 2)) : '0.00'} ${
                collateral.symbol
              }`}
            />
            <TransactionDetailsLine />
            <TransactionDetailsRow
              emphasizeValue={
                (tradedCollateral && parseFloat(formatBigNumber(tradedCollateral, collateral.decimals, 2)) > 0) || false
              }
              state={
                (tradedCollateral &&
                  parseFloat(formatBigNumber(tradedCollateral, collateral.decimals, 2)) > 0 &&
                  ValueStates.important) ||
                ValueStates.normal
              }
              title={'Total'}
              value={`${
                tradedCollateral ? formatNumber(formatBigNumber(tradedCollateral, collateral.decimals, 2)) : '0.00'
              } ${collateral.symbol}`}
            />
          </TransactionDetailsCard>
        </div>
      </GridTransactionDetails>
      {isNegativeAmountShares && (
        <WarningMessage
          additionalDescription={''}
          danger={true}
          description={`Your sell amount should not be negative.`}
          href={''}
          hyperlinkDescription={''}
          marginBottom={true}
        />
      )}
      <StyledButtonContainer borderTop={true} marginTop={isNegativeAmountShares}>
        <Button buttonType={ButtonType.secondaryLine} onClick={() => switchMarketTab(MarketDetailsTab.swap)}>
          Cancel
        </Button>
        <Button buttonType={ButtonType.secondaryLine} disabled={isSellButtonDisabled} onClick={() => finish()}>
          Sell
        </Button>
      </StyledButtonContainer>
      <ModalTransactionResult
        isOpen={isModalTransactionResultOpen}
        onClose={() => setIsModalTransactionResultOpen(false)}
        status={status}
        text={message}
        title={status === Status.Error ? 'Transaction Error' : 'Sell Shares'}
      />
      {status === Status.Loading && <FullLoading message={message} />}
    </>
  )
}

export const MarketSell = withRouter(MarketSellWrapper)
