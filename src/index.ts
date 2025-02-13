import { tokenContract } from "./config/utils";
import bondingCurveABI from "./config/abis/AgentKeyBondingCurve.json"
import { getRandomNumber, getRandomRunTime } from "./config/config";
import { ethers, logger } from "ethers";
import { BONDING_CURVE_ADDRESS, BUFFER, MAX_BUY_QUANTITY, MAX_SELL_QUANTITY, MAX_TIME, MIN_BUY_QUANTITY, MIN_SELL_QUANTITY, MIN_TIME, NUMBER_OF_WALLETS, TOKEN_DECIMALS, TRANSACTION_COUNT } from "./config/constants";
import wallets from "../wallets.json";
import { provider } from "./config/variables";
import JSBI from "jsbi";

let transactionCount: number = TRANSACTION_COUNT;
interface WALLET_STATUS {
  wallet: ethers.Wallet;
  id: number;
}
let walletArray: WALLET_STATUS[] = [];
let timeout = getRandomRunTime(MIN_TIME, MAX_TIME);
const main = async () => {
  logger.info(`Randomly Buying & Selling`);
  logger.info(`We will exit this process after ${timeout} miliseconds...`);
  for (let i = 0; i < NUMBER_OF_WALLETS; i++) {
    const wallet = new ethers.Wallet(wallets[i].privateKey, provider);
    walletArray = [...walletArray, { wallet, id: i }];
  }
  await runBot();
};
setInterval(() => {
  if (timeout === 0) {
    logger.info('process is exited\n\t Times up!');
    process.exit(1);
  }
  timeout--;
}, 1000);
const runBot = async () => {
  let walletAmount = walletArray.length;
  const bondingCurveContract = new ethers.Contract(BONDING_CURVE_ADDRESS, bondingCurveABI, provider);
  // walletArray = [...shuffle(walletArray)];
  for (let i = 0; i < Math.min(transactionCount, walletAmount); i++) {
    const bondingCurveWithWallet = bondingCurveContract.connect(walletArray[i].wallet);
    if (walletAmount === 0) {
      logger.info("Please create wallets.");
      process.exit(1);
    }
    const rnt = getRandomRunTime(1, 2);
    // 1: buy   2: sell
    if (rnt == 1) {
      let ethAmount = getRandomNumber(MIN_BUY_QUANTITY, MAX_BUY_QUANTITY);
      const EthBalance_wallet = await provider.getBalance(walletArray[i].wallet.address);
      if (JSBI.lessThan(JSBI.BigInt(EthBalance_wallet), JSBI.add(JSBI.BigInt(ethers.utils.parseEther(ethAmount)), JSBI.BigInt(BUFFER * 10 ** 18)))) {
        //start selling …
        const tokenAmountSell = await bondingCurveWithWallet.calculateSellAmountIn(ethers.utils.parseEther(ethAmount));
        let tokenUnitAmount = ethers.utils.parseUnits(ethers.utils.formatUnits(tokenAmountSell.input), TOKEN_DECIMALS);
        const tokenbalance_wallet = await tokenContract.balanceOf(walletArray[i].wallet.address);
        if (tokenUnitAmount.gt(tokenbalance_wallet)) {
          walletArray = [...walletArray.filter((item, index) => index !== i)];
          walletAmount--;
          i--;
          continue;
        } else {
          console.log(`---------------------- Will sell ----------------------`);
          try {
            const minOutput = await bondingCurveWithWallet.calculateSellAmountOut(tokenUnitAmount);
            const tx = await bondingCurveWithWallet.sell(tokenUnitAmount, minOutput.output);
            await tx.wait();
            console.log(`Wallet${i + 1}'s Token Balance: ${ethers.utils.formatUnits(await tokenContract.balanceOf(walletArray[i].wallet.address))}`);
            console.log(`   Explorer  ----------->  https://base-sepolia.blockscout.com/tx/${tx.hash}    >>>>>>Nonce: ${tx.nonce}\n`);
          } catch (error) {
            console.log(error);
          }
        }
      } else {
        //start buying …
        console.log(`------------------ Will buy ------------------`);
        try {
          const minOutput = await bondingCurveWithWallet.calculateBuyAmountOut(ethers.utils.parseEther(ethAmount));
          const tx = await bondingCurveWithWallet.buy(minOutput.output, { value: ethers.utils.parseEther(ethAmount) });
          await tx.wait();
          console.log(`Wallet${i + 1}'s Ether Balance: ${ethers.utils.formatEther(await provider.getBalance(walletArray[i].wallet.address))}`);
          console.log(`   Explorer  ----------->  https://base-sepolia.blockscout.com/tx/${tx.hash}      >>>>>>Nonce: ${tx.nonce}\n`);
        } catch (error) {
          console.log(error);
        }
      }
    } else {
      let ethAmount = getRandomNumber(MIN_SELL_QUANTITY, MAX_SELL_QUANTITY);
      const tokenAmountSell = await bondingCurveWithWallet.calculateSellAmountIn(ethers.utils.parseEther(ethAmount));
      let tokenUnitAmount = ethers.utils.parseUnits(ethers.utils.formatUnits(tokenAmountSell.input), TOKEN_DECIMALS);
      let tokenbalance_wallet = await tokenContract.balanceOf(walletArray[i].wallet.address);
      if (tokenUnitAmount.gt(tokenbalance_wallet)) {
        //start buying …
        const EthBalance_wallet = await provider.getBalance(walletArray[i].wallet.address);
        const minOutput = await bondingCurveWithWallet.calculateBuyAmountOut(ethers.utils.parseEther(ethAmount));
        if (JSBI.lessThan(JSBI.BigInt(EthBalance_wallet), JSBI.add(JSBI.BigInt(ethers.utils.parseEther(ethAmount)), JSBI.BigInt(BUFFER * 10 ** 18)))) {
          walletArray = [...walletArray.filter((item, index) => index !== i)];
          walletAmount--;
          i--;
          continue;
        } else {
          console.log(`---------------------- Will buy ----------------------`);
          try {
            const tx = await bondingCurveWithWallet.buy(minOutput.output, { value: ethers.utils.parseEther(ethAmount) });
            await tx.wait();
            console.log(`Wallet${i + 1}'s Ether Balance: ${ethers.utils.formatEther(await provider.getBalance(walletArray[i].wallet.address))}`);
            console.log(`   Explorer  ----------->  https://base-sepolia.blockscout.com/tx/${tx.hash}      >>>>>>Nonce: ${tx.nonce}\n`);
          } catch (error) {
            console.log(error);
          }
        }
      } else {
        //start selling …
        console.log(`------------------ Will sell ------------------`);
        try {
          const minOutput = await bondingCurveWithWallet.calculateSellAmountOut(tokenUnitAmount);
          const tx = await bondingCurveWithWallet.sell(tokenUnitAmount, minOutput.output);
          await tx.wait();
          console.log(`Wallet${i}'s Token Balance: ${ethers.utils.formatUnits(await tokenContract.balanceOf(walletArray[i].wallet.address))}`);
          console.log(`   Explorer  ----------->   https://base-sepolia.blockscout.com/tx/${tx.hash}     >>>>>>Nonce: ${tx.nonce}\n`);
        } catch (error) {
          console.log(error);
        }
      }
    }
  };
  const wtime = getRandomRunTime(
    Number(process.env.MIN_TRADE_WAIT),
    Number(process.env.MAX_TRADE_WAIT)
  );
  console.log(`waiting ${wtime} miliseconds...`);
  setTimeout(runBot, wtime);
  console.log(`We will exit this process after ${timeout} seconds...`);
};
main();
