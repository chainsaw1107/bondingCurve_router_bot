import { ethers } from 'ethers';
import { UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk';
import { Ether, Token, ChainId } from '@uniswap/sdk-core';
import { permit2Address } from '@uniswap/permit2-sdk';

import {
	RPC_ENDPOINT,
	PROVIDER_PRIVATE_KEY,
	TOKEN_ADDRESS,
	TOKEN_DECIMALS,
	COIN_ADDRESS
} from './constants';
export const provider = new ethers.providers.JsonRpcProvider(RPC_ENDPOINT);
export const mainWallet = new ethers.Wallet(
	String(PROVIDER_PRIVATE_KEY),
	provider
);
export const chainId = ChainId.BASE;
export const ETHER = Ether.onChain(Number(chainId));
export const WETH = new Token(
	84532,
	String(COIN_ADDRESS),
	18
);
export const SWAPTOKEN = new Token(
	84532,
	String(TOKEN_ADDRESS),
	TOKEN_DECIMALS
);
export const PERMIT2_ADDRESS = permit2Address(chainId);
export const UNIVERSAL_SWAP_ROUTER = UNIVERSAL_ROUTER_ADDRESS(chainId);
