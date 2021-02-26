// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;

import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

/**
 * @notice  Perpetual state:
 *          - INVALID:      Uninitialized or not non-existent perpetual;
 *          - INITIALIZING: Only when LiquidityPoolStorage.isRunning == false. Traders cannot perform operations;
 *          - NORMAL:       Full functional state. Traders is able to perform all operations;
 *          - EMERGENCY:    Perpetual is unsafe and only clear is available;
 *          - CLEARED:      All margin account is cleared. Trade could withdraw remaining margin balance.
 */
enum PerpetualState { INVALID, INITIALIZING, NORMAL, EMERGENCY, CLEARED }
enum OrderType { LIMIT, MARKET, STOP }

/**
 * @notice  Data structure to store risk parameter value.
 */
struct Option {
    int256 value;
    int256 minValue;
    int256 maxValue;
}

/**
 * @notice  Data structure to store oracle price data.
 */
struct OraclePriceData {
    int256 price;
    uint256 time;
}

/**
 * @notice  Data structure to store user margin infomation. See MarginAccountModule.sol for details.
 */
struct MarginAccount {
    int256 cash;
    int256 position;
}

/**
 * @notice  Data structure of an order object.
 */
struct Order {
    address trader;
    address broker;
    address relayer;
    address referrer;
    address liquidityPool;
    int256 minTradeAmount;
    int256 amount;
    int256 limitPrice;
    int256 triggerPrice;
    uint256 chainID;
    uint64 expiredAt;
    uint32 perpetualIndex;
    uint32 brokerFeeLimit;
    uint32 flags;
    uint32 salt;
}

/**
 * @notice  Core data structure, a core .
 */
struct LiquidityPoolStorage {
    bool isRunning;
    bool isFastCreationEnabled;
    // addresses
    address creator;
    address operator;
    address transferringOperator;
    address governor;
    address shareToken;
    address accessController;
    bool isWrapped;
    uint256 scaler;
    uint256 collateralDecimals;
    address collateralToken;
    // pool attributes
    int256 poolCash;
    uint256 fundingTime;
    uint256 priceUpdateTime;
    uint256 operatorExpiration;
    // perpetuals
    PerpetualStorage[] perpetuals;
}

/**
 * @notice  Core data structure, storing perpetual informations.
 */
struct PerpetualStorage {
    uint256 id;
    PerpetualState state;
    address oracle;
    int256 totalCollateral;
    int256 openInterest;
    // prices
    OraclePriceData indexPriceData;
    OraclePriceData markPriceData;
    OraclePriceData settlementPriceData;
    // funding state
    int256 fundingRate;
    int256 realTimeUnitAccumulativeFunding;
    int256 unitAccumulativeFunding;
    uint256 syncFundingTime;
    // base parameters
    int256 initialMarginRate;
    int256 maintenanceMarginRate;
    int256 operatorFeeRate;
    int256 lpFeeRate;
    int256 referralRebateRate;
    int256 liquidationPenaltyRate;
    int256 keeperGasReward;
    int256 insuranceFundRate;
    int256 insuranceFundCap;
    int256 syncFundingInterval;
    int256 maxOpenInterestRate;
    // risk parameters
    Option halfSpread;
    Option openSlippageFactor;
    Option closeSlippageFactor;
    Option fundingRateLimit;
    Option ammMaxLeverage;
    Option maxClosePriceDiscount;
    // users
    uint256 totalAccount;
    int256 totalMarginWithoutPosition;
    int256 totalMarginWithPosition;
    int256 redemptionRateWithoutPosition;
    int256 redemptionRateWithPosition;
    EnumerableSetUpgradeable.AddressSet activeAccounts;
    // insurance fund
    int256 insuranceFund;
    int256 donatedInsuranceFund;
    // accounts
    mapping(address => MarginAccount) marginAccounts;
}
