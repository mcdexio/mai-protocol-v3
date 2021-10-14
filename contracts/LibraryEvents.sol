// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

/**
 * @notice  The libraryEvents defines events that will be raised from modules (contract/modules).
 * @dev     DO REMEMBER to add new events in modules here.
 */
contract LibraryEvents {
    // PerpetualModule
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
        int256[8] riskParams,
        int256[8] minRiskParamValues,
        int256[8] maxRiskParamValues
    );
    event UpdatePerpetualRiskParameter(uint256 perpetualIndex, int256[8] riskParams);
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

    // LiquidityPoolModule
    event AddLiquidity(
        address indexed trader,
        int256 addedCash,
        int256 mintedShare,
        int256 addedPoolMargin
    );
    event RemoveLiquidity(
        address indexed trader,
        int256 returnedCash,
        int256 burnedShare,
        int256 removedPoolMargin
    );
    event UpdatePoolMargin(int256 poolMargin);
    event TransferOperatorTo(address indexed newOperator);
    event ClaimOperator(address indexed newOperator);
    event RevokeOperator();
    event SetLiquidityPoolParameter(int256[4] value);
    event CreatePerpetual(
        uint256 perpetualIndex,
        address governor,
        address shareToken,
        address operator,
        address oracle,
        address collateral,
        int256[9] baseParams,
        int256[8] riskParams
    );
    event RunLiquidityPool();
    event OperatorCheckIn(address indexed operator);
    event DonateInsuranceFund(int256 amount);
    event TransferExcessInsuranceFundToLP(int256 amount);
    event SetTargetLeverage(uint256 perpetualIndex, address indexed trader, int256 targetLeverage);
    event AddAMMKeeper(uint256 perpetualIndex, address indexed keeper);
    event RemoveAMMKeeper(uint256 perpetualIndex, address indexed keeper);
    event AddTraderKeeper(uint256 perpetualIndex, address indexed keeper);
    event RemoveTraderKeeper(uint256 perpetualIndex, address indexed keeper);

    // TradeModule
    event Trade(
        uint256 perpetualIndex,
        address indexed trader,
        int256 position,
        int256 price,
        int256 fee,
        int256 lpFee
    );
    event Liquidate(
        uint256 perpetualIndex,
        address indexed liquidator,
        address indexed trader,
        int256 amount,
        int256 price,
        int256 penalty,
        int256 penaltyToLP
    );
    event TransferFeeToVault(
        uint256 perpetualIndex,
        address indexed trader,
        address indexed vault,
        int256 vaultFee
    );
    event TransferFeeToOperator(
        uint256 perpetualIndex,
        address indexed trader,
        address indexed operator,
        int256 operatorFee
    );
    event TransferFeeToReferrer(
        uint256 perpetualIndex,
        address indexed trader,
        address indexed referrer,
        int256 referralRebate
    );
}
