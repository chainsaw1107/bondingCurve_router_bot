import {
  SwapRouter,
} from "@uniswap/universal-router-sdk";
import {
  FlashbotsBundleProvider,
  FlashbotsBundleResolution,
  FlashbotsTransaction,
  FlashbotsBundleTransaction,
} from "@flashbots/ethers-provider-bundle";
import {
  TradeType,
  CurrencyAmount,
  Percent,
  QUOTER_ADDRESSES,
} from "@uniswap/sdk-core";
import { Trade as V2Trade } from "@uniswap/v2-sdk";
import { MixedRouteTrade, Trade as RouterTrade } from "@uniswap/router-sdk";
import { AllowanceProvider } from "@uniswap/permit2-sdk";
import {
  Pool,
  nearestUsableTick,
  TickMath,
  TICK_SPACINGS,
  FeeAmount,
  Trade as V3Trade,
  Route as RouteV3,
  computePoolAddress,
} from "@uniswap/v3-sdk";
import JSBI from "jsbi";
import { ethers, Wallet } from "ethers";
import { Boom } from "@hapi/boom";

import IUniswapV3Pool from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import Quoter from "@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json";
import agentkeyAbi from "./abis/AgentKey.json";
import permitAbi from "./abis/permit_abi.json";
import { ErrorMessage, ErrorStatusCode } from "./config";
import {
  SLIPPAGE,
  BUFFER,
  GAS_LIMIT,
  GAS_PRICE,
  TOKEN_ADDRESS,
  TOKEN_DECIMALS,
  FEE,
  FACTORY_ADDRESS
} from "./constants";

import {
  chainId,
  ETHER,
  mainWallet,
  PERMIT2_ADDRESS,
  provider,
  UNIVERSAL_SWAP_ROUTER,
  WETH,
  SWAPTOKEN,
} from "./variables";

// const FACTORY_ADDRESS = V3_CORE_FACTORY_ADDRESSES[chainId];
export const bondingCurveAddress = computePoolAddress({
  factoryAddress: FACTORY_ADDRESS,
  tokenA: WETH,
  tokenB: SWAPTOKEN,
  fee: FeeAmount[FEE],
});
export const tokenContract = new ethers.Contract(
  TOKEN_ADDRESS,
  agentkeyAbi,
  mainWallet
);
export const quoterContract = new ethers.Contract(
  QUOTER_ADDRESSES[chainId],
  Quoter.abi,
  mainWallet
);
let poolInfo: Pool = null;

const swapOptions = (signer, options) => {
  return Object.assign(
    {
      slippageTolerance: new Percent(Number(SLIPPAGE), 100),
      signer: signer.address,
      deadline: Math.floor(Date.now() / 1000) + 60 * 20,
    },
    options
  );
};

export const getPool = async (tokenA, tokenB, feeAmount, signer) => {
  try {
    const [token0, token1] = tokenA.sortsBefore(tokenB)
      ? [tokenA, tokenB]
      : [tokenB, tokenA];

    let poolAddress;

    try {
      poolAddress = await computePoolAddress({
        factoryAddress: FACTORY_ADDRESS,
        tokenA: token0,
        tokenB: token1,
        fee: feeAmount,
      });
    } catch (error) {
      throw new Boom(ErrorMessage[ErrorStatusCode.POOL_ADDRESS_NOT_FOUND], {
        data: ErrorStatusCode.POOL_ADDRESS_NOT_FOUND,
      });
    }

    const contract = new ethers.Contract(
      poolAddress,
      IUniswapV3Pool.abi,
      signer
    );

    let liquidity;
    try {
      liquidity = await contract.liquidity();
    } catch (error) {
      throw new Boom(ErrorMessage[ErrorStatusCode.LIQUIDITY_NOT_FOUND], {
        data: ErrorStatusCode.LIQUIDITY_NOT_FOUND,
      });
    }

    let { sqrtPriceX96, tick } = await contract.slot0();

    liquidity = JSBI.BigInt(liquidity.toString());
    sqrtPriceX96 = JSBI.BigInt(sqrtPriceX96.toString());

    return new Pool(token0, token1, feeAmount, sqrtPriceX96, liquidity, tick, [
      {
        index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
        liquidityNet: liquidity,
        liquidityGross: liquidity,
      },
      {
        index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
        liquidityNet: JSBI.multiply(liquidity, JSBI.BigInt("-1")),
        liquidityGross: liquidity,
      },
    ]);
  } catch (error) {
    throw new Boom(ErrorMessage[ErrorStatusCode.POOL_ADDRESS_NOT_FOUND], {
      data: ErrorStatusCode.POOL_ADDRESS_NOT_FOUND,
    });
  }
};

