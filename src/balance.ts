import { tokenContract } from './config/utils';
import { ethers } from 'ethers';
import { NUMBER_OF_WALLETS, TRANSACTION_COUNT } from './config/constants';
import wallets from "../wallets.json";
import { mainWallet, provider } from './config/variables';

interface WALLET_STATUS {
	wallet: ethers.Wallet;
	id: number;
}
let transactionCount: number = TRANSACTION_COUNT;
let walletArray: WALLET_STATUS[] = [];
for (let i = 0; i < NUMBER_OF_WALLETS; i++) {
	const wallet = new ethers.Wallet(wallets[i].privateKey, provider);
	walletArray = [...walletArray, { wallet, id: i }];
}
let walletAmount = walletArray.length;
const balance = async () => {
	let mBalance = await mainWallet.getBalance();
	console.log("Main wallet Balance is : ", ethers.utils.formatEther(mBalance), "\n\n");
	for (let i = 0; i < transactionCount; i++) {
		if (transactionCount > walletAmount) {
			transactionCount = walletAmount;
			i--;
			continue;
		}
		if (walletAmount === 0) {
			console.log("Please create wallets.");
			process.exit(1);
		}
		const EthBalance_wallet = await provider.getBalance(walletArray[i].wallet.address);
		const tokenbalance_wallet = await tokenContract.balanceOf(walletArray[i].wallet.address);
		console.log(`Wallet${i + 1}'s ether Balance: ${ethers.utils.formatEther(EthBalance_wallet)}`);
		console.log(`Wallet${i + 1}'s token Balance: ${ethers.utils.formatUnits(tokenbalance_wallet)}\n`);
	}
	return;
}
balance();