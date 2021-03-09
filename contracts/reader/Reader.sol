// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "../Type.sol";
import "../interface/ILiquidityPool.sol";
import "../interface/IOracle.sol";
import "../interface/IPoolCreator.sol";
import "../interface/ISymbolService.sol";
import "../interface/ISymbolService.sol";
import "../libraries/SafeMathExt.sol";

contract Reader {
    using SafeMathExt for uint256;

    struct LiquidityPoolReaderResult {
        bool isRunning;
        bool isFastCreationEnabled;
        // check Getter.sol for detail
        address[7] addresses;
        int256 vaultFeeRate;
        int256 poolCash;
        uint256[4] nums;
        PerpetualReaderResult[] perpetuals;
    }

    struct PerpetualReaderResult {
        PerpetualState state;
        address oracle;
        // check Getter.sol for detail
        int256[39] nums;
        uint256 symbol; // minimum number in the symbol service
        string underlyingAsset;
        bool isMarketClosed;
        int256 ammCashBalance;
        int256 ammPositionAmount;
    }

    struct AccountReaderResult {
        int256 cash;
        int256 position;
        int256 availableCash;
        int256 margin;
        int256 settleableMargin;
        bool isInitialMarginSafe;
        bool isMaintenanceMarginSafe;
        bool isMarginSafe;
    }

    /**
     * @notice Get the storage of the account in the perpetual
     * @param liquidityPool The address of the liquidity pool
     * @param perpetualIndex The index of the perpetual in the liquidity pool
     * @param account The address of the account
     *                Note: When account == liquidityPool, is*Safe are meanless. Do not forget to sum
     *                      poolCash and availableCash of all perpetuals in a liquidityPool when
     *                      calculating AMM margin
     * @return isSynced True if the funding state is synced to real-time data. False if
     *                  error happens (oracle error, zero price etc.). In this case,
     *                  trading, withdraw (if position != 0), addLiquidity, removeLiquidity
     *                  will fail
     * @return accountStorage The storage of the account in the perpetual
     */
    function getAccountStorage(
        address liquidityPool,
        uint256 perpetualIndex,
        address account
    ) public returns (bool isSynced, AccountReaderResult memory accountStorage) {
        try ILiquidityPool(liquidityPool).forceToSyncState() {
            isSynced = true;
        } catch {
            isSynced = false;
        }
        (
            accountStorage.cash,
            accountStorage.position,
            accountStorage.availableCash,
            accountStorage.margin,
            accountStorage.settleableMargin,
            accountStorage.isInitialMarginSafe,
            accountStorage.isMaintenanceMarginSafe,
            accountStorage.isMarginSafe
        ) = ILiquidityPool(liquidityPool).getMarginAccount(perpetualIndex, account);
    }

    /**
     * @notice Get the pool margin of the liquidity pool
     * @param liquidityPool The address of the liquidity pool
     * @return isSynced True if the funding state is synced to real-time data. False if
     *                  error happens (oracle error, zero price etc.). In this case,
     *                  trading, withdraw (if position != 0), addLiquidity, removeLiquidity
     *                  will fail
     * @return poolMargin The pool margin of the liquidity pool
     */
    function getPoolMargin(address liquidityPool)
        public
        returns (
            bool isSynced,
            int256 poolMargin,
            bool isSafe
        )
    {
        try ILiquidityPool(liquidityPool).forceToSyncState() {
            isSynced = true;
        } catch {
            isSynced = false;
        }
        address imp = ILiquidityPool(liquidityPool).implementation();
        if (isV004(imp)) {
            (poolMargin, isSafe) = getPoolMarginV004(liquidityPool);
        } else {
            (poolMargin, isSafe) = ILiquidityPool(liquidityPool).getPoolMargin();
        }
    }

    /**
     * @notice Get the status of the liquidity pool
     * @param liquidityPool The address of the liquidity pool
     * @return isSynced True if the funding state is synced to real-time data. False if
     *                  error happens (oracle error, zero price etc.). In this case,
     *                  trading, withdraw (if position != 0), addLiquidity, removeLiquidity
     *                  will fail
     * @return pool The status of the liquidity pool
     */
    function getLiquidityPoolStorage(address liquidityPool)
        public
        returns (bool isSynced, LiquidityPoolReaderResult memory pool)
    {
        try ILiquidityPool(liquidityPool).forceToSyncState() {
            isSynced = true;
        } catch {
            isSynced = false;
        }
        // pool
        (
            pool.isRunning,
            pool.isFastCreationEnabled,
            pool.addresses,
            pool.vaultFeeRate,
            pool.poolCash,
            pool.nums
        ) = ILiquidityPool(liquidityPool).getLiquidityPoolInfo();
        // perpetual
        uint256 perpetualCount = pool.nums[1];
        address creator = pool.addresses[0];
        address symbolService = IPoolCreator(creator).getSymbolService();
        pool.perpetuals = new PerpetualReaderResult[](perpetualCount);
        address imp = ILiquidityPool(liquidityPool).implementation();
        for (uint256 i = 0; i < perpetualCount; i++) {
            if (isV004(imp)) {
                getPerpetualV004(pool.perpetuals[i], symbolService, liquidityPool, i);
            } else {
                getPerpetual(pool.perpetuals[i], symbolService, liquidityPool, i);
            }
        }
    }

    function getPerpetual(
        PerpetualReaderResult memory perp,
        address symbolService,
        address liquidityPool,
        uint256 perpetualIndex
    ) private {
        // perpetual
        (perp.state, perp.oracle, perp.nums) = ILiquidityPool(liquidityPool).getPerpetualInfo(
            perpetualIndex
        );
        // read more from symbol service
        perp.symbol = getMinSymbol(symbolService, liquidityPool, perpetualIndex);
        // read more from oracle
        perp.underlyingAsset = IOracle(perp.oracle).underlyingAsset();
        perp.isMarketClosed = IOracle(perp.oracle).isMarketClosed();
        // read more from account
        (perp.ammCashBalance, perp.ammPositionAmount, , , , , , ) = ILiquidityPool(liquidityPool)
            .getMarginAccount(perpetualIndex, liquidityPool);
    }

    function getMinSymbol(
        address symbolService,
        address liquidityPool,
        uint256 perpetualIndex
    ) private view returns (uint256) {
        uint256[] memory symbols;
        symbols = ISymbolService(symbolService).getSymbols(liquidityPool, perpetualIndex);
        uint256 symbolLength = symbols.length;
        require(symbolLength >= 1, "symbol not found");
        uint256 minSymbol = type(uint256).max;
        for (uint256 i = 0; i < symbolLength; i++) {
            minSymbol = minSymbol.min(symbols[i]);
        }
        return minSymbol;
    }

    ////////////////////////////////////////////////////////////////////////////////////
    // back-compatible: beta0.0.4

    function isV004(address imp) private pure returns (bool) {
        // kovan
        if (imp == 0xBE190440CDaC7F82089C17DA73974aC8a5864Ef8) {
            return true;
        }
        return false;
    }

    function getPoolMarginV004(address liquidityPool)
        private view
        returns (
            int256 poolMargin,
            bool isSafe
        )
    {
        poolMargin = ILiquidityPool004(liquidityPool).getPoolMargin();
        isSafe = true;
    }

    function getPerpetualV004(
        PerpetualReaderResult memory perp,
        address symbolService,
        address liquidityPool,
        uint256 perpetualIndex
    ) private {
        // perpetual
        int256[34] memory nums;
        (perp.state, perp.oracle, nums) = ILiquidityPool004(liquidityPool).getPerpetualInfo(
            perpetualIndex
        );
        for (uint i = 0; i < 34; i++) {
            perp.nums[i] = nums[i];
        }
        perp.nums[34] = 0; // [34] openInterest
        perp.nums[35] = 100 * 10**18; // [35] maxOpenInterestRate
        perp.nums[36] = perp.nums[25]; // [25-27] fundingRateLimit value, min, max [36-38] fundingRateFactor value, min, max
        perp.nums[37] = perp.nums[26];
        perp.nums[38] = perp.nums[27];
        // read more from symbol service
        perp.symbol = getMinSymbol(symbolService, liquidityPool, perpetualIndex);
        // read more from oracle
        perp.underlyingAsset = IOracle(perp.oracle).underlyingAsset();
        perp.isMarketClosed = IOracle(perp.oracle).isMarketClosed();
        // read more from account
        (perp.ammCashBalance, perp.ammPositionAmount, , , , , , ) = ILiquidityPool(liquidityPool)
            .getMarginAccount(perpetualIndex, liquidityPool);
    }
}

////////////////////////////////////////////////////////////////////////////////////
// back-compatible: beta0.0.4

interface ILiquidityPool004 {
    function getPerpetualInfo(uint256 perpetualIndex)
        external
        view
        returns (
            PerpetualState state,
            address oracle,
            int256[34] memory nums
        );
    function getPoolMargin() external view returns (int256 poolMargin);
}
