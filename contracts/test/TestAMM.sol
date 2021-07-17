// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";

import "../module/AMMModule.sol";
import "../module/MarginAccountModule.sol";
import "../module/PerpetualModule.sol";

contract TestAMM {
    using SignedSafeMathUpgradeable for int256;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;
    using MarginAccountModule for LiquidityPoolStorage;
    using PerpetualModule for PerpetualStorage;

    int256 unitAccumulativeFunding = 19 * 10**17;
    int256 halfSpread = 1 * 10**15;
    int256 openSlippageFactor = 1 * 10**18;
    int256 closeSlippageFactor = 9 * 10**17;
    int256 maxClosePriceDiscount = 2 * 10**17;
    LiquidityPoolStorage liquidityPool;

    function setParams(
        int256 ammMaxLeverage,
        int256 cash,
        int256 positionAmount1,
        int256 positionAmount2,
        int256 indexPrice1,
        int256 indexPrice2,
        PerpetualState state
    ) public {
        liquidityPool.perpetuals[0].id = 0;
        liquidityPool.perpetuals[0].state = PerpetualState.NORMAL;
        liquidityPool.perpetuals[0].unitAccumulativeFunding = unitAccumulativeFunding;
        liquidityPool.perpetuals[0].halfSpread.value = halfSpread;
        liquidityPool.perpetuals[0].openSlippageFactor.value = openSlippageFactor;
        liquidityPool.perpetuals[0].closeSlippageFactor.value = closeSlippageFactor;
        liquidityPool.perpetuals[0].ammMaxLeverage.value = ammMaxLeverage;
        liquidityPool.perpetuals[0].maxClosePriceDiscount.value = maxClosePriceDiscount;
        liquidityPool.poolCash = cash;
        liquidityPool.perpetuals[0].marginAccounts[address(this)].position = positionAmount1;
        liquidityPool.perpetuals[0].indexPriceData.price = indexPrice1;

        liquidityPool.perpetuals[1].id = 1;
        liquidityPool.perpetuals[1].state = state;
        liquidityPool.perpetuals[1].unitAccumulativeFunding = unitAccumulativeFunding;
        liquidityPool.perpetuals[1].halfSpread.value = halfSpread;
        liquidityPool.perpetuals[1].openSlippageFactor.value = openSlippageFactor;
        liquidityPool.perpetuals[1].closeSlippageFactor.value = closeSlippageFactor;
        liquidityPool.perpetuals[1].ammMaxLeverage.value = ammMaxLeverage;
        liquidityPool.perpetuals[1].maxClosePriceDiscount.value = maxClosePriceDiscount;
        liquidityPool.perpetuals[1].marginAccounts[address(this)].position = positionAmount2;
        liquidityPool.perpetuals[1].indexPriceData.price = indexPrice2;

        liquidityPool.perpetualCount = 2;
    }

    function setInsuranceFund(int256 insuranceFund, int256 donatedInsuranceFund) public {
        liquidityPool.insuranceFund = insuranceFund;
        liquidityPool.donatedInsuranceFund = donatedInsuranceFund;
    }

    function setAllCleared() public {
        liquidityPool.perpetuals[0].state = PerpetualState.CLEARED;
        liquidityPool.perpetuals[1].state = PerpetualState.CLEARED;
    }

    function isAMMSafe() public view returns (bool) {
        PerpetualStorage storage perpetual = liquidityPool.perpetuals[0];
        AMMModule.Context memory context = AMMModule.prepareContext(liquidityPool, 0);
        return AMMModule.isAMMSafe(context, perpetual.openSlippageFactor.value);
    }

    function getPoolMargin() public view returns (int256) {
        PerpetualStorage storage perpetual = liquidityPool.perpetuals[0];
        AMMModule.Context memory context = AMMModule.prepareContext(liquidityPool, 0);
        return AMMModule.calculatePoolMarginWhenSafe(context, perpetual.openSlippageFactor.value);
    }

    function getDeltaCash(int256 amount) public view returns (int256 deltaCash) {
        PerpetualStorage storage perpetual = liquidityPool.perpetuals[0];
        deltaCash = AMMModule.getDeltaCash(
            getPoolMargin(),
            perpetual.marginAccounts[address(this)].position,
            perpetual.marginAccounts[address(this)].position.add(amount),
            perpetual.getIndexPrice(),
            perpetual.openSlippageFactor.value
        );
    }

    function maxPosition(bool isLongSide) public view returns (int256) {
        PerpetualStorage storage perpetual = liquidityPool.perpetuals[0];
        AMMModule.Context memory context = AMMModule.prepareContext(liquidityPool, 0);
        return
            AMMModule.getMaxPosition(
                context,
                getPoolMargin(),
                perpetual.ammMaxLeverage.value,
                perpetual.openSlippageFactor.value,
                isLongSide
            );
    }

    function queryTradeWithAMM(int256 tradeAmount, bool partialFill)
        public
        view
        returns (int256 deltaCash, int256 deltaPosition)
    {
        (deltaCash, deltaPosition) = AMMModule.queryTradeWithAMM(
            liquidityPool,
            0,
            tradeAmount,
            partialFill
        );
    }

    function getShareToMint(int256 shareTotalSupply, int256 cashToAdd)
        public
        view
        returns (int256, int256)
    {
        return AMMModule.getShareToMint(liquidityPool, shareTotalSupply, cashToAdd);
    }

    function getCashToAdd(int256 shareTotalSupply, int256 shareToMint)
        public
        view
        returns (int256)
    {
        return AMMModule.getCashToAdd(liquidityPool, shareTotalSupply, shareToMint);
    }

    function getCashToReturn(int256 shareTotalSupply, int256 shareToRemove)
        public
        view
        returns (
            int256 cashToReturn,
            int256 removedInsuranceFund,
            int256 removedDonatedInsuranceFund,
            int256 removedPoolMargin
        )
    {
        (
            cashToReturn,
            removedInsuranceFund,
            removedDonatedInsuranceFund,
            removedPoolMargin
        ) = AMMModule.getCashToReturn(liquidityPool, shareTotalSupply, shareToRemove);
    }

    function getShareToRemove(int256 shareTotalSupply, int256 cashToReturn)
        public
        view
        returns (
            int256 shareToRemove,
            int256 removedInsuranceFund,
            int256 removedDonatedInsuranceFund,
            int256 removedPoolMargin
        )
    {
        (
            shareToRemove,
            removedInsuranceFund,
            removedDonatedInsuranceFund,
            removedPoolMargin
        ) = AMMModule.getShareToRemove(liquidityPool, shareTotalSupply, cashToReturn);
    }
}
