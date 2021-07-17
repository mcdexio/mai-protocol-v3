// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";

import "../libraries/Constant.sol";
import "../libraries/Math.sol";
import "../libraries/SafeMathExt.sol";
import "../libraries/Utils.sol";

import "../module/MarginAccountModule.sol";
import "../module/PerpetualModule.sol";

import "../Type.sol";

library AMMModule {
    using Math for int256;
    using SafeMathExt for int256;
    using SignedSafeMathUpgradeable for int256;
    using SafeCastUpgradeable for uint256;
    using MarginAccountModule for PerpetualStorage;
    using PerpetualModule for PerpetualStorage;

    struct Context {
        int256 indexPrice;
        int256 position;
        int256 positionValue;
        // squareValue is 10^36, others are 10^18
        int256 squareValue;
        int256 positionMargin;
        int256 availableCash;
    }

    /**
     * @dev     Get the trading result when trader trades with AMM, divided into two parts:
     *            - AMM closes its position
     *            - AMM opens its position.
     *
     * @param   liquidityPool   The liquidity pool object of AMM.
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool to trade.
     * @param   tradeAmount     The trading amount of position, positive if AMM longs, negative if AMM shorts.
     * @param   partialFill     Whether to allow partially trading. Set to true when liquidation trading,
     *                          set to false when normal trading.
     * @return  deltaCash       The update cash(collateral) of AMM after the trade.
     * @return  deltaPosition   The update position of AMM after the trade.
     */
    function queryTradeWithAMM(
        LiquidityPoolStorage storage liquidityPool,
        uint256 perpetualIndex,
        int256 tradeAmount,
        bool partialFill
    ) public view returns (int256 deltaCash, int256 deltaPosition) {
        require(tradeAmount != 0, "trading amount is zero");
        Context memory context = prepareContext(liquidityPool, perpetualIndex);
        PerpetualStorage storage perpetual = liquidityPool.perpetuals[perpetualIndex];
        (int256 closePosition, int256 openPosition) = Utils.splitAmount(
            context.position,
            tradeAmount
        );
        // AMM close position
        int256 closeBestPrice;
        (deltaCash, closeBestPrice) = ammClosePosition(context, perpetual, closePosition);
        context.availableCash = context.availableCash.add(deltaCash);
        context.position = context.position.add(closePosition);
        // AMM open position
        (int256 openDeltaCash, int256 openDeltaPosition, int256 openBestPrice) = ammOpenPosition(
            context,
            perpetual,
            openPosition,
            partialFill
        );
        deltaCash = deltaCash.add(openDeltaCash);
        deltaPosition = closePosition.add(openDeltaPosition);
        int256 bestPrice = closePosition != 0 ? closeBestPrice : openBestPrice;
        // If price is better(for trader) than best price, change price to best price
        deltaCash = deltaCash.max(bestPrice.wmul(deltaPosition).neg());
    }

    /**
     * @dev     Calculate the amount of share token to mint when liquidity provider adds liquidity to the liquidity pool.
     *          If adding liquidity at first time, which means total supply of share token is zero,
     *          the amount of share token to mint equals to the pool margin after adding liquidity.
     *
     * @param   liquidityPool       The liquidity pool object of AMM.
     * @param   shareTotalSupply    The total supply of the share token before adding liquidity.
     * @param   cashToAdd           The amount of cash(collateral) added to the liquidity pool.
     * @return  shareToMint         The amount of share token to mint.
     * @return  addedPoolMargin     The added amount of pool margin after adding liquidity.
     */
    function getShareToMint(
        LiquidityPoolStorage storage liquidityPool,
        int256 shareTotalSupply,
        int256 cashToAdd
    ) public view returns (int256 shareToMint, int256 addedPoolMargin) {
        Context memory context = prepareContext(liquidityPool);
        (int256 poolMargin, ) = getPoolMargin(context);
        context.availableCash = context.availableCash.add(cashToAdd);
        (int256 newPoolMargin, ) = getPoolMargin(context);
        require(
            liquidityPool.liquidityCap == 0 ||
                newPoolMargin <= liquidityPool.liquidityCap.toInt256(),
            "liquidity reaches cap"
        );
        addedPoolMargin = newPoolMargin.sub(poolMargin);
        if (shareTotalSupply == 0) {
            // first time, if there is pool margin left in pool, it belongs to the first person who adds liquidity
            shareToMint = newPoolMargin;
        } else {
            // If share token's total supply is not zero and there is no money in pool,
            // these share tokens have no value. This case should be avoided.
            require(poolMargin > 0, "share token has no value");
            shareToMint = newPoolMargin.sub(poolMargin).wfrac(shareTotalSupply, poolMargin);
        }
    }

    /**
     * @dev     Calculate the amount of cash to add when liquidity provider adds liquidity to the liquidity pool.
     *          If adding liquidity at first time, which means total supply of share token is zero,
     *          the amount of cash to add equals to the share amount to mint minus pool margin before adding liquidity.
     *
     * @param   liquidityPool       The liquidity pool object of AMM.
     * @param   shareTotalSupply    The total supply of the share token before adding liquidity.
     * @param   shareToMint         The amount of share token to mint.
     * @return  cashToAdd           The amount of cash(collateral) to add to the liquidity pool.
     */
    function getCashToAdd(
        LiquidityPoolStorage storage liquidityPool,
        int256 shareTotalSupply,
        int256 shareToMint
    ) public view returns (int256 cashToAdd) {
        Context memory context = prepareContext(liquidityPool);
        (int256 poolMargin, ) = getPoolMargin(context);
        if (shareTotalSupply == 0) {
            // first time, if there is pool margin left in pool, it belongs to the first person who adds liquidity
            cashToAdd = shareToMint.sub(poolMargin).max(0);
            int256 newPoolMargin = cashToAdd.add(poolMargin);
            require(
                liquidityPool.liquidityCap == 0 ||
                    newPoolMargin <= liquidityPool.liquidityCap.toInt256(),
                "liquidity reaches cap"
            );
        } else {
            // If share token's total supply is not zero and there is no money in pool,
            // these share tokens have no value. This case should be avoided.
            require(poolMargin > 0, "share token has no value");
            int256 newPoolMargin = shareTotalSupply.add(shareToMint).wfrac(
                poolMargin,
                shareTotalSupply
            );
            require(
                liquidityPool.liquidityCap == 0 ||
                    newPoolMargin <= liquidityPool.liquidityCap.toInt256(),
                "liquidity reaches cap"
            );
            int256 minPoolMargin = context.squareValue.div(2).sqrt();
            int256 newCash;
            if (newPoolMargin <= minPoolMargin) {
                // pool is still unsafe after adding liquidity
                newCash = newPoolMargin.mul(2).sub(context.positionValue);
            } else {
                // context.squareValue is 10^36, so use div instead of wdiv
                newCash = context.squareValue.div(newPoolMargin).div(2).add(newPoolMargin).sub(
                    context.positionValue
                );
            }
            cashToAdd = newCash.sub(context.availableCash);
        }
    }

    /**
     * @dev     Calculate the amount of cash(collateral) to return when liquidity provider removes liquidity from the liquidity pool.
     *          Removing liquidity is forbidden at several cases:
     *            1. AMM is unsafe before removing liquidity
     *            2. AMM is unsafe after removing liquidity
     *            3. AMM will offer negative price at any perpetual after removing liquidity
     *            4. AMM will exceed maximum leverage at any perpetual after removing liquidity
     *
     * @param   liquidityPool                The liquidity pool object of AMM.
     * @param   shareTotalSupply             The total supply of the share token before removing liquidity.
     * @param   shareToRemove                The amount of share token to redeem.
     * @return  cashToReturn                 The amount of cash(collateral) to return.
     * @return  removedInsuranceFund         The part of insurance fund returned to LP if all perpetuals are in CLEARED state.
     * @return  removedDonatedInsuranceFund  The part of donated insurance fund returned to LP if all perpetuals are in CLEARED state.
     * @return  removedPoolMargin            The removed amount of pool margin after removing liquidity.
     */
    function getCashToReturn(
        LiquidityPoolStorage storage liquidityPool,
        int256 shareTotalSupply,
        int256 shareToRemove
    )
        public
        view
        returns (
            int256 cashToReturn,
            int256 removedInsuranceFund,
            int256 removedDonatedInsuranceFund,
            int256 removedPoolMargin
        )
    {
        require(
            shareTotalSupply > 0,
            "total supply of share token is zero when removing liquidity"
        );
        Context memory context = prepareContext(liquidityPool);
        require(isAMMSafe(context, 0), "AMM is unsafe before removing liquidity");
        removedPoolMargin = calculatePoolMarginWhenSafe(context, 0);
        require(removedPoolMargin > 0, "pool margin must be positive");
        int256 poolMargin = shareTotalSupply.sub(shareToRemove).wfrac(
            removedPoolMargin,
            shareTotalSupply
        );
        removedPoolMargin = removedPoolMargin.sub(poolMargin);
        {
            int256 minPoolMargin = context.squareValue.div(2).sqrt();
            require(poolMargin >= minPoolMargin, "AMM is unsafe after removing liquidity");
        }
        cashToReturn = calculateCashToReturn(context, poolMargin);
        require(cashToReturn >= 0, "received margin is negative");
        uint256 length = liquidityPool.perpetualCount;
        bool allCleared = true;
        for (uint256 i = 0; i < length; i++) {
            PerpetualStorage storage perpetual = liquidityPool.perpetuals[i];
            if (perpetual.state != PerpetualState.CLEARED) {
                allCleared = false;
            }
            if (perpetual.state != PerpetualState.NORMAL) {
                continue;
            }
            // prevent AMM offering negative price
            require(
                perpetual.getPosition(address(this)) <=
                    poolMargin.wdiv(perpetual.openSlippageFactor.value).wdiv(
                        perpetual.getIndexPrice()
                    ),
                "AMM is unsafe after removing liquidity"
            );
        }
        // prevent AMM exceeding max leverage
        require(
            context.availableCash.add(context.positionValue).sub(cashToReturn) >=
                context.positionMargin,
            "AMM exceeds max leverage after removing liquidity"
        );
        if (allCleared) {
            // get insurance fund proportionally
            removedInsuranceFund = liquidityPool.insuranceFund.wfrac(
                shareToRemove,
                shareTotalSupply,
                Round.FLOOR
            );
            removedDonatedInsuranceFund = liquidityPool.donatedInsuranceFund.wfrac(
                shareToRemove,
                shareTotalSupply,
                Round.FLOOR
            );
            cashToReturn = cashToReturn.add(removedInsuranceFund).add(removedDonatedInsuranceFund);
        }
    }

    /**
     * @dev     Calculate the amount of share token to redeem when liquidity provider removes liquidity from the liquidity pool.
     *          Removing liquidity is forbidden at several cases:
     *            1. AMM is unsafe before removing liquidity
     *            2. AMM is unsafe after removing liquidity
     *            3. AMM will offer negative price at any perpetual after removing liquidity
     *            4. AMM will exceed maximum leverage at any perpetual after removing liquidity
     *
     * @param   liquidityPool                The liquidity pool object of AMM.
     * @param   shareTotalSupply             The total supply of the share token before removing liquidity.
     * @param   cashToReturn                 The cash(collateral) to return.
     * @return  shareToRemove                The amount of share token to redeem.
     * @return  removedInsuranceFund         The part of insurance fund returned to LP if all perpetuals are in CLEARED state.
     * @return  removedDonatedInsuranceFund  The part of donated insurance fund returned to LP if all perpetuals are in CLEARED state.
     * @return  removedPoolMargin            The removed amount of pool margin after removing liquidity.
     */
    function getShareToRemove(
        LiquidityPoolStorage storage liquidityPool,
        int256 shareTotalSupply,
        int256 cashToReturn
    )
        public
        view
        returns (
            int256 shareToRemove,
            int256 removedInsuranceFund,
            int256 removedDonatedInsuranceFund,
            int256 removedPoolMargin
        )
    {
        require(
            shareTotalSupply > 0,
            "total supply of share token is zero when removing liquidity"
        );
        Context memory context = prepareContext(liquidityPool);
        require(isAMMSafe(context, 0), "AMM is unsafe before removing liquidity");
        int256 poolMargin = calculatePoolMarginWhenSafe(context, 0);
        context.availableCash = context.availableCash.sub(cashToReturn);
        require(isAMMSafe(context, 0), "AMM is unsafe after removing liquidity");
        int256 newPoolMargin = calculatePoolMarginWhenSafe(context, 0);
        removedPoolMargin = poolMargin.sub(newPoolMargin);
        shareToRemove = poolMargin.sub(newPoolMargin).wfrac(shareTotalSupply, poolMargin);
        uint256 length = liquidityPool.perpetualCount;
        bool allCleared = true;
        for (uint256 i = 0; i < length; i++) {
            PerpetualStorage storage perpetual = liquidityPool.perpetuals[i];
            if (perpetual.state != PerpetualState.CLEARED) {
                allCleared = false;
            }
            if (perpetual.state != PerpetualState.NORMAL) {
                continue;
            }
            // prevent AMM offering negative price
            require(
                perpetual.getPosition(address(this)) <=
                    newPoolMargin.wdiv(perpetual.openSlippageFactor.value).wdiv(
                        perpetual.getIndexPrice()
                    ),
                "AMM is unsafe after removing liquidity"
            );
        }
        // prevent AMM exceeding max leverage
        require(
            context.availableCash.add(context.positionValue) >= context.positionMargin,
            "AMM exceeds max leverage after removing liquidity"
        );
        if (allCleared) {
            // get insurance fund proportionally
            (
                shareToRemove,
                removedInsuranceFund,
                removedDonatedInsuranceFund,
                removedPoolMargin
            ) = getShareToRemoveWhenAllCleared(
                liquidityPool,
                cashToReturn,
                poolMargin,
                shareTotalSupply
            );
        }
    }

    /**
     * @dev     Calculate the amount of share token to redeem when liquidity provider removes liquidity from the liquidity pool.
     *          Only called when all perpetuals in the liquidity pool are in CLEARED state.
     *
     * @param   liquidityPool                The liquidity pool object of AMM.
     * @param   cashToReturn                 The cash(collateral) to return.
     * @param   poolMargin                   The pool margin before removing liquidity.
     * @param   shareTotalSupply             The total supply of the share token before removing liquidity.
     * @return  shareToRemove                The amount of share token to redeem.
     * @return  removedInsuranceFund         The part of insurance fund returned to LP if all perpetuals are in CLEARED state.
     * @return  removedDonatedInsuranceFund  The part of donated insurance fund returned to LP if all perpetuals are in CLEARED state.
     * @return  removedPoolMargin            The part of pool margin returned to LP if all perpetuals are in CLEARED state.
     */
    function getShareToRemoveWhenAllCleared(
        LiquidityPoolStorage storage liquidityPool,
        int256 cashToReturn,
        int256 poolMargin,
        int256 shareTotalSupply
    )
        public
        view
        returns (
            int256 shareToRemove,
            int256 removedInsuranceFund,
            int256 removedDonatedInsuranceFund,
            int256 removedPoolMargin
        )
    {
        // get insurance fund proportionally
        require(
            poolMargin.add(liquidityPool.insuranceFund).add(liquidityPool.donatedInsuranceFund) > 0,
            "all cleared, insufficient liquidity"
        );
        shareToRemove = shareTotalSupply.wfrac(
            cashToReturn,
            poolMargin.add(liquidityPool.insuranceFund).add(liquidityPool.donatedInsuranceFund)
        );
        removedInsuranceFund = liquidityPool.insuranceFund.wfrac(
            shareToRemove,
            shareTotalSupply,
            Round.FLOOR
        );
        removedDonatedInsuranceFund = liquidityPool.donatedInsuranceFund.wfrac(
            shareToRemove,
            shareTotalSupply,
            Round.FLOOR
        );
        removedPoolMargin = poolMargin.wfrac(shareToRemove, shareTotalSupply, Round.FLOOR);
    }

    /**
     * @dev     Calculate the pool margin of AMM when AMM is safe.
     *          Pool margin is how much collateral of the pool considering the AMM's positions of perpetuals.
     *
     * @param   context         Context object of AMM, but current perpetual is not included.
     * @param   slippageFactor  The slippage factor of current perpetual.
     * @return  poolMargin      The pool margin of AMM.
     */
    function calculatePoolMarginWhenSafe(Context memory context, int256 slippageFactor)
        internal
        pure
        returns (int256 poolMargin)
    {
        // The context doesn't include the current perpetual, add them.
        int256 positionValue = context.indexPrice.wmul(context.position);
        int256 margin = positionValue.add(context.positionValue).add(context.availableCash);
        // 10^36, the same as context.squareValue
        int256 tmp = positionValue.wmul(positionValue).mul(slippageFactor).add(context.squareValue);
        int256 beforeSqrt = margin.mul(margin).sub(tmp.mul(2));
        require(beforeSqrt >= 0, "AMM is unsafe when calculating pool margin");
        poolMargin = beforeSqrt.sqrt().add(margin).div(2);
        require(poolMargin >= 0, "pool margin is negative when calculating pool margin");
    }

    /**
     * @dev     Check if AMM is safe
     * @param   context         Context object of AMM, but current perpetual is not included.
     * @param   slippageFactor  The slippage factor of current perpetual.
     * @return  bool            True if AMM is safe.
     */
    function isAMMSafe(Context memory context, int256 slippageFactor) internal pure returns (bool) {
        int256 positionValue = context.indexPrice.wmul(context.position);
        // 10^36, the same as context.squareValue
        int256 minAvailableCash = positionValue.wmul(positionValue).mul(slippageFactor);
        minAvailableCash = minAvailableCash.add(context.squareValue).mul(2).sqrt().sub(
            context.positionValue.add(positionValue)
        );
        return context.availableCash >= minAvailableCash;
    }

    /**
     * @dev     Get the trading result when AMM closes its position.
     *          If the AMM is unsafe, the trading price is the best price.
     *          If trading price is too bad, it will be limited to index price * (1 +/- max close price discount)
     *
     * @param   context     Context object of AMM, but current perpetual is not included.
     * @param   perpetual   The perpetual object to trade.
     * @param   tradeAmount The amount of position to trade.
     *                      Positive for long and negative for short from AMM's perspective.
     * @return  deltaCash   The update cash(collateral) of AMM after the trade.
     * @return  bestPrice   The best price, is used for clipping to spread price if needed outside.
     *                      If AMM is safe, best price = middle price * (1 +/- half spread).
     *                      If AMM is unsafe and normal case, best price = index price.
     */
    function ammClosePosition(
        Context memory context,
        PerpetualStorage storage perpetual,
        int256 tradeAmount
    ) internal view returns (int256 deltaCash, int256 bestPrice) {
        if (tradeAmount == 0) {
            return (0, 0);
        }
        int256 positionBefore = context.position;
        int256 indexPrice = context.indexPrice;
        int256 slippageFactor = perpetual.closeSlippageFactor.value;
        int256 maxClosePriceDiscount = perpetual.maxClosePriceDiscount.value;
        int256 halfSpread = tradeAmount < 0
            ? perpetual.halfSpread.value
            : perpetual.halfSpread.value.neg();
        if (isAMMSafe(context, slippageFactor)) {
            int256 poolMargin = calculatePoolMarginWhenSafe(context, slippageFactor);
            require(poolMargin > 0, "pool margin must be positive");
            bestPrice = getMidPrice(poolMargin, indexPrice, positionBefore, slippageFactor).wmul(
                halfSpread.add(Constant.SIGNED_ONE)
            );
            deltaCash = getDeltaCash(
                poolMargin,
                positionBefore,
                positionBefore.add(tradeAmount),
                indexPrice,
                slippageFactor
            );
        } else {
            bestPrice = indexPrice;
            deltaCash = bestPrice.wmul(tradeAmount).neg();
        }
        int256 priceLimit = tradeAmount > 0
            ? Constant.SIGNED_ONE.add(maxClosePriceDiscount)
            : Constant.SIGNED_ONE.sub(maxClosePriceDiscount);
        // prevent too bad price
        deltaCash = deltaCash.max(indexPrice.wmul(priceLimit).wmul(tradeAmount).neg());
        // prevent negative price
        require(
            !Utils.hasTheSameSign(deltaCash, tradeAmount),
            "price is negative when AMM closes position"
        );
    }

    /**
     * @dev     Get the trading result when AMM opens its position.
     *          AMM can't open position when unsafe and can't open position to exceed the maximum position
     *
     * @param   context     Context object of AMM, but current perpetual is not included.
     * @param   perpetual   The perpetual object to trade
     * @param   tradeAmount The trading amount of position, positive if AMM longs, negative if AMM shorts
     * @param   partialFill Whether to allow partially trading. Set to true when liquidation trading,
     *                      set to false when normal trading
     * @return  deltaCash       The update cash(collateral) of AMM after the trade
     * @return  deltaPosition   The update position of AMM after the trade
     * @return  bestPrice       The best price, is used for clipping to spread price if needed outside.
     *                          Equal to middle price * (1 +/- half spread)
     */
    function ammOpenPosition(
        Context memory context,
        PerpetualStorage storage perpetual,
        int256 tradeAmount,
        bool partialFill
    )
        internal
        view
        returns (
            int256 deltaCash,
            int256 deltaPosition,
            int256 bestPrice
        )
    {
        if (tradeAmount == 0) {
            return (0, 0, 0);
        }
        int256 slippageFactor = perpetual.openSlippageFactor.value;
        if (!isAMMSafe(context, slippageFactor)) {
            require(partialFill, "AMM is unsafe when open");
            return (0, 0, 0);
        }
        int256 poolMargin = calculatePoolMarginWhenSafe(context, slippageFactor);
        require(poolMargin > 0, "pool margin must be positive");
        int256 indexPrice = context.indexPrice;
        int256 positionBefore = context.position;
        int256 positionAfter = positionBefore.add(tradeAmount);
        int256 maxPosition = getMaxPosition(
            context,
            poolMargin,
            perpetual.ammMaxLeverage.value,
            slippageFactor,
            positionAfter > 0
        );
        if (positionAfter.abs() > maxPosition.abs()) {
            require(partialFill, "trade amount exceeds max amount");
            // trade to max position if partialFill
            deltaPosition = maxPosition.sub(positionBefore);
            // current position already exeeds max position before trade, can't open
            if (Utils.hasTheSameSign(deltaPosition, tradeAmount.neg())) {
                return (0, 0, 0);
            }
            positionAfter = maxPosition;
        } else {
            deltaPosition = tradeAmount;
        }
        deltaCash = getDeltaCash(
            poolMargin,
            positionBefore,
            positionAfter,
            indexPrice,
            slippageFactor
        );
        // prevent negative price
        require(
            !Utils.hasTheSameSign(deltaCash, deltaPosition),
            "price is negative when AMM opens position"
        );
        int256 halfSpread = tradeAmount < 0
            ? perpetual.halfSpread.value
            : perpetual.halfSpread.value.neg();
        bestPrice = getMidPrice(poolMargin, indexPrice, positionBefore, slippageFactor).wmul(
            halfSpread.add(Constant.SIGNED_ONE)
        );
    }

    /**
     * @dev     Calculate the status of AMM
     *
     * @param   liquidityPool   The reference of liquidity pool storage.
     * @return  context         Context object of AMM, but current perpetual is not included.
     */
    function prepareContext(LiquidityPoolStorage storage liquidityPool)
        internal
        view
        returns (Context memory context)
    {
        context = prepareContext(liquidityPool, liquidityPool.perpetualCount);
    }

    /**
     * @dev     Calculate the status of AMM, but specified perpetual index is not included.
     *
     * @param   liquidityPool   The reference of liquidity pool storage.
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool to distinguish,
     *                          set to liquidityPool.perpetualCount to skip distinguishing.
     * @return  context         Context object of AMM.
     */
    function prepareContext(LiquidityPoolStorage storage liquidityPool, uint256 perpetualIndex)
        internal
        view
        returns (Context memory context)
    {
        int256 maintenanceMargin;
        uint256 length = liquidityPool.perpetualCount;
        for (uint256 i = 0; i < length; i++) {
            PerpetualStorage storage perpetual = liquidityPool.perpetuals[i];
            // only involve normal market
            if (perpetual.state != PerpetualState.NORMAL) {
                continue;
            }
            int256 position = perpetual.getPosition(address(this));
            int256 indexPrice = perpetual.getIndexPrice();
            require(indexPrice > 0, "index price must be positive");
            context.availableCash = context.availableCash.add(
                perpetual.getAvailableCash(address(this))
            );
            maintenanceMargin = maintenanceMargin.add(
                indexPrice.wmul(position).wmul(perpetual.maintenanceMarginRate).abs()
            );
            if (i == perpetualIndex) {
                context.indexPrice = indexPrice;
                context.position = position;
            } else {
                // To avoid returning more cash than pool has because of precision error,
                // cashToReturn should be smaller, which means positionValue should be smaller, squareValue should be bigger
                context.positionValue = context.positionValue.add(
                    indexPrice.wmul(position, Round.FLOOR)
                );
                // 10^36
                context.squareValue = context.squareValue.add(
                    position
                        .wmul(position, Round.CEIL)
                        .wmul(indexPrice, Round.CEIL)
                        .wmul(indexPrice, Round.CEIL)
                        .mul(perpetual.openSlippageFactor.value)
                );
                context.positionMargin = context.positionMargin.add(
                    indexPrice.wmul(position).abs().wdiv(perpetual.ammMaxLeverage.value)
                );
            }
        }
        context.availableCash = context.availableCash.add(liquidityPool.poolCash);
        // prevent margin balance < maintenance margin.
        // call setEmergencyState(SET_ALL_PERPETUALS_TO_EMERGENCY_STATE) when AMM is maintenance margin unsafe
        require(
            context.availableCash.add(context.positionValue).add(
                context.indexPrice.wmul(context.position)
            ) >= maintenanceMargin,
            "AMM is mm unsafe"
        );
    }

    /**
     * @dev     Calculate the cash(collateral) to return when removing liquidity.
     *
     * @param   context         Context object of AMM, but current perpetual is not included.
     * @param   poolMargin      The pool margin of AMM before removing liquidity.
     * @return  cashToReturn    The cash(collateral) to return.
     */
    function calculateCashToReturn(Context memory context, int256 poolMargin)
        public
        pure
        returns (int256 cashToReturn)
    {
        if (poolMargin == 0) {
            // remove all
            return context.availableCash;
        }
        require(poolMargin > 0, "pool margin must be positive when removing liquidity");
        // context.squareValue is 10^36, so use div instead of wdiv
        cashToReturn = context.squareValue.div(poolMargin).div(2).add(poolMargin).sub(
            context.positionValue
        );
        cashToReturn = context.availableCash.sub(cashToReturn);
    }

    /**
     * @dev     Get the middle price offered by AMM
     *
     * @param   poolMargin      The pool margin of AMM.
     * @param   indexPrice      The index price of the perpetual.
     * @param   position        The position of AMM in the perpetual.
     * @param   slippageFactor  The slippage factor of AMM in the perpetual.
     * @return  midPrice        A middle price offered by AMM.
     */
    function getMidPrice(
        int256 poolMargin,
        int256 indexPrice,
        int256 position,
        int256 slippageFactor
    ) internal pure returns (int256 midPrice) {
        midPrice = Constant
            .SIGNED_ONE
            .sub(indexPrice.wmul(position).wfrac(slippageFactor, poolMargin))
            .wmul(indexPrice);
    }

    /**
     * @dev     Get update cash(collateral) of AMM if trader trades against AMM.
     *
     * @param   poolMargin      The pool margin of AMM.
     * @param   positionBefore  The position of AMM in the perpetual before trading.
     * @param   positionAfter   The position of AMM in the perpetual after trading.
     * @param   indexPrice      The index price of the perpetual.
     * @param   slippageFactor  The slippage factor of AMM in the perpetual.
     * @return  deltaCash       The update cash(collateral) of AMM after trading.
     */
    function getDeltaCash(
        int256 poolMargin,
        int256 positionBefore,
        int256 positionAfter,
        int256 indexPrice,
        int256 slippageFactor
    ) internal pure returns (int256 deltaCash) {
        deltaCash = positionAfter.add(positionBefore).wmul(indexPrice).div(2).wfrac(
            slippageFactor,
            poolMargin
        );
        deltaCash = Constant.SIGNED_ONE.sub(deltaCash).wmul(indexPrice).wmul(
            positionBefore.sub(positionAfter)
        );
    }

    /**
     * @dev     Get the max position of AMM in the perpetual when AMM is opening position, calculated by three restrictions:
     *          1. AMM must be safe after the trade.
     *          2. AMM mustn't exceed maximum leverage in any perpetual after the trade.
     *          3. AMM must offer positive price in any perpetual after the trade. It's easy to prove that, in the
     *             perpetual, AMM definitely offers positive price when AMM holds short position.
     *
     * @param   context         Context object of AMM, but current perpetual is not included.
     * @param   poolMargin      The pool margin of AMM.
     * @param   ammMaxLeverage  The max leverage of AMM in the perpetual.
     * @param   slippageFactor  The slippage factor of AMM in the perpetual.
     * @return  maxPosition     The max position of AMM in the perpetual.
     */
    function getMaxPosition(
        Context memory context,
        int256 poolMargin,
        int256 ammMaxLeverage,
        int256 slippageFactor,
        bool isLongSide
    ) internal pure returns (int256 maxPosition) {
        int256 indexPrice = context.indexPrice;
        int256 beforeSqrt = poolMargin.mul(poolMargin).mul(2).sub(context.squareValue).wdiv(
            slippageFactor
        );
        if (beforeSqrt <= 0) {
            // 1. already unsafe, can't open position
            // 2. initial AMM is also this case, position = 0, available cash = 0, pool margin = 0
            return 0;
        }
        int256 maxPosition3 = beforeSqrt.sqrt().wdiv(indexPrice);
        int256 maxPosition2;
        // context.squareValue is 10^36, so use div instead of wdiv
        beforeSqrt = poolMargin.sub(context.positionMargin).add(
            context.squareValue.div(poolMargin).div(2)
        );
        beforeSqrt = beforeSqrt.wmul(ammMaxLeverage).wmul(ammMaxLeverage).wmul(slippageFactor);
        beforeSqrt = poolMargin.sub(beforeSqrt.mul(2));
        if (beforeSqrt < 0) {
            // never exceed max leverage
            maxPosition2 = type(int256).max;
        } else {
            // might be negative, clip to zero
            maxPosition2 = poolMargin.sub(beforeSqrt.mul(poolMargin).sqrt()).max(0);
            maxPosition2 = maxPosition2.wdiv(ammMaxLeverage).wdiv(slippageFactor).wdiv(indexPrice);
        }
        maxPosition = maxPosition3.min(maxPosition2);
        if (isLongSide) {
            // long side has one more restriction than short side
            int256 maxPosition1 = poolMargin.wdiv(slippageFactor).wdiv(indexPrice);
            maxPosition = maxPosition.min(maxPosition1);
        } else {
            maxPosition = maxPosition.neg();
        }
    }

    /**
     * @dev     Get pool margin of AMM, equal to 1/2 margin of AMM when AMM is unsafe.
     *          Marin of AMM: cash + index price1 * position1 + index price2 * position2 + ...
     *
     * @param   context     Context object of AMM, but current perpetual is not included.
     * @return  poolMargin  The pool margin of AMM.
     * @return  isSafe      True if AMM is safe or false.
     */
    function getPoolMargin(Context memory context)
        internal
        pure
        returns (int256 poolMargin, bool isSafe)
    {
        isSafe = isAMMSafe(context, 0);
        if (isSafe) {
            poolMargin = calculatePoolMarginWhenSafe(context, 0);
        } else {
            poolMargin = context.availableCash.add(context.positionValue).div(2);
            require(poolMargin >= 0, "pool margin is negative when getting pool margin");
        }
    }

    /**
     * @dev Get pool margin of AMM, prepare context first.
     * @param liquidityPool The liquidity pool object
     * @return int256 The pool margin of AMM
     * @return bool True if AMM is safe
     */
    function getPoolMargin(LiquidityPoolStorage storage liquidityPool)
        public
        view
        returns (int256, bool)
    {
        return getPoolMargin(prepareContext(liquidityPool));
    }
}
