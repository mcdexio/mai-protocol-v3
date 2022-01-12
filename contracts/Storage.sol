// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;

import "@openzeppelin/contracts-upgradeable/GSN/ContextUpgradeable.sol";

import "./interface/IPoolCreatorFull.sol";
import "./module/LiquidityPoolModule.sol";
import "./module/LiquidityPoolModule2.sol";
import "./Type.sol";

contract Storage is ContextUpgradeable {
    using LiquidityPoolModule for LiquidityPoolStorage;
    using LiquidityPoolModule2 for LiquidityPoolStorage;

    LiquidityPoolStorage internal _liquidityPool;
    uint256 internal _gasPriceLimit;

    modifier onlyNotUniverseSettled() {
        require(!IPoolCreatorFull(_liquidityPool.creator).isUniverseSettled(), "universe settled");
        _;
    }

    modifier onlyExistedPerpetual(uint256 perpetualIndex) {
        require(perpetualIndex < _liquidityPool.perpetualCount, "perpetual not exist");
        _;
    }

    modifier syncState(bool ignoreTerminated) {
        uint256 currentTime = block.timestamp;
        _liquidityPool.updateFundingState(currentTime);
        _liquidityPool.updatePrice(ignoreTerminated);
        _;
        _liquidityPool.updateFundingRate();
    }

    modifier onlyAuthorized(address trader, uint256 privilege) {
        require(
            _liquidityPool.isAuthorized(trader, _msgSender(), privilege),
            "unauthorized caller"
        );
        _;
    }

    modifier limitedGasPrice() {
        require(_gasPriceLimit == 0 || tx.gasprice <= _gasPriceLimit, "gas price exceeded");
        _;
    }

    bytes32[27] private __gap;
}
