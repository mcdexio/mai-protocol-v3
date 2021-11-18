// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "../../interface/IOracle.sol";

/**
 * @dev MCDEXMultiOracle collects all prices in the same contract. PriceSetter can set the price.
 */
contract MCDEXMultiOracle is 
    Initializable,
    ContextUpgradeable,
    AccessControlUpgradeable
{
    struct Single {
        string collateral;
        string underlyingAsset;
        int256 price;
        uint256 timestamp;
        bool isMarketClosed;
        bool isTerminated;
    }

    mapping(uint256 => Single) markets;
    bool isAllTerminated;

    event SetMarket(uint256 indexed index, string collateral, string underlyingAsset);
    event SetPrice(uint256 indexed index, int256 price, uint256 timestamp);
    event SetMarketClosed(uint256 indexed index, bool isMarketClosed);
    event SetTerminated(uint256 indexed index);
    event SetAllTerminated();

    /**
     * @dev PRICE_SETTER_ROLE can update prices.
     */
    bytes32 public constant PRICE_SETTER_ROLE = keccak256("PRICE_SETTER_ROLE");

    /**
     * @dev MARKET_CLOSER_ROLE can mark the market as closed if it is not in regular
     *      trading period.
     */
    bytes32 public constant MARKET_CLOSER_ROLE = keccak256("MARKET_CLOSER_ROLE");

    /**
     * @dev TERMINATER_ROLE can shutdown the oracle service and never online again.
     */
    bytes32 public constant TERMINATER_ROLE = keccak256("TERMINATER_ROLE");

    function initialize() external virtual initializer {
        __MCDEXMultiOracle_init();
    }

    function __MCDEXMultiOracle_init() internal initializer {
        __Context_init_unchained();
        __AccessControl_init_unchained();
        __MCDEXMultiOracle_init_unchained();
    }

    function __MCDEXMultiOracle_init_unchained() internal initializer {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(PRICE_SETTER_ROLE, _msgSender());
        _setupRole(MARKET_CLOSER_ROLE, _msgSender());
        _setupRole(TERMINATER_ROLE, _msgSender());
    }

    function collateral(uint256 index) external view returns (string memory) {
        Single storage m = markets[index];
        return m.collateral;
    }

    function underlyingAsset(uint256 index) external view returns (string memory) {
        Single storage m = markets[index];
        return m.underlyingAsset;
    }

    function priceTWAPLong(uint256 index)
        external
        view
        returns (int256 newPrice, uint256 newTimestamp)
    {
        Single storage m = markets[index];
        return (m.price, m.timestamp);
    }

    function priceTWAPShort(uint256 index)
        external
        view
        returns (int256 newPrice, uint256 newTimestamp)
    {
        Single storage m = markets[index];
        return (m.price, m.timestamp);
    }

    function isMarketClosed(uint256 index) external view returns (bool) {
        Single storage m = markets[index];
        return m.isMarketClosed;
    }

    function isTerminated(uint256 index) external view returns (bool) {
        if (isAllTerminated) {
            return true;
        }
        Single storage m = markets[index];
        return m.isTerminated;
    }

    function setMarket(
        uint256 index,
        string memory collateral_,
        string memory underlyingAsset_
    ) external {
        require(!isAllTerminated, "all terminated");
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "role");
        Single storage m = markets[index];
        m.collateral = collateral_;
        m.underlyingAsset = underlyingAsset_;
        emit SetMarket(index, collateral_, underlyingAsset_);
    }

    function setPrice(
        uint256 index,
        int256 price,
        uint256 timestamp
    ) external {
        require(!isAllTerminated, "all terminated");
        require(hasRole(PRICE_SETTER_ROLE, _msgSender()), "role");
        _setPrice(index, price, timestamp);
    }

    struct Prices {
        uint256 index;
        int256 price;
    }

    function setPrices(Prices[] memory prices, uint256 timestamp) external {
        require(!isAllTerminated, "all terminated");
        require(hasRole(PRICE_SETTER_ROLE, _msgSender()), "role");
        for (uint256 i = 0; i < prices.length; i++) {
            _setPrice(prices[i].index, prices[i].price, timestamp);
        }
    }

    function setMarketClosed(uint256 index, bool isMarketClosed_) external {
        require(!isAllTerminated, "all terminated");
        require(hasRole(MARKET_CLOSER_ROLE, _msgSender()), "role");
        Single storage m = markets[index];
        m.isMarketClosed = isMarketClosed_;
        emit SetMarketClosed(index, isMarketClosed_);
    }

    function setTerminated(uint256 index) external {
        require(!isAllTerminated, "all terminated");
        require(hasRole(TERMINATER_ROLE, _msgSender()), "role");
        Single storage m = markets[index];
        require(!m.isTerminated, "terminated");
        m.isTerminated = true;
        emit SetTerminated(index);
    }

    function setAllTerminated() external {
        require(!isAllTerminated, "all terminated");
        require(hasRole(TERMINATER_ROLE, _msgSender()), "role");
        isAllTerminated = true;
        emit SetAllTerminated();
    }

    function _setPrice(
        uint256 index,
        int256 price,
        uint256 timestamp
    ) private {
        Single storage m = markets[index];
        require(!m.isTerminated, "terminated");
        require(m.timestamp <= timestamp, "past timestamp");
        if (timestamp > block.timestamp) {
            timestamp = block.timestamp;
        }
        m.price = price;
        m.timestamp = timestamp;
        emit SetPrice(index, price, timestamp);
    }
}

