// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "../../interface/IOracle.sol";

interface IChainlink {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundID,
            int256 price,
            uint256 startedAt,
            uint256 timeStamp,
            uint80 answeredInRound
        );

    function decimals() external view returns (uint8);
}

/**
 * @dev A very simple adaptor of Chainlink
 *
 *      isTerminated and isMarketClosed are always false.
 */
contract ChainlinkAdaptor is Initializable, ContextUpgradeable, AccessControlUpgradeable, IOracle {
    address public chainlink;
    int256 internal _reserved1;
    uint256 internal _reserved2;
    bool internal _reserved3;
    uint8 internal _chainlinkDecimals;
    string public override collateral;
    string public override underlyingAsset;

    function initialize(
        address chainlink_,
        string memory collateral_,
        string memory underlyingAsset_
    ) external virtual initializer {
        __Context_init_unchained();
        __AccessControl_init_unchained();
        __ChainlinkAdaptor_init_unchained(chainlink_, collateral_, underlyingAsset_);
    }

    function __ChainlinkAdaptor_init_unchained(
        address chainlink_,
        string memory collateral_,
        string memory underlyingAsset_
    ) internal initializer {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        chainlink = chainlink_;
        collateral = collateral_;
        underlyingAsset = underlyingAsset_;
        _chainlinkDecimals = IChainlink(chainlink).decimals();
        require(_chainlinkDecimals <= 18, "decimals exceeds 18");
    }

    function isMarketClosed() public pure override returns (bool) {
        return false;
    }

    function isTerminated() public pure override returns (bool) {
        return false;
    }

    function priceTWAPLong() public view override returns (int256, uint256) {
        (, int256 p, , uint256 t, ) = IChainlink(chainlink).latestRoundData();
        int256 scalar = int256(10**(18 - _chainlinkDecimals));
        require(
            p > 0 &&
                p <= type(int256).max / scalar &&
                t > 0,
            "invalid chainlink"
        );
        p = p * scalar;
        return (p, t);
    }

    function priceTWAPShort() public view override returns (int256, uint256) {
        return priceTWAPLong();
    }
}
