// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";

import "../interface/IOracle.sol";
import "../libraries/SafeMathExt.sol";
import "../libraries/Utils.sol";
import "../Type.sol";
import "./MarginAccountModule.sol";

library PerpetualModule {
    using SafeMathUpgradeable for uint256;
    using SafeMathExt for int256;
    using SafeCastUpgradeable for int256;
    using SafeCastUpgradeable for uint256;
    using AddressUpgradeable for address;
    using SignedSafeMathUpgradeable for int256;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using MarginAccountModule for PerpetualStorage;

    int256 constant FUNDING_INTERVAL = 3600 * 8;

    uint256 internal constant INDEX_INITIAL_MARGIN_RATE = 0;
    uint256 internal constant INDEX_MAINTENANCE_MARGIN_RATE = 1;
    uint256 internal constant INDEX_OPERATOR_FEE_RATE = 2;
    uint256 internal constant INDEX_LP_FEE_RATE = 3;
    uint256 internal constant INDEX_REFERRAL_REBATE_RATE = 4;
    uint256 internal constant INDEX_LIQUIDATION_PENALTY_RATE = 5;
    uint256 internal constant INDEX_KEEPER_GAS_REWARD = 6;
    uint256 internal constant INDEX_INSURANCE_FUND_RATE = 7;
    uint256 internal constant INDEX_MAX_OPEN_INTEREST_RATE = 8;

    uint256 internal constant INDEX_HALF_SPREAD = 0;
    uint256 internal constant INDEX_OPEN_SLIPPAGE_FACTOR = 1;
    uint256 internal constant INDEX_CLOSE_SLIPPAGE_FACTOR = 2;
    uint256 internal constant INDEX_FUNDING_RATE_LIMIT = 3;
    uint256 internal constant INDEX_AMM_MAX_LEVERAGE = 4;
    uint256 internal constant INDEX_AMM_CLOSE_PRICE_DISCOUNT = 5;
    uint256 internal constant INDEX_FUNDING_RATE_FACTOR = 6;
    uint256 internal constant INDEX_DEFAULT_TARGET_LEVERAGE = 7;
    uint256 internal constant INDEX_BASE_FUNDING_RATE = 8;

    event Deposit(uint256 perpetualIndex, address indexed trader, int256 amount);
    event Withdraw(uint256 perpetualIndex, address indexed trader, int256 amount);
    event Clear(uint256 perpetualIndex, address indexed trader);
    event Settle(uint256 perpetualIndex, address indexed trader, int256 amount);
    event SetNormalState(uint256 perpetualIndex);
    event SetEmergencyState(uint256 perpetualIndex, int256 settlementPrice, uint256 settlementTime);
    event SetClearedState(uint256 perpetualIndex);
    event UpdateUnitAccumulativeFunding(uint256 perpetualIndex, int256 unitAccumulativeFunding);
    event SetPerpetualBaseParameter(uint256 perpetualIndex, int256[9] baseParams);
    event SetPerpetualRiskParameter(
        uint256 perpetualIndex,
        int256[9] riskParams,
        int256[9] minRiskParamValues,
        int256[9] maxRiskParamValues
    );
    event UpdatePerpetualRiskParameter(uint256 perpetualIndex, int256[9] riskParams);
    event SetOracle(uint256 perpetualIndex, address indexed oldOracle, address indexed newOracle);
    event UpdatePrice(
        uint256 perpetualIndex,
        address indexed oracle,
        int256 markPrice,
        uint256 markPriceUpdateTime,
        int256 indexPrice,
        uint256 indexPriceUpdateTime
    );
    event UpdateFundingRate(uint256 perpetualIndex, int256 fundingRate);

    /**
     * @dev     Get the mark price of the perpetual. If the state of the perpetual is not "NORMAL",
     *          return the settlement price
     * @param   perpetual   The reference of perpetual storage.
     * @return  markPrice   The mark price of current perpetual.
     */
    function getMarkPrice(PerpetualStorage storage perpetual)
        internal
        view
        returns (int256 markPrice)
    {
        markPrice = perpetual.state == PerpetualState.NORMAL
            ? perpetual.markPriceData.price
            : perpetual.settlementPriceData.price;
    }

    /**
     * @dev     Get the index price of the perpetual. If the state of the perpetual is not "NORMAL",
     *          return the settlement price
     * @param   perpetual   The reference of perpetual storage.
     * @return  indexPrice  The index price of current perpetual.
     */
    function getIndexPrice(PerpetualStorage storage perpetual)
        internal
        view
        returns (int256 indexPrice)
    {
        indexPrice = perpetual.state == PerpetualState.NORMAL
            ? perpetual.indexPriceData.price
            : perpetual.settlementPriceData.price;
    }

    /**
     * @dev     Get the margin to rebalance in the perpetual.
     *          Margin to rebalance = margin - initial margin
     * @param   perpetual The perpetual object
     * @return  marginToRebalance The margin to rebalance in the perpetual
     */
    function getRebalanceMargin(PerpetualStorage storage perpetual)
        public
        view
        returns (int256 marginToRebalance)
    {
        int256 price = getMarkPrice(perpetual);
        marginToRebalance = perpetual.getMargin(address(this), price).sub(
            perpetual.getInitialMargin(address(this), price)
        );
    }

    /**
     * @dev     Initialize the perpetual. Set up its configuration and validate parameters.
     *          If the validation passed, set the state of perpetual to "INITIALIZING"
     *          [minRiskParamValues, maxRiskParamValues] represents the range that the operator could
     *          update directly without proposal.
     *
     * @param   perpetual           The reference of perpetual storage.
     * @param   id                  The id of the perpetual (currently the index of perpetual)
     * @param   oracle              The address of oracle contract.
     * @param   baseParams          An int array of base parameter values.
     * @param   riskParams          An int array of risk parameter values.
     * @param   minRiskParamValues  An int array of minimal risk parameter values.
     * @param   maxRiskParamValues  An int array of maximum risk parameter values.
     */
    function initialize(
        PerpetualStorage storage perpetual,
        uint256 id,
        address oracle,
        int256[9] calldata baseParams,
        int256[9] calldata riskParams,
        int256[9] calldata minRiskParamValues,
        int256[9] calldata maxRiskParamValues
    ) public {
        perpetual.id = id;
        setOracle(perpetual, oracle);
        setBaseParameter(perpetual, baseParams);
        setRiskParameter(perpetual, riskParams, minRiskParamValues, maxRiskParamValues);
        perpetual.state = PerpetualState.INITIALIZING;
    }

    /**
     * @dev     Set oracle address of perpetual. New oracle must be different from the old one.
     *
     * @param   perpetual   The reference of perpetual storage.
     * @param   newOracle   The address of new oracle contract.
     */
    function setOracle(PerpetualStorage storage perpetual, address newOracle) public {
        require(newOracle != perpetual.oracle, "oracle not changed");
        validateOracle(newOracle);
        emit SetOracle(perpetual.id, perpetual.oracle, newOracle);
        perpetual.oracle = newOracle;
    }

    /**
     * @dev     Set the base parameter of the perpetual. Can only called by the governor
     * @param   perpetual   The perpetual object
     * @param   baseParams  The new value of the base parameter
     */
    function setBaseParameter(PerpetualStorage storage perpetual, int256[9] memory baseParams)
        public
    {
        validateBaseParameters(perpetual, baseParams);
        perpetual.initialMarginRate = baseParams[INDEX_INITIAL_MARGIN_RATE];
        perpetual.maintenanceMarginRate = baseParams[INDEX_MAINTENANCE_MARGIN_RATE];
        perpetual.operatorFeeRate = baseParams[INDEX_OPERATOR_FEE_RATE];
        perpetual.lpFeeRate = baseParams[INDEX_LP_FEE_RATE];
        perpetual.referralRebateRate = baseParams[INDEX_REFERRAL_REBATE_RATE];
        perpetual.liquidationPenaltyRate = baseParams[INDEX_LIQUIDATION_PENALTY_RATE];
        perpetual.keeperGasReward = baseParams[INDEX_KEEPER_GAS_REWARD];
        perpetual.insuranceFundRate = baseParams[INDEX_INSURANCE_FUND_RATE];
        perpetual.maxOpenInterestRate = baseParams[INDEX_MAX_OPEN_INTEREST_RATE];
        emit SetPerpetualBaseParameter(perpetual.id, baseParams);
    }

    /**
     * @dev     Set the risk parameter of the perpetual. New parameters will be validate first to apply.
     *          Using group set instead of one-by-one set to avoid revert due to constrains between values.
     *
     * @param   perpetual           The reference of perpetual storage.
     * @param   riskParams          An int array of risk parameter values.
     * @param   minRiskParamValues  An int array of minimal risk parameter values.
     * @param   maxRiskParamValues  An int array of maximum risk parameter values.
     */
    function setRiskParameter(
        PerpetualStorage storage perpetual,
        int256[9] memory riskParams,
        int256[9] memory minRiskParamValues,
        int256[9] memory maxRiskParamValues
    ) public {
        validateRiskParameters(perpetual, riskParams);
        setOption(
            perpetual.halfSpread,
            riskParams[INDEX_HALF_SPREAD],
            minRiskParamValues[INDEX_HALF_SPREAD],
            maxRiskParamValues[INDEX_HALF_SPREAD]
        );
        setOption(
            perpetual.openSlippageFactor,
            riskParams[INDEX_OPEN_SLIPPAGE_FACTOR],
            minRiskParamValues[INDEX_OPEN_SLIPPAGE_FACTOR],
            maxRiskParamValues[INDEX_OPEN_SLIPPAGE_FACTOR]
        );
        setOption(
            perpetual.closeSlippageFactor,
            riskParams[INDEX_CLOSE_SLIPPAGE_FACTOR],
            minRiskParamValues[INDEX_CLOSE_SLIPPAGE_FACTOR],
            maxRiskParamValues[INDEX_CLOSE_SLIPPAGE_FACTOR]
        );
        setOption(
            perpetual.fundingRateLimit,
            riskParams[INDEX_FUNDING_RATE_LIMIT],
            minRiskParamValues[INDEX_FUNDING_RATE_LIMIT],
            maxRiskParamValues[INDEX_FUNDING_RATE_LIMIT]
        );
        setOption(
            perpetual.ammMaxLeverage,
            riskParams[INDEX_AMM_MAX_LEVERAGE],
            minRiskParamValues[INDEX_AMM_MAX_LEVERAGE],
            maxRiskParamValues[INDEX_AMM_MAX_LEVERAGE]
        );
        setOption(
            perpetual.maxClosePriceDiscount,
            riskParams[INDEX_AMM_CLOSE_PRICE_DISCOUNT],
            minRiskParamValues[INDEX_AMM_CLOSE_PRICE_DISCOUNT],
            maxRiskParamValues[INDEX_AMM_CLOSE_PRICE_DISCOUNT]
        );
        setOption(
            perpetual.fundingRateFactor,
            riskParams[INDEX_FUNDING_RATE_FACTOR],
            minRiskParamValues[INDEX_FUNDING_RATE_FACTOR],
            maxRiskParamValues[INDEX_FUNDING_RATE_FACTOR]
        );
        setOption(
            perpetual.defaultTargetLeverage,
            riskParams[INDEX_DEFAULT_TARGET_LEVERAGE],
            minRiskParamValues[INDEX_DEFAULT_TARGET_LEVERAGE],
            maxRiskParamValues[INDEX_DEFAULT_TARGET_LEVERAGE]
        );
        setOption(
            perpetual.baseFundingRate,
            riskParams[INDEX_BASE_FUNDING_RATE],
            minRiskParamValues[INDEX_BASE_FUNDING_RATE],
            maxRiskParamValues[INDEX_BASE_FUNDING_RATE]
        );
        emit SetPerpetualRiskParameter(
            perpetual.id,
            riskParams,
            minRiskParamValues,
            maxRiskParamValues
        );
    }

    /**
     * @dev     Adjust the risk parameter. New values should always satisfied the constrains and min/max limit.
     *
     * @param   perpetual   The reference of perpetual storage.
     * @param   riskParams  An int array of risk parameter values.
     */
    function updateRiskParameter(PerpetualStorage storage perpetual, int256[9] memory riskParams)
        public
    {
        validateRiskParameters(perpetual, riskParams);
        updateOption(perpetual.halfSpread, riskParams[INDEX_HALF_SPREAD]);
        updateOption(perpetual.openSlippageFactor, riskParams[INDEX_OPEN_SLIPPAGE_FACTOR]);
        updateOption(perpetual.closeSlippageFactor, riskParams[INDEX_CLOSE_SLIPPAGE_FACTOR]);
        updateOption(perpetual.fundingRateLimit, riskParams[INDEX_FUNDING_RATE_LIMIT]);
        updateOption(perpetual.ammMaxLeverage, riskParams[INDEX_AMM_MAX_LEVERAGE]);
        updateOption(perpetual.maxClosePriceDiscount, riskParams[INDEX_AMM_CLOSE_PRICE_DISCOUNT]);
        updateOption(perpetual.fundingRateFactor, riskParams[INDEX_FUNDING_RATE_FACTOR]);
        updateOption(perpetual.defaultTargetLeverage, riskParams[INDEX_DEFAULT_TARGET_LEVERAGE]);
        updateOption(perpetual.baseFundingRate, riskParams[INDEX_BASE_FUNDING_RATE]);
        emit UpdatePerpetualRiskParameter(perpetual.id, riskParams);
    }

    /**
     * @dev     Update the unitAccumulativeFunding variable in perpetual.
     *          After that, funding payment of every account in the perpetual is updated,
     *
     *          nextUnitAccumulativeFunding = unitAccumulativeFunding
     *                                       + index * fundingRate * elapsedTime / fundingInterval
     *
     * @param   perpetual   The reference of perpetual storage.
     * @param   timeElapsed The elapsed time since last update.
     */
    function updateFundingState(PerpetualStorage storage perpetual, int256 timeElapsed) public {
        int256 deltaUnitLoss = timeElapsed
            .mul(getIndexPrice(perpetual))
            .wmul(perpetual.fundingRate)
            .div(FUNDING_INTERVAL);
        perpetual.unitAccumulativeFunding = perpetual.unitAccumulativeFunding.add(deltaUnitLoss);
        emit UpdateUnitAccumulativeFunding(perpetual.id, perpetual.unitAccumulativeFunding);
    }

    /**
     * @dev     Update the funding rate of the perpetual.
     *
     *            - funding rate = - index * position * factor / pool margin
     *            - funding rate += base funding rate when
     *                - open interest != 0 and position >= 0 and base funding rate < 0
     *                - open interest != 0 and position <= 0 and base funding rate > 0
     *            - funding rate = (+/-)limit when
     *                - pool margin = 0 and position != 0
     *                - abs(funding rate) > limit
     *
     * @param   perpetual   The reference of perpetual storage.
     * @param   poolMargin  The pool margin of liquidity pool.
     */
    function updateFundingRate(PerpetualStorage storage perpetual, int256 poolMargin) public {
        int256 position = perpetual.getPosition(address(this));
        int256 newFundingRate;
        if (
            ((perpetual.baseFundingRate.value > 0 && position <= 0) ||
                (perpetual.baseFundingRate.value < 0 && position >= 0)) &&
            perpetual.openInterest != 0
        ) {
            newFundingRate = perpetual.baseFundingRate.value;
        } else {
            newFundingRate = 0;
        }
        if (position != 0) {
            int256 fundingRateLimit = perpetual.fundingRateLimit.value;
            if (poolMargin != 0) {
                newFundingRate = newFundingRate.add(
                    getIndexPrice(perpetual).wfrac(position, poolMargin).neg().wmul(
                        perpetual.fundingRateFactor.value
                    )
                );
                newFundingRate = newFundingRate.min(fundingRateLimit).max(fundingRateLimit.neg());
            } else if (position > 0) {
                newFundingRate = fundingRateLimit.neg();
            } else {
                newFundingRate = fundingRateLimit;
            }
        }
        perpetual.fundingRate = newFundingRate;
        emit UpdateFundingRate(perpetual.id, newFundingRate);
    }

    /**
     * @dev     Update the oracle price of the perpetual, including the index price and the mark price
     * @param   perpetual   The reference of perpetual storage.
     */
    function updatePrice(PerpetualStorage storage perpetual) internal {
        IOracle oracle = IOracle(perpetual.oracle);
        updatePriceData(perpetual.markPriceData, oracle.priceTWAPLong);
        updatePriceData(perpetual.indexPriceData, oracle.priceTWAPShort);
        emit UpdatePrice(
            perpetual.id,
            address(oracle),
            perpetual.markPriceData.price,
            perpetual.markPriceData.time,
            perpetual.indexPriceData.price,
            perpetual.indexPriceData.time
        );
    }

    /**
     * @dev     Set the state of the perpetual to "NORMAL". The state must be "INITIALIZING" before
     * @param   perpetual   The reference of perpetual storage.
     */
    function setNormalState(PerpetualStorage storage perpetual) public {
        require(
            perpetual.state == PerpetualState.INITIALIZING,
            "perpetual should be in initializing state"
        );
        perpetual.state = PerpetualState.NORMAL;
        emit SetNormalState(perpetual.id);
    }

    /**
     * @dev     Set the state of the perpetual to "EMERGENCY". The state must be "NORMAL" before.
     *          The settlement price is the mark price at this time
     * @param   perpetual   The reference of perpetual storage.
     */
    function setEmergencyState(PerpetualStorage storage perpetual) public {
        require(perpetual.state == PerpetualState.NORMAL, "perpetual should be in NORMAL state");
        // use mark price as final price when emergency
        perpetual.settlementPriceData = perpetual.markPriceData;
        perpetual.totalAccount = perpetual.activeAccounts.length();
        perpetual.state = PerpetualState.EMERGENCY;
        emit SetEmergencyState(
            perpetual.id,
            perpetual.settlementPriceData.price,
            perpetual.settlementPriceData.time
        );
    }

    /**
     * @dev     Set the state of the perpetual to "CLEARED". The state must be "EMERGENCY" before.
     *          And settle the collateral of the perpetual, which means
     *          determining how much collateral should returned to every account.
     * @param   perpetual   The reference of perpetual storage.
     */
    function setClearedState(PerpetualStorage storage perpetual) public {
        require(
            perpetual.state == PerpetualState.EMERGENCY,
            "perpetual should be in emergency state"
        );
        settleCollateral(perpetual);
        perpetual.state = PerpetualState.CLEARED;
        emit SetClearedState(perpetual.id);
    }

    /**
     * @dev     Deposit collateral to the trader's account of the perpetual, that will increase the cash amount in
     *          trader's margin account.
     *
     *          If this is the first time the trader deposits in current perpetual, the address of trader will be
     *          push to a list, then the trader is defined as an 'Active' trader for this perpetual.
     *          List of active traders will be used during clearing.
     *
     * @param   perpetual           The reference of perpetual storage.
     * @param   trader              The address of the trader.
     * @param   amount              The amount of collateral to deposit.
     * @return  isInitialDeposit    True if the trader's account is empty before depositing.
     */
    function deposit(
        PerpetualStorage storage perpetual,
        address trader,
        int256 amount
    ) public returns (bool isInitialDeposit) {
        require(amount > 0, "amount should greater than 0");
        perpetual.updateCash(trader, amount);
        isInitialDeposit = registerActiveAccount(perpetual, trader);
        emit Deposit(perpetual.id, trader, amount);
    }

    /**
     * @dev     Withdraw collateral from the trader's account of the perpetual, that will increase the cash amount in
     *          trader's margin account.
     *
     *          Trader must be initial margin safe in the perpetual after withdrawing.
     *          Making the margin account 'Empty' will mark this account as a 'Deactive' trader then be removed from
     *          list of active traders.
     *
     * @param   perpetual           The reference of perpetual storage.
     * @param   trader              The address of the trader.
     * @param   amount              The amount of collateral to withdraw.
     * @return  isLastWithdrawal    True if the trader's account is empty after withdrawing.
     */
    function withdraw(
        PerpetualStorage storage perpetual,
        address trader,
        int256 amount
    ) public returns (bool isLastWithdrawal) {
        require(
            perpetual.getPosition(trader) == 0 || !IOracle(perpetual.oracle).isMarketClosed(),
            "market is closed"
        );
        require(amount > 0, "amount should greater than 0");
        perpetual.updateCash(trader, amount.neg());
        int256 markPrice = getMarkPrice(perpetual);
        require(
            perpetual.isInitialMarginSafe(trader, markPrice),
            "margin is unsafe after withdrawal"
        );
        isLastWithdrawal = perpetual.isEmptyAccount(trader);
        if (isLastWithdrawal) {
            deregisterActiveAccount(perpetual, trader);
        }
        emit Withdraw(perpetual.id, trader, amount);
    }

    /**
     * @dev     Clear the active account of the perpetual which state is "EMERGENCY" and send gas reward of collateral
     *          to sender.
     *          If all active accounts are cleared, the clear progress is done and the perpetual's state will
     *          change to "CLEARED".
     *
     * @param   perpetual       The reference of perpetual storage.
     * @param   trader          The address of the trader to clear.
     * @return  isAllCleared    True if all the active accounts are cleared.
     */
    function clear(PerpetualStorage storage perpetual, address trader)
        public
        returns (bool isAllCleared)
    {
        require(perpetual.activeAccounts.length() > 0, "no account to clear");
        require(
            perpetual.activeAccounts.contains(trader),
            "account cannot be cleared or already cleared"
        );
        countMargin(perpetual, trader);
        perpetual.activeAccounts.remove(trader);
        isAllCleared = (perpetual.activeAccounts.length() == 0);
        emit Clear(perpetual.id, trader);
    }

    /**
     * @dev     Check the margin balance of trader's account, update total margin.
     *          If the margin of the trader's account is not positive, it will be counted as 0.
     *
     * @param   perpetual   The reference of perpetual storage.
     * @param   trader      The address of the trader to be counted.
     */
    function countMargin(PerpetualStorage storage perpetual, address trader) public {
        int256 margin = perpetual.getMargin(trader, getMarkPrice(perpetual));
        if (margin <= 0) {
            return;
        }
        if (perpetual.getPosition(trader) != 0) {
            perpetual.totalMarginWithPosition = perpetual.totalMarginWithPosition.add(margin);
        } else {
            perpetual.totalMarginWithoutPosition = perpetual.totalMarginWithoutPosition.add(margin);
        }
    }

    /**
     * @dev     Get the address of the next active account in the perpetual.
     *
     * @param   perpetual   The reference of perpetual storage.
     * @return  account     The address of the next active account.
     */
    function getNextActiveAccount(PerpetualStorage storage perpetual)
        public
        view
        returns (address account)
    {
        require(perpetual.activeAccounts.length() > 0, "no active account");
        account = perpetual.activeAccounts.at(0);
    }

    /**
     * @dev     If the state of the perpetual is "CLEARED".
     *          The traders is able to settle all margin balance left in account.
     *          How much collateral can be returned is determined by the ratio of margin balance left in account to the
     *          total amount of collateral in perpetual.
     *          The priority is:
     *              - accounts withou position;
     *              - accounts with positions;
     *              - accounts with negative margin balance will get nothing back.
     *
     * @param   perpetual       The reference of perpetual storage.
     * @param   trader          The address of the trader to settle.
     * @param   marginToReturn  The actual collateral will be returned to the trader.
     */
    function settle(PerpetualStorage storage perpetual, address trader)
        public
        returns (int256 marginToReturn)
    {
        int256 price = getMarkPrice(perpetual);
        marginToReturn = perpetual.getSettleableMargin(trader, price);
        perpetual.resetAccount(trader);
        emit Settle(perpetual.id, trader, marginToReturn);
    }

    /**
     * @dev     Settle the total collateral of the perpetual, which means update redemptionRateWithPosition
     *          and redemptionRateWithoutPosition variables.
     *          If the total collateral is not enough for the accounts without position,
     *          all the total collateral is given to them proportionally.
     *          If the total collateral is more than the accounts without position needs,
     *          the extra part of collateral is given to the accounts with position proportionally.
     *
     * @param   perpetual   The reference of perpetual storage.
     */
    function settleCollateral(PerpetualStorage storage perpetual) public {
        int256 totalCollateral = perpetual.totalCollateral;
        // 2. cover margin without position
        if (totalCollateral < perpetual.totalMarginWithoutPosition) {
            // margin without positions get balance / total margin
            // smaller rate to make sure total redemption margin < total collateral of perpetual
            perpetual.redemptionRateWithoutPosition = perpetual.totalMarginWithoutPosition > 0
                ? totalCollateral.wdiv(perpetual.totalMarginWithoutPosition, Round.FLOOR)
                : 0;
            // margin with positions will get nothing
            perpetual.redemptionRateWithPosition = 0;
        } else {
            // 3. covere margin with position
            perpetual.redemptionRateWithoutPosition = Constant.SIGNED_ONE;
            // smaller rate to make sure total redemption margin < total collateral of perpetual
            perpetual.redemptionRateWithPosition = perpetual.totalMarginWithPosition > 0
                ? totalCollateral.sub(perpetual.totalMarginWithoutPosition).wdiv(
                    perpetual.totalMarginWithPosition,
                    Round.FLOOR
                )
                : 0;
        }
    }

    /**
     * @dev     Register the trader's account to the active accounts in the perpetual
     * @param   perpetual   The reference of perpetual storage.
     * @param   trader      The address of the trader.
     * @return  True if the trader is added to account for the first time.
     */
    function registerActiveAccount(PerpetualStorage storage perpetual, address trader)
        internal
        returns (bool)
    {
        return perpetual.activeAccounts.add(trader);
    }

    /**
     * @dev     Deregister the trader's account from the active accounts in the perpetual
     * @param   perpetual   The reference of perpetual storage.
     * @param   trader      The address of the trader.
     * @return  True if the trader is removed to account for the first time.
     */
    function deregisterActiveAccount(PerpetualStorage storage perpetual, address trader)
        internal
        returns (bool)
    {
        return perpetual.activeAccounts.remove(trader);
    }

    /**
     * @dev     Update the price data, which means the price and the update time
     * @param   priceData   The price data to update.
     * @param   priceGetter The function pointer to retrieve current price data.
     */
    function updatePriceData(
        OraclePriceData storage priceData,
        function() external returns (int256, uint256) priceGetter
    ) internal {
        (int256 price, uint256 time) = priceGetter();
        require(price > 0 && time != 0, "invalid price data");
        if (time >= priceData.time) {
            priceData.price = price;
            priceData.time = time;
        }
    }

    /**
     * @dev     Increase the total collateral of the perpetual
     * @param   perpetual   The reference of perpetual storage.
     * @param   amount      The amount of collateral to increase
     */
    function increaseTotalCollateral(PerpetualStorage storage perpetual, int256 amount) internal {
        require(amount >= 0, "amount is negative");
        perpetual.totalCollateral = perpetual.totalCollateral.add(amount);
    }

    /**
     * @dev     Decrease the total collateral of the perpetual
     * @param   perpetual   The reference of perpetual storage.
     * @param   amount      The amount of collateral to decrease
     */
    function decreaseTotalCollateral(PerpetualStorage storage perpetual, int256 amount) internal {
        require(amount >= 0, "amount is negative");
        perpetual.totalCollateral = perpetual.totalCollateral.sub(amount);
        require(perpetual.totalCollateral >= 0, "collateral is negative");
    }

    /**
     * @dev     Update the option
     * @param   option      The option to update
     * @param   newValue    The new value of the option, must between the minimum value and the maximum value
     */
    function updateOption(Option storage option, int256 newValue) internal {
        require(newValue >= option.minValue && newValue <= option.maxValue, "value out of range");
        option.value = newValue;
    }

    /**
     * @dev     Set the option value, with constraints that newMinValue <= newValue <= newMaxValue.
     *
     * @param   option      The reference of option storage.
     * @param   newValue    The new value of the option, must be within range of [newMinValue, newMaxValue].
     * @param   newMinValue The minimum value of the option.
     * @param   newMaxValue The maximum value of the option.
     */
    function setOption(
        Option storage option,
        int256 newValue,
        int256 newMinValue,
        int256 newMaxValue
    ) internal {
        require(newValue >= newMinValue && newValue <= newMaxValue, "value out of range");
        option.value = newValue;
        option.minValue = newMinValue;
        option.maxValue = newMaxValue;
    }

    /**
     * @dev     Validate oracle contract, including each method of oracle
     *
     * @param   oracle   The address of oracle contract.
     */
    function validateOracle(address oracle) public {
        require(oracle != address(0), "invalid oracle address");
        require(oracle.isContract(), "oracle must be contract");
        bool success;
        bytes memory data;
        (success, data) = oracle.call(abi.encodeWithSignature("isMarketClosed()"));
        require(success && data.length == 32, "invalid function: isMarketClosed");
        (success, data) = oracle.call(abi.encodeWithSignature("isTerminated()"));
        require(success && data.length == 32, "invalid function: isTerminated");
        require(!abi.decode(data, (bool)), "oracle is terminated");
        (success, data) = oracle.call(abi.encodeWithSignature("collateral()"));
        require(success && data.length > 0, "invalid function: collateral");
        string memory result;
        result = abi.decode(data, (string));
        require(keccak256(bytes(result)) != keccak256(bytes("")), "oracle's collateral is empty");
        (success, data) = oracle.call(abi.encodeWithSignature("underlyingAsset()"));
        require(success && data.length > 0, "invalid function: underlyingAsset");
        result = abi.decode(data, (string));
        require(
            keccak256(bytes(result)) != keccak256(bytes("")),
            "oracle's underlyingAsset is empty"
        );
        (success, data) = oracle.call(abi.encodeWithSignature("priceTWAPLong()"));
        require(success && data.length > 0, "invalid function: priceTWAPLong");
        (int256 price, uint256 timestamp) = abi.decode(data, (int256, uint256));
        require(price > 0 && timestamp > 0, "oracle's twap long price is not updated");
        (success, data) = oracle.call(abi.encodeWithSignature("priceTWAPShort()"));
        require(success && data.length > 0, "invalid function: priceTWAPShort");
        (price, timestamp) = abi.decode(data, (int256, uint256));
        require(price > 0 && timestamp > 0, "oracle's twap short price is not updated");
    }

    /**
     * @dev     Validate the base parameters of the perpetual:
     *            1. initial margin rate > 0
     *            2. 0 < maintenance margin rate <= initial margin rate
     *            3. 0 <= operator fee rate <= 0.01
     *            4. 0 <= lp fee rate <= 0.01
     *            5. 0 <= liquidation penalty rate < maintenance margin rate
     *            6. keeper gas reward >= 0
     *
     * @param   perpetual   The reference of perpetual storage.
     * @param   baseParams  The base parameters of the perpetual.
     */
    function validateBaseParameters(PerpetualStorage storage perpetual, int256[9] memory baseParams)
        public
        view
    {
        require(baseParams[INDEX_INITIAL_MARGIN_RATE] > 0, "initialMarginRate <= 0");
        require(
            perpetual.initialMarginRate == 0 ||
                baseParams[INDEX_INITIAL_MARGIN_RATE] <= perpetual.initialMarginRate,
            "cannot increase initialMarginRate"
        );
        int256 maxLeverage = Constant.SIGNED_ONE.wdiv(baseParams[INDEX_INITIAL_MARGIN_RATE]);
        require(
            perpetual.defaultTargetLeverage.value <= maxLeverage,
            "default target leverage exceeds max leverage"
        );
        require(
            perpetual.maintenanceMarginRate == 0 ||
                baseParams[INDEX_MAINTENANCE_MARGIN_RATE] <= perpetual.maintenanceMarginRate,
            "cannot increase maintenanceMarginRate"
        );
        require(baseParams[INDEX_MAINTENANCE_MARGIN_RATE] > 0, "maintenanceMarginRate <= 0");
        require(
            baseParams[INDEX_MAINTENANCE_MARGIN_RATE] <= baseParams[INDEX_INITIAL_MARGIN_RATE],
            "maintenanceMarginRate > initialMarginRate"
        );
        require(baseParams[INDEX_OPERATOR_FEE_RATE] >= 0, "operatorFeeRate < 0");
        require(
            baseParams[INDEX_OPERATOR_FEE_RATE] <= (Constant.SIGNED_ONE / 100),
            "operatorFeeRate > 1%"
        );
        require(baseParams[INDEX_LP_FEE_RATE] >= 0, "lpFeeRate < 0");
        require(baseParams[INDEX_LP_FEE_RATE] <= (Constant.SIGNED_ONE / 100), "lpFeeRate > 1%");

        require(baseParams[INDEX_REFERRAL_REBATE_RATE] >= 0, "referralRebateRate < 0");
        require(
            baseParams[INDEX_REFERRAL_REBATE_RATE] <= Constant.SIGNED_ONE,
            "referralRebateRate > 100%"
        );

        require(baseParams[INDEX_LIQUIDATION_PENALTY_RATE] >= 0, "liquidationPenaltyRate < 0");
        require(
            baseParams[INDEX_LIQUIDATION_PENALTY_RATE] <= baseParams[INDEX_MAINTENANCE_MARGIN_RATE],
            "liquidationPenaltyRate > maintenanceMarginRate"
        );
        require(baseParams[INDEX_KEEPER_GAS_REWARD] >= 0, "keeperGasReward < 0");
        require(baseParams[INDEX_INSURANCE_FUND_RATE] >= 0, "insuranceFundRate < 0");
        require(baseParams[INDEX_MAX_OPEN_INTEREST_RATE] > 0, "maxOpenInterestRate <= 0");
    }

    /**
     * @dev     alidate the risk parameters of the perpetual
     *            1. 0 <= half spread < 1
     *            2. open slippage factor > 0
     *            3. 0 < close slippage factor <= open slippage factor
     *            4. funding rate limit >= 0
     *            5. AMM max leverage > 0
     *            6. 0 <= max close price discount < 1
     *
     * @param   perpetual   The reference of perpetual storage.
     */
    function validateRiskParameters(PerpetualStorage storage perpetual, int256[9] memory riskParams)
        public
        view
    {
        // must set risk parameters after setting base parameters
        require(perpetual.initialMarginRate > 0, "need to set base parameters first");
        require(riskParams[INDEX_HALF_SPREAD] >= 0, "halfSpread < 0");
        require(riskParams[INDEX_HALF_SPREAD] < Constant.SIGNED_ONE, "halfSpread >= 100%");
        require(riskParams[INDEX_OPEN_SLIPPAGE_FACTOR] > 0, "openSlippageFactor < 0");
        require(riskParams[INDEX_CLOSE_SLIPPAGE_FACTOR] > 0, "closeSlippageFactor < 0");
        require(
            riskParams[INDEX_CLOSE_SLIPPAGE_FACTOR] <= riskParams[INDEX_OPEN_SLIPPAGE_FACTOR],
            "closeSlippageFactor > openSlippageFactor"
        );
        require(riskParams[INDEX_FUNDING_RATE_FACTOR] >= 0, "fundingRateFactor < 0");
        require(riskParams[INDEX_FUNDING_RATE_LIMIT] >= 0, "fundingRateLimit < 0");
        require(riskParams[INDEX_AMM_MAX_LEVERAGE] >= 0, "ammMaxLeverage < 0");
        require(
            riskParams[INDEX_AMM_MAX_LEVERAGE] <=
                Constant.SIGNED_ONE.wdiv(perpetual.initialMarginRate, Round.FLOOR),
            "ammMaxLeverage > 1 / initialMarginRate"
        );
        require(riskParams[INDEX_AMM_CLOSE_PRICE_DISCOUNT] >= 0, "maxClosePriceDiscount < 0");
        require(
            riskParams[INDEX_AMM_CLOSE_PRICE_DISCOUNT] < Constant.SIGNED_ONE,
            "maxClosePriceDiscount >= 100%"
        );
        require(perpetual.initialMarginRate != 0, "initialMarginRate is not set");
        int256 maxLeverage = Constant.SIGNED_ONE.wdiv(perpetual.initialMarginRate);
        require(
            riskParams[INDEX_DEFAULT_TARGET_LEVERAGE] <= maxLeverage,
            "default target leverage exceeds max leverage"
        );
    }
}
