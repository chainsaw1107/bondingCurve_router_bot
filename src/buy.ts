import { ethers } from "ethers";
import { getRandomNumber, getRandomRunTime } from "./config/config";
import { logger } from "./config/logger";
import { provider } from "./config/variables";
import wallets from "../wallets.json";
import {
  NUMBER_OF_WALLETS,
  MIN_TIME,
  MAX_TIME,
  TRANSACTION_COUNT,
  MIN_BUY_QUANTITY,
  MAX_BUY_QUANTITY,
  BUFFER,
  BUY_COUNT,
  BONDING_CURVE_ADDRESS
} from "./config/constants";
import JSBI from "jsbi";
import bondingCurveABI from "./config/abis/AgentKeyBondingCurve.json"
let transactionCount: number = TRANSACTION_COUNT;
interface WALLET_STATUS {
  wallet: ethers.Wallet;
  id: number;
}
let walletArray: WALLET_STATUS[] = [];
let count = 0;
// let timeout = getRandomRunTime(MIN_TIME, MAX_TIME);
const main = async () => {
  logger.info(`Randomly Buying`);
  // logger.info(`We will exit this process after ${timeout} miliseconds...`);
  for (let i = 0; i < NUMBER_OF_WALLETS; i++) {
    const wallet = new ethers.Wallet(wallets[i].privateKey, provider);
    walletArray = [...walletArray, { wallet, id: i }];
  }
  await buy();
};
export const buy = async () => {
  let walletAmount = walletArray.length;
  const bondingCurveContract = new ethers.Contract(BONDING_CURVE_ADDRESS, bondingCurveABI, provider);
  for (let i = 0; i < transactionCount; i++) {
    const bondingCurveWithWallet = bondingCurveContract.connect(walletArray[i].wallet);
    if (transactionCount > walletAmount) {
      transactionCount = walletAmount;
      i--;
      continue;
    }
    if (walletAmount === 0) {
      logger.info("Please create wallets.");
      process.exit(1);
    }
    let ethAmount = getRandomNumber(MIN_BUY_QUANTITY, MAX_BUY_QUANTITY);
    const EthBalance_wallet = await provider.getBalance(walletArray[i].wallet.address);
    console.log(`Wallet${i + 1}'s Balance: ${ethers.utils.formatEther(EthBalance_wallet)}`);
    const minOutput = await bondingCurveWithWallet.calculateBuyAmountOut(ethers.utils.parseEther(ethAmount));
    if (JSBI.lessThan(JSBI.BigInt(EthBalance_wallet), JSBI.add(JSBI.BigInt(ethers.utils.parseEther(ethAmount)), JSBI.BigInt(BUFFER * 10 ** 18)))) {
      walletArray = [...walletArray.filter((item, index) => index !== i)];
      walletAmount--;
      i--;
      continue;
    } else {
      try {
        const tx = await bondingCurveWithWallet.buy(minOutput.output, { value: ethers.utils.parseEther(ethAmount) });
        await tx.wait();
        console.log(`    https://base-sepolia.blockscout.com/tx/${tx.hash}`);
      } catch (error) {
        console.log(error);
      }
    }
  }
  count++;
  if (count >= BUY_COUNT) {
    logger.info('process is exited\n\t ');
    process.exit(1);
  }
  const wtime = getRandomRunTime(
    Number(process.env.MIN_TRADE_WAIT),
    Number(process.env.MAX_TRADE_WAIT)
  );
  console.log(`waiting ${wtime} miliseconds...`);
  setTimeout(buy, wtime);
  console.log(`We will exit this process after execution of ${BUY_COUNT - count} times`);
};

main();
