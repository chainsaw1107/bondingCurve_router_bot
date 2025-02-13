import { ethers } from "ethers";
import { getRandomNumber, getRandomRunTime } from "./config/config";
import {
  tokenContract,
} from "./config/utils";
import { logger } from "./config/logger";
import {
  provider,
} from "./config/variables";
import wallets from "../wallets.json";
import {
  NUMBER_OF_WALLETS,
  MIN_TIME,
  MAX_TIME,
  TRANSACTION_COUNT,
  TOKEN_DECIMALS,
  MIN_SELL_QUANTITY,
  MAX_SELL_QUANTITY,
  BONDING_CURVE_ADDRESS,
  SELL_COUNT
} from "./config/constants";
import bondingCurveABI from "./config/abis/AgentKeyBondingCurve.json"
let transactionCount: number = TRANSACTION_COUNT;
interface WALLET_STATUS {
  wallet: ethers.Wallet;
  id: number;
}

let walletArray: WALLET_STATUS[] = [];
let count = 0;
const main = async () => {
  logger.info(`Randomly Selling`);
  for (let i = 0; i < NUMBER_OF_WALLETS; i++) {
    const wallet = new ethers.Wallet(wallets[i].privateKey, provider);
    walletArray = [...walletArray, { wallet, id: i }];
  }
  await sell();
};
export const sell = async () => {
  let walletAmount = walletArray.length;
  for (let i = 0; i < transactionCount; i++) {
    if (transactionCount > walletAmount) {
      transactionCount = walletAmount;
      i--;
      continue;
    }
    const bondingCurveContract = new ethers.Contract(BONDING_CURVE_ADDRESS, bondingCurveABI, provider);
    const bondingCurveWithWallet = bondingCurveContract.connect(walletArray[i].wallet);
    if (walletAmount === 0) {
      logger.info("Please create wallets.");
      process.exit(1);
    }
    let ethAmount = getRandomNumber(MIN_SELL_QUANTITY, MAX_SELL_QUANTITY);
    const tokenAmountSell = await bondingCurveWithWallet.calculateSellAmountIn(ethers.utils.parseEther(ethAmount));
    let tokenUnitAmount = ethers.utils.parseUnits(ethers.utils.formatUnits(tokenAmountSell.input), TOKEN_DECIMALS);
    // const EthBalance_wallet = await provider.getBalance(walletArray[i].wallet.address);
    let tokenbalance_wallet
    try {
      tokenbalance_wallet = await tokenContract.balanceOf(walletArray[i].wallet.address);
      console.log(`Wallet${i + 1}'s Balance: ${tokenbalance_wallet}`);
    } catch (error) {
      console.log(error);
    }
    if (tokenUnitAmount.gt(tokenbalance_wallet)) {
      walletArray = [...walletArray.filter((item, index) => index !== i)];
      walletAmount--;
      i--;
      continue;
    } else {
      try {
        const minOutput = await bondingCurveWithWallet.calculateSellAmountOut(tokenUnitAmount);
        const tx = await bondingCurveWithWallet.sell(tokenUnitAmount, minOutput.output);
        await tx.wait();
        console.log(`    https://base-sepolia.blockscout.com/tx/${tx.hash}`);
      } catch (error) {
        console.log(error);
      }
    }
  }
  count++;
  if (count >= SELL_COUNT) {
    logger.info('process is exited\n\t ');
    process.exit(1);
  }
  const wtime = getRandomRunTime(
    Number(process.env.MIN_TRADE_WAIT),
    Number(process.env.MAX_TRADE_WAIT)
  );
  console.log(`waiting ${wtime} miliseconds...`);
  setTimeout(sell, wtime);
  console.log(`We will exit this process after execution of ${SELL_COUNT - count} times`);
};

main();