const buildTrade = (trades) => {
  return new RouterTrade({
    v2Routes: trades
      .filter((trade) => trade instanceof V2Trade)
      .map((trade) => ({
        routev2: trade.route,
        inputAmount: trade.inputAmount,
        outputAmount: trade.outputAmount,
      })),
    v3Routes: trades
      .filter((trade) => trade instanceof V3Trade)
      .map((trade) => ({
        routev3: trade.route,
        inputAmount: trade.inputAmount,
        outputAmount: trade.outputAmount,
      })),
    mixedRoutes: trades
      .filter((trade) => trade instanceof MixedRouteTrade)
      .map((trade) => ({
        mixedRoute: trade.route,
        inputAmount: trade.inputAmount,
        outputAmount: trade.outputAmount,
      })),
    tradeType: trades[0].tradeType,
  });
};

const universalRouterSwap = async (_signer: Wallet, routerTrade, type) => {
  try {
    const opts = swapOptions(_signer, {});
    const params = SwapRouter.swapERC20CallParameters(routerTrade, opts);
    const tx = {
      chainId: chainId,
      data: params.calldata,
      to: UNIVERSAL_SWAP_ROUTER,
      value: params.value,
      from: _signer.address,
      type: 2,
      gasLimit: GAS_LIMIT,
      nonce: await provider.getTransactionCount(_signer.address, 'latest'),
      // gasPrice: ethers.utils.parseUnits(GAS_PRICE, 'gwei'),
      maxFeePerGas: ethers.utils.parseUnits('18', 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('1', 'gwei'),
      // ccipReadEnabled: false,
      // to: walletExecutor.address,
      //   gasPrice: gasPrice,
      //   value: gasEstimateTotal.mul(gasPrice),
      //   gasLimit: 21000, 
    };
    if (!ethers.utils.isAddress(tx.to)) {
      console.error("Invalid 'to' address");
    }
    if (typeof tx.value !== "bigint" && typeof tx.value !== "string") {
      console.error("Transaction value should be a buffer or BigNumber");
    }
    return tx;
  } catch (error) {
    if (error.code === "INSUFFICIENT_FUNDS") {
      if (type === 1) {
        throw new Boom(ErrorMessage[ErrorStatusCode.INSUFFICIENT_FUNDS_BUY], {
          data: ErrorStatusCode.INSUFFICIENT_FUNDS_BUY,
        });
      } else {
        throw new Boom(ErrorMessage[ErrorStatusCode.INSUFFICIENT_FUNDS_SELL], {
          data: ErrorStatusCode.INSUFFICIENT_FUNDS_SELL,
        });
      }
    } else {
      throw new Boom(ErrorMessage[ErrorStatusCode.TRANSACTION_NOT_SENT], {
        data: ErrorStatusCode.TRANSACTION_NOT_SENT,
      });
    }
  }
};
export const simpleSwapEthToToken = async (
  _signer,
  _poolInfo,
  _tokenA,
  _tokenB,
  _quantity
) => {
  try {
    const outputToken = ethers.utils
      .parseUnits(_quantity, _tokenB.decimals)
      .toString();

    const trade = await V3Trade.fromRoute(
      new RouteV3([_poolInfo], ETHER, _tokenB),
      CurrencyAmount.fromRawAmount(_tokenB, outputToken),
      TradeType.EXACT_OUTPUT
    );

    const routerTrade = buildTrade([trade]);
    const transaction = await universalRouterSwap(
      _signer,
      routerTrade,
      TradeType.EXACT_OUTPUT
    );
    return transaction;
  } catch (error) {
    throw error;
  }
};

const simpleSwapTokenToEth = async (
  _signer,
  _poolInfo,
  _tokenA,
  _tokenB,
  _quantity
) => {
  try {
    const inputToken = ethers.utils
      .parseUnits(String(_quantity), _tokenB.decimals)
      .toString();

    const trade = await V3Trade.fromRoute(
      new RouteV3([_poolInfo], _tokenB, ETHER),
      CurrencyAmount.fromRawAmount(_tokenB, inputToken),
      TradeType.EXACT_INPUT
    );

    const routerTrade = buildTrade([trade]);
    await universalRouterSwap(_signer, routerTrade, TradeType.EXACT_INPUT);
  } catch (error) {
    throw error;
  }
};

export const buyToken = async (signer: Wallet, _tokenAmount: string) => {
  try {
    const EthBalance_wallet = await provider.getBalance(signer.address);
    const buffer = ethers.utils.parseEther(BUFFER.toString());

    if (EthBalance_wallet.lt(buffer)) {
      throw new Boom(ErrorMessage[ErrorStatusCode.INSUFFICIENT_ETH], {
        data: ErrorStatusCode.INSUFFICIENT_ETH,
      });
    }
    if (!poolInfo) {
      await getPool(WETH, SWAPTOKEN, FeeAmount[FEE], signer);
    }
    await simpleSwapEthToToken(signer, poolInfo, WETH, SWAPTOKEN, _tokenAmount);
  } catch (error) {
    throw error;
  }
};

export const sellToken = async (_signer: Wallet, _tokenAmount: string) => {
  try {
    let tokenQuantity = ethers.utils.parseUnits(_tokenAmount, TOKEN_DECIMALS);
    let tokenbalance_wallet = await tokenContract.balanceOf(_signer.address);

    if (tokenQuantity.gt(tokenbalance_wallet)) {
      throw new Boom(ErrorMessage[ErrorStatusCode.INSUFFICIENT_TOKEN], {
        data: ErrorStatusCode.INSUFFICIENT_TOKEN,
      });
    }
    const allowanceProvider = new AllowanceProvider(provider, PERMIT2_ADDRESS);
    const allowanceData = await allowanceProvider.getAllowanceData(
      TOKEN_ADDRESS,
      _signer.address,
      UNIVERSAL_SWAP_ROUTER
    );
    let allowedAmount = await tokenContract.allowance(
      _signer.address,
      PERMIT2_ADDRESS
    );
    if (
      allowedAmount <
      115792089237316195423570985008687907853269984665640564039457584007913129639935
    ) {
      try {
        console.log('-------------Start Approving--------------------');
        const approve = await tokenContract.approve(
          PERMIT2_ADDRESS,
          BigInt(
            '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
          ),
          {
            gasPrice: ethers.utils.parseUnits(GAS_PRICE, 'gwei'),
            gasLimit: GAS_LIMIT,
          }
        );
        await approve.wait();
      } catch (err) {
        throw new Boom(ErrorMessage[ErrorStatusCode.PERMIT2_NOT_APPROVE], {
          data: ErrorStatusCode.PERMIT2_NOT_APPROVE,
        });
      }
    }
    if (
      allowanceData.amount.lt(
        BigInt('0xffffffffffffffffffffffffffffffffffffffff')
      ) ||
      allowanceData.expiration < BigInt('0xffffffffffff')
    ) {
      try {
        console.log('-------------Start Approving--------------------');
        const permitContract = new ethers.Contract(
          PERMIT2_ADDRESS,
          permitAbi,
          _signer
        );
        const approve = await permitContract.approve(
          TOKEN_ADDRESS,
          UNIVERSAL_SWAP_ROUTER,
          BigInt('0xffffffffffffffffffffffffffffffffffffffff'),
          BigInt('0xffffffffffff'),
          {
            gasPrice: ethers.utils.parseUnits(GAS_PRICE, 'gwei'),
            gasLimit: GAS_LIMIT,
          }
        );
        await approve.wait();
        console.log('-------------------Approved----------------------');
      } catch (err) {
        throw new Boom(ErrorMessage[ErrorStatusCode.UNI_ROUTER_NOT_APPROVE], {
          data: ErrorStatusCode.UNI_ROUTER_NOT_APPROVE,
        });
      }
    }

    if (!poolInfo) {
      await getPool(WETH, SWAPTOKEN, FeeAmount[FEE], _signer);
    }
    await simpleSwapTokenToEth(
      _signer,
      poolInfo,
      WETH,
      SWAPTOKEN,
      _tokenAmount
    );
  } catch (error) {
    throw error;
  }
};

export const ErrorHandler = (error) => {
  console.log(error.message);
  process.exit(1);
};

export const sendAndConfirmBundle = async (bundle: Array<FlashbotsBundleTransaction>) => {
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    ethers.Wallet.createRandom()
  );
  const blockNumber = await provider.getBlockNumber();
  const targetBlock = blockNumber + 5;
  let signedBundledTransactions = await flashbotsProvider.signBundle(bundle);
  try {
    const simulation = await flashbotsProvider.simulate(signedBundledTransactions, targetBlock);
    // Using TypeScript discrimination
    if ('error' in simulation) {
      console.warn(`Simulation Error: ${simulation.error.message}`);
      process.exit(1);
    } else {
      console.log(`Simulation Success: ${JSON.stringify(simulation, null, 2)}`);
    }
    console.log('bundle submitted, waiting');
  } catch (error) {
  }
  const minTimestamp = (await provider.getBlock(blockNumber)).timestamp;
  const maxTimestamp = minTimestamp + 120;
  let flashbotsTransactionResponse: FlashbotsTransaction;
  try {
    flashbotsTransactionResponse = await flashbotsProvider.sendRawBundle(
      signedBundledTransactions,
      targetBlock,
      {
        minTimestamp,
        maxTimestamp
      }
    );
  } catch (error) {
    console.log(
      "===========flashbotsTransactionResponseError===========\n\n",
      error
    );
    console.error("Full Error: ", JSON.stringify(error, null, 2));
  }
  if ("wait" in flashbotsTransactionResponse) {
    // This block executes if flashbotsTransactionResponse has a wait method.
    let resolution;
    try {
      resolution = await flashbotsTransactionResponse.simulate();
    } catch (error) {
      console.log("========resolution===========", error);
    }
    if (resolution === FlashbotsBundleResolution.BundleIncluded) {
      for (const tx of flashbotsTransactionResponse.bundleTransactions) {
        console.log(`https://basescan.org/tx/${tx.hash}`);
      }
    }
  } else {
    console.error("Error sending transaction:", flashbotsTransactionResponse);
  }
};
