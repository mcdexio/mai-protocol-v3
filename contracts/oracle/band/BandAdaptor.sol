// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

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

contract BandAdaptor is Initializable, ContextUpgradeable, AccessControlUpgradeable, IOracle {
    address public band;
    int256 internal _markPrice;
    uint256 internal _markPriceTimestamp;
    bool internal _isTerminated;
    string public override collateral;
    string public override underlyingAsset;

    event SetTerminated();

    function initialize(
        address band_,
        string memory collateral_,
        string memory underlyingAsset_
    ) external virtual initializer {
        __Context_init_unchained();
        __AccessControl_init_unchained();
        __BandAdaptor_init_unchained(band_, collateral_, underlyingAsset_);
    }

    function __BandAdaptor_init_unchained(
        address band_,
        string memory collateral_,
        string memory underlyingAsset_
    ) internal initializer {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        band = band_;
        collateral = collateral_;
        underlyingAsset = underlyingAsset_;
    }

    function isMarketClosed() public pure override returns (bool) {
        return false;
    }

    function isTerminated() public view override returns (bool) {
        return _isTerminated;
    }

    function priceTWAPLong() public override returns (int256, uint256) {
        updatePrice();
        return (_markPrice, _markPriceTimestamp);
    }

    function priceTWAPShort() public override returns (int256, uint256) {
        return priceTWAPLong();
    }

    function setTerminated() external {
        require(!_isTerminated, "already terminated");
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "role");
        _isTerminated = true;
        emit SetTerminated();
    }

    function updatePrice() public {
        if (!_isTerminated) {
            IBand.ReferenceData memory data = IBand(band).getReferenceData(
                underlyingAsset,
                collateral
            );
            require(
                data.rate > 0 &&
                    data.rate < 2**255 &&
                    data.lastUpdatedBase > 0 &&
                    data.lastUpdatedQuote > 0,
                "invalid band oracle data"
            );
            _markPrice = int256(data.rate);
            _markPriceTimestamp = data.lastUpdatedBase > data.lastUpdatedQuote
                ? data.lastUpdatedBase
                : data.lastUpdatedQuote;
        }
    }
}
