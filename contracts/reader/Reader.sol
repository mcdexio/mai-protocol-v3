// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/Address.sol";
import "../Type.sol";
import "../interface/ILiquidityPoolFull.sol";
import "../interface/IPoolCreatorFull.sol";
import "../interface/IOracle.sol";
import "../interface/ISymbolService.sol";
import "../interface/ISymbolService.sol";
import "../libraries/SafeMathExt.sol";
import "../libraries/Constant.sol";

interface IInverseStateService {
    function isInverse(address liquidityPool, uint256 perpetualIndex) external view returns (bool);
}

contract Reader {
    using SafeMathExt for uint256;
    using Address for address;

    IInverseStateService public immutable inverseStateService;

    struct LiquidityPoolReaderResult {
        bool isRunning;
        bool isFastCreationEnabled;
        // check Getter.sol for detail
        address[7] addresses;
        int256[5] intNums;
        uint256[4] uintNums;
        PerpetualReaderResult[] perpetuals;
        bool isAMMMaintenanceSafe;
    }

    struct PerpetualReaderResult {
        PerpetualState state;
        address oracle;
        // check Getter.sol for detail
        int256[39] nums;
        uint256 symbol; // minimum number in the symbol service
        string underlyingAsset;
        bool isMarketClosed;
        bool isTerminated;
        int256 ammCashBalance;
        int256 ammPositionAmount;
        bool isInversePerpetual;
    }

    struct AccountReaderResult {
        int256 cash;
        int256 position;
        int256 availableMargin;
        int256 margin;
        int256 settleableMargin;
        bool isInitialMarginSafe;
        bool isMaintenanceMarginSafe;
        bool isMarginSafe;
        int256 targetLeverage;
    }

    struct AccountsResult {
        address account;
        int256 position;
        int256 margin;
        bool isSafe;
    }

    constructor(address inverseStateService_) {
        require(inverseStateService_.isContract(), "inverseStateService must be contract");
        inverseStateService = IInverseStateService(inverseStateService_);
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
        (bool success, bytes memory data) = liquidityPool.call(
            abi.encodeWithSignature("getMarginAccount(uint256,address)", perpetualIndex, account)
        );
        require(success, "fail to retrieve margin account");
        accountStorage = _parseMarginAccount(data);
    }

    /**
     * @notice If amm is maintenance safe. Function setEmergencyState will revert only if amm is not maintenance margin safe.
     *
     *         NOTE: this should NOT be called on chain.
     * @param  liquidityPool The address of the liquidity pool.
     * @return bool          True if amm is maintenance margin safe.
     */
    function isAMMMaintenanceSafe(address liquidityPool) public returns (bool) {
        (, , , , uint256[4] memory uintNums) = ILiquidityPoolFull(liquidityPool)
            .getLiquidityPoolInfo();
        // perpetual count
        if (uintNums[1] == 0) {
            return true;
        }
        try
            ILiquidityPoolGovernance(liquidityPool).setEmergencyState(
                Constant.SET_ALL_PERPETUALS_TO_EMERGENCY_STATE
            )
        {
            return false;
        } catch {
            return true;
        }
    }

    function _parseMarginAccount(bytes memory data)
        internal
        pure
        returns (AccountReaderResult memory accountStorage)
    {
        require(data.length % 0x20 == 0, "malformed input data");
        assembly {
            let len := mload(data)
            let src := add(data, 0x20)
            let dst := accountStorage
            for {
                let end := add(src, len)
            } lt(src, end) {
                src := add(src, 0x20)
                dst := add(dst, 0x20)
            } {
                mstore(dst, mload(src))
            }
        }
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
        (poolMargin, isSafe) = ILiquidityPoolFull(liquidityPool).getPoolMargin();
    }

    /**
     * @notice  Query the price, fees and cost when trade agaist amm.
     *          The trading price is determined by the AMM based on the index price of the perpetual.
     *
     *          Flags is a 32 bit uint value which indicates: (from highest bit)
     *            - close only      only close position during trading;
     *            - market order    do not check limit price during trading;
     *            - stop loss       only available in brokerTrade mode;
     *            - take profit     only available in brokerTrade mode;
     *          For stop loss and take profit, see `validateTriggerPrice` in OrderModule.sol for details.
     *
     * @param   perpetualIndex  The index of the perpetual in liquidity pool.
     * @param   trader          The address of trader.
     * @param   amount          The amount of position to trader, positive for buying and negative for selling. The amount always use decimals 18.
     * @param   referrer        The address of referrer who will get rebate from the deal.
     * @param   flags           The flags of the trade.
     * @return  isSynced        True if the funding state is synced to real-time data. False if
     *                          error happens (oracle error, zero price etc.). In this case,
     *                          trading, withdraw (if position != 0), addLiquidity, removeLiquidity
     *                          will fail
     * @return  tradePrice      The average fill price.
     * @return  totalFee        The total fee collected from the trader after the trade.
     * @return  cost            Deposit or withdraw to let effective leverage == targetLeverage if flags contain USE_TARGET_LEVERAGE. > 0 if deposit, < 0 if withdraw.
     */
    function queryTrade(
        address liquidityPool,
        uint256 perpetualIndex,
        address trader,
        int256 amount,
        address referrer,
        uint32 flags
    )
        external
        returns (
            bool isSynced,
            int256 tradePrice,
            int256 totalFee,
            int256 cost
        )
    {
        try ILiquidityPool(liquidityPool).forceToSyncState() {
            isSynced = true;
        } catch {
            isSynced = false;
        }
        (tradePrice, totalFee, cost) = ILiquidityPoolFull(liquidityPool).queryTrade(
            perpetualIndex,
            trader,
            amount,
            referrer,
            flags
        );
    }

    /**
     * @notice Get the status of the liquidity pool
     *
     *         NOTE: this should NOT be called on chain.
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
            pool.intNums,
            pool.uintNums
        ) = ILiquidityPoolFull(liquidityPool).getLiquidityPoolInfo();
        // perpetual
        uint256 perpetualCount = pool.uintNums[1];
        address symbolService = IPoolCreatorFull(pool.addresses[0]).getSymbolService();
        pool.perpetuals = new PerpetualReaderResult[](perpetualCount);
        for (uint256 i = 0; i < perpetualCount; i++) {
            getPerpetual(pool.perpetuals[i], symbolService, liquidityPool, i);
        }
        // leave this dangerous line at the end
        pool.isAMMMaintenanceSafe = true;
        if (perpetualCount > 0) {
            try
                ILiquidityPoolGovernance(liquidityPool).setEmergencyState(
                    Constant.SET_ALL_PERPETUALS_TO_EMERGENCY_STATE
                )
            {
                pool.isAMMMaintenanceSafe = false;
            } catch {}
        }
    }

    function getPerpetual(
        PerpetualReaderResult memory perp,
        address symbolService,
        address liquidityPool,
        uint256 perpetualIndex
    ) private {
        // perpetual
        (perp.state, perp.oracle, perp.nums) = ILiquidityPoolFull(liquidityPool).getPerpetualInfo(
            perpetualIndex
        );
        // read more from symbol service
        perp.symbol = getMinSymbol(symbolService, liquidityPool, perpetualIndex);
        // read more from oracle
        perp.underlyingAsset = IOracle(perp.oracle).underlyingAsset();
        perp.isMarketClosed = IOracle(perp.oracle).isMarketClosed();
        perp.isTerminated = IOracle(perp.oracle).isTerminated();
        // read more from account
        (perp.ammCashBalance, perp.ammPositionAmount, , , , , , , ) = ILiquidityPoolFull(
            liquidityPool
        ).getMarginAccount(perpetualIndex, liquidityPool);
        // read more from inverse service
        perp.isInversePerpetual = inverseStateService.isInverse(liquidityPool, perpetualIndex);
    }

    function readIndexPrices(address[] memory oracles)
        public
        returns (bool[] memory isSuccess, int256[] memory indexPrices, uint256[] memory timestamps)
    {
        isSuccess = new bool[](oracles.length);
        indexPrices = new int256[](oracles.length);
        timestamps = new uint256[](oracles.length);
        for (uint256 i = 0; i < oracles.length; i++) {
            if (!oracles[i].isContract()) {
                continue;
            }
            try IOracle(oracles[i]).priceTWAPShort() returns (int256 indexPrice, uint256 timestamp) {
                isSuccess[i] = true;
                indexPrices[i] = indexPrice;
                timestamps[i] = timestamp;
            } catch {}
        }
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

    /**
     * @notice  Get the info of active accounts in the perpetual whose index within range [begin, end).
     * @param   liquidityPool   The address of the liquidity pool
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool.
     * @param   begin           The begin index of account to retrieve.
     * @param   end             The end index of account, exclusive.
     * @return  isSynced        True if the funding state is synced to real-time data. False if
     *                          error happens (oracle error, zero price etc.). In this case,
     *                          trading, withdraw (if position != 0), addLiquidity, removeLiquidity
     *                          will fail
     * @return  result          An array of active accounts' info.
     */
    function getAccountsInfo(
        address liquidityPool,
        uint256 perpetualIndex,
        uint256 begin,
        uint256 end
    ) public returns (bool isSynced, AccountsResult[] memory result) {
        address[] memory accounts = ILiquidityPoolFull(liquidityPool).listActiveAccounts(
            perpetualIndex,
            begin,
            end
        );
        return getAccountsInfoByAddress(liquidityPool, perpetualIndex, accounts);
    }

    /**
     * @notice  Get the info of given accounts.
     * @param   liquidityPool   The address of the liquidity pool
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool.
     * @param   accounts        Account addresses.
     * @return  isSynced        True if the funding state is synced to real-time data. False if
     *                          error happens (oracle error, zero price etc.). In this case,
     *                          trading, withdraw (if position != 0), addLiquidity, removeLiquidity
     *                          will fail
     * @return  result          An array of active accounts' info.
     */
    function getAccountsInfoByAddress(
        address liquidityPool,
        uint256 perpetualIndex,
        address[] memory accounts
    ) public returns (bool isSynced, AccountsResult[] memory result) {
        try ILiquidityPool(liquidityPool).forceToSyncState() {
            isSynced = true;
        } catch {
            isSynced = false;
        }
        result = new AccountsResult[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            int256 margin;
            int256 position;
            bool isMaintenanceMarginSafe;
            (, position, , margin, , , isMaintenanceMarginSafe, , ) = ILiquidityPoolFull(
                liquidityPool
            ).getMarginAccount(perpetualIndex, accounts[i]);
            result[i].account = accounts[i];
            result[i].position = position;
            result[i].margin = margin;
            result[i].isSafe = isMaintenanceMarginSafe;
        }
    }

    /**
     * @notice  Query cash to add / share to mint when adding liquidity to the liquidity pool.
     *          Only one of cashToAdd or shareToMint may be non-zero.
     *
     * @param   liquidityPool     The address of the liquidity pool
     * @param   cashToAdd         The amount of cash to add, always use decimals 18.
     * @param   shareToMint       The amount of share token to mint, always use decimals 18.
     * @return  isSynced          True if the funding state is synced to real-time data. False if
     *                            error happens (oracle error, zero price etc.). In this case,
     *                            trading, withdraw (if position != 0), addLiquidity, removeLiquidity
     *                            will fail
     * @return  cashToAddResult   The amount of cash to add, always use decimals 18. Equal to cashToAdd if cashToAdd is non-zero.
     * @return  shareToMintResult The amount of cash to add, always use decimals 18. Equal to shareToMint if shareToMint is non-zero.
     */
    function queryAddLiquidity(
        address liquidityPool,
        int256 cashToAdd,
        int256 shareToMint
    )
        public
        returns (
            bool isSynced,
            int256 cashToAddResult,
            int256 shareToMintResult
        )
    {
        try ILiquidityPool(liquidityPool).forceToSyncState() {
            isSynced = true;
        } catch {
            isSynced = false;
        }
        (cashToAddResult, shareToMintResult) = ILiquidityPoolFull(liquidityPool).queryAddLiquidity(
            cashToAdd,
            shareToMint
        );
    }

    /**
     * @notice  Query cash to return / share to redeem when removing liquidity from the liquidity pool.
     *          Only one of shareToRemove or cashToReturn may be non-zero.
     *
     * @param   liquidityPool       The address of the liquidity pool
     * @param   cashToReturn        The amount of cash to return, always use decimals 18.
     * @param   shareToRemove       The amount of share token to redeem, always use decimals 18.
     * @return  isSynced            True if the funding state is synced to real-time data. False if
     *                              error happens (oracle error, zero price etc.). In this case,
     *                              trading, withdraw (if position != 0), addLiquidity, removeLiquidity
     *                              will fail
     * @return  shareToRemoveResult The amount of share token to redeem, always use decimals 18. Equal to shareToRemove if shareToRemove is non-zero.
     * @return  cashToReturnResult  The amount of cash to return, always use decimals 18. Equal to cashToReturn if cashToReturn is non-zero.
     */
    function queryRemoveLiquidity(
        address liquidityPool,
        int256 shareToRemove,
        int256 cashToReturn
    )
        public
        returns (
            bool isSynced,
            int256 shareToRemoveResult,
            int256 cashToReturnResult
        )
    {
        try ILiquidityPool(liquidityPool).forceToSyncState() {
            isSynced = true;
        } catch {
            isSynced = false;
        }
        (shareToRemoveResult, cashToReturnResult) = ILiquidityPoolFull(liquidityPool)
            .queryRemoveLiquidity(shareToRemove, cashToReturn);
    }
}
