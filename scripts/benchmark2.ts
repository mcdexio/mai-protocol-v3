const deployment = './deployments/aavx.deployment.js'
const rpc = 'http://localhost:9650/ext/bc/2CA6j5zYzasynPsFeNoqWkmTCt3VScMvXUZHbfDJ8k3oGzAPtU/rpc'
const mainPK = process.env["PK"]
const liquidityPool = '0xDF5589Dc21d6810186f4c32D04D240FD01B05ACE'

import { ethers } from 'ethers'
import * as fs from "fs"
import { LiquidityPoolAllHopsFactory, CustomErc20Factory, DisperseFactory } from '../typechain'
import { ensureFinished } from './deployer/utils'
import BigNumber from 'bignumber.js'

function toWei(n) { return ethers.utils.parseEther(n) };
function fromWei(n) { return ethers.utils.formatEther(n); }

const USE_TARGET_LEVERAGE = 0x8000000;
const NONE = "0x0000000000000000000000000000000000000000";
const USDC_PER_TRADER = (new BigNumber('1000')).shiftedBy(6)
const ETH_PER_TRADER = (new BigNumber('0.1')).shiftedBy(18)
const TRADER_LEVERAGE = (new BigNumber('10')).shiftedBy(18)

const contracts = JSON.parse(fs.readFileSync(deployment, 'utf8'))
const provider = new ethers.providers.JsonRpcProvider(rpc)
const signer = new ethers.Wallet(mainPK, provider)
const traders = []

async function distribute(count: number) {
  const usdc = CustomErc20Factory.connect(contracts.CustomERC20.address, signer)
  const disperse = DisperseFactory.connect(contracts.Disperse.address, signer)
  let totalUSDC = USDC_PER_TRADER.times(count)
  let totalETH = ETH_PER_TRADER.times(count)
  await ensureFinished(usdc.mint(signer.address, totalUSDC.toFixed()))
  await ensureFinished(usdc.approve(disperse.address, totalUSDC.toFixed()))
  // traders
  for (let i = 0; i < count; i++) {
    const newWallet = ethers.Wallet.createRandom().connect(provider)
    traders.push(newWallet)
  }
  let beginTime = Date.now()
  console.log('Begin distribute')
  const BATCH_SIZE = 10
  for (let i = 0; i < traders.length; i += BATCH_SIZE) {
    const batch = traders.slice(i, i + BATCH_SIZE)
    totalUSDC = USDC_PER_TRADER.times(BATCH_SIZE)
    totalETH = ETH_PER_TRADER.times(BATCH_SIZE)
    // USDC
    await ensureFinished(disperse.disperseToken(
      contracts.CustomERC20.address,
      batch.map(x => x.address),
      batch.map(x => USDC_PER_TRADER.toFixed())
    ))
    // ETH: distribute 1 eth to count of accounts
    await ensureFinished(disperse.disperseEther(
      batch.map(x => x.address),
      batch.map(x => ETH_PER_TRADER.toFixed()),
      { value: totalETH.toFixed() }
    ))
  }
  let endTime = Date.now()
  console.log('End distribute', (endTime - beginTime) / 1000, 's')
}

async function preTrade() {
  let beginTime = Date.now()
  console.log('Begin preTrade')
  const ops = async (trader) => {
    const usdc = CustomErc20Factory.connect(contracts.CustomERC20.address, trader)
    const pool = LiquidityPoolAllHopsFactory.connect(liquidityPool, trader)
    await ensureFinished(usdc.approve(liquidityPool, USDC_PER_TRADER.toFixed()))
    await ensureFinished(pool.setTargetLeverage(0, trader.address, TRADER_LEVERAGE.toFixed()))
  }
  const txs = traders.map(trader => ops(trader))
  await Promise.all(txs)
  let endTime = Date.now()
  console.log('End preTrade', (endTime - beginTime) / 1000, 's')
}

async function trade() {
  let beginTime = Date.now()
  console.log('Begin trade')
  const ops = async (trader) => {
    const pool = LiquidityPoolAllHopsFactory.connect(liquidityPool, trader)
    return pool.trade(
      0, trader.address,
      toWei("1"), toWei("1000000"), 4999999999,
      NONE, USE_TARGET_LEVERAGE,
      { gasLimit: 4e6 }
    )
  }
  const txs = await Promise.all(traders.map(trader => ops(trader)))
  const t2 = Date.now()
  console.log("Sent", (t2 - beginTime) / 1000, 'tps', traders.length / (t2 - beginTime) * 1000)
  const receipts = await Promise.all(txs.map(x => x.wait()))
  const endTime = Date.now()
  console.log(
    'End trade', (endTime - beginTime) / 1000, 's,',
    'tps', traders.length / (endTime - beginTime) * 1000)
  for (let receipt of receipts) {
    if (receipt.status !== 1) {
      throw new Error('receipt error:' + receipt)
    }
  }
}

async function main() {
  await distribute(100)
  await preTrade()
  await trade()
}

main().then().catch(console.warn)
