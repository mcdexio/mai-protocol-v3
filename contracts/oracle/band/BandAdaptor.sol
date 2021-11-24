// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";

import "../../interface/IOracle.sol";

interface IBand {
    /// A structure returned whenever someone requests for standard reference data.
    struct ReferenceData {
        uint256 rate; // base/quote exchange rate, multiplied by 1e18.
        uint256 lastUpdatedBase; // UNIX epoch of the last time when base price gets updated.
        uint256 lastUpdatedQuote; // UNIX epoch of the last time when quote price gets updated.
    }

    /// Returns the price data for the given base/quote pair. Revert if not available.
    function getReferenceData(string memory _base, string memory _quote)
        external
        view
        returns (ReferenceData memory);
}

contract BandAdaptor is Initializable, IOracle {
    address public band;
    string public override collateral;
    string public override underlyingAsset;

    function initialize(
        address band_,
        string memory collateral_,
        string memory underlyingAsset_
    ) external virtual initializer {
        band = band_;
        collateral = collateral_;
        underlyingAsset = underlyingAsset_;
    }

    function isMarketClosed() public pure override returns (bool) {
        return false;
    }

    function isTerminated() public pure override returns (bool) {
        return false;
    }

    function priceTWAPLong() public view override returns (int256 markPrice, uint256 timestamp) {
        IBand.ReferenceData memory data = IBand(band).getReferenceData(underlyingAsset, collateral);
        require(
            data.rate > 0 &&
                data.rate < 2**255 &&
                data.lastUpdatedBase > 0 &&
                data.lastUpdatedQuote > 0,
            "invalid band oracle data"
        );
        markPrice = int256(data.rate);
        timestamp = data.lastUpdatedBase > data.lastUpdatedQuote
            ? data.lastUpdatedBase
            : data.lastUpdatedQuote;
    }

    function priceTWAPShort() public view override returns (int256, uint256) {
        return priceTWAPLong();
    }
}
