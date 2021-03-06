import React from 'react'

import { MarketDetailsTab, MarketMakerData } from '../../../../util/types'

import { MarketSell } from './market_sell'

interface Props {
  marketMakerData: MarketMakerData
  switchMarketTab: (arg0: MarketDetailsTab) => void
  fetchGraphMarketMakerData: () => Promise<void>
}

const MarketSellContainer: React.FC<Props> = (props: Props) => {
  const setUserInputCollateral = async (symbol: string): Promise<number> => {
    console.log('HERE')
    return 1
  }
  return <MarketSell {...props} />
}

export { MarketSellContainer }
