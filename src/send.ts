import { ethers } from 'ethers';
import wallets from '../wallets.json';
import { logger } from './config/logger';
import {
	GAS_LIMIT,
	GAS_PRICE,
	NUMBER_OF_WALLETS,
	SEND_COIN_AMOUNT,
	TRANSACTION_COUNT,
} from './config/constants';
import { provider, mainWallet } from './config/variables';
const sendEthToWallets = async () => {
	let mBalance = await mainWallet.getBalance();
	const gasPrice = await provider.getGasPrice(); 
	console.log(`Balance is : ${ethers.utils.formatEther(mBalance)} ETH`);
	for (let i = 0; i < Math.min(NUMBER_OF_WALLETS, TRANSACTION_COUNT); i++) {
		let wallet = new ethers.Wallet(wallets[i].privateKey, provider);
		let transaction = {
			to: wallet.address,
			value: ethers.utils.parseEther(SEND_COIN_AMOUNT),
			gasLimit: GAS_LIMIT,
			gasPrice: gasPrice
			// gasPrice: ethers.utils.parseUnits(GAS_PRICE, 'gwei'),
		};
		try {
			let tx = await mainWallet.sendTransaction(transaction);
			const receipt = await tx.wait();
			logger.info(`transaction ===> https://base-sepolia.blockscout.com/tx/${tx.hash}`);
		} catch (error) {
			console.log(error)
		}
	}
};
sendEthToWallets();