/**
 * @dev This is the facet of MCDEX Oracle. Each Oracle refers to one item of the MCDEXMultiOracle.
 */
contract MCDEXSingleOracle is Initializable, IOracle {
    MCDEXMultiOracle private _multiOracle;
    uint256 private _index;

    function initialize(MCDEXMultiOracle multiOracle_, uint256 index_) external initializer {
        _multiOracle = multiOracle_;
        _index = index_;
    }

    function collateral() external view override returns (string memory) {
        return _multiOracle.collateral(_index);
    }

    function underlyingAsset() external view override returns (string memory) {
        return _multiOracle.underlyingAsset(_index);
    }

    function priceTWAPLong()
        external
        override
        returns (int256 newPrice, uint256 newTimestamp)
    {
        // forward to TunableOracle
        address tunableOracle = _getTunableOracle();
        if (tunableOracle != address(0)) {
            return IOracle(tunableOracle).priceTWAPLong();
        }

        // forward to MultiOracle
        return _multiOracle.priceTWAPLong(_index);
    }

    function priceTWAPShort()
        external
        override
        returns (int256 newPrice, uint256 newTimestamp)
    {
        // forward to TunableOracle
        address tunableOracle = _getTunableOracle();
        if (tunableOracle != address(0)) {
            return IOracle(tunableOracle).priceTWAPShort();
        }

        // forward to MultiOracle
        return _multiOracle.priceTWAPShort(_index);
    }

    function isMarketClosed() external view override returns (bool) {
        return _multiOracle.isMarketClosed(_index);
    }

    function isTerminated() external view override returns (bool) {
        return _multiOracle.isTerminated(_index);
    }

    /**
     * @dev Find the new TunableOracle. This is for back-compatible. ie. to upgrade
     *      some of the old oracles use TunableOracle instead.
     * @dev [ConfirmBeforeDeployment]
     */
    function _getTunableOracle() internal view returns (address) {
        // bsc
        if (_index == 0) {
            return 0x7a6bee1474069dC81AEaf65799276b9429bED587; // ETH
        } else if (_index == 1) {
            return 0x285D90D4a30c30AFAE1c8dc3eaeb41Cc23Ed78Bf; // BTC
        } else if (_index == 2) {
            return 0x4E9712fC3e6Fc35b7b2155Bb92c11bC0BEd836f1; // BNB
        } else if (_index == 3) {
            return 0x2bc36B3f8f8E3Db2902Ac8cEF650B687deCE25f6; // SPELL
        }

        // unrecognized
        return address(0);
    }
}
