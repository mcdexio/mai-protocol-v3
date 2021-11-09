// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.4;

interface IOracle {
    /**
     * @dev The market is closed if the market is not in its regular trading period.
     */
    function isMarketClosed() external returns (bool);

    /**
     * @dev The oracle service was shutdown and never online again.
     */
    function isTerminated() external returns (bool);

    /**
     * @dev Get collateral symbol. Also known as quote.
     */
    function collateral() external view returns (string memory);

    /**
     * @dev Get underlying asset symbol. Also known as base.
     */
    function underlyingAsset() external view returns (string memory);

    /**
     * @dev Mark price. Used to evaluate the account margin balance and liquidation.
     *
     *      It does not need to be a TWAP. This name is only for backward compatibility.
     */
    function priceTWAPLong() external returns (int256 newPrice, uint256 newTimestamp);

    /**
     * @dev Index price. It is AMM reference price.
     *
     *      It does not need to be a TWAP. This name is only for backward compatibility.
     */
    function priceTWAPShort() external returns (int256 newPrice, uint256 newTimestamp);
}
